# T-161-016 — `src/orchestra/` task-router + rule-evolver + outcome-tracker

**Sprint:** 161 (Lane 1, READ-ONLY pre-beta audit)
**Auditor:** doc-writer (opus, typescript-expert skill)
**Date:** 2026-05-08
**Mandate:** READ-ONLY. No source code modified. Single deliverable.

---

## 1. Scope

| File | LoC | Role |
|------|----:|------|
| `src/orchestra/task-router.ts` | 319 | Provider selection (V1 router): config → force → task.provider → default → worker_provider → fallback. Also exposes `detectTaskType()` and `emitTimeoutEvents()`. |
| `src/orchestra/rule-evolver.ts` | 279 | Auto-generates activation/exclusion rules from outcome history. Persists `.deckent/routing/evolved-rules.json`. |
| `src/orchestra/outcome-tracker.ts` | 502 | Records routing outcomes per sprint, computes learning bonuses, maintains agent/skill performance + synergy matrix in `.deckent/routing/learnings.json`. |

**Lead questions answered:**
- ADR-015 6-level routing priority — **partially correct**, drift in JSDoc (see F-1).
- Learning bonus correctness — **mostly correct**, with two precision concerns (F-6, F-7).
- Synergy matrix — **wires correctly**, but rule-evolver consumes it asymmetrically (F-3).

---

## 2. Findings

Severity legend: P0 (critical) · P1 (high) · P2 (medium) · P3 (low/style).

### F-1 — `routeTask` JSDoc drift: Priority 3 claims agent `preferredProvider` lookup that does not exist

- **Severity:** P2
- **Dimension:** Drift (claim vs behavior)
- **Files:** `src/orchestra/task-router.ts:144-150` (JSDoc), `:211-222` (implementation)

The JSDoc on `routeTask()` documents priority 3 as:

```
3. Agent preference: task.assignedAgent has preferredProvider → use it (if available)
```

The implementation at `:211-222` instead reads `task.provider` (the task-level provider field), with no agent-pool lookup at all. Confirmed by `grep -n preferredProvider src/orchestra/task-router.ts` → 1 hit (the JSDoc only). No call into `agent-pool` or any agent definition for `preferredProvider`. ADR-015's "agent" step is therefore implemented as "task.provider field", which is not the same surface a reader would expect.

**Impact:** A reader expecting agent-driven provider routing will look in the wrong place. This is also a public-readiness concern because the same priority list is repeated in CLAUDE.md / DECKENT.md (ADR-015 reads "config → force → agent → skill → worker → fallback").

### F-2 — `emitTimeoutEvents()` is exported but has zero production callers

- **Severity:** P2
- **Dimension:** Dead code / unfinished wire
- **Files:** `src/orchestra/task-router.ts:290-318`

`grep -rn emitTimeoutEvents src/` returns exactly one hit — the definition itself (`task-router.ts:290`). The only callers are in `tests/orchestra/event-stream-timeout.test.ts`. The production routing call site, `src/orchestra/sprint-spawner.ts:521` (`const routing = routeTask(task, config, availableProviders);`), invokes `routeTask` but never invokes `emitTimeoutEvents`.

Sprint 145 archive confirms intent: `task-145-002-fix.log` says the optional `timeoutSeconds` field "is for brain to attach timeout info to routing result after `emitTimeoutEvents()`" — but that brain-side wire was never landed. As a result:
- `TaskRouting.timeoutSeconds` is always `undefined` in production.
- `CHANNELS.TIMEOUT_ASSIGN` and `CHANNELS.TIMEOUT_CAP_EXCEEDED` events never fire in real sprints.
- 5 test cases at `tests/orchestra/event-stream-timeout.test.ts` exercise the code path but production never does.

**Migration triage:** UNCERTAIN — either wire it from `sprint-spawner.ts` after `routeTask`, or delete the helper + its tests + the optional `timeoutSeconds` field. Cannot leave it as half-merged.

### F-3 — Synergy rule generation is asymmetric and uses globally-active `when: {}`

- **Severity:** P1
- **Dimension:** Conflicting / drift / correctness
- **Files:** `src/orchestra/rule-evolver.ts:155-218`

Two distinct issues in `evolveSynergyRules()`:

**(a) Asymmetric rule emission.** Each synergy entry's pair is stored as a sorted join (`outcome-tracker.ts:133` — `[skillIds[i], skillIds[j]].sort().join('+')`). When a synergy is detected for `partA+partB`, line 173-186 creates an activation rule **only for `partA`**. There is no symmetric rule for `partB`, so only the lexicographically-first skill of the pair gains the bonus.

```ts
// rule-evolver.ts:173
rules.push({
  type: 'activation',
  entityId: partA,            // ← only partA, never partB
  entityType: 'skill',
  …
});
```

**(b) `when: {}` makes the rule activate globally.** The activation rule's `when` clause is empty (`:179` and `:204`), meaning the rule fires for every task, not "when `partB` is co-selected". The intended semantics of a "synergy" rule (skill X gets a boost when paired with skill Y) is therefore not encoded in the rule itself — it is just a flat bonus for `partA` whenever any synergy with anything was ever observed.

Combined effect: synergy rules give a one-sided, context-free bonus. Whether this is intentional simplification (fold synergy into a generic affinity boost) or a TODO is undocumented. Either way the JSDoc on `:149` says "Skill+skill synergy → activation rules" without clarifying the asymmetry or context-free firing.

### F-4 — Magic-number divergence: synergy `score: rate * 5` vs intent `score: rate * 8`

- **Severity:** P3
- **Dimension:** Drift / conventions
- **Files:** `src/orchestra/rule-evolver.ts:110` (intent rule, score `*8`), `:181` (synergy rule, score `*5`)

Two activation-rule emitters use different score multipliers (`Math.round(intentData.successRate * 8)` vs `Math.round(entry.successRate * 5)`) with no comment explaining the distinction. A reader cannot tell whether 5 vs 8 is principled or a copy-edit artifact. The same `confidence = Math.min(0.5 + n*0.04, 0.95)` formula is also duplicated three times verbatim (`:99`, `:123`, `:169`, `:195`).

### F-5 — `TASK_TYPE_TO_ROUTING_KEY` claims `code` has no skill-routing key, but `skill_routing` has no `code` field anyway

- **Severity:** P3
- **Dimension:** Dead code / type safety
- **Files:** `src/orchestra/task-router.ts:50-56`, `:16-21`

```ts
const TASK_TYPE_TO_ROUTING_KEY: Record<TaskType, keyof SkillRoutingConfig | null> = {
  design: 'design',
  test: 'testing',
  doc: 'docs',
  code: null,
  unknown: null,
};
```

`SkillRoutingConfig` has only `design | testing | docs | default` — there is no `code` slot. Mapping `code → null` is correct but redundant; the `null` arm at `:179-180` (`if (routingKey && routing) { … }`) is the only consumer. Consider noting in a comment that "code" tasks deliberately fall through to lower-priority steps.

This also masks a small risk: if someone later adds a `code` field to `SkillRoutingConfig`, they must remember to update `TASK_TYPE_TO_ROUTING_KEY` from `null` to `'code'` — there is no compile-time enforcement of consistency.

### F-6 — Floating-point reconstruction of integer counts (drift-prone)

- **Severity:** P2
- **Dimension:** Type safety / numerical correctness
- **Files:** `src/orchestra/outcome-tracker.ts:388` (intent counts), `:421-422` (synergy counts)

Both `updateEntityPerformance()` (intent slice) and `updateSynergy()` reconstruct success counts from the stored `successRate`:

```ts
// :388
const intentSuccesses = Math.round(intentPerf.successRate * (intentPerf.tasks - 1)) + (isSuccess ? 1 : 0);
intentPerf.successRate = intentSuccesses / intentPerf.tasks;

// :421-422
const successes = Math.round(entry.successRate * (entry.tasks - 1)) + (isSuccess ? 1 : 0);
entry.successRate = successes / entry.tasks;
```

This is **inconsistent with how the top-level performance is tracked** in the same file: lines 357-372 store integer `successCount` / `failCount` directly and derive `successRate = successCount / totalTasks` from them. The reconstructive form at `:388`/`:421` introduces cumulative `Math.round` error; over hundreds of updates the reconstructed integer may drift by ±1 from the true running count.

**Why it matters:** rule-evolver gates new rules on `intentData.successRate >= 0.85` (`rule-evolver.ts:98`) and synergy verdicts use thresholds at exactly `0.85` and `0.5` (`outcome-tracker.ts:427-428`). A drift of even one count near a threshold can flip a verdict and trigger a spurious auto-applied rule.

**Migration triage:** Add explicit `successCount` / `failCount` fields to `SynergyEntry` and to the per-intent record, mirror the pattern at `:357-372`, and derive rate. This is a P2 because the drift is small and rates dampen quickly with sample size, but it is a quietly-wrong pattern in code that drives auto-applied policy.

### F-7 — Sprint-recency bonus inconsistency: cap applied only to skills, not to agents

- **Severity:** P2
- **Dimension:** Drift / correctness
- **Files:** `src/orchestra/outcome-tracker.ts:152-182`, `:193-228`

`calculateBonuses()` at `:152` aggregates three sources: agent overall bonus, skill overall bonus, and skill sprint-recency bonus. The cap clamp at `:172` is applied **after** combining sprint-recency for skills:

```ts
const combined = (bonusMap.get(skillId) ?? 0) + recencyBonus;
bonusMap.set(skillId, Math.max(-LEARNING_BONUS_CAP, Math.min(LEARNING_BONUS_CAP, combined)));
```

But agent bonuses (`:157-160`) are only clamped inside `computeBonus()` and are never re-clamped. There is no agent equivalent of `calculateSprintRecencyBonuses()`. Net effect: agents are eligible only for the inherent ±cap (no recency boost), while skills can stack `computeBonus()` (capped) + recency (±3/±2/±1) and then re-cap.

This is documented obliquely by `:188-191`: "more aggressive: +3/-2 based on last 3 sprints". Whether agents are intentionally excluded from recency or simply forgotten is not commented. The SPRINT-LOG/RETRO files do not surface this asymmetry. ADR-015 / ADR-028 do not specify the asymmetry either.

### F-8 — Hardcoded Turkish in `getWorstCombinations()` user-facing string

- **Severity:** P3
- **Dimension:** i18n / drift
- **Files:** `src/orchestra/outcome-tracker.ts:301-308`

```ts
return `- agent:${c.agentId} + skill:${c.skillId} → %${rate} başarı (${total} task)`;
```

Mixed-language output: English IDs and labels (`agent:`, `skill:`) plus Turkish word `başarı`. This string is injected into the AI planner prompt (called from `sprint-planner.ts:248` `ot.getWorstCombinations(5)`). Whether the planner prompt is Turkish or English depends on the prompt template, but the helper hard-codes Turkish independent of context. ADR-032 (i18n Pattern System) is an accepted ADR; this string ignores it.

### F-9 — `RoutingOutcome.routingVersion` type is `'v1' | 'v2'`, but routing-engine emits `'v3'` (cross-file confirmation only)

- **Severity:** P1 (cross-file; not introduced by these three files but consumed by them)
- **Dimension:** Drift / cross-module
- **Files:** `src/orchestra/outcome-tracker.ts:23` (this file's contract), and per sibling audit `docs/audits/sprint-161/T-161-005-core-routing-engine.md` (`src/core/routing-engine.ts:222`)

`outcome-tracker.ts:23` declares:

```ts
routingVersion: 'v1' | 'v2';
```

The sibling T-161-005 audit reports that `routing-engine.ts:222` returns `routingVersion: 'v3' as const`, and that all three persistence boundaries (sprint-planner, mid-sprint-adapter, sprint-finalizer) silently rewrite to `'v2'` to satisfy this contract. From this file's perspective, the contract is internally consistent — but the half-migration in `routing-engine.ts` and the persistence-layer rewrites mean **the data this file accumulates may misrepresent the routing engine version that produced it**.

Recommendation: cross-link with T-161-005's recommendation. Either restore `'v2'` in `routing-engine.ts:222` (preferred until ADR), or expand the `RoutingOutcome.routingVersion` union to include `'v3'` and add an ADR.

### F-10 — Boundary-layer `JSON.parse` casts default to non-strict shapes

- **Severity:** P3
- **Dimension:** Type safety
- **Files:** `outcome-tracker.ts:267` (`as RoutingOutcome[]`), `:438` (`as Partial<LearningsData>`), `:493` (no cast — implicit `any[]`); `rule-evolver.ts:244`, `:273`.

`outcome-tracker.ts:493` is the weakest:

```ts
outcomes = JSON.parse(readFileSync(filePath, 'utf-8'));   // implicit any
outcomes.push(outcome);
writeFileSync(filePath, JSON.stringify(outcomes, null, 2), 'utf-8');
```

Type-safety drops to `any` here. The variable is declared `RoutingOutcome[]` on `:491` but the `JSON.parse` overrides at runtime if the file shape mismatches. typescript-expert guideline says "prefer `unknown` over `any`". A safer form is `JSON.parse(...) as unknown as RoutingOutcome[]` or a Zod parse. Same pattern at `rule-evolver.ts:244` and `:273` (rule load).

No `any`, `@ts-ignore`, or `@ts-expect-error` appears in any of the three files (verified by grep). `as unknown as` is also absent.

---

## 3. ADR Compliance Summary

| ADR | Verdict | Evidence |
|-----|---------|----------|
| **ADR-008** Brain merkezi import / one-way deps | ✅ PASS | `grep "from.*brain" src/orchestra/{task-router,rule-evolver,outcome-tracker}.ts` → 0 hits. Imports are confined to `../core/*`, `./outcome-tracker.js`, `./timeout-estimator.js`, `./event-stream.js`, and node `fs`/`path`. |
| **ADR-002** Node16 ESM `.js` extensions | ✅ PASS | All imports use `.js` extension (e.g. `'../core/types.js'`, `'./outcome-tracker.js'`). |
| **ADR-015** TaskRouter — 6-level routing | ⚠️ PARTIAL | 6 priority levels exist (✓), but JSDoc level 3 ("agent preferredProvider") does not match implementation (uses `task.provider` field instead). See F-1. |
| **ADR-024** sprint-controller god-object split | ✅ PASS | These three files do not re-introduce orchestration concerns; they remain pure routing/learning concerns. |
| **ADR-028** Decision-engine V1→V2 migration | ⚠️ PARTIAL | `routeTask` (V1 provider router) coexists with `routeTaskV2` (V2 agent/skill selector). They are complementary, not mutually exclusive. F-9 highlights a cross-module drift to `'v3'`. |
| **ADR-032** i18n Pattern System | ⚠️ MINOR | F-8 — Turkish string baked in to `getWorstCombinations()`. |
| **ADR-037/039** RBAC + self-modifying detection | ✅ PASS (out of file scope) | Neither file performs scope/RBAC operations; they only read/write under `.deckent/routing/` (allowed write target for orchestra modules). |

No P0 ADR violation observed in this audit.

---

## 4. Migration Triage

| File | Recommendation | Rationale |
|------|----------------|-----------|
| `src/orchestra/task-router.ts` | **KEEP-PRIVATE** | Sole external entry is `routeTask`, used internally by sprint-spawner. The public `emitTimeoutEvents` should be either wired or deleted (F-2), but the file overall is internal orchestration glue, not a public surface. |
| `src/orchestra/rule-evolver.ts` | **KEEP-PRIVATE** | Internal learning module. Re-exported from `src/orchestra/index.ts:100` but only consumed inside the same module via dynamic `import()` in `sprint-finalizer.ts:774`. Not part of the public deckent API. |
| `src/orchestra/outcome-tracker.ts` | **KEEP-PRIVATE** | Internal learning module. Re-exported from `src/orchestra/index.ts:96`; consumed by 5 internal sites (sprint-planner, sprint-finalizer, sprint-phases, mid-sprint-adapter, promotion-pipeline). Public API surface is `OutcomeTracker.recordOutcome / calculateBonuses / getLearnings / getWorstCombinations / getSynergyMatrix / saveEvolvedRules` — all callers are internal. |

No file is a delete-candidate; all three are actively used. No file should be promoted to public API in this state — fix F-1, F-2, F-3 first.

---

## 5. Recommendations (Sprint 162+ work)

Ordered by risk-adjusted impact:

1. **F-3 (P1) — Decide synergy rule semantics.** Either (a) emit symmetric rules for both pair members **and** populate `when` with the partner's presence (e.g. `when: { 'co_skills': partB }` with a matching condition operator), or (b) replace the `when: {}` rule with a learning-bonus channel routed through `outcome-tracker.calculateBonuses` rather than rule-evolver. Document the chosen path in an ADR amendment to ADR-015 or a new ADR.
2. **F-9 (P1) — Resolve V3 routing-engine drift.** Cross-coordinate with T-161-005. Either revert `routing-engine.ts:222` to `'v2'` (lowest-risk) or expand the `RoutingOutcome.routingVersion` union and persistence sites in this file.
3. **F-2 (P2) — Wire or delete `emitTimeoutEvents`.** If kept, call from `sprint-spawner.ts:521+` after `routeTask`. If deleted, remove the helper, the optional `timeoutSeconds` on `TaskRouting`, and the 5 tests in `tests/orchestra/event-stream-timeout.test.ts`.
4. **F-6 (P2) — Replace floating-point count reconstruction.** Add `successCount` and `failCount` to `SynergyEntry` and to `byIntent` records; mirror `:357-372`. Migration: backfill via the load-time backfill block at `:439-450`.
5. **F-7 (P2) — Document or fix agent vs skill sprint-recency asymmetry.** If intentional, add a comment at `:152-182`. If unintentional, add a parallel `agentSprintHistory` and recency computation.
6. **F-1 (P2) — Fix `routeTask` JSDoc.** Either implement actual agent `preferredProvider` lookup at priority 3, or rewrite the JSDoc to describe the `task.provider` field. Update CLAUDE.md / DECKENT.md ADR-015 narrative if the levels change.
7. **F-4 (P3) — Extract `confidence`/`score` formulas.** Replace 4 duplicated `Math.min(0.5 + n*0.04, 0.95)` sites with a `confidenceFromSamples(n)` helper in rule-evolver. Document why score multiplier is 8 for intent rules and 5 for synergy rules (or unify).
8. **F-8 (P3) — i18n the worst-combinations string.** Move the formatter into a planner-side template that respects ADR-032 i18n.
9. **F-10 (P3) — Tighten boundary `JSON.parse` casts.** Use `as unknown as T` or Zod schemas.
10. **F-5 (P3) — Comment the `code → null` mapping** in `TASK_TYPE_TO_ROUTING_KEY`.

---

## 6. Auditor Self-Verification (per ADR-035)

- READ-ONLY mandate honored — `git diff --stat` shows only this file under `docs/audits/sprint-161/` (single-path `scope.filesWrite` constraint observed).
- Source files unmodified — no edits to `src/orchestra/task-router.ts`, `rule-evolver.ts`, `outcome-tracker.ts`.
- Cross-checks performed: `grep` on every exported symbol; ADR-008 import-direction check; sibling-audit cross-link with T-161-005 (V3 routing).
- Test (`tsc --noEmit`, `vitest run`) — N/A per DIRECTIVES.md ("Test: N/A").
- Self-Modifying Task Detection (ADR-039) — file targeted is `docs/audits/sprint-161/...`, which is a documentation path; no `src/`, `.deckent/`, `.brain/`, `.github/`, or root-config writes performed.

End of report.
