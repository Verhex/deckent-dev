/**
 * Sprint 162A — Bug A heartbeat-blind synthetic NO_GO regression suite.
 *
 * Each test sets up a tmp project with a task that has NO `.result` on disk
 * and drives `runEvaluatePhase` through the missing-result branch
 * (sprint-phases.ts:492). Heartbeat freshness is varied to verify the gate.
 *
 * Spec: docs/superpowers/specs/2026-05-08-sprint-162a-bug-a-fix-spec.md (§4)
 * ADR: ADR-035 V2 amendment — Synthetic Result Handling Clause
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, AgentStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, ResolvedConfig, Heartbeat,
} from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { clearHeartbeatCache } from '../../src/monitor/auditor.js';

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

/** Persist a task JSON to disk so handleEvaluation's readTask succeeds. */
function persistTask(root: string, task: Task): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
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

function writeHb(
  root: string,
  taskId: string,
  ageMs: number,
  status: AgentStatus = AgentStatus.EXECUTING,
): void {
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
  writeFileSync(
    join(tmpRoot, '.deckent', 'sprint-state.json'),
    JSON.stringify({ sprintId: 'sprint-test' }),
    'utf-8',
  );
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
    persistTask(tmpRoot, t);
    // HB is 30s old; default grace = 240_000 ms → fresh
    writeHb(tmpRoot, '001', 30_000);

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    expect(evaluations.has('001')).toBe(false);
    // Side-effect: event-stream JSONL should record sprint.eval.heartbeat-skip
    const eventsFile = join(tmpRoot, '.deckent', 'sprint-test-events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
  });

  it('synthesizes NO_GO when heartbeat is stale beyond grace window', async () => {
    const t = makeTask('002');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    persistTask(tmpRoot, t);
    // HB is 10 minutes old; default grace = 240_000 ms (4 min) → stale
    writeHb(tmpRoot, '002', 10 * 60 * 1000);

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    expect(evaluations.get('002')).toBe(TaskEvaluation.NO_GO);
  });

  it('synthesizes NO_GO when no heartbeat file exists', async () => {
    const t = makeTask('003');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    persistTask(tmpRoot, t);
    // No .hb file written

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    expect(evaluations.get('003')).toBe(TaskEvaluation.NO_GO);
  });

  it('synthesizes NO_GO when heartbeat timestamp is malformed', async () => {
    const t = makeTask('004');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    persistTask(tmpRoot, t);
    // Manually write malformed HB
    writeFileSync(
      join(tmpRoot, TASKS_DIR, 'task-004.hb'),
      JSON.stringify({
        workerId: 'w-004',
        taskId: '004',
        status: 'EXECUTING',
        timestamp: 'NOT-A-DATE',
        filesChangedCount: 0,
        sequence: 1,
        progress: 0,
      }),
      'utf-8',
    );

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    expect(evaluations.get('004')).toBe(TaskEvaluation.NO_GO);
  });

  it('respects custom eval_heartbeat_grace_multiplier (1 = stricter)', async () => {
    const t = makeTask('005');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    persistTask(tmpRoot, t);
    // HB is 150s old; multiplier=1, timeout=120s → grace=120s → stale by 30s
    writeHb(tmpRoot, '005', 150_000);
    const strictConfig = {
      heartbeat_timeout: 120,
      eval_heartbeat_grace_multiplier: 1,
    };

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [],
      evaluations,
      90,
      strictConfig as ResolvedConfig,
    );

    expect(evaluations.get('005')).toBe(TaskEvaluation.NO_GO);
  });

  it('does not affect tasks whose results were collected normally', async () => {
    const t = makeTask('006');
    const sprint = makeSprint([t]);
    const evaluations = new Map<string, TaskEvaluation>();
    persistTask(tmpRoot, t);
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

    await runEvaluatePhase(
      tmpRoot,
      sprint,
      [result],
      evaluations,
      90,
      baseConfig as ResolvedConfig,
    );

    // happy path — task should be evaluated DONE/GO_WITH_TECH_DEBT
    expect(evaluations.has('006')).toBe(true);
    expect(evaluations.get('006')).not.toBe(TaskEvaluation.NO_GO);
  });
});
