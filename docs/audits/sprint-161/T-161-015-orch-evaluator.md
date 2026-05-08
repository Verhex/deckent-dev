# T-161-015 — `src/orchestra/` evaluator + quality assessor audit

**Sprint:** 161 (Lane 1, READ-ONLY)
**Auditor:** doc-writer / opus
**Date:** 2026-05-08
**Mode:** static, no source-code changes

---

## 1. Scope

| File | LoC | Role |
|------|----:|------|
| `src/orchestra/result-evaluator.ts` | 1399 | Pure evaluation: rubric scoring, schema validation, verification fast-path, failure classification, fallback evaluation, token-usage validation, honesty checks |
| `src/orchestra/quality-assessor.ts` | 145 | Multi-dimensional quality scoring (correctness, coverage, scopeAdherence, completeness) + skill relevance |
| **Total** | **1544** | within Sprint 161 task budget (≤8 files, ≤2000 LoC) |

Cross-referenced (read-only, not in scope.filesWrite): `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-finalizer.ts`, `src/orchestra/sprint-retro-writer.ts`, `src/orchestra/sprint-metrics.ts`, `src/cli/commands/finalize.ts`, and the test files under `tests/orchestra/`.

---

## 2. Findings

### 2.1 P0 — Dual `evaluateResult()` implementations with divergent semantics (drift + conflicting areas)

**Evidence**

- `src/orchestra/result-evaluator.ts:87` — `export function evaluateResult(result, task, vitestJsonOutput?, coverageThreshold=90, projectRoot?)` with rich logic: TIMEOUT_WITH_WORK reconciliation, isBashUnavailable tolerance, schema-aware behaviour, hasNewTests heuristic, goNogo criteria validation, and an explicit "Brain makes the final call — worker selfAssessment is just a HINT" docstring on lines 67–86.
- `src/orchestra/sprint-controller.ts:246` — `export function evaluateResult(result, task, vitestJsonOutput?, coverageThreshold=90)` re-implements a far simpler version: it returns `NO_GO`/`GO_WITH_TECH_DEBT` directly from worker `selfAssessment` (lines 249–250), missing every Sprint 138/145/151/152 enhancement.
- `src/orchestra/brain.ts:21` re-exports `evaluateResult` from `sprint-controller.js`, **not** from `result-evaluator.js`. So the public Brain barrel surfaces the *simpler* version.
- `src/cli/commands/finalize.ts:8` — `import { evaluateResult } from '../../orchestra/sprint-controller.js'` — the docstring claim on `result-evaluator.ts:84-85` ("retained only for backward compatibility with CLI finalize command") is factually wrong; finalize never uses the rich one.
- `src/orchestra/sprint-controller.ts:364–368` — `defaultReevaluate` (used for fallback retries) calls the simpler local `evaluateResult`, **not** `evaluateWithRubric`, citing a non-existent "import cycle". `sprint-phases.ts:82` already statically imports `evaluateWithRubric` from the same module — no cycle exists.

**Impact**

- Verification tasks (Sprint 152.5 `isVerificationTask` fast-path) are correctly handled by the live EVALUATE path (`sprint-phases.ts:360 → evaluateWithRubric`) but **not** by the FIX-fallback path (`sprint-controller.ts:368 → simpler evaluateResult`).
- `tests/orchestra/evaluator-consistency.test.ts:119–135` enforces "sprint-phases.ts must NOT import evaluateResult", but no equivalent guard exists for `sprint-controller.ts:368` — that path silently regresses to the simpler logic.
- The `@deprecated` JSDoc on `result-evaluator.ts:82–86` documents intent ("retained only for backward compatibility with CLI finalize command") that the code base contradicts. Either the docstring or the import in `finalize.ts` is wrong.

**Severity** P0 (silent semantic drift between two evaluators in the same critical path).

---

### 2.2 P0 — `applyTechDebtDowngrade()` is the second layer of "Honest Assessment Calibration v2" but is never called from `src/`

**Evidence**

- `src/orchestra/result-evaluator.ts:823` defines `applyTechDebtDowngrade()` (TECH_DEBT_DOWNGRADE_DONE_THRESHOLD=0.8, TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD=0.5).
- `grep -rn "applyTechDebtDowngrade" src/` returns exactly one match — its definition. No other production module calls it.
- Workers DO produce `task-NNN.verify-delta.json` files via `src/agents/worker-lifecycle.ts:342, 372`, but no Brain-side code reads those files and feeds the completion ratio into `applyTechDebtDowngrade`.
- Tests cover the function in isolation: `tests/orchestra/result-evaluator.test.ts:1196–1242`. Green tests + zero runtime callers.
- Documentation broadcasts this as a flagship feature:
  - `DECKENT-ANA-PLAN-TR.md:567` — "applyTechDebtDowngrade çift katman (Sprint 138 Task 8)"
  - `DECKENT-MASTER-BLUEPRINT.md:646` — "applyTechDebtDowngrade() automatically downgrades DONE→GO_WITH_TECH_DEBT when delta is insufficient"
  - `.deckent/workspace/IDENTITY.md` (Project Identity claim) — "Worker Honest Assessment Calibration v2 ... applyTechDebtDowngrade çift katman"

**Impact**

The "second layer" promised by Sprint 138 / IDENTITY claims is dormant. Workers self-claim DONE while their `verify-delta.json` may show <50% completion, and Brain has no path that downgrades that result. Sprint 137 dogfood evidence cited in the docstring (`result-evaluator.ts:816–817` — "worker claimed DONE but only 39% functional") describes exactly the regression this function was meant to catch — but it cannot catch it, because nothing invokes it.

**Severity** P0 (claimed feature absent from runtime).

---

### 2.3 P1 — Several Sprint 138/139/151 helpers are dead at runtime (defined + tested + never wired)

**Evidence**

| Symbol | Defined at | Production callers in `src/` | Test coverage |
|--------|-----------|------------------------------|---------------|
| `applyTechDebtDowngrade` | `result-evaluator.ts:823` | 0 | yes (1196–1242) |
| `validateTokenUsage` | `result-evaluator.ts:901` | 0 | yes (1265–1352) |
| `aggregateTokenUsage` | `result-evaluator.ts:416` | 0 | yes (in `result-evaluator.test.ts`) |
| `buildEnrichedFixReason` | `result-evaluator.ts:1265` | 0 | yes (`evaluator-fix-context.test.ts`) |
| `checkVerifyMarkerHonesty` | `result-evaluator.ts:1214` | 0 | unverified (no direct test grep hit) |
| `HONESTY_VIOLATION_NO_VERIFY_MARKER` (constant) | `result-evaluator.ts:1194` | 0 | n/a |
| `HONESTY_VIOLATION` (constant) | `result-evaluator.ts:944` | 2 (`baseline-tracker.ts:212, 269`) | indirect |
| `isVerificationTask` | `result-evaluator.ts:468` | 0 *direct*; **transitively used inside `evaluateWithRubric:732`** | yes |
| `validateResultSchema` | `result-evaluator.ts:504` | 0 *direct*; **transitively used inside `evaluateWithRubric:715`** | yes |

`grep -rn "applyTechDebtDowngrade\|validateTokenUsage\|aggregateTokenUsage\|buildEnrichedFixReason\|checkVerifyMarkerHonesty" --include='*.ts' src/` only returns hits inside `result-evaluator.ts` itself.

`aggregateTokenUsage` is also a duplicated implementation: `src/core/cost-calculator.ts:260, 308, 395` and `src/nervous/detectors/token-spike.ts:73-90` both perform their own token aggregation over results, ignoring `aggregateTokenUsage`.

**Impact**

- Sprint 139 "tokenUsage soft warnings → Sprint 140 hard NO_GO" enforcement (`result-evaluator.ts:888–935` JSDoc) is impossible because `validateTokenUsage` is never called.
- Sprint 151 D-3 "FIX worker enriched reason" (`result-evaluator.ts:1255–1288`) never reaches FIX workers — they receive whatever generic reason `sprint-phases.ts` builds.
- `HONESTY_VIOLATION_NO_VERIFY_MARKER` constant exists for sprint-reporter to annotate tasks, but no consumer references it.

**Severity** P1 (silent feature dormancy, masquerading as covered code).

---

### 2.4 P1 — Retro counter bug (Sprint 160 finding) localised in `sprint-metrics.ts`, NOT in this audit's files

**Evidence**

The lead question for this task asks about the "retro counter bug (Sprint 160 finding)." Sprint 160's RETRO.md (`/.brain/RETRO.md`) shows:

```
## Summary
Completed 0/2 tasks in 17 minutes 24s.

## Highlights
- 2 tasks completed on first try
```

The "2 tasks completed on first try" claim contradicts Summary's "0/2". Tracing the source:

- `src/orchestra/sprint-retro-writer.ts:256` — `const firstTry = countFirstTryTasks(results)`
- `src/orchestra/sprint-retro-writer.ts:258` — `items.push(\`${firstTry} task${firstTry !== 1 ? 's' : ''} completed on first try\`)`
- `src/orchestra/sprint-metrics.ts:313–321` — `countFirstTryTasks` filters using `r.selfAssessment` (the *worker's* claim), only excluding `'NO_GO'`. Sprint 160 worker for `160-002` self-assessed as `'DONE'` despite Brain evaluating NO_GO (gate failure: 2 failing tests). Worker `160-001` self-assessed as `'GO_WITH_TECH_DEBT'`. Both pass the `selfAssessment !== 'NO_GO'` filter ⇒ count = 2, even though Brain's evaluations were both NO_GO.

A second related defect is in scope-adjacent code (out of this task's filesWrite, but in the same file family):

- `src/orchestra/sprint-retro-writer.ts:229` — `const evaluation = result.evaluationDecision ?? result.selfAssessment ?? 'DONE'` — when populating the *Quality Dimensions* table by re-calling `assessQuality` (line 230). For Sprint 160 task 160-002 the table reports Correctness=100, Completeness=100, Overall=75, which only happens for `evaluation === 'DONE'`. This means the retro displays the worker's optimistic rubric, not Brain's actual rubric.

**Impact on the audited files**

`result-evaluator.ts` and `quality-assessor.ts` themselves are correct: `assessCompleteness` (`quality-assessor.ts:98–105`) and `evaluateWithRubric` (`result-evaluator.ts:709`) both return the correct value when given the correct evaluation string. The bug is at the consumer boundary: `sprint-retro-writer.ts:229` and `sprint-metrics.ts:countFirstTryTasks` pass `selfAssessment` instead of Brain's evaluation. The audited files cannot self-defend against this misuse.

**Recommendation** (Sprint 162+): tighten `assessQuality(task, result, evaluation)` to require `evaluation: TaskEvaluation` enum (not `string`), so `quality-assessor.ts:28` cannot accept an arbitrary worker hint as evaluation.

**Severity** P1 (bug is real and visible in production retros, but root cause is outside scope.filesWrite).

---

### 2.5 P1 — `quality-assessor.ts` evaluation parameter typed as plain `string` (type-safety weakening)

**Evidence**

- `src/orchestra/quality-assessor.ts:28` — `evaluation: string, // 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'`
- `src/orchestra/sprint-finalizer.ts:753` — `assessQuality(task, taskResult, evaluation as unknown as string)` (cast through `unknown`).
- `src/orchestra/sprint-retro-writer.ts:229–230` — `const evaluation = result.evaluationDecision ?? result.selfAssessment ?? 'DONE'` then `assessQuality(task, result, evaluation)` — passes whatever string happens to be there.

The `string` typing forces TypeScript to accept any string value, and forces callers like `sprint-finalizer` to do `as unknown as string` casts on `TaskEvaluation` enum values. Both the type weakening and the cast indicate the API is mis-typed.

**Recommendation** (Sprint 162+): change to `evaluation: TaskEvaluation | 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'` (or just `TaskEvaluation`). This eliminates `as unknown as string` and prevents bug 2.4 by construction.

**Severity** P1 (type weakness directly enables 2.4).

---

### 2.6 P1 — `AUXILIARY_DIR_PREFIXES` duplicated in two files (drift risk acknowledged but not fixed)

**Evidence**

- `src/orchestra/quality-assessor.ts:65–70`:
  ```
  /**
   * Sprint 151 D-5: Mirrors AUXILIARY_DIR_PREFIXES in result-evaluator.ts.
   */
  const QA_AUXILIARY_PREFIXES = ['docs/', '.deckent/', '.tasks/', '.brain/', 'CHANGELOG', 'README'];
  ```
- `src/orchestra/result-evaluator.ts:611–618`:
  ```
  const AUXILIARY_DIR_PREFIXES = [
    'docs/', '.deckent/', '.tasks/', '.brain/', 'CHANGELOG', 'README',
  ];
  ```

The author already noticed the duplication ("Mirrors AUXILIARY_DIR_PREFIXES in result-evaluator.ts") but chose to mirror rather than centralise. If one list is updated, the other will silently diverge.

**Recommendation** (Sprint 162+): hoist to `src/core/constants.ts` and import in both files.

**Severity** P1 (small drift surface, but pre-acknowledged debt).

---

### 2.7 P2 — `@deprecated` docstring on `result-evaluator.ts:82-86` is factually wrong

**Evidence**

The docstring states: *"This function is retained only for backward compatibility with CLI finalize command."* But `src/cli/commands/finalize.ts:8` imports `evaluateResult` from `sprint-controller.js`, **not** from `result-evaluator.js`. After tracing every import in `src/`, no production module reaches the deprecated `evaluateResult` in `result-evaluator.ts:87`. Only tests do (`tests/docker/timeout-with-work.test.ts:18`, `tests/orchestra/spurious-nogo.test.ts:11`, `tests/orchestra/result-evaluator.test.ts:21`).

**Impact** Reader is misled into thinking the function is exercised on the CLI finalize path. It is not.

**Recommendation** (Sprint 162+): either update the docstring to "retained for legacy test fixtures only — runtime path uses `evaluateWithRubric` and `sprint-controller.evaluateResult`", OR delete the function entirely (DELETE-CANDIDATE — see §6).

**Severity** P2 (documentation drift, no behavioural impact).

---

### 2.8 P2 — `result-evaluator.ts:15` import of `reconcileSpuriousNoGo` is reachable only through dead code

**Evidence**

- `import { reconcileSpuriousNoGo } from './mid-sprint-adapter.js';` (line 15)
- Only consumers are `result-evaluator.ts:92, 106` — both inside the deprecated `evaluateResult`.
- If §2.7's recommendation is acted on (delete deprecated function), this import becomes orphaned.

`mid-sprint-adapter.reconcileSpuriousNoGo` may have other callers in the codebase (out of scope for this audit) — confirm before deleting.

**Severity** P2 (orphan dependency conditional on §2.7).

---

### 2.9 P2 — `assessQuality` is invoked twice per sprint with different evaluation precedence

**Evidence**

- Call 1: `src/orchestra/sprint-finalizer.ts:753` — `assessQuality(task, taskResult, evaluation as unknown as string)` where `evaluation` is the Brain's `TaskEvaluation` enum value.
- Call 2: `src/orchestra/sprint-retro-writer.ts:229–230` — `assessQuality(task, result, result.evaluationDecision ?? result.selfAssessment ?? 'DONE')`.

The two callers can disagree about a task's evaluation when:
1. `result.evaluationDecision` is missing on disk (Brain may not always persist it).
2. Worker `selfAssessment` differs from Brain's actual evaluation.

This is a duplicated computation with divergent inputs. The retro displays one view of "quality" while the routing outcome learner stores another.

**Recommendation** (Sprint 162+): pass the `evaluations: Map<TaskId, TaskEvaluation>` already held by `sprint-controller.ts` down through `sprint-retro-writer.formatRubricScoresSection` to make the second computation use the same evaluation as the first.

**Severity** P2 (data inconsistency between two artifacts of the same sprint).

---

### 2.10 P2 — `as string` casts on `selfAssessment === 'TIMEOUT_WITH_WORK'`

**Evidence**

- `result-evaluator.ts:90` — `if ((result.selfAssessment as string) === 'TIMEOUT_WITH_WORK')`
- `result-evaluator.ts:567` — same cast inside `scoreCorrectness`.

`TaskResult.selfAssessment`'s declared union does not include `'TIMEOUT_WITH_WORK'`. The cast suppresses TypeScript's narrowing. Per the typescript-expert skill rules, suppressions need an inline comment explaining why; here only the call-site comment "Sprint 145" exists, on line 88 (and line 568).

**Recommendation** (Sprint 162+): broaden `TaskResult.selfAssessment` to include `'TIMEOUT_WITH_WORK'` so the cast is unnecessary.

**Severity** P2 (small typing weakness).

---

### 2.11 P3 — `parseSprintStats` lives in `result-evaluator.ts` but is markdown parsing, not evaluation logic

**Evidence**

- `result-evaluator.ts:1374–1399` — `parseSprintStats` parses a markdown metrics table from `.brain/sprints/sprint-NNN.md`.
- The file's banner (`result-evaluator.ts:1`) declares its purpose as "Pure evaluation module ... no side effects, no file writes — evaluation logic only" — yet the module performs filesystem reads (`fs/promises`) and markdown parsing. This is inconsistent with the banner.

**Recommendation** (Sprint 162+): if Memory V2 DB-first is the source of truth (per CLAUDE.md / DECKENT.md), `parseSprintStats` should be retired in favour of querying `MemoryStore.getByType('memory')`. Until then, move it to `sprint-metrics.ts` next to `countFirstTryTasks`.

**Severity** P3 (organisational, not behavioural).

---

### 2.12 P3 — Cross-reference re-exports may break `evaluator-consistency.test.ts` future enforcement

**Evidence**

- `result-evaluator.ts:1237–1238` re-exports `containsHonestyTrigger`, `checkWorkerHonesty`, `HonestyCheckResult`, `TestBaseline`, `BaselineComparison` from `./baseline-tracker.js`.
- `result-evaluator.ts:1243–1253` re-exports `CODE_VERIFIED_DONE`, `tryCodeVerifiedDone`, `writeCodeVerifiedResult`, `parseEvidenceCommand`, `CodeVerifyOptions`, `CodeVerifyResult` from `../monitor/auditor.js`.
- These cross-module re-exports are stable but make `result-evaluator.ts` a barrel for two siblings. If Sprint 162 tightens `evaluator-consistency.test.ts` to "result-evaluator must export only its own symbols", these re-exports trip the test.

**Severity** P3 (latent risk if future test guards tighten).

---

## 3. ADR Compliance

| ADR | Compliance | Evidence |
|-----|-----------|----------|
| ADR-001 (TS+ESM) | ✅ | All imports use `.js` extension, strict TypeScript |
| ADR-002 (Node16 resolution) | ✅ | `.js` extensions present on local imports (e.g. `result-evaluator.ts:14`) |
| ADR-006 (spawnSync security pattern) | n/a | No `spawnSync` calls in audited files |
| ADR-008 (Brain merkezi import — tek yönlü) | ✅ | Neither file imports from `brain.ts`. `result-evaluator.ts` imports only from `core/`, `coverage-validator`, `mid-sprint-adapter`, `provider-fallback`, `baseline-tracker`, `auditor`. `quality-assessor.ts` imports only from `core/`. |
| ADR-009 (DEBT.md format) | n/a | Audited files do not produce DEBT.md |
| ADR-024 (sprint-controller god split) | ⚠️ | `sprint-controller.ts:246` re-implementing `evaluateResult` after split *partially* defeats the split's purpose. The split was meant to extract pure evaluation; the simpler reimplementation re-introduces evaluation logic at the controller layer. See §2.1. |
| ADR-015 (TaskRouter 6-level routing) | n/a | Files do not route tasks |
| ADR-035 (Verification protocol) | ⚠️ | `applyTechDebtDowngrade` is part of the verification protocol but not wired (§2.2) |
| ADR-037 (RBAC authority matrix) | n/a | Files run inside Brain trust domain |

No accepted ADR is *violated* by the code; ADR-024's spirit is partially undermined by §2.1 but not the letter.

---

## 4. 10-Dimension Summary

| Dimension | Result |
|-----------|--------|
| 1. Dead code | `applyTechDebtDowngrade`, `validateTokenUsage`, `aggregateTokenUsage`, `buildEnrichedFixReason`, `checkVerifyMarkerHonesty`, `HONESTY_VIOLATION_NO_VERIFY_MARKER`. Plus deprecated `evaluateResult` itself. (§2.2, §2.3) |
| 2. ADR violations | None outright; ADR-024 spirit weakened (§2.1) |
| 3. Conflicting areas | Two `evaluateResult` (§2.1); `AUXILIARY_DIR_PREFIXES` duplicated (§2.6); `assessQuality` invoked twice with divergent precedence (§2.9) |
| 4. Drift | `@deprecated` docstring contradicts `finalize.ts` import (§2.7); IDENTITY/blueprint claim "applyTechDebtDowngrade çift katman" but second layer dormant (§2.2) |
| 5. Type safety | Two `as string` casts for `TIMEOUT_WITH_WORK` (§2.10); `assessQuality` evaluation typed as plain `string` (§2.5); `as unknown as string` cast in `sprint-finalizer.ts:753` |
| 6. Dependency hygiene | `.js` extensions present, no circular deps observed within the two files. Orphan import risk: `reconcileSpuriousNoGo` (§2.8) |
| 7. Documentation pollution | `@deprecated` docstring is wrong (§2.7); banner on `result-evaluator.ts:1` claims "no file writes" but file does fs reads (§2.11) |
| 8. Memory V2 coherence | `parseSprintStats` parses markdown directly instead of using MemoryStore (§2.11). Inconsistent with DECKENT.md "DB is single source of truth". |
| 9. Config integrity | n/a — files do not read project config |
| 10. Migration triage | See §6 below |

---

## 5. Lead-Question Verdicts

### 5.1 Rubric multi-dimensional scoring (Sprint 152.5 verification-blind fix)

**Verdict:** the verification-blind fix IS wired into the live EVALUATE phase via `evaluateWithRubric → isVerificationTask` (`result-evaluator.ts:732`, called from `sprint-phases.ts:360`).

**Caveats:**
- The FIX-fallback retry path (`sprint-controller.ts:368 → simpler evaluateResult`) does NOT call `isVerificationTask` and is therefore still verification-blind for retries. (§2.1)
- `tests/orchestra/evaluator-consistency.test.ts:119–135` only enforces correct evaluator selection in `sprint-phases.ts`. No equivalent test guards `sprint-controller.ts`.

### 5.2 Retro counter bug (Sprint 160 finding)

**Verdict:** the bug is REAL and visible in `.brain/RETRO.md` ("2 tasks completed on first try" on a 0/2 sprint), but the root cause is outside scope.filesWrite for this task.

- Fix locus: `src/orchestra/sprint-metrics.ts:313 countFirstTryTasks` (filters by worker `selfAssessment`, must filter by Brain `evaluation`).
- Secondary fix: `src/orchestra/sprint-retro-writer.ts:229` (evaluation precedence accepts worker self-assessment as fallback).
- Tertiary structural fix: tighten `quality-assessor.ts:28` evaluation type to `TaskEvaluation` enum (§2.5) — this would prevent the bug class by construction.

The audited files (`result-evaluator.ts`, `quality-assessor.ts`) are correct **at their boundary**: given the right evaluation string they produce the right rubric. The bug is at consumer boundaries that pass the wrong evaluation.

---

## 6. Migration Triage

| File | Decision | Rationale |
|------|----------|-----------|
| `src/orchestra/result-evaluator.ts` | **KEEP-PRIVATE** with cleanup | Internal to Brain orchestration. Cleanup actions: (a) delete deprecated `evaluateResult` (lines 87–179) once `finalize.ts` is verified to use only `sprint-controller.evaluateResult`, (b) wire `applyTechDebtDowngrade` into `sprint-phases.ts` after `evaluateWithRubric` to fulfil Sprint 138's promise, (c) wire `validateTokenUsage` into the EVALUATE pipeline per Sprint 140 plan, (d) wire `buildEnrichedFixReason` into FIX worker dispatch in `sprint-phases.ts` runFixPhase. |
| `src/orchestra/quality-assessor.ts` | **KEEP-PRIVATE** with cleanup | Internal to Brain. Cleanup actions: (a) tighten `evaluation` parameter type to `TaskEvaluation` enum, (b) hoist `QA_AUXILIARY_PREFIXES` to `src/core/constants.ts` (shared with `result-evaluator.AUXILIARY_DIR_PREFIXES`). |

Neither file is a candidate for public API exposure (they are evaluation internals) nor for deletion (live code path depends on them). The classification is unambiguous.

---

## 7. Recommendations for Sprint 162+

In priority order:

1. **(P0) Decide which `evaluateResult` is canonical.** Either delete `result-evaluator.ts:87` outright, or replace `sprint-controller.ts:246` (and its `defaultReevaluate` caller) with a call into `evaluateWithRubric` so the FIX-fallback path matches the EVALUATE path. Add a guard test similar to `evaluator-consistency.test.ts` for `sprint-controller.ts`.

2. **(P0) Wire `applyTechDebtDowngrade` end-to-end.** Read `task-NNN.verify-delta.json` (already produced by `worker-lifecycle.ts:342, 372`), pass the completion ratio into `applyTechDebtDowngrade` after `evaluateWithRubric` in `sprint-phases.ts`. Update IDENTITY/Blueprint only after the wire is live.

3. **(P1) Fix retro counter at source.** Change `sprint-metrics.ts:countFirstTryTasks` to accept the `evaluations` map and filter by Brain evaluation, not worker self-assessment. Update `sprint-retro-writer.ts:229` to consume the same map. Tighten `quality-assessor.ts:28` typing to prevent recurrence.

4. **(P1) Wire `validateTokenUsage` and `buildEnrichedFixReason`.** Sprint 140 promised hard NO_GO on missing tokenUsage; Sprint 151 D-3 promised enriched FIX reasons. Both functions exist, are tested, and are unused.

5. **(P1) Centralise `AUXILIARY_DIR_PREFIXES`** in `src/core/constants.ts` and import in both files.

6. **(P2) Tighten `result-evaluator.ts:1` banner** to reflect actual responsibilities (the file does perform `fs/promises` reads in `getRecentSprintStats` and `checkVerifyMarkerHonesty`).

7. **(P2) Update `@deprecated` docstring** on `result-evaluator.ts:82-86` to reflect that `finalize.ts` no longer uses this function.

8. **(P3) Migrate `parseSprintStats` to MemoryStore** once Memory V2 DB exposes per-sprint metrics queries.

These are recommendations only — Sprint 161 Lane 1 is READ-ONLY; no code changes occur in this sprint.

---

## 8. Sprint 161 Compliance Self-Check

- ✅ scope.filesWrite contained exactly one path: `docs/audits/sprint-161/T-161-015-orch-evaluator.md`
- ✅ no source-code modifications (verified by intent — only this single file is written)
- ✅ no deletions
- ✅ no refactors
- ✅ tests not touched
- ✅ all findings cite `file:line` evidence
- ✅ 10 audit dimensions surveyed (§4)
- ✅ migration triage applied (§6)
- ✅ both lead questions answered (§5)
