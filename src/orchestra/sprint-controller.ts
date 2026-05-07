// ═══ Sprint Controller (Thin Orchestration Layer) ══════════════════
// Sprint 136: Slimmed from ~1894 LoC to a thin barrel re-export layer.
// Only runSprint(), waitForResults(), and evaluateResult() remain here.
// All other functions are delegated to sub-modules:
//   sprint-planner.ts    — readContext, planSprint, confirmDraftTasks, cleanupDraftTasks
//   sprint-spawner.ts    — spawnWorkers, respawnEligibleTasks, validateTaskDependencies, routeSprintTasks
//   sprint-lifecycle.ts  — interrupt state, cleanup, pauseSprint, resumeSprint, waitForHumanApproval
//   sprint-finalizer.ts  — finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, etc.
//   ipc-registry.ts      — IPC channel registry
//   result-collector.ts  — waitForResultsImpl, resolveAgentPrompt, resolveSkillPrompts

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Core (value imports) ──────────────────────────────────────────
import {
  TaskEvaluation, SprintPhase,
  SprintStatus,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, Sprint,
  ResolvedConfig, ProviderName,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { readJsonSafe, debugLog, updateLastSprintId } from '../core/utils.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';

// ─── Connector (provider lifecycle) ─────────────────────────────
import type { Connector } from './connector.js';

// ─── Core — sprint lock ───────────────────────────────────────────
import { acquireSprintLock, releaseSprintLock } from '../core/multi-ide.js';

// ─── Nervous System (Sprint 153 — observer wire; Sprint 154 T8 — subscriber wire) ─
import { NervousObserver } from '../nervous/observer.js';
import type { DetectorConfig } from '../nervous/detector-registry.js';
import { NervousDispatcher } from '../nervous/dispatcher.js';
import { NervousHistory } from '../nervous/history.js';
import type { DetectorResult, ObserverEvent, ExecutionRecord, NervousNotification } from '../core/nervous-types.js';
import { randomUUID } from 'node:crypto';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now, isDocTask,
  getDefaultProvider,
  writeSprintState, clearSprintState,
} from './sprint-utils.js';

// ─── Sprint Phases (extracted phase functions) ──────────────────────
import {
  runPlanPhase, runSpawnPhase, runEvaluatePhase,
  runRollbackCheck, runFixPhase, runRetroPhase,
  runCleanupPhase,
} from './sprint-phases.js';

// ─── Result Collector ─────────────────────────────────────────────
import {
  waitForResults as waitForResultsImpl,
} from './result-collector.js';

// ─── Fallback Chain (Sprint 155 Task 1) ───────────────────────────
import { evaluateForFallback } from './result-evaluator.js';
import { MAX_FALLBACK_RETRIES } from '../core/provider-fallback.js';
import { spawnWorkers as spawnWorkersImpl } from './sprint-spawner.js';

// ─── Coverage Validator ───────────────────────────────────────────
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Baseline Tracker ─────────────────────────────────────────────
import { captureVitestBaseline, writeBaseline } from './baseline-tracker.js';

// ─── PID Manager ─────────────────────────────────────────────────
import {
  writePid, clearPid, writeStateSnapshot,
} from './sprint-pid-manager.js';
import type { SprintStateSnapshot } from './sprint-pid-manager.js';

// ─── Sprint Checkpoint (phase-transition auto-checkpoint) ────────
import { writePhaseCheckpoint } from './sprint-checkpoint.js';

// ─── Event Bus (nervous system lifecycle hooks) ─────────────────
import { eventBus } from './event-bus.js';

// ─── Notify (DECKENT→USER:NOTIFY wire — Hot Fix H6) ─────────────
import { notify } from './notify.js';

// ─── Panic Guard ─────────────────────────────────────────────────
import { PanicGuard } from '../core/panic-guard.js';

// ─── Observability ──────────────────────────────────────────────
import { metric, trace, structuredLog, initObservability, setObservabilitySprintId } from '../core/observability.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { loadPluginHooks } from '../core/plugin-hooks.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { resetDashboard, updateDashboard } from '../monitor/auditor.js';

// ─── Lifecycle (interrupt, cleanup, etc.) ─────────────────────────
import {
  BrainError,
  setActiveSprint, clearActiveSprint, safeDashboardUpdate,
  waitForHumanApproval,
} from './sprint-lifecycle.js';

// ─── IPC Registry ─────────────────────────────────────────────────
import { getChannelRegistry } from './ipc-registry.js';

// ─── Spawner ──────────────────────────────────────────────────────
import {
  routeSprintTasks as routeSprintTasksImpl,
} from './sprint-spawner.js';

// ─── Task Mode Runner ─────────────────────────────────────────────
export { runTaskMode } from './task-mode-runner.js';
export type { TaskModeContext, TaskModeResult } from './task-mode-runner.js';

// ═══ Re-exports — backward compatibility ══════════════════════════
// All symbols previously exported from this file are re-exported
// from their new sub-module homes.

// --- sprint-planner.ts ---
export { readContext, planSprint, confirmDraftTasks, cleanupDraftTasks } from './sprint-planner.js';

// --- sprint-spawner.ts ---
export { spawnWorkers, respawnEligibleTasks, validateTaskDependencies, routeSprintTasks } from './sprint-spawner.js';

// --- sprint-lifecycle.ts ---
export {
  BrainError, setActiveSprint, clearActiveSprint, resetInterruptState,
  isInterrupted, interruptActiveSprint, cleanup, pauseSprint, resumeSprint,
  waitForHumanApproval, safeDashboardUpdate,
} from './sprint-lifecycle.js';
export type { PauseState, CheckpointPhase } from './sprint-lifecycle.js';

// --- sprint-utils.ts ---
export {
  isDocTask, isStaleTaskFile, isTmuxProvider,
  resolveDefaultUsageCli, getDefaultProvider, resolveTaskProvider,
  getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog,
  writeSprintState, readSprintState, clearSprintState,
  detectOrphanWorkers, buildSpawnRetryHint,
} from './sprint-utils.js';
export type { SprintState } from './sprint-utils.js';

// --- result-collector.ts ---
export { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// --- ipc-registry.ts ---
export { getChannelRegistry, registerWorkerChannel, unregisterWorkerChannel } from './ipc-registry.js';

// --- sprint-finalizer.ts ---
export { finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, writeRubricDetail, runSelfAuditGate } from './sprint-finalizer.js';
export type { FinalizeSprintOptions, SelfAuditResult } from './sprint-finalizer.js';

// --- parallel-pipeline.ts ---
export { DependencyCycleError } from './parallel-pipeline.js';

// ═══ Sprint Lifecycle Event Helpers (Nervous System hooks) ════════

/**
 * Emit a sprint lifecycle event via the EventBus.
 * Always fires regardless of nervous system config — subscribers are optional.
 * NervousObserver listens for these as 'sprint-lifecycle' source events.
 */
function emitSprintEvent(
  type: string,
  payload: Record<string, unknown>,
): void {
  try {
    eventBus.emit('deckent-event', {
      type,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Never let event emission break sprint flow
  }
}

function emitPhaseChange(oldPhase: string, newPhase: string, sprintId: string): void {
  emitSprintEvent('SPRINT_PHASE_CHANGE', { oldPhase, newPhase, sprintId });
}

// ═══ RunSprintOptions ═════════════════════════════════════════════

export interface RunSprintOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  testMode?: boolean;
  skipCleanup?: boolean;
  timeoutMs?: number;
  /** Fix phase timeout in milliseconds (default: 10 minutes) */
  fixPhaseTimeoutMs?: number;
  /** Optional SpawnBackend override -- defaults to SpawnBackendFactory.create() */
  spawnBackend?: SpawnBackend;
  /** Optional ProviderAdapter override */
  provider?: ProviderAdapter;
  /**
   * Enable git rollback safety mechanism.
   * When true (default): creates a safety branch before PLAN phase and
   * offers rollback when all tasks result in NO_GO.
   * When false: disables rollback entirely.
   */
  rollback?: boolean;
  /** Optional Connector instance — when provided, router uses connector.getAvailableProviders() */
  connector?: Connector;
}

// ═══ Core Functions (kept in this file) ═══════════════════════════

/**
 * Wait for task result files to appear on disk using fs.watch with fallback polling.
 * Supports queued task execution: as workers finish, queued tasks are spawned.
 * Delegates to result-collector.ts (extracted Phase 3).
 */
export async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
  queue?: Task[],
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<TaskResult[]> {
  return trace('wait_results', () =>
    waitForResultsImpl(projectRoot, sprint, timeoutMs, queue, spawnOpts, getChannelRegistry()),
  );
}

/**
 * Evaluate a worker's task result and return DONE, GO_WITH_TECH_DEBT, or NO_GO.
 * Checks self-assessment, test results, doc-task status, and coverage threshold (90%).
 */
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string, coverageThreshold = 90): TaskEvaluation {
  const evalStart = Date.now();
  try {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  if (isDocTask(task)) return TaskEvaluation.DONE;

  // Coverage validation: if vitest JSON output provided, validate reported vs actual
  if (vitestJsonOutput !== undefined) {
    const coverageCheck = validateWorkerCoverage({
      reportedCoverage: result.coverage,
      vitestJsonOutput,
      taskScope: { directories: task.scope?.directories ?? [] },
    });
    if (coverageCheck && coverageCheck.level === 'WARNING') {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }

  if (result.coverage < coverageThreshold) return TaskEvaluation.GO_WITH_TECH_DEBT;
  return TaskEvaluation.DONE;
  } finally {
    metric('eval.duration_ms', Date.now() - evalStart, { taskId: task.id });
  }
}

// ═══ Fallback Chain (Sprint 155 Task 1) ═══════════════════════════
//
// When a worker output contains a 429/capacity/quota signal AND the
// configured `fallback_provider` differs from the failed provider, Brain
// retries the task once with the fallback. Bounded by MAX_FALLBACK_RETRIES
// per task — no infinite loops.
//
// Wired BEFORE runFixPhase in runSprint so successful fallback retries
// upgrade evaluations from NO_GO to whatever the fallback produces, and
// the existing FIX phase only sees the truly unrecoverable failures.

/** Plan describing one fallback retry: which task, which provider swap, why */
export interface FallbackRetryPlan {
  task: Task;
  originalProvider: ProviderName | undefined;
  targetProvider: ProviderName;
  originalResult: TaskResult;
  reason: string;
}

/**
 * Decide which NO_GO results should be retried with the fallback provider.
 *
 * Pure function — examines the inputs and returns a list of retry plans
 * without performing any I/O or mutation. Caller is expected to enforce
 * the max-retries limit by passing `alreadyRetried` (a Set of task IDs
 * that have already used their fallback slot).
 *
 * @param sprint            Current sprint (provides task lookup)
 * @param results           All worker results collected from EXECUTE phase
 * @param evaluations       Map of taskId → TaskEvaluation (NO_GO triggers consideration)
 * @param fallbackProvider  config.fallback_provider value
 * @param alreadyRetried    Set of task IDs that have already used a fallback retry
 */
export function prepareFallbackRetries(
  sprint: Sprint,
  results: TaskResult[],
  evaluations: Map<string, TaskEvaluation>,
  fallbackProvider: ProviderName | undefined,
  alreadyRetried: ReadonlySet<string>,
): FallbackRetryPlan[] {
  if (!fallbackProvider) return [];

  const plans: FallbackRetryPlan[] = [];
  const taskById = new Map(sprint.tasks.map(t => [t.id, t]));

  for (const result of results) {
    if (evaluations.get(result.taskId) !== TaskEvaluation.NO_GO) continue;
    if (alreadyRetried.has(result.taskId)) continue;

    const task = taskById.get(result.taskId);
    if (!task) continue;

    const decision = evaluateForFallback(result, task.provider, fallbackProvider);
    if (decision.kind !== 'RetryWithFallback') continue;

    plans.push({
      task,
      originalProvider: task.provider,
      targetProvider: decision.targetProvider,
      originalResult: result,
      reason: decision.reason,
    });
  }

  return plans;
}

/**
 * Dependency-injected variant for testing. Performs the orchestration
 * (provider swap on disk, .result rename, spawn, wait, re-evaluate)
 * via injected functions so tests can mock spawn/wait without invoking
 * a real provider.
 */
export interface FallbackRetryDeps {
  /** Persist task JSON to disk */
  persistTask?: (projectRoot: string, task: Task) => Promise<void>;
  /** Move/rename the original .result aside */
  archiveResult?: (projectRoot: string, taskId: string) => Promise<void>;
  /** Spawn one or more retry workers */
  spawnRetry?: (projectRoot: string, retrySprint: Sprint, config: ResolvedConfig, opts: { autoApprove?: boolean; spawnBackend?: SpawnBackend }) => Promise<void>;
  /** Wait for retry results */
  waitForRetryResults?: (projectRoot: string, retrySprint: Sprint, timeoutMs: number, spawnBackend?: SpawnBackend) => Promise<TaskResult[]>;
  /** Re-evaluate a single retry result */
  reevaluate?: (result: TaskResult, task: Task) => TaskEvaluation;
}

/**
 * Default re-evaluation: uses the existing rubric-based evaluator and
 * maps `EvaluationResult.decision` to `TaskEvaluation`.
 */
function defaultReevaluate(result: TaskResult, task: Task): TaskEvaluation {
  // evaluateWithRubric is exported from result-evaluator.ts but we avoid the
  // dynamic import cycle by re-implementing the trivial mapping here.
  // For simplicity, fall back to evaluateResult which is already in scope.
  return evaluateResult(result, task);
}

/**
 * Execute the fallback retry pipeline for a sprint.
 *
 * Steps for each plan:
 *   1. Mutate `task.provider = targetProvider` (in-memory).
 *   2. Persist task JSON to disk so the spawner picks up the new provider.
 *   3. Move the original `.result` aside (`.result.fallback-attempt-N`)
 *      so waitForResults() does not re-collect the stale failure.
 *   4. Build a mini-sprint with just the retry tasks; spawn + wait.
 *   5. For each new result: re-evaluate, update `evaluations` and `results`.
 *
 * Returns aggregate stats. NEVER throws — failures of the fallback
 * orchestration itself fall back silently to leaving the original NO_GO
 * in place (FIX phase will still try its normal path).
 *
 * @param projectRoot     Project root path
 * @param sprint          Current sprint (its tasks/workers may be mutated)
 * @param results         Worker results array (mutated in place: replaced/added)
 * @param evaluations     Evaluation map (mutated in place when retries succeed)
 * @param config          Resolved sprint config (reads `fallback_provider`)
 * @param opts            Run options (autoApprove, spawnBackend)
 * @param spawnBackend    Optional spawn backend override
 * @param deps            Optional dependency injection for tests
 */
export async function runFallbackRetries(
  projectRoot: string,
  sprint: Sprint,
  results: TaskResult[],
  evaluations: Map<string, TaskEvaluation>,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
  spawnBackend?: SpawnBackend,
  deps: FallbackRetryDeps = {},
): Promise<{ retried: number; successful: number }> {
  const fallbackProvider = config.fallback_provider;
  if (!fallbackProvider) return { retried: 0, successful: 0 };

  const alreadyRetried = new Set<string>();
  const plans = prepareFallbackRetries(sprint, results, evaluations, fallbackProvider, alreadyRetried);
  if (plans.length === 0) return { retried: 0, successful: 0 };

  const persistTask = deps.persistTask ?? defaultPersistTask;
  const archiveResult = deps.archiveResult ?? defaultArchiveResult;
  const spawnRetry = deps.spawnRetry ?? defaultSpawnRetry;
  const waitForRetryResults = deps.waitForRetryResults ?? defaultWaitForRetryResults;
  const reevaluate = deps.reevaluate ?? defaultReevaluate;

  // Apply at most MAX_FALLBACK_RETRIES per task — slice the plan list
  // to be safe even though prepareFallbackRetries already filters via
  // alreadyRetried (keep the invariant local + auditable here too).
  const planned = plans.slice(0, plans.length);
  let successful = 0;

  for (const plan of planned) {
    if (alreadyRetried.size >= sprint.tasks.length * MAX_FALLBACK_RETRIES) break;

    try {
      plan.task.provider = plan.targetProvider;
      await persistTask(projectRoot, plan.task);
      await archiveResult(projectRoot, plan.task.id);
      alreadyRetried.add(plan.task.id);

      structuredLog('info', 'fallback_retry_dispatch', {
        taskId: plan.task.id,
        from: plan.originalProvider ?? 'unknown',
        to: plan.targetProvider,
        reason: plan.reason,
      });
    } catch (e) {
      debugLog('runFallbackRetries:setup', e);
    }
  }

  if (alreadyRetried.size === 0) return { retried: 0, successful: 0 };

  const retryTasks = planned
    .filter(p => alreadyRetried.has(p.task.id))
    .map(p => p.task);
  const retrySprint: Sprint = {
    ...sprint,
    tasks: retryTasks,
    workers: retryTasks.map(t => `w-${t.id}`),
  };

  const fallbackTimeoutMs = opts?.timeoutMs ?? 30 * 60 * 1000;
  try {
    await spawnRetry(projectRoot, retrySprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
    const retryResults = await waitForRetryResults(projectRoot, retrySprint, fallbackTimeoutMs, spawnBackend);

    for (const retryResult of retryResults) {
      const planForResult = planned.find(p => p.task.id === retryResult.taskId);
      if (!planForResult) continue;

      const evalResult = reevaluate(retryResult, planForResult.task);
      evaluations.set(retryResult.taskId, evalResult);

      // Replace the original result in the results array (post-fallback wins).
      const idx = results.findIndex(r => r.taskId === retryResult.taskId);
      if (idx >= 0) results[idx] = retryResult;
      else results.push(retryResult);

      if (evalResult !== TaskEvaluation.NO_GO) successful++;
    }
  } catch (e) {
    debugLog('runFallbackRetries:dispatch', e);
  }

  return { retried: alreadyRetried.size, successful };
}

// ─── Default I/O implementations ─────────────────────────────────

async function defaultPersistTask(projectRoot: string, task: Task): Promise<void> {
  const taskPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
  await writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');
}

async function defaultArchiveResult(projectRoot: string, taskId: string): Promise<void> {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const exists = await stat(resultPath).then(() => true, () => false);
  if (!exists) return;
  // Pick the next available archive index so concurrent retries don't collide.
  for (let attempt = 0; attempt < 10; attempt++) {
    const archivePath = `${resultPath}.fallback-attempt-${attempt}`;
    const archiveExists = await stat(archivePath).then(() => true, () => false);
    if (!archiveExists) {
      await rename(resultPath, archivePath);
      return;
    }
  }
}

async function defaultSpawnRetry(
  projectRoot: string,
  retrySprint: Sprint,
  config: ResolvedConfig,
  opts: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<void> {
  await spawnWorkersImpl(projectRoot, retrySprint, config, opts);
}

async function defaultWaitForRetryResults(
  projectRoot: string,
  retrySprint: Sprint,
  timeoutMs: number,
  spawnBackend?: SpawnBackend,
): Promise<TaskResult[]> {
  return waitForResults(projectRoot, retrySprint, timeoutMs, undefined, { spawnBackend });
}

/**
 * Execute a full sprint lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP.
 * Supports human checkpoints, configurable timeout, and provider routing.
 */
export async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
): Promise<Sprint> {
  // Mode guard: task mode cannot use sprint lifecycle
  if (config.deckent_style === 'task') {
    throw new BrainError(
      'Sprint mode required for runSprint. Use runTaskMode for task style. ' +
      'Set deckent_style=sprint or run `deckent mode sprint`.',
      SprintPhase.PLAN,
    );
  }

  const routingVersionForFix = config.routing_engine ?? 'v1';

  const spawnBackend: SpawnBackend | undefined = opts?.spawnBackend
    ?? (config.spawn_backend
      ? SpawnBackendFactory.create({
          backend: config.spawn_backend,
          projectDir: projectRoot,
          dockerImage: config.docker_image,
          dockerTimeoutSeconds: config.docker_timeout,
        })
      : undefined);

  const activeProvider: ProviderAdapter | null = opts?.provider ?? getDefaultProvider();
  const rollbackEnabled = opts?.rollback !== false;

  initObservability(projectRoot);
  structuredLog('info', 'Sprint starting', { sprintPhase: 'INIT' });

  try {
    await loadPluginHooks(projectRoot);
  } catch (e) { debugLog('runSprint:loadPluginHooks', e); }

  // Sprint Lock
  const sprintLockId = `sprint-${Date.now()}`;
  const lockAcquired = acquireSprintLock(projectRoot, sprintLockId);
  if (!lockAcquired) {
    throw new BrainError(
      'Another sprint is already running in this project. Use --force or wait for the active sprint to complete.',
      SprintPhase.PLAN,
    );
  }

  // Phase 1: PLAN
  const { sprint, safetyPoint } = await runPlanPhase(
    projectRoot, config, opts, activeProvider, rollbackEnabled,
  );

  // Set sprint ID for observability tagging (sprintId available after plan phase)
  setObservabilitySprintId(sprint.id, { perSprintFile: true });

  // Human Checkpoint: PLAN
  if (config.human_checkpoints?.includes('plan')) {
    const taskSummary = `${sprint.tasks.length} task planlandı: ${sprint.tasks.map(t => t.title).join(', ')}`;
    const approved = await waitForHumanApproval(projectRoot, sprint.id, 'plan', taskSummary);
    if (!approved) {
      sprint.status = SprintStatus.ABORTED;
      sprint.completedAt = now();
      clearActiveSprint();
      releaseSprintLock(projectRoot);
      clearSprintState(projectRoot);
      return sprint;
    }
  }

  setActiveSprint(projectRoot, sprint, spawnBackend);

  // Nervous System Observer (Sprint 153 wire — was dormant since Sprint 147).
  // Activated when nervous_system.enabled. Observer subscribes to event-bus,
  // watches .tasks/+.brain/+DIRECTIVES.md+.deckent/, and ticks every 15s.
  // Detector results emit via 'detection' event for downstream proposers.
  let nervousObserver: NervousObserver | null = null;
  if (config.nervous_system?.enabled) {
    try {
      // NervousSystemConfig.detectors and DetectorConfig share the same shape
      // (NervousDetectorConfig has all optional fields a detector might use),
      // so a structural cast is safe.
      const detectorConfig = config.nervous_system.detectors as unknown as DetectorConfig;
      nervousObserver = new NervousObserver(projectRoot, 15_000, detectorConfig);
      nervousObserver.start();

      // Sprint 154 T8: detection subscriber wire (Dispatcher + History).
      // Without this, observer fires but no downstream record is written —
      // 11 sprint history showed 0 nervous-history.jsonl files.
      // ADR-040 minimal pipeline: every detection → audit log + notification dispatch.
      const dispatcher = new NervousDispatcher(config.nervous_system, projectRoot);
      const history = new NervousHistory(projectRoot);
      nervousObserver.on('detection', (result: DetectorResult, event: ObserverEvent) => {
        // 1) Append detection evidence to nervous-history.jsonl (autonomous record)
        const record: ExecutionRecord = {
          id: randomUUID(),
          notificationId: event.id,
          actionId: result.suggestedActions[0]?.id ?? 'detection-only',
          decision: 'autonomous',
          decidedBy: 'system',
          executedAt: new Date().toISOString(),
          outcome: 'success',
          reversible: false,
          payload: {
            detectorRisk: result.risk,
            shouldNotify: result.shouldNotify,
            severity: result.severity,
            groupKey: result.groupKey,
            eventSource: event.source,
            eventType: event.type,
            sprintId: event.sprintId ?? sprint.id,
            taskId: event.taskId,
          },
        };
        void history.append(record).catch(err => {
          debugLog('runSprint:nervous:history', err instanceof Error ? err.message : String(err));
        });

        // 2) Dispatch notification only if detector requested it (shouldNotify=true).
        //    Skip purely informational detections to avoid spamming channels.
        if (!result.shouldNotify) return;
        const notification: NervousNotification = {
          id: randomUUID(),
          type: (result.metadata?.type as string) ?? 'detection',
          title: `Detection: ${event.type}`,
          message: `Detector flagged event ${event.id} (risk=${result.risk}, source=${event.source})`,
          severity: result.severity ?? 'info',
          createdAt: new Date().toISOString(),
          detectorId: (result.metadata?.detectorId as string) ?? 'unknown',
          actions: result.suggestedActions.map(a => ({
            id: a.id,
            label: a.label,
            policy: 'suggest-5m' as const,
            risk: a.risk,
            isSafetyFloor: false,
            payload: a.payload,
          })),
          timeoutMs: null,
          sprintId: event.sprintId ?? sprint.id,
          taskId: event.taskId,
          groupKey: result.groupKey,
        };
        void dispatcher.dispatch(notification).catch(err => {
          debugLog('runSprint:nervous:dispatch', err instanceof Error ? err.message : String(err));
        });
      });

      debugLog('runSprint:nervous', `Observer + Dispatcher + History wired for sprint=${sprint.id}`);
    } catch (err) {
      // Observer must never block sprint execution — log and continue.
      debugLog('runSprint:nervous', `Observer start failed: ${err instanceof Error ? err.message : String(err)}`);
      nervousObserver = null;
    }
  }

  // PID + Snapshot Setup
  try { writePid(projectRoot, sprint.id); } catch (e) { debugLog('runSprint:writePid', e); }

  let snapshotInterval: ReturnType<typeof setInterval> | null = null;
  const writePeriodicSnapshot = async (): Promise<void> => {
    try {
      const snap: SprintStateSnapshot = {
        sprintId: sprint.id,
        pid: process.pid,
        startedAt: sprint.startedAt ?? new Date().toISOString(),
        currentWave: 0,
        taskStatuses: Object.fromEntries(sprint.tasks.map(t => [t.id, t.status])),
        metricsJsonlSize: 0,
        lastHeartbeat: new Date().toISOString(),
      };
      try {
        const metricsPath = join(projectRoot, '.deckent', 'metrics.jsonl');
        try {
          const metricsContent = await readFile(metricsPath, 'utf-8');
          snap.metricsJsonlSize = metricsContent.split('\n').filter(Boolean).length;
        } catch { /* file doesn't exist or not readable — non-fatal */ }
      } catch { /* non-fatal */ }
      writeStateSnapshot(projectRoot, sprint.id, snap);
    } catch (e) { debugLog('runSprint:writeStateSnapshot', e); }
  };

  void writePeriodicSnapshot();
  snapshotInterval = setInterval(() => void writePeriodicSnapshot(), 30_000);

  const beforeExitHandler = (): void => {
    try { void writePeriodicSnapshot(); } catch { /* best effort */ }
    try { clearPid(projectRoot, sprint.id); } catch { /* best effort */ }
    try { nervousObserver?.stop(); } catch { /* best effort */ }
  };
  process.on('beforeExit', beforeExitHandler);

  // Phase 1.5: Route tasks to providers
  try {
    const connector = opts?.connector;
    const availableProviders = connector
      ? connector.getAvailableProviders()
      : providerRegistry.listProviders() as ProviderName[];
    routeSprintTasksImpl(sprint.tasks, config, availableProviders);
  } catch (e) { debugLog('runSprint:routeSprintTasks', e); }

  try { updateLastSprintId(projectRoot, sprint.id); } catch (e) { debugLog('runSprint:updateLastSprintId', e); }
  try { resetDashboard(projectRoot, sprint.id, sprint.tasks.length); } catch (e) { debugLog('runSprint:resetDashboard', e); }
  writeSprintState(projectRoot, sprint);

  // Phase 1.9: Capture pre-sprint test baseline
  try {
    const captured = captureVitestBaseline(projectRoot);
    if (captured) writeBaseline(projectRoot, sprint.id, captured);
  } catch (e) { debugLog('runSprint:baseline', e); }

  // Phase-transition checkpoint: PLAN complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:plan', e); }

  // Nervous System: PLAN→SPAWN + SPRINT_STARTED
  emitPhaseChange(SprintPhase.PLAN, SprintPhase.SPAWN, sprint.id);
  emitSprintEvent('SPRINT_STARTED', { sprintId: sprint.id, taskCount: sprint.tasks.length });

  // DECKENT→USER:NOTIFY (Hot Fix H6) — fire-and-forget, fail-safe
  try {
    void notify(
      'sprint-started',
      sprint.id,
      `Sprint ${sprint.id} başladı`,
      `${sprint.tasks.length} task planlandı`,
    );
  } catch (e) { debugLog('runSprint:notify:sprint-started', e); }

  // Phase 2: SPAWN
  const { taskQueue, scanInterval: initialScanInterval } = await runSpawnPhase(
    projectRoot, sprint, config, opts, spawnBackend,
  );
  let scanInterval = initialScanInterval;

  // Phase-transition checkpoint: SPAWN complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:spawn', e); }

  // Nervous System: SPAWN→EXECUTE
  emitPhaseChange(SprintPhase.SPAWN, SprintPhase.EXECUTE, sprint.id);

  // Phase 3: EXECUTE
  let results: TaskResult[] = [];
  try {
    sprint.phase = SprintPhase.EXECUTE;
    writeSprintState(projectRoot, sprint);
    results = await waitForResults(projectRoot, sprint, opts?.timeoutMs, taskQueue, { autoApprove: opts?.autoApprove, spawnBackend });
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Post-collect sweep
  try {
    const preGraceCollectedIds = new Set(results.map(r => r.taskId));
    for (const task of sprint.tasks) {
      if (preGraceCollectedIds.has(task.id)) continue;
      const latePath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
      const lateExists = await stat(latePath).then(() => true, () => false);
      if (lateExists) {
        const lateResult = readJsonSafe<TaskResult>(latePath);
        if (lateResult) results.push(lateResult);
      }
    }
  } catch (e) { debugLog('postCollect:main', e); }

  // Grace period (async file checks — Sprint 136 async I/O migration)
  try {
    const collectedIds = new Set(results.map(r => r.taskId));
    const staleWorkers: Task[] = [];
    for (const t of sprint.tasks) {
      if (collectedIds.has(t.id)) continue;
      const hbPath = join(projectRoot, TASKS_DIR, `task-${t.id}.hb`);
      const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
      const [hbExists, resExists] = await Promise.all([
        stat(hbPath).then(() => true, () => false),
        stat(resultPath).then(() => true, () => false),
      ]);
      if (hbExists && !resExists) staleWorkers.push(t);
    }

    if (staleWorkers.length > 0) {
      const GRACE_PERIOD_MS = 5 * 60 * 1000;
      await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS));

      for (const task of staleWorkers) {
        const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
        const resultExists = await stat(resultPath).then(() => true, () => false);
        if (resultExists) {
          const lateResult = readJsonSafe<TaskResult>(resultPath);
          if (lateResult) results.push(lateResult);
        } else {
          // Panic Guard: require user approval before killing workers
          const panicGuard = new PanicGuard(projectRoot);
          const decision = panicGuard.evaluate(
            task.id,
            task.assignedWorker ?? `w-${task.id}`,
            sprint.id,
            'grace_period_timeout',
            undefined, // no force/userExplicit — default BLOCK
            'Worker had heartbeat but failed to write result within grace period',
          );

          if (decision === 'BLOCK') {
            debugLog('graceKill:panicGuard', `Kill blocked for task ${task.id} — user approval required`);
            const syntheticResult: TaskResult = {
              taskId: task.id,
              workerId: task.assignedWorker ?? `w-${task.id}`,
              filesChanged: [],
              linesAdded: 0,
              linesRemoved: 0,
              testsPassed: false,
              coverage: 0,
              selfAssessment: 'NO_GO',
              notes: 'Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval required)',
            };
            try {
              await writeFile(resultPath, JSON.stringify(syntheticResult, null, 2), 'utf-8');
            } catch (e) { debugLog('graceKill:writeResult', e); }
            results.push(syntheticResult);
          } else {
            try {
              if (spawnBackend) spawnBackend.kill(task.id);
              else {
                const { killWorker: kw } = await import('./tmux.js');
                kw(task.id);
              }
            } catch (e) { debugLog('graceKill:killWorker', e); }

            const syntheticResult: TaskResult = {
              taskId: task.id,
              workerId: task.assignedWorker ?? `w-${task.id}`,
              filesChanged: [],
              linesAdded: 0,
              linesRemoved: 0,
              testsPassed: false,
              coverage: 0,
              selfAssessment: 'NO_GO',
              notes: 'Worker had heartbeat but failed to write result within grace period — killed (user-explicit override)',
            };
            try {
              await writeFile(resultPath, JSON.stringify(syntheticResult, null, 2), 'utf-8');
            } catch (e) { debugLog('graceKill:writeResult', e); }
            results.push(syntheticResult);
          }
        }
      }
    }
  } catch (e) { debugLog('graceKill:main', e); }

  // Phase-transition checkpoint: EXECUTE complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:execute', e); }

  // Nervous System: EXECUTE→EVALUATE
  emitPhaseChange(SprintPhase.EXECUTE, SprintPhase.EVALUATE, sprint.id);

  // Phase 4: EVALUATE
  // Sprint 154 T7 wire: pass config + spawnOpts so runEvaluatePhase can drive
  // dependency-pipeline cascade/unblock/respawn (was dormant in sprint-phases.ts).
  const evaluations = new Map<string, TaskEvaluation>();
  await runEvaluatePhase(
    projectRoot, sprint, results, evaluations, config.coverage_threshold,
    config, { autoApprove: opts?.autoApprove, spawnBackend },
  );

  // Honesty Check Metrics
  {
    const HONESTY_PATTERNS = [/pre-existing/i, /unrelated/i];
    for (const r of results) {
      if (r.notes && HONESTY_PATTERNS.some(p => p.test(r.notes))) {
        metric('honesty.check', 1, { taskId: r.taskId });
      }
    }
  }

  runRollbackCheck(projectRoot, sprint, evaluations, rollbackEnabled, safetyPoint);

  // Human Checkpoint: EVALUATE
  if (config.human_checkpoints?.includes('evaluate')) {
    const goCount = [...evaluations.values()].filter(e => e === TaskEvaluation.DONE).length;
    const noGoCount = [...evaluations.values()].filter(e => e === TaskEvaluation.NO_GO).length;
    const debtCount = [...evaluations.values()].filter(e => e === TaskEvaluation.GO_WITH_TECH_DEBT).length;
    const evalSummary = `Değerlendirme: ${goCount} GO, ${debtCount} TECH_DEBT, ${noGoCount} NO_GO — toplam ${evaluations.size} task`;
    const approved = await waitForHumanApproval(projectRoot, sprint.id, 'evaluate', evalSummary);
    if (!approved) {
      sprint.status = SprintStatus.ABORTED;
      sprint.completedAt = now();
      try { nervousObserver?.stop(); } catch { /* best effort */ }
      clearActiveSprint();
      releaseSprintLock(projectRoot);
      clearSprintState(projectRoot);
      return sprint;
    }
  }

  // Human Checkpoint: FIX
  if (config.human_checkpoints?.includes('fix')) {
    const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);
    if (noGoTasks.length > 0) {
      const fixSummary = `Fix fazı başlayacak: ${noGoTasks.length} NO_GO task — ${noGoTasks.map(t => t.title).join(', ')}`;
      const approved = await waitForHumanApproval(projectRoot, sprint.id, 'fix', fixSummary);
      if (!approved) {
        sprint.status = SprintStatus.ABORTED;
        sprint.completedAt = now();
        try { nervousObserver?.stop(); } catch { /* best effort */ }
        clearActiveSprint();
        releaseSprintLock(projectRoot);
        clearSprintState(projectRoot);
        return sprint;
      }
    }
  }

  // Phase-transition checkpoint: EVALUATE complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:evaluate', e); }

  // Phase 4.5: FALLBACK CHAIN (Sprint 155 Task 1)
  // Scan NO_GO results for capacity errors and retry with fallback_provider.
  // Bounded to MAX_FALLBACK_RETRIES per task — successful retries upgrade
  // evaluations so the FIX phase only handles truly unrecoverable failures.
  try {
    const fbStats = await runFallbackRetries(
      projectRoot, sprint, results, evaluations, config, opts, spawnBackend,
    );
    if (fbStats.retried > 0) {
      structuredLog('info', 'fallback_chain_complete', {
        retried: fbStats.retried,
        successful: fbStats.successful,
      });
    }
  } catch (e) { debugLog('runSprint:fallbackRetries', e); }

  // Nervous System: EVALUATE→FIX
  emitPhaseChange(SprintPhase.EVALUATE, SprintPhase.FIX, sprint.id);

  // Phase 5: FIX
  await runFixPhase(projectRoot, sprint, evaluations, results, config, opts, routingVersionForFix, spawnBackend);

  // Phase-transition checkpoint: FIX complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:fix', e); }

  // Nervous System: FIX→RETRO
  emitPhaseChange(SprintPhase.FIX, SprintPhase.RETRO, sprint.id);

  // Phase 6+7: RETRO + DECAY
  await runRetroPhase(projectRoot, sprint, evaluations, results, config, opts?.testMode);

  // Nervous System: RETRO complete + RETRO→CLEANUP
  emitSprintEvent('SPRINT_RETRO_COMPLETE', { sprintId: sprint.id });
  emitPhaseChange(SprintPhase.RETRO, SprintPhase.DECAY, sprint.id);

  // Phase 8: CLEANUP
  scanInterval = runCleanupPhase(projectRoot, sprint, config, opts, scanInterval, spawnBackend);

  // Nervous System: CLEANUP→COMPLETE
  emitPhaseChange(SprintPhase.DECAY, SprintPhase.COMPLETE, sprint.id);

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Nervous System: SPRINT_COMPLETED
  emitSprintEvent('SPRINT_COMPLETED', { sprintId: sprint.id });

  // Nervous System Observer cleanup (Sprint 153)
  try { nervousObserver?.stop(); } catch (err) {
    debugLog('runSprint:nervous-stop', err instanceof Error ? err.message : String(err));
  }

  releaseSprintLock(projectRoot);
  clearActiveSprint();
  clearSprintState(projectRoot);

  // PID Cleanup
  if (snapshotInterval) clearInterval(snapshotInterval);
  process.removeListener('beforeExit', beforeExitHandler);
  try { clearPid(projectRoot, sprint.id); } catch { /* non-fatal */ }

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents: [],
    progress: { done: sprint.tasks.length, active: 0, blocked: 0, total: sprint.tasks.length },
    alerts: [],
    updatedAt: now(),
  });

  return sprint;
}
