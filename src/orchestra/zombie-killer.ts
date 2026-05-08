// ═══ Zombie Brain Process Killer ═════════════════════════════════════
// PID-bounded SIGTERM+grace+SIGKILL pattern for stalled-but-alive Brain
// coordinators. Used by `deckent recover` to unblock zombie sprints.
//
// Security: only kills the PID recorded in .deckent/pids/<sprint-id>.pid.
// User-supplied PIDs are NEVER accepted (the public API takes only
// sprintId). This is the runtime expression of ADR-006 (no shell,
// structured args) and ADR-037 V2 §6.5 (Brain authority — only the
// recover CLI may signal the Brain process).
//
// Sprint 162A — Bug R3 fix.

import { readPid, isProcessAlive } from './sprint-pid-manager.js';
import { writeEvent } from './event-stream.js';
import { debugLog } from '../core/utils.js';

/** Default grace period between SIGTERM and SIGKILL escalation. */
export const DEFAULT_GRACE_MS = 5000;

/** Linux PID_MAX upper bound (also covers macOS PID range). */
const PID_MAX = 4_194_304;

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
    | 'pid-unparseable'       // file exists but PID is invalid (≤1, non-int, > PID_MAX)
    | 'already-dead'          // PID found, kill(pid,0) → ESRCH
    | 'sigterm-graceful'      // SIGTERM exited within grace
    | 'sigkill-required'      // SIGKILL had to fire
    | 'sigkill-failed'        // even SIGKILL failed (kernel error / EPERM)
    | 'kill-error';           // unexpected throw on SIGTERM
  /** Total wall-clock duration in ms. */
  durationMs: number;
  /** Error message if outcome is sigkill-failed | kill-error. */
  error?: string;
}

export interface KillZombieOpts {
  gracePeriodMs?: number;
  dryRun?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  killImpl?: (pid: number, signal: number | string) => void;
}

/**
 * Kill a zombie Brain coordinator for the given sprint.
 *
 * Security boundaries (DO NOT BYPASS):
 * - PID source = `.deckent/pids/<sprintId>.pid` ONLY (written by
 *   runSprint at sprint start). User input cannot reach this function.
 * - If the PID file is absent or malformed → no-op (cannot kill what
 *   we don't own).
 * - process.kill is invoked with structured signal name, never via shell.
 * - Sprint id is validated against `^sprint-\d+$` (defense in depth;
 *   CLI commander already enforces this).
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
  opts: KillZombieOpts = {},
): Promise<ZombieKillResult> {
  const grace = opts.gracePeriodMs ?? DEFAULT_GRACE_MS;
  const nowFn = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const killImpl =
    opts.killImpl ??
    ((pid: number, sig: number | string) => process.kill(pid, sig as NodeJS.Signals | number));
  const start = nowFn();

  const result: ZombieKillResult = {
    pidFound: false,
    pid: null,
    wasAlive: false,
    signalsSent: [],
    outcome: 'no-pid-file',
    durationMs: 0,
  };

  // ── Defense-in-depth: sprint-id format guard ──
  if (!/^sprint-\d+$/.test(sprintId)) {
    result.outcome = 'pid-unparseable';
    result.durationMs = nowFn() - start;
    return result;
  }

  // ── Step 1: PID source-of-truth lookup (security guard) ──
  const pid = readPid(root, sprintId);
  if (pid === null) {
    result.durationMs = nowFn() - start;
    return result;
  }
  result.pidFound = true;

  // ── PID validation: reject pid <= 1, non-integer, or > PID_MAX ──
  if (!Number.isInteger(pid) || pid <= 1 || pid > PID_MAX) {
    result.outcome = 'pid-unparseable';
    result.pid = pid;
    result.durationMs = nowFn() - start;
    return result;
  }
  result.pid = pid;

  // ── Step 2: Liveness probe ──
  if (!isProcessAlive(pid)) {
    result.outcome = 'already-dead';
    result.durationMs = nowFn() - start;
    return result;
  }
  result.wasAlive = true;

  // ── Dry-run short-circuit ──
  if (opts.dryRun) {
    result.outcome = 'sigterm-graceful'; // best-case prediction
    result.durationMs = nowFn() - start;
    return result;
  }

  // ── Step 3: SIGTERM ──
  try {
    killImpl(pid, 'SIGTERM');
    result.signalsSent.push('SIGTERM');
  } catch (e) {
    result.outcome = 'kill-error';
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = nowFn() - start;
    debugLog('zombie-killer:sigterm', e);
    return result;
  }

  // ── Step 4: Grace ──
  await sleep(grace);

  // ── Step 5: Re-probe ──
  if (!isProcessAlive(pid)) {
    result.outcome = 'sigterm-graceful';
    result.durationMs = nowFn() - start;
    emitZombieKilledEvent(root, sprintId, pid, 'SIGTERM', grace);
    return result;
  }

  // ── Step 6: SIGKILL fallback ──
  try {
    killImpl(pid, 'SIGKILL');
    result.signalsSent.push('SIGKILL');
  } catch (e) {
    result.outcome = 'sigkill-failed';
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = nowFn() - start;
    debugLog('zombie-killer:sigkill', e);
    return result;
  }

  // SIGKILL is uncatchable; OS will reap. We do not re-probe (the race
  // window is accepted — see Bug R3 spec §10).
  result.outcome = 'sigkill-required';
  result.durationMs = nowFn() - start;
  emitZombieKilledEvent(root, sprintId, pid, 'SIGKILL', grace);
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
    writeEvent(
      root,
      sprintId,
      'deckent',
      '*',
      'DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED',
      { sprintId, pid, signal, gracePeriodMs },
    );
  } catch (e) {
    debugLog('zombie-killer:event', e);
  }
}
