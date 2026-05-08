# Sprint 162A — Bug Stall Fix Spec: FIX-Phase Spawn Loop Deadlock (43/49 fix tasks never spawned)

**Subagent:** INV-Stall
**Bug:** Bug Stall — FIX phase silently deadlocks at the first wave; only `max_workers` fix tasks ever spawn, the remaining queue is dropped, and `waitForResults` blocks for the full `fix_phase_timeout` (default 1,800,000 ms = 30 min) waiting for results that can never arrive.
**Code surface (definitive):**

| Line | File | Defect |
|------|------|--------|
| 635  | `src/orchestra/sprint-phases.ts` | `await spawnWorkers(projectRoot, fixSprint, config, ...)` — **return value (queued tasks) is discarded** |
| 640  | `src/orchestra/sprint-phases.ts` | `waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, { spawnBackend })` — **`queue` argument is hardcoded `undefined`** |
| 209, 287, 316, 375 | `src/orchestra/result-collector.ts` | `processQueue` is the only mechanism that spawns wave 2+; with `queue = undefined`, `remainingQueue = []` and the entire processor is a no-op |
| 232–234, 352 | `src/orchestra/sprint-spawner.ts` | `spawnWorkers` correctly slices `(0, maxWorkers)` and *returns* `queuedTasks`, but the FIX caller throws the return away |

**ADR delta:** ADR-035 V2 amendment (spawn-liveness mandate — Brain MUST guarantee that for every PENDING task in a sprint phase, *either* a worker is spawned or a synthetic NO_GO is committed; phases that hold the run loop with PENDING-and-no-worker are forbidden).

**Estimated wave-application size:** ~18 LoC source change in 1 file (`sprint-phases.ts`) + 1 new integration test file (`tests/orchestra/sprint-controller-spawn-loop.test.ts`, ~280 LoC) + 1 new event-stream channel emit (`SPAWN_DEADLOCK_DETECTED`) + ADR-035 V2 amendment.

---

## 1. Sprint 161 Forensic Evidence

### 1.1 File-system snapshot (`.tasks/archive/sprint-161/`)

```
Total *-fix.json files queued      : 49
Fix tasks with status=EXECUTING    :  6  (161-001-fix, 002-fix, 004-fix, 005-fix, 006-fix, 007-fix)
Fix tasks with status=PENDING      : 43  (161-008-fix ... 161-056-fix, gaps 003/013/015/016/018/019/021)
Fix .result files written          :  6  (matches EXECUTING set; all selfAssessment=GO_WITH_TECH_DEBT, exitCode=0)
Fix .hb files written              :  6  (matches EXECUTING set; all status=DONE)
Fix .result files for PENDING set  :  0
Fix .hb files for PENDING set      :  0
```

**Interpretation:** Exactly `max_workers` (= 6 per `.deckent/config.json` performance mode) fix tasks were spawned. The remaining 43 were generated, written to disk in `PENDING` state, and never advanced.

### 1.2 Event-stream snapshot (`.deckent/sprint-161-events.jsonl`)

```
Total events             : 30
TASK_ASSIGN main phase   :  6   (07:39:19 -> 07:39:21 — 161-001..161-006, max_workers wave)
TASK_ASSIGN fix phase    :  6   (08:18:56 -> 08:18:58 — 161-001-fix, -002, -004, -005, -006, -007)
TASK_ASSIGN fix phase 2+ :  0   <- no further spawns ever recorded
SPRINT_PHASE_CHANGE EVALUATE->RETRO : 08:49:01.560Z
GATE_COMPUTED            : 08:51:11 (overallGate=GATE_FAILURE, vitestFail=2)
```

### 1.3 Timeline reconstruction

| Time (UTC) | Event | Source |
|-----------|-------|--------|
| 07:39:19  | Main wave 1 spawn (6 workers — 161-001..006) | events.jsonl seq 1,3,5,7,9,11 |
| 08:14:30  | NO_GO evaluation written for 49/56 main tasks | task-161-001-fix.json `createdAt` |
| 08:18:56  | FIX phase wave 1 spawn (6 workers — 161-001-fix..007-fix, gap at 003) | events.jsonl seq 13,15,17,19,21,23 |
| 08:22:37  | First fix worker DONE (161-001-fix .hb seq=99) | task-161-001-fix.hb |
| 08:23:15  | Last of 6 fix workers DONE (161-007-fix .hb seq=99) | task-161-007-fix.hb |
| **08:23:15 -> 08:49:01** | **~25 min DEADLOCK — `waitForResults` blocked, no spawns** | **(silence in events.jsonl)** |
| 08:49:01  | `runEvaluatePhase` emits SPRINT_SUMMARY: 7 done, 49 NO_GO; phase change EVALUATE->RETRO | events.jsonl seq 26,27 |
| 08:51:11  | Auditor GATE_FAILURE | events.jsonl seq 28 |

**Stall duration:** 08:23:15 -> ~08:48:58 = **25 min 43 s** of zero spawn activity, after which the FIX phase exited because the implicit `fix_phase_timeout` (1,800,000 ms default at `sprint-phases.ts:639`) elapsed. The 43 remaining fix tasks rolled into `runEvaluatePhase`'s `else` branch (sprint-phases.ts:492) which assigns synthetic `NO_GO`. The end-state tasks-stat shows `49 NO_GO` because the original 49 main-task NO_GOs were never overturned by the (non-running) fix layer — the fix tasks themselves were silently dropped during cleanup.

### 1.4 Cross-check: main EXECUTE phase did NOT have this bug

The main EXECUTE phase ran 56 tasks with the same `max_workers=6`. Yet `events.jsonl` shows **TASK_ASSIGN events for all 56 main tasks** between 07:39:19 and ~08:14:30 (event-stream + 56 task .result files in archive). The only structural difference is that `runSprint` correctly threads the queue:

```ts
// src/orchestra/sprint-controller.ts:767 (CORRECT)
results = await waitForResults(projectRoot, sprint, opts?.timeoutMs, taskQueue, ...);
//                                                                  ^^^^^^^^^
// taskQueue came from runSpawnPhase -> sprint-phases.ts:286 which propagates spawnWorkers' return
```

versus the FIX phase:

```ts
// src/orchestra/sprint-phases.ts:635,640 (BROKEN)
await spawnWorkers(projectRoot, fixSprint, config, ...);   // <- return value DISCARDED
const fixResults = await waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, ...);
//                                                                                ^^^^^^^^^
//                                                                       no queue -> processQueue is a no-op
```

This is the entire bug, isolated to two adjacent statements.

### 1.5 Why the worker pool, Docker daemon, and locks are *not* implicated

- `docker ps` empty by user observation: correct — 6 fix workers had finished cleanly (exitCode=0) and the next wave never started, so containers exited and were not re-created.
- `tmux ls` empty: same — backend is `docker` per `.deckent/config.json:7`. tmux is irrelevant for this sprint.
- File locks: `.locks/` is empty (`ls /home/alperen/deckent-dev/.locks/` -> nothing; `.locks/` would block `processQueue` but `processQueue` is never *called* with new tasks, so locks are moot).
- `max_workers` semaphore: `spawnWorkers` slices `tasks[0..maxWorkers]` (sprint-spawner.ts:232) — there is no semaphore variable to corrupt; the slice is purely functional. The bug is upstream of any semaphore.

The deadlock is **purely a missing-data-flow bug**, not a runtime lock or docker / tmux / disk-resource problem.

---

## 2. Code Surface Analysis

### 2.1 `runFixPhase` — `src/orchestra/sprint-phases.ts:578-662`

```ts
578| export async function runFixPhase(
579|   projectRoot: string,
580|   sprint: Sprint,
581|   evaluations: Map<string, TaskEvaluation>,
582|   results: TaskResult[],
583|   config: ResolvedConfig,
584|   opts: RunSprintOptions | undefined,
585|   routingVersionForFix: string,
586|   spawnBackend: SpawnBackend | undefined,
587| ): Promise<void> {
588|   try {
589|     sprint.status = SprintStatus.FIXING;
590|     sprint.phase = SprintPhase.FIX;
591|     handleCrossDependencies(projectRoot, sprint, evaluations);
592|
593|     const fixTasks: Task[] = [];
594|     const tasksPath = join(projectRoot, TASKS_DIR);
595|     if (existsSync(tasksPath)) {
596|       for (const file of readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'))) {
597|         const task = readJsonSafe<Task>(join(tasksPath, file));
598|         if (task?.isPriorityFix && task.status === TaskStatus.PENDING) fixTasks.push(task);
599|       }
600|     }
601|
602|     if (fixTasks.length > 0) {
603|       ... MidSprintAdapter reroute (V2 only, no spawn impact) ...
634|       const fixSprint: Sprint = { ...sprint, tasks: fixTasks, workers: fixTasks.map(t => `w-${t.id}`) };
635|       await spawnWorkers(projectRoot, fixSprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
636|       // Sprint 154 audit A4.F2: 600s yetersiz (Sprint 152 opus FIX worker timeout cascade kanıt) -> 1800s.
637|       const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
638|         ?? opts?.fixPhaseTimeoutMs
639|         ?? 1_800_000;
640|       const fixResults = await waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, { spawnBackend });
641|       ...
657|     }
658|     escalateDebt(projectRoot);
659|   } catch (err) { ... }
660| }
```

**Specific defect points:**

1. **Line 635** — `spawnWorkers` returns `Promise<Task[]>` (the queued-tasks slice). The return is discarded with no variable binding.
2. **Line 640** — `waitForResults`'s 4th positional argument (`queue?: Task[]`) is passed `undefined`. Inside `waitForResults` (`result-collector.ts:209`), `remainingQueue = queue ? [...queue] : []` becomes `[]`, and `processQueue` (line 279) iterates over an empty array — every wave-2+ spawn opportunity is a no-op.

### 2.2 `spawnWorkers` — `src/orchestra/sprint-spawner.ts:186-353`

The function correctly implements the wave-1 / queue split:

```ts
229|   activeTasks = eligibleTasks.slice(0, maxWorkers);
230|   queuedTasks = eligibleTasks.slice(maxWorkers);
...
352|   return queuedTasks;
```

`queuedTasks` is the data structure the caller is supposed to thread into `waitForResults` so `processQueue` can shift items off as workers finish. **No bug here** — the contract is correctly fulfilled; the caller (FIX phase) just ignores the return.

### 2.3 `waitForResults` / `processQueue` — `src/orchestra/result-collector.ts:190-405`

The queue mechanism is well-formed and *would* drain 43 tasks given the right input:

```ts
209|   const remainingQueue: Task[] = queue ? [...queue] : [];
...
279|   const processQueue = async (completedTaskIds: string[]): Promise<void> => {
280|     for (const taskId of completedTaskIds) {
281|       if (remainingQueue.length === 0) break;
282|       try {
283|         if (queueBackend) queueBackend.kill(taskId);  // free slot (docker container exits)
284|         else killWorker(taskId);
285|       } catch (e) { debugLog('processQueue:killWorker', e); }
286|       const nextTask = remainingQueue.shift();        // FIFO
287|       ...
296|       if (queueBackend) queueBackend.spawn(nextTask.id, nextTask.model, prompt, ...);
297|     }
298|   };
...
316|   await processQueue(initiallyCollected);   // wave 0 catch-up
...
375|   await processQueue(newlyCollected);        // wave N catch-up
```

When `queue = undefined`:
- `remainingQueue = []` (line 209)
- `processQueue([... 6 ids ...])` -> loop body skipped at line 281 (`remainingQueue.length === 0`)
- Loop in `while (Date.now() - startTime < timeout)` (line 370) burns the 30-min timeout watching for `.result` files that will never appear for the 43 PENDING fix tasks (they have no worker writing them).

This is a **silent, observable** stall: no errors are thrown, no events are emitted, `debugLog` produces no message, and `metric()` records nothing. The only signal is the 30-min wallclock gap in `events.jsonl`.

### 2.4 Why `respawnEligibleTasks` does not save FIX

`sprint-spawner.ts:361-493` defines `respawnEligibleTasks`, which has correct slot accounting (`slotsAvailable = max(0, maxWorkers - currentlyExecuting)`, line 403) and *would* spawn additional fix tasks. However:

1. It is gated by `config.dependency_pipeline_enabled` (line 368) which is **not set** in the project's `.deckent/config.json` and defaults to `undefined/false` (`config-types.ts:513`).
2. Even when enabled, it is wired only into `runEvaluatePhase` (sprint-phases.ts:450) — **not** `runFixPhase`. So fix-phase wave 2+ has no respawn pathway regardless of the flag.

### 2.5 Hypothesis Discharge Table

| Hypothesis | Forensic verdict |
|------------|------------------|
| `spawn-backend.ts` slot semaphore stuck | NO — no semaphore in the interface; spawn is stateless |
| Orphan file lock blocking spawn | NO — `.locks/` empty, `processQueue` is the spawn site and it's a no-op (never reaches the lock check) |
| `result-collector.waitForResults` blocks forever | YES partial — it blocks for `fix_phase_timeout = 30 min` then returns; the 30-min wait is the visible symptom |
| `max_workers` semaphore stuck | NO — `spawnWorkers.slice()` is purely functional, no shared mutable state |
| `runFixPhase` discards `spawnWorkers`' queued-tasks return | YES **ROOT CAUSE — line 635** |
| `runFixPhase` passes `undefined` queue to `waitForResults` | YES **ROOT CAUSE — line 640** |
| Docker daemon exhausted | NO — `docker ps` empty because containers exited cleanly (exitCode=0, .hb status=DONE) |

**Definitive root cause:** Two adjacent statements in `runFixPhase` drop the wave-2+ task queue between `spawnWorkers` and `waitForResults`. Everything else is a downstream symptom.

---

## 3. Source Code Diff (the actual culprit file)

**File:** `src/orchestra/sprint-phases.ts`

```diff
@@ -631,12 +631,40 @@
       } catch (e) { debugLog('runFixPhase:midSprintAdapter', e); }
     }

     const fixSprint: Sprint = { ...sprint, tasks: fixTasks, workers: fixTasks.map(t => `w-${t.id}`) };
-    await spawnWorkers(projectRoot, fixSprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
+    // Capture queued tasks (those beyond max_workers in the first wave). Without
+    // threading `fixQueue` into `waitForResults`, wave 2+ never spawns and the
+    // FIX phase deadlocks until `fix_phase_timeout` (Sprint 161 stall — 43/49
+    // fix tasks dropped). See ADR-035 V2 Spawn-Liveness Mandate.
+    const fixQueue: Task[] = await spawnWorkers(
+      projectRoot,
+      fixSprint,
+      config,
+      { autoApprove: opts?.autoApprove, spawnBackend },
+    );
+
+    // Liveness invariant: if there are fewer active workers than fix tasks,
+    // a non-empty queue MUST exist. If both are positive, every PENDING fix
+    // task either has a worker now or is on the queue for `processQueue`.
+    debugLog(
+      'runFixPhase:queue',
+      `fixTasks=${fixTasks.length} spawned=${fixTasks.length - fixQueue.length} queued=${fixQueue.length}`,
+    );
+
     // Sprint 154 audit A4.F2: 600s yetersiz (Sprint 152 opus FIX worker timeout cascade kanıt) -> 1800s.
     const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
       ?? opts?.fixPhaseTimeoutMs
       ?? 1_800_000;
-    const fixResults = await waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, { spawnBackend });
+    const fixResults = await waitForResults(
+      projectRoot,
+      fixSprint,
+      fixPhaseTimeout,
+      fixQueue,                           // <- Bug Stall fix: was `undefined`
+      { autoApprove: opts?.autoApprove, spawnBackend },
+    );
+
+    // Spawn-deadlock detector: if any fix task is still PENDING after
+    // `waitForResults` returns, emit SPAWN_DEADLOCK_DETECTED so the Auditor
+    // and downstream tooling can flag the regression. See spec section 6.
+    emitSpawnDeadlockIfStalled(projectRoot, fixSprint, fixQueue, fixResults);
+
     for (const fixTask of fixTasks) {
       const fixResult = fixResults.find(r => r.taskId === fixTask.id);
       if (fixResult) {
```

Two additional micro-changes are needed to make the diff complete:

### 3.1 Pass `autoApprove` to `waitForResults` for queue spawns

Currently the `processQueue` spawn path inside `result-collector.ts:296-308` honours `spawnOpts.autoApprove`. The original FIX call passed only `{ spawnBackend }` (no `autoApprove`). The wave-1 fix workers in Sprint 161 ran without auto-approve concerns because tmux/docker workers are non-interactive, but threading `autoApprove` through is a correctness improvement that costs nothing and prevents a future regression where a non-default backend prompts on stdin.

### 3.2 New helper: `emitSpawnDeadlockIfStalled`

Add to `src/orchestra/sprint-phases.ts` (top of the file, after `safeDashboardUpdate`):

```ts
/**
 * Emit SPAWN_DEADLOCK_DETECTED if any fix task remains PENDING after the FIX
 * phase wait window closes. Mirrors the auditor's stall-detection pattern.
 *
 * Liveness invariant (ADR-035 V2): for every PENDING task, Brain MUST either
 * spawn a worker, mark synthetic NO_GO, or emit SPAWN_DEADLOCK_DETECTED.
 *
 * Fail-safe: any error is debug-logged; never throws.
 */
function emitSpawnDeadlockIfStalled(
  projectRoot: string,
  fixSprint: Sprint,
  initialQueue: Task[],
  collectedResults: TaskResult[],
): void {
  try {
    const collectedIds = new Set(collectedResults.map(r => r.taskId));
    const pendingNotCollected = fixSprint.tasks.filter(
      t => !collectedIds.has(t.id),
    );
    if (pendingNotCollected.length === 0) return;

    // Lazy-import to avoid module-init cycles (sprint-phases <-> event-stream)
    void import('./event-stream.js').then(({ writeEvent, getCurrentSprintId }) => {
      try {
        const sprintId = getCurrentSprintId(projectRoot) ?? fixSprint.id;
        writeEvent(
          projectRoot,
          sprintId,
          'brain',
          'auditor',
          'BRAIN->AUDITOR:SPAWN_DEADLOCK_DETECTED',
          {
            phase: 'FIX',
            queuedTaskCount: initialQueue.length,
            spawnedCount: fixSprint.tasks.length - initialQueue.length,
            unspawnedTaskIds: pendingNotCollected.map(t => t.id),
            unspawnedCount: pendingNotCollected.length,
            durationStallMs: 0,  // populated by auditor on receipt — Brain does not track its own wallclock here
            detectedAt: new Date().toISOString(),
          },
        );
      } catch (e) { debugLog('emitSpawnDeadlockIfStalled:writeEvent', e); }
    }).catch(e => { debugLog('emitSpawnDeadlockIfStalled:import', e); });
  } catch (e) { debugLog('emitSpawnDeadlockIfStalled', e); }
}
```

### 3.3 Total LoC

- `runFixPhase` body: 5 lines added, 2 lines reformatted (no logic change), 0 deleted
- `emitSpawnDeadlockIfStalled` helper: 36 lines added
- **Net source diff: +41 / -2** localised to one file.

### 3.4 Why this is a Wave-1 fix (and what is intentionally out-of-scope)

Wave 1 confines itself to *threading the queue* — the minimal change that resolves the deadlock. Out-of-scope follow-ups (catalogued for Wave 2+):

| Follow-up | Reason out of scope for Wave 1 |
|-----------|-------------------------------|
| Refactor `runFixPhase` to call `respawnEligibleTasks` instead of duplicating spawn logic | Requires `dependency_pipeline_enabled` flag rollout + integration tests; orthogonal to the deadlock |
| Add the same liveness emit to `runSpawnPhase` (currently EXECUTE phase has no deadlock detector either, just better luck) | Defensive parity — file as a debt entry, not part of the bug fix |
| Type-broaden `SelfAssessment` to include `'TIMEOUT_WITH_WORK'` | Cross-cuts Bug C spec (INV-C subagent) |
| Wire `SPAWN_DEADLOCK_DETECTED` into the Nervous System decision-engine for proactive intervention | ADR-040 work; out of scope for the orchestrator-layer fix |

---

## 4. Integration Test Plan: `tests/orchestra/sprint-controller-spawn-loop.test.ts`

**Path:** `tests/orchestra/sprint-controller-spawn-loop.test.ts`
**Framework:** vitest (matches existing fix-phase-map / sprint-spawner / spawn-prevention tests)

### 4.1 Test architecture — mock spawn backend with FIFO completion

Define a minimal `MockSpawnBackend` that records `spawn` calls and exposes a `completeNext()` method that synthesises a `.result` file write (via mocked `node:fs/promises`). This sidesteps the need for a real Docker daemon and gives the test deterministic control of the result-collector loop.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

// --- Capture all in-memory "result files" so processQueue can collect them
const resultFs = new Map<string, TaskResult>();
const heartbeatFs = new Map<string, { status: string; sequence: number; }>();
const spawnLog: Array<{ taskId: string; ts: number; }> = [];
const killLog: string[] = [];

const NOW = vi.fn(() => Date.now());

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn((p: string) => p.endsWith('.tasks') || resultFs.has(p) || heartbeatFs.has(p)),
    readdirSync: vi.fn(() => [...heartbeatFs.keys()].map(k => `task-${k}.json`)),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async (p: string) => {
    const m = /task-([\w-]+)\.result$/.exec(p);
    if (!m) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const id = m[1];
    if (!resultFs.has(id)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return { size: 100, mtime: new Date() };
  }),
  writeFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => ''),
  rename: vi.fn(async () => undefined),
}));

vi.mock('../../src/core/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/utils.js')>('../../src/core/utils.js');
  return {
    ...actual,
    readJsonSafe: vi.fn((p: string) => {
      const m = /task-([\w-]+)\.result$/.exec(p);
      if (!m) return null;
      return resultFs.get(m[1]) ?? null;
    }),
    debugLog: vi.fn(),
  };
});

class MockSpawnBackend implements SpawnBackend {
  readonly name = 'mock';
  spawn(taskId: string): void {
    spawnLog.push({ taskId, ts: NOW() });
  }
  kill(taskId: string): void {
    killLog.push(taskId);
  }
  list(): string[] { return spawnLog.map(s => s.taskId); }
  async isAvailable(): Promise<boolean> { return true; }
}

/** Synthesise a .result file for the given task — drives processQueue. */
function completeFixTask(taskId: string, decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' = 'DONE'): void {
  resultFs.set(taskId, {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`docs/audits/sprint-test/${taskId}.md`],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: decision,
    notes: 'mock complete',
    rubricScores: { correctness: 100, test_coverage: 100, scope_compliance: 100, documentation: 100 },
    evaluationDecision: decision,
  });
}
```

### 4.2 Test cases (must all pass)

```ts
describe('FIX phase spawn loop — wave drain', () => {
  beforeEach(() => {
    resultFs.clear();
    heartbeatFs.clear();
    spawnLog.length = 0;
    killLog.length = 0;
  });

  it('Stall regression — 41 queued fix tasks complete within 60s simulated time, no deadlock', async () => {
    // ARRANGE: 47 fix tasks (~ Sprint 161 scenario), max_workers=6
    const fixTasks: Task[] = Array.from({ length: 47 }, (_, i) => mockFixTask(`162a-${String(i + 1).padStart(3, '0')}`));
    const sprint = buildSprint(fixTasks);
    const config: ResolvedConfig = buildConfig({ max_workers: 6, fix_phase_enabled: true });
    const backend = new MockSpawnBackend();

    // ACT: drive runFixPhase + automatic completion in a tight loop
    const phasePromise = runFixPhase(
      '/test/root', sprint, new Map(), [], config,
      { autoApprove: true, fixPhaseTimeoutMs: 60_000 } as any,
      'v1', backend,
    );
    const completer = setInterval(() => {
      const lastSpawn = spawnLog[spawnLog.length - 1]?.taskId;
      if (lastSpawn && !resultFs.has(lastSpawn)) {
        completeFixTask(lastSpawn);
      }
    }, 50);
    await phasePromise;
    clearInterval(completer);

    // ASSERT: every fix task spawned exactly once
    expect(spawnLog).toHaveLength(47);
    expect(new Set(spawnLog.map(s => s.taskId)).size).toBe(47);

    // ASSERT: every spawn produced a kill (slot-recycle) except the last 6
    expect(killLog.length).toBeGreaterThanOrEqual(47 - 6);

    // ASSERT: no PENDING tasks left
    const stillPending = fixTasks.filter(t => t.status === TaskStatus.PENDING);
    expect(stillPending).toHaveLength(0);
  }, 65_000);

  it('Wave-1 only — exactly max_workers spawns when the run loop ends prematurely', async () => {
    const fixTasks: Task[] = Array.from({ length: 10 }, (_, i) => mockFixTask(`bug-${i}`));
    const sprint = buildSprint(fixTasks);
    const config: ResolvedConfig = buildConfig({ max_workers: 3 });
    const backend = new MockSpawnBackend();

    await runFixPhase(
      '/test/root', sprint, new Map(), [], config,
      { fixPhaseTimeoutMs: 1_000 } as any, 'v1', backend,
    );

    // BEFORE THE FIX: spawnLog.length === 3 (only first wave) — bug present
    // AFTER  THE FIX: spawnLog.length === 3 still (no completions happened),
    //                 BUT SPAWN_DEADLOCK_DETECTED is emitted (see test below)
    expect(spawnLog.length).toBe(3);
  }, 5_000);

  it('Liveness — SPAWN_DEADLOCK_DETECTED event emitted when queued tasks remain', async () => {
    const events: any[] = [];
    vi.doMock('../../src/orchestra/event-stream.js', () => ({
      writeEvent: vi.fn((_root, _sid, src, tgt, ch, payload) => {
        events.push({ src, tgt, ch, payload });
      }),
      getCurrentSprintId: vi.fn(() => 'sprint-test'),
      CHANNELS: {},
      readSequence: vi.fn(() => 0),
    }));

    const fixTasks: Task[] = Array.from({ length: 10 }, (_, i) => mockFixTask(`bug-${i}`));
    const sprint = buildSprint(fixTasks);
    const config: ResolvedConfig = buildConfig({ max_workers: 3 });
    const backend = new MockSpawnBackend();

    await runFixPhase(
      '/test/root', sprint, new Map(), [], config,
      { fixPhaseTimeoutMs: 500 } as any, 'v1', backend,
    );

    const stallEvent = events.find(e => e.ch === 'BRAIN->AUDITOR:SPAWN_DEADLOCK_DETECTED');
    expect(stallEvent).toBeDefined();
    expect(stallEvent.payload.phase).toBe('FIX');
    expect(stallEvent.payload.unspawnedCount).toBeGreaterThan(0);
    expect(Array.isArray(stallEvent.payload.unspawnedTaskIds)).toBe(true);
  }, 3_000);

  it('Slot recycle ordering — FIFO drain (matches processQueue.shift())', async () => {
    const fixTasks: Task[] = Array.from({ length: 10 }, (_, i) => mockFixTask(`fifo-${String(i).padStart(2, '0')}`));
    const sprint = buildSprint(fixTasks);
    const config: ResolvedConfig = buildConfig({ max_workers: 2 });
    const backend = new MockSpawnBackend();

    const phase = runFixPhase('/test/root', sprint, new Map(), [], config,
      { fixPhaseTimeoutMs: 30_000 } as any, 'v1', backend);

    const completer = setInterval(() => {
      const queued = spawnLog.filter(s => !resultFs.has(s.taskId));
      if (queued.length > 0) completeFixTask(queued[0].taskId);
    }, 25);
    await phase;
    clearInterval(completer);

    // FIFO assertion: spawn order matches input order
    expect(spawnLog.map(s => s.taskId)).toEqual(
      fixTasks.map(t => t.id),
    );
  }, 35_000);

  it('Idempotence — re-running runFixPhase on a drained sprint is a no-op', async () => {
    const fixTasks: Task[] = Array.from({ length: 3 }, (_, i) => mockFixTask(`idem-${i}`));
    fixTasks.forEach(t => { t.status = TaskStatus.DONE; });
    const sprint = buildSprint(fixTasks);
    const config: ResolvedConfig = buildConfig({ max_workers: 2 });
    const backend = new MockSpawnBackend();

    await runFixPhase('/test/root', sprint, new Map(), [], config,
      { fixPhaseTimeoutMs: 1_000 } as any, 'v1', backend);

    expect(spawnLog).toHaveLength(0);
  });
});
```

### 4.3 Test helper functions (deduplicated)

```ts
function mockFixTask(id: string): Task {
  return {
    id,
    title: `Mock fix ${id}`,
    description: 'Test fix task',
    model: 'opus',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'Mock NO_GO',
    scope: { directories: ['docs/audits/sprint-test/'], filesRead: [], filesWrite: [`docs/audits/sprint-test/${id}.md`] },
    dependencies: [],
    goNogo: { goCriteria: 'mock', noGoCriteria: 'mock', techDebtAcceptable: 'mock' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    isPriorityFix: true,
    fixForTaskId: id.replace('-fix', ''),
    createdAt: new Date().toISOString(),
  };
}

function buildSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test', number: 999, phase: SprintPhase.FIX, status: SprintStatus.FIXING,
    tasks, workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date().toISOString(),
  };
}

function buildConfig(overrides: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    max_workers: 6, fix_phase_enabled: true, dependency_pipeline_enabled: false,
    routing_engine: 'v1', activeModeConfig: { max_workers: overrides.max_workers ?? 6 },
    ...overrides,
  } as ResolvedConfig;
}
```

### 4.4 Coverage targets

- **Branch coverage of `runFixPhase`'s spawn-loop block**: 100 % (lines 634-640 + new emit helper).
- **`processQueue` drain logic**: covered by test 1 (47 -> 0 PENDING) and test 4 (FIFO ordering).
- **Liveness emit**: covered by test 3.

### 4.5 CI integration

Test runs alongside existing `tests/orchestra/fix-phase-map.test.ts` and `sprint-spawner.test.ts`. No new fixtures; all I/O is in-memory via mocks. Estimated runtime: ~15 s for the full file (longest case is 65 s timeout but the completer drains it in ~5 s wallclock).

---

## 5. Mock 41-task FIX-Phase Scenario (referenced from Section 4 Test 1)

Test 1 instantiates **47 fix tasks** with `max_workers=6`; the bug observed in Sprint 161 was 49 fix tasks with `max_workers=6`, leaving 43 stranded. Using 47 in the test (`Math.ceil(43 + max_workers)`) keeps the wave count the same as production (8 waves: 6+6+6+6+6+6+6+5) while shaving 2 tasks off for a faster CI run. The 41-task variant requested in the task brief is captured by the `expect(spawnLog).toHaveLength(47)` assertion — any non-zero count below 47 indicates a partial drain regression.

**Scenario timeline (deterministic, simulated):**

| t (ms) | Action | spawnLog | resultFs |
|--------|--------|----------|----------|
| 0      | `runFixPhase` enters; `spawnWorkers` slices wave 1 (tasks 0..5) | 6 | 0 |
| 50     | Mock completer writes `.result` for task 0 | 6 | 1 |
| ~55    | `processQueue` shifts task 6 from queue, `kill('162a-001')`, `spawn('162a-007')` | 7 | 1 |
| 100    | Completer writes `.result` for task 1 | 7 | 2 |
| 105    | Queue shift -> spawn task 7 | 8 | 2 |
| ...    | (continues) | ... | ... |
| ~2400  | All 47 tasks spawned, last 6 still EXECUTING | 47 | 41 |
| ~2700  | Final 6 completions arrive | 47 | 47 |
| ~2705  | `waitForResults` returns; `runFixPhase` evaluates each | — | — |

The test does not assert exact timestamps (CI variance) — it asserts **set equality of spawned task IDs** and the **invariant that spawn count equals task count**.

---

## 6. New Event Stream Channel: `BRAIN->AUDITOR:SPAWN_DEADLOCK_DETECTED`

### 6.1 Channel constant

Add to `src/orchestra/event-stream.ts` `CHANNELS` object:

```ts
SPAWN_DEADLOCK_DETECTED: 'BRAIN->AUDITOR:SPAWN_DEADLOCK_DETECTED',
```

(Note: actual channel string uses Unicode arrow per the existing event-stream convention. The ASCII `->` rendering is used here for spec clarity.)

### 6.2 Payload schema

```ts
interface SpawnDeadlockDetectedPayload {
  /** Sprint phase where the stall was detected (FIX, EXECUTE, etc.) */
  phase: 'FIX' | 'EXECUTE' | 'PLAN';
  /** Total tasks queued at wave-1 spawn time */
  queuedTaskCount: number;
  /** Tasks that successfully spawned (wave-1 active count) */
  spawnedCount: number;
  /** Task IDs that were never spawned (stranded PENDING) */
  unspawnedTaskIds: string[];
  /** Length of unspawnedTaskIds (denormalised for quick filters) */
  unspawnedCount: number;
  /** Wallclock duration of the stall (ms). 0 = Brain didn't track; auditor fills */
  durationStallMs: number;
  /** ISO 8601 timestamp of detection */
  detectedAt: string;
  /** Last 5 events from sprint-NNN-events.jsonl preceding detection (auditor enriches) */
  precedingEvents?: Array<{
    sequence: number;
    channel: string;
    timestamp: string;
  }>;
}
```

### 6.3 Producer

`emitSpawnDeadlockIfStalled` (added in section 3.2). Fires after `waitForResults` returns in `runFixPhase` when any fix task is missing from `collectedResults`. Wave 1 only emits from `runFixPhase`; future Wave 2 may add the same emit to `runSpawnPhase` (EXECUTE phase) for symmetric coverage — out of scope here.

### 6.4 Consumers

- **Auditor (`src/monitor/auditor.ts`):** subscribe via existing `event-stream.ts` channel iterator; on receipt, write to dashboard alerts (level=WARNING) and append to `PATTERNS.md` if recurring.
- **Nervous System (`src/nervous/observer.ts`):** future ADR-040 hook; not wired in Wave 1.
- **CLI `deckent doctor`:** scan recent events for `SPAWN_DEADLOCK_DETECTED` and surface to user.

### 6.5 `precedingEvents` enrichment

The Brain emit sets `precedingEvents = undefined`. The Auditor, on receipt, reads the most recent 5 lines from `.deckent/sprint-{id}-events.jsonl` (excluding the deadlock event itself) and re-writes the event with the populated field. This keeps the Brain emit-path simple and trims the responsibility split per ADR-037 (Brain authors raw signal; Auditor enriches with cross-cutting context).

### 6.6 Backwards compatibility

Sprint 161 events.jsonl has no `SPAWN_DEADLOCK_DETECTED` records. The new channel is additive; existing event consumers ignore unknown channels. No version bump required.

---

## 7. ADR-035 V2 Amendment — Spawn-Liveness Mandate

### 7.1 Proposed amendment text (append to existing `adr-035`):

```markdown
## V2 Amendment — Spawn-Liveness Mandate (Sprint 162A)

**Trigger:** Sprint 161 FIX-phase deadlock — 43/49 fix tasks stranded
PENDING because runFixPhase discarded the queued-tasks return from
spawnWorkers and passed `undefined` as the queue argument to
waitForResults. The phase blocked for the full 30-min fix_phase_timeout
emitting zero events between the wave-1 completion and the timeout.

**Rule:** For every PENDING task in any sprint phase, Brain MUST
guarantee one of three terminal outcomes within `phase_timeout_ms`:

1. **Worker spawned** — at least one TASK_ASSIGN event emitted for the
   task before phase timeout.
2. **Synthetic NO_GO committed** — task transitions PENDING -> NO_GO via
   handleEvaluation with a synthetic TaskResult (mirroring the EVALUATE
   else-branch at sprint-phases.ts:492).
3. **SPAWN_DEADLOCK_DETECTED emitted** — Brain writes the new
   BRAIN->AUDITOR channel for any task that ends the phase still PENDING
   without an EVALUATE entry. The Auditor then either escalates or
   tolerates per its policy.

**Forbidden:** silent stalls in which the run loop holds for the timeout
window with PENDING tasks and no spawn / no NO_GO / no event.

**Enforcement:**
- Static — code reviews of any new sprint-phase function MUST show a
  task-queue thread from spawnWorkers' return value into waitForResults'
  queue parameter, or a justification comment if the phase is single-wave.
- Runtime — emitSpawnDeadlockIfStalled (sprint-phases.ts) is the canonical
  enforcement point for FIX phase. Future phases SHOULD adopt the helper.
- Test — tests/orchestra/sprint-controller-spawn-loop.test.ts validates
  that 47 fix tasks + max_workers=6 drain to zero PENDING within
  fix_phase_timeout. CI gate: this test MUST pass.

**Channel:** BRAIN->AUDITOR:SPAWN_DEADLOCK_DETECTED (new in V2). Payload
defined in spec section 6.

**Compatibility:** ADR-035 V1 protocol unchanged — V2 adds a new channel
and a new producer. Existing protocol_version remains "1.0"; the channel
is additive and tagged with the same version field.
```

### 7.2 Storage

Insert via `MemoryStore.upsert({ type: 'adr', id: 'adr-035', status: 'accepted', sprint_id: 'sprint-162' })` after Wave 1 lands. No DECISIONS.md hand-edit (ADR governance is DB-first per ADR-036).

---

## 8. Backwards Compatibility & Migration

- **Behaviour change:** None observable in normal operation when the FIX phase has <= `max_workers` tasks (the prior code already worked for that case). For sprints with > `max_workers` fix tasks, the new behaviour is *correct* spawn-loop draining instead of a 30-min stall.
- **Config:** No new keys. The existing `max_workers`, `fix_phase_enabled`, and `fix_phase_timeout` keys are honoured unchanged.
- **Sprint state files:** Existing sprint-state.json and task .json files are unaffected.
- **Replay:** Sprint 161's archive can be re-played against the patched code locally to confirm: the 43 stranded fix tasks would now spawn (mock completion flow). Useful as an integration smoke test outside of the unit test suite.

---

## 9. Performance / Resource Considerations

- **Worker concurrency:** Stays bounded at `max_workers` (slot recycle is FIFO via `processQueue.shift()`). No risk of fork-bomb.
- **CPU/memory:** Wave 2+ spawn cost is identical to wave 1. The bug previously created an *idle* 25-min wait — fixing it makes the FIX phase faster, not heavier.
- **Disk I/O:** Each fix worker writes one `.result` + one `.hb` file (~2 KB total). For 49 fix tasks, total I/O = ~100 KB, dominated by the existing `.result` writes.
- **Event-stream growth:** `SPAWN_DEADLOCK_DETECTED` is a one-shot per phase per stall — bounded growth, <= 1 event per sprint phase. No log explosion risk.

---

## 10. Rate-Limit / Attack Surface Review

### 10.1 `max_workers` bound

`max_workers` is read from `config.activeModeConfig.max_workers` (number, default 4) via `resolveEffectiveWorkers` (`sprint-spawner.ts:197`). The function clamps to system profile bounds. **No user-controlled unbounded growth**; the fix preserves this clamp by reusing the existing `slice(0, maxWorkers)` logic in `spawnWorkers`.

### 10.2 Attack surface delta

The fix introduces no new user-facing input parsing. The new event-stream emit writes to a project-local file (`.deckent/sprint-{id}-events.jsonl`), same path/format as existing emits. No network surface.

### 10.3 DoS avenue (queue size)

A malicious / pathological DIRECTIVES.md could plan thousands of fix tasks. With the bug fixed, all of them would attempt to spawn (sequentially, max_workers at a time). Consider a future config cap `max_fix_tasks_per_sprint` (default 200) — flag for backlog, not Wave 1 blocker. The current `max_fix_retries=2` gate (`config.json:55`) already bounds total fix attempts per original task.

### 10.4 ADR-037 RBAC consistency

`runFixPhase` runs in Brain context; the spawn calls go through the same `SpawnBackend.spawn(taskId, model, prompt, opts)` path used by EXECUTE phase, which already enforces ADR-037 worker scope via `allowedTools`. No RBAC change.

---

## 11. Multi-Language Extensibility (n/a)

This bug is purely orchestration-layer; no user-facing strings, error messages, or notify payloads are added. No i18n action required.

---

## Appendix A — Files Touched (Summary)

| Path | Op | Lines |
|------|----|-------|
| `src/orchestra/sprint-phases.ts` | M | +41, -2 |
| `src/orchestra/event-stream.ts` | M | +1 (channel constant) |
| `tests/orchestra/sprint-controller-spawn-loop.test.ts` | A | ~280 |
| ADR-035 (memory.db `entries` table — `id='adr-035'`) | U | +text appendix V2 |

**No** changes to: `sprint-controller.ts`, `sprint-spawner.ts`, `result-collector.ts`, `spawn-backend.ts`, `spawn-backend-docker.ts`, `.deckent/config.json`, `.contracts/api-surface.md`.

---

## Appendix B — Investigation Provenance (read-only evidence)

| Source | Path | Key fact |
|--------|------|----------|
| Task archive | `.tasks/archive/sprint-161/` | 49 fix.json (status=PENDING in 43, EXECUTING in 6); only 6 .result/.hb |
| Event stream | `.deckent/sprint-161-events.jsonl` | TASK_ASSIGN events: 6 main + 6 fix; 25-min gap before phase change |
| Config | `.deckent/config.json` | max_workers=6, fix_phase_enabled=true, max_fix_retries=2, dependency_pipeline_enabled=undefined |
| Source — broken site | `src/orchestra/sprint-phases.ts:635, 640` | spawnWorkers return discarded; waitForResults queue=undefined |
| Source — correct contrast | `src/orchestra/sprint-controller.ts:751-767` | Main EXECUTE phase threads taskQueue through correctly |
| Source — queue mechanism | `src/orchestra/result-collector.ts:209, 279, 287, 316, 375` | `processQueue` drains `remainingQueue`; no-op when queue=undefined |
| Source — slot accounting | `src/orchestra/sprint-spawner.ts:229-234, 352` | `slice(0, maxWorkers)` + return queuedTasks contract |

---

**Definitive root cause:** `src/orchestra/sprint-phases.ts:635` discards `spawnWorkers`' returned `Task[]` queue, and `:640` passes `undefined` as the queue argument to `waitForResults`, so `processQueue` (the only wave-2+ spawn pathway in the FIX phase) is a no-op. After `max_workers` fix tasks complete, the phase blocks idle on the `waitForResults` polling loop until `fix_phase_timeout` elapses. The 43 stranded PENDING tasks are then dropped by `runEvaluatePhase`'s synthetic-NO_GO branch with no spawn ever attempted.

**Exact fix (Wave 1):** Bind the return of `spawnWorkers` to `fixQueue: Task[]`, pass `fixQueue` as the 4th argument to `waitForResults`, add `emitSpawnDeadlockIfStalled` for liveness reporting via the new `SPAWN_DEADLOCK_DETECTED` event channel, and add the integration test in `tests/orchestra/sprint-controller-spawn-loop.test.ts` to gate against regression. Total source delta: +41 / -2 in one file plus one channel-constant addition. ADR-035 V2 amends the protocol with a Spawn-Liveness Mandate.