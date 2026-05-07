# T-154-004 — Sprint Lifecycle Edge Audit (A4)

**Audit Pass:** sprint-154 comprehensive-pre-execute
**Mode:** STATIC (read + grep only — no runtime validation)
**Scope:** orchestra/ (lifecycle, evaluator, router, builder, retry, checkpoint), `.claude/rules/`, `.deckent/decisions/`, `tests/orchestra/`
**Auditor:** A4 sprint-lifecycle-edge
**Date:** 2026-05-07

---

## Executive Summary

13 findings across 5 P0 / 5 P1 / 3 P2. Three of the four expected findings (F1, F2, F4) are confirmed; F3 ("Wave 2 NO_GO için FIX retry tetiklenmedi") proved to be a deeper architectural issue — **`respawnEligibleTasks` and four other "fix/retry/cascade" exports are completely orphaned in production**, never wired into `runSprint`. The dependency-pipeline / wave-2 spawn mechanism, the cascade-block / unblock pipeline, and the `task-retry` retry scheduler are all dead in the live pipeline. Additional surprise: `evaluateWithRubric` (the function actually used in EVALUATE phase) does **not** invoke `reconcileSpuriousNoGo`, although the deprecated `evaluateResult` does.

| Sev | ID  | Title                                                                    |
|-----|-----|--------------------------------------------------------------------------|
| P0  | F1  | `forceModel` bypass — DIRECTIVES `Model: haiku` ignores `haiku_allowed=false` |
| P0  | F2  | FIX phase timeout default 600 000 ms (10 min) too short — Sprint 152/153 evidence |
| P0  | F3  | `respawnEligibleTasks` (Wave-2 dep-pipeline spawn) has zero production callers — dead wire |
| P0  | F5  | `evaluateWithRubric` skips `reconcileSpuriousNoGo` — TIMEOUT_WITH_WORK is mis-evaluated in live EVALUATE phase |
| P0  | F11 | `applyCascadeToSprint` / `applyUnblockToSprint` never invoked — cascade/unblock pipeline dead |
| P1  | F4  | Sprint reporter total-count drift — `evaluations.size` is overwritten by FIX-phase loop, breaking metrics |
| P1  | F6  | `task-retry.ts` (`createRetryTask`, `shouldRetry`, `getRetryDelay`) has zero production callers |
| P1  | F7  | `isSourceCodeDir` / `isDocTask` duplicated in `result-evaluator.ts` and `sprint-utils.ts` (drift risk) |
| P1  | F8  | `.claude/rules/{brain,auditor,worker-default}.md` content duplicated 2× per file (auto-regen append bug) |
| P1  | F9  | DIRECTIVES.md states "22 SDL files" but `.deckent/decisions/` is empty — doc drift / abandoned subsystem |
| P2  | F10 | Synthetic NO_GO from EVALUATE timeout has empty `filesChanged` — never re-checked against on-disk `.result` |
| P2  | F12 | FIX phase only re-evaluates priority-fix tasks — original task evaluations are not re-derived from fix outcome (writes-through to `evaluations.set(fixForTaskId, fixEval)` only when not NO_GO) |
| P2  | F13 | `inferTier` skill upgrade can re-elevate forceModel-overridden tier (no precedence enforcement) |

---

## F1 [P0] forceModel tier-clamp bypass — `haiku_allowed=false` silently ignored

**Files:**
- `src/orchestra/model-selector.ts:202-282` — `resolveTaskModel`
- `src/orchestra/task-router.ts:195-209` — `routeTask` priority 2 (forceModel)
- `src/orchestra/task-builder.ts:472-476`, `255` — DIRECTIVES `Model:` parse + `createTask` write-through
- `src/orchestra/sprint-planner.ts:316`, `332` — `resolveTaskModel(..., src.forceModel)` and createTask call
- `src/core/config.ts:777-784` — `haiku_allowed` → `min_tier` migration (only applied when `min_tier` undefined)

**Symptom:** A user setting `haiku_allowed: false` (or `min_tier: 'standard'`) in config expects haiku-tier tasks to be promoted at minimum to `sonnet`. But when DIRECTIVES.md specifies `Model: haiku` (parsed into `forceModel='haiku'`), this clamp is **bypassed completely**.

**Forensic chain:**

1. `task-builder.ts:472-476`: parser accepts `haiku` if listed in `ALL_MODELS`. No tier check against config.
   ```ts
   const parsedForceModel = (forceModel && (ALL_MODELS as readonly string[]).includes(forceModel) ? forceModel : undefined) as ModelType | undefined;
   ```
2. `sprint-planner.ts:316` calls `resolveTaskModel(..., src.forceModel)`.
3. `model-selector.ts:215-221`: when `forceModel` is set, the function **returns immediately** before reaching the Layer 1b `min_tier` enforcement at lines 267-271.
   ```ts
   // Layer 0: user override from DIRECTIVES.md — bypasses all auto-selection
   if (forceModel) {
     if (!isModelAvailable(forceModel, targetProvider)) {
       return getEquivalentModel(forceModel, targetProvider);
     }
     return forceModel;   // ← never reaches the min_tier clamp at line 268
   }
   ```
4. `task-router.ts:195-209`: when routing the task, `forceModel` is again used to *infer provider*, with no tier validation.

**Impact:** Beta GA Gate #X — declared "haiku_allowed:false enforced" guarantee is false. Users hitting `Model: haiku` directive lines silently downgrade despite plan-level prohibition (KNOWN_ISSUES P1, confirmed alive).

**Fix sketch:** Move Layer 1b min_tier enforcement above the early-return — or wrap `forceModel` through a `clampToMinTier(forceModel, config)` helper that returns the tier-promoted equivalent when `getModelTier(forceModel) < TIER_RANK[minTier]`.

---

## F2 [P0] FIX phase timeout default 600 000 ms (10 min) too short

**Files:**
- `src/orchestra/sprint-phases.ts:554-556` (single call site)
- `src/orchestra/sprint-controller.ts:198` (interface field)

**Code:**
```ts
const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
  ?? opts?.fixPhaseTimeoutMs
  ?? 600_000;   // 10 minutes
```

**Symptom:** Sprint 152 audit logged opus FIX workers exceeding 10 min budget → `TIMEOUT_WITH_WORK` synthetic results → cascade NO_GO. Sprint 153 DIRECTIVES Task 5 promised default `1800` (30 min). Code still 600 000 ms.

**Impact:** Beta GA Gate #X — FIX phase reliability. P0 because real opus fix tasks empirically need ≥ 20 min; current default kills mid-flight.

**Fix sketch:** Change `600_000` → `1_800_000`. Add `fix_phase_timeout_seconds` config key in `config-types.ts` with explicit unit-naming. Update `tests/orchestra/fix-phase.test.ts` to assert default.

**Related:** Sprint 153 DIRECTIVES Task 5 also asks for `fix_phase_timeout_seconds` config key; current code only reads `fix_phase_timeout` (ms, untyped). Still pending.

---

## F3 [P0] `respawnEligibleTasks` is dead — dependency-pipeline Wave 2 spawn never fires

**Files:**
- `src/orchestra/sprint-spawner.ts:361-495` — function body
- `src/orchestra/sprint-controller.ts:130` — re-export only
- All tests: `tests/orchestra/dependency-pipeline.test.ts`, `tests/orchestra/brain-rollback.test.ts:208` (mock only)

**Forensic search:**
```
grep -rn "respawnEligible" src/
src/orchestra/sprint-spawner.ts:361:export async function respawnEligibleTasks(...)  ← definition
src/orchestra/sprint-controller.ts:130:export { spawnWorkers, respawnEligibleTasks, ... } from './sprint-spawner.js'  ← re-export
# No other production callers.
```

**Symptom:** When `config.dependency_pipeline_enabled === true`, only Wave 1 (`eligibleTasks.slice(0, maxWorkers)` at `sprint-spawner.ts:229`) is spawned. Wave 2 (tasks whose dependencies become DONE during EXECUTE) **never fires**, because no code path invokes `respawnEligibleTasks`. The result-collector `processQueue` (line 268) is the actual queue mechanism, but it spawns from the in-memory `remainingQueue` Task[] passed to `waitForResults` — **with no dependency awareness** (it just shifts the next pending task).

**Why no one noticed:**
- `processQueue` works "well enough" for sprints with no dependencies — it spawns next slot when a worker finishes.
- For sprints WITH dependencies, the dep-pipeline guard at `sprint-spawner.ts:220-228` excludes blocked tasks from `activeTasks`/`queuedTasks` at SPAWN time. The guard then never re-runs, so blocked tasks remain PENDING → at EVALUATE phase, they receive synthetic NO_GO from `runEvaluatePhase:411-423` (timeout branch).

**Impact:** This is the "F3 expected finding" the auditor task pre-flagged — **partially confirmed**: Wave 2 fix retry doesn't trigger because Wave 2 itself doesn't trigger. Plus: cascade-block / unblock pipeline (F11) is also dead. The Sprint 139 Task 028 "chain dependency scheduler bootstrap" infrastructure exists but is unwired.

**Fix sketch:** Insert `await respawnEligibleTasks(projectRoot, sprint, config, { spawnBackend })` inside the `result-collector.ts:processQueue` loop (after `collectResults`), so each completed task triggers a dep-graph re-evaluation. Alternatively, integrate into `result-watcher` event hook.

**Test gap:** `tests/orchestra/dependency-pipeline.test.ts:432-572` tests `respawnEligibleTasks` in isolation — never via `runSprint` end-to-end. No integration test catches the unwired-state regression.

---

## F4 [P1] Sprint reporter total-count drift — `evaluations.size` over-counts

**Files:**
- `src/orchestra/sprint-metrics.ts:104` — `const totalTasks = evaluations.size`
- `src/orchestra/sprint-phases.ts:564,569-570` — FIX phase writes `evaluations.set(fixTask.id, fixEval)` AND `evaluations.set(fixTask.fixForTaskId, fixEval)`

**Symptom:** Sprint 153 FIX phase wrote 6 fix workers. Each fix-task evaluation is set twice in the `evaluations` Map: once under `fixTask.id` (e.g. `153-008-fix`), once under `fixTask.fixForTaskId` (e.g. `153-008` — overwriting). Net effect: `evaluations.size = N + (#fixTasks)` because each `-fix` ID adds a new entry in addition to the original.

For Sprint 154 the dogfood expectation was Total Tasks = 11; reporter showed 6 — the **opposite** drift. This indicates a different bug: when synthetic-NO_GO timeout entries are added with the SAME taskId as real entries (`runEvaluatePhase:412`), they overwrite. Combined with the dep-pipeline F3 (Wave 2 never spawns), Wave 2 tasks get synthetic NO_GO — which counts. So the 6/11 anomaly likely stems from a different upstream — possibly only Wave 1 was iterated due to mid-sprint abort.

**Impact:** Reporter and dashboard `progress.total` show wrong counts. Brain self-audit gates (Sprint 134 T-014) feed off these numbers.

**Fix sketch:** Use `sprint.tasks.filter(t => !t.isPriorityFix && !t.id.endsWith('-fix') && !t.id.endsWith('-xfix')).length` as authoritative total. Remove FIX phase's double `evaluations.set`; instead store a separate `fixOutcomes` Map.

---

## F5 [P0] `evaluateWithRubric` does not reconcile spurious NO_GO / TIMEOUT_WITH_WORK

**Files:**
- `src/orchestra/result-evaluator.ts:707-778` — `evaluateWithRubric` (used by EVALUATE phase via `sprint-phases.ts:336`)
- `src/orchestra/result-evaluator.ts:85-111` — `evaluateResult` (deprecated; DOES call `reconcileSpuriousNoGo`)
- `src/orchestra/result-evaluator.ts:565-571` — `scoreCorrectness` returns score=10 for TIMEOUT_WITH_WORK
- `src/orchestra/mid-sprint-adapter.ts:338` — `reconcileSpuriousNoGo`

**Symptom:**
- The deprecated `evaluateResult` calls `reconcileSpuriousNoGo` at lines 90 (TIMEOUT_WITH_WORK branch) and 104 (NO_GO branch).
- The actual EVALUATE phase uses `evaluateWithRubric` (`sprint-phases.ts:336`).
- `evaluateWithRubric` only checks schema (D-2) and verification-task fast-path (D-1), then runs rubric scoring directly.
- TIMEOUT_WITH_WORK results score correctness=10 (out of 100, weight 0.4 → contributes ≤ 4 to total). With test_coverage=0 and other low scores, total < `passingScore * 0.7` → **NO_GO**.
- The reconciler that would inspect git-diff and recover partial work is **never invoked in the production EVALUATE pipeline**.

**Impact:** Sprint 145 lesson ("recover partial work from TIMEOUT_WITH_WORK") was implemented but only in deprecated code path. Live sprints with worker timeouts produce false NO_GO with no reconciliation.

**Fix sketch:** Inside `evaluateWithRubric`, after schema validation and verification-task check, when `result.selfAssessment === 'TIMEOUT_WITH_WORK'` (or rubric decision === NO_GO + selfAssessment === NO_GO), call `reconcileSpuriousNoGo(result, task, projectRoot)` and override the decision when `reconciled.decision === 'GO_WITH_TECH_DEBT'`. Note: `evaluateWithRubric` currently does not receive `projectRoot` — signature change required.

---

## F6 [P1] `task-retry.ts` is dead code

**Files:**
- `src/orchestra/task-retry.ts:34-80` — `shouldRetry`, `getRetryDelay`, `getRetryCount`, `createRetryTask`
- Zero production callers (verified via grep across `src/`).

**Symptom:** A complete retry-task scheduler with backoff, retry counts, and `-r1`/`-r2` ID suffixing exists but nothing calls it. The actual retry mechanism is `handleEvaluation` (debt-manager.ts:145) which creates `task-{id}-fix.json` once per NO_GO, and `runFixPhase` runs that fix once. There is no exponential backoff, no max-retry cap honored against this module, no `-r1` retries.

**Impact:** Dead module ~80 LoC. Misleading future developer who searches for "retry" expecting it to be the live mechanism. ADR-038 dead-code disposition applies.

**Fix sketch:** Either (a) delete `src/orchestra/task-retry.ts` and its tests, or (b) wire `shouldRetry` + `createRetryTask` into `runFixPhase` for genuine retry-with-backoff (different lifecycle than priority-fix tasks).

---

## F7 [P1] `isSourceCodeDir` / `isDocTask` duplicated across modules

**Files:**
- `src/orchestra/result-evaluator.ts:21-24,56-60` — local copy
- `src/orchestra/sprint-utils.ts:62-75` — exported copy

Both implementations are byte-identical. `sprint-utils.ts` exports them publicly; `result-evaluator.ts` defines them as module-local. `result-evaluator.ts` does **not** import from `sprint-utils.ts` for these.

**Impact:** If one is updated (e.g. add `lib/` variant or new framework dir), the other drifts. Bug surface for verification-task false-positives.

**Fix sketch:** Delete duplicates in `result-evaluator.ts:21-24,56-60`; import `isSourceCodeDir`, `isDocTask` from `sprint-utils.js`.

---

## F8 [P1] `.claude/rules/*.md` content duplicated within each file

**Files:**
- `.claude/rules/brain.md` — `# Brain Rules` heading appears 2× (line 4 and ~line 77)
- `.claude/rules/auditor.md` — `# Auditor Rules` heading appears 2×
- `.claude/rules/worker-default.md` — `# Worker Rules` heading appears 2×

Verified via:
```
grep -c "^# Brain Rules\|^# Auditor Rules\|^# Worker Rules" .claude/rules/*.md
auditor.md:2  brain.md:2  worker-default.md:2
```

The duplicate is the same content with the front-matter `paths:` array (slightly different formatting — quoted vs unquoted strings). Likely an `<!-- AUTO-START -->` section regenerator that appends instead of overwriting.

**Impact:** Front-matter parsers (Claude Code rule loader) may take only the first block, but the doubled rule list is loaded into context twice → wasted tokens + confusion.

**Fix sketch:** Find the AUTO-START regen script (likely under `src/orchestra/sprint-docs-updater.ts` or `doc-updaters/`) and ensure it writes once. Manual cleanup of current files needed.

---

## F9 [P1] `.deckent/decisions/` empty despite DIRECTIVES claim of "22 SDL files"

**Files:**
- `.deckent/decisions/` — empty directory (0 files)
- DIRECTIVES.md scope description references "22 SDL files"
- `src/orchestra/decision-logger.ts` (presumed writer) — to be verified

**Symptom:** Either the SDL writer is not running, or files are being deleted by sprint cleanup. Either way, the audit-trail subsystem promised by ADR is not producing output.

**Impact:** Decision audit trail unavailable for retro / debugging. Documentation references files that don't exist.

**Fix sketch:** Either remove SDL references from DIRECTIVES/docs, or restore the SDL writer integration. Out of A4 scope to fix — flag for triage.

---

## F10 [P2] Synthetic NO_GO from EVALUATE timeout never re-checks disk

**Files:**
- `src/orchestra/sprint-phases.ts:411-423` — synthetic NO_GO when `!collectedIds.has(task.id)`
- Compare: `src/orchestra/sprint-controller.ts:454-465` — post-collect sweep DOES re-read late `.result` files

**Symptom:** `runEvaluatePhase:411` constructs a synthetic NO_GO without re-reading `task-{id}.result` from disk. The post-collect sweep at `sprint-controller.ts:454` only runs before the grace period — there's no second sweep right before `runEvaluatePhase`. So if a worker writes its result during the grace period but before EVALUATE's iteration of that task, it can be missed.

**Impact:** Edge race condition. Worker writes `.result` between `waitForResults` exit and `runEvaluatePhase` reading. With ~5 min grace period, the window is small but non-zero.

**Fix sketch:** Inside the `else` branch of `runEvaluatePhase:410`, attempt a final `readJsonSafe` on the `.result` path before falling back to synthetic. Reuse the post-collect sweep helper.

---

## F11 [P0] Cascade-block / unblock pipeline is dead

**Files:**
- `src/orchestra/sprint-spawner.ts:681-725` — `applyCascadeToSprint`
- `src/orchestra/sprint-spawner.ts:739-774` — `applyUnblockToSprint`
- Zero production callers (verified via grep).

**Symptom:** Sprint 139 Task 029 implemented dependency cascade blocking (CODE-failure NO_GO transitions PENDING dependents → PAUSED) and unblock-on-fix (DONE resolution releases PAUSED dependents). The functions exist, write events to the event stream, and are tested in isolation — but `runSprint` never calls them.

When a NO_GO task has dependents, those dependents continue executing (or are spawned by `processQueue`) without knowing the dependency failed. The dependents then NO_GO themselves with dep-related errors.

**Impact:** Failure cascades waste worker time + tokens. Sprint 139's own dogfood evidence ("Wave 1 Early Wire Bootstrap") presumably tested the building blocks but not end-to-end wire.

**Fix sketch:** Inside `runEvaluatePhase`, after `handleEvaluation(...) → NO_GO`, call `applyCascadeToSprint(projectRoot, sprint, task.id, ctx)`. Inside `runFixPhase`, after fix succeeds (`fixEval !== NO_GO`), call `applyUnblockToSprint(projectRoot, sprint, fixTask.fixForTaskId)`.

---

## F12 [P2] FIX phase only writes back DONE/TECH_DEBT — NO_GO outcomes leak

**Files:**
- `src/orchestra/sprint-phases.ts:569-570`

**Code:**
```ts
if (fixTask.fixForTaskId && fixEval !== TaskEvaluation.NO_GO && evaluations.has(fixTask.fixForTaskId)) {
  evaluations.set(fixTask.fixForTaskId, fixEval);
}
```

**Symptom:** When a fix worker also fails (`fixEval === NO_GO`), the original task's evaluation is NOT updated. The original task remains marked NO_GO (correct), but the fact that the fix attempt also failed isn't reflected in the original's evaluation state. Only the fix-task's separate entry (`evaluations.set(fixTask.id, fixEval)` at line 564) records this.

**Impact:** Reporter / retro can't distinguish "NO_GO with fix succeeded" from "NO_GO with fix also NO_GO" without joining on `fixTask.fixForTaskId`. Audit trail OK but cumbersome.

**Fix sketch:** Maintain a separate `fixOutcomes: Map<string, TaskEvaluation>` and let reporter join.

---

## F13 [P2] Skill model preference can re-elevate forceModel-overridden tier

**Files:**
- `src/orchestra/model-selector.ts:215-243`

**Symptom:** Lines 215-221 short-circuit on `forceModel`. Lines 234-243 (skill model preference) only run if `forceModel` is undefined — so this isn't a bug per se, but the comment "Layer 0: ... bypasses all auto-selection" is misleading because Layer 1b (min_tier) is also bypassed (cf. F1). The mental model of "layers" doesn't match the code.

**Impact:** Documentation drift. Future bug-fixers might mis-place new layers.

**Fix sketch:** Rename comment to "Layer 0: forceModel — short-circuits all subsequent layers (including min_tier — see F1)". Or restructure so that forceModel goes through min_tier clamp.

---

## Files Audited

| File                                              | Status   | Notes                                       |
|---------------------------------------------------|----------|---------------------------------------------|
| `src/orchestra/sprint-controller.ts`              | OK       | Phase orchestration sound; F11 wire missing |
| `src/orchestra/sprint-phases.ts`                  | F2,F4,F10,F12 |                                       |
| `src/orchestra/sprint-spawner.ts`                 | F3,F11   | dead exports                                 |
| `src/orchestra/result-evaluator.ts`               | F5,F7    |                                             |
| `src/orchestra/result-collector.ts`               | OK       | processQueue is dep-blind but functional    |
| `src/orchestra/quality-assessor.ts`               | OK       | wired via sprint-finalizer / retro-writer   |
| `src/orchestra/mid-sprint-adapter.ts`             | OK       | `reconcileSpuriousNoGo` is sound — just unwired (F5) |
| `src/orchestra/task-builder.ts`                   | F1       |                                             |
| `src/orchestra/task-router.ts`                    | F1       |                                             |
| `src/orchestra/task-retry.ts`                     | F6       | dead module                                 |
| `src/orchestra/outcome-tracker.ts`                | OK       | not deeply audited (out of scope hot path)  |
| `src/orchestra/rule-evolver.ts`                   | OK       | (light pass)                                |
| `src/orchestra/sprint-utils.ts`                   | F7       |                                             |
| `src/orchestra/sprint-reporter.ts`                | F4       |                                             |
| `src/orchestra/sprint-metrics.ts`                 | F4       |                                             |
| `src/orchestra/sprint-checkpoint.ts`              | OK       | resume API at sprint-lifecycle.ts:462 sound |
| `src/orchestra/sprint-lifecycle.ts`               | OK       | resumeSprint() works                        |
| `src/orchestra/debt-manager.ts`                   | OK       | NO_GO → fix task creation correct           |
| `src/orchestra/model-selector.ts`                 | F1,F13   |                                             |
| `src/orchestra/sprint-planner.ts`                 | F1       |                                             |
| `src/orchestra/sprint-finalizer.ts`               | OK       | uses metrics.totalTasks (which is buggy F4) |
| `.claude/rules/brain.md`                          | F8       |                                             |
| `.claude/rules/auditor.md`                        | F8       |                                             |
| `.claude/rules/worker-default.md`                 | F8       |                                             |
| `.deckent/decisions/`                             | F9       | empty directory                             |
| `tests/orchestra/dependency-pipeline.test.ts`     | OK (test) | tests `respawnEligibleTasks` in isolation; integration gap |
| `tests/orchestra/fix-phase.test.ts`               | OK (test) | does not assert default 1800s post-fix      |

160 test files in `tests/orchestra/` total — only spot-checked dependency-pipeline + fix-phase + sprint-spawner. Recommend a follow-up coverage check ensuring `respawnEligibleTasks` and `applyCascadeToSprint` end-to-end integration is not silently skipped.

---

## Cross-Reference With Expected Findings

| Pre-flagged | Confirmed? | Mapped Finding(s) |
|-------------|-----------|-------------------|
| F1 forceModel tier-clamp bypass            | Yes      | F1 (P0) |
| F2 FIX phase 600s timeout                  | Yes      | F2 (P0) — note 600 000 ms not 600 s |
| F3 Wave 2 NO_GO no FIX retry               | Yes — deeper | F3 (P0 — root: respawnEligibleTasks dead) |
| F4 Total Tasks=6 wrong (actual 11)         | Partially confirmed | F4 (P1) — eval set + dep-pipeline F3 likely upstream cause |

Plus 9 newly discovered findings (F5–F13).

---

## Severity Distribution

| Severity | Count | Findings |
|----------|-------|----------|
| P0       | 5     | F1, F2, F3, F5, F11 |
| P1       | 5     | F4, F6, F7, F8, F9 |
| P2       | 3     | F10, F12, F13 |

---

## Recommended Triage Order

1. **F2** (P0, 1-line change, immediate user-visible win) — bump default to 1 800 000 ms.
2. **F1** (P0, ~10 lines, security/contract issue) — wrap forceModel through min_tier clamp.
3. **F5** (P0, ~20 lines, signature change) — wire `reconcileSpuriousNoGo` into `evaluateWithRubric`.
4. **F3 + F11** (P0 each, deeper plumbing) — wire `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint` from `runEvaluatePhase` / `result-collector`. Should be addressed together as they share the dep-graph plumbing.
5. **F4** (P1) — fix `evaluations.size` semantics, prune fix-IDs from totalTasks.
6. **F6 + F8 + F9** (P1 housekeeping) — delete dead module / dedupe rules / decide on SDL.
7. **F7** (P1) — single-source `isSourceCodeDir`.
8. **F10, F12, F13** (P2 polish).

No P0 findings are blocked on cross-team approval; all are local fixes within `src/orchestra/`.
