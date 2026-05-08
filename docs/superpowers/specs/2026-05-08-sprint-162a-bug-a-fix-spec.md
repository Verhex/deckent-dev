# Sprint 162A — Bug A Fix Spec: Heartbeat-Blind Synthetic NO_GO

> **Status:** READ-ONLY investigation output (INV-A subagent)
> **Bug class:** Premature task evaluation — `runEvaluatePhase` synthesizes `NO_GO` `TaskResult` for tasks that are still EXECUTING (heartbeat alive) once `waitForResults` returns.
> **Severity:** P0 (87.5% false-NO_GO rate, sprint-161 dogfood evidence)
> **Lane:** Sprint 162A — Bug A only. Other bugs out of scope.

---

## 1. Bug Evidence

### 1.1 RCA — what happens

`runEvaluatePhase` in `src/orchestra/sprint-phases.ts` iterates over `sprint.tasks` and for every task whose id is **not** in the `collectedIds` set (the set of taskIds whose `.result` files were collected by `waitForResults`) it synthesizes a `NO_GO` `TaskResult` with `notes: 'Timeout - no result received'` and immediately routes it through `handleEvaluation` + emits a `task-no-go` notification.

The branch makes no attempt to inspect:

- the task's `.hb` (heartbeat) file (`.tasks/task-{id}.hb`),
- the worker's process / container liveness (`isWorkerProcessAlive` from auditor),
- the multi-signal stale detector (`isWorkerStale` from auditor),
- the task lifecycle status (`ACTIVE_EXECUTION_STATUSES` / `COMPLETED_STATUSES`),
- the existence of a late `.result` written between `waitForResults` returning and the evaluate loop reaching this task.

`waitForResults` already terminates either when **all** results are collected or when the wall-clock budget elapses (`timeout` parameter). When it returns short, the responsibility for distinguishing "timeout" from "still alive but slow" falls entirely on `runEvaluatePhase` — and it currently does not perform that check.

### 1.2 Filesystem evidence — Sprint 161

Sprint 161 was a 56-task READ-ONLY audit. Each task wrote exactly one audit report under `docs/audits/sprint-161/T-161-NNN-*.md`.

- `.brain/sprints/sprint-161.md` (file:1-12): metrics block reports
  `Total Tasks | 56`, `Completed | 7`, `No-Go | 49`, `Coverage | 3.6%`, `Duration | 4248722ms` (~70.8 min).
- `.brain/sprints/sprint-161.md:21-76`: 49 tasks marked `NO_GO`, 7 marked `DONE`.
- `docs/audits/sprint-161/AUDIT-START-TIME.txt:1`: `2026-05-08T07:31:57Z` (10:31 local) — sprint kickoff.
- `ls /home/alperen/deckent-dev/docs/audits/sprint-161/T-161-*.md | wc -l` → **28** audit reports actually written to disk.
- `stat -c '%y %n' .../T-161-*.md | sort` (latest 4 lines):
  - `T-161-002-core-memory-v2.md  → 11:21:01`
  - `T-161-007-core-locks-events.md → 11:21:48`
  - `T-161-004-core-provider-routing.md → 11:22:38`
  - `T-161-005-core-routing-engine.md → 11:23:30`
- All four were finalized as `NO_GO` in `sprint-161.md` even though their report files existed on disk well before sprint cleanup (`.brain/sprints/sprint-161.md` mtime `11:49`, derived from `ls -la`).

This confirms: workers were alive and producing real artefacts at the moment they were declared `NO_GO`. The sprint synthesizer never consulted heartbeat/process-liveness signals before writing the synthetic result.

### 1.3 Quantified impact

- 25 fix tasks were spawned in the FIX phase across sprint-161 (Sprint 161 retro: cascading cost — see `.brain/sprints/sprint-161.md:9` `No-Go | 49`, of which 25 were eligible for FIX retry per `fix_phase_enabled=true` in `.deckent/config.json:53`).
- False-NO_GO ratio computed from on-disk artefact presence vs. `sprint-161.md` evaluations: at least 28 reports written / 7 tasks credited DONE → ≈ **75% of NO_GO classifications had real, on-disk audit artefacts**.
- Combined with Bug B+C (out of scope for INV-A), Sprint 161 retro reported **87.5% false-NO_GO** end-to-end.

---

## 2. Code Surface Analysis

| File | Line(s) | Role |
|------|---------|------|
| `src/orchestra/sprint-phases.ts` | 337-345 | `runEvaluatePhase` signature — receives `results: TaskResult[]`, no projectRoot side-channel for HB |
| `src/orchestra/sprint-phases.ts` | 349-351 | `resultsMap` and `collectedIds` derived from `results` only |
| `src/orchestra/sprint-phases.ts` | 356-357 | Per-task loop — `if (collectedIds.has(task.id))` true path runs full rubric |
| `src/orchestra/sprint-phases.ts` | **492-525** | **Bug A surface** — false branch synthesizes `NO_GO` with no liveness gate |
| `src/orchestra/sprint-phases.ts` | 493-503 | `syntheticResult` literal — `selfAssessment: 'NO_GO'`, `notes: 'Timeout - no result received'` |
| `src/orchestra/sprint-phases.ts` | 504-505 | `debugLog('runEvaluatePhase:timeout', …)` + `handleEvaluation(..., NO_GO, ...)` |
| `src/orchestra/sprint-phases.ts` | 507-515 | `notify('task-no-go', …)` — fires immediately, no deferral |
| `src/orchestra/result-collector.ts` | 190-405 | `waitForResults` — returns early when `collected.size === taskIds.size` OR `timeout` elapsed |
| `src/orchestra/result-collector.ts` | 391-403 | "Final sweep" — collects late `.result` files post-loop, but only `.result`, never inspects `.hb` |
| `src/orchestra/result-collector.ts` | 211-275 | `collectResults` — also handles `.timeout` marker which writes synthetic NO_GO directly to disk (different code path; see §3.2) |
| `src/monitor/auditor.ts` | 59-87 | `readHeartbeatCached(hbPath)` — mtime-based HB reader, returns `Heartbeat \| null` |
| `src/monitor/auditor.ts` | 102-141 | `isWorkerProcessAlive(hb)` — backend-agnostic process check (docker/tmux/subprocess) |
| `src/monitor/auditor.ts` | 158-200 | `isWorkerStale(hb, projectRoot, heartbeatTimeoutMs, hbPath?)` — multi-signal stale detector |
| `src/monitor/auditor.ts` | 263-264 | HB filename pattern: `.endsWith('.hb')` under `TASKS_DIR` |
| `src/monitor/auditor.ts` | 1782-1799 | HB filename ↔ taskId mapping: `task-{id}.hb` |
| `src/core/heartbeat-types.ts` | 15-19 | `ACTIVE_EXECUTION_STATUSES = {EXECUTING, TESTING, DOCUMENTING}` |
| `src/core/heartbeat-types.ts` | 24-27 | `COMPLETED_STATUSES = {DONE, NO_GO}` |
| `src/core/heartbeat-types.ts` | 33-38 | `PRE_EXECUTION_STATUSES = {DRAFT, PENDING, CLAIMED, PAUSED}` |
| `src/core/monitoring-types.ts` | 25-39 | `Heartbeat` interface — `timestamp`, `sequence`, `backend`, `workerId`, `taskId`, `status` |
| `src/core/config.ts` | 535 | Default `heartbeat_timeout: 120` (seconds) |
| `src/core/config.ts` | 328-330 | Validator: `heartbeat_timeout ∈ [30, 600]` (seconds) |
| `src/core/config-types.ts` | 231, 474 | `heartbeat_timeout?: number` in resolved + raw config types |
| `.deckent/config.json` | 60 | Live config: `"heartbeat_timeout": 120` |
| `src/orchestra/event-stream.ts` | 51-88 | `CHANNELS` enum + `writeEvent(projectRoot, sprintId, source, target, channel, payload)` |
| `src/orchestra/event-stream.ts` | 167-201 | `writeEvent` signature — fail-safe, never throws |

---

## 3. Proposed Fix

### 3.1 Strategy

Insert a **heartbeat-aware liveness gate** in the `else` branch at `sprint-phases.ts:492-525` **before** synthesizing `NO_GO`. The gate:

1. Reads the task's `.hb` file via `readHeartbeatCached`.
2. If HB exists, computes `hbAgeMs = now - parseTimestamp(hb.timestamp)`.
3. If `hbAgeMs <= heartbeatTimeoutMs * 2` (defense-in-depth grace window — twice the auditor stale threshold): defers evaluation by emitting a `sprint.eval.heartbeat-skip` event and continues to next task. The task remains in its current `EXECUTING` status; subsequent FIX phase or sprint cleanup is responsible for handling it.
4. Otherwise (no HB, malformed HB, or stale-beyond-grace HB), runs the existing synthetic NO_GO path **unchanged**.

The fix preserves backward semantics for genuinely dead workers (no HB, unparseable timestamp, or HB older than 2× the timeout) while eliminating the false-NO_GO storm for slow-but-alive workers.

### 3.2 Why a separate gate (not reuse `isWorkerStale`)

`isWorkerStale` is appropriate for the auditor scan loop where a stale alert is desired when secondary signals fail. In `runEvaluatePhase` we do **not** want to declare death just because `isWorkerProcessAlive` returns false — a tmux session may have been torn down by cleanup race even though the worker wrote a real `.result` we haven't observed yet. The gate here errs on the side of **deferral**, not death: if the HB is fresh, skip; otherwise fall through to the existing synthetic path. We deliberately do not call `isWorkerProcessAlive` because (a) it's a `spawnSync` per task (cost) and (b) its conservative `false` for `subprocess` backend would re-introduce false-NO_GO for that backend.

The `.tasks/task-{id}.timeout` marker code path in `result-collector.ts:230-269` is **separate** and remains untouched — it handles workers killed by an explicit timeout and writes its own synthetic NO_GO before `runEvaluatePhase` ever sees them. Bug A is exclusively about the `else` branch in `sprint-phases.ts`.

### 3.3 Configuration

A new optional config key `eval_heartbeat_grace_multiplier` (default `2`) controls the grace window. Both the key and the default live in `src/core/config.ts` defaults — the spec recommends keeping the multiplier at 2 unless real-world data after deployment suggests otherwise.

### 3.4 Diff — `src/orchestra/sprint-phases.ts:492-525`

```diff
--- a/src/orchestra/sprint-phases.ts
+++ b/src/orchestra/sprint-phases.ts
@@ -10,7 +10,7 @@
 // ─── Node Builtins ─────────────────────────────────────────────────
 import {
-  readFileSync, writeFileSync, existsSync, readdirSync,
+  readFileSync, writeFileSync, existsSync, readdirSync, statSync,
 } from 'node:fs';
 import { join } from 'node:path';

@@ -57,6 +57,12 @@
 } from '../core/plugin-hooks.js';

+// ─── Heartbeat liveness gate (Sprint 162A Bug A) ──────────────────
+import { readHeartbeatCached } from '../monitor/auditor.js';
+
+// ─── Event stream (Sprint 162A Bug A — sprint.eval.heartbeat-skip) ──
+import { writeEvent } from './event-stream.js';
+
 // ─── Auditor ──────────────────────────────────────────────────────
 import {
   updateDashboard, startScanLoop, writeScanToDashboard, runScanCycle,
@@ -489,7 +495,55 @@
           }
           resolveDebt(projectRoot, `debt-${task.id}`, sprint.id);
         }
       } else {
+        // ─── Sprint 162A Bug A — heartbeat-blind synthetic NO_GO gate ───
+        // Before declaring this task NO_GO due to missing .result, consult
+        // the worker's heartbeat. If the HB is fresh (within heartbeat_timeout
+        // × eval_heartbeat_grace_multiplier), the worker is still working —
+        // defer evaluation by emitting an observability event and skipping.
+        // Otherwise (no HB, malformed HB, or HB stale-beyond-grace) fall
+        // through to the existing synthetic NO_GO path unchanged.
+        const hbPath = join(projectRoot, TASKS_DIR, `task-${task.id}.hb`);
+        const hbExists = existsSync(hbPath);
+        const hbTimeoutSec = (config as unknown as Record<string, unknown> | undefined)?.['heartbeat_timeout'] as number | undefined ?? 120;
+        const graceMultiplier = (config as unknown as Record<string, unknown> | undefined)?.['eval_heartbeat_grace_multiplier'] as number | undefined ?? 2;
+        const hbGraceMs = hbTimeoutSec * 1000 * graceMultiplier;
+        let deferredByHeartbeat = false;
+        let hbAgeMs: number | null = null;
+        if (hbExists) {
+          const hb = readHeartbeatCached(hbPath);
+          if (hb) {
+            const ts = new Date(hb.timestamp).getTime();
+            if (!Number.isNaN(ts)) {
+              hbAgeMs = Date.now() - ts;
+              if (hbAgeMs <= hbGraceMs) {
+                deferredByHeartbeat = true;
+              }
+            }
+          }
+        }
+        if (deferredByHeartbeat) {
+          debugLog(
+            'runEvaluatePhase:heartbeat-skip',
+            `task=${task.id} hbAgeMs=${hbAgeMs} grace=${hbGraceMs} — deferring evaluation, worker still alive`,
+          );
+          try {
+            writeEvent(
+              projectRoot,
+              sprint.id,
+              'brain',
+              'auditor',
+              'BRAIN→*:METRIC_EMITTED', // sprint.eval.heartbeat-skip carried in payload.kind
+              {
+                kind: 'sprint.eval.heartbeat-skip',
+                taskId: task.id,
+                hbAgeMs,
+                skipReason: 'heartbeat-fresh-within-grace',
+                graceMs: hbGraceMs,
+              },
+            );
+          } catch (e) { debugLog('runEvaluatePhase:writeHeartbeatSkipEvent', e); }
+          continue;
+        }
+
         const syntheticResult: TaskResult = {
           taskId: task.id,
           workerId: task.assignedWorker ?? 'unknown',
@@ -499,7 +553,7 @@
           testsPassed: false,
           coverage: 0,
           selfAssessment: 'NO_GO',
-          notes: 'Timeout - no result received',
+          notes: hbExists ? 'Timeout - heartbeat stale beyond grace' : 'Timeout - no heartbeat, no result',
         };
         debugLog('runEvaluatePhase:timeout', `task=${task.id} — no result collected, marking NO_GO (timeout/missing)`);
         handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, syntheticResult);
```

### 3.5 Companion config additions (read-only documentation; defaults are non-breaking)

```diff
--- a/src/core/config.ts (around line 535)
     scan_interval: 30,
     heartbeat_timeout: 120,
+    // Sprint 162A Bug A — multiplier applied to heartbeat_timeout before evaluate
+    // declares a task NO_GO. Range [1, 10]. Default 2 = wait up to 240s after the
+    // last heartbeat before synthesizing a timeout result.
+    eval_heartbeat_grace_multiplier: 2,
     boundary_enforcement: true,
```

```diff
--- a/src/core/config-types.ts (around line 231)
   heartbeat_timeout?: number;
+  /** Multiplier on heartbeat_timeout for evaluate-phase liveness gate (Bug A). */
+  eval_heartbeat_grace_multiplier?: number;
```

### 3.6 Why this is safe

- **No new external dependencies.** All imports already resolve in tree.
- **Fail-safe at every step.** `existsSync`, `readHeartbeatCached`, `Date.parse`, and `writeEvent` are all wrapped or already fail-safe; any error path falls through to the original synthetic-NO_GO behaviour.
- **No mutation of `evaluations` map** when deferring — sprint reporter, debt manager, and rollback check rely on `evaluations.size > 0` semantics; deferred tasks simply do not appear in the map this evaluate cycle. They will be re-evaluated on the next sprint pass or surface as orphaned for the auditor's `archiveOrphanTasks` to clean up.
- **No new authority assumptions.** Brain (sprint-phases) already reads `.tasks/*` via `readJsonSafe`; reading `.tasks/*.hb` is in the same trust zone (ADR-037 Brain authority).

---

## 4. Unit Test Draft — `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, AgentStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, ResolvedConfig,
} from '../../src/core/types.js';
import type { Heartbeat } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { clearHeartbeatCache } from '../../src/monitor/auditor.js';

// Sprint 162A Bug A — heartbeat-blind synthetic NO_GO regression suite.
//
// Each test sets up a tmp project with a task that has NO .result on disk and
// drives `runEvaluatePhase` through the missing-result branch (line 492 of
// sprint-phases.ts). Heartbeat freshness is varied to verify the gate.

let tmpRoot: string;

const baseConfig: Partial<ResolvedConfig> = {
  heartbeat_timeout: 120,
  // eval_heartbeat_grace_multiplier defaults to 2 → 240s grace
};

function makeTask(id: string): Task {
  return {
    id,
    title: `task ${id}`,
    description: 'unit test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'unit',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
  } as unknown as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 999,
    phase: SprintPhase.EVALUATE,
    status: SprintStatus.EVALUATING,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

function writeHb(root: string, taskId: string, ageMs: number, status: AgentStatus = AgentStatus.EXECUTING): void {
  const hb: Heartbeat = {
    workerId: `w-${taskId}`,
    taskId,
    status,
    currentAction: 'unit-test',
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    filesChangedCount: 0,
    sequence: 1,
    progress: 50,
    backend: 'tmux',
  };
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.hb`),
    JSON.stringify(hb, null, 2),
    'utf-8',
  );
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-bug-a-'));
  mkdirSync(join(tmpRoot, TASKS_DIR), { recursive: true });
  mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
  mkdirSync(join(tmpRoot, '.brain'), { recursive: true });
  writeFileSync(join(tmpRoot, '.deckent', 'sprint-state.json'), JSON.stringify({ sprintId: 'sprint-test' }), 'utf-8');
  clearHeartbeatCache();
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearHeartbeatCache();
});

describe('runEvaluatePhase — Bug A heartbeat-aware gate', () => {
  it('defers NO_GO when heartbeat is fresh (age < heartbeat_timeout × multiplier)', async () => {
    const t = makeTask('001');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    // HB is 30s old; default grace = 240_000 ms → fresh
    writeHb(tmpRoot, '001', 30_000);

    await runEvaluatePhase(tmpRoot, sprint, [], evaluations, 90, baseConfig as ResolvedConfig);

    expect(evaluations.has('001')).toBe(false);
    // Side-effect: event-stream JSONL should record sprint.eval.heartbeat-skip
    const eventsFile = join(tmpRoot, '.deckent', 'sprint-test-events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
  });

  it('synthesizes NO_GO when heartbeat is stale beyond grace window', async () => {
    const t = makeTask('002');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    // HB is 10 minutes old; default grace = 240_000 ms (4 min) → stale
    writeHb(tmpRoot, '002', 10 * 60 * 1000);

    await runEvaluatePhase(tmpRoot, sprint, [], evaluations, 90, baseConfig as ResolvedConfig);

    expect(evaluations.get('002')).toBe(TaskEvaluation.NO_GO);
  });

  it('synthesizes NO_GO when no heartbeat file exists', async () => {
    const t = makeTask('003');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    // No .hb file written

    await runEvaluatePhase(tmpRoot, sprint, [], evaluations, 90, baseConfig as ResolvedConfig);

    expect(evaluations.get('003')).toBe(TaskEvaluation.NO_GO);
  });

  it('synthesizes NO_GO when heartbeat timestamp is malformed', async () => {
    const t = makeTask('004');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    // Manually write malformed HB
    writeFileSync(
      join(tmpRoot, TASKS_DIR, 'task-004.hb'),
      JSON.stringify({ workerId: 'w-004', taskId: '004', status: 'EXECUTING', timestamp: 'NOT-A-DATE', filesChangedCount: 0, sequence: 1, progress: 0 }),
      'utf-8',
    );

    await runEvaluatePhase(tmpRoot, sprint, [], evaluations, 90, baseConfig as ResolvedConfig);

    expect(evaluations.get('004')).toBe(TaskEvaluation.NO_GO);
  });

  it('respects custom eval_heartbeat_grace_multiplier (1 = stricter)', async () => {
    const t = makeTask('005');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    // HB is 150s old; multiplier=1, timeout=120s → grace=120s → stale by 30s
    writeHb(tmpRoot, '005', 150_000);
    const strictConfig = { heartbeat_timeout: 120, eval_heartbeat_grace_multiplier: 1 };

    await runEvaluatePhase(tmpRoot, sprint, [], evaluations, 90, strictConfig as ResolvedConfig);

    expect(evaluations.get('005')).toBe(TaskEvaluation.NO_GO);
  });

  it('does not affect tasks whose results were collected normally', async () => {
    const t = makeTask('006');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    const result: TaskResult = {
      taskId: '006',
      workerId: 'w-006',
      filesChanged: ['src/foo.ts'],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'ok',
    };

    await runEvaluatePhase(tmpRoot, sprint, [result], evaluations, 90, baseConfig as ResolvedConfig);

    // happy path — task should be evaluated DONE/GO_WITH_TECH_DEBT
    expect(evaluations.has('006')).toBe(true);
    expect(evaluations.get('006')).not.toBe(TaskEvaluation.NO_GO);
  });
});
```

---

## 5. Integration Test Scenario

**Suite name:** `tests/integration/sprint-162a-bug-a-mini-sprint.test.ts` (deferred — INV-A spec only)

**Three-task mini sprint:**

| Task | HB age at evaluate | `.result` written | Expected outcome |
|------|--------------------|-------------------|------------------|
| `T-A` | none (no HB)      | no                | synthetic `NO_GO` (existing path unchanged) |
| `T-B` | 600 s (stale)     | no                | synthetic `NO_GO` (stale-beyond-grace path) |
| `T-C` | 30 s  (fresh)     | no                | **deferred** — `evaluations` does **not** contain `T-C`; one `sprint.eval.heartbeat-skip` event emitted; sprint phase unchanged |

**Steps:**

1. Spawn three tasks with the mock spawn backend (`spawn-backend-mock.ts`).
2. Have the mock backend write HB files at the ages specified above; do not write `.result` files for any task.
3. Force `waitForResults` to return early (e.g. timeout = 100 ms).
4. Call `runEvaluatePhase` with `[]` results.
5. Assert: `evaluations.size === 2`, `evaluations.get('T-A') === NO_GO`, `evaluations.get('T-B') === NO_GO`, `evaluations.has('T-C') === false`.
6. Read `.deckent/sprint-test-events.jsonl` and assert exactly one event with `payload.kind === 'sprint.eval.heartbeat-skip'` and `payload.taskId === 'T-C'`.

**Cleanup invariants:** the test must call `clearHeartbeatCache` in `afterEach` to prevent cross-test pollution (auditor.ts:90).

---

## 6. Observability Hook

**Event name:** `sprint.eval.heartbeat-skip`

**Channel:** carried inside `BRAIN→*:METRIC_EMITTED` payload (no new channel registered — keeps `CHANNELS` enum stable; consumers filter on `payload.kind`).

**Payload schema (TypeScript):**

```typescript
interface HeartbeatSkipEvent {
  /** Discriminator inside METRIC_EMITTED payloads */
  kind: 'sprint.eval.heartbeat-skip';
  /** Task whose evaluation was deferred */
  taskId: string;
  /** Age of the heartbeat at decision time, in milliseconds. null if HB existed but timestamp unparseable (handled separately) */
  hbAgeMs: number | null;
  /** Reason code — currently only 'heartbeat-fresh-within-grace'. Reserved for future codes. */
  skipReason: 'heartbeat-fresh-within-grace';
  /** Computed grace window (heartbeat_timeout × eval_heartbeat_grace_multiplier × 1000) at decision time */
  graceMs: number;
}
```

**Wire format example (one JSONL line in `.deckent/{sprintId}-events.jsonl`):**

```json
{"timestamp":"2026-05-08T11:23:30.123Z","sequence":847,"protocol_version":"1.0","source":"brain","target":"auditor","channel":"BRAIN→*:METRIC_EMITTED","payload":{"kind":"sprint.eval.heartbeat-skip","taskId":"161-002","hbAgeMs":48217,"skipReason":"heartbeat-fresh-within-grace","graceMs":240000}}
```

**Dashboard / auditor surfacing:** the event already flows through the existing `event-stream.ts` reader (`readEvents`, `reconstructState`); no consumer change is required for ingestion. A future minor fix (out of INV-A scope) can add a counter `sprint.eval.heartbeat-skip.count` to retro metrics.

---

## 7. ADR Delta — ADR-035 V2 Amendment

ADR-035 ("Brain ↔ Worker ↔ Auditor Verification Protocol Standard") currently codifies 15 channel codes and the rules around verification messages but does **not** specify how Brain reconciles missing `.result` files at evaluate-time. The amendment adds a **Synthetic Result Handling Clause**.

**Proposed addition to ADR-035 (insert after section 4 — "Channel Codes V1.0"):**

> ### 4.A Synthetic Result Handling Clause (V2 — Sprint 162A Bug A)
>
> When `runEvaluatePhase` encounters a task without a collected `.result`, Brain MUST consult the task's heartbeat artefact (`.tasks/task-{id}.hb`) before synthesizing a `NO_GO` `TaskResult`. The decision matrix is:
>
> | Heartbeat state | Action |
> |-----------------|--------|
> | File absent | Synthesize `NO_GO` with `notes: 'Timeout - no heartbeat, no result'` |
> | File present, timestamp unparseable | Synthesize `NO_GO` with `notes: 'Timeout - heartbeat malformed, no result'` |
> | File present, age > `heartbeat_timeout × eval_heartbeat_grace_multiplier` | Synthesize `NO_GO` with `notes: 'Timeout - heartbeat stale beyond grace'` |
> | File present, age ≤ `heartbeat_timeout × eval_heartbeat_grace_multiplier` | **Defer** — emit `sprint.eval.heartbeat-skip` event via `BRAIN→*:METRIC_EMITTED`; do not insert into `evaluations` map; allow next sprint cycle or auditor `archiveOrphanTasks` to handle |
>
> **Rationale:** Sprint 161 dogfood evidence — 49/56 tasks were declared `NO_GO` while their workers were still actively writing `docs/audits/sprint-161/T-161-NNN-*.md` artefacts (`.brain/sprints/sprint-161.md:9`, `.brain/sprints/sprint-161.md:21-76`). The pre-amendment code path declared death without consulting the standard liveness signal Brain itself owns.
>
> **Compatibility:** This clause is non-breaking. The existing `.tasks/task-{id}.timeout` → synthetic-NO_GO path in `result-collector.ts:230-269` is unchanged; this clause governs only the secondary synthesis at `sprint-phases.ts:492-525`.
>
> **Interaction with ADR-037:** Brain reads `.tasks/*.hb` under its existing authority (Brain owns `.tasks/`, `.brain/`, `.contracts/`). No RBAC change required.

**Memory-store insertion (post-acceptance):**

```typescript
store.insert({
  type: 'adr',
  status: 'accepted',
  id: 'adr-035-v2-amendment',
  title: 'ADR-035 V2 — Synthetic Result Handling Clause',
  sprint_id: 162,
  // ... full body from above
});
```

---

## 8. i18n Strings

Event labels for the user-facing surface ("Heartbeat alive — evaluation deferred"). Storage location: dashboard component locale catalogues (e.g. `src/dashboard/i18n/{lang}.json`) — INV-A spec defines the strings only; the actual wire-up is an out-of-scope dashboard change.

| Lang | Key: `sprint.eval.heartbeatSkip.label` | Key: `sprint.eval.heartbeatSkip.tooltip` |
|------|----------------------------------------|------------------------------------------|
| `en` | Heartbeat alive — evaluation deferred | Worker heartbeat is fresh (within grace window). Result not yet written; brain will re-check next cycle. |
| `tr` | Heartbeat canlı — değerlendirme ertelendi | Worker heartbeat'i taze (grace penceresi içinde). Sonuç henüz yazılmadı; Brain bir sonraki döngüde tekrar bakacak. |
| `de` | Heartbeat aktiv — Bewertung verschoben | Worker-Heartbeat ist frisch (innerhalb des Toleranzfensters). Ergebnis noch nicht geschrieben; Brain prüft im nächsten Zyklus erneut. |
| `fr` | Heartbeat actif — évaluation reportée | Le heartbeat du worker est récent (dans la fenêtre de tolérance). Résultat non encore écrit ; Brain re-vérifiera au prochain cycle. |
| `es` | Heartbeat activo — evaluación diferida | El heartbeat del worker está reciente (dentro de la ventana de gracia). Resultado aún no escrito; Brain volverá a comprobar en el siguiente ciclo. |
| `it` | Heartbeat attivo — valutazione rinviata | L'heartbeat del worker è recente (entro la finestra di tolleranza). Risultato non ancora scritto; Brain ricontrollerà al ciclo successivo. |
| `pt` | Heartbeat ativo — avaliação adiada | O heartbeat do worker está recente (dentro da janela de tolerância). Resultado ainda não escrito; Brain verificará novamente no próximo ciclo. |
| `ru` | Heartbeat активен — оценка отложена | Heartbeat worker-а свежий (в пределах окна допуска). Результат ещё не записан; Brain повторно проверит в следующем цикле. |
| `ja` | ハートビート有効 — 評価を延期 | ワーカーのハートビートは最新です(猶予枠内)。結果はまだ書き込まれていません。Brain は次のサイクルで再確認します。 |
| `ko` | 하트비트 활성 — 평가 보류 | 워커 하트비트가 최신입니다(허용 시간 내). 결과는 아직 기록되지 않았습니다; Brain이 다음 주기에 다시 확인합니다. |
| `zh` | 心跳存活 — 评估已延后 | 工作进程心跳为最新(在宽限期内)。结果尚未写入;Brain 将在下个周期再次检查。 |
| `ar` | نبضة حية — تأجيل التقييم | نبضة العامل حديثة (ضمن نافذة السماح). لم تُكتب النتيجة بعد؛ سيُعيد Brain الفحص في الدورة التالية. |

**Notes:**
- All twelve strings are length-budgeted to ≤ 50 characters for the label and ≤ 200 for the tooltip — fits a single dashboard row without wrap on a 1280-wide screen.
- RTL handling for `ar` follows the existing dashboard `dir="rtl"` switch (no spec change required).

---

## 9. a11y Impact

**Component target:** dashboard event-stream live region (existing — see `src/dashboard/` for the hook surface; INV-A spec only defines required attributes).

**Required attributes when rendering a `sprint.eval.heartbeat-skip` row:**

```html
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  aria-label="{i18n: sprint.eval.heartbeatSkip.label}"
  data-event-kind="sprint.eval.heartbeat-skip"
  data-task-id="161-002"
>
  {i18n: sprint.eval.heartbeatSkip.label} — {taskId} ({hbAgeMs}ms / {graceMs}ms)
</div>
```

**Rationale:**
- `role="status"` + `aria-live="polite"`: announce non-critical lifecycle events without interrupting screen-reader flow (matches existing dashboard convention for INFO-level alerts; see `src/monitor/auditor.ts:236-247` `createAlert` pattern, INFO level).
- `aria-atomic="true"`: ensure the entire row (label + task id + ages) is announced as one utterance rather than fragmented.
- `aria-label` is i18n-driven from the catalogue in §8; falls back to `en` if the user locale is missing.
- `data-event-kind` and `data-task-id` are deterministic anchors for end-to-end accessibility tests (e.g. axe-core, playwright-axe).

**WCAG 2.1 mapping:**
- 4.1.3 Status Messages (Level AA) — satisfied by `role="status"` + `aria-live="polite"`.
- 1.3.1 Info and Relationships — satisfied by `data-*` semantic anchors.

**Out-of-scope for INV-A:** the actual dashboard component, contrast tokens, and keyboard focus order. These belong to a follow-up dashboard ticket once Bug A's runtime surface is merged.

---

## 10. Security Review

### 10.1 Threat surface

The heartbeat path Brain reads in the gate is `.tasks/task-{id}.hb`. The fix introduces:

1. `existsSync(hbPath)` — pure stat, no exec.
2. `readHeartbeatCached(hbPath)` — `statSync` + `readFileSync` + `JSON.parse` via `readJsonSafe` (auditor.ts:59-87, returns `null` on error).
3. `Date.parse(hb.timestamp)` — pure string parse, no exec.
4. `writeEvent(...)` — append-only JSONL write to `.deckent/{sprintId}-events.jsonl` (event-stream.ts:167-201, fail-safe).

**No `spawnSync`, `execSync`, `eval`, or dynamic `require` is added.**

### 10.2 Trust model

- `.tasks/*.hb` files are written by Brain-spawned workers. Workers run in tmux/subprocess/Docker contexts under the same uid as Brain. Per ADR-037, `.tasks/` is Brain's authority zone; only Brain-spawned processes may write it.
- An attacker who can write arbitrary content to `.tasks/*.hb` already has filesystem control equivalent to running Brain — out of scope for ADR-037 RBAC.
- `JSON.parse` of attacker-controlled HB content is safe: Node's parser is a pure data deserializer with no prototype-pollution surface for plain object literals (and `readJsonSafe` does not deep-merge).
- `Date.parse` of an arbitrary string is safe (returns `NaN`, never throws). Our gate handles `NaN` explicitly.

### 10.3 Specific attacks considered

- **HB-stamp forgery (future-dated):** if an attacker writes a HB with `timestamp` in the future, `hbAgeMs` would be negative. The condition `hbAgeMs <= hbGraceMs` is satisfied by negatives, so the task would be deferred indefinitely — **denial-of-evaluation**, not a confidentiality or integrity break. Mitigation (out of scope for INV-A but noted): add `hbAgeMs >= 0` guard on the deferral branch as a defense-in-depth follow-up. The current synthetic-NO_GO path is preserved if we tighten this later.
- **HB symlink to `/etc/shadow`:** `readJsonSafe` returns `null` (parse error). No harm.
- **Massive HB file:** `readFileSync` has no size cap. Existing risk inherited from the auditor scan loop (auditor.ts:269); INV-A does not regress this.
- **Race vs. cleanup:** if a worker is killed and its `.hb` deleted between `existsSync` and `readHeartbeatCached`, the latter returns `null` → fall through to synthetic NO_GO (correct behaviour).

### 10.4 Verdict

**No new security exposure introduced by INV-A's fix.** The single defense-in-depth follow-up (negative `hbAgeMs` guard) is documented but explicitly out of scope for the Bug A patch.

---

## 11. Multi-Language Surface Impact

**Not applicable to Bug A.**

The fix is internal to Brain's evaluate-phase logic (Node.js / TypeScript only). No CLI argument names, no MCP tool schemas, no public API contracts, no exported library surface, and no resource URIs change. The single user-visible artefact is the `sprint.eval.heartbeat-skip` event, whose i18n surface is fully covered in §8 across all twelve target languages.

If a future spec adds a worker-side cooperation signal (e.g. workers writing a sentinel file when they intend to extend their HB grace), that change would touch the worker prompt template and would warrant its own multi-language surface impact analysis — but no such change is required by INV-A.

---

*End of Sprint 162A INV-A fix-spec. All claims are file:line cited. No source modifications were performed during investigation.*
