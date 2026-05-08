/**
 * Sprint 162A — Bug Stall: FIX-phase spawn loop deadlock regression suite.
 *
 * The bug: `runFixPhase` discards `spawnWorkers`' return (queued tasks) and
 * passes `undefined` as the queue argument to `waitForResults`, so
 * `processQueue` is a no-op and only the first wave (max_workers) of fix
 * tasks ever spawn. Sprint 161 stranded 43/49 fix tasks because of this.
 *
 * The fix: bind the spawnWorkers return as `fixQueue: Task[]`, pass it to
 * waitForResults, and emit SPAWN_DEADLOCK_DETECTED if any tasks remain
 * un-collected after the wait window closes.
 *
 * Spec: docs/superpowers/specs/2026-05-08-sprint-162a-bug-stall-fix-spec.md (§4)
 * ADR: ADR-035 V2 amendment — Spawn-Liveness Mandate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

// ─── Mocks (declared before importing sprint-phases) ──────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: 0, size: 0 })),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
  parseDebtTable: vi.fn(() => []),
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: vi.fn(),
}));

// CRITICAL: capture spawnWorkers calls and let the test set the return value
// to simulate queued tasks (the bug was that the return was being discarded).
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(async () => [] as Task[]),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => [] as TaskResult[]),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
  readHeartbeatCached: vi.fn(() => null),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => null),
  getCurrentSprintId: vi.fn(() => 'sprint-162a-stall-test'),
  CHANNELS: {},
  readSequence: vi.fn(() => 0),
}));

vi.mock('../../src/orchestra/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────
import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { existsSync, readdirSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { spawnWorkers, waitForResults } from '../../src/orchestra/sprint-controller.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeFixTask(id: string): Task {
  return {
    id,
    title: `Mock fix ${id}`,
    description: 'Test fix task',
    model: 'opus',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'Mock NO_GO',
    scope: {
      directories: ['docs/audits/sprint-test/'],
      filesRead: [],
      filesWrite: [`docs/audits/sprint-test/${id}.md`],
    },
    dependencies: [],
    goNogo: { goCriteria: 'mock', noGoCriteria: 'mock', techDebtAcceptable: 'mock' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-162a-stall-test',
    isPriorityFix: true,
    fixForTaskId: id.replace(/-fix$/, ''),
    createdAt: new Date().toISOString(),
  } as unknown as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-162a-stall-test',
    number: 162,
    phase: SprintPhase.FIX,
    status: SprintStatus.FIXING,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 6 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test-project',
    version: '0.4.0',
    fix_phase_enabled: true,
    routing_engine: 'v1',
    ...overrides,
  } as unknown as ResolvedConfig;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`docs/audits/sprint-test/${taskId}.md`],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'mock complete',
    ...overrides,
  };
}

function makeEvalResult(decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 90 : decision === 'GO_WITH_TECH_DEBT' ? 65 : 30,
    rubricScores: [],
    retryCount: 1,
  } as unknown as EvaluationResult;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('FIX phase spawn loop — Bug Stall regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('threads spawnWorkers return (fixQueue) into waitForResults — was undefined before fix', async () => {
    // ARRANGE: 10 fix tasks, max_workers=3. Wave-1 spawns 3, queue holds 7.
    const fixTasks = Array.from({ length: 10 }, (_, i) =>
      makeFixTask(`162a-${String(i + 1).padStart(3, '0')}-fix`),
    );
    const sprint = makeSprint([]); // sprint.tasks unused — runFixPhase reads from disk via readdirSync
    const config = makeConfig({ activeModeConfig: { max_workers: 3 } });
    const evaluations = new Map<string, TaskEvaluation>();

    // Mock: .tasks/ directory has all 10 fix task JSONs
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      fixTasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
    );
    let readIdx = 0;
    vi.mocked(readJsonSafe).mockImplementation(() => fixTasks[readIdx++] ?? null);

    // Mock: spawnWorkers returns the 7 queued tasks (wave 2+).
    const queuedTasks = fixTasks.slice(3);
    vi.mocked(spawnWorkers).mockResolvedValueOnce(queuedTasks);

    // Mock: waitForResults returns no results (timeout window expires)
    vi.mocked(waitForResults).mockResolvedValue([]);

    // ACT
    await runFixPhase(
      '/tmp/test-project',
      sprint,
      evaluations,
      [],
      config,
      { fixPhaseTimeoutMs: 100 },
      'v1',
      undefined,
    );

    // ASSERT — waitForResults received the queued tasks (4th positional arg)
    expect(waitForResults).toHaveBeenCalledTimes(1);
    const waitCall = vi.mocked(waitForResults).mock.calls[0];
    const queueArg = waitCall[3];
    expect(queueArg).toBeDefined();
    expect(Array.isArray(queueArg)).toBe(true);
    expect((queueArg as Task[]).length).toBe(7);
    expect((queueArg as Task[]).map(t => t.id)).toEqual(queuedTasks.map(t => t.id));
  });

  it('emits SPAWN_DEADLOCK_DETECTED when un-collected tasks remain after waitForResults returns', async () => {
    const fixTasks = Array.from({ length: 5 }, (_, i) => makeFixTask(`bug-${i}-fix`));
    const sprint = makeSprint([]);
    const config = makeConfig({ activeModeConfig: { max_workers: 2 } });
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      fixTasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
    );
    let readIdx = 0;
    vi.mocked(readJsonSafe).mockImplementation(() => fixTasks[readIdx++] ?? null);

    // 3 tasks queued (5 total - 2 active)
    vi.mocked(spawnWorkers).mockResolvedValueOnce(fixTasks.slice(2));
    // No results — every fix task remains uncollected → deadlock detector fires
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(
      '/tmp/test-project',
      sprint,
      evaluations,
      [],
      config,
      { fixPhaseTimeoutMs: 100 },
      'v1',
      undefined,
    );

    // Look for the SPAWN_DEADLOCK_DETECTED event
    const writeEventCalls = vi.mocked(writeEvent).mock.calls;
    const deadlockEvent = writeEventCalls.find(
      c => c[4] === 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED',
    );
    expect(deadlockEvent).toBeDefined();
    const payload = deadlockEvent?.[5] as {
      phase: string;
      queuedTaskCount: number;
      unspawnedCount: number;
      unspawnedTaskIds: string[];
    };
    expect(payload.phase).toBe('FIX');
    expect(payload.queuedTaskCount).toBe(3); // queue size
    expect(payload.unspawnedCount).toBeGreaterThan(0);
    expect(Array.isArray(payload.unspawnedTaskIds)).toBe(true);
  });

  it('does NOT emit SPAWN_DEADLOCK_DETECTED when all fix tasks complete normally', async () => {
    const fixTasks = Array.from({ length: 3 }, (_, i) => makeFixTask(`done-${i}-fix`));
    const sprint = makeSprint([]);
    const config = makeConfig({ activeModeConfig: { max_workers: 6 } });
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      fixTasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
    );
    let readIdx = 0;
    vi.mocked(readJsonSafe).mockImplementation(() => fixTasks[readIdx++] ?? null);

    // All tasks fit in one wave — no queue
    vi.mocked(spawnWorkers).mockResolvedValueOnce([]);
    // All tasks complete
    vi.mocked(waitForResults).mockResolvedValue(
      fixTasks.map(t => makeResult(t.id, { selfAssessment: 'DONE' })),
    );
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFixPhase(
      '/tmp/test-project',
      sprint,
      evaluations,
      [],
      config,
      { fixPhaseTimeoutMs: 1_000 },
      'v1',
      undefined,
    );

    const writeEventCalls = vi.mocked(writeEvent).mock.calls;
    const deadlockEvent = writeEventCalls.find(
      c => c[4] === 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED',
    );
    expect(deadlockEvent).toBeUndefined();
  });

  it('passes autoApprove + spawnBackend through to waitForResults options', async () => {
    const fixTasks = [makeFixTask('opt-001-fix')];
    const sprint = makeSprint([]);
    const config = makeConfig();
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      fixTasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readJsonSafe).mockImplementation(() => fixTasks[0]);
    vi.mocked(spawnWorkers).mockResolvedValueOnce([]);
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(
      '/tmp/test-project',
      sprint,
      evaluations,
      [],
      config,
      { fixPhaseTimeoutMs: 100, autoApprove: true },
      'v1',
      undefined,
    );

    const waitCall = vi.mocked(waitForResults).mock.calls[0];
    const optsArg = waitCall[4] as { autoApprove?: boolean };
    expect(optsArg).toBeDefined();
    expect(optsArg.autoApprove).toBe(true);
  });

  it('idempotence — empty fix task list short-circuits without spawn or deadlock event', async () => {
    const sprint = makeSprint([]);
    const config = makeConfig();
    const evaluations = new Map<string, TaskEvaluation>();

    // No fix tasks on disk
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(null);

    await runFixPhase(
      '/tmp/test-project',
      sprint,
      evaluations,
      [],
      config,
      { fixPhaseTimeoutMs: 100 },
      'v1',
      undefined,
    );

    expect(spawnWorkers).not.toHaveBeenCalled();
    expect(waitForResults).not.toHaveBeenCalled();
    const writeEventCalls = vi.mocked(writeEvent).mock.calls;
    const deadlockEvent = writeEventCalls.find(
      c => c[4] === 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED',
    );
    expect(deadlockEvent).toBeUndefined();
  });
});
