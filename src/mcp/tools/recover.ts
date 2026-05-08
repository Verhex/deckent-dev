import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { clearStaleLocks } from '../../core/file-lock.js';
import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import {
  resetSprintStateOnRecover,
} from '../../orchestra/sprint-utils.js';
import { killZombieBrain } from '../../orchestra/zombie-killer.js';
import {
  isTaskTmpfile,
  selectPreservedPlants,
} from '../../core/task-tmpfile-pattern.js';
import { writeEvent } from '../../orchestra/event-stream.js';
import {
  detectOrphan,
  archiveOrphan,
} from '../../orchestra/sprint-pid-manager.js';
import { debugLog } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';

const STALE_LOCK_AGE_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 5000;
const GRACE_MIN_MS = 100;
const GRACE_MAX_MS = 60_000;

function clampGrace(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_GRACE_MS;
  if (value < GRACE_MIN_MS) return GRACE_MIN_MS;
  if (value > GRACE_MAX_MS) return GRACE_MAX_MS;
  return value;
}

export function registerRecoverTool(server: McpServer): void {
  server.registerTool(
    'deckent_recover',
    {
      title: 'Sprint Recovery',
      description:
        'Recover from a crashed or stuck sprint. Runs audit, terminates a zombie Brain coordinator (SIGTERM→grace→SIGKILL), cleans orphan IPC directories (dead PIDs only), clears stale locks (>5min), archives terminal task files, resets sprint-state.json to terminal (COMPLETE/ABORTED), and sweeps .worker-/.prompt- tmpfiles (forensic plants preserved). Active tasks are preserved. Use dryRun=true to preview before executing. DESTRUCTIVE: modifies .tasks/, .locks/, and .deckent/ directories.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        sprintId: z.string().describe('Sprint ID to recover (e.g. "sprint-150")'),
        dryRun: z.boolean().optional().default(false).describe('Preview mode: show what would be cleaned without making changes'),
        skipAudit: z.boolean().optional().default(false).describe('Skip the self-audit gate step'),
        gracePeriodMs: z.number().int().optional().describe('SIGTERM→SIGKILL grace period in ms (default 5000, clamped to [100, 60000])'),
      }),
    },
    async ({ sprintId, dryRun, skipAudit, gracePeriodMs }) => {
      const root = process.cwd();
      const grace = clampGrace(gracePeriodMs);

      try {
        // Step 1: Optional audit
        let auditGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' = 'SKIPPED';
        if (!skipAudit) {
          try {
            const auditResult = await runSelfAuditGate(sprintId, root);
            auditGate = auditResult.overallGate;
          } catch {
            auditGate = 'SKIPPED';
          }
        }

        // Step 2 (Bug R3): Zombie Brain kill
        let zombieKill: Awaited<ReturnType<typeof killZombieBrain>> | null = null;
        try {
          zombieKill = await killZombieBrain(root, sprintId, {
            gracePeriodMs: grace,
            dryRun,
          });
          if (
            !dryRun &&
            zombieKill &&
            (zombieKill.outcome === 'sigterm-graceful' ||
              zombieKill.outcome === 'sigkill-required' ||
              zombieKill.outcome === 'already-dead')
          ) {
            try {
              const orphan = detectOrphan(root, sprintId);
              if (orphan) archiveOrphan(root, orphan);
            } catch (e) { debugLog('mcp:recover:archiveOrphan', e); }
          }
        } catch { /* best-effort */ }

        if (dryRun) {
          // Preview only
          const deckentDir = join(root, '.deckent');
          const ipcPattern = /^sprint-\d+-ipc$/;
          const orphanIpcCount = existsSync(deckentDir)
            ? readdirSync(deckentDir).filter(e => ipcPattern.test(e)).length
            : 0;

          let staleLockCount = 0;
          const locksDir = join(root, LOCKS_DIR);
          if (existsSync(locksDir)) {
            const now = Date.now();
            for (const f of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
              try {
                const st = statSync(join(locksDir, f));
                if (now - st.mtimeMs > STALE_LOCK_AGE_MS) staleLockCount++;
              } catch { /* skip */ }
            }
          }

          let taskFileCount = 0;
          let tmpfilesSwept = 0;
          let tmpfilesPreserved = 0;
          const tasksDir = join(root, TASKS_DIR);
          if (existsSync(tasksDir)) {
            const entries = readdirSync(tasksDir);
            taskFileCount = entries.filter(
              f => f.endsWith('.json') || f.endsWith('.result') || f.endsWith('.hb'),
            ).length;
            tmpfilesSwept = entries.filter(isTaskTmpfile).length;
            tmpfilesPreserved = selectPreservedPlants(entries).length;
          }

          const enriched = enrichResponse('recover', {
            dryRun: true,
            sprintId,
            auditGate,
            zombieKill,
            orphanIpcDirs: orphanIpcCount,
            staleLocks: staleLockCount,
            taskFiles: taskFileCount,
            tmpfilesSwept,
            tmpfilesPreserved,
          });

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        // Step 3: Clean orphan IPC directories
        let orphanIpcDirs: string[] = [];
        try {
          orphanIpcDirs = cleanOrphanIpcDirs(root, { checkLivePid: true });
        } catch { /* best-effort */ }

        // Step 4: Clear stale locks
        let staleLocksCleaned = 0;
        try {
          staleLocksCleaned = clearStaleLocks(root, STALE_LOCK_AGE_MS);
        } catch { /* best-effort */ }

        // Step 5: Archive terminal task files
        let taskFilesArchived = 0;
        let taskFilesPreserved = 0;
        try {
          const cleanupResult = postFinalizeCleanup(root, sprintId);
          taskFilesArchived = cleanupResult.archivedFiles.length;
          taskFilesPreserved = cleanupResult.preservedFiles.length;
        } catch { /* best-effort */ }

        // Step 6 (Bug R2): Reset sprint-state.json to terminal
        let sprintStateReset: ReturnType<typeof resetSprintStateOnRecover> = null;
        try {
          sprintStateReset = resetSprintStateOnRecover(root);
          if (sprintStateReset) {
            writeEvent(
              root,
              sprintId,
              'deckent',
              '*',
              'DECKENT→*:SPRINT_RECOVER_STATE_RESET',
              {
                sprintId: sprintStateReset.sprintId,
                oldPhase: sprintStateReset.oldPhase,
                newPhase: sprintStateReset.newPhase,
                oldStatus: sprintStateReset.oldStatus,
                newStatus: sprintStateReset.newStatus,
                updatedAt: sprintStateReset.updatedAt,
              },
            );
          }
        } catch { /* best-effort */ }

        // Step 7 (Bug R5): Sweep tmpfiles, preserving forensic plants
        let tmpfilesSwept = 0;
        let tmpfilesPreserved = 0;
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
              } catch { /* best-effort per file */ }
            }
            tmpfilesSwept = sweptFiles.length;
            tmpfilesPreserved = preservedFiles.length;
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
        } catch { /* best-effort */ }

        const enriched = enrichResponse('recover', {
          success: true,
          sprintId,
          auditGate,
          zombieKill,
          orphanIpcDirsRemoved: orphanIpcDirs.length,
          staleLocksCleaned,
          taskFilesArchived,
          taskFilesPreserved,
          sprintStateReset,
          tmpfilesSwept,
          tmpfilesPreserved,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
