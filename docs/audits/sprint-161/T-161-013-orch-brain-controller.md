# T-161-013 — Audit: src/orchestra/ — brain + sprint-controller

**Sprint:** 161 (READ-ONLY pre-beta audit, Lane 1)
**Auditor:** worker w-161-013 (doc-writer agent + typescript-expert skill)
**Date:** 2026-05-08
**Mode:** READ-ONLY — single audit report; no source modifications

---

## 1. Scope

Two files, exactly:

| File | LoC | Role |
|------|----:|------|
| `src/orchestra/brain.ts` | 53 | Thin re-export layer (post-Sprint 036 split) — public surface for CLI/MCP/API |
| `src/orchestra/sprint-controller.ts` | 1007 | Sprint orchestration — `runSprint()`, `waitForResults()`, `evaluateResult()`, fallback chain, plus 7 sub-module barrel re-exports |

Both files were read in full. Cross-reference targets verified:

- **Reverse-import probes** for ADR-008 enforcement (worker.ts / auditor.ts / tmux.ts → brain/sprint-controller).
- **Forward-import probes** to verify all 7 sub-module references in `sprint-controller.ts:135-170` resolve to extant files.
- **Public-surface probes**: 11 import sites of `sprint-controller.ts` across the codebase.
- Comparison against ADRs 008, 024, 026, 035, 040 and the eight-phase contract in `.contracts/api-surface.md`.

---

## 2. Findings

Severity: **P0** = critical / boundary / data loss · **P1** = correctness or real leak · **P2** = drift, duplication, dead code · **P3** = cosmetic.

### 2.1 ADR Compliance — Lead Question A

| ADR | Subject | Verdict | Notes |
|---:|---|---|---|
| **ADR-008** | One-way dependency: tmux/auditor/worker must NOT import brain | ✅ **PASS** | All three reverse-import probes returned **0 matches** in `src/agents/worker.ts`, `src/monitor/auditor.ts`, `src/orchestra/tmux.ts`. Acceptance criterion in ADR-008 holds. |
| **ADR-024** | `sprint-controller.ts` god-object split — extract `sprint-phases.ts` | ⚠ **REGRESSION** | `sprint-phases.ts` exists and is imported (lines 62-67), but `sprint-controller.ts` itself has regrown to **1007 LoC**, undoing Sprint 136's slimming claim. See P1-A below. |
| **ADR-026** | 3-phase god-split strategy completed | ⚠ **REGRESSION** | All four target sub-modules (`sprint-utils.ts`, `result-collector.ts`, `sprint-phases.ts`, `sprint-lifecycle.ts`) exist and are imported. But the controller itself reaccumulated logic (fallback chain Sprint 155 + grace-period + nervous wiring + PID/snapshot handling). |
| **ADR-040** | Nervous System wire | ✅ **PASS** | `runSprint` lines 599-676 wire `NervousObserver` + `NervousDispatcher` + `NervousHistory` and route detections through `eventBus`/`event-stream`. Defensive `try/catch` ensures observer never blocks sprint flow. |
| **ADR-035** | Verify protocol | ✅ **PASS** (indirect) | `runEvaluatePhase` is delegated to with `config` + `spawnOpts` (line 880-883), preserving the dependency-pipeline cascade wire (Sprint 154 T7). No direct verification logic in this file. |

### 2.2 Sprint Lifecycle Phase Transitions — Lead Question B

The eight-phase contract in `.contracts/api-surface.md` and `DECKENT.md` is:
`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

Actual emit order in `runSprint`:

| Line | Emit | Then runs | Status |
|---:|---|---|---|
| 737 | `PLAN → SPAWN` | `runSpawnPhase` (l. 751) | ✅ correct order |
| 760 | `SPAWN → EXECUTE` | `waitForResults` (l. 767) | ✅ correct order |
| 874 | `EXECUTE → EVALUATE` | `runEvaluatePhase` (l. 880) | ✅ correct order |
| 953 | `EVALUATE → FIX` | `runFixPhase` (l. 956) | ✅ correct order |
| 962 | `FIX → RETRO` | `runRetroPhase` (l. 965) | ✅ correct order |
| 969 | `RETRO → DECAY` | `runCleanupPhase` (l. 972) | ⚠ no DECAY work runs; cleanup runs under a DECAY label |
| 975 | `DECAY → COMPLETE` | (sprint terminus) | ⚠ skips CLEANUP entirely |

Two observable issues — see **P2-A** and **P2-B** below.

### 2.3 Error Handling — Lead Question C

`sprint-controller.ts` follows a **fail-open / log-and-continue** style:

- `BrainError` is thrown for two truly-unrecoverable conditions: wrong-mode start (l. 532) and sprint-lock collision (l. 565). All other errors are caught.
- Phase-error pattern (l. 768-770): `safeDashboardUpdate` records the error, but `runSprint` continues; the empty `results` array then drives EVALUATE on whatever did finish. Acceptable for orchestration, but it can mask a genuinely bad EXECUTE phase.
- Cleanup-path pattern: `try { … } catch { /* best effort */ }` (l. 707-711, 906, 924, 985-987, 996) — acceptable for finalize paths.
- Setup-path pattern: `try { … } catch (e) { debugLog('runSprint:<step>', e); }` (l. 558-559, 678, 720-731, 941-950) — appropriate, since the sprint can usually proceed without observability/baseline/route.
- **`runFallbackRetries`** (l. 395-479) explicitly never throws; it `debugLog`s and returns zero counts. Documented contract.

Error-handling concern (P1, see **P1-B**): the **EVALUATE** and **FIX** human-checkpoint abort branches do not match the cleanup of the happy path.

---

### Findings table

| ID | Severity | Dimension | Summary |
|---|---|---|---|
| **P1-A** | P1 | Drift / ADR-024-026 regression | `sprint-controller.ts` is 1007 LoC; header comment claims "thin barrel re-export layer" with "only runSprint(), waitForResults(), evaluateResult()" |
| **P1-B** | P1 | Resource leak / Error handling | EVALUATE and FIX human-checkpoint aborts skip `clearInterval(snapshotInterval)`, `process.removeListener('beforeExit', …)`, and `clearPid(…)` |
| **P1-C** | P1 | Conflicting areas / Dependency hygiene | `sprint-phases.ts` ↔ `sprint-controller.ts` circular import is acknowledged but not resolved (sprint-phases:101 comment) |
| **P2-A** | P2 | Drift | `SprintPhase` enum lacks `CLEANUP`; `runCleanupPhase` runs but emits a `DECAY → COMPLETE` transition. `.contracts/api-surface.md` and `DECKENT.md` document a CLEANUP phase |
| **P2-B** | P2 | Dead code | `SprintPhase.DIRECTIVE` and `SprintPhase.TRANSITION` are defined in `core/sprint-types.ts:8,16` but never referenced anywhere in `src/` |
| **P2-C** | P2 | Drift / Documentation pollution | `sprint-controller.ts:1-11` and `brain.ts:1-9` header comments are stale: undercount functions and omit re-exported sub-modules |
| **P2-D** | P2 | Duplicated logic | `sprint-phases.ts:128-156` re-implements `now()` and `safeDashboardUpdate()` "to avoid circular init-time deps" — same behaviour exists in `sprint-utils.ts` and `sprint-lifecycle.ts` |
| **P2-E** | P2 | Drift / Conflicting areas | Phase-transition checkpoint coverage is asymmetric: PLAN, SPAWN, EXECUTE, EVALUATE, FIX have `writePhaseCheckpoint` calls; RETRO and CLEANUP do not |
| **P2-F** | P2 | Type safety | One `as unknown as DetectorConfig` cast (l. 605) — explained by inline comment, but only structural-shape comment, not a verified runtime check |
| **P2-G** | P2 | Drift | Coverage threshold `90` is hardcoded as `evaluateResult`'s default param (l. 246), duplicating `config.coverage_threshold = 90` in `core/config.ts:524, 833, 1357` |
| **P2-H** | P2 | Drift | Magic numbers: `30_000` snapshot interval, `15_000` nervous tick, `5 * 60 * 1000` grace period, `30 * 60 * 1000` fallback default — no named constants in `core/constants.ts` |
| **P2-I** | P2 | Conflicting areas / Public surface ambiguity | 4 CLI sites and 1 MCP site import directly from `sprint-controller.js` instead of the documented public surface `brain.js` |
| **P3-A** | P3 | Drift | `runFallbackRetries`'s in-loop cap `alreadyRetried.size >= sprint.tasks.length * MAX_FALLBACK_RETRIES` is a per-sprint global cap, not per-task; harmless because `prepareFallbackRetries` already filters via the same Set |
| **P3-B** | P3 | Drift | `defaultArchiveResult` retries 10 times (l. 493) — magic number; documentation says "next available" but caps silently on the 11th collision |
| **P3-C** | P3 | Drift | `brain.ts:1-9` header lists "result-evaluator.ts — evaluateResult, isDocTask, waitForResults (DI version)" but brain.ts no longer re-exports from result-evaluator at all (everything routes through sprint-controller) |

---

## 3. Evidence

### P1-A — sprint-controller.ts regrown (ADR-024/026 regression)

```
src/orchestra/sprint-controller.ts:1-11
  // ═══ Sprint Controller (Thin Orchestration Layer) ══════════════════
  // Sprint 136: Slimmed from ~1894 LoC to a thin barrel re-export layer.
  // Only runSprint(), waitForResults(), and evaluateResult() remain here.
```

vs. the actual file. `wc -l` reports **1007 LoC**. Top-level non-trivial symbols:

```
  Line   Symbol
   179   function emitSprintEvent
   194   function emitPhaseChange
   200   interface RunSprintOptions
   230   export async function waitForResults
   246   export function evaluateResult
   285   interface FallbackRetryPlan
   307   export function prepareFallbackRetries
   347   interface FallbackRetryDeps
   364   function defaultReevaluate
   395   export async function runFallbackRetries
   483   async function defaultPersistTask
   488   async function defaultArchiveResult
   503   async function defaultSpawnRetry
   512   async function defaultWaitForRetryResults
   525   export async function runSprint
```

`PROJECT-IDENTITY.md` claims "sprint-controller.ts Slim 1890→209 LoC (Sprint 136 T-008)". The 1007-LoC reality is ~5× the post-slim baseline.

### P1-B — EVALUATE / FIX human-checkpoint abort resource leak

Compare the **happy-path** cleanup (`runSprint` end, lines 989-996):

```typescript
releaseSprintLock(projectRoot);
clearActiveSprint();
clearSprintState(projectRoot);

// PID Cleanup
if (snapshotInterval) clearInterval(snapshotInterval);
process.removeListener('beforeExit', beforeExitHandler);
try { clearPid(projectRoot, sprint.id); } catch { /* non-fatal */ }
```

vs. the **EVALUATE-aborted** branch (lines 904-912):

```typescript
if (!approved) {
  sprint.status = SprintStatus.ABORTED;
  sprint.completedAt = now();
  try { nervousObserver?.stop(); } catch { /* best effort */ }
  clearActiveSprint();
  releaseSprintLock(projectRoot);
  clearSprintState(projectRoot);
  return sprint;
}
```

`snapshotInterval` (set at l. 705), `beforeExitHandler` (set at l. 712), `clearPid` (writes at l. 679) are **never undone** when the user declines the EVALUATE checkpoint. The same diff applies to the FIX abort branch (lines 921-928).

Impact: if a user repeatedly starts → declines EVALUATE/FIX checkpoints, `setInterval` handles, `beforeExit` listeners, and PID files accumulate within the same Node process (CLI/MCP server). Long-lived MCP servers (per CLAUDE.md gotcha) are the realistic exposure.

### P1-C — sprint-phases ↔ sprint-controller circular dep

```
src/orchestra/sprint-phases.ts:101-113
  // ─── Sprint Controller (safe circular — all usages inside function bodies) ──
  import {
    BrainError, readContext, planSprint, writeSprintState,
    spawnWorkers, buildSpawnRetryHint, waitForResults,
    finalizeSprint, cleanup,
  } from './sprint-controller.js';
```

```
src/orchestra/sprint-controller.ts:62-67
  import {
    runPlanPhase, runSpawnPhase, runEvaluatePhase,
    runRollbackCheck, runFixPhase, runRetroPhase,
    runCleanupPhase,
  } from './sprint-phases.js';
```

The cycle works at runtime only because both sides read the bindings inside function bodies (Node ESM live bindings). The author acknowledges the workaround in the comment. ADR-008's stated invariant — *"Circular dependencies are FORBIDDEN"* — is technically violated here. The proper fix is to have `sprint-phases.ts` import each symbol from its actual home module (`sprint-planner.ts`, `sprint-spawner.ts`, `sprint-lifecycle.ts`, `sprint-finalizer.ts`) rather than via `sprint-controller.ts`'s barrel.

### P2-A — `SprintPhase.CLEANUP` missing

```
src/core/sprint-types.ts:7-18
  export enum SprintPhase {
    DIRECTIVE = 'DIRECTIVE',
    PLAN = 'PLAN', SPAWN = 'SPAWN', EXECUTE = 'EXECUTE',
    EVALUATE = 'EVALUATE', FIX = 'FIX', RETRO = 'RETRO',
    DECAY = 'DECAY', TRANSITION = 'TRANSITION',
    COMPLETE = 'COMPLETE',
  }
```

vs.

```
.contracts/api-surface.md
  ## Sprint Phases
  Sprint lifecycle follows these phases in order:
  1. PLAN → 2. SPAWN → … → 7. DECAY → 8. CLEANUP
```

The code emits `RETRO → DECAY` (l. 969), runs `runCleanupPhase` (l. 972), then emits `DECAY → COMPLETE` (l. 975). No CLEANUP transition is ever observable.

### P2-B — Dead enum values

`SprintPhase.DIRECTIVE` and `SprintPhase.TRANSITION` — `Grep "SprintPhase\.(DIRECTIVE|TRANSITION)"` over `src/` returns **0 matches**. These look like vestigial states from earlier sprint design (DIRECTIVE may have been the pre-PLAN phase before structured directives became the contract).

### P2-C — Header comment drift

`sprint-controller.ts:3` says *"Only runSprint(), waitForResults(), and evaluateResult() remain here"*. Reality: 11 top-level symbols + 4 internal helpers (see P1-A table).

`brain.ts:4-9` lists six sub-modules but the file actually re-exports from **eight** more (lines 38-53): `coverage-validator`, `rollback`, `spawn-backend`, plus type re-exports from `sprint-controller`. The comment also describes `result-evaluator.ts — evaluateResult, isDocTask, waitForResults (DI version)` but **brain.ts re-exports nothing from `result-evaluator.ts`** — `evaluateResult` and `isDocTask` come via `sprint-controller`, and the DI `waitForResults` lives in `result-collector.ts`, not `result-evaluator.ts`.

### P2-D — Duplicated helpers (acknowledged debt)

```
src/orchestra/sprint-phases.ts:116-156
  // ═══ Local Helpers (duplicated from sprint-controller to avoid circular init-time deps)
  function now(): string { return new Date().toISOString(); }
  function safeDashboardUpdate(projectRoot, sprint, errorMessage): void { … }
```

Canonical implementations:
- `now` — `src/orchestra/sprint-utils.ts` (imported by sprint-controller at l. 56-60)
- `safeDashboardUpdate` — `src/orchestra/sprint-lifecycle.ts` (imported at l. 113-117)

### P2-E — Phase-checkpoint asymmetry

```
src/orchestra/sprint-controller.ts
   734  PLAN     try { writePhaseCheckpoint(...); } catch (e) { debugLog('runSprint:checkpoint:plan', e); }
   757  SPAWN    try { writePhaseCheckpoint(...); } catch (e) { debugLog('runSprint:checkpoint:spawn', e); }
   871  EXECUTE  try { writePhaseCheckpoint(...); } catch (e) { debugLog('runSprint:checkpoint:execute', e); }
   934  EVALUATE try { writePhaseCheckpoint(...); } catch (e) { debugLog('runSprint:checkpoint:evaluate', e); }
   959  FIX      try { writePhaseCheckpoint(...); } catch (e) { debugLog('runSprint:checkpoint:fix', e); }
   --   RETRO    (none)
   --   CLEANUP  (none)
```

If checkpoints are intended for resume capability (Sprint 138 Task 9 per `IDENTITY.md`), missing the RETRO/CLEANUP checkpoints means a crash during retro produces an unrecoverable state on resume.

### P2-F — Type-safety cast

```
src/orchestra/sprint-controller.ts:605
  const detectorConfig = config.nervous_system.detectors as unknown as DetectorConfig;
```

Comment (l. 602-604) explains the cast is safe because `NervousSystemConfig.detectors` and `DetectorConfig` "share the same shape", but this is a static-shape claim — there is no runtime check, no Zod validator, no test. Acceptable but unprotected.

### P2-G — Coverage threshold duplication

```
src/orchestra/sprint-controller.ts:246
  export function evaluateResult(result, task, vitestJsonOutput?, coverageThreshold = 90)
```

```
src/core/config.ts:524, 833, 1357
  coverage_threshold: 90
src/core/config-types.ts:251, 486
  coverage_threshold?: number;  coverage_threshold: number;
```

External callers of `evaluateResult` (CLI `finalize`, `audit`) do not pass a threshold — they accept the hardcoded 90 even when the project's `config.coverage_threshold` differs.

### P2-H — Magic numbers

```
src/orchestra/sprint-controller.ts:455   const fallbackTimeoutMs = opts?.timeoutMs ?? 30 * 60 * 1000;
src/orchestra/sprint-controller.ts:606   nervousObserver = new NervousObserver(projectRoot, 15_000, detectorConfig);
src/orchestra/sprint-controller.ts:705   snapshotInterval = setInterval(() => void writePeriodicSnapshot(), 30_000);
src/orchestra/sprint-controller.ts:802   const GRACE_PERIOD_MS = 5 * 60 * 1000;
```

None named in `core/constants.ts`.

### P2-I — Public-surface bypass

```
src/cli/entry.ts:5             import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
src/cli/commands/spawn.ts:11   import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
src/cli/commands/finalize.ts:8 import { evaluateResult } from '../../orchestra/sprint-controller.js';
src/cli/commands/run.ts:8      import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
src/mcp/tools/run.ts:13        import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
```

All of these symbols ARE re-exported by `brain.ts` (`interruptActiveSprint` via `sprint-lifecycle`, `evaluateResult` directly, `resolveAgentPrompt/resolveSkillPrompts` via `result-collector`). The call sites bypass the documented public-surface entry point. ADR-008's spirit — *"Brain is the orchestrator, the only entry point"* — leaks: `sprint-controller.ts` has become a second public surface.

(Note: `src/api/server.ts` correctly imports from `brain.ts`. The bypass is concentrated in CLI + MCP tooling.)

---

## 4. Migration Triage

| File | Disposition | Rationale |
|------|------|-----------|
| `src/orchestra/brain.ts` | **KEEP-PRIVATE** | Internal orchestration entry. Public consumers (api/server.ts) already use it. Not user-facing API; no migration needed for public release. Keep narrow header comment up to date. |
| `src/orchestra/sprint-controller.ts` | **KEEP-PRIVATE** (with split recommended) | Internal orchestration logic. Should not be a second public surface. After resolving P2-I and the P1-A god-object regrowth (Sprint 162+ split candidate), the file's role becomes solely `runSprint` glue code. |

No DELETE-CANDIDATEs and no MIGRATE-PUBLIC items in this pair.

---

## 5. Recommendations (Sprint 162+, not part of this audit)

Listed by impact, not by sprint.

1. **(P1-A, P1-C)** Extract the fallback-chain block (`prepareFallbackRetries`, `runFallbackRetries`, `FallbackRetryPlan`, `FallbackRetryDeps`, `defaultReevaluate`, `defaultPersistTask`, `defaultArchiveResult`, `defaultSpawnRetry`, `defaultWaitForRetryResults` — lines 273-519, ~250 LoC) into a new `src/orchestra/fallback-orchestrator.ts`. Brings `sprint-controller.ts` toward the Sprint 136 ~209-LoC target without changing behaviour.
2. **(P1-C)** In `sprint-phases.ts`, replace each `from './sprint-controller.js'` import with the canonical sub-module home (`./sprint-planner.js`, `./sprint-spawner.js`, `./sprint-lifecycle.js`, `./sprint-finalizer.js`, `./result-collector.js`). Then drop the "safe circular" comment and the duplicated `now`/`safeDashboardUpdate` helpers.
3. **(P1-B)** Extract the `runSprint` shutdown block (lines 989-996 — `clearInterval`, `removeListener`, `clearPid`) into a private `cleanupSprintProcess(snapshotInterval, beforeExitHandler, projectRoot, sprintId)` and call it from BOTH the happy path AND the three checkpoint-aborted branches.
4. **(P2-A, P2-B)** Decide one of: (a) add `SprintPhase.CLEANUP` and emit it explicitly between `runCleanupPhase` and `COMPLETE`; or (b) update `.contracts/api-surface.md` + `DECKENT.md` to describe the actual seven-emit lifecycle. Then delete `SprintPhase.DIRECTIVE` and `SprintPhase.TRANSITION` (or document where they're slated to be used).
5. **(P2-C, P3-C)** Update both file header comments to match reality. Remove the "Only X, Y, Z remain here" claim from `sprint-controller.ts:3`. Update `brain.ts:4-9` to match the actual sub-module re-export list.
6. **(P2-E)** Add `writePhaseCheckpoint` calls after `runRetroPhase` and `runCleanupPhase` for resume-capability symmetry.
7. **(P2-G)** Make `evaluateResult` mandatory-threshold (no default) OR have the CLI commands that call it pass the project-config value. Removes silent drift if a project sets `coverage_threshold` ≠ 90.
8. **(P2-H)** Promote the four magic numbers to named exports in `core/constants.ts` (`SNAPSHOT_INTERVAL_MS`, `NERVOUS_TICK_MS`, `GRACE_PERIOD_MS`, `FALLBACK_DEFAULT_TIMEOUT_MS`).
9. **(P2-I)** Convert the five non-`api/` callers of `sprint-controller.ts` to import from `brain.ts` instead. Reduces public-surface ambiguity. Mechanical change.
10. **(P2-F)** Replace `as unknown as DetectorConfig` (l. 605) with a Zod parse or a structural runtime check — the cast spans config-file → detector-system, which is a configuration boundary, not an internal interface.

None of the above is required to ship; all are P1/P2 hygiene to be filed against the Sprint 162+ backlog.

---

## 6. Audit Process Notes

- **READ-ONLY**: only this file was written. No source edits, no tests modified.
- `tsc --noEmit` and `vitest run` were not run — task spec marks them N/A.
- No deviations from `scope.filesWrite` (`docs/audits/sprint-161/T-161-013-orch-brain-controller.md`).
- ADR-039 self-modifying detector should record this as a docs-only edit under `docs/audits/sprint-161/`.

End of report.
