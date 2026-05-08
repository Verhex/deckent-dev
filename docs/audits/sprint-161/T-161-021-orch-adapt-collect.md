# T-161-021 — orchestra/ — mid-sprint-adapter + result-collector

**Sprint:** 161
**Auditor:** worker w-161-021 (opus, doc-writer + typescript-expert)
**Date:** 2026-05-08
**Mandate:** READ-ONLY static audit — 10 dimensions
**Lead questions:** rerouting on failure, IPC registry (Sprint 135 T-004), result aggregation

---

## 1. Scope

| File | LoC | Module purpose |
|------|----:|----------------|
| `src/orchestra/mid-sprint-adapter.ts` | 440 | `MidSprintAdapter` class (reroute on NO_GO/TECH_DEBT) + `reconcileSpuriousNoGo` standalone helper (TIMEOUT_WITH_WORK / spurious NO_GO recovery) |
| `src/orchestra/result-collector.ts`   | 409 | `waitForResults` (production), `buildResultsMap`, `enrichResultTokenUsage`, `estimateTokenUsage`, `resolveAgentPrompt`, `resolveSkillPrompts` + IPC re-exports |

**Cross-references read for context (not audited as primary):**
`src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/result-evaluator.ts`,
`src/orchestra/ipc-registry.ts`, `src/orchestra/brain.ts`, `src/orchestra/sprint-spawner.ts`.

---

## 2. Findings

| ID | Sev | Dimension | Summary |
|----|-----|-----------|---------|
| **F-1** | **P1** | Dead code / Conflicting areas | `waitForResults` in `result-evaluator.ts:241–310` is a duplicate DI implementation with **zero production callers** — only tests import it. Real production path goes `brain.ts → sprint-controller.ts → result-collector.ts:waitForResults`. |
| **F-2** | P1 | Drift / ADR-008 governance | `brain.ts:5` header comment claims `result-evaluator.ts — evaluateResult, isDocTask, waitForResults (DI version)` is re-exported via brain. In reality, `brain.ts` re-exports the production `waitForResults` from `sprint-controller` → `result-collector`. The DI variant is never re-exported. |
| **F-3** | P1 | Drift / ADR-009-035 governance | `evaluateResult` in `result-evaluator.ts:87` is `@deprecated` but still calls `reconcileSpuriousNoGo` at lines 92 and 106. The live evaluation path (`evaluateWithRubric` via `sprint-phases.ts:370`) ALSO calls it. If finalize CLI invokes the deprecated function, reconcile (which spawns `npx tsc` + `npx vitest`) runs **twice per result**. |
| **F-4** | P2 | Type safety / Documentation | `result-collector.ts:142` parses `agent.json` as `Record<string, unknown>` and trusts the disk shape — `systemPrompt` is cast to `string \| undefined` without runtime validation. A malformed agent.json silently injects garbage into worker prompts. |
| **F-5** | P2 | Conflicting areas / ADR-027 | `result-collector.ts:303–308` falls back to `tmux.spawnWorker` / `tmux.killWorker` when `spawnOpts.spawnBackend` is omitted. Per ADR-027 (Hybrid Spawn Backend), if the live sprint started with the docker backend but the caller forgot to pass `spawnBackend`, queue spawns will silently use **tmux** — backend mismatch with no error. |
| **F-6** | P2 | Type safety | `sprint-phases.ts:378` (and similar in evaluator) use the ad-hoc cast pattern `(result as TaskResult & { reconcileNotes?: string }).reconcileNotes = …` to bolt a field onto `TaskResult`. The proper place is `core/task-types.ts:TaskResult`, where `reconcileNotes?: string` should be a first-class optional field. (Out-of-file, but originating call sites exist in this audit's scope.) |
| **F-7** | P2 | Drift (header/behavior) | `mid-sprint-adapter.ts:186–188` narrates a 4-sprint history of failed wires for `reconcileSpuriousNoGo` (Sprint 136 T-003 → 137 → 144 → 145 "wire for real"). Real wire happened in Sprint 154 T7 (`sprint-phases.ts:363` comment). The mid-sprint-adapter narrative is stale. |
| **F-8** | P2 | Synthetic result hygiene | `result-collector.ts:247–257` synthetic timeout `TaskResult` lacks `tokenUsage`. Sprint 140 task-builder rejects results without `tokenUsage` as NO_GO; this synthetic is already NO_GO so the absence is benign, but the result is then written to disk (line 260) and re-read by downstream consumers — a partial result type. Inconsistent with `enrichResultTokenUsage` which fills missing usage everywhere else. |
| **F-9** | P2 | Race / IPC | `result-collector.ts:319–365` HEARTBEAT listener uses a single `pending` flag. If a HEARTBEAT arrives between `ipcWakeup.resolve()` (line 333) and the next `makeIpcWakeupPromise()` (line 371), the wakeup is silently dropped. The 5 s `WATCH_FALLBACK_MS` timer eventually unblocks the loop, so the race is **benign in practice**, but it is a real drop. |
| **F-10** | P2 | Lifecycle / ADR-014 | `result-collector.ts:407–409` re-exports `handleWorkerQuestion` and `checkWorkerQuestions` from `ipc-registry.ts`, but no callsite in this file invokes `cleanupQuestionFiles` after a task is collected. Lingering `.question` / `.answer` files for finished tasks rely on later cleanup — not local. |
| **F-11** | P2 | ADR-008 / dependency hygiene | `result-collector.ts:42` imports `spawnWorker`, `killWorker` from `./tmux.js` as **values** (not type-only). Per the strict reading of ADR-008 ("Brain is the ONLY module that imports tmux"), `result-collector.ts` is technically a Brain sub-module post-ADR-024 god-object split, so this is permitted — but no in-file comment makes that delegation explicit. Future maintainers will misread ADR-008. |
| **F-12** | P3 | Type safety | `mid-sprint-adapter.ts:142` casts `routingMeta.taskDNA as TaskDNA`. `routingMeta` is typed as `Record<string, unknown>`-ish via `Task` interface; runtime shape isn't validated before use. |
| **F-13** | P3 | Magic numbers / Documentation | `result-collector.ts:71–73` token-usage heuristic uses bare literals (`10`, `15`, `4`) for "tokens per line", "tokens per generated line", "cache-read multiplier". JSDoc on line 67–68 documents intent; constants do not exist. |
| **F-14** | P3 | Magic numbers | `result-collector.ts:199` hard-codes 30-minute default timeout. Should reference `config.sprint_timeout` or a named constant in `core/constants.ts`. (Documented in `docs/directives/sprint-100.md` as a known item.) |
| **F-15** | P3 | Boolean coercion semantics | `mid-sprint-adapter.ts:46` — `config?.max_reroutes ?? 3` correctly preserves `0`, but the call site at line 64 (`if (attempts >= this.maxReroutesPerTask)`) blocks all reroutes when `max_reroutes=0`. If users intend `0 = unlimited`, this is wrong. JSDoc / config schema does not pin the semantics. |
| **F-16** | P3 | Vitest output parsing fragility | `mid-sprint-adapter.ts:291` extracts JSON via `/\{[\s\S]*"numPassedTests"[\s\S]*\}/`. Greedy regex on multi-MB vitest output is slow and fragile if any nested JSON contains `numPassedTests`. |
| **F-17** | P3 | Reroute attempts memory | `mid-sprint-adapter.ts:31` `rerouteAttempts` Map is created per `MidSprintAdapter` instance. Today the adapter is constructed inside `runFixPhase` (sprint-phases.ts:606 dynamic import), so it is GC-eligible after fix completes — **no leak**. If a future refactor hoists the adapter to a sprint-singleton, the map will accumulate. No comment documents this assumption. |
| **F-18** | P3 | ADR-035 channel-code drift | `mid-sprint-adapter.ts` reroute reason strings (lines 56, 59, 65, 80, 90, 100) are free-form English. ADR-035 (Verification Protocol Standard) defines 15 channel codes — these reasons do not map to those codes. |
| **F-19** | P3 | Type-safety / unsafe field append | `result-collector.ts:97–98` mutates `task.routingMeta` if missing (`if (!task.routingMeta) task.routingMeta = {};`). Mutating method input is a code smell — `shouldReroute()` is named for purity. |
| **F-20** | P3 | Documentation pollution | Both files have a heavy density of comment banners (`═══`, `───`) demarcating sections. Useful, but `result-collector.ts:6–43` has 7 banners over 37 lines — high noise/signal in the import header. |

**Severity counts:** P0 = 0 · P1 = 3 · P2 = 8 · P3 = 9.

**No P0 (boundary violations / ADR-006 spawnSync misuse / RBAC breach) found.** Both files behave under the contracts described in ADR-008 (Brain merkezi import), ADR-024 (god-object split), ADR-026 (Phase-3 sprint-controller refactor), ADR-027 (hybrid spawn backend), ADR-035 (verification protocol).

---

## 3. Evidence

### F-1 — Dead duplicate `waitForResults`

```text
src/orchestra/result-collector.ts:190   export async function waitForResults(  ← LIVE PRODUCTION
src/orchestra/result-evaluator.ts:241   export async function waitForResults(   ← DEAD (tests-only)
```

Production import chain:

```text
src/orchestra/brain.ts:20                    waitForResults,
src/orchestra/sprint-controller.ts:71        waitForResults as waitForResultsImpl,
src/orchestra/sprint-controller.ts:72        from './result-collector.js';
```

`result-evaluator.waitForResults` callers (grep):

```text
tests/orchestra/result-evaluator.test.ts:23    WaitableSprint,            ← test only
tests/orchestra/result-evaluator.test.ts:406+  ← 8 test usages
src/orchestra/                                  (no production import — confirmed)
```

### F-2 — Drift in `brain.ts:5` header

```text
src/orchestra/brain.ts:5    //   result-evaluator.ts  — evaluateResult, isDocTask, waitForResults (DI version)
```

`brain.ts` re-exports `waitForResults` from `sprint-controller.ts:32`, which itself imports from `result-collector.ts:72`. The "(DI version)" claim is misleading — the DI variant is unreachable from `brain.ts`.

### F-3 — Double-call to `reconcileSpuriousNoGo`

```text
src/orchestra/result-evaluator.ts:92     const reconciled = reconcileSpuriousNoGo(result, task, projectRoot);
src/orchestra/result-evaluator.ts:106    const reconciled = reconcileSpuriousNoGo(result, task, projectRoot);
src/orchestra/sprint-phases.ts:370       const reconciled = reconcileSpuriousNoGo(result, task, projectRoot);
src/orchestra/result-evaluator.ts:82     @deprecated …
```

Each `reconcileSpuriousNoGo` invocation runs `npx tsc --noEmit` (60 s timeout) and `npx vitest run --reporter=json` (120 s timeout). Twice per result is ~6 minutes worst-case.

### F-4 — Untyped JSON parse

```text
src/orchestra/result-collector.ts:142    const raw = JSON.parse(await readFile(p, 'utf-8')) as Record<string, unknown>;
src/orchestra/result-collector.ts:143    systemPrompt = raw['systemPrompt'] as string | undefined;
```

If `systemPrompt` is `42` on disk, `parts.push(42 as unknown as string)` injects the number into the worker prompt at line 151.

### F-5 — Backend mismatch fallback

```text
src/orchestra/result-collector.ts:277    const queueBackend = spawnOpts?.spawnBackend;
src/orchestra/result-collector.ts:284        if (queueBackend) queueBackend.kill(taskId);
src/orchestra/result-collector.ts:285        else killWorker(taskId);     ← tmux fallback even if sprint started with docker
src/orchestra/result-collector.ts:303        } else {
src/orchestra/result-collector.ts:304          spawnWorker(nextTask.id, …); ← tmux spawn even if sprint started with docker
```

### F-7 — Stale historical narrative

```text
src/orchestra/mid-sprint-adapter.ts:186    // ─── Spurious NO_GO Reconciliation Helper ──────────────────────────────────
src/orchestra/mid-sprint-adapter.ts:187    // Sprint 136 T-003: helper written. Sprint 137: "wire live" claimed.
src/orchestra/mid-sprint-adapter.ts:188    // Sprint 144: dogfood proved dead. Sprint 145: 5th dogfood attempt — wire for real.
```

Actual wire is from Sprint 154 T7 (`sprint-phases.ts:363`): `// ─── Sprint 154 T7 wire: reconcileSpuriousNoGo`.

### F-8 — Synthetic result missing `tokenUsage`

```text
src/orchestra/result-collector.ts:247-257  const syntheticResult: TaskResult = {
                                              taskId, workerId: `w-${taskId}`,
                                              filesChanged: [], linesAdded: 0, …
                                              selfAssessment: 'NO_GO',
                                              notes: 'Worker timeout — process exceeded time limit and was killed',
                                            };
```

No `tokenUsage` field. Compare with `enrichResultTokenUsage` policy (line 102): "If the result already has tokenUsage, it is left unchanged. Otherwise, a heuristic estimate is generated…" — synthetic NO_GO is never enriched because it's pushed directly to `results` (line 266) without going through `enrichResultTokenUsage`.

### F-9 — IPC race condition

```text
src/orchestra/result-collector.ts:330  channel.onMessage('HEARTBEAT', () => {
src/orchestra/result-collector.ts:331    if (ipcWakeup.pending) {
src/orchestra/result-collector.ts:332      ipcWakeup.pending = false;
src/orchestra/result-collector.ts:333      ipcWakeup.resolve();
src/orchestra/result-collector.ts:334    }
src/orchestra/result-collector.ts:335  });
```

Window: between `resolve()` (line 333) and the loop's next `makeIpcWakeupPromise()` (line 371) the `pending` flag is `false`. Any HEARTBEAT in this window is silently dropped. Mitigated by 5 s polling fallback.

### F-11 — ADR-008 ambiguity

```text
src/orchestra/result-collector.ts:42    import { spawnWorker, killWorker } from './tmux.js';
```

ADR-008 `.brain/exports/decisions.md` literal text: *"`grep -r 'from.*brain' src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` her zaman boş sonuç vermeli."* — describes the inverse direction (no module imports brain). The forward direction (Brain importing tmux/worker/auditor) is concentrated in sprint-controller post-ADR-024. result-collector inherited this license via god-object split. **Not a violation**, but no in-file comment documents the inheritance.

### F-13 — Magic numbers in `estimateTokenUsage`

```text
src/orchestra/result-collector.ts:71     const inputTokens = task.estimatedTokens ?? Math.max((result.linesAdded + result.linesRemoved) * 10, 1000);
src/orchestra/result-collector.ts:72     const outputTokens = Math.max(result.linesAdded * 15, 500);
src/orchestra/result-collector.ts:73     const cacheReadTokens = Math.round(inputTokens * 4);
```

### F-14 — Hard-coded 30-min timeout

```text
src/orchestra/result-collector.ts:199    const timeout = timeoutMs !== undefined ? timeoutMs : 30 * 60 * 1000;
```

### F-15 — `max_reroutes = 0` ambiguity

```text
src/orchestra/mid-sprint-adapter.ts:46   this.maxReroutesPerTask = config?.max_reroutes ?? 3;
src/orchestra/mid-sprint-adapter.ts:64   if (attempts >= this.maxReroutesPerTask) {
                                            return { should: false, … };
                                          }
```

If `max_reroutes = 0`, the check is `0 >= 0` → blocks all reroutes immediately. The token "0 = unlimited" interpretation common in Unix/Node config is **not** honored.

### F-16 — Greedy regex JSON extraction

```text
src/orchestra/mid-sprint-adapter.ts:291    const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
```

`[\s\S]*` is unbounded greedy; on a multi-MB vitest output it's quadratic worst-case.

### F-19 — Mutating purity violation

```text
src/orchestra/mid-sprint-adapter.ts:97   if (!task.routingMeta) task.routingMeta = {};
src/orchestra/mid-sprint-adapter.ts:98   task.routingMeta.rerouteCount = newAttempts;
```

`shouldReroute()` is named as a query method but mutates its argument. `applyReroute()` (line 161) is correctly named for mutation; `shouldReroute()` should not also mutate.

---

## 4. Migration Triage

| File | Classification | Reason |
|------|---------------|--------|
| `src/orchestra/mid-sprint-adapter.ts` | **KEEP-PRIVATE** | Project-specific (Brain reroute logic + Sprint 145 spurious-NO_GO recovery) — not a generic utility. Live wire confirmed via `sprint-phases.ts:606` and `sprint-phases.ts:370`. |
| `src/orchestra/result-collector.ts` | **KEEP-PRIVATE** | Project-specific orchestration logic with hard ties to `.tasks/` filesystem layout, IPC channel registry, tmux/docker spawn backends, and sprint structure. Not generalizable. |
| `src/orchestra/result-evaluator.ts:209–310` (`waitForResults` DI variant + supporting types) | **DELETE-CANDIDATE** | Dead production code, tests-only. Out-of-scope for this audit (in-scope is mid-sprint-adapter + result-collector), but flagged because production `waitForResults` lives in result-collector and is the only one wired through brain.ts. **Recommend removal in Sprint 162+** along with corresponding tests. |

---

## 5. Recommendation (Sprint 162+ work, NOT in this sprint)

### Bundle A — High-impact cleanup (~80 LoC removal)

1. **Delete the duplicate `waitForResults` in `result-evaluator.ts:209–310`** (F-1, F-2). Migrate `tests/orchestra/result-evaluator.test.ts` waitForResults tests to test the production `result-collector.waitForResults` via integration-style fakes. Update `brain.ts:5` header.
2. **Decommission `evaluateResult`** (`result-evaluator.ts:87`) (F-3). Migrate the CLI finalize command to `evaluateWithRubric`. Remove the duplicate `reconcileSpuriousNoGo` calls at evaluator.ts:92,106.

### Bundle B — Type-safety hardening (~30 LoC)

3. **Add `reconcileNotes?: string` to `TaskResult` in `core/task-types.ts`** (F-6). Remove the ad-hoc `as TaskResult & { reconcileNotes?: string }` casts.
4. **Validate parsed `agent.json`** with a Zod schema in `result-collector.ts:resolveAgentPrompt` (F-4). Same for `routingMeta.taskDNA` cast in `mid-sprint-adapter.ts:142` (F-12).

### Bundle C — Backend correctness (~10 LoC)

5. **Make `spawnOpts.spawnBackend` mandatory** when `queue` is non-empty (F-5). Throw at the start of `waitForResults` if `queue.length > 0 && !spawnOpts.spawnBackend`. Otherwise the docker→tmux silent fallback masks bugs.
6. **Enrich synthetic timeout result with `tokenUsage`** (F-8). Call `enrichResultTokenUsage(syntheticResult, taskMap.get(taskId))` before push.

### Bundle D — Documentation hygiene (~10 LoC, no behavior change)

7. **Refresh `mid-sprint-adapter.ts:186–188` historical comment** (F-7). Replace 4-sprint narrative with single line: "Wired in Sprint 154 T7 (`sprint-phases.ts:runEvaluatePhase`)."
8. **Add ADR-024 sub-module-inheritance comment** above `result-collector.ts:42` tmux import (F-11).
9. **Pin `max_reroutes = 0` semantics** in JSDoc of `MidSprintAdapter` constructor (F-15).
10. **Extract magic numbers** in `estimateTokenUsage` to named constants (F-13).

### Bundle E — Deferrable / low-impact

- F-9 (HEARTBEAT race): mitigated by 5 s polling — defer unless real-world drops observed.
- F-10 (cleanup of question files): consolidate into a `cleanupCollectedTask(taskId)` helper called from inside `collectResults`.
- F-16 (greedy regex): replace with line-based parsing or vitest's structured reporter API.
- F-17 (rerouteAttempts memory): add inline doc — no current bug.
- F-18 (ADR-035 channel codes): tracked separately under ADR-035 follow-up.
- F-19 (purity violation in `shouldReroute`): defer; rename to `prepareReroute` or move mutation into `applyReroute`.
- F-20 (banner density): cosmetic.

### Effort estimate (rough)

| Bundle | LoC delta | Effort |
|--------|----------:|--------|
| A | −80 | M |
| B | +30 | M |
| C | +10 | S |
| D | +10 | S |
| E | +20–40 | S |
| **Total** | **~0 net** | **0.5–1 sprint** |

Net code line delta is approximately zero — Bundle A removes more than B+C+D adds. Risk: ensure CLI finalize migration to `evaluateWithRubric` keeps backward-compat for `--finalize` flag in older sprint replays.

---

## ADR Cross-Reference Summary

| ADR | Relevance | Status in this audit's scope |
|-----|-----------|------------------------------|
| ADR-006 (spawnSync security) | `mid-sprint-adapter.ts:228, 258, 284` use `execSync` with literal commands + cwd + timeout | **OK** — no shell-injection surface, args are project-internal. |
| ADR-008 (Brain merkezi import) | `result-collector.ts:42` imports tmux | **OK under ADR-024 sub-module inheritance**, not documented in-file (F-11). |
| ADR-015 (TaskRouter 6-level) | `mid-sprint-adapter.ts:151` uses `routeTaskV2` with `excludeAgents` + `excludeSkills` | **OK** — exclusion path correctly threaded. |
| ADR-024 / ADR-026 (god-object split) | `result-collector.ts` extracted Phase 3 from sprint-controller | **OK** — module responsibilities are crisp. |
| ADR-027 (Hybrid Spawn Backend) | `result-collector.ts:277–308` queue spawning | **F-5** — silent fallback to tmux on missing `spawnBackend`. |
| ADR-035 (Verification Protocol) | reroute reason strings | **F-18** — free-form, not coded. |
| ADR-037 (RBAC) | `mid-sprint-adapter.ts:reconcileSpuriousNoGo:checkScopeCompliance` (l. 308) | **OK** — implements per-file scope check. |
| ADR-039 (Self-modifying detection) | n/a in these files | n/a |

No ADR violations requiring NO_GO + amendment proposal. All findings are within accepted-ADR contracts.

---

*End of audit report. Single-file output to `docs/audits/sprint-161/T-161-021-orch-adapt-collect.md` per Sprint 161 mandate.*
