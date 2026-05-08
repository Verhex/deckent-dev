# T-161-003 — src/core/ Agent Pool + Skill Pool + Skill Registry Audit

**Sprint:** sprint-161 (Lane 1 — God-Level READ-ONLY Self-Audit)
**Task:** 003 of 56
**Auditor agent:** doc-writer
**Skills:** typescript-expert
**Date:** 2026-05-08
**Mandate:** READ-ONLY. No source code changes.

---

## 1. Scope

| File | LoC | Symbols audited |
|------|----:|------------------|
| `src/core/agent-pool.ts` | 491 | `AgentPoolManager` class (16 methods), `isTempAgentStale()` helper, `DEFAULT_MAX_TEMP_AGENTS`, `DEFAULT_MAX_AGENT_AGE`, internal `sprintNumber()` |
| `src/core/skill-pool.ts` | 306 | `SkillPoolManager` class (10 methods), private validation constants `VALID_CATEGORIES`, `VALID_POSITIONS`, `VALID_MODELS` |
| `src/core/skill-registry.ts` | 134 | `SkillRegistry` class (7 methods), private `RegistryData` interface |
| **Total in scope** | **931** | |

**Adjacent type files referenced (read for context, not in scope):**
- `src/core/agent-types.ts` — defines `AgentDefinition`, `AgentStats`, `AgentPool`
- `src/core/skill-types.ts` — defines `SkillDefinition`, `SkillStats`, `SkillCategory`, `StackDetectionRule`, `PromptInjectionConfig`
- `src/core/types.ts` — `ALL_MODELS`, `ModelType`
- `src/core/utils.ts` — `readJsonSafe<T>()`

**Lead questions per task spec:**
1. Verify "15 built-in agents + 21 skills" claim
2. Validate LRU eviction logic (max 50 temp, 5 sprint age)
3. Validate AST sandbox claim

**Out-of-scope by Sprint 161 task split:**
- AST sandbox (`src/core/marketplace/skill-sandbox.ts`) → covered by Task 9 (T-161-009)
- Routing/activation engine consumers (`activation-engine.ts`, `routing-engine.ts`) → Task 5
- `agent-types.ts` / `skill-types.ts` shared types → Task 1 (`types.ts` umbrella)

---

## 2. Lead-Question Verification (Claim Audit)

### 2.1 — Built-in agent count: CLAUDE.md says "15 built-in"

**Verdict:** ✅ **ACCURATE** (reconfirmed via on-disk inspection).

Filesystem evidence (`.deckent/agents/*/agent.json` `source` field):

| `source: "builtin"` (15) | `source: "user"` (1) | `source: "learned"` (2) |
|--------------------------|----------------------|--------------------------|
| accessibility-auditor    | react-ts-specialist  | temp-react-specialist    |
| api-builder              |                      | temp-react-ts-specialist |
| architect                |                      |                          |
| architecture-planner     |                      |                          |
| bug-fixer                |                      |                          |
| ci-guardian              |                      |                          |
| code-reviewer            |                      |                          |
| data-engineer            |                      |                          |
| devops-engineer          |                      |                          |
| doc-writer               |                      |                          |
| frontend-designer        |                      |                          |
| migration-specialist     |                      |                          |
| performance-analyzer     |                      |                          |
| refactorer               |                      |                          |
| security-auditor         |                      |                          |

**Total agent.json files:** 18 (15 + 1 + 2). `archive/` subdir contains 3 retired agents (excluded by `agent-pool.ts:126` `if (entry.name === 'archive') continue;`).

`.deckent/workspace/IDENTITY.md` says **"15 built-in + 3 custom"** — this is also accurate (`1 user + 2 learned = 3`).

CLAUDE.md (line ~110, this file's snapshot) has a comment noting "test-writer removed" (Sprint 148 reform). The list of 15 in the table above matches the CLAUDE.md enumeration exactly.

### 2.2 — Built-in skill count: CLAUDE.md says "21 skills"

**Verdict:** ✅ **ACCURATE.**

Filesystem evidence (`.deckent/skills/`):

```
accessibility-expert  anthropic-sdk           api-builder
ci-testing            code-simplifier         database-migration
devops-engineer       docker-expert           documentation-writer
frontend-design       git-expert              graphql-expert
migration-expert      monorepo-expert         performance-optimizer
python-expert         react-specialist        security-specialist
system-architect      testing-expert          typescript-expert
```

**Count: 21.** Matches CLAUDE.md, IDENTITY.md, and DECKENT.md.

### 2.3 — LRU eviction (max 50 temp, 5 sprint age)

**Verdict:** ⚠️ **PARTIALLY ACCURATE — claim is correct as constants but the runtime effect is incomplete.**

**Claim source (CLAUDE.md):** *"Agent pool: .deckent/agents/*/agent.json — LRU eviction (max 50 temp, 5 sprint age)"*

**Code evidence:**
- `agent-pool.ts:15` — `export const DEFAULT_MAX_TEMP_AGENTS = 50;` ✓
- `agent-pool.ts:18` — `export const DEFAULT_MAX_AGENT_AGE = 5;` ✓
- `agent-pool.ts:39-49` — `isTempAgentStale()` correctly returns `true` when `currentNum - lastNum > maxAge` ✓
- `agent-pool.ts:90-104` — `loadAgents()` enforces 50-cap by **slicing the in-memory pool**, not by deleting on disk ⚠️
- `agent-pool.ts:294-354` — `cleanup(maxAge, currentSprintId)` does delete from disk **but only operates on `.tasks/agents/`** (TEMP_AGENTS_DIR), not on `.deckent/agents/temp-*` ⚠️

**Behavioral gap:**
- `saveTempAgentToPool()` (line 214) writes to `.deckent/agents/temp-{id}/` (PERSISTENT dir).
- `loadAgents()` LRU path operates on `.tasks/agents/` only (line 85 — TEMP_AGENTS_DIR).
- Result: temp agents created via `saveTempAgentToPool` (the path actually used in production — see §3.A) are **never** subject to LRU eviction. They accumulate in `.deckent/agents/temp-*` indefinitely until an explicit `cleanupPersistentTempAgents()` call.
- `cleanupPersistentTempAgents()` itself has zero production callers (see §3.A.2).

This was already documented in `docs/audits/sprint-152/T-152-021-agents-routing.md:180`. Sprint 161 reconfirms it is unfixed.

### 2.4 — AST sandbox (skill validation)

**Verdict:** ⚠️ **OUT OF SCOPE for this task — but the wire-up claim should be verified by T-161-009.**

`SkillPoolManager.validateSkillDefinition` (lines 187-305) performs **schema-shape validation only** (string/number/array/category/position constraints). It does **not** call any AST scanner.

The actual AST sandbox lives in `src/core/marketplace/skill-sandbox.ts` (390 LoC, exports `scanCodeAST`, `SUSPICIOUS_PATTERNS`, `DANGEROUS_MODULES`, `DANGEROUS_CALLS`). It uses the TypeScript compiler API (`ts.createSourceFile`).

**Drift to flag:** The CLAUDE.md text *"Skill registry: .deckent/skills/*/skill.json — AST sandbox validation"* suggests `SkillPoolManager.loadSkills` runs AST validation. It does not — only schema validation. Whether the marketplace skill-sandbox is invoked elsewhere (e.g., on install, by CLI command) is delegated to T-161-009. **This audit cannot confirm AST validation occurs at any documented integration point in agent-pool/skill-pool/skill-registry.**

Additionally:
- File is named `manifest.json` in `skill-pool.ts:11` (`const MANIFEST_FILENAME = 'manifest.json';`) — **NOT `skill.json`** as DECKENT.md claims. (See finding F2 below.)

---

## 3. Findings (10 dimensions × 3 files)

Severity scale: P0 = data loss / security / wire failure · P1 = correctness defect or behavior contradicts docs · P2 = maintainability / drift · P3 = nit.

### Findings table

| # | Severity | Dimension | File:line | Title |
|---|---------|-----------|-----------|-------|
| F1 | P1 | Dead code | skill-registry.ts:1-134 | `SkillRegistry` class has zero production callers |
| F2 | P2 | Drift (docs vs behavior) | DECKENT.md / skill-pool.ts:11 | Manifest filename is `manifest.json`, docs say `skill.json` |
| F3 | P1 | Dead code | agent-pool.ts:229-247, 253-282 | 3 temp-agent lifecycle methods unused in production |
| F4 | P2 | Drift / Conflicting areas | agent-pool.ts:90-104 vs cleanup() | LRU evicts in-memory only, never deletes from disk |
| F5 | P2 | Conflicting areas | agent-pool.ts:80-104 (persistent vs temp dirs) | `saveTempAgentToPool` bypasses LRU by writing to persistent dir |
| F6 | P2 | Documentation pollution | CLAUDE.md / agent-pool.ts | "AST sandbox validation" implies SkillPool runs AST — only schema check exists |
| F7 | P3 | Type safety | agent-pool.ts:421, 428, skill-pool.ts:212, 219, 273 | `as typeof X[number]` casts inside `includes()` are redundant; pre-cast hides type narrowing |
| F8 | P3 | Type safety | agent-pool.ts:132, 339; skill-pool.ts:53 | `raw as unknown as AgentDefinition` double-cast after schema validation — could be a type guard |
| F9 | P3 | Dead code | skill-pool.ts:99-117, 138-143, 83-86 | `enableSkill`, `disableSkill`, `removeSkill`, `listByCategory` have no production callers |
| F10 | P3 | Dead code | agent-pool.ts:159-164 | `removeAgent()` has no production callers (only tests) |
| F11 | P2 | Dependency hygiene | agent-pool.ts:53, skill-pool.ts:17 | `import { ALL_MODELS }` placed mid-file rather than at top — ESM hoists it but readers may miss it |
| F12 | P2 | Memory V2 coherence | agent-pool.ts:294, skill-pool.ts | `lastUsedInSprint` is parsed from filesystem string, not pulled from `memory.db` — agent/skill stats are NOT in DB |
| F13 | P3 | Drift | agent-pool.ts:286-292 (JSDoc) | JSDoc says "Builtin agents in `.deckent/agents/` are NEVER removed" but `cleanup()` only inspects `.tasks/agents/`; the comment is misleading because it's true for an irrelevant reason |
| F14 | P3 | Type safety | skill-registry.ts:13-16 | `RegistryData` is `interface` private — could be `type` since it's a structural shape never extended/merged (typescript-expert skill prefers `interface` only for public API contracts) |
| F15 | P3 | Maintainability | agent-pool.ts:57-66 | `projectRoot` declaration order: assigned in constructor (line 62) before declaration (line 66). Compiles, but reads as out of order |
| F16 | P3 | Validation gap | agent-pool.ts:396-490 | Validator does not check `manifestVersion ∈ {1,2}` from `AgentDefinition` interface; v2 `activation` field also unvalidated |
| F17 | P3 | Validation gap | skill-pool.ts:187-305 | Same as F16: `manifestVersion` and `activation` not validated |
| F18 | P3 | Conflicting areas | skill-pool.ts:48 vs agent-pool.ts:115-128 | Skill-pool checks `existsSync(manifestPath)` per entry; agent-pool's comment explicitly says "no per-entry existsSync" — inconsistent style for the same I/O pattern |
| F19 | P2 | Drift | skill-pool.ts vs DECKENT.md | DECKENT.md claims **"AST sandbox validation"** for skills. SkillPool has none — see F6 |
| F20 | P3 | Type safety | skill-pool.ts:212, 219, 273 | Cast pattern `(VALID_X as readonly string[]).includes(...)` is a workaround. Could use `Array.prototype.includes` with widened input. Repeated 3× |

---

### F1 (P1) — `SkillRegistry` is dead code in src/

**Dimension:** dead code (unused exports).

**Evidence:**
- `src/core/skill-registry.ts:1-134` exports `SkillRegistry` class.
- `grep -r SkillRegistry src/` returns one match: the file itself. No other src/ file imports it.
- Test files (`tests/core/skill-registry.test.ts`, `tests/core/readjson-migration.test.ts`) reference it, but tests are out of scope for Sprint 161 and would themselves be removable if the class is removed.

**Why this matters:** This is a 134-line public API class that duplicates `SkillPoolManager.loadSkills`/`saveSkill`/`removeSkill` functionality, plus adds a JSON-backed registry file (`skill-registry.json`) that is never produced or consumed by production code. It increases the API surface area with no gain.

**Recommendation (Sprint 162+):** DELETE-CANDIDATE. Confirm `skill-registry.json` is not produced by any external tool (CLI/MCP/dashboard); if not, remove `src/core/skill-registry.ts` and its tests. Update `.deckent/sprint-god-analysis/src/core/skill-registry.md` and any historical refs.

### F2 (P2) — Manifest filename drift: `manifest.json` vs `skill.json`

**Dimension:** drift (docs vs behavior).

**Evidence:**
- `skill-pool.ts:11` — `const MANIFEST_FILENAME = 'manifest.json';`
- DECKENT.md (line ~57): *"Skill registry: .deckent/skills/*/skill.json — AST sandbox validation"* and DIRECTIVES.md Task 51 says *".deckent/skills/*/manifest.json"* — DECKENT.md and DIRECTIVES disagree.
- On-disk: `find .deckent/skills -name 'manifest.json' | wc -l` → 21 (matches code). No `skill.json` files exist.

**Recommendation (Sprint 162):** Update DECKENT.md to read `manifest.json`, not `skill.json`. Add to MIGRATE-PUBLIC list.

### F3 (P1) — 3 temp-agent lifecycle methods are dead code

**Dimension:** dead code (unused public API).

**Evidence:**

| Method | Definition | Production callers | Test callers |
|--------|-----------|---------------------|---------------|
| `cleanupPersistentTempAgents()` | agent-pool.ts:229-247 | **0** in `src/` | 2 (mock-only in `sprint-controller.test.ts`, `spawn-prevention.test.ts`) |
| `createTempAgent(sprintId, agent)` | agent-pool.ts:253-262 | **0** in `src/` | 1 (`tests/core/agent-pool.test.ts:243`) |
| `cleanupTempAgents(sprintId)` | agent-pool.ts:267-282 | **0** in `src/` | 3 |

The verification command:
```bash
grep -nE '\.cleanupPersistentTempAgents\(|\.createTempAgent\(|\.cleanupTempAgents\(' src/**/*.ts
# Returns only the definitions in agent-pool.ts itself.
```

**Why this matters:**
- `createTempAgent` writes to `.tasks/agents/{sprintId}-{id}/` — this is the **only** write path that feeds the LRU code in `loadAgents()` (line 85-104). Since it's never called, the LRU branch is structurally unreachable from any production sprint.
- `cleanupPersistentTempAgents` is the only on-disk removal path for `temp-*` dirs in `.deckent/agents/`. With no caller, those dirs accumulate forever (e.g. `temp-react-specialist`, `temp-react-ts-specialist` are still on disk).

**Recommendation (Sprint 162+):** Either wire `createTempAgent` into the temp-skill/agent generation pipeline (`src/orchestra/temp-skill-generator.ts` and any agent-equivalent) **OR** delete all three methods + the LRU branch in `loadAgents()`. Don't leave the half-implementation. UNCERTAIN until Brain confirms intent — was the design `.tasks/agents/` ephemeral path abandoned in favor of `saveTempAgentToPool`?

### F4 (P2) — LRU evicts in-memory pool only, never deletes from disk

**Dimension:** drift / conflicting areas.

**Evidence:** `agent-pool.ts:90-104`:

```typescript
if (tempPool.size > this.maxTempAgents) {
  const sorted = Array.from(tempPool.values()).sort(...);
  const kept = sorted.slice(0, this.maxTempAgents);
  for (const agent of kept) pool.set(agent.id, agent);  // returned to caller
}
// No fs.rmSync — disk not touched.
```

vs. `cleanup()` (line 294-354) which **does** delete from disk via `fs.rmSync` (line 348).

**Why this matters:** Two methods named after the same concept (LRU/age) have asymmetric effects. CLAUDE.md says "LRU eviction (max 50 temp, 5 sprint age)" — readers reasonably expect either to enforce both. In fact:
- `loadAgents()` enforces the 50-cap at read time, but only on the in-memory `pool`.
- `cleanup()` enforces the 5-sprint age at call time, deleting from disk.
- **Neither method enforces both at once.**

**Recommendation:** Document the split clearly (read-time exclusion vs. call-time deletion) or merge into one path. KEEP-PRIVATE for now; the file is an internal abstraction.

### F5 (P2) — `saveTempAgentToPool` bypasses LRU dir

**Dimension:** conflicting areas / behavior contradicts model.

**Evidence:**
- `saveTempAgentToPool` (line 214-223) writes to `path.join(projectRoot, AGENTS_DIR, dirName)` = `.deckent/agents/temp-{id}/` (PERSISTENT directory).
- `loadAgents()` LRU branch operates on `tempDir = path.join(projectRoot, TEMP_AGENTS_DIR)` = `.tasks/agents/` only.
- Result: agents created via the only used save path skip LRU entirely. They are loaded by `_loadFromDir(persistentDir, pool)` (line 82) without any cap.

**Production caller:** `src/orchestra/sprint-planner.ts:408 → agentPool.saveTempAgentToPool(tempAgent)`.

**Recommendation (Sprint 162+):** Decide whether temp agents are persistent (current behavior) or LRU-bounded. If persistent, remove the `.tasks/agents/` LRU code path. If LRU-bounded, route `saveTempAgentToPool` through `createTempAgent` and add explicit eviction.

### F6 (P2) — "AST sandbox validation" claim does not apply to SkillPoolManager

**Dimension:** documentation pollution.

**Evidence:**
- DECKENT.md (line ~57): *"Skill registry: .deckent/skills/*/skill.json — AST sandbox validation"* — implies SkillPool/Registry triggers AST scanning.
- `SkillPoolManager.loadSkills` (lines 32-60) calls `SkillPoolManager.validateSkillDefinition` (lines 187-305) — only schema/shape validation.
- `SkillRegistry.register` (lines 30-39) — no validation at all.
- Actual AST sandbox: `src/core/marketplace/skill-sandbox.ts` (390 LoC) — not invoked by either module audited here.

**Recommendation:** Update DECKENT.md to clarify: AST sandbox is invoked at **install time** (or wherever marketplace integration happens), not at load time. KEEP-PRIVATE if marketplace path is not yet wired, MIGRATE-PUBLIC once it is.

### F7 (P3) — Redundant cast inside `includes()` calls

**Dimension:** type safety.

**Evidence:**
- `agent-pool.ts:421`: `if (!VALID_MODELS.includes(obj['preferredModel'] as typeof VALID_MODELS[number])) {`
- `agent-pool.ts:428`: `if (!VALID_SOURCES.includes(obj['source'] as typeof VALID_SOURCES[number])) {`
- `skill-pool.ts:212, 219, 273`: similar `(VALID_X as readonly string[]).includes(obj[field] as string)`

**Why this matters:** Two different patterns are used for the same problem (TS narrowing for `includes`). The `as typeof X[number]` form **defeats the runtime guard** — the cast asserts the value is the union, then immediately checks if it's in the union. On strict TS this only compiles because of the cast. A type-safe alternative is:

```typescript
function isValidModel(v: unknown): v is typeof VALID_MODELS[number] {
  return typeof v === 'string' && (VALID_MODELS as readonly string[]).includes(v);
}
```

**Recommendation:** Standardize on a `isOneOf<T>(values: readonly T[], v: unknown): v is T` helper in `utils.ts`. KEEP-PRIVATE.

### F8 (P3) — `raw as unknown as Definition` double-cast after validation

**Dimension:** type safety.

**Evidence:**
- `agent-pool.ts:132`: `const agent = raw as unknown as AgentDefinition;`
- `agent-pool.ts:339`: same pattern in `cleanup()`.
- `skill-pool.ts:53`: `const skill = raw as unknown as SkillDefinition;`

**Why this matters:** The double-cast is a workaround for `validateAgentDefinition` returning `{ valid, errors }` instead of a type predicate. A `validateAgentDefinition(raw): raw is AgentDefinition` signature would eliminate the cast and provide narrowing for free.

**Recommendation:** Convert `validateAgentDefinition` / `validateSkillDefinition` to type-guard signatures in a future refactor. The current shape returns `errors` for caller introspection — a hybrid signature `{ valid: true } | { valid: false; errors: string[] }` could keep both. KEEP-PRIVATE.

### F9 / F10 (P3) — Additional unused public methods

**Dimension:** dead code (smaller scope than F1/F3).

| Method | Location | Production callers in src/ |
|--------|----------|----------------------------|
| `SkillPoolManager.enableSkill` | skill-pool.ts:99-105 | 0 |
| `SkillPoolManager.disableSkill` | skill-pool.ts:110-116 | 0 |
| `SkillPoolManager.removeSkill` | skill-pool.ts:138-143 | 0 |
| `SkillPoolManager.listByCategory` | skill-pool.ts:83-86 | 0 |
| `AgentPoolManager.removeAgent` | agent-pool.ts:159-164 | 0 (`agent-genealogy.ts:52` defines a different method on a different class) |

**Recommendation:** UNCERTAIN — these are plausible CLI/MCP candidates (e.g., `deckent skill enable foo`). T-161-026 (CLI introspection) and T-161-027 (CLI config + lists) should cross-check whether `agent-list`/`skill-list` commands eventually grow `enable`/`disable` subcommands. If not within ~3 sprints, DELETE-CANDIDATE.

### F11 (P2) — `import { ALL_MODELS }` placed mid-file

**Dimension:** dependency hygiene.

**Evidence:**
- `agent-pool.ts:53` — `import { ALL_MODELS } from './types.js';` (after class body has started — but ESM hoists imports, so this works).
- `skill-pool.ts:17` — same pattern, between `VALID_POSITIONS` const and `VALID_MODELS` derived const.

**Why this matters:** ESM hoisting makes the placement valid, but it surprises readers expecting top-of-file imports. typescript-expert skill recommends consistent ordering.

**Recommendation:** Move both imports to the top import block. KEEP-PRIVATE / nit cleanup. No behavior change.

### F12 (P2) — Stats live on filesystem, not in `memory.db`

**Dimension:** Memory V2 coherence.

**Evidence:**
- `agent-pool.ts:361-388` — `updateAgentStats` reads + writes via `getAgent` / `saveAgent`, which round-trip to `agent.json` files on disk.
- `skill-pool.ts:150-179` — same pattern for skills.
- DECKENT.md (Memory V2 section): *"DB-First Architecture, .md files are generated exports"*. Yet agent/skill stats are not in `memory.db` at all — they live in JSON files outside the export pipeline.

**Why this matters:** The "single source of truth" principle is violated for one class of state (agent + skill performance). Stats cannot be queried with `searchMemory(...)` and are excluded from `memory export` snapshots.

**Recommendation (Sprint 162+):** Either (a) document that agent/skill stats are an explicit exception to DB-first, or (b) plan a migration of stats into a `stats` table within memory.db. UNCERTAIN — design decision pending. KEEP-PRIVATE structure for now.

### F13 (P3) — Misleading JSDoc on `cleanup()`

**Dimension:** drift (comments vs behavior).

**Evidence:** `agent-pool.ts:286-292`:

> "Builtin agents (source === 'builtin') in .deckent/agents/ are NEVER removed."

But `cleanup()` only iterates `.tasks/agents/` (line 295). Builtin agents in `.deckent/agents/` are never reached at all — the comment is technically true, but for the wrong reason. A reader might infer that `cleanup()` checks `.deckent/agents/` and skips builtins — it does not.

**Recommendation:** Reword to: "Operates on `.tasks/agents/` (TEMP_AGENTS_DIR) only. Persistent agents in `.deckent/agents/` are never seen by this method." KEEP-PRIVATE.

### F14-F18, F20 (P3 nits)

See findings table for one-line summaries. None are individually actionable but together suggest a small consistency pass over both files would pay off (≤1 hour).

### F19 (P2) — Skill AST sandbox claim

Same evidence as F6, surfaced separately to ensure DECKENT.md update is tracked alongside CLAUDE.md update.

---

## 4. Migration Triage

| File | Triage | Reason |
|------|--------|--------|
| `src/core/agent-pool.ts` | **KEEP-PRIVATE** | Internal pool manager. Dead-code methods (F3, F10) should be addressed in next sprint, but the live path (`saveTempAgentToPool` + `loadAgents` + `updateAgentStats`) is critical infrastructure. |
| `src/core/skill-pool.ts` | **KEEP-PRIVATE** | Same pattern as agent-pool. F2 doc fix and F9 dead-code prune recommended. |
| `src/core/skill-registry.ts` | **DELETE-CANDIDATE** | F1: zero production callers. Verify no external (CLI/MCP) consumer first. If `skill-registry.json` ever appears in user installs, demote to KEEP-PRIVATE pending design. |

---

## 5. ADR Compliance Check

| ADR | Status | Compliance | Notes |
|-----|--------|------------|-------|
| ADR-001 (TS+ESM) | accepted | ✅ | All `.js` extensions correct; `node:fs` / `node:path` imports |
| ADR-002 (Node16 resolution) | accepted | ✅ | `'./agent-types.js'`, `'./skill-types.js'`, `'./utils.js'` etc. |
| ADR-005 (Synchronous I/O) | deprecated | ✅ (uses sync) | `fs.existsSync`, `readdirSync`, `writeFileSync`, `rmSync`. Deprecation status of ADR-005 means future migration to async is allowed; current sync usage is not a violation. |
| ADR-008 (Brain merkezi import) | accepted | ✅ | `agent-pool.ts` imports only from `./agent-types.js`, `./types.js`, `./utils.js` — pure core. No dep on orchestra/agents. |
| ADR-038 (Dead code disposition) | accepted | ⚠️ | F1, F3, F9, F10 are unaddressed dead code. ADR-038 itself is the framework for handling these — Sprint 162 should run the disposition. |
| ADR-041 (horizontal vs vertical taxonomy) | accepted | N/A | Audit doesn't touch the taxonomy; classification of the 15 builtin agents lives in the agent.json files themselves (out of scope here, see T-161-050). |

No active-ADR violations detected in the audited code.

---

## 6. Recommendations for Sprint 162+

Ranked roughly by ROI / safety:

1. **Doc fix (F2):** Update DECKENT.md to reference `manifest.json` (not `skill.json`). 1-line change.
2. **Doc fix (F6, F19):** Update DECKENT.md & CLAUDE.md "AST sandbox validation" claim to scope it to the marketplace install path, not skill load.
3. **Dead code disposition (F1):** Decide on `SkillRegistry`. If unused externally, remove file + tests. ~20 min.
4. **Dead code disposition (F3):** Decide on `createTempAgent` / `cleanupTempAgents` / `cleanupPersistentTempAgents`. Either wire them into `temp-skill-generator` flow or remove. ~1 hour with tests.
5. **Behavioral clarification (F4, F5, F13):** One docstring pass plus possible consolidation of LRU vs cleanup. ~30 min.
6. **Validator coverage (F16, F17):** Add `manifestVersion` and `activation` validation. Small, isolated change. ~30 min.
7. **Type-guard refactor (F8):** Convert `validateAgentDefinition` / `validateSkillDefinition` to type-guard signatures. ~1 hour.
8. **Style cleanup (F7, F11, F14, F18, F20):** Group with another typescript-expert sprint task. ~1 hour total.
9. **Memory V2 design decision (F12):** Architecture proposal — should agent/skill stats migrate to memory.db? ADR-required.

**Estimated total Sprint 162 cost (excluding F12):** 4-5 hours of low-risk cleanup work, all in `src/core/agent-pool.ts` and `src/core/skill-pool.ts`. Suggest a single `refactor` sprint task with `code-simplifier` skill applied.

---

## 7. Audit Self-Check

- [x] Read every line of all 3 in-scope files (931 LoC).
- [x] Verified count claims via filesystem inspection (15 builtins + 1 user + 2 learned + archive; 21 skills).
- [x] Cross-referenced docs (CLAUDE.md, DECKENT.md, IDENTITY.md) against code.
- [x] Searched for all production callers of public methods to identify dead code.
- [x] Reviewed prior audit (`docs/audits/sprint-152/T-152-021-agents-routing.md`) — F4/F5 reconfirm a known unfixed issue.
- [x] No source files modified. Single audit report written to `docs/audits/sprint-161/T-161-003-core-agent-skill-pool.md`.
- [x] Test files inspected for usage signal only — no test changes.

**File written:** `docs/audits/sprint-161/T-161-003-core-agent-skill-pool.md` (this file).
**Boundary check:** `git diff --stat` should show only this single addition.
