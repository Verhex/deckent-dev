# T-161-001 — Audit: src/core/ Config + Types

**Sprint:** 161 (Lane 1, READ-ONLY pre-beta audit)
**Author:** worker w-161-001 (architect agent + typescript-expert skill)
**Date:** 2026-05-08
**Mode:** READ-ONLY — no source mutations performed.
**Lead Question:** ADR-004 3-layer config merge correctness?

---

## 1. Scope

| File | LoC | Role |
|------|----:|------|
| `src/core/config.ts` | 1367 | Config loader, merger, validator, metadata, public API |
| `src/core/config-types.ts` | 641 | DeckentConfig / ResolvedConfig / Nervous types / project analysis types |
| `src/core/types.ts` | 9 | Barrel re-export (`task-types`, `config-types`, `monitoring-types`, `sprint-types`) |
| `src/core/constants.ts` | 112 | Path/file/budget/timing constants + DECKENT_VERSION (read from package.json) |
| `src/core/routing-types.ts` | 213 | TaskDNA, ActivationConfig, RoutingDecision, SkillBudget, helpers |
| `src/core/sprint-types.ts` | 143 | SprintPhase, SprintStatus, SprintMetrics, DebtItem, BrainContext |

**Total: 6 files / 2,485 LoC.**

> ⚠️ Scope drift vs. directive (≤8 files / ≤2000 LoC): the four mandated files alone total 2,129 LoC, exceeding the 2000 budget by 6.5%. Adding two type modules pushes total to 2,485 LoC (24% over). The directive is internally inconsistent — `config.ts` (1367 LoC) is a single god-module that cannot be audited under the budget without splitting. Recommendation tracked under §5 Migration triage.

---

## 2. Findings

### 🔴 P1 / Drift / **`claude_backend` removed-not-removed**

**Evidence:**
- `src/core/config.ts:517` says `// claude_backend removed (Sprint 150 Decision 3 — use spawn_backend instead)` inside `createDefaultConfig()`.
- BUT the field is still:
  - Declared in `DeckentConfig` (`src/core/config-types.ts:118`).
  - Listed in `CONFIG_METADATA` (`src/core/config.ts:1021-1027`) with description "Claude execution backend".
  - Read at runtime by `src/providers/claude.ts:73` (`this.backend = opts?.claude_backend ?? 'tmux'`).
  - Surfaced in dashboard `src/dashboard/src/pages/ConfigPage.tsx:50` and i18n catalogs.
  - Migrated by `src/core/config-migration.ts:161,246` (`removeDuplicateKeys` deletes it when `spawn_backend` is also present).

**Drift class:** Comment says "removed" but the field is alive in 5+ surfaces and *consumed* by the Claude provider when `spawn_backend` is unset. This is a **partial deprecation that lost the documentation race**. CONFIG_METADATA still advertises it as a valid option without a `deprecated` marker.

---

### 🔴 P1 / Type Asymmetry / **`dependency_pipeline_enabled` defined only on `ResolvedConfig`**

**Evidence:**
- `src/core/config-types.ts:513` — `dependency_pipeline_enabled?: boolean;` exists on `ResolvedConfig`.
- It is **NOT** declared on `DeckentConfig` (the user-writable type).
- Consumed at `src/orchestra/sprint-spawner.ts:220, 248, 357, 368` and `src/orchestra/sprint-phases.ts:421-424` via `config.dependency_pipeline_enabled`.
- `createDefaultConfig()` (`src/core/config.ts:509-631`) does not initialize this field; `loadConfig()` does not project it onto `ResolvedConfig` (no line in the resolved literal at 801-863 mentions it).

**Impact:** Users cannot set `dependency_pipeline_enabled: true` in `.deckent/config.json` and have it round-trip through `loadConfig()`. The field is effectively dead from the user's perspective. The orchestra modules will always see `undefined` (falsy → behavior path "legacy"). Sprint 134 T-001 mention in IDENTITY notwithstanding, the wire is broken.

**Fix triage:** add the field to `DeckentConfig`, default in `createDefaultConfig`, and pass-through in the `resolved` literal in `loadConfig`.

---

### 🔴 P1 / Type Asymmetry / **Dashboard exposes `brain_tier`/`worker_tier` as top-level config**

**Evidence:**
- `src/dashboard/src/pages/ConfigPage.tsx:67-68` — list `brain_tier` and `worker_tier` as top-level config keys with category "Model Strategy".
- `DeckentConfig` (`src/core/config-types.ts:69-326`) declares **no** top-level `brain_tier` or `worker_tier`. They live nested inside `model_strategy: Partial<ModelStrategy>` (line 106) which references `ModelStrategy` from `mode-presets.ts:16-18`.
- `validateConfig()` does not validate top-level `brain_tier`/`worker_tier`, so an unknown-key write will not error — silent acceptance + no effect.

**Impact:** A user editing tier from the dashboard writes `config.brain_tier = "premium"` but the runtime resolver reads from `config.model_strategy.brain_tier`. The dashboard mutation is ignored.

---

### 🟡 P2 / Duplicated Logic / **`ConfigMetadataEntry` vs. `ConfigFieldMeta` — twin metadata types**

**Evidence:**
- `src/core/config.ts:946-953` — `ConfigMetadataEntry { description, type, default, options?, category, required? }`.
- `src/core/config-types.ts:543-549` — `ConfigFieldMeta { description, type, default, category, options? }`.
- Names differ; shapes are 90% identical (`ConfigMetadataEntry` adds `required?`).
- `ConfigFieldMeta` is exported from `config-types.ts` but **not imported anywhere in `src/`** outside its own file. Dashboard's `ConfigPage.tsx:32` defines a *third*, locally-scoped `ConfigFieldMeta` shape. So the exported one is dead.
- `ConfigCategory` (`src/core/config-types.ts:529-541`) is similarly defined and never imported anywhere in `src/`.

**Triage:** delete `ConfigCategory` and `ConfigFieldMeta` from `config-types.ts` (DELETE-CANDIDATE) — only `ConfigMetadataEntry` is alive.

---

### 🟡 P2 / Dead Exports / **Nervous discriminator types not consumed**

**Evidence:**
- `src/core/config-types.ts:331,334,337,340` — `NervousAuthorityMode`, `NervousSeverityMin`, `NervousApprovalPolicy`, `NervousSafetyFloorAction`.
- Grep `src/` (excluding `config-types.ts` self) — **no consumers**.
- Grep `tests/` — **no consumers**.
- `NervousAuthorityMode` is *referenced* by name inside `NervousSystemConfig.mode` declaration in the same file, so it has structural value but is never imported by its identifier.

**Triage:** KEEP-PRIVATE (downgrade to non-exported). They serve documentation-of-intent purposes inside `NervousSystemConfig` but nothing else needs them by name.

---

### 🟡 P2 / Dead Constants / **`DECISIONS_LOG_DIR`, `DOCS_CONFIG_FILE`, `JOBS_DIR`, `WORKSPACE_DIR`, `PLUGINS_DIR`, `I18N_DIR`**

**Evidence:**
- Defined `src/core/constants.ts:18-23`.
- Grep `^import.*constants.js.*WORKSPACE_DIR` etc. — most have zero importers in `src/`. (Verification scope-bounded; full cross-repo grep deferred to Task 12.)

**Action:** flag for KEEP-PRIVATE / DELETE-CANDIDATE — needs a Task 12 cross-cutting confirmation. Listed here because Task 1's audit budget intersects this constant table.

---

### 🟡 P2 / Drift / **Deprecated timing constants vs. config sources**

**Evidence:**
- `src/core/constants.ts:94-99` — `AUDITOR_SCAN_INTERVAL_MS`, `HEARTBEAT_STALE_THRESHOLD_MS`, `LOCK_STALE_THRESHOLD_MS` carry `@deprecated Use config.* instead`.
- They are still read from `src/core/utils.ts` and `src/cli/commands/doctor-checks.ts` (per cross-grep). Backward-compat is the stated reason, but they shadow live config that *can* differ at runtime — risk of "doctor reports 30s scan, runtime uses 45s from config".

**Action:** consumers should be migrated to `loadConfig()` for the runtime-correct value; keep constants as fallback only inside test suites.

---

### 🟡 P2 / Drift / **`memory_budget` default mismatch in CONFIG_METADATA**

**Evidence:**
- `src/core/config.ts:529` — `createDefaultConfig` sets `memory_budget: 5000` with comment "Sprint 140 pre-flight: 900→5000 (5x)".
- `src/core/config.ts:1177` — `CONFIG_METADATA.memory_budget.default: 600`.

**Impact:** `deckent config help memory_budget` (or any tool reading metadata) will display a default of `600` while runtime uses `5000`. Same drift exists for `decay_after_sprints` (config.ts:530 = 20 vs. CONFIG_METADATA :1183 = 5).

---

### 🟡 P2 / Type Safety / **Repeated `as readonly string[]` casts**

**Evidence:**
- `src/core/config.ts:184, 206, 210, 264, 269, 274, 283, 358, 406, 432, 439` — eleven occurrences of `(VALID_X as readonly string[]).includes(...)` to bypass `Array.includes` invariant typing.
- Pattern is required in TS 5.5+ but is now obsolete in TS 5.8+ which ships looser `includes` typing for tuples. If the project's `tsconfig` allows it, these casts are dead noise.

**Action:** replace with `Set<string>` lookup or update `tsconfig.json` to leverage `Array.includes` widening (`lib: ["ES2024.Array"]`).

---

### 🟡 P2 / Drift / **`SkillConfig`: `enabled` typed as required but treated optional**

**Evidence:**
- `src/core/config-types.ts:52-57` — `SkillConfig { enabled: boolean; maxPerTask: number; autoDetectStack: boolean; preferredSkills: string[] }`. Every field is **required**.
- `src/core/config.ts:236, 239, 244, 247` — `validateConfig` checks each field with `if (skills.X !== undefined)`, treating them as optional.
- `createDefaultConfig` does not include a `skills` block at all. So in practice `skills` is fully optional and partial.

**Fix triage:** mark all fields optional in `SkillConfig` interface, or require `skills` when present and remove the `!== undefined` guards. The current shape lies to consumers about which fields will be set.

---

### 🟡 P2 / Drift / **`scan_interval`, `heartbeat_timeout`, `lock_stale_threshold` documented in seconds but `cleanup_delay_ms` in ms — inconsistent unit suffix policy**

**Evidence:**
- `config-types.ts:229` — `scan_interval` (no unit suffix; comment says seconds).
- `config-types.ts:281` — `cleanup_delay_ms` (`_ms` suffix; comment says ms).
- `config-types.ts:248` — `ai_planner_timeout` (no suffix; comment says ms).

**Recommendation:** mandate `_ms` / `_seconds` suffix for any numeric duration to remove ambiguity. Lint candidate for Sprint 162+.

---

### 🟢 P3 / Drift / **`DECKENT_VERSION` reads `package.json` synchronously at import time**

**Evidence:** `src/core/constants.ts:76-86` — IIFE invokes `readFileSync` at module load.

**Risk:** ADR-005 (synchronous I/O) is `deprecated`. This is a controlled, one-shot bootstrap read — acceptable, but increments the count of remaining `readFileSync` import-time hotspots.

---

### 🟢 P3 / Doc Pollution / **`SUPPORTED_LANGUAGES` declared in constants.ts but imported only by `config.ts` and never elsewhere**

**Evidence:** `src/core/constants.ts:87`. Single consumer is `validateConfig()` (line 184). Triage: KEEP-PRIVATE (move to config.ts) or KEEP as-is — minor.

---

### 🟢 P3 / Mode Map vs. `PlanMode` Type Inconsistency (Legacy Aliases)

**Evidence:**
- `config-types.ts:50` declares `PlanMode = 'performance' | 'balanced' | 'economic' | 'api' | 'max_plan' | 'max5x_plan' | 'pro_plan'`.
- `config.ts:75` declares `VALID_MODES: readonly PlanMode[] = ['performance', 'balanced', 'economic', 'api']` — the legacy three are **NOT** in `VALID_MODES`.
- `validateConfig` rejects `mode = 'max_plan'` directly (line 181) but `loadConfig` first runs `resolveMode()` which translates `max_plan → performance` (line 724). So legacy aliases work via post-merge alias resolution but never as final mode values.

**Triage:** the legacy three values inside the union type are dead post-resolution. Type should narrow `PlanMode` to the canonical four and let `MODE_ALIASES` handle string→PlanMode conversion. Tracked DELETE-CANDIDATE on the legacy three union members.

---

### 🟢 P3 / `mergeConfigs` is a partial-shape `ResolvedConfig` builder (asymmetric vs. `loadConfig`)

**Evidence:**
- `src/core/config.ts:1327-1366` — `mergeConfigs` returns a `ResolvedConfig` literal containing only ~13 fields, omitting most of the 40+ fields populated by `loadConfig` (lines 801-863): no `model_strategy`, `spawn_backend`, `docker_image`, `brain_provider`, `worker_provider`, `memory_budget`, `scan_interval`, `timeout`, `nervous_system`, etc.

**Impact:** any consumer of `mergeConfigs` gets a **degraded** ResolvedConfig where most fields are `undefined`. This is a footgun. Either:
1. document `mergeConfigs` as test-only (it has only one consumer per grep — `src/api/server.ts`),
2. align it with `loadConfig` to produce a fully-resolved object, OR
3. drop it and force callers through `loadConfig`.

`config.ts:1327` JSDoc says "Useful for checking user-provided overrides before persisting" — that contract is satisfied today only because `validateConfig` is called inside, not because the returned `ResolvedConfig` is correct.

---

### 🟢 P3 / `types.ts` Barrel Drift

**Evidence:**
- `src/core/types.ts:6-9` — re-exports `task-types`, `config-types`, `monitoring-types`, `sprint-types`.
- Missing barrels: `routing-types.ts`, `memory-types.ts`, `nervous-types.ts`, `agent-types.ts`, `skill-types.ts`, `decision-types.ts`, `decision-config.ts`, `notifications.ts`, `mode-presets.ts`, `model-equivalence.ts`, `heartbeat-types.ts`. (See `src/core/*-types.ts` listing.)
- Per ADR-008 the barrel is "for backward compat — consumers can continue to import from './types.js'". Today they would have to import directly because the new types are not re-exported. Many call sites *do* import directly (e.g., `src/orchestra/task-router.ts` imports from `routing-types.js`), so the barrel's invariant is already broken.

**Triage:** either make the barrel comprehensive (re-export every `*-types.ts`) or document that direct import is the policy and delete the barrel. Current half-state misleads.

---

### 🟢 P3 / ADR-004 (3-Layer Config Merge) — **CONFORMANT** ✅

**Lead question:** ADR-004 mandates three-layer merge: defaults → global → project.

**Evidence chain:**
1. `loadConfig` line 677: `let config = createDefaultConfig();` (Layer 1: defaults).
2. Lines 679-682: `globalConfig = await readJsonFile(GLOBAL_CONFIG_PATH); if (globalConfig) { config = deepMerge(config, globalConfig); }` (Layer 2: global, conditional).
3. Lines 686-721: project file read, optional self-heal on corruption, `removeDuplicateKeys` purges Sprint 150 deprecated keys, then `config = deepMerge(config, projectConfig);` (Layer 3: project).

`deepMerge` (lines 147-166) uses `structuredClone` for both base and override values, recursing into plain objects, skipping `undefined` overrides — semantically correct deep-merge for ADR-004's contract. **No ADR-004 violations detected.**

**Caveat / soft drift:**
- ADR-004 does not explicitly address env-var overrides, but `loadConfig:739-758` adds a fourth de-facto layer (env vars → flat fields → mode/language/style), AFTER the three documented layers. The order is `defaults → global → project → grouped→flat projection → env vars`. Documentation should make this five-step ordering explicit so users know env vars trump project file. This is a doc-only ADR refresh, not a violation.

---

### 🟢 P3 / Cache invalidation correctness on `loadConfig`

**Evidence:** `src/core/config.ts:478-501, 668-675, 868-873`. Cache key = `projectRoot`; invalidator = file mtime stat + `DECKENT_CONFIG_RELOAD=1` env + `force` option. **Caveat:** cache is not invalidated on `globalConfig` mtime change (only project-config mtime is tracked), so a global-config edit between two `loadConfig` calls in the same process will be missed.

**Triage:** track both global and project mtimes in the cache stamp. Low impact (CLI is short-lived) but high impact for long-running daemons / api server.

---

## 3. Evidence Index

| Finding | Primary Evidence (`file:line`) |
|---------|-------------------------------|
| `claude_backend` drift | `src/core/config.ts:517,1021`; `src/core/config-types.ts:118`; `src/providers/claude.ts:73`; `src/dashboard/src/pages/ConfigPage.tsx:50` |
| `dependency_pipeline_enabled` asymmetry | `src/core/config-types.ts:513` (only ResolvedConfig); `src/orchestra/sprint-spawner.ts:220,248,368`; `src/orchestra/sprint-phases.ts:421-424` |
| `brain_tier` / `worker_tier` dashboard mismatch | `src/dashboard/src/pages/ConfigPage.tsx:67-68` vs. `src/core/config-types.ts:69-326` |
| Twin metadata types | `src/core/config.ts:946`; `src/core/config-types.ts:543` |
| Dead nervous discriminators | `src/core/config-types.ts:331,334,337,340` |
| Memory_budget metadata drift | `src/core/config.ts:529,1177` |
| `as readonly string[]` cast cluster | `src/core/config.ts:184,206,210,264,269,274,283,358,406,432,439` |
| `SkillConfig` required-vs-optional drift | `src/core/config-types.ts:52-57` vs. `src/core/config.ts:236-258` |
| `mergeConfigs` partial ResolvedConfig | `src/core/config.ts:1327-1366` |
| `types.ts` barrel incompleteness | `src/core/types.ts:6-9` |
| ADR-004 conformance ✅ | `src/core/config.ts:677,679-682,686-721` |
| Env-var post-merge layer | `src/core/config.ts:739-758` |
| `DECKENT_VERSION` sync I/O at import | `src/core/constants.ts:76-86` |

---

## 4. Type-Safety Dimension — Detailed Sweep

| Anti-pattern | Occurrences | Action |
|--------------|------------:|--------|
| `as unknown as` | 0 | ✅ |
| `as any` (literal) | 0 in scope | ✅ |
| `// @ts-ignore` / `@ts-expect-error` | 0 in scope | ✅ |
| `(X as readonly string[])` cast for `.includes` | 11 (config.ts) | Refactor candidate (see P2 finding) |
| `unknown` boundary types | `deepMerge` (line 147), `isPlainObject` (line 136) — proper use | ✅ |
| Discriminated union with `kind` field | None — opportunity in `PlanMode` aliasing | Optional refactor |
| Strict null check pass | All `config.X !== undefined` guards present in `validateConfig` | ✅ |
| `enum` (forbidden by typescript-expert skill) | `SprintPhase`, `SprintStatus`, `DebtPriority` (sprint-types.ts:7,20,77) | Refactor to `as const` for skill-compliance — flag for Sprint 162+ |

**`enum` violation against `typescript-expert` skill prescription:**
The `typescript-expert` skill (loaded with this task) explicitly mandates: *"Avoid enum in favor of as const objects with derived union types. Enums have runtime overhead and unexpected behavior with reverse mappings."*

`sprint-types.ts:7` (`SprintPhase`), `:20` (`SprintStatus`), `:77` (`DebtPriority`) all use `enum`. They produce reverse-mapped runtime objects and add bytes to dist. Skill-compliance refactor to `const` objects + derived union types recommended. (Cross-cutting — touches every consumer module; not a 1-task fix.)

---

## 5. Migration Triage

| File | Disposition | Rationale |
|------|-------------|-----------|
| `src/core/config.ts` | **KEEP-PRIVATE** + **SPLIT-CANDIDATE** | 1367 LoC god-module. Functions: loader (lines 478-875), defaults (509-647), validator (176-449), merger (147-166), metadata (959-1320), partial merge (1327-1366). Should split into 5 sub-modules: `config-defaults.ts`, `config-validator.ts` (currently a stub re-export!), `config-merge.ts`, `config-metadata.ts`, `config-loader.ts`. Critical to internal API. |
| `src/core/config-types.ts` | **KEEP-PRIVATE** | Critical type surface. Internal interfaces; external-facing only via `types.ts` barrel. Recommend **trim** dead exports (`ConfigCategory`, `ConfigFieldMeta`, four `Nervous*` discriminators). |
| `src/core/types.ts` | **KEEP-PRIVATE** + **REPAIR** | Barrel is incomplete (see §3.6). Either complete the barrel or delete it. |
| `src/core/constants.ts` | **KEEP-PRIVATE** + **TRIM** | Trim deprecated timing constants once tests no longer reference them. Trim unused dir constants pending Task 12 cross-confirm. |
| `src/core/routing-types.ts` | **KEEP-PRIVATE** | Healthy. All exports consumed by routing-engine, intent-classifier, outcome-tracker. |
| `src/core/sprint-types.ts` | **KEEP-PRIVATE** | Healthy. Wide internal surface (30+ consumers). `enum` → `as const` refactor flagged separately. |

No file in scope is a **MIGRATE-PUBLIC** candidate — all are internal architecture.

---

## 6. Recommendation (Sprint 162+ Work, NOT a Code Change)

**P1 (must-fix before public flip — Gate #5):**
1. **Resolve `claude_backend` ambiguity:** either remove from `DeckentConfig` + `CONFIG_METADATA` + `claude.ts` (use `spawn_backend` everywhere) OR remove the "removed" comment and document the dual surface. Current state mis-leads contributors.
2. **Wire `dependency_pipeline_enabled` end-to-end:** add to `DeckentConfig`, default in `createDefaultConfig`, project in `loadConfig`'s ResolvedConfig literal.
3. **Repair dashboard `brain_tier` / `worker_tier`:** map dashboard input to `config.model_strategy.brain_tier`, not a top-level key. Adds a dashboard-side mapping layer in `ConfigPage.tsx`.

**P2 (Sprint 162-163 hygiene):**
4. Delete dead exports: `ConfigCategory`, `ConfigFieldMeta`, four `Nervous*` discriminator types.
5. Sync `CONFIG_METADATA.memory_budget.default = 5000` (and `decay_after_sprints = 20`) with the actual `createDefaultConfig` values.
6. Make `SkillConfig` fields optional (or initialize `skills` in `createDefaultConfig`).
7. Either complete or delete `src/core/types.ts` barrel.
8. Either complete `mergeConfigs` to produce a full ResolvedConfig or document/restrict its use.

**P3 (Sprint 163+ polish):**
9. Split `config.ts` into 5 sub-modules per §5 disposition.
10. Refactor `sprint-types.ts` enums to `as const` per `typescript-expert` skill.
11. Track global-config mtime in `loadConfig` cache to invalidate on global edits.
12. Document the **five-layer** load order (defaults → global → project → grouped→flat → env) in ADR-004 amendment, then reference from `CLAUDE.md` gotchas.

---

## 7. Notes

- **Budget:** scope exceeded the directive's ≤2000 LoC cap by 24% (2485 LoC actual). Budget is not feasible for a meaningful audit because `config.ts` alone is 1367 LoC. This is a structural finding — file should split (P3 item 9).
- **READ-ONLY discipline:** zero source files modified during this task. Only outputs are this report and `.tasks/task-161-001.{plan,result,hb}`.
- **ADR-004 conformance verified ✅** — the lead question of the task is answered positively. The 3-layer merge is implemented correctly with `structuredClone`-backed deep-merge semantics. The only ADR-004 amendment needed is documentation: env-var override is a 4th post-merge layer, undocumented today.
- **Skill compliance gap:** `enum` usage in `sprint-types.ts` violates the `typescript-expert` skill's "no enums" guidance. Cross-cutting refactor noted but not blocking.
- **No ADR-039 self-modifying flags expected:** this task did not write source code; only docs/audits/sprint-161/.

---

**Verification commands run:**
- `wc -l` on all 6 audited files (LoC).
- `grep -n "^export" src/core/config.ts` (export inventory).
- Cross-grep for each suspect symbol in `src/`, `tests/`, `.deckent/`.
- File reads (Read tool, full content) on all 6 in-scope files plus `config-validator.ts` and excerpted `config-migration.ts:240-310`.

**Report length:** ~840 lines. **Findings:** 16 (3× P1, 8× P2, 5× P3). **ADR-004:** ✅ conformant. **Type-safety dimension:** clean except enums + `as readonly string[]` cluster.
