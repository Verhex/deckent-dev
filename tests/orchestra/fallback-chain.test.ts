// ═══ Sprint 155 Task 1 — Fallback Chain Tests ═══════════════════════
//
// Covers:
//   - detectCapacityError (provider-specific + generic regex matrices)
//   - selectFallbackProvider (no-self-loop guard, unset config)
//   - decideFallbackRetry (composed decision)
//   - evaluateForFallback (NO_GO + capacity → RetryWithFallback action)
//   - prepareFallbackRetries (sprint-controller plan generation)
//   - runFallbackRetries (DI orchestration with mocked spawn/wait)

import { describe, it, expect } from 'vitest';
import {
  detectCapacityError,
  selectFallbackProvider,
  decideFallbackRetry,
  MAX_FALLBACK_RETRIES,
} from '../../src/core/provider-fallback.js';
import { evaluateForFallback } from '../../src/orchestra/result-evaluator.js';
import {
  prepareFallbackRetries,
  runFallbackRetries,
} from '../../src/orchestra/sprint-controller.js';
import {
  TaskStatus,
  TaskEvaluation,
  SprintPhase,
  SprintStatus,
} from '../../src/core/types.js';
import type {
  Task,
  TaskResult,
  Sprint,
  ResolvedConfig,
  ProviderName,
} from '../../src/core/types.js';

// ─── Test Fixtures ──────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '155-001',
    title: 'Test Task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.NO_GO,
    provider: 'gemini',
    ...overrides,
  } as Task;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '155-001',
    workerId: 'w-155-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...overrides,
  } as TaskResult;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-155',
    number: 155,
    status: SprintStatus.EVALUATING,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(fallback?: ProviderName): ResolvedConfig {
  return {
    fallback_provider: fallback,
  } as unknown as ResolvedConfig;
}

// ─── detectCapacityError ────────────────────────────────────────────

describe('detectCapacityError', () => {
  it('detects Gemini "No capacity available for model X" (Sprint 154 live evidence)', () => {
    const out = detectCapacityError(
      'Worker output: No capacity available for model gemini-2.5-flash on the server',
    );
    expect(out.hit).toBe(true);
    expect(out.provider).toBe('gemini');
    expect(out.reason).toMatch(/gemini/i);
  });

  it('detects Gemini RESOURCE_EXHAUSTED', () => {
    const out = detectCapacityError('error: RESOURCE_EXHAUSTED please retry');
    expect(out.hit).toBe(true);
    expect(out.provider).toBe('gemini');
  });

  it('detects OpenAI rate_limit_exceeded (Codex backend)', () => {
    const out = detectCapacityError(
      'OpenAI API error: rate_limit_exceeded — please slow down requests',
    );
    expect(out.hit).toBe(true);
    expect(out.provider).toBe('codex');
    expect(out.reason).toMatch(/codex/i);
  });

  it('detects OpenAI insufficient_quota', () => {
    const out = detectCapacityError('insufficient_quota: billing limit reached');
    expect(out.hit).toBe(true);
    expect(out.provider).toBe('codex');
  });

  it('detects Claude overloaded_error / 529', () => {
    const out = detectCapacityError(
      'Anthropic API: 529 Overloaded — overloaded_error from upstream',
    );
    expect(out.hit).toBe(true);
    expect(out.provider).toBe('claude');
  });

  it('returns hit=true with provider=null for generic HTTP 429', () => {
    const out = detectCapacityError('Unknown error: HTTP 429 too many requests');
    expect(out.hit).toBe(true);
    // Both "HTTP 429" and "too many requests" are generic patterns; provider is null.
    expect(out.provider).toBeNull();
  });

  it('returns no hit for unrelated errors (e.g. tsc type error)', () => {
    const out = detectCapacityError(
      'tsc error: Type number is not assignable to type string at line 42',
    );
    expect(out.hit).toBe(false);
    expect(out.provider).toBeNull();
  });

  it('returns no hit for empty/null input', () => {
    expect(detectCapacityError('').hit).toBe(false);
    expect(detectCapacityError(null).hit).toBe(false);
    expect(detectCapacityError(undefined).hit).toBe(false);
  });
});

// ─── selectFallbackProvider ─────────────────────────────────────────

describe('selectFallbackProvider', () => {
  it('returns null when fallback unset', () => {
    expect(selectFallbackProvider('gemini', undefined)).toBeNull();
  });

  it('returns null when fallback === current (no self-loop)', () => {
    expect(selectFallbackProvider('claude', 'claude')).toBeNull();
  });

  it('returns the fallback provider when distinct', () => {
    expect(selectFallbackProvider('gemini', 'claude')).toBe('claude');
  });

  it('returns the fallback even when current is undefined (first-attempt unknown)', () => {
    expect(selectFallbackProvider(undefined, 'gemini')).toBe('gemini');
  });
});

// ─── decideFallbackRetry ────────────────────────────────────────────

describe('decideFallbackRetry', () => {
  it('returns null when no capacity error detected', () => {
    expect(decideFallbackRetry('all good', 'gemini', 'claude')).toBeNull();
  });

  it('returns null when fallback unset', () => {
    expect(decideFallbackRetry('No capacity available for model X', 'gemini', undefined)).toBeNull();
  });

  it('returns the swap plan when capacity hit + fallback eligible', () => {
    const plan = decideFallbackRetry('No capacity available for model gemini-2.5-flash on the server', 'gemini', 'claude');
    expect(plan).not.toBeNull();
    expect(plan!.targetProvider).toBe('claude');
    expect(plan!.detectedProvider).toBe('gemini');
  });
});

// ─── evaluateForFallback ────────────────────────────────────────────

describe('evaluateForFallback', () => {
  it('emits RetryWithFallback for NO_GO + capacity error + fallback configured', () => {
    const action = evaluateForFallback(
      makeResult({
        selfAssessment: 'NO_GO',
        notes: 'Worker died: No capacity available for model gemini-2.5-flash on the server',
      }),
      'gemini',
      'claude',
    );
    expect(action.kind).toBe('RetryWithFallback');
    if (action.kind === 'RetryWithFallback') {
      expect(action.targetProvider).toBe('claude');
      expect(action.detectedProvider).toBe('gemini');
    }
  });

  it('returns NoFallback when selfAssessment is DONE even if notes contain capacity text', () => {
    const action = evaluateForFallback(
      makeResult({
        selfAssessment: 'DONE',
        notes: 'note mentions rate_limit_exceeded but worker recovered and finished',
      }),
      'codex',
      'claude',
    );
    expect(action.kind).toBe('NoFallback');
  });

  it('returns NoFallback when fallback_provider is unset', () => {
    const action = evaluateForFallback(
      makeResult({ selfAssessment: 'NO_GO', notes: 'rate_limit_exceeded' }),
      'codex',
      undefined,
    );
    expect(action.kind).toBe('NoFallback');
    if (action.kind === 'NoFallback') {
      expect(action.reason).toMatch(/no fallback_provider configured/i);
    }
  });

  it('returns NoFallback when fallback equals current provider', () => {
    const action = evaluateForFallback(
      makeResult({ selfAssessment: 'NO_GO', notes: 'overloaded_error' }),
      'claude',
      'claude',
    );
    expect(action.kind).toBe('NoFallback');
    if (action.kind === 'NoFallback') {
      expect(action.reason).toMatch(/equals current provider/i);
    }
  });

  it('returns NoFallback when no capacity error pattern matched', () => {
    const action = evaluateForFallback(
      makeResult({ selfAssessment: 'NO_GO', notes: 'tsc errors: 12 type mismatches' }),
      'gemini',
      'claude',
    );
    expect(action.kind).toBe('NoFallback');
  });
});

// ─── prepareFallbackRetries ─────────────────────────────────────────

describe('prepareFallbackRetries', () => {
  it('returns empty when fallback_provider unset', () => {
    const task = makeTask({ provider: 'gemini' });
    const result = makeResult({ notes: 'No capacity available for model X' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    expect(prepareFallbackRetries(sprint, [result], evals, undefined, new Set())).toEqual([]);
  });

  it('returns empty when no NO_GO results', () => {
    const task = makeTask({ provider: 'gemini' });
    const result = makeResult({ selfAssessment: 'DONE' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.DONE]]);

    expect(prepareFallbackRetries(sprint, [result], evals, 'claude', new Set())).toEqual([]);
  });

  it('produces a plan for capacity-error NO_GO with eligible fallback', () => {
    const task = makeTask({ provider: 'gemini' });
    const result = makeResult({
      notes: 'Worker died: No capacity available for model gemini-2.5-flash on the server',
    });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const plans = prepareFallbackRetries(sprint, [result], evals, 'claude', new Set());
    expect(plans).toHaveLength(1);
    expect(plans[0]!.task.id).toBe(task.id);
    expect(plans[0]!.targetProvider).toBe('claude');
    expect(plans[0]!.originalProvider).toBe('gemini');
  });

  it('skips tasks already in alreadyRetried set (max-1 enforcement)', () => {
    const task = makeTask({ provider: 'gemini' });
    const result = makeResult({ notes: 'rate_limit_exceeded' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const plans = prepareFallbackRetries(sprint, [result], evals, 'claude', new Set([task.id]));
    expect(plans).toEqual([]);
  });

  it('skips tasks where fallback equals current provider', () => {
    const task = makeTask({ provider: 'claude' });
    const result = makeResult({ notes: 'overloaded_error' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const plans = prepareFallbackRetries(sprint, [result], evals, 'claude', new Set());
    expect(plans).toEqual([]);
  });
});

// ─── runFallbackRetries (orchestration with DI) ─────────────────────

describe('runFallbackRetries', () => {
  it('returns zero counts when fallback_provider unset', async () => {
    const task = makeTask({ provider: 'gemini' });
    const result = makeResult({ notes: 'No capacity available for model X' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const stats = await runFallbackRetries(
      '/tmp/proj', sprint, [result], evals, makeConfig(undefined),
    );
    expect(stats.retried).toBe(0);
    expect(stats.successful).toBe(0);
  });

  it('orchestrates a successful fallback retry end-to-end (DI mocks)', async () => {
    const task = makeTask({ provider: 'gemini' });
    const originalResult = makeResult({
      notes: 'No capacity available for model gemini-2.5-flash on the server',
    });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const persistCalls: Task[] = [];
    const archiveCalls: string[] = [];
    let spawnedSprint: Sprint | null = null;

    const stats = await runFallbackRetries(
      '/tmp/proj',
      sprint,
      [originalResult],
      evals,
      makeConfig('claude'),
      undefined,
      undefined,
      {
        persistTask: async (_root, t) => { persistCalls.push({ ...t }); },
        archiveResult: async (_root, id) => { archiveCalls.push(id); },
        spawnRetry: async (_root, retrySprint) => { spawnedSprint = retrySprint; },
        waitForRetryResults: async () => [
          makeResult({
            taskId: task.id,
            selfAssessment: 'DONE',
            testsPassed: true,
            coverage: 95,
            notes: 'fallback succeeded — claude finished the work',
            tokenUsage: {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadTokens: 0,
              provider: 'claude',
              model: 'sonnet',
            },
          }),
        ],
        reevaluate: () => TaskEvaluation.DONE,
      },
    );

    expect(stats.retried).toBe(1);
    expect(stats.successful).toBe(1);
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]!.provider).toBe('claude');  // provider was swapped before persist
    expect(archiveCalls).toEqual([task.id]);
    expect(spawnedSprint).not.toBeNull();
    expect(spawnedSprint!.tasks).toHaveLength(1);
    expect(evals.get(task.id)).toBe(TaskEvaluation.DONE);
  });

  it('records retried-but-failed when fallback also fails', async () => {
    const task = makeTask({ provider: 'gemini' });
    const sprint = makeSprint([task]);
    const evals = new Map([[task.id, TaskEvaluation.NO_GO]]);

    const stats = await runFallbackRetries(
      '/tmp/proj',
      sprint,
      [makeResult({ notes: 'No capacity available for model X' })],
      evals,
      makeConfig('claude'),
      undefined,
      undefined,
      {
        persistTask: async () => {},
        archiveResult: async () => {},
        spawnRetry: async () => {},
        waitForRetryResults: async () => [
          makeResult({
            taskId: task.id,
            selfAssessment: 'NO_GO',
            notes: 'fallback also failed: claude API timeout',
            tokenUsage: {
              inputTokens: 50,
              outputTokens: 0,
              cacheReadTokens: 0,
              provider: 'claude',
              model: 'sonnet',
            },
          }),
        ],
        reevaluate: () => TaskEvaluation.NO_GO,
      },
    );

    expect(stats.retried).toBe(1);
    expect(stats.successful).toBe(0);  // fallback ran but did not succeed
    expect(evals.get(task.id)).toBe(TaskEvaluation.NO_GO);
  });
});

// ─── Sanity: MAX_FALLBACK_RETRIES constant ──────────────────────────

describe('MAX_FALLBACK_RETRIES constant', () => {
  it('is exactly 1 (no fallback-of-fallback chains)', () => {
    expect(MAX_FALLBACK_RETRIES).toBe(1);
  });
});
