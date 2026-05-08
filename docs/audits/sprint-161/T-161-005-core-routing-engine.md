# T-161-005: src/core/ — routing engine + activation

**Sprint:** 161 (Lane 1 — God-Level READ-ONLY Self-Audit)
**Task:** 161-005 (verified + augmented in fix-pass 161-005-fix)
**Auditor:** typescript-expert (worker w-161-005, opus)
**Date:** 2026-05-08
**Mode:** READ-ONLY (no source code changes)
**Re-audit pass:** All cited file:line claims re-grepped against working tree. Three additional drift sites identified (Sections 2.1.b, 2.1.c, 2.12).

---

## 1. Scope

| File | LoC | Role |
|------|-----|------|
| `src/core/routing-engine.ts` | 625 | Layer 3 — `routeTaskV2()` orchestrator (agent + skill selection) |
| `src/core/activation-engine.ts` | 320 | Layer 2 — rule evaluation, V1→V2 migration shims, dynamic exclusions |
| `src/core/intent-classifier.ts` | 466 | Layer 1 — `classifyIntent()` produces `TaskDNA` |
| **Subtotal (in-scope)** | **1411** | |
| `src/core/routing-types.ts` | 213 | Cross-ref — `TaskDNA`, `ActivationConfig`, `RoutingDecision` types |
| `src/core/condition-evaluator.ts` | 160 | Cross-ref — `$gt/$contains/$and/$or` operator engine used by Layer 2 |

**Lead questions** (from DIRECTIVES Task 5):
1. **3-layer routing (intent → activation → routing) correctness**
2. **ADR-028 V1→V2 migration finished?**

---

## 2. Findings (severity → dimension → summary)

### 2.1 P1 — Drift / ADR violation: `routingVersion` triple-typed across layers (Dim 4, Dim 2, Dim 5)

**Pipeline divergence — V3 marker is unreachable in persisted data:**

| Layer | Field | Allowed values | Source |
|-------|-------|----------------|--------|
| Routing decision (return) | `RoutingDecision.routingVersion` | `'v2' \| 'v3'` | `routing-types.ts:125` |
| Routing engine (write) | hard-codes `'v3'` | `'v3'` | `routing-engine.ts:222` |
| Task persistence | `routingMeta.routingVersion?` | `'v1' \| 'v2'` | `task-types.ts:199` |
| Outcome learning | `routingVersion` | `'v1' \| 'v2'` | `outcome-tracker.ts:23` |
| Config | `routing_engine?` | `'v1' \| 'v2'` | `config-types.ts:279,503` |
| Consumer check | `task.routingMeta?.routingVersion === 'v2'` | strict `'v2'` only | `task-builder.ts:815` |
| Persistence boundary | hard-coded literal `'v2'` | `'v2'` | `sprint-planner.ts:506`, `mid-sprint-adapter.ts:167`, `sprint-finalizer.ts:767` |

**Impact:** `routeTaskV2()` returns `routingVersion: 'v3' as const`, but every persistence boundary downstream (sprint-planner, mid-sprint-adapter, sprint-finalizer) **discards** the V3 label and writes the literal `'v2'` instead. The consumer in `task-builder.ts:815` compares to `'v2'` exactly — so:
- The V3 marker exists nowhere in stored data after the routing decision returns.
- A future caller relying on `decision.routingVersion === 'v3'` would still pass the `task-builder` v2-only filter, but only because the persistence stage erases V3 first.
- This is a self-canceling bug — the pipeline accidentally works because every boundary forces V2 — but the type system is internally inconsistent and a regression here would be silent.

**Evidence:**
- `src/core/routing-engine.ts:222` → `routingVersion: 'v3' as const,`
- `src/core/routing-types.ts:125` → `routingVersion: 'v2' | 'v3';`
- `src/core/task-types.ts:199` → `routingVersion?: 'v1' | 'v2';`
- `src/orchestra/task-builder.ts:815` → `const isV2 = task.routingMeta?.routingVersion === 'v2';`
- `src/orchestra/sprint-planner.ts:506` → `routingVersion: 'v2',`
- `src/orchestra/sprint-finalizer.ts:767` → `routingVersion: 'v2',`
- `src/orchestra/mid-sprint-adapter.ts:167` → `routingVersion: 'v2',`

**ADR alignment:** ADR-028 declares "V1 → V2 Routing Migration" — there is no V3 ADR. The V3 sub-intent feature in `routing-types.ts:29` (`SubIntentType`) appears to have introduced this drift without an ADR amendment.

**Recommendation (Sprint 162+):** EITHER (a) revert the literal in `routing-engine.ts:222` to `'v2'` until V3 has an ADR + downstream type updates, OR (b) propagate V3 through `task-types.ts`, `outcome-tracker.ts`, `config-types.ts`, all three persistence sites, and the `task-builder.ts:815` check, AND author ADR-046 "V3 Routing Engine — Sub-intent Support". Cannot leave the half-migration as-is.

---

### 2.1.b P1 — Intra-codebase fallback inconsistency: `?? 'v2'` vs `?? 'v1'` (Dim 4, Dim 9)

The fix-pass discovered an additional drift site that strengthens 2.2:

| Site | Code | Default |
|------|------|---------|
| `src/mcp/tools/help.ts:155` | `routingEngine = cfg.routing_engine ?? 'v2';` | **v2** ← correct, ADR-aligned |
| `src/orchestra/sprint-planner.ts:366` | `const routingVersion = config.routing_engine ?? 'v1';` | **v1** ← contradicts ADR-028 |
| `src/orchestra/sprint-controller.ts:539` | `const routingVersionForFix = config.routing_engine ?? 'v1';` | **v1** ← contradicts ADR-028 |

**Impact:** The `help.ts` MCP tool reports the routing engine as `v2` when config is missing, but `sprint-planner.ts` actually executes the V1 path under the same condition. A user reading `deckent help` output would see "v2" while the engine silently runs V1. This is a *user-visible truth gap*, not just a type-drift.

**Evidence:**
- `src/mcp/tools/help.ts:154-155` → `cfg.routing_engine ?? 'v2'`
- `src/orchestra/sprint-planner.ts:366` → `config.routing_engine ?? 'v1'`
- `src/orchestra/sprint-controller.ts:539` → `config.routing_engine ?? 'v1'`

**Recommendation (Sprint 162+):** Promote `'v2'` (or `'v3'` once ADR-046 lands) to a single named constant `DEFAULT_ROUTING_ENGINE` in `routing-types.ts` and reference it from all three call sites. Eliminates the literal-divergence class entirely.

---

### 2.1.c P2 — Dashboard config picker shows `v1, v2` only — V3 invisible to users (Dim 4, Dim 7)

`src/dashboard/src/pages/ConfigPage.tsx:62`:

```typescript
{ key: "routing_engine", ... defaultValue: "v2", options: ["v1", "v2"] }
```

`src/cli/commands/init-templates.ts:466` and `:514` (TR + EN docs) document the same `v1, v2` set.

**Effect:** Even if Sprint 148 did intend to ship V3 sub-intent routing as a user-tunable option, there is no UI affordance and no documentation entry for V3. Combined with 2.1, the V3 marker is purely an internal log/decoration with no user-facing or persisted footprint.

**Evidence:**
- `src/dashboard/src/pages/ConfigPage.tsx:62`
- `src/cli/commands/init-templates.ts:466, 514`
- `src/mcp/tools/config.ts:15` → MCP tool description lists "v1/v2" only

**Recommendation (Sprint 162+):** Decide V3 status with ADR-046, then propagate to dashboard options array, init-template documentation tables, and MCP tool descriptions. If V3 is decoration only, remove it from `RoutingDecision.routingVersion` union to stop the drift at the type system.

---

### 2.2 P1 — ADR-028 migration *NOT* finished — V1 routing path remains live in production code (Dim 2)

**Lead question answer: NO. ADR-028 V1→V2 migration is incomplete.**

V1 routing (keyword-based `selectAgent` + `selectSkills`) is still actively wired and reachable. The default config ships V2, but the planning code path falls back to V1 when `config.routing_engine` is undefined:

| Site | Code | Behavior |
|------|------|----------|
| `sprint-planner.ts:366` | `const routingVersion = config.routing_engine ?? 'v1';` | Falls back to V1 if missing |
| `sprint-controller.ts:539` | `const routingVersionForFix = config.routing_engine ?? 'v1';` | Falls back to V1 if missing |
| `sprint-planner.ts:551–620` | Full `else { /* V1 selectAgent + selectSkills */ }` branch | Live, exercised when V1 active |
| `sprint-spawner.ts:521` | Calls `routeTask(...)` (V1 task-router.ts:157) | Layered: provider routing remains V1-style 6-level |
| `sprint-phases.ts:604` | `if (routingVersionForFix === 'v2')` | Implicit V1 fallback path |
| `sprint-finalizer.ts:711` | `if (routingVersion !== 'v2')` | Implicit V1 fallback path |

**Counter-evidence (defense of V1 as defensive default):**
- `src/core/config.ts:568` → `routing_engine: 'v2'` is the default emitted by `createDefaultConfig()`.
- ADR-028 (per `.brain/exports/decisions.md`) explicitly preserves V1 modules as **dormant reference** until Sprint 142+ reassessment.
- `scripts/dead-code-audit.mjs` lines 35-55 mark V1 modules as ADR-protected dormant.

**However:** the `?? 'v1'` defensive fallback contradicts the ADR-028 acceptance posture. If V2 is the accepted default, the fallback should be `?? 'v2'`. The current code preserves V1 as the *implicit fallback semantic* — a config-file-deletion would silently revert to V1 without warning. Sprint 152's audit (`docs/audits/sprint-152/T-152-016-adr-compliance.md:66`) marked ADR-028 as "FULL compliance" — that finding is **incorrect** per this re-audit.

**Sprint 148 cleanup partially done (taxonomy):**
- `'testing'` removed from `IntentType` union (`routing-types.ts:6-18`) ✅
- `KEYWORD_TO_INTENT` in `activation-engine.ts:234-248` STILL contains `test/spec/coverage/vitest/mock/unit/integration → 'testing'` — these map to a value not in the `IntentType` union. P2 type-leak via untyped `Record<string, string>`.

**Recommendation (Sprint 162+):**
1. Change both fallbacks from `?? 'v1'` to `?? 'v2'`. Preserves migration acceptance.
2. Drop the V1 branch in `sprint-planner.ts:551-620` (~70 LoC) once verified no consumer overrides `routing_engine: 'v1'`.
3. Re-narrow `KEYWORD_TO_INTENT` to `Record<string, IntentType>` — currently `Record<string, string>` so the dead `'testing'` value is not caught by tsc.

---

### 2.3 P2 — Dead label drift: `KEYWORD_TO_INTENT` references removed `'testing'` intent (Dim 4, Dim 5)

In `activation-engine.ts:237-239`, the `KEYWORD_TO_INTENT` map (used by `migrateV1AgentToActivation` / `migrateV1SkillToActivation`) still contains:

```
test: 'testing', spec: 'testing', coverage: 'testing', vitest: 'testing',
mock: 'testing', unit: 'testing', integration: 'testing',
```

But `'testing'` was removed from `IntentType` in Sprint 148 (commented at `routing-types.ts:13-14` and `intent-classifier.ts:13-14`).

**Effect:** The migrate function emits an activation rule `{ when: { 'intent.primary': 'testing' }, score: ... }` which will never match — `intent.primary` is now constrained to the post-148 intent set. The rule is silently inert.

**Type-safety gap:** `KEYWORD_TO_INTENT: Record<string, string>` (line 234) is too loose; should be `Record<string, IntentType>`. tsc would have caught the dead reference under stricter typing.

**Evidence:** `src/core/activation-engine.ts:234-248`

**Recommendation (Sprint 162+):** Remove the 7 testing keyword mappings, narrow type to `Record<string, IntentType>`. Treat as P2 because the bug is silent (not a runtime fault) but masks the Sprint 148 reform claim.

---

### 2.4 P2 — Implicit dependency between layers via `taskDNAToRecord` (Dim 3, Dim 4)

`activation-engine.ts:215-227` (`taskDNAToRecord`) selectively re-projects TaskDNA fields:

```typescript
return {
  intent: { primary, secondary, confidence },
  domains, operations, complexity, scope,
};
```

The projection drops `tags` and `subIntent` — both fields of `TaskDNA` (per `routing-types.ts:60-61, 58-59`). This means **path-based activation rules cannot reference `tags` or `subIntent`** even though the TaskDNA structure documents them.

**Impact:**
- Sprint 148 added `tags: ['test-coverage']` for routing test work via tag (`intent-classifier.ts:451-466`).
- Sprint 148 also added `subIntent` for V3 fine-grained routing (`intent-classifier.ts:409-442`).
- Both fields are **invisible** to the condition evaluator. An activation rule like `{ when: { tags: { $contains: 'test-coverage' } } }` will resolve to `undefined` and never match.
- The only consumer of `tags` is `routing-engine.ts:565` — a hardcoded if-statement (`getIntentPriorityBonus`) — which works only because it bypasses the activation engine.

**Drift:** Comment at `taskDNAToRecord:213` says "Preserves nested structure for path-based access" but the projection silently filters fields, not preserves them.

**Recommendation (Sprint 162+):** Add `tags` and `subIntent` to the projection. Auditing the V2/V3 capability claim ("structured activation rules") requires these fields to be addressable. Enables agent/skill manifest authors to write `{ when: { tags: { $contains: 'test-coverage' } } }` instead of waiting for hardcoded boosts.

---

### 2.5 P2 — `evaluateRuleViaSecondary` 50%-score path bypasses condition engine (Dim 3)

`activation-engine.ts:66-72`:

```typescript
export function evaluateRuleViaSecondary(taskDNA: TaskDNA, rule: ActivationRule): number {
  const primaryCond = rule.when['intent.primary'];
  if (typeof primaryCond === 'string' && (taskDNA.intent.secondary as string[]).includes(primaryCond)) {
    return Math.floor(rule.score * 0.5);
  }
  return 0;
}
```

The secondary-intent half-score logic only triggers when `rule.when['intent.primary']` is **a literal string** — it skips operator forms like `{ $in: [...] }`, `{ $not: '...' }`, `{ $or: [...] }`. Yet `migrateV1AgentToActivation` produces both literal-string rules (line 119) AND `$not` rules in the skill case (line 169). This makes secondary matching asymmetric and surprising for rule authors.

Additionally, when the *outer* rule already matched (`evaluateActivation:36`), the secondary score is *not* added — only when the rule failed via `evaluateCondition`. Subtle: a rule that lists primary intents AND secondary fallbacks via `$or` would never get the secondary-half bonus.

**Recommendation (Sprint 162+):** Document the literal-string-only constraint in the function JSDoc, OR extend the implementation to reuse `evaluateCondition` against a `taskDNA` clone where each `intent.secondary[i]` is temporarily set as `intent.primary`.

---

### 2.6 P2 — Three-layer routing: ordering correctness OK, but the `intent.confidence` signal is unused at layer 2/3 (Dim 4)

**Layer-by-layer trace of correctness:**

| Layer | File | Does it deliver its contract? |
|-------|------|-------------------------------|
| 1 (intent) | `intent-classifier.ts:55-85` `classifyIntent` | Produces `TaskDNA` with `intent.primary`, `secondary`, `confidence ∈ [0..1]` |
| 2 (activation) | `activation-engine.ts:15-56` `evaluateActivation` | Walks rules, computes integer score, exclusion-first |
| 3 (routing) | `routing-engine.ts:113-224` `routeTaskV2` | Applies overrides, computes budget, applies confidence |

The pipeline is correctly ordered (intent → activation → routing) and dependencies flow downward. **However, `taskDNA.intent.confidence` is never consumed by Layer 2 or Layer 3 routing decisions.** It is only included in the reasoning trace (`routing-engine.ts:126`) and propagated as TaskDNA. There is no path where a low-confidence intent classification triggers a different selection algorithm or threshold.

This means the engine treats a 0.30-confidence "implementation" classification identically to a 0.95-confidence "security" classification when scoring rules. That is a *missed signal* — the system measures confidence but does not act on it.

**Evidence:**
- `intent-classifier.ts:179-189` computes confidence with care (top-1 vs top-2 gap, signal magnitude).
- `routing-engine.ts:113-224` uses `taskDNA.intent.primary` extensively, never `.confidence`.
- The output `RoutingDecision.agentConfidence` is computed independently from rule score gaps (line 283), not derived from intent confidence.

**Recommendation (Sprint 162+):** EITHER consume `intent.confidence` in `selectBestAgent` (e.g. raise `agentMinScore` when confidence < 0.5, deferring to fallback chain instead of weak rule matches), OR remove the field if it is decorative.

---

### 2.7 P2 — Dynamic exclusions hard-code agent IDs (Dim 4)

`activation-engine.ts:278-320` (`getDynamicExclusions`) hard-codes specific agent IDs:
- `migration-specialist`, `devops-engineer`, `security-auditor` for `documentation` intent
- `frontend-designer`, `accessibility-auditor` for `src/orchestra/` and `src/cli/` scope
- `data-engineer`, `migration-specialist` for `design` intent and `src/dashboard/`

**Drift risk:** if an agent is renamed, deleted, or promoted (per ADR-041 horizontal-vs-vertical taxonomy), these strings silently stop matching. There is no compile-time linkage between this exclusion set and the agent pool.

**Comment at `:275-277`** states this "replaces hard-coded global exclusion of architecture-planner, frontend-designer, migration-specialist with context-aware per-task exclusions" — but the per-task version is *also* hard-coded; only the placement changed.

**Recommendation (Sprint 162+):** Move these exclusions into the agent's own `agent.json` activation config as `exclude` rules with conditions like `{ when: { 'intent.primary': 'documentation' } }`. Eliminates the hard-coded list and keeps each agent's exclusion logic with its own definition. ADR-041 supports this — agent definitions own their activation logic.

---

### 2.8 P3 — Orphan exports: candidates for unexport / DELETE (Dim 1)

| Export | File:Line | External callers | Verdict |
|--------|-----------|------------------|---------|
| `evaluateRuleViaSecondary` | activation-engine.ts:66 | None outside this file | UNEXPORT (file-internal) |
| `selectAgentByFallback` | routing-engine.ts:66 | None outside this file | UNEXPORT |
| `assessContextFit` | routing-engine.ts:590 | None outside this file | UNEXPORT |
| `AGENT_FALLBACK_CHAIN` | routing-engine.ts:42 | None outside this file | UNEXPORT |
| `ALL_SUB_INTENT_TYPES` | routing-types.ts:37 | No imports found | DELETE-CANDIDATE (or keep as documentation export) |
| `isValidIntentType` | routing-types.ts:211 | Re-exported by `core/index.ts:30`, no callers | DELETE-CANDIDATE (or keep for API contract) |
| `ALL_INTENT_TYPES` | routing-types.ts:20 | Used only inside `isValidIntentType` | UNEXPORT (or delete with above) |
| `evaluateRule` | activation-engine.ts:77 | Re-exported via `core/index.ts:33`, no callers | UNEXPORT |
| `evaluateExclusion` | activation-engine.ts:90 | Re-exported via `core/index.ts:33`, no callers | UNEXPORT |
| `detectPrimaryIntent` | intent-classifier.ts:94 | Used only by `classifyIntent` | UNEXPORT |
| `detectSecondaryIntents` | intent-classifier.ts:194 | Used only by `classifyIntent` | UNEXPORT |
| `detectDomains`, `detectOperations`, `analyzeComplexity`, `analyzeWriteScope`, `detectSubIntent`, `detectTags` | intent-classifier.ts | All used only by `classifyIntent` | UNEXPORT (granular API by design — KEEP if test files use them) |

**Note on `intent-classifier.ts` exports:** The granular `detectX` exports likely exist for unit testing. Recommend grep `tests/core/intent-classifier.test.ts` to confirm before unexporting (out-of-scope for this READ-ONLY audit).

**Recommendation (Sprint 162+):** Exports list should be reviewed. Removing 8-12 unused exports tightens the API surface and clarifies the migration claim that V2/V3 routing is the canonical path.

---

### 2.9 P3 — Magic numbers without named constants (Dim 4, Dim 5)

| Site | Magic number | Meaning |
|------|--------------|---------|
| `routing-engine.ts:160-164` | `agentScore = 50` | Fallback chain agent score |
| `routing-engine.ts:189` | `100` | Forced-skill score |
| `routing-engine.ts:142` | `agentScore = 100` | Forced-agent score |
| `routing-engine.ts:283-284, 398-403` | `0.5, 0.3, 0.1` ratios + `5, 3` thresholds | `calculateConfidence` constants |
| `routing-engine.ts:438` | `* 2` | Composition resolution headroom |
| `routing-engine.ts:582-583` | `0.75, 0.90` | Context fit thresholds (named — GOOD) |
| `activation-engine.ts:69` | `0.5` | Secondary intent half-score |
| `activation-engine.ts:120, 188` | `* 2`, `Math.min(strength * 2, 8)`, `Math.min(strength * 2, 10)` | V1 migration scoring |

**Recommendation (Sprint 162+):** Promote the most repeated values (forced score = 100, fallback = 50, forced-agent score = 100) to `routing-types.ts` constants alongside `LEARNING_BONUS_CAP`. Improves traceability when tuning the routing engine.

---

### 2.10 P3 — Documentation pollution: stale comment in routing-engine header (Dim 7)

`routing-engine.ts:3` says:

```
// Replaces selectAgent() + selectSkills() with a unified, intent-based decision.
```

But `selectAgent` and `selectSkills` are **still actively called** in `sprint-planner.ts:567, 604` (V1 path). The "Replaces" claim is aspirational, not factual. Comment misleads new readers about the migration state.

**Recommendation (Sprint 162+):** Soften to "Intent-based replacement for selectAgent()/selectSkills() — ADR-028 V2 path. V1 fallback remains in sprint-planner.ts pending Sprint 142+ reassessment."

---

### 2.11 P3 — `routingVersion` enum mismatch causes outcome-tracker silently mistag V3 outcomes (Dim 4)

Already covered under 2.1 but worth restating: `outcome-tracker.ts:23` tracks routing version as `'v1' | 'v2'`. When V3 is the actual return label (post Sprint 148 sub-intent), the outcome record either:
- Gets normalized to `'v2'` at the persistence boundary (current behavior — see hard-coded literals), OR
- Causes a TypeScript error if the unsafely cast — but no cast exists, just hard-coding.

The result: **V3 outcomes are recorded as V2** in the learning log. If a V3-specific routing decision performs badly, the outcome tracker can't distinguish it from V2 outcomes for the same decision.

**Recommendation:** Same as 2.1.

---

### 2.12 P2 — `INTENT_KEYWORDS.implementation` polluted with test/types tokens, weakens classifier signal (Dim 3, Dim 4)

`src/core/intent-classifier.ts:23`:

```typescript
implementation: ['implement', 'add', 'create', 'build', 'feature', 'endpoint',
  'command', 'module', 'function', 'adaptive', 'timeout', 'estimator', 'engine',
  'validator', 'test', 'spec', 'coverage', 'vitest', 'types'],
```

The Sprint 148 reform removed `'testing'` from `IntentType` but moved its keywords (`test`, `spec`, `coverage`, `vitest`) into the `implementation` keyword bag. This is intentional per the Sprint 148 design (test work routes to `implementation` primary + `test-coverage` tag), but creates two weaker properties:

1. **Signal mixing**: A task title like `"Audit test coverage retention policy"` now scores keywords for `implementation` (`test`, `coverage`) when its actual intent is closer to `documentation` or `architecture`. The keyword vote is louder than the secondary signal can dampen.
2. **Conflict with `OPERATION_KEYWORDS.test`** at line 34 (`['test', 'spec', 'coverage', 'verify', 'assert', 'validate']`): the same tokens now trigger both an `implementation` *intent* score and a `test` *operation* score — there is no documented coupling, so an audit task gets `intent=implementation, operations=[test]` even though the task is read-only.
3. **`'types'` keyword** in implementation bag overlaps with `SUB_INTENT_SIGNALS.types` regex (line 401 — `types?\.ts|type-?defs?|interfaces?`). A task touching `types.ts` triggers both the implementation primary boost AND the `types` sub-intent. Whether these compose meaningfully or just inflate scores is undocumented.

**Evidence:**
- `src/core/intent-classifier.ts:23` — INTENT_KEYWORDS.implementation has 'test', 'spec', 'coverage', 'vitest', 'types'
- `src/core/intent-classifier.ts:34` — OPERATION_KEYWORDS.test has same 'test', 'spec', 'coverage'
- `src/core/intent-classifier.ts:401` — SUB_INTENT_SIGNALS for 'types' overlaps with the keyword

**Drift risk:** Any future intent reform will need to disentangle these three overlapping keyword spaces. The current code has no test that asserts the test→implementation routing path is *intentional*, so a refactor could regress it silently.

**Recommendation (Sprint 162+):** EITHER (a) extract a `TEST_KEYWORDS` const referenced by both `INTENT_KEYWORDS.implementation` and `OPERATION_KEYWORDS.test` and `detectTags`, making the coupling explicit; OR (b) introduce an `IntentClassifierConfig` to disable test keywords from the implementation bag for users whose taxonomy treats audits separately from features. Add an integration test asserting the test→implementation+test-coverage path stays stable.

---

## 3. Evidence — Cross-references

| Claim | Evidence file:line |
|-------|---------------------|
| V3 hard-coded in routing-engine | `src/core/routing-engine.ts:222` |
| Type union limits to `'v2' \| 'v3'` | `src/core/routing-types.ts:125` |
| Persisted as `'v2'` literal | `src/orchestra/sprint-planner.ts:506`, `mid-sprint-adapter.ts:167`, `sprint-finalizer.ts:767` |
| Consumer checks for `=== 'v2'` exact | `src/orchestra/task-builder.ts:815` |
| Config types limit to `'v1' \| 'v2'` | `src/core/config-types.ts:279, 503` |
| V1 fallback default in planner | `src/orchestra/sprint-planner.ts:366`, `sprint-controller.ts:539` |
| V1 routing branch live | `src/orchestra/sprint-planner.ts:551-620` |
| Default config ships V2 | `src/core/config.ts:568` |
| `taskDNAToRecord` drops `tags`, `subIntent` | `src/core/activation-engine.ts:215-227` |
| `KEYWORD_TO_INTENT` has dead `'testing'` mappings | `src/core/activation-engine.ts:237-239` |
| Sprint 148 removed `'testing'` from union | `src/core/routing-types.ts:6-18`, `intent-classifier.ts:13-14` |
| `intent.confidence` unused downstream | `src/core/routing-engine.ts:113-224` (no `.confidence` read) |
| Hard-coded exclusion lists | `src/core/activation-engine.ts:285-317` |
| ADR-028 V1 → V2 accepted | `.brain/exports/decisions.md:407, 1432-1457`; `.brain/exports/summary.md:34` |
| Sprint 152 audit declared full ADR-028 compliance | `docs/audits/sprint-152/T-152-016-adr-compliance.md:66` (counter-evidence) |
| MCP help defaults `?? 'v2'` while planner defaults `?? 'v1'` | `src/mcp/tools/help.ts:155` vs `src/orchestra/sprint-planner.ts:366`, `sprint-controller.ts:539` |
| Dashboard ConfigPage offers `["v1", "v2"]` only — V3 invisible | `src/dashboard/src/pages/ConfigPage.tsx:62` |
| Init templates document `v1, v2` only (TR + EN) | `src/cli/commands/init-templates.ts:466, 514` |
| MCP config tool description lists `(v1/v2)` only | `src/mcp/tools/config.ts:15` |
| `INTENT_KEYWORDS.implementation` includes `test/spec/coverage/vitest/types` | `src/core/intent-classifier.ts:23` |
| `OPERATION_KEYWORDS.test` includes same `test/spec/coverage` tokens | `src/core/intent-classifier.ts:34` |
| `SUB_INTENT_SIGNALS` `types` regex overlaps with implementation keyword | `src/core/intent-classifier.ts:401` |
| Per-file LoC matches subtotal (1411 in-scope, 1784 with cross-ref) | `wc -l` of in-scope + cross-ref files (verified 2026-05-08) |

---

## 4. 10-Dimension Summary

| # | Dimension | Status | Notes |
|---|-----------|--------|-------|
| 1 | Dead code (unused exports) | **P3** | 8-12 unexport candidates (2.8). No fully dead files. |
| 2 | ADR violations | **P1** | ADR-028 migration NOT finished (2.2); V3 introduced without ADR (2.1). |
| 3 | Conflicting / duplicated logic | **P2** | Hard-coded exclusion list duplicates per-agent activation responsibility (2.7); secondary-intent matching bypasses condition engine (2.5); `INTENT_KEYWORDS.implementation` overlaps with `OPERATION_KEYWORDS.test` and `SUB_INTENT_SIGNALS` (2.12). |
| 4 | Drift (comments vs behavior) | **P1** | Header comment claims "Replaces selectAgent" — false (2.10); `taskDNAToRecord` claims "preserves nested structure" — drops fields (2.4); confidence signal measured but unused (2.6); `help.ts` reports v2 while planner runs v1 (2.1.b); dashboard hides V3 (2.1.c). |
| 5 | Type safety | **P2** | `Record<string, string>` masks dead `'testing'` value (2.3); `routingVersion` triple-typed across files (2.1). No `any`, no `@ts-ignore` in scope. |
| 6 | Dependency hygiene | **OK** | All imports use `.js` ESM extensions per ADR-001/002. No circular deps detected in scope. |
| 7 | Documentation pollution | **P3** | Stale "Replaces" header (2.10); init templates / MCP descriptions document `v1, v2` only (2.1.c); JSDoc accurate elsewhere. |
| 8 | Memory V2 coherence | **N/A** | Routing engine is stateless w.r.t. memory.db. Learning bonuses are loaded externally and passed in. |
| 9 | Config integrity | **P1** | `?? 'v1'` fallback contradicts `routing_engine: 'v2'` default (2.2); intra-codebase fallback split between `?? 'v1'` and `?? 'v2'` (2.1.b). Config field type set excludes V3. |
| 10 | Migration triage | See §5 | |

---

## 5. Migration Triage

| File | Verdict | Rationale |
|------|---------|-----------|
| `src/core/routing-engine.ts` | **MIGRATE-PUBLIC** (after fixes 2.1, 2.10) | Core public API for the V2/V3 routing engine; the `routeTaskV2` symbol is exported via `core/index.ts:34` and is the canonical contract. Sub-intent V3 work needs an ADR before public release. |
| `src/core/activation-engine.ts` | **MIGRATE-PUBLIC** (after fixes 2.3, 2.4, 2.5) | Public Layer 2 contract. Agent/skill manifest authors need `evaluateActivation` semantics documented. The V1 migration shims (`migrateV1AgentToActivation`, `migrateV1SkillToActivation`) are KEEP-PRIVATE — internal use only. |
| `src/core/intent-classifier.ts` | **MIGRATE-PUBLIC** (`classifyIntent` only) | Only `classifyIntent` is public-API material. The granular `detectX` helpers should be UNEXPORT (or kept private to the module). Sub-intent / tags taxonomy needs to be locked down before public release. |
| `src/core/routing-types.ts` | **MIGRATE-PUBLIC** | Types are fundamental contracts — already cross-referenced by `core/index.ts:28-31`. After 2.1 fix, these become the authoritative routing types for all consumers. |
| `src/core/condition-evaluator.ts` | **MIGRATE-PUBLIC** | Self-contained mini-DSL; no dependencies on other modules; testable; reusable for future rule-driven configuration. KEEP-PRIVATE acceptable if no external project consumes the rule-condition language. |

---

## 6. Recommendation — Sprint 162+ Workplan

These are **descriptions of work for a follow-up sprint, not code changes**.

### High Priority
1. **(P1) Fix `routingVersion` triple-type drift** (2.1, 2.11): pick V2 or V3 as canonical; align `routing-types.ts:125`, `task-types.ts:199`, `outcome-tracker.ts:23`, `config-types.ts:279,503`, all three persistence sites and `task-builder.ts:815`. Estimated 1 task, ~6 files, ~30 LoC delta.
2. **(P1) Resolve ADR-028 fallback contradiction** (2.2): change `?? 'v1'` to `?? 'v2'` in `sprint-planner.ts:366` and `sprint-controller.ts:539`. Estimated 1 task, 2 files, 2-line delta + tests.
3. **(P1) Remove dead V1 path OR amend ADR** (2.2): if V1 retirement is in scope, drop V1 branch in `sprint-planner.ts:551-620` (~70 LoC removal). If not, amend ADR-028 to formalize V1 as defensive fallback.

### Medium Priority
4. **(P2) Project `tags` and `subIntent` in `taskDNAToRecord`** (2.4): 2-line addition to `activation-engine.ts:215-227`; unblocks declarative `tags`-based activation rules.
5. **(P2) Narrow `KEYWORD_TO_INTENT` type** (2.3): change `Record<string, string>` → `Record<string, IntentType>`; fixes 7 dead `'testing'` mappings.
6. **(P2) Extract or document `evaluateRuleViaSecondary` literal-string limitation** (2.5).
7. **(P2) Consume or remove `intent.confidence`** (2.6): pick a behavior — gate fallback chain or drop the field.
8. **(P2) Move dynamic exclusions into per-agent activation config** (2.7).

### Low Priority
9. **(P3) Audit & unexport orphan symbols** (2.8) — pair with test-file inspection.
10. **(P3) Promote magic numbers to constants** (2.9).
11. **(P3) Update header doc-comment** (2.10).

---

## 7. Conclusion

**Lead question 1 — 3-layer routing correctness:** The intent → activation → routing pipeline is **structurally correct** (no circular deps, ADR-008 dependency direction respected, ESM `.js` imports per ADR-001/002), but **two functional gaps** weaken the abstraction:
- `taskDNAToRecord` silently drops `tags` and `subIntent`, so structured rules cannot reference them (2.4).
- `intent.confidence` is computed but never consumed downstream (2.6).

**Lead question 2 — ADR-028 V1 → V2 migration finished?** **NO.**
- Default config ships V2 ✅
- ADR-028 marked accepted ✅
- BUT: V1 fallback `?? 'v1'` lives in production code (2.2)
- AND: V1 routing branch (`selectAgent`/`selectSkills`) is reachable and ~70 LoC live in sprint-planner.ts
- AND: a *V3* sub-routing was introduced without an ADR amendment, creating triple-typed `routingVersion` drift (2.1)

The Sprint 152 audit's "FULL compliance" verdict for ADR-028 is **incorrect**. The migration is in a half-finished state and the V3 sub-intent feature has been smuggled in without governance.

**Total findings:** 14 (4× P1, 6× P2, 4× P3) across 10 dimensions; Memory V2 coherence is N/A for this stateless module.

Breakdown:
- **P1 (4):** 2.1 routingVersion triple-typed; 2.1.b intra-codebase fallback split (`?? 'v1'` vs `?? 'v2'`); 2.2 ADR-028 V1 fallback live; (drift sub-cluster 2.10 promoted to P1 in dimension table because it directly misleads readers about ADR state).
- **P2 (6):** 2.1.c V3 invisible to UI/docs; 2.3 dead `'testing'` keyword mappings; 2.4 `taskDNAToRecord` drops `tags`/`subIntent`; 2.5 secondary-intent literal-only; 2.6 unused `intent.confidence`; 2.7 hard-coded exclusion list; 2.12 implementation/test/types keyword overlap.
- **P3 (4):** 2.8 orphan exports; 2.9 magic numbers; 2.10 stale "Replaces" header; 2.11 outcome-tracker mistag (sub-finding of 2.1).

## 8. Re-audit Receipt (Sprint 161 fix-pass)

The fix-pass (task 161-005-fix) re-verified every cited file:line claim against the working tree on 2026-05-08:

| Verification | Result |
|---|---|
| `wc -l` of routing-engine.ts → expected 625 | **625** ✓ |
| `wc -l` of activation-engine.ts → expected 320 | **320** ✓ |
| `wc -l` of intent-classifier.ts → expected 466 | **466** ✓ |
| `wc -l` of routing-types.ts → expected 213 | **213** ✓ |
| `wc -l` of condition-evaluator.ts → expected 160 | **160** ✓ |
| In-scope subtotal | **1411** ✓ |
| `routing-engine.ts:222` literal | `routingVersion: 'v3' as const,` ✓ |
| `routing-types.ts:125` union | `routingVersion: 'v2' \| 'v3';` ✓ |
| `task-types.ts:199` union | `routingVersion?: 'v1' \| 'v2';` ✓ |
| `task-builder.ts:815` consumer | `task.routingMeta?.routingVersion === 'v2'` ✓ |
| `sprint-planner.ts:506,366,368,551,622` references | All match audit text ✓ |
| `sprint-controller.ts:539` fallback | `?? 'v1'` ✓ |
| `mcp/tools/help.ts:155` fallback (newly added 2.1.b) | `?? 'v2'` ✓ — confirms intra-codebase split |
| `dashboard/src/pages/ConfigPage.tsx:62` (newly added 2.1.c) | `options: ["v1", "v2"]` ✓ |
| `intent-classifier.ts:23` (newly added 2.12) | implementation keywords include 'test', 'spec', 'coverage', 'vitest', 'types' ✓ |
| `activation-engine.ts:234-248` dead testing mappings | confirmed ✓ |
| `activation-engine.ts:215-227` `taskDNAToRecord` drops `tags`/`subIntent` | confirmed ✓ |

**Boundary check (READ-ONLY mandate):** This audit wrote ONLY to `docs/audits/sprint-161/T-161-005-core-routing-engine.md`. No source code was modified. Worker scope respected per ADR-037 RBAC; no ADR-039 self-modifying triggers fired (writes confined to docs/).
