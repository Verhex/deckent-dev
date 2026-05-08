/**
 * Sprint 162A — Bug C: synthetic timeout result MUST use TIMEOUT_WITH_WORK,
 * not NO_GO, so that result-evaluator's reconcileSpuriousNoGo path can
 * inspect git diff evidence before the task is committed as NO_GO.
 *
 * Spec: docs/superpowers/specs/2026-05-08-sprint-162a-bug-c-fix-spec.md (§4)
 * ADR: ADR-035 V2 amendment — synthetic results MUST be TIMEOUT_WITH_WORK
 *
 * Regression guard: ANY future change that reverts this literal to 'NO_GO'
 * MUST cause this suite to fail loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks (must be declared before importing sprint-phases) ──────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn(() => [] as string[]),
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

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  parseTscErrorFiles: vi.fn(() => []),
  runPreSprintValidation: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/orchestra/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => null),
  getCurrentSprintId: vi.fn(() => 'sprint-162a-test'),
  CHANNELS: {},
  readSequence: vi.fn(() => 0),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
  readHeartbeatCached: vi.fn(() => null),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────
import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeTask(): Task {
  return {
    id: '001-001',
    title: 'Sample timeout task',
    description: 'Worker times out',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-162a-test',
    createdAt: new Date().toISOString(),
    assignedWorker: 'w-001-001',
  } as unknown as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-162a-test',
    number: 999,
    tasks,
    status: SprintStatus.EVALUATING,
    phase: SprintPhase.EVALUATE,
    startedAt: new Date().toISOString(),
    workers: tasks.map(t => `w-${t.id}`),
  } as unknown as Sprint;
}

const baseConfig: Partial<ResolvedConfig> = {
  heartbeat_timeout: 120,
};

// ─── Tests ────────────────────────────────────────────────────────────

describe('Bug C — synthetic timeout result uses TIMEOUT_WITH_WORK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('synthesises a TaskResult with selfAssessment=TIMEOUT_WITH_WORK when no .result is collected', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    // No results collected — triggers synthetic branch (sprint-phases.ts:492)
    await runEvaluatePhase(
      '/tmp/bug-c-test',
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    expect(handleEvaluation).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(handleEvaluation).mock.calls;
    const [, , , syntheticResult] = calls[0] as unknown as [
      string,
      Task,
      TaskEvaluation,
      TaskResult,
    ];
    expect(syntheticResult.taskId).toBe('001-001');
    expect(syntheticResult.selfAssessment).toBe('TIMEOUT_WITH_WORK');
    expect(syntheticResult.notes).toContain('Timeout');
    expect(syntheticResult.workerId).toBe('w-001-001');
  });

  it('regression guard — synthetic result MUST NOT be NO_GO', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    await runEvaluatePhase(
      '/tmp/bug-c-test',
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    const calls = vi.mocked(handleEvaluation).mock.calls;
    const [, , , syntheticResult] = calls[0] as unknown as [
      string,
      Task,
      TaskEvaluation,
      TaskResult,
    ];
    // Guard against a regression where someone reverts the literal back to 'NO_GO'.
    expect(syntheticResult.selfAssessment).not.toBe('NO_GO');
  });

  it('emits sprint.eval.synthetic-timeout event before handleEvaluation', async () => {
    const { writeEvent } = await import('../../src/orchestra/event-stream.js');
    const task = makeTask();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    await runEvaluatePhase(
      '/tmp/bug-c-test',
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    const writeEventCalls = vi.mocked(writeEvent).mock.calls;
    const synthEvent = writeEventCalls.find(
      c => c[4] === 'sprint.eval.synthetic-timeout',
    );
    expect(synthEvent).toBeDefined();
    const payload = synthEvent?.[5] as { taskId: string; lastResult: TaskResult };
    expect(payload.taskId).toBe('001-001');
    expect(payload.lastResult.selfAssessment).toBe('TIMEOUT_WITH_WORK');
  });
});
