import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseMetricsJsonl,
  resolveSprintTasksDir,
  resolveLastSprint,
  scanSprintTasks,
  aggregateProviderStats,
  aggregateModelStats,
  aggregateAgentStats,
  aggregateSkillStats,
  scanFallbackEvents,
  computeHonestyDrift,
  buildMetricsSummary,
  renderMetricsSummary,
  formatDurationMs,
  registerMetrics,
} from '../../../src/cli/commands/metrics.js';
import type { TaskRecord, MetricsSummary } from '../../../src/cli/commands/metrics.js';

// ─── Helpers ─────────────────────────────────────────────────────────

let tmpRoot: string;

function makeRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-001',
    provider: 'claude',
    model: 'sonnet',
    assignedAgent: 'doc-writer',
    assignedSkills: ['typescript-expert'],
    scopeDirs: ['src/cli/'],
    selfAssessment: 'DONE',
    filesChanged: ['src/cli/foo.ts'],
    durationMs: 60_000,
    hadFallback: false,
    fallbackFrom: null,
    fallbackTo: null,
    fallbackReason: '',
    ...overrides,
  };
}

function writeTask(
  tasksDir: string,
  id: string,
  task: Record<string, unknown>,
  result?: Record<string, unknown>,
  fallbackResult?: Record<string, unknown>,
): void {
  writeFileSync(join(tasksDir, `task-${id}.json`), JSON.stringify(task));
  if (result !== undefined) {
    writeFileSync(join(tasksDir, `task-${id}.result`), JSON.stringify(result));
  }
  if (fallbackResult !== undefined) {
    writeFileSync(
      join(tasksDir, `task-${id}.result.fallback-attempt-0`),
      JSON.stringify(fallbackResult),
    );
  }
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-metrics-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('parseMetricsJsonl', () => {
  it('parses valid jsonl lines and skips malformed ones', () => {
    const content = [
      '{"type":"metric","name":"wave.start","value":0,"tags":{"sprintId":"sprint-1"}}',
      'not json',
      '',
      '{"type":"trace","operation":"wait_results","durationMs":5000}',
      '{"type":"unknown","ignored":true}',
    ].join('\n');
    const events = parseMetricsJsonl(content);
    expect(events).toHaveLength(2);
    expect(events[0]?.name).toBe('wave.start');
    expect(events[1]?.operation).toBe('wait_results');
  });

  it('returns empty array for empty input', () => {
    expect(parseMetricsJsonl('')).toEqual([]);
  });
});

describe('aggregateProviderStats', () => {
  it('counts DONE/NO_GO and computes avg duration', () => {
    const records = [
      makeRecord({ id: '1', provider: 'claude', selfAssessment: 'DONE', durationMs: 60_000 }),
      makeRecord({ id: '2', provider: 'claude', selfAssessment: 'DONE', durationMs: 120_000 }),
      makeRecord({ id: '3', provider: 'gemini', selfAssessment: 'NO_GO', durationMs: 30_000 }),
      makeRecord({ id: '4', provider: 'gemini', selfAssessment: 'GO_WITH_TECH_DEBT', durationMs: 90_000 }),
    ];
    const stats = aggregateProviderStats(records);
    const claude = stats.find((s) => s.provider === 'claude');
    const gemini = stats.find((s) => s.provider === 'gemini');
    expect(claude).toBeDefined();
    expect(claude?.tasks).toBe(2);
    expect(claude?.done).toBe(2);
    expect(claude?.noGo).toBe(0);
    expect(claude?.avgDurationMs).toBe(90_000);
    expect(gemini?.done).toBe(1);
    expect(gemini?.noGo).toBe(1);
    expect(gemini?.avgDurationMs).toBe(60_000);
  });

  it('handles records without duration gracefully', () => {
    const records = [makeRecord({ provider: 'codex', durationMs: null })];
    const stats = aggregateProviderStats(records);
    expect(stats[0]?.avgDurationMs).toBe(0);
  });
});

describe('aggregateModelStats', () => {
  it('counts unique models and marks routing as direct', () => {
    const records = [
      makeRecord({ id: '1', model: 'sonnet' }),
      makeRecord({ id: '2', model: 'sonnet' }),
      makeRecord({ id: '3', model: 'opus' }),
      makeRecord({ id: '4', model: 'gemini-2.5-flash' }),
    ];
    const stats = aggregateModelStats(records);
    expect(stats).toHaveLength(3);
    const sonnet = stats.find((s) => s.model === 'sonnet');
    expect(sonnet?.tasks).toBe(2);
    expect(sonnet?.routing).toBe('direct');
  });
});

describe('aggregateAgentStats', () => {
  it('buckets generic agent under (generic) label', () => {
    const records = [
      makeRecord({ id: '1', assignedAgent: 'generic', selfAssessment: 'DONE' }),
      makeRecord({ id: '2', assignedAgent: 'generic', selfAssessment: 'NO_GO' }),
      makeRecord({ id: '3', assignedAgent: 'doc-writer', selfAssessment: 'DONE' }),
    ];
    const stats = aggregateAgentStats(records);
    const generic = stats.find((s) => s.agent === '(generic)');
    expect(generic?.assigned).toBe(2);
    expect(generic?.used).toBe(1);
    expect(generic?.compliancePct).toBe(50);
  });
});

describe('aggregateSkillStats', () => {
  it('counts skill use via filesChanged scope match proxy', () => {
    const records = [
      makeRecord({
        id: '1',
        assignedSkills: ['typescript-expert'],
        scopeDirs: ['src/cli/'],
        filesChanged: ['src/cli/foo.ts'],
        selfAssessment: 'DONE',
      }),
      makeRecord({
        id: '2',
        assignedSkills: ['typescript-expert', 'documentation-writer'],
        scopeDirs: ['docs/'],
        filesChanged: [], // Empty — no match, but DONE still counts
        selfAssessment: 'DONE',
      }),
      makeRecord({
        id: '3',
        assignedSkills: ['documentation-writer'],
        scopeDirs: ['docs/'],
        filesChanged: ['src/foo.ts'], // Out of scope
        selfAssessment: 'NO_GO',
      }),
    ];
    const stats = aggregateSkillStats(records);
    const ts = stats.find((s) => s.skill === 'typescript-expert');
    const doc = stats.find((s) => s.skill === 'documentation-writer');
    expect(ts?.assigned).toBe(2);
    expect(ts?.used).toBe(2); // Both DONE
    expect(doc?.assigned).toBe(2);
    expect(doc?.used).toBe(1); // Only #2 (DONE)
  });
});

describe('scanFallbackEvents', () => {
  it('extracts fallback events from records flagged with hadFallback', () => {
    const records = [
      makeRecord({
        id: '5',
        hadFallback: true,
        fallbackFrom: 'gemini',
        fallbackTo: 'claude',
        fallbackReason: 'capacity 429',
      }),
      makeRecord({ id: '6', hadFallback: false }),
    ];
    const events = scanFallbackEvents(records);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      taskId: '5',
      from: 'gemini',
      to: 'claude',
      reason: 'capacity 429',
    });
  });
});

describe('formatDurationMs', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDurationMs(45_000)).toBe('45s');
  });
  it('formats minute+second durations', () => {
    expect(formatDurationMs(252_000)).toBe('4m 12s');
  });
  it('returns dash for zero or negative', () => {
    expect(formatDurationMs(0)).toBe('-');
    expect(formatDurationMs(-5)).toBe('-');
  });
});

describe('resolveSprintTasksDir / scanSprintTasks (integration)', () => {
  it('finds canonical sprint-{id}-tasks/ dir and scans tasks + results + fallbacks', () => {
    const archive = join(tmpRoot, '.tasks', 'archive', 'sprint-200-tasks');
    mkdirSync(archive, { recursive: true });
    writeTask(
      archive,
      '200-001',
      {
        id: '200-001',
        provider: 'claude',
        model: 'sonnet',
        assignedAgent: 'doc-writer',
        assignedSkills: ['documentation-writer'],
        scope: { directories: ['docs/'] },
        createdAt: '2026-05-07T12:00:00.000Z',
      },
      {
        taskId: '200-001',
        selfAssessment: 'DONE',
        filesChanged: ['docs/CHANGELOG.md'],
        testsPassed: true,
        tokenUsage: { provider: 'claude', model: 'sonnet' },
      },
    );
    writeTask(
      archive,
      '200-002',
      {
        id: '200-002',
        provider: 'claude',
        model: 'opus',
        assignedAgent: 'architect',
        assignedSkills: ['typescript-expert'],
        scope: { directories: ['src/'] },
        createdAt: '2026-05-07T12:00:00.000Z',
      },
      {
        taskId: '200-002',
        selfAssessment: 'DONE',
        filesChanged: ['src/foo.ts'],
        testsPassed: true,
        tokenUsage: { provider: 'claude', model: 'opus' },
      },
      {
        taskId: '200-002',
        selfAssessment: 'NO_GO',
        notes: 'capacity 429',
        tokenUsage: { provider: 'gemini', model: 'gemini-2.5-flash' },
      },
    );

    const dir = resolveSprintTasksDir(tmpRoot, 'sprint-200');
    expect(dir).toBe(archive);

    const records = scanSprintTasks(archive, 'sprint-200');
    expect(records).toHaveLength(2);
    const fallback = records.find((r) => r.id === '200-002');
    expect(fallback?.hadFallback).toBe(true);
    expect(fallback?.fallbackFrom).toBe('gemini');
    expect(fallback?.fallbackTo).toBe('claude');
  });

  it('falls back to alternate archive subdir naming (sprint-{id})', () => {
    const archive = join(tmpRoot, '.tasks', 'archive', 'sprint-201');
    mkdirSync(archive, { recursive: true });
    writeTask(archive, '201-001', { id: '201-001', provider: 'claude', model: 'sonnet' });
    expect(resolveSprintTasksDir(tmpRoot, 'sprint-201')).toBe(archive);
  });

  it('returns null when sprint has no archive and no live metrics file', () => {
    expect(resolveSprintTasksDir(tmpRoot, 'sprint-999')).toBeNull();
  });
});

describe('resolveLastSprint', () => {
  it('returns the highest-numbered sprint id from .deckent metrics + archive dirs', () => {
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
    mkdirSync(join(tmpRoot, '.tasks', 'archive', 'sprint-150-tasks'), { recursive: true });
    writeFileSync(join(tmpRoot, '.deckent', 'sprint-148-metrics.jsonl'), '');
    writeFileSync(join(tmpRoot, '.deckent', 'sprint-159-metrics.jsonl'), '');
    expect(resolveLastSprint(tmpRoot)).toBe('sprint-159');
  });

  it('returns null when no sprints exist', () => {
    expect(resolveLastSprint(tmpRoot)).toBeNull();
  });
});

describe('computeHonestyDrift', () => {
  it('counts DONE results that are partial / failed-tests / empty filesChanged', () => {
    const archive = join(tmpRoot, '.tasks', 'archive', 'sprint-205-tasks');
    mkdirSync(archive, { recursive: true });
    writeTask(archive, '205-001', { id: '205-001' }, {
      taskId: '205-001', selfAssessment: 'DONE', filesChanged: ['x.ts'], testsPassed: true,
    });
    writeTask(archive, '205-002', { id: '205-002' }, {
      taskId: '205-002', selfAssessment: 'DONE', filesChanged: [], testsPassed: true,
    });
    writeTask(archive, '205-003', { id: '205-003' }, {
      taskId: '205-003', selfAssessment: 'DONE', partialMarker: true, filesChanged: ['y.ts'],
    });
    const records = scanSprintTasks(archive, 'sprint-205');
    expect(computeHonestyDrift(archive, records)).toBe(2);
  });
});

describe('renderMetricsSummary', () => {
  it('renders all sections with at least one row each', () => {
    const summary: MetricsSummary = {
      sprintId: 'sprint-159',
      taskCount: 3,
      providerStats: [
        { provider: 'claude', tasks: 2, done: 2, noGo: 0, avgDurationMs: 252_000 },
      ],
      modelStats: [{ model: 'sonnet', tasks: 2, routing: 'direct' }],
      agentStats: [{ agent: 'doc-writer', assigned: 2, used: 2, compliancePct: 100 }],
      skillStats: [{ skill: 'typescript-expert', assigned: 2, used: 2, compliancePct: 100 }],
      fallbackEvents: [{ taskId: '159-002', from: 'gemini', to: 'claude', reason: 'capacity 429' }],
      honestyDrift: 0,
    };
    const out = renderMetricsSummary(summary);
    expect(out).toContain('Sprint sprint-159 — Metrics Summary');
    expect(out).toContain('Provider Distribution:');
    expect(out).toContain('| claude');
    expect(out).toContain('Model Distribution:');
    expect(out).toContain('| sonnet');
    expect(out).toContain('Agent Compliance:');
    expect(out).toContain('| doc-writer');
    expect(out).toContain('Skill Compliance:');
    expect(out).toContain('| typescript-expert');
    expect(out).toContain('Fallback Events:');
    expect(out).toContain('task-159-002: gemini → claude');
    expect(out).toContain('Honesty/Coverage Drift: 0');
    expect(out).toContain('4m 12s');
  });

  it('uses placeholder text for empty sections', () => {
    const empty: MetricsSummary = {
      sprintId: 'sprint-empty', taskCount: 0,
      providerStats: [], modelStats: [], agentStats: [], skillStats: [],
      fallbackEvents: [], honestyDrift: 0,
    };
    const out = renderMetricsSummary(empty);
    expect(out).toContain('_No provider data._');
    expect(out).toContain('_No model data._');
    expect(out).toContain('_No agent data._');
    expect(out).toContain('_No skill data._');
    expect(out).toContain('_None._');
  });
});

describe('buildMetricsSummary', () => {
  it('returns null for missing sprint, summary for present sprint', () => {
    expect(buildMetricsSummary(tmpRoot, 'sprint-missing')).toBeNull();

    const archive = join(tmpRoot, '.tasks', 'archive', 'sprint-300-tasks');
    mkdirSync(archive, { recursive: true });
    writeTask(archive, '300-001',
      {
        id: '300-001', provider: 'claude', model: 'sonnet',
        assignedAgent: 'doc-writer', assignedSkills: ['documentation-writer'],
        scope: { directories: ['docs/'] }, createdAt: '2026-05-07T12:00:00.000Z',
      },
      {
        taskId: '300-001', selfAssessment: 'DONE', filesChanged: ['docs/x.md'],
        testsPassed: true, tokenUsage: { provider: 'claude', model: 'sonnet' },
      },
    );
    const summary = buildMetricsSummary(tmpRoot, 'sprint-300');
    expect(summary?.sprintId).toBe('sprint-300');
    expect(summary?.taskCount).toBe(1);
    expect(summary?.providerStats[0]?.provider).toBe('claude');
  });
});

describe('CLI command parsing', () => {
  it('registers `metrics summary` and `metrics summary --last` actions', async () => {
    const program = new Command();
    program.exitOverride();
    registerMetrics(program);

    const writes: string[] = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    });

    try {
      // Build an archive in a temporary cwd
      const archive = join(tmpRoot, '.tasks', 'archive', 'sprint-400-tasks');
      mkdirSync(archive, { recursive: true });
      writeTask(archive, '400-001',
        { id: '400-001', provider: 'claude', model: 'sonnet', assignedAgent: 'doc-writer', assignedSkills: ['documentation-writer'], scope: { directories: ['docs/'] }, createdAt: '2026-05-07T12:00:00.000Z' },
        { taskId: '400-001', selfAssessment: 'DONE', filesChanged: ['docs/x.md'], testsPassed: true, tokenUsage: { provider: 'claude', model: 'sonnet' } },
      );

      const origCwd = process.cwd();
      try {
        process.chdir(tmpRoot);
        await program.parseAsync(['node', 'test', 'metrics', 'summary', 'sprint-400']);
        const out = writes.join('');
        expect(out).toContain('Sprint sprint-400 — Metrics Summary');
        expect(out).toContain('Provider Distribution');

        writes.length = 0;
        await program.parseAsync(['node', 'test', 'metrics', 'summary', '--last']);
        expect(writes.join('')).toContain('Sprint sprint-400');
      } finally {
        process.chdir(origCwd);
      }
    } finally {
      spy.mockRestore();
      // realWrite is captured but unused; ensure no leaked spy
      void realWrite;
    }
  });

  it('prints graceful message when sprint not found', async () => {
    const program = new Command();
    program.exitOverride();
    registerMetrics(program);

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    });
    try {
      const origCwd = process.cwd();
      try {
        process.chdir(tmpRoot);
        await program.parseAsync(['node', 'test', 'metrics', 'summary', 'sprint-not-here']);
        const out = writes.join('');
        // Either "No metrics data found" (with id) or "No sprint metrics found" (no archive at all)
        expect(out).toMatch(/No metrics data found|No sprint metrics found/);
      } finally {
        process.chdir(origCwd);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
