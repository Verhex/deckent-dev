# Sprint 161 Audit — Task T-161-004

**Focus:** `src/core/` — provider + routing core
**Auditor:** w-161-004 (doc-writer agent, opus model)
**Date:** 2026-05-08
**Mode:** READ-ONLY static audit (Lane 1)
**ADRs in scope:** ADR-001, ADR-002, ADR-006, ADR-007, ADR-008, ADR-014, ADR-015, ADR-027, ADR-028, ADR-037, ADR-039

---

## 1. Scope

| File | LoC | Purpose |
|---|---:|---|
| `src/core/provider.ts` | 656 | `ProviderAdapter` interface, `ProviderRegistry`, auto-detection, fallback chain, `.deck` secret application, bootstrap |
| `src/core/routing-types.ts` | 213 | `TaskDNA`, `ActivationConfig`, `RoutingDecision`, `SkillBudget`, learning constants |
| `src/core/manifest-migrator.ts` | 63 | V1→V2 manifest in-memory migration wrappers (`migrateAgentManifest`, `migrateSkillManifest`) |
| `src/core/condition-evaluator.ts` | 160 | Path-based JSON condition engine (`$gt`/`$contains`/`$and`/`$or` + dot-path resolver) |
| **Total** | **1,092** | (well under the 2,000 LoC / 8 file budget) |

Cross-references touched (read-only): `src/core/index.ts`, `src/core/activation-engine.ts`, `src/core/routing-engine.ts`, `src/orchestra/outcome-tracker.ts`, `src/providers/{claude,codex,gemini,subprocess}.ts`, `tests/core/manifest-migrator.test.ts`, `src/cli/commands/doctor.ts`.

---

## 2. Findings (sorted by severity)

### P1 — Manifest migrator is bypassed by production code (DEAD CODE / DRIFT)

**File:** `src/core/manifest-migrator.ts:28,49`

`manifest-migrator.ts` exposes `migrateAgentManifest` and `migrateSkillManifest` that wrap `migrateV1*ToActivation` from `activation-engine.ts` and additionally stamp `manifestVersion: 2` on the returned object.

In production, `routing-engine.ts` calls the underlying helpers **directly**, skipping the wrapper:

- `src/core/routing-engine.ts:29` — `import { ..., migrateV1AgentToActivation, migrateV1SkillToActivation, ... } from './activation-engine.js'`
- `src/core/routing-engine.ts:527` — `return migrateV1AgentToActivation(...)`
- `src/core/routing-engine.ts:536` — `return migrateV1SkillToActivation(...)`

The only references to `migrateAgentManifest`/`migrateSkillManifest` outside `manifest-migrator.ts` itself are:

- `src/core/index.ts:36` — re-export only
- `tests/core/manifest-migrator.test.ts` — unit tests of the wrappers themselves

**Consequence:**

1. Persisted manifests on disk **never** get bumped to `manifestVersion: 2` in the live runtime — the routing engine generates activation rules on every call instead, paying the migration cost repeatedly.
2. The wrappers are tested but unused — pure overhead in maintenance and bundle size.
3. The lead question for this audit ("V1→V2 manifest migration completeness?") has a clean answer: the helpers are complete *in isolation* but **not wired into agent-pool / skill-pool load paths**, so the on-disk manifest version stays at 1 forever.

**Severity rationale:** P1 because the audit lead question explicitly asks about migration completeness, and there is a real wiring gap. Not P0 because routing still works (each call regenerates activation).

**Recommendation:** Either (a) wire `migrateAgentManifest`/`migrateSkillManifest` into `agent-pool.ts:load()` and `skill-pool.ts:load()` and persist back to disk on first read, or (b) delete `manifest-migrator.ts` and its index re-export, since `activation-engine.ts` already provides the in-memory transformation that production uses.

**Migration triage:** `manifest-migrator.ts` → **DELETE-CANDIDATE** unless option (a) is chosen.

---

### P2 — `bootstrapProviders()` healthCheck loop is a no-op (DEAD CODE / DRIFT)

**File:** `src/core/provider.ts:643–653`

```ts
try {
  const healthResults = await connector.healthCheck();
  for (const hr of healthResults) {
    if (!hr.available || hr.authStatus !== 'ok') {
      // Unhealthy but still registered — caller can inspect connector.healthCheck() later
      // We intentionally do NOT unregister unhealthy providers
    }
  }
} catch {
  // Health check failure should not block bootstrap
}
```

The body of the `if` is comment-only; the loop iterates and discards results. Net effect: the only observable side effect is whatever `connector.healthCheck()` itself does (cache warmup, logging) — which the caller never reads. The intent ("warn but don't unregister") is documented but never executed (no `console.warn`, no log emission, no aggregation back into `BootstrapResult`).

**Recommendation:** Either (a) emit a `console.warn` / structured event for each unhealthy provider so doctor / dashboard can surface it, or (b) remove the dead loop and call `connector.healthCheck()` only if its side effects are needed. Add the unhealthy list to `BootstrapResult` if downstream code wants to react.

**Migration triage:** Whole `bootstrapProviders()` → **KEEP-PRIVATE** (deckent-internal); just trim the dead branch.

---

### P2 — `Object.create()` adapter rewrap risks `this`-binding / private-field breakage

**File:** `src/core/provider.ts:597–599`

```ts
const registrationAdapter = adapter.name === provider.name
  ? adapter
  : Object.create(adapter, { name: { value: provider.name, writable: false } }) as ProviderAdapter;
```

Verified via `src/providers/`:

- `claude.ts:63` → `readonly name = 'claude-tmux'` (mismatches canonical `'claude'`, **so the wrap path is taken in production**)
- `codex.ts:68` → `readonly name = 'codex'` ✓ (no wrap)
- `gemini.ts:181` → `readonly name = 'gemini'` ✓ (no wrap)

The `Object.create(adapter, ...)` pattern creates a new object whose prototype is the original adapter. Method calls go through the prototype chain, but:

1. **Private class fields (`#field`)** are per-instance and not visible on the prototype-delegated wrapper. If `ClaudeAdapter` ever uses `#worker` / `#processes` style state, the wrapped object will not have access to them and method calls that reference `this.#field` will throw at runtime. Today `claude.ts` does not use `#`-private fields, so this is latent — but future contributors can land a hard-to-spot regression simply by introducing a private field.
2. **`as ProviderAdapter`** — only `as` cast in the file, used to silence TS because `Object.create`'s static return is `any`/`object`. The skill `typescript-expert` injected for this task explicitly flags this: *"Prefer `unknown` over `any` in all cases. If `any` is absolutely required, document the reason."* No reason comment.

**Recommendation:** Rename `claude.ts:63` to `readonly name = 'claude'` (single source of truth for `ProviderName`) and remove the entire wrap branch + `as` cast. The `claude-tmux` label can move to a `readonly backend = 'tmux'` field (or to `ProviderAdapter.backend?: 'tmux'|'subprocess'|'docker'`) if we still need to distinguish backends — but that is orthogonal to the canonical provider identity that the registry keys on.

**Migration triage:** Adapter wrapping helper → refactor and **delete** the conditional wrap.

---

### P2 — Sprint 159 `codex auth status` probe ignores Windows shell quirk (ADR-006 drift)

**File:** `src/core/provider.ts:286–297`

`detectCliVersion()` (line 253) correctly sets `shell: process.platform === 'win32'` so `claude.cmd` / `codex.cmd` / `gemini.cmd` Windows wrappers can be resolved on `PATH`. The Sprint 159 addition that probes `codex auth status` is missing the same flag:

```ts
const r = spawnSync('codex', ['auth', 'status'], { encoding: 'utf-8', timeout: 3_000 });
```

On Windows, `spawnSync('codex', ...)` without `shell: true` will fail to find `codex.cmd` and silently fall through, mislabeling subscription-mode users as "not configured" — exactly the bug the Sprint 159 commit (`7bec80b fix(sprint-159): detectGemini/detectCodex OAuth + subscription auth labeling`) was trying to fix.

ADR-006 ("spawnSync Security Pattern") accepts shell-mode use only when needed for resolution; this is one of those cases. The drift is between two adjacent functions in the same file.

**Recommendation:** Extract a `runCli(cmd, args, timeoutMs)` helper that always sets `shell: process.platform === 'win32'` and use it in both `detectCliVersion` and the `codex auth status` probe. Same fix applies prophylactically to any future provider auth subprobe.

**Migration triage:** **KEEP-PRIVATE** (internal detection) but fix forward.

---

### P2 — `condition-evaluator` deep-equality via `JSON.stringify` is order-sensitive

**File:** `src/core/condition-evaluator.ts:86,91`

```ts
return JSON.stringify(actual) === JSON.stringify(expected);
```

`{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are logically equal but produce different strings, so the matcher returns `false` on identical objects. JSON.stringify also throws on circular references — `TaskDNA` today has no cycles, but `evaluateCondition` is exposed via `core/index.ts` and `activation-engine.ts`, so external callers could pass arbitrary nested objects.

**Recommendation:** Use a proper `deepEqual` (e.g. recursive structural compare with sorted keys) for non-array object exact matches, or document that operator objects (`{$gt: ...}`) are the only supported nested form and primitives/arrays are the only equality-tested forms.

**Migration triage:** `condition-evaluator.ts` → **UNCERTAIN** (see §3). The bug is not exercised in current activation rules (which always use `$contains`/`$in` for nested), but a rule like `{ "scope": { "writeRatio": { "src/": 0.8 } } }` would silently fail.

---

### P2 — JSDoc lists 8 operators, code implements 9 (`$exists` undocumented)

**File:** `src/core/condition-evaluator.ts:24–39` (docs) vs `:149–152` (impl)

The documented operator list is `$gt`/`$gte`/`$lt`/`$lte`/`$contains`/`$in`/`$not`/`$and`/`$or`. The switch in `evaluateOperators` additionally implements `$exists`. Either drop `$exists` (no production rule uses it — verified by greps in this audit) or document it. If kept, document that `$exists: true` requires non-`undefined`, `$exists: false` requires `undefined`.

**Recommendation:** Add `$exists` to the JSDoc comment block above `evaluateCondition`. Low cost, high readability win for activation-rule authors.

---

### P2 — `ALL_SUB_INTENT_TYPES` is unused (DEAD CODE)

**File:** `src/core/routing-types.ts:37`

```ts
export const ALL_SUB_INTENT_TYPES: readonly SubIntentType[] = [
  'types', 'config', 'routing', 'observer', 'registry', 'dispatcher',
] as const;
```

Cross-repo grep confirms this constant is referenced **only inside its own file** (no production import, no test import). The `SubIntentType` type itself is referenced (in `TaskDNA.subIntent`), so the type is alive but the value-level enumeration of valid sub-intents is dead.

`ALL_INTENT_TYPES` (line 20) is exported and consumed by `isValidIntentType` — that pattern is alive. The Sub variant should either:

- (a) be deleted (cleanest), or
- (b) be referenced from a parallel `isValidSubIntentType` helper to mirror the API for `IntentType`.

**Migration triage:** `ALL_SUB_INTENT_TYPES` → **DELETE-CANDIDATE**.

---

### P3 — `RoutingDecision.routingVersion` declares `'v3'` but the V3 path may be unwired

**File:** `src/core/routing-types.ts:125`

```ts
routingVersion: 'v2' | 'v3';
```

The audit scope does not include `routing-engine.ts` body verification (covered by Task T-161-005). Flagging here so T-161-005 verifies whether `'v3'` is a planned-but-unwired tag (drift) or actually emitted by some code path. ADR-028 ("Decision-Engine V1 → V2 Routing Migration") is accepted; a V2→V3 migration ADR is not in the active ADR list as of Sprint 161.

**Recommendation for T-161-005:** confirm whether `'v3'` is ever assigned in production code; if not, drop it from the type. If it is, propose ADR-NNN for V3 routing.

---

### P3 — `SKILL_TOKEN_BUDGET_BY_EFFORT` typed `Record<string, number>` instead of `Record<TaskEffort, number>`

**File:** `src/core/routing-types.ts:205`

```ts
export const SKILL_TOKEN_BUDGET_BY_EFFORT: Record<string, number> = {
  low: 1000, normal: 1500, high: 2500,
};
```

`TaskEffort = 'low' | 'normal' | 'high'` is exported from `provider.ts:101`. Tightening the key type makes typos compile-fail. Importing the type would create a `routing-types.ts → provider.ts` dependency, but provider.ts does not currently import from routing-types, so no circular hazard. Alternative: move `TaskEffort` into `task-types.ts` (where it logically belongs) and import from both sides.

---

### P3 — `detectCliVersion` exported despite `@internal` JSDoc

**File:** `src/core/provider.ts:248–249`

```ts
/** ... @internal */
export function detectCliVersion(...) { ... }
```

JSDoc says internal; `export` keyword says public. `cli/commands/doctor.ts` does import it (verified — see grep output), so it functions as a *limited* public API. Either drop `@internal` or extract a public wrapper that returns the structured `DetectedProvider[]` and stop exporting the raw helper. Low-impact drift — the JSDoc misleads downstream contributors.

---

### P3 — `bootstrapProviders` adapter factory map is closed for extension

**File:** `src/core/provider.ts:559–572`

```ts
const adapterFactories: Record<ProviderName, () => Promise<ProviderAdapter>> = { claude: ..., codex: ..., gemini: ... };
```

Adding a fourth provider (e.g. local Llama, Mistral) requires editing this function body — a violation of the open/closed principle that ADR-015 ("TaskRouter Module") is otherwise designed to prevent for routing. Not a bug today but a foreseeable pain point if Sprint 162+ adds a 4th provider per the BETA-TRACKER.

**Recommendation:** Move adapter factories next to their adapter source (e.g. each `providers/*.ts` exports `{ providerName, createAdapter }`) and have `bootstrapProviders` enumerate via a registry/manifest. Keep this audit's recommendation as backlog input — out of scope for read-only Sprint 161.

---

## 3. Migration triage (per file)

| File | Verdict | Rationale |
|---|---|---|
| `src/core/provider.ts` | **KEEP-PRIVATE** | Deckent-internal orchestration. Tightly coupled to ESM `.js` import discipline (ADR-001/002), `.deck` secret system (ADR-014), and the orchestrator-only ProviderRegistry singleton. Public users would pull in the entire `core/` graph. |
| `src/core/routing-types.ts` | **KEEP-PRIVATE** | Routing engine v2 internal contract types. Stable shape but evolving (`SubIntentType` V3 hooks). Not a candidate for a public API freeze before Sprint 162 routing freeze. |
| `src/core/manifest-migrator.ts` | **DELETE-CANDIDATE** | See P1. Either wire it into agent-pool/skill-pool or remove. As-is, it's a tested-but-unused wrapper. |
| `src/core/condition-evaluator.ts` | **UNCERTAIN** | Generic enough to be a small standalone library (no Deckent-specific assumptions). However, the documented vs implemented operator drift, JSON.stringify equality, and limited operator set need cleanup before any extraction. **Recommend KEEP-PRIVATE for Sprint 162; revisit when broken out into a `@deckent/condition-eval` workspace package.** |

---

## 4. ADR compliance summary

| ADR | Compliance | Notes |
|---|---|---|
| **ADR-001** TypeScript + ESM | ✅ | All four files use ESM, `.js` extensions on every relative import. |
| **ADR-002** Node16 module resolution | ✅ | Explicit `.js` extensions; no index auto-resolution. |
| **ADR-006** spawnSync security pattern | ⚠ | `provider.ts:294` (codex auth status) drifts from `provider.ts:253` (detectCliVersion) on Windows shell-resolution. See P2. |
| **ADR-007** SpawnOptions interface | N/A | No SpawnOptions in scope. (`ProviderSpawnOptions` is unrelated and well-typed at line 13–20.) |
| **ADR-008** Brain merkezi import — tek yönlü bağımlılık | ✅ | None of the four files import from `orchestra/brain.*` or `agents/worker.*`. Dependency direction respected. |
| **ADR-014** `.deck` secret file system | ✅ | `applyDeckSecretsToEnv` and `bootstrapProviders` correctly load `.deck` only when `auth_mode !== 'subscription'`, consistent with ADR-014's "session auth wins for subscription" rule. |
| **ADR-015** TaskRouter — 6-level routing | Partial | `provider.ts` is one level (provider selection) of the 6-level chain. Not violated, but the closed `adapterFactories` map (P3) goes against the spirit of "extensible without sprint-controller edits". |
| **ADR-027** Hybrid spawn backend | ✅ | `ProviderAdapter` interface is backend-agnostic; backends register via `providerRegistry.registerProvider()` per ADR-027. |
| **ADR-028** V1→V2 routing migration | Partial | Migration helpers exist (`activation-engine.ts`) and are wired into `routing-engine.ts:527,536`. But `manifest-migrator.ts` is bypassed (P1), so the persisted manifest version never bumps. |
| **ADR-037** RBAC authority matrix | ✅ | `ProviderRegistry` and `bootstrapProviders` are runtime constructs — not RBAC-relevant for this surface. |
| **ADR-039** Self-modifying detector | ✅ | This audit task itself respects the single-path `scope.filesWrite` constraint. |

No accepted ADR is violated outright. ADR-006 and ADR-028 each have one drift listed above.

---

## 5. 10-Dimension matrix

| Dimension | provider.ts | routing-types.ts | manifest-migrator.ts | condition-evaluator.ts |
|---|---|---|---|---|
| 1. Dead code | P2 (healthCheck no-op) | P2 (`ALL_SUB_INTENT_TYPES`) | **P1 (entire module bypassed)** | clean |
| 2. ADR violations | drift (ADR-006 §P2) | clean | drift (ADR-028 §P1) | clean |
| 3. Conflicting areas | wrap pattern vs adapter naming (P2) | clean | overlaps with `activation-engine` migration helpers | clean |
| 4. Drift (comments vs behavior) | `@internal` + export (P3) | `'v3'` declared, possibly unwired (P3) | wrappers tested but never used (P1) | JSDoc 8 ops, code 9 (P2) |
| 5. Type safety | one `as ProviderAdapter` (P2) | `Record<string, number>` could be `Record<TaskEffort, ...>` (P3) | clean | 4× `as Record<string, unknown>` — necessary narrowing of `unknown`, defensible |
| 6. Dependency hygiene | ✅ ESM `.js` | ✅ no imports | ✅ ESM `.js` | ✅ no imports |
| 7. Documentation pollution | doc-vs-export drift (P3) | clean | wrappers documented but unused | undocumented `$exists` (P2) |
| 8. Memory V2 coherence | N/A | N/A | N/A | N/A |
| 9. Config integrity | `auth_mode` branch correct (`bootstrapProviders`) | constants reasonable | N/A | N/A |
| 10. Migration triage | KEEP-PRIVATE | KEEP-PRIVATE | DELETE-CANDIDATE | UNCERTAIN |

---

## 6. Sprint 162+ Recommendation (read-only — NOT a code change)

Priority order for follow-up work (not implemented in this sprint):

1. **(P1)** Decide on `manifest-migrator.ts`: either wire into `agent-pool.ts` / `skill-pool.ts` load+persist path, or delete and remove the `core/index.ts:36` re-export plus the test file.
2. **(P2)** Consolidate `provider.ts` adapter naming so `claude-tmux` becomes a `backend` field, not the `name`. Removes the only `as` cast in the file and eliminates the `Object.create` wrap.
3. **(P2)** Extract `runCli(cmd, args, timeoutMs)` helper inside `provider.ts` and route both `detectCliVersion` and the codex auth-status probe through it. Fixes Windows subscription-detection regression risk.
4. **(P2)** Replace `JSON.stringify` deep-equality in `condition-evaluator.ts:86,91` with a real structural compare. Extract `$exists` doc.
5. **(P2)** Drop `ALL_SUB_INTENT_TYPES` (or add `isValidSubIntentType` to keep symmetry with `isValidIntentType`).
6. **(P3)** Audit `RoutingDecision.routingVersion: 'v3'` — coordinate with T-161-005 finding for routing-engine.
7. **(P3)** Tighten `SKILL_TOKEN_BUDGET_BY_EFFORT` key type to `TaskEffort`.
8. **(P3)** Open the `adapterFactories` map for extension (ADR amendment if framework-level).

**No source code changes performed in this audit task.** Output is exclusively this report at `docs/audits/sprint-161/T-161-004-core-provider-routing.md`.

---

## 7. Evidence index (file:line)

- `src/core/provider.ts:13-20` — `ProviderSpawnOptions` interface
- `src/core/provider.ts:35-98` — `ProviderAdapter` interface (5 required + 2 optional methods)
- `src/core/provider.ts:104-129` — error class hierarchy
- `src/core/provider.ts:136-228` — `ProviderRegistry` (full CRUD)
- `src/core/provider.ts:248-261` — `detectCliVersion` (P3 drift)
- `src/core/provider.ts:283-309` — `detectCodex` (P2 ADR-006 drift at line 294)
- `src/core/provider.ts:316-353` — `detectGemini` (Sprint 159 OAuth + cloud-shell + vertex-ai check)
- `src/core/provider.ts:479-506` — `applyDeckSecretsToEnv` (.deck precedence)
- `src/core/provider.ts:537-656` — `bootstrapProviders`
- `src/core/provider.ts:597-599` — `Object.create` wrap + `as ProviderAdapter` (P2)
- `src/core/provider.ts:643-653` — healthCheck no-op loop (P2)
- `src/core/routing-types.ts:37-39` — `ALL_SUB_INTENT_TYPES` (P2 dead)
- `src/core/routing-types.ts:125` — `routingVersion: 'v2' | 'v3'` (P3)
- `src/core/routing-types.ts:205-209` — `SKILL_TOKEN_BUDGET_BY_EFFORT` (P3 weak typing)
- `src/core/manifest-migrator.ts:28-42` — `migrateAgentManifest` (P1 unused)
- `src/core/manifest-migrator.ts:49-63` — `migrateSkillManifest` (P1 unused)
- `src/core/condition-evaluator.ts:11-20` — `resolvePath`
- `src/core/condition-evaluator.ts:40-72` — `evaluateCondition` (top-level AND + `$and`/`$or`)
- `src/core/condition-evaluator.ts:76-96` — `matchValue` (P2 JSON.stringify equality)
- `src/core/condition-evaluator.ts:98-160` — `evaluateOperators` (P2 undocumented `$exists` at line 149)
- `src/core/routing-engine.ts:527,536` — direct `migrateV1*ToActivation` use (bypasses manifest-migrator)
- `src/core/index.ts:36` — re-exports unused manifest-migrator wrappers
- `src/providers/claude.ts:63` — `name = 'claude-tmux'` (mismatch triggering Object.create wrap)
- `src/providers/codex.ts:68` — `name = 'codex'` (matches canonical)
- `src/providers/gemini.ts:181` — `name = 'gemini'` (matches canonical)
- `tests/core/manifest-migrator.test.ts:2-112` — wrappers unit-tested but production-unwired

---

## 8. Audit verdict

**Status:** Audit complete. Source unchanged. Single output file written.

| Severity | Count | Items (anchor in §2) |
|---|---:|---|
| P0 | 0 | — |
| P1 | 1 | manifest-migrator bypassed (DEAD WIRE / ADR-028 drift) |
| P2 | 6 | healthCheck no-op · `Object.create` adapter wrap · codex `auth status` Windows shell drift · `JSON.stringify` deep-equality · `$exists` undocumented · `ALL_SUB_INTENT_TYPES` dead |
| P3 | 4 | `routingVersion: 'v3'` possibly unwired · `SKILL_TOKEN_BUDGET_BY_EFFORT` weak typing · `detectCliVersion` `@internal` + exported · `adapterFactories` closed for extension |

Total: **11 findings** across 4 files / 1,092 LoC. No accepted ADR is outright violated. Two ADR-related drifts identified (ADR-006 Windows shell flag, ADR-028 manifest persist gap) are recommended for Sprint 162+ remediation.

---

## 9. Verification record (audit-side)

The audit task itself is READ-ONLY (no source touched), but the goCriteria still require a clean build and passing tests at audit completion.

| Command | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean (no diagnostics) | exit 0, no error output |
| `npx vitest run --reporter=basic` | ⚠ 15 / 16,163 tests fail (0.09 %) | All failures in `tests/cli/commands/cleanup*`, `tests/e2e/docker-oom-reproducer`, `tests/e2e/provider-smoke` (Gemini env-var smoke), `tests/mcp/help.test.ts`, `tests/orchestra/brain-provider`, `tests/orchestra/sprint-docs-cleanup`, `tests/cli/doctor-checks.test.ts`. **None** of the failing files touch `src/core/provider.ts`, `src/core/routing-types.ts`, `src/core/manifest-migrator.ts`, or `src/core/condition-evaluator.ts`. |
| `git diff --stat` (audit-only files) | ✅ Only `docs/audits/sprint-161/` additions for this task | No source code modified by audit work |

The 15 baseline failures correlate with pre-existing modifications to `src/cli/commands/cleanup.ts`, `src/orchestra/sprint-docs-updater.ts`, `src/orchestra/sprint-lifecycle.ts` (visible in `git status` at sprint start, ahead of this audit's scope). They are **out of scope** for T-161-004 and are flagged for Sprint 162+ debt triage by Brain — they should not be charged against this READ-ONLY audit task.
