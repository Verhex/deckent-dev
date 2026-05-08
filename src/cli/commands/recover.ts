import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { clearStaleLocks } from '../../core/file-lock.js';
import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import {
  resetSprintStateOnRecover,
  type SprintStateResetDelta,
} from '../../orchestra/sprint-utils.js';
import {
  killZombieBrain,
  type ZombieKillResult,
} from '../../orchestra/zombie-killer.js';
import {
  isTaskTmpfile,
  selectPreservedPlants,
} from '../../core/task-tmpfile-pattern.js';
import { writeEvent } from '../../orchestra/event-stream.js';
import { detectOrphan, archiveOrphan } from '../../orchestra/sprint-pid-manager.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { debugLog } from '../../core/utils.js';

/** 5 minutes — same as orphan-cleaner STALE_LOCK_AGE_MS */
const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

/** SIGTERM→SIGKILL grace bounds (Bug R3 §10.2) */
const GRACE_MIN_MS = 100;
const GRACE_MAX_MS = 60_000;
const DEFAULT_GRACE_MS = 5000;

export interface RecoveryReport {
  audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
  /** Set when the Brain coordinator was zombie-killed (Bug R3). */
  zombieKill: ZombieKillResult | null;
  orphanIpcDirs: string[];
  staleLocksCleaned: number;
  taskFilesArchived: number;
  taskFilesPreserved: number;
  /** Set when sprint-state.json was rewritten to terminal state (Bug R2). */
  sprintStateReset: SprintStateResetDelta | null;
  /** Number of .worker-${taskId}.sh / .prompt-${taskId}-*.txt swept (Bug R5). */
  tmpfilesSwept: number;
  /** Number of forensic plants preserved during sweep (Bug R5). */
  tmpfilesPreserved: number;
}

interface RunRecoveryOpts {
  dryRun?: boolean;
  force?: boolean;
  skipAudit?: boolean;
  gracePeriodMs?: number;
}

async function runRecovery(
  root: string,
  sprintId: string,
  opts: RunRecoveryOpts,
): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    audit: { overallGate: 'SKIPPED' },
    zombieKill: null,
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
    sprintStateReset: null,
    tmpfilesSwept: 0,
    tmpfilesPreserved: 0,
  };

  // Step 1: Run audit (unless skipped)
  if (!opts.skipAudit) {
    try {
      const auditResult = await runSelfAuditGate(sprintId, root);
      report.audit = { overallGate: auditResult.overallGate };
    } catch {
      report.audit = { overallGate: 'SKIPPED' };
    }
  }

  // Step 2 (Bug R3): Zombie Brain kill — runs BEFORE IPC cleanup so that
  // cleanOrphanIpcDirs sees a dead PID and can reclaim the IPC dir.
  try {
    report.zombieKill = await killZombieBrain(root, sprintId, {
      gracePeriodMs: opts.gracePeriodMs ?? DEFAULT_GRACE_MS,
      dryRun: opts.dryRun,
    });
    // After a successful kill (or already-dead), archive the now-orphan
    // PID file so the next start does not see DECKENT_E055.
    if (
      !opts.dryRun &&
      (report.zombieKill.outcome === 'sigterm-graceful' ||
        report.zombieKill.outcome === 'sigkill-required' ||
        report.zombieKill.outcome === 'already-dead')
    ) {
      try {
        const orphan = detectOrphan(root, sprintId);
        if (orphan) archiveOrphan(root, orphan);
      } catch (e) { debugLog('recover:archiveOrphan', e); }
    }
  } catch (e) {
    print(`  Warning: Zombie kill failed: ${e}`);
  }

  if (opts.dryRun) {
    // Preview: count IPC dirs that would be cleaned (list without deleting)
    const deckentDir = join(root, '.deckent');
    if (existsSync(deckentDir)) {
      const ipcPattern = /^sprint-\d+-ipc$/;
      report.orphanIpcDirs = readdirSync(deckentDir).filter((e) => ipcPattern.test(e));
    }

    const locksDir = join(root, LOCKS_DIR);
    if (existsSync(locksDir)) {
      const nowMs = Date.now();
      const lockFiles = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
      for (const f of lockFiles) {
        try {
          const st = statSync(join(locksDir, f));
          if (nowMs - st.mtimeMs > STALE_LOCK_AGE_MS) report.staleLocksCleaned++;
        } catch { /* skip */ }
      }
    }

    const tasksDir = join(root, TASKS_DIR);
    if (existsSync(tasksDir)) {
      const entries = readdirSync(tasksDir);
      report.taskFilesArchived = entries.filter(
        (f) => f.endsWith('.json') || f.endsWith('.result') || f.endsWith('.hb'),
      ).length;
      // Bug R5: preview tmpfile sweep counts
      report.tmpfilesSwept = entries.filter(isTaskTmpfile).length;
      report.tmpfilesPreserved = selectPreservedPlants(entries).length;
    }

    return report;
  }

  // Step 3: Clean orphan IPC directories (dead PID check)
  try {
    report.orphanIpcDirs = cleanOrphanIpcDirs(root, { checkLivePid: true });
  } catch (e) {
    print(`  Warning: IPC cleanup failed: ${e}`);
  }

  // Step 4: Clear stale locks
  try {
    report.staleLocksCleaned = clearStaleLocks(root, STALE_LOCK_AGE_MS);
  } catch (e) {
    print(`  Warning: Lock cleanup failed: ${e}`);
  }

  // Step 5: Archive terminal task files
  try {
    const cleanupResult = postFinalizeCleanup(root, sprintId);
    report.taskFilesArchived = cleanupResult.archivedFiles.length;
    report.taskFilesPreserved = cleanupResult.preservedFiles.length;
  } catch (e) {
    print(`  Warning: Task archive failed: ${e}`);
  }

  // Step 6 (Bug R2): Reset sprint-state.json to terminal — prevents stale
  // ACTIVE/EXECUTE phantom that blocks new sprints and confuses status/watch.
  try {
    const delta = resetSprintStateOnRecover(root);
    report.sprintStateReset = delta;
    if (delta) {
      writeEvent(
        root,
        sprintId,
        'deckent',
        '*',
        'DECKENT→*:SPRINT_RECOVER_STATE_RESET',
        {
          sprintId: delta.sprintId,
          oldPhase: delta.oldPhase,
          newPhase: delta.newPhase,
          oldStatus: delta.oldStatus,
          newStatus: delta.newStatus,
          updatedAt: delta.updatedAt,
        },
      );
    }
  } catch (e) {
    print(`  Warning: sprint-state reset failed: ${e}`);
  }

  // Step 7 (Bug R5): Sweep .worker-${taskId}.sh + .prompt-${taskId}-*.txt
  // tmpfiles. Forensic plants (TEST-*, MANUAL-*, lowercase test-/manual-)
  // are preserved via shared classifier.
  try {
    const tasksDir = join(root, TASKS_DIR);
    if (existsSync(tasksDir)) {
      const entries = readdirSync(tasksDir);
      const sweptFiles: string[] = [];
      const preservedFiles = selectPreservedPlants(entries);
      for (const name of entries) {
        if (!isTaskTmpfile(name)) continue;
        try {
          unlinkSync(join(tasksDir, name));
          sweptFiles.push(name);
        } catch (e) {
          print(`  Warning: tmpfile sweep failed for ${name}: ${e}`);
        }
      }
      report.tmpfilesSwept = sweptFiles.length;
      report.tmpfilesPreserved = preservedFiles.length;
      if (sweptFiles.length > 0 || preservedFiles.length > 0) {
        writeEvent(
          root,
          sprintId,
          'deckent',
          '*',
          'DECKENT→*:SPRINT_RECOVER_TMPFILE_SWEPT',
          {
            sprintId,
            sweptCount: sweptFiles.length,
            preservedCount: preservedFiles.length,
            files: sweptFiles,
            preservedSamples: preservedFiles.slice(0, 5),
          },
        );
      }
    }
  } catch (e) {
    print(`  Warning: tmpfile sweep failed: ${e}`);
  }

  return report;
}

/** Clamp grace-period flag to [GRACE_MIN_MS, GRACE_MAX_MS] (Bug R3 §10.2). */
function clampGrace(raw: string | undefined): number {
  if (!raw) return DEFAULT_GRACE_MS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_GRACE_MS;
  if (parsed < GRACE_MIN_MS) return GRACE_MIN_MS;
  if (parsed > GRACE_MAX_MS) return GRACE_MAX_MS;
  return parsed;
}

interface RecoverCliOpts {
  dryRun?: boolean;
  force?: boolean;
  skipAudit?: boolean;
  gracePeriodMs?: string;
}

export function registerRecover(program: Command): void {
  program
    .command('recover <sprint-id>')
    .description('Recover from a crashed or stuck sprint (audit + cleanup + archive)')
    .option('--dry-run', 'Preview what would be cleaned without making changes')
    .option('--force', 'Skip interactive confirmation')
    .option('--skip-audit', 'Skip the audit step')
    .option(
      '--grace-period-ms <ms>',
      'SIGTERM→SIGKILL grace period (default 5000, clamped to [100, 60000])',
      String(DEFAULT_GRACE_MS),
    )
    .action(async (sprintId: string, opts: RecoverCliOpts) => {
      const root = resolveProjectRoot();
      const gracePeriodMs = clampGrace(opts.gracePeriodMs);

      try {
        if (opts.dryRun) {
          print(`\n  Recovery preview for ${sprintId} (dry-run):`);
          print(`  ─────────────────────────────────────────`);

          const report = await runRecovery(root, sprintId, {
            dryRun: true,
            force: opts.force,
            skipAudit: opts.skipAudit,
            gracePeriodMs,
          });

          if (report.audit.overallGate !== 'SKIPPED') {
            print(`  Audit gate:      ${report.audit.overallGate}`);
          }
          if (report.zombieKill && report.zombieKill.pidFound) {
            print(
              `  Zombie Brain:    PID ${report.zombieKill.pid ?? '?'} would be signaled (${report.zombieKill.outcome})`,
            );
          } else {
            print(`  Zombie Brain:    none (no PID file)`);
          }
          print(`  Orphan IPC dirs: ${report.orphanIpcDirs.length} would be removed`);
          print(`  Stale locks:     ${report.staleLocksCleaned} would be cleared`);
          print(`  Task files:      ${report.taskFilesArchived} would be archived`);
          print(
            `  Tmpfiles:        ${report.tmpfilesSwept} would be swept, ${report.tmpfilesPreserved} plants preserved`,
          );
          print(`  ─────────────────────────────────────────`);
          print(`\n  Run without --dry-run to execute.\n`);
          return;
        }

        // Interactive confirmation (unless --force)
        if (!opts.force) {
          print(`\n  ⚠ Recovery will clean up sprint ${sprintId}:`);
          print(`    - Terminate zombie Brain coordinator (SIGTERM → grace → SIGKILL)`);
          print(`    - Remove orphan IPC directories (dead PIDs only)`);
          print(`    - Clear stale lock files (>5min)`);
          print(`    - Archive terminal task files (DONE/NO_GO)`);
          print(`    - Reset sprint-state.json to terminal (COMPLETE/ABORTED)`);
          print(`    - Sweep .worker-*.sh + .prompt-*.txt tmpfiles (plants preserved)`);
          print(`    - Preserve active tasks (PENDING/EXECUTING)\n`);
          print(`  Use --force to skip this confirmation, or --dry-run to preview.\n`);

          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question('  Proceed? (y/N) ');
          rl.close();

          if (answer.toLowerCase() !== 'y') {
            print('  Aborted.');
            return;
          }
        }

        print(`\n  Recovering sprint ${sprintId}...`);
        const report = await runRecovery(root, sprintId, {
          dryRun: false,
          force: opts.force,
          skipAudit: opts.skipAudit,
          gracePeriodMs,
        });

        print(`  ─────────────────────────────────────────`);
        if (report.audit.overallGate !== 'SKIPPED') {
          print(`  Audit gate:      ${report.audit.overallGate}`);
        }
        if (report.zombieKill && report.zombieKill.pidFound) {
          if (report.zombieKill.outcome === 'sigterm-graceful') {
            print(
              `  Zombie Brain:    PID ${report.zombieKill.pid} → SIGTERM (${report.zombieKill.durationMs}ms) ✓`,
            );
          } else if (report.zombieKill.outcome === 'sigkill-required') {
            print(
              `  Zombie Brain:    PID ${report.zombieKill.pid} → SIGKILL after ${gracePeriodMs}ms grace ✓`,
            );
          } else if (report.zombieKill.outcome === 'already-dead') {
            print(`  Zombie Brain:    PID ${report.zombieKill.pid} already dead`);
          } else {
            print(`  Zombie Brain:    PID ${report.zombieKill.pid} — ${report.zombieKill.outcome}`);
          }
        } else {
          print(`  Zombie Brain:    none (no PID file or process already dead)`);
        }
        print(`  Orphan IPC dirs: ${report.orphanIpcDirs.length} removed`);
        print(`  Stale locks:     ${report.staleLocksCleaned} cleared`);
        print(
          `  Task files:      ${report.taskFilesArchived} archived, ${report.taskFilesPreserved} preserved`,
        );
        if (report.sprintStateReset) {
          print(
            `  Sprint state:    ${report.sprintStateReset.oldPhase}/${report.sprintStateReset.oldStatus} → COMPLETE/ABORTED (reset)`,
          );
        } else {
          print(`  Sprint state:    (no state file present)`);
        }
        print(
          `  Tmpfiles:        ${report.tmpfilesSwept} swept, ${report.tmpfilesPreserved} plants preserved`,
        );
        print(`  ─────────────────────────────────────────`);
        print(`\n  ✓ Recovery complete. Sprint ${sprintId} is ready for restart.\n`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
