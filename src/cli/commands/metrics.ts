import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { TASKS_DIR, DECKENT_DIR } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Types ──────────────────────────────────────────────────────────

export type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'UNKNOWN';

export interface MetricEvent {
  type: 'metric' | 'trace';
  name?: string;
  operation?: string;
  value?: number;
  durationMs?: number;
  tags?: Record<string, string>;
  timestamp?: string;
  success?: boolean;
}

export interface TaskRecord {
  id: string;
  provider: string;
  model: string;
  assignedAgent: string;
  assignedSkills: readonly string[];
  scopeDirs: readonly string[];
  selfAssessment: SelfAssessment;
  filesChanged: readonly string[];
  durationMs: number | null;
  hadFallback: boolean;
  fallbackFrom: string | null;
  fallbackTo: string | null;
  fallbackReason: string;
}

export interface ProviderStat {
  provider: string;
  tasks: number;
  done: number;
  noGo: number;
  avgDurationMs: number;
}

export interface ModelStat {
  model: string;
  tasks: number;
  routing: string;
}

export interface AgentStat {
  agent: string;
  assigned: number;
  used: number;
  compliancePct: number;
}

export interface SkillStat {
  skill: string;
  assigned: number;
  used: number;
  compliancePct: number;
}

export interface FallbackEvent {
  taskId: string;
  from: string;
  to: string;
  reason: string;
}

export interface MetricsSummary {
  sprintId: string;
  taskCount: number;
  providerStats: ProviderStat[];
  modelStats: ModelStat[];
  agentStats: AgentStat[];
  skillStats: SkillStat[];
  fallbackEvents: FallbackEvent[];
  honestyDrift: number;
}

// ─── Parsers ────────────────────────────────────────────────────────

export function parseMetricsJsonl(content: string): MetricEvent[] {
  const events: MetricEvent[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as MetricEvent;
      if (parsed && typeof parsed === 'object' && (parsed.type === 'metric' || parsed.type === 'trace')) {
        events.push(parsed);
      }
    } catch {
      // ignore malformed line
    }
  }
  return events;
}

function safeReadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Sprint discovery ───────────────────────────────────────────────

/**
 * Find a directory containing the task artifacts for `sprintId`.
 * Search order:
 *   1. .tasks/archive/sprint-{id}-tasks/
 *   2. .tasks/archive/sprint-{id}/
 *   3. .tasks/archive/sprint-{id}-*  (first match)
 *   4. If sprintId matches the live sprint (per .deckent/sprint-{id}-metrics.jsonl), .tasks/
 */
export function resolveSprintTasksDir(root: string, sprintId: string): string | null {
  const archiveBase = join(root, TASKS_DIR, 'archive');
  const candidates = [
    `${sprintId}-tasks`,
    sprintId,
  ];
  for (const name of candidates) {
    const full = join(archiveBase, name);
    if (existsSync(full)) return full;
  }
  if (existsSync(archiveBase)) {
    const matches = readdirSync(archiveBase)
      .filter((n) => n === sprintId || n.startsWith(`${sprintId}-`))
      .sort();
    if (matches.length > 0) return join(archiveBase, matches[0]!);
  }
  // Fall back to live .tasks/ directory if metrics file exists for this sprint
  const liveTasks = join(root, TASKS_DIR);
  const metricsFile = join(root, DECKENT_DIR, `${sprintId}-metrics.jsonl`);
  if (existsSync(metricsFile) && existsSync(liveTasks)) return liveTasks;
  return null;
}

/** Resolve the most recent sprint id with metrics or archive presence. */
export function resolveLastSprint(root: string): string | null {
  const deckentDir = join(root, DECKENT_DIR);
  const ids = new Set<string>();
  if (existsSync(deckentDir)) {
    for (const entry of readdirSync(deckentDir)) {
      const m = entry.match(/^(sprint-\d+)-metrics\.jsonl$/);
      if (m?.[1]) ids.add(m[1]);
    }
  }
  const archiveBase = join(root, TASKS_DIR, 'archive');
  if (existsSync(archiveBase)) {
    for (const entry of readdirSync(archiveBase)) {
      const m = entry.match(/^(sprint-\d+)/);
      if (m?.[1]) ids.add(m[1]);
    }
  }
  if (ids.size === 0) return null;
  const sorted = [...ids].sort((a, b) => {
    const an = parseInt(a.replace('sprint-', ''), 10);
    const bn = parseInt(b.replace('sprint-', ''), 10);
    return bn - an;
  });
  return sorted[0] ?? null;
}

// ─── Task scanning ──────────────────────────────────────────────────

interface RawTaskJson {
  id?: string;
  provider?: string;
  model?: string;
  forceModel?: string;
  assignedAgent?: string;
  assignedSkills?: string[];
  scope?: { directories?: string[] };
  createdAt?: string;
}

interface RawResultJson {
  taskId?: string;
  selfAssessment?: SelfAssessment;
  filesChanged?: string[];
  testsPassed?: boolean;
  notes?: string;
  partialMarker?: boolean;
  tokenUsage?: { provider?: string; model?: string };
}

function basenameWithoutExt(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

export function scanSprintTasks(tasksDir: string, sprintId: string): TaskRecord[] {
  if (!existsSync(tasksDir)) return [];
  const allFiles = readdirSync(tasksDir);
  const taskJsons = allFiles.filter((f) => f.startsWith('task-') && f.endsWith('.json'));
  const records: TaskRecord[] = [];

  for (const jsonFile of taskJsons) {
    const baseName = basenameWithoutExt(jsonFile);
    const taskJson = safeReadJson<RawTaskJson>(join(tasksDir, jsonFile));
    if (!taskJson?.id) continue;

    // Filter to this sprint when scanning live .tasks/ (archive dirs are already scoped)
    const taskSprintId = (taskJson as { sprintId?: string }).sprintId;
    if (taskSprintId && taskSprintId !== sprintId) continue;

    const resultPath = join(tasksDir, `${baseName}.result`);
    const result = safeReadJson<RawResultJson>(resultPath);

    // Check fallback-attempt-* siblings
    const fallbackFiles = allFiles.filter(
      (f) => f.startsWith(`${baseName}.result.fallback-attempt-`)
    );
    let fallbackFrom: string | null = null;
    let fallbackTo: string | null = null;
    let fallbackReason = '';
    if (fallbackFiles.length > 0) {
      const firstAttempt = safeReadJson<RawResultJson>(
        join(tasksDir, fallbackFiles[0]!)
      );
      fallbackFrom = firstAttempt?.tokenUsage?.provider ?? null;
      fallbackTo = result?.tokenUsage?.provider ?? taskJson.provider ?? null;
      fallbackReason = firstAttempt?.notes?.slice(0, 80) ?? 'fallback';
    }

    let durationMs: number | null = null;
    if (taskJson.createdAt && existsSync(resultPath)) {
      const created = Date.parse(taskJson.createdAt);
      if (Number.isFinite(created)) {
        try {
          const mtime = statSync(resultPath).mtimeMs;
          durationMs = Math.max(0, Math.round(mtime - created));
        } catch { /* ignore */ }
      }
    }

    const provider = result?.tokenUsage?.provider ?? taskJson.provider ?? 'unknown';
    const model = result?.tokenUsage?.model ?? taskJson.forceModel ?? taskJson.model ?? 'unknown';
    const selfAssessment: SelfAssessment = result?.selfAssessment ?? 'UNKNOWN';

    records.push({
      id: taskJson.id,
      provider,
      model,
      assignedAgent: taskJson.assignedAgent ?? 'generic',
      assignedSkills: taskJson.assignedSkills ?? [],
      scopeDirs: taskJson.scope?.directories ?? [],
      selfAssessment,
      filesChanged: result?.filesChanged ?? [],
      durationMs,
      hadFallback: fallbackFiles.length > 0,
      fallbackFrom,
      fallbackTo,
      fallbackReason,
    });
  }

  return records;
}

// ─── Aggregations ───────────────────────────────────────────────────

export function aggregateProviderStats(records: readonly TaskRecord[]): ProviderStat[] {
  const map = new Map<string, { tasks: number; done: number; noGo: number; durations: number[] }>();
  for (const r of records) {
    const bucket = map.get(r.provider) ?? { tasks: 0, done: 0, noGo: 0, durations: [] };
    bucket.tasks += 1;
    if (r.selfAssessment === 'DONE' || r.selfAssessment === 'GO_WITH_TECH_DEBT') bucket.done += 1;
    if (r.selfAssessment === 'NO_GO') bucket.noGo += 1;
    if (r.durationMs !== null && r.durationMs > 0) bucket.durations.push(r.durationMs);
    map.set(r.provider, bucket);
  }
  const result: ProviderStat[] = [];
  for (const [provider, b] of map) {
    const avg = b.durations.length > 0
      ? Math.round(b.durations.reduce((a, x) => a + x, 0) / b.durations.length)
      : 0;
    result.push({ provider, tasks: b.tasks, done: b.done, noGo: b.noGo, avgDurationMs: avg });
  }
  result.sort((a, b) => b.tasks - a.tasks || a.provider.localeCompare(b.provider));
  return result;
}

export function aggregateModelStats(records: readonly TaskRecord[]): ModelStat[] {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.model, (map.get(r.model) ?? 0) + 1);
  }
  const result: ModelStat[] = [];
  for (const [model, tasks] of map) {
    result.push({ model, tasks, routing: 'direct' });
  }
  result.sort((a, b) => b.tasks - a.tasks || a.model.localeCompare(b.model));
  return result;
}

export function aggregateAgentStats(records: readonly TaskRecord[]): AgentStat[] {
  const map = new Map<string, { assigned: number; used: number }>();
  for (const r of records) {
    const key = r.assignedAgent && r.assignedAgent !== 'generic' ? r.assignedAgent : '(generic)';
    const bucket = map.get(key) ?? { assigned: 0, used: 0 };
    bucket.assigned += 1;
    if (r.selfAssessment === 'DONE' || r.selfAssessment === 'GO_WITH_TECH_DEBT') bucket.used += 1;
    map.set(key, bucket);
  }
  const result: AgentStat[] = [];
  for (const [agent, b] of map) {
    const compliancePct = b.assigned > 0 ? Math.round((b.used / b.assigned) * 100) : 0;
    result.push({ agent, assigned: b.assigned, used: b.used, compliancePct });
  }
  result.sort((a, b) => b.assigned - a.assigned || a.agent.localeCompare(b.agent));
  return result;
}

function fileMatchesScope(filesChanged: readonly string[], scopeDirs: readonly string[]): boolean {
  if (filesChanged.length === 0) return false;
  if (scopeDirs.length === 0) return true;
  for (const file of filesChanged) {
    for (const dir of scopeDirs) {
      const normalized = dir.endsWith('/') ? dir : `${dir}/`;
      if (file.startsWith(dir) || file.startsWith(normalized) || file === dir.replace(/\/$/, '')) {
        return true;
      }
    }
  }
  return false;
}

export function aggregateSkillStats(records: readonly TaskRecord[]): SkillStat[] {
  const map = new Map<string, { assigned: number; used: number }>();
  for (const r of records) {
    const matched = fileMatchesScope(r.filesChanged, r.scopeDirs);
    const successful = r.selfAssessment === 'DONE' || r.selfAssessment === 'GO_WITH_TECH_DEBT';
    for (const skill of r.assignedSkills) {
      const bucket = map.get(skill) ?? { assigned: 0, used: 0 };
      bucket.assigned += 1;
      if (matched || successful) bucket.used += 1;
      map.set(skill, bucket);
    }
  }
  const result: SkillStat[] = [];
  for (const [skill, b] of map) {
    const compliancePct = b.assigned > 0 ? Math.round((b.used / b.assigned) * 100) : 0;
    result.push({ skill, assigned: b.assigned, used: b.used, compliancePct });
  }
  result.sort((a, b) => b.assigned - a.assigned || a.skill.localeCompare(b.skill));
  return result;
}

export function scanFallbackEvents(records: readonly TaskRecord[]): FallbackEvent[] {
  const events: FallbackEvent[] = [];
  for (const r of records) {
    if (!r.hadFallback) continue;
    events.push({
      taskId: r.id,
      from: r.fallbackFrom ?? 'unknown',
      to: r.fallbackTo ?? r.provider,
      reason: r.fallbackReason || 'fallback',
    });
  }
  return events;
}

/**
 * Honesty drift: tasks claiming DONE in the result, but the underlying
 * task partial marker, missing filesChanged, or testsPassed=false suggests
 * the assessment is over-stated.
 */
export function computeHonestyDrift(tasksDir: string, records: readonly TaskRecord[]): number {
  let drift = 0;
  for (const r of records) {
    if (r.selfAssessment !== 'DONE') continue;
    const resultPath = join(tasksDir, `task-${r.id}.result`);
    const raw = safeReadJson<RawResultJson>(resultPath);
    if (!raw) continue;
    if (raw.partialMarker === true) { drift += 1; continue; }
    if (raw.testsPassed === false) { drift += 1; continue; }
    if ((raw.filesChanged?.length ?? 0) === 0) { drift += 1; continue; }
  }
  return drift;
}

// ─── Building the summary ───────────────────────────────────────────

export function buildMetricsSummary(root: string, sprintId: string): MetricsSummary | null {
  const tasksDir = resolveSprintTasksDir(root, sprintId);
  if (!tasksDir) return null;
  const records = scanSprintTasks(tasksDir, sprintId);
  return {
    sprintId,
    taskCount: records.length,
    providerStats: aggregateProviderStats(records),
    modelStats: aggregateModelStats(records),
    agentStats: aggregateAgentStats(records),
    skillStats: aggregateSkillStats(records),
    fallbackEvents: scanFallbackEvents(records),
    honestyDrift: computeHonestyDrift(tasksDir, records),
  };
}

// ─── Rendering ──────────────────────────────────────────────────────

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  const fmt = (cells: string[]): string =>
    '| ' + cells.map((c, i) => (c ?? '').padEnd(widths[i] ?? 0)).join(' | ') + ' |';
  const lines: string[] = [fmt(headers)];
  lines.push('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
  for (const r of rows) lines.push(fmt(r));
  return lines.join('\n');
}

export function renderMetricsSummary(summary: MetricsSummary): string {
  const sections: string[] = [];
  sections.push(`Sprint ${summary.sprintId} — Metrics Summary`);
  sections.push('');

  sections.push('Provider Distribution:');
  if (summary.providerStats.length === 0) {
    sections.push('_No provider data._');
  } else {
    sections.push(renderTable(
      ['Provider', 'Tasks', 'DONE', 'NO_GO', 'Avg Duration'],
      summary.providerStats.map((p) => [
        p.provider,
        String(p.tasks),
        String(p.done),
        String(p.noGo),
        formatDurationMs(p.avgDurationMs),
      ])
    ));
  }
  sections.push('');

  sections.push('Model Distribution:');
  if (summary.modelStats.length === 0) {
    sections.push('_No model data._');
  } else {
    sections.push(renderTable(
      ['Model', 'Tasks', 'Routing'],
      summary.modelStats.map((m) => [m.model, String(m.tasks), m.routing])
    ));
  }
  sections.push('');

  sections.push('Agent Compliance:');
  if (summary.agentStats.length === 0) {
    sections.push('_No agent data._');
  } else {
    sections.push(renderTable(
      ['Agent', 'Assigned', 'Used', 'Compliance'],
      summary.agentStats.map((a) => [a.agent, String(a.assigned), String(a.used), `${a.compliancePct}%`])
    ));
  }
  sections.push('');

  sections.push('Skill Compliance:');
  if (summary.skillStats.length === 0) {
    sections.push('_No skill data._');
  } else {
    sections.push(renderTable(
      ['Skill', 'Assigned', 'Used', 'Compliance'],
      summary.skillStats.map((s) => [s.skill, String(s.assigned), String(s.used), `${s.compliancePct}%`])
    ));
  }
  sections.push('');

  sections.push('Fallback Events:');
  if (summary.fallbackEvents.length === 0) {
    sections.push('_None._');
  } else {
    for (const f of summary.fallbackEvents) {
      sections.push(`- task-${f.taskId}: ${f.from} → ${f.to} (${f.reason})`);
    }
  }
  sections.push('');

  sections.push(`Honesty/Coverage Drift: ${summary.honestyDrift}`);

  return sections.join('\n');
}

// ─── Command Registration ──────────────────────────────────────────

export function registerMetrics(program: Command): void {
  const metrics = program
    .command('metrics')
    .description('Sprint metrics — provider, model, agent and skill compliance');

  metrics
    .command('summary [sprintId]')
    .description('Render markdown summary for a sprint (or --last for the most recent)')
    .option('--last', 'Resolve the most recent sprint automatically')
    .option('--json', 'Emit raw JSON instead of markdown')
    .action((sprintIdArg: string | undefined, opts: { last?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      let sprintId = sprintIdArg;
      if (!sprintId || opts.last) {
        const resolved = resolveLastSprint(root);
        if (!resolved) {
          print('No sprint metrics found. Run `deckent start` to complete a sprint first.');
          return;
        }
        sprintId = resolved;
      }
      const summary = buildMetricsSummary(root, sprintId);
      if (!summary) {
        print(`No metrics data found for ${sprintId}. Looked under .tasks/archive/ and .deckent/.`);
        return;
      }
      if (opts.json) {
        print(JSON.stringify(summary, null, 2));
        return;
      }
      print(renderMetricsSummary(summary));
    });
}
