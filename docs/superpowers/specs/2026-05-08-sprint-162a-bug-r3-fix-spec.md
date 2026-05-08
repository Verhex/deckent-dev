# Sprint 162A — Bug R3 Fix Spec: Zombie Brain Process Kill on Recover

**Created:** 2026-05-08
**Author:** INV-R3 (investigation subagent)
**Sprint:** 162A — Orchestration Repair
**Status:** SPEC (read-only, ready for Wave 2 implementation)
**Bug ID:** R3
**Tier:** T4 (god-level)
**Parent design:** `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md`

---

## 1. Problem Statement & Evidence

### 1.1 Symptom

`deckent recover <sprint-id>` does not terminate a running but stalled Brain coordinator process. After Sprint 161 stalled, **PID 286601** remained idle for **>1 hour** consuming the IPC slot, holding state-snapshot writers, and blocking a clean restart of the same sprint id (because `writePid()` collision check sees the alive PID and refuses to re-bind, throwing `DECKENT_E055`).

### 1.2 Evidence (Sprint 161)

- `.deckent/pids/sprint-161.pid` — `{ pid: 286601, sprintId: "sprint-161", startedAt: "2026-05-07T..." }` present after stall
- `ps -p 286601` — process alive, idle, no CPU, no I/O for >60min
- `deckent recover sprint-161` (current behavior) — runs audit, cleans orphan IPC dirs (with `checkLivePid: true` it **preserved** the live IPC dir of 286601), cleared stale locks, archived task files. Did **not** signal PID 286601.
- Subsequent `deckent start sprint-161` — failed with `DECKENT_E055: Sprint sprint-161 already has a live coordinator (PID 286601)` (per `sprint-pid-manager.ts:70-72`).
- Manual `kill -9 286601` was needed to unblock; this defeats the recover automation.

### 1.3 Root cause

`src/cli/commands/recover.ts::runRecovery` performs four steps:

1. `runSelfAuditGate(sprintId, root)` — audit only
2. `cleanOrphanIpcDirs(root, { checkLivePid: true })` — **preserves live PID dirs** (intentional for safe concurrent runs)
3. `clearStaleLocks(root, STALE_LOCK_AGE_MS)` — cleans stale `.locks/`
4. `postFinalizeCleanup(root, sprintId)` — archives terminal task files

**No step terminates a stalled-but-alive coordinator.** The recover command was designed for *crashed* sprints (dead PID → orphan IPC cleanup is sufficient). Stalled sprints (alive PID, hung event loop) are an unhandled state.

The infrastructure to detect this exists already (`sprint-pid-manager.ts::readPid`, `isProcessAlive`, `archiveOrphan`), but the kill step itself is missing from recover.

### 1.4 Out of scope

- Signal handling **inside** the Brain process (graceful shutdown of in-flight workers): out of scope here — this spec covers the *external* recover→kill path. ADR-025 graceful shutdown remains the in-process responsibility once SIGTERM is received.
- Replacing the entire `recover` command — Bug R3 is an additive step (security-bounded zombie kill).
- Killing arbitrary user-supplied PIDs — this spec **rejects** that explicitly (Section 10).

---

## 2. Solution Overview

Add an early step **before** orphan IPC cleanup in `runRecovery()` that:

1. Reads the recorded coordinator PID from `.deckent/pids/<sprint-id>.pid` (already written at sprint start by `runSprint` → `writePid`, see `sprint-controller.ts:679`).
2. **PID security guard:** verify the read PID matches the sprint id requested on the CLI (the PID file *is* keyed by sprint id, so `pidFilePath(root, sprintId)` is the only PID source — no arbitrary numeric input is ever accepted from the user).
3. `process.kill(pid, 0)` liveness probe.
4. If alive → `process.kill(pid, 'SIGTERM')`; await **5000ms** grace.
5. Re-probe; if still alive → `process.kill(pid, 'SIGKILL')`.
6. Emit `sprint.recover.zombie-killed` event with `{sprintId, pid, signal, gracePeriodMs}`.
7. Update the recovery report with `zombieKilled: { pid, signalsSent: ['SIGTERM', 'SIGKILL'?], finalSignal, durationMs }`.

The `sprint-state.json` schema already does **not** record `brainPid`, but **`.deckent/pids/<sprint-id>.pid` already does** — no schema change required. (See Section 3.5 for the rejected alternative of duplicating the field into `sprint-state.json`.)

---

## 3. recover.ts Diff

### 3.1 New helper module: `src/orchestra/zombie-killer.ts`

A focused, testable helper. Lives in `orchestra/` because it operates on sprint-scoped runtime artifacts (parallel to `sprint-pid-manager.ts`).

```typescript
// ═══ Zombie Brain Process Killer ═════════════════════════════════════
// PID-bounded SIGTERM+grace+SIGKILL pattern for stalled-but-alive Brain
// coordinators. Used by `deckent recover` to unblock zombie sprints.
//
// Security: only kills the PID recorded in .deckent/pids/<sprint-id>.pid.
// User-supplied PIDs are NEVER accepted (the public API takes only sprintId).
// This is the runtime expression of ADR-006 (no shell, structured args)
// and ADR-037 (Brain authority — only Brain owns its own PID file).

import { readPid, isProcessAlive } from './sprint-pid-manager.js';
import { writeEvent, CHANNELS } from './event-stream.js';
import { debugLog } from '../core/utils.js';

/** Default grace period between SIGTERM and SIGKILL escalation. */
export const DEFAULT_GRACE_MS = 5000;

export interface ZombieKillResult {
  /** True if a recorded PID file existed for this sprint. */
  pidFound: boolean;
  /** The PID that was acted upon (only set when pidFound=true). */
  pid: number | null;
  /** True if the PID was alive at first probe. */
  wasAlive: boolean;
  /** Signals successfully sent, in order. */
  signalsSent: Array<'SIGTERM' | 'SIGKILL'>;
  /** Final outcome. */
  outcome:
    | 'no-pid-file'           // .deckent/pids/<sprint>.pid absent
    | 'pid-unparseable'       // file exists but JSON malformed
    | 'already-dead'          // PID found, kill(pid,0) → ESRCH
    | 'sigterm-graceful'      // SIGTERM exited within grace
    | 'sigkill-required'      // SIGKILL had to fire
    | 'sigkill-failed'        // even SIGKILL failed (kernel error / EPERM)
    | 'kill-error';           // unexpected throw
  /** Total wall-clock duration in ms. */
  durationMs: number;
  /** Error message if outcome is sigkill-failed | kill-error. */
  error?: string;
}

/**
 * Kill a zombie Brain coordinator for the given sprint.
 *
 * Security boundaries (DO NOT BYPASS):
 * - PID source = `.deckent/pids/<sprintId>.pid` ONLY (written by runSprint
 *   at sprint start). User input cannot reach this function.
 * - If the PID file is absent or malformed → no-op (cannot kill what we
 *   don't own).
 * - process.kill is invoked with structured signal name, never via shell.
 *
 * @param root - Project root directory
 * @param sprintId - Sprint identifier (already validated by CLI commander)
 * @param opts.gracePeriodMs - SIGTERM→SIGKILL grace (default 5000ms)
 * @param opts.dryRun - If true, return what *would* be done without signaling
 * @param opts.now - Injectable clock for tests (default: Date.now)
 * @param opts.sleep - Injectable sleep for tests (default: real setTimeout)
 * @param opts.killImpl - Injectable kill for tests (default: process.kill)
 */
export async function killZombieBrain(
  root: string,
  sprintId: string,
  opts: {
    gracePeriodMs?: number;
    dryRun?: boolean;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    killImpl?: (pid: number, signal: number | string) => void;
  } = {},
): Promise<ZombieKillResult> {
  const grace = opts.gracePeriodMs ?? DEFAULT_GRACE_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const killImpl = opts.killImpl ?? ((pid: number, sig: number | string) => process.kill(pid, sig as NodeJS.Signals | number));
  const start = now();

  const result: ZombieKillResult = {
    pidFound: false,
    pid: null,
    wasAlive: false,
    signalsSent: [],
    outcome: 'no-pid-file',
    durationMs: 0,
  };

  // ── Step 1: PID source-of-truth lookup (security guard) ──
  const pid = readPid(root, sprintId);
  if (pid === null) {
    result.durationMs = now() - start;
    return result;
  }
  result.pidFound = true;
  result.pid = pid;

  // ── Step 2: Liveness probe ──
  if (!isProcessAlive(pid)) {
    result.outcome = 'already-dead';
    result.durationMs = now() - start;
    return result;
  }
  result.wasAlive = true;

  // ── Dry-run short-circuit ──
  if (opts.dryRun) {
    result.outcome = 'sigterm-graceful'; // best-case prediction
    result.durationMs = now() - start;
    return result;
  }

  // ── Step 3: SIGTERM ──
  try {
    killImpl(pid, 'SIGTERM');
    result.signalsSent.push('SIGTERM');
  } catch (e) {
    result.outcome = 'kill-error';
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = now() - start;
    debugLog('zombie-killer:sigterm', e);
    return result;
  }

  // ── Step 4: Grace ──
  await sleep(grace);

  // ── Step 5: Re-probe ──
  if (!isProcessAlive(pid)) {
    result.outcome = 'sigterm-graceful';
    result.durationMs = now() - start;
    void emitZombieKilledEvent(root, sprintId, pid, 'SIGTERM', grace);
    return result;
  }

  // ── Step 6: SIGKILL fallback ──
  try {
    killImpl(pid, 'SIGKILL');
    result.signalsSent.push('SIGKILL');
  } catch (e) {
    result.outcome = 'sigkill-failed';
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = now() - start;
    debugLog('zombie-killer:sigkill', e);
    return result;
  }

  // SIGKILL is uncatchable; OS will reap. We don't re-probe (race window
  // accepted — see Section 10).
  result.outcome = 'sigkill-required';
  result.durationMs = now() - start;
  void emitZombieKilledEvent(root, sprintId, pid, 'SIGKILL', grace);
  return result;
}

function emitZombieKilledEvent(
  root: string,
  sprintId: string,
  pid: number,
  signal: 'SIGTERM' | 'SIGKILL',
  gracePeriodMs: number,
): void {
  try {
    writeEvent(root, sprintId, {
      source: 'deckent',
      target: '*',
      channel: CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED,
      payload: { sprintId, pid, signal, gracePeriodMs },
    });
  } catch (e) {
    debugLog('zombie-killer:event', e);
  }
}
```

### 3.2 Channel constant addition: `src/orchestra/event-stream.ts`

Add to the `CHANNELS` object (alphabetical block — recover events):

```typescript
// Recovery events (Sprint 162A — Bug R3)
SPRINT_RECOVER_ZOMBIE_KILLED: 'DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED',
```

The unified channel naming follows ADR-035 V1.0 (`SOURCE→TARGET:VERB` form). Source is `deckent` (the recover CLI is not Brain — Brain is dead/zombie).

### 3.3 `recover.ts` integration

```typescript
// src/cli/commands/recover.ts (excerpt of the diff)

import { killZombieBrain, type ZombieKillResult } from '../../orchestra/zombie-killer.js';
import { archiveOrphan, detectOrphan } from '../../orchestra/sprint-pid-manager.js';

export interface RecoveryReport {
  audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
  zombieKill: ZombieKillResult | null;     // NEW
  orphanIpcDirs: string[];
  staleLocksCleaned: number;
  taskFilesArchived: number;
  taskFilesPreserved: number;
}

async function runRecovery(
  root: string,
  sprintId: string,
  opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean; gracePeriodMs?: number },
): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    audit: { overallGate: 'SKIPPED' },
    zombieKill: null,
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
  };

  // Step 1: Audit (unchanged)
  if (!opts.skipAudit) {
    try {
      const auditResult = await runSelfAuditGate(sprintId, root);
      report.audit = { overallGate: auditResult.overallGate };
    } catch {
      report.audit = { overallGate: 'SKIPPED' };
    }
  }

  // Step 2 (NEW): Zombie Brain kill — runs BEFORE IPC cleanup so that
  // cleanOrphanIpcDirs sees a dead PID and can reclaim the IPC dir.
  try {
    report.zombieKill = await killZombieBrain(root, sprintId, {
      gracePeriodMs: opts.gracePeriodMs ?? 5000,
      dryRun: opts.dryRun,
    });
    // After a successful kill, archive the now-orphan PID file so the next
    // start does not see DECKENT_E055.
    if (
      report.zombieKill.outcome === 'sigterm-graceful' ||
      report.zombieKill.outcome === 'sigkill-required' ||
      report.zombieKill.outcome === 'already-dead'
    ) {
      if (!opts.dryRun) {
        const orphan = detectOrphan(root, sprintId);
        if (orphan) {
          try { archiveOrphan(root, orphan); } catch (e) { debugLog('recover:archiveOrphan', e); }
        }
      }
    }
  } catch (e) {
    print(`  Warning: Zombie kill failed: ${e}`);
  }

  if (opts.dryRun) {
    // Existing dry-run preview block (unchanged) ...
    return report;
  }

  // Step 3: Orphan IPC dir cleanup (unchanged — now sees dead PID)
  // Step 4: Stale lock cleanup (unchanged)
  // Step 5: Task archive (unchanged)
  ...
}
```

### 3.4 New CLI flag

```typescript
program
  .command('recover <sprint-id>')
  .option('--grace-period-ms <ms>', 'SIGTERM→SIGKILL grace period (default 5000)', '5000')
  ...
```

Parse with `Number.parseInt`, clamp to `[100, 60_000]`. Pass through to `runRecovery`.

### 3.5 Rejected alternative: add `brainPid` to `sprint-state.json`

The job description proposes adding `brainPid` to `sprint-state.json` if the schema doesn't record it. **It does not** — but the recommendation is to **NOT duplicate** because:

- `.deckent/pids/<sprint-id>.pid` already exists, atomically written, with collision detection (`sprint-pid-manager.ts:63-82`).
- Adding `brainPid` to `sprint-state.json` creates two PID sources of truth → inevitable drift bug (which one wins on conflict?).
- `sprint-state.json` is updated frequently during sprint execution (`writeSprintState` is called on every phase change). PID never changes — it has different write semantics. Mixing the two violates separation of concerns.
- ADR-037 RBAC: `sprint-state.json` is in Brain's write authority surface (the sprint controller), but the **PID file** is conceptually a runtime invariant of the Brain *process*, not its sprint. Same PID across phases.

**Decision:** keep PID-file as the single source of truth. The CLI reads it via `readPid(root, sprintId)`. No schema mutation needed. ADR-037 V2 amendment (Section 7) ratifies this.

---

## 4. Test Plan: `tests/cli/commands/recover-r3-zombie-kill.test.ts`

### 4.1 Strategy

- Mock `child_process` is **not** the right surface — `process.kill` is on the global `process` object, not in `child_process`.
- Inject `killImpl` into `killZombieBrain` (its `opts` parameter) — clean, deterministic, no global mutation.
- For the `recover` CLI test (integration of the helper): `vi.mock('../../../src/orchestra/zombie-killer.js', ...)` and assert it's called with the right args.

### 4.2 Test cases for `killZombieBrain` (unit)

```typescript
// tests/orchestra/zombie-killer.test.ts (companion, also new)

describe('killZombieBrain', () => {
  it('returns no-pid-file when .deckent/pids/<sprint>.pid is absent', async () => {
    // empty tmp dir — readPid returns null
    const result = await killZombieBrain(tmpRoot, 'sprint-999');
    expect(result.outcome).toBe('no-pid-file');
    expect(result.signalsSent).toEqual([]);
    expect(result.pid).toBeNull();
  });

  it('returns already-dead when PID file exists but process is gone', async () => {
    // write pid file with PID 99999999 (won't exist)
    writePidFile(tmpRoot, 'sprint-1', 99999999);
    const result = await killZombieBrain(tmpRoot, 'sprint-1');
    expect(result.outcome).toBe('already-dead');
    expect(result.wasAlive).toBe(false);
  });

  it('sends SIGTERM and exits gracefully if process dies within grace', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    let aliveCalls = 0;
    const killImpl = vi.fn();
    // First isProcessAlive call → true (initial probe)
    // After SIGTERM + sleep → false
    const aliveStub = vi.spyOn(pidMgr, 'isProcessAlive').mockImplementation(() => {
      aliveCalls++;
      return aliveCalls === 1;
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await killZombieBrain(tmpRoot, 'sprint-1', {
      gracePeriodMs: 5000, killImpl, sleep,
    });
    expect(result.outcome).toBe('sigterm-graceful');
    expect(result.signalsSent).toEqual(['SIGTERM']);
    expect(killImpl).toHaveBeenCalledWith(12345, 'SIGTERM');
    expect(sleep).toHaveBeenCalledWith(5000);
    aliveStub.mockRestore();
  });

  it('escalates to SIGKILL when SIGTERM grace expires', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    const killImpl = vi.fn();
    // alive on every probe → SIGKILL fires
    vi.spyOn(pidMgr, 'isProcessAlive').mockReturnValue(true);
    const result = await killZombieBrain(tmpRoot, 'sprint-1', {
      gracePeriodMs: 5000, killImpl, sleep: () => Promise.resolve(),
    });
    expect(result.outcome).toBe('sigkill-required');
    expect(result.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    expect(killImpl.mock.calls).toEqual([
      [12345, 'SIGTERM'],
      [12345, 'SIGKILL'],
    ]);
  });

  it('respects custom gracePeriodMs (timing assertion)', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    const sleep = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(pidMgr, 'isProcessAlive').mockReturnValueOnce(true).mockReturnValueOnce(false);
    await killZombieBrain(tmpRoot, 'sprint-1', {
      gracePeriodMs: 250, killImpl: vi.fn(), sleep,
    });
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('records sigkill-failed when even SIGKILL throws', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    vi.spyOn(pidMgr, 'isProcessAlive').mockReturnValue(true);
    const killImpl = vi.fn()
      .mockImplementationOnce(() => {/* SIGTERM ok */})
      .mockImplementationOnce(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    const result = await killZombieBrain(tmpRoot, 'sprint-1', {
      killImpl, sleep: () => Promise.resolve(),
    });
    expect(result.outcome).toBe('sigkill-failed');
    expect(result.error).toContain('EPERM');
  });

  it('dry-run does not invoke killImpl', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    vi.spyOn(pidMgr, 'isProcessAlive').mockReturnValue(true);
    const killImpl = vi.fn();
    const result = await killZombieBrain(tmpRoot, 'sprint-1', { dryRun: true, killImpl });
    expect(killImpl).not.toHaveBeenCalled();
    expect(result.signalsSent).toEqual([]);
  });

  it('SECURITY: never reads PID from any source other than .deckent/pids/<sprint>.pid', async () => {
    // Even if sprint-state.json contains a fake PID field, it must be ignored.
    writeFileSync(join(tmpRoot, '.deckent/sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-1', brainPid: 1 /* malicious */ }));
    // No pid file written.
    const result = await killZombieBrain(tmpRoot, 'sprint-1');
    expect(result.outcome).toBe('no-pid-file');
    expect(result.pid).toBeNull();
  });

  it('SECURITY: PID 0 / negative / non-integer in pid file is rejected', async () => {
    writeFileSync(pidPath(tmpRoot, 'sprint-1'),
      JSON.stringify({ pid: 0, sprintId: 'sprint-1' }));
    // readPid returns 0 → killImpl called? NO — guard added.
    // (See Section 10: zombie-killer must reject pid <= 1 explicitly.)
    const result = await killZombieBrain(tmpRoot, 'sprint-1');
    expect(result.outcome).toBe('pid-unparseable');
  });

  it('emits sprint.recover.zombie-killed event on successful kill', async () => {
    writePidFile(tmpRoot, 'sprint-1', 12345);
    vi.spyOn(pidMgr, 'isProcessAlive').mockReturnValueOnce(true).mockReturnValueOnce(false);
    await killZombieBrain(tmpRoot, 'sprint-1', {
      killImpl: vi.fn(), sleep: () => Promise.resolve(),
    });
    const events = readEvents(tmpRoot, 'sprint-1');
    const zombieEvent = events.find(e =>
      e.channel === 'DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED'
    );
    expect(zombieEvent).toBeDefined();
    expect(zombieEvent!.payload).toMatchObject({
      sprintId: 'sprint-1', pid: 12345, signal: 'SIGTERM', gracePeriodMs: 5000,
    });
  });
});
```

### 4.3 Test cases for `recover` CLI (integration with mock)

```typescript
// tests/cli/commands/recover-r3-zombie-kill.test.ts

const mockKillZombieBrain = vi.fn();
vi.mock('../../../src/orchestra/zombie-killer.js', () => ({
  killZombieBrain: (...args: unknown[]) => mockKillZombieBrain(...args),
}));

describe('deckent recover — zombie kill (Bug R3)', () => {
  it('invokes killZombieBrain with sprint id and default 5000ms grace', async () => {
    mockKillZombieBrain.mockResolvedValue({
      pidFound: true, pid: 12345, wasAlive: true,
      signalsSent: ['SIGTERM'], outcome: 'sigterm-graceful', durationMs: 4200,
    });
    await runCommand(['sprint-161', '--force', '--skip-audit']);
    expect(mockKillZombieBrain).toHaveBeenCalledWith(
      '/fake/project', 'sprint-161',
      expect.objectContaining({ gracePeriodMs: 5000, dryRun: undefined }),
    );
  });

  it('forwards --grace-period-ms flag', async () => {
    mockKillZombieBrain.mockResolvedValue({ outcome: 'no-pid-file', pidFound: false, pid: null, wasAlive: false, signalsSent: [], durationMs: 0 });
    await runCommand(['sprint-161', '--force', '--skip-audit', '--grace-period-ms', '250']);
    expect(mockKillZombieBrain.mock.calls[0][2]).toMatchObject({ gracePeriodMs: 250 });
  });

  it('clamps --grace-period-ms outside [100, 60_000]', async () => {
    mockKillZombieBrain.mockResolvedValue({ outcome: 'no-pid-file', pidFound: false, pid: null, wasAlive: false, signalsSent: [], durationMs: 0 });
    await runCommand(['sprint-161', '--force', '--skip-audit', '--grace-period-ms', '99']);
    expect(mockKillZombieBrain.mock.calls[0][2]).toMatchObject({ gracePeriodMs: 100 });
    mockKillZombieBrain.mockClear();
    await runCommand(['sprint-161', '--force', '--skip-audit', '--grace-period-ms', '999999']);
    expect(mockKillZombieBrain.mock.calls[0][2]).toMatchObject({ gracePeriodMs: 60000 });
  });

  it('dry-run forwards dryRun flag and does not archive', async () => {
    mockKillZombieBrain.mockResolvedValue({ outcome: 'sigterm-graceful', pidFound: true, pid: 12345, wasAlive: true, signalsSent: [], durationMs: 0 });
    await runCommand(['sprint-161', '--dry-run']);
    expect(mockKillZombieBrain.mock.calls[0][2]).toMatchObject({ dryRun: true });
  });

  it('prints zombie-kill summary line in report', async () => {
    mockKillZombieBrain.mockResolvedValue({
      pidFound: true, pid: 286601, wasAlive: true,
      signalsSent: ['SIGTERM', 'SIGKILL'], outcome: 'sigkill-required', durationMs: 5012,
    });
    await runCommand(['sprint-161', '--force', '--skip-audit']);
    const printed = mockPrint.mock.calls.flat().join('\n');
    expect(printed).toMatch(/Zombie Brain.*286601.*SIGKILL/);
  });

  it('continues recovery even if zombie kill fails', async () => {
    mockKillZombieBrain.mockResolvedValue({ outcome: 'kill-error', error: 'EPERM', pidFound: true, pid: 1, wasAlive: true, signalsSent: [], durationMs: 0 });
    await runCommand(['sprint-161', '--force', '--skip-audit']);
    // orphan IPC + lock + archive steps still ran
    expect(mockCleanOrphanIpcDirs).toHaveBeenCalled();
    expect(mockClearStaleLocks).toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
  });
});
```

### 4.4 Coverage targets

- `zombie-killer.ts`: **100% line / 100% branch** (small surface, fully testable via injection).
- `recover.ts` zombie-kill integration: **>=90% line** (existing test file extended).

### 4.5 Smoke replication (Phase 3 of parent design)

Manual smoke (not automated; covered in parent design Section 4):

```bash
# Reproduce Sprint 161 stall conditions
deckent start sprint-test --backend=tmux  # let it stall via fault injection
# Wait 60s (simulate hang)
ps -p $(jq -r .pid .deckent/pids/sprint-test.pid)   # alive
deckent recover sprint-test --grace-period-ms 1000
# Expect:
#   - "Zombie Brain killed: PID NNNN (SIGTERM)" line
#   - ps -p NNNN → no such process
#   - .deckent/pids/sprint-test.pid → moved to .brain/archive/
#   - subsequent `deckent start sprint-test` → no DECKENT_E055
```

---

## 5. Observability

### 5.1 Event stream

`DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED` (Section 6) — written via existing `writeEvent` API, fail-safe.

### 5.2 Metrics (`metrics.jsonl`)

Add entries via the existing metric emitter (out of scope to modify here — relies on parent Sprint 162A metric Wave 3):

```json
{"name":"recover.zombie_kill.duration_ms","value":4200,"tags":{"sprintId":"sprint-161","outcome":"sigterm-graceful"}}
{"name":"recover.zombie_kill.sigkill_required","value":1,"tags":{"sprintId":"sprint-161"}}
```

### 5.3 CLI report

```
  ─────────────────────────────────────────
  Audit gate:      PASS
  Zombie Brain:    PID 286601 → SIGTERM (4.2s) ✓
  Orphan IPC dirs: 1 removed
  Stale locks:     2 cleared
  Task files:      14 archived, 0 preserved
  ─────────────────────────────────────────
```

When no zombie present: `Zombie Brain:    none (no PID file)`.

### 5.4 Dashboard

Out of scope for this fix-spec (parent Sprint 162A Wave 3 covers dashboard ARIA + i18n updates).

---

## 6. Event Schema

### 6.1 Channel

```
DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED
```

Source = `deckent` (recover CLI; Brain is the killed party so cannot be source).
Target = `*` (broadcast — auditor/dashboard/external observers may consume).

### 6.2 Payload

```typescript
{
  sprintId: string;        // e.g. "sprint-161"
  pid: number;             // e.g. 286601
  signal: 'SIGTERM' | 'SIGKILL';   // final signal that achieved termination
  gracePeriodMs: number;   // configured grace
  // Implicit via DeckentEvent envelope: timestamp, sequence, protocol_version
}
```

### 6.3 Protocol version

Compatible with ADR-035 V1.0. No protocol version bump needed — adding a new channel constant is non-breaking per ADR-035 Section 6.2 (event consumers must ignore unknown channels).

---

## 7. ADR-037 V2 Amendment (PID Bounds + Kill Discipline)

ADR-037 V1.0 (Sprint 139) defines Brain/Auditor/Worker authority matrix for *file system writes* and *event channels*. It does **not** currently address process signaling. Bug R3 fix introduces a recover-time signal authority that must be ratified.

### 7.1 Proposed amendment text

> ### §6.5 Process Signal Authority (added in V2 — Sprint 162A)
>
> The recover CLI (`deckent recover`) is granted authority to terminate a Brain coordinator process **only** when:
>
> 1. The PID is read from `.deckent/pids/<sprintId>.pid` (the canonical PID source written by `runSprint`).
> 2. The PID corresponds to the sprint id passed on the command line — i.e. the file path itself is the binding (`pidFilePath(root, sprintId)` is keyed by `sprintId`, no other PID source is consulted).
> 3. The PID > 1 (no init-process kills) and is a positive integer.
> 4. The kill sequence is **SIGTERM → grace [100, 60000]ms → SIGKILL fallback**, never reversed, never escalated past SIGKILL.
> 5. The signal is sent via Node's `process.kill(pid, signal)` with a structured signal name (compliant with ADR-006 — no shell interpolation).
>
> No other CLI command, MCP tool, or runtime component may signal the Brain process for the sprint lifetime. Workers may be killed via existing per-task channels (`tmux kill-window`, `docker kill`); this amendment exclusively governs the Brain coordinator.
>
> **Authority matrix delta:**
>
> | Component | Action | Allowed | Conditions |
> |-----------|--------|---------|-----------|
> | recover CLI | `process.kill(brainPid, SIGTERM/SIGKILL)` | ✅ | PID source = `.deckent/pids/<sprintId>.pid`, sprintId matches CLI arg |
> | Auditor | Signal Brain | ❌ | Auditor independence (ADR-037 §3) |
> | Worker | Signal Brain | ❌ | Workers cannot upward-signal |
> | MCP tool `deckent_recover` | Same as CLI | ✅ | Inherits CLI authority |
> | MCP tool `deckent_kill` | Same as CLI for sprint kill | ✅ | Pre-existing — clarified as identical mechanism |
>
> **Audit hook:** the `SPRINT_RECOVER_ZOMBIE_KILLED` event is emitted on every successful kill. Auditor consumers (`runSelfAuditGate` extension in Sprint 163+) MAY assert that any sprint with status `STALLED` followed by a successful re-`start` was preceded by a recover→zombie-killed event.

### 7.2 Migration / compatibility

- ADR-037 V1.0 does not contradict V2 (signal authority was simply unspecified); V2 is additive.
- No code outside `recover.ts` and `zombie-killer.ts` needs modification to comply.
- `mcp/tools/recover.ts` (the MCP twin of the CLI command, see `src/mcp/tools/recover.ts`) **must** be updated in lock-step (job assigned to the same Wave 2 implementer) to invoke `killZombieBrain` identically — otherwise MCP recover diverges from CLI recover, regressing the symmetric refactor discipline established in ADR-046.

### 7.3 ADR-006 compliance

`process.kill(pid, 'SIGTERM' | 'SIGKILL')` is **not** a shell invocation — it is a direct kernel syscall via Node's libuv. ADR-006 is satisfied trivially (no command injection surface exists). Documenting this explicitly in the V2 amendment to forestall future reviewer confusion.

---

## 8. i18n Notes

Strings introduced by this fix:

| Key | EN (default) | TR | DE |
|-----|--------------|----|----|
| `recover.zombie.killed.sigterm` | `Zombie Brain killed: PID {pid} (SIGTERM, {durationMs}ms)` | `Zombi Brain sonlandırıldı: PID {pid} (SIGTERM, {durationMs}ms)` | `Zombie Brain beendet: PID {pid} (SIGTERM, {durationMs}ms)` |
| `recover.zombie.killed.sigkill` | `Zombie Brain killed: PID {pid} (SIGKILL after {gracePeriodMs}ms grace)` | `Zombi Brain sonlandırıldı: PID {pid} (SIGKILL — {gracePeriodMs}ms süre sonra)` | `Zombie Brain beendet: PID {pid} (SIGKILL nach {gracePeriodMs}ms)` |
| `recover.zombie.none` | `Zombie Brain: none (no PID file or process already dead)` | `Zombi Brain: yok (PID dosyası yok veya proses zaten ölü)` | `Zombie Brain: keiner (keine PID-Datei oder Prozess bereits tot)` |
| `recover.zombie.error` | `Zombie kill failed: {reason}` | `Zombi sonlandırma başarısız: {reason}` | `Zombie-Beendigung fehlgeschlagen: {reason}` |

Use the existing i18n surface (whichever Wave 3 of parent design selects). Until then, EN-only with `// i18n: TODO` markers acceptable — but tests must NOT hardcode the EN strings; assert on stable substrings (`/Zombie Brain.*286601.*SIGKILL/`).

Per memory and DECKENT.md conventions, `print(...)` calls remain literal pending the i18n framework selection in Sprint 162A Wave 3.

---

## 9. Accessibility

Not applicable — this is a CLI/MCP recover code path. No UI surface introduced.

If the dashboard `recover` page is later extended (out of scope for R3), it must announce the zombie-killed status via `aria-live="polite"` per Sprint 162A parent Wave 3 a11y rules.

---

## 10. Security Review — PID Validation

### 10.1 Threat model

The `recover` CLI takes a sprint id (CLI argument) and reads a PID from a project-controlled file. Attack surfaces:

| Vector | Mitigation |
|--------|-----------|
| User passes arbitrary PID via CLI | **Impossible** — there is no PID flag. CLI takes only `<sprint-id>`. |
| Attacker writes a malicious PID into `.deckent/pids/<sprint>.pid` (e.g. PID 1) | **Mitigated** — `killZombieBrain` rejects `pid <= 1` (init/kernel) and non-integer. Tests in §4.2 cover this. |
| Attacker writes another user's PID into pid file | **Mitigated by OS** — `process.kill` raises EPERM when the recover user does not own the target PID. We log + return `kill-error` outcome. The recover *user* cannot kill PIDs they do not own. |
| Race window: PID reused between read and kill (kernel recycled the PID) | **Accepted** — see §10.3. |
| Sprint id with path traversal (e.g. `../../etc/passwd`) | **Mitigated** — `pidFilePath` uses `join(root, PID_DIR, '<sprintId>.pid')`. Sprint ids are validated against `/^sprint-\d+$/` regex at CLI parse time (already enforced in `recover.ts` commander setup; a defense-in-depth check is added in `zombie-killer.ts`). |
| Symlink attack (pid file → /etc/something) | **Mitigated** — PID file is JSON-parsed; only the `pid` integer is consumed. Even a symlink to a privileged file would not change the integer once parsed. |

### 10.2 Required guards in `zombie-killer.ts`

```typescript
// Guard added inside killZombieBrain after readPid:
if (pid === null || !Number.isInteger(pid) || pid <= 1 || pid > 4_194_304 /* Linux PID_MAX */) {
  result.outcome = 'pid-unparseable';
  result.durationMs = now() - start;
  return result;
}

// Sprint-id validation guard (defense in depth):
if (!/^sprint-\d+$/.test(sprintId)) {
  // The CLI already rejects this, but if zombie-killer is called from
  // elsewhere (programmatic use) we fail closed.
  result.outcome = 'pid-unparseable';
  return result;
}
```

### 10.3 Race window — single-process invariant

Between `isProcessAlive(pid)` returning `true` and `process.kill(pid, 'SIGTERM')` firing, the kernel could in theory:

1. Reap the original Brain (process exits naturally).
2. Recycle the PID for an unrelated process.
3. Our SIGTERM hits the wrong process.

**This window is accepted** for two reasons:

- The window is sub-millisecond on modern Linux/macOS (the syscall sequence is `kill(pid,0)` → `kill(pid,SIGTERM)`).
- Linux kernels delay PID recycling via `/proc/sys/kernel/pid_max` and recent-pid avoidance heuristics; on macOS PIDs are 32-bit and similar.
- The Brain is a **single-process invariant** within a project: only one PID ever has authority over a sprint, and that PID is only registered after `writePid` collision check (see `sprint-pid-manager.ts:67-75`). The recover user has the same UID as the Brain owner (project owner), so the worst-case "wrong process killed" target is also a process they own — no cross-user privilege violation possible.
- Documented as accepted residual risk in ADR-037 V2 amendment §6.5 above.

Stronger mitigation (`prctl(PR_SET_PDEATHSIG)` / pidfd) would require Linux-specific syscalls and bind-mount limitations on macOS; not justified for this risk profile.

### 10.4 No new attack surface

- No new HTTP endpoint.
- No new secret material.
- No new shell invocation (ADR-006 satisfied).
- No new MCP tool — the existing `deckent_recover` MCP tool inherits the same CLI security guarantees.

---

## 11. Multi-Language Extensibility

**Not applicable.** Bug R3 lives entirely within the Deckent runtime (TypeScript-only). The recover CLI manages the Brain coordinator process — a Deckent-internal Node.js process — irrespective of the user project's language. Multi-language project support (parent Sprint 162A theme) does not interact with Brain process lifecycle.

If multi-language project workers are spawned in non-Node runtimes (Python, Go, Rust, Java, .NET workers, future), their kill paths are governed by the **worker** signal authority (existing tmux/docker/subprocess kill paths), not by this Brain-recover spec.

No section 11 deliverables for this fix-spec.

---

## Appendix A — Files Touched (Implementation Plan)

| File | Action | LoC delta (est.) |
|------|--------|------------------|
| `src/orchestra/zombie-killer.ts` | NEW | +180 |
| `src/orchestra/event-stream.ts` | EDIT — add `SPRINT_RECOVER_ZOMBIE_KILLED` channel | +3 |
| `src/cli/commands/recover.ts` | EDIT — wire `killZombieBrain` + `--grace-period-ms` flag + report row | +50 |
| `src/mcp/tools/recover.ts` | EDIT — same wiring, MCP twin (ADR-046 symmetric refactor) | +30 |
| `tests/orchestra/zombie-killer.test.ts` | NEW | +280 |
| `tests/cli/commands/recover-r3-zombie-kill.test.ts` | NEW | +200 |
| `tests/mcp/tools/recover-r3-zombie-kill.test.ts` | NEW (parity) | +120 |
| `.brain/exports/decisions.md` (ADR-037 V2 amendment block) | EDIT | +60 |

**Total: ~7 files modified, 3 new test files, ~920 LoC.**

## Appendix B — Open Questions for Coordinator

1. **MCP twin (`src/mcp/tools/recover.ts`)** — confirm the same `--grace-period-ms` parameter naming convention. Alternatives: `gracePeriodMs` (camelCase MCP convention), `grace_period_ms` (snake_case JSON RPC). Recommend matching the existing `dryRun`/`skipAudit` MCP boolean style → `gracePeriodMs`.
2. **Default grace** — 5000ms recommended per Sprint 161 evidence (Brain idle 1h, so 5s is generous yet bounded). If parent Sprint 162A finds Brain SIGTERM handlers (ADR-025 graceful shutdown) need >5s in long-running sprints, consider 10000ms default. Tunable via flag regardless.
3. **Auto-kill on `deckent start` collision?** — Should `deckent start sprint-N` also auto-invoke `killZombieBrain` when DECKENT_E055 is hit, with a `--force-replace-zombie` flag? Out of scope for R3, but flagged for Sprint 163 backlog (UX polish).
4. **Kill audit log destination** — should `SPRINT_RECOVER_ZOMBIE_KILLED` events also append to `.brain/archive/<sprintId>_<ts>.recover.log`? Recommend yes (audit trail), implementable in Wave 3.

---

**END OF SPEC — INV-R3 Phase 1 deliverable**
