#!/usr/bin/env node
// A2 — render snapshots[] (JSONL history) into Markdown report
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/alperen/deckent-dev';
const HISTORY = path.join(ROOT, 'docs/audits/sprint-161/cc-monitor/_a2_history.jsonl');
const OUT = path.join(ROOT, 'docs/audits/sprint-161/cc-monitor/A2-worker-honesty.md');

function readHistory() {
  if (!fs.existsSync(HISTORY)) return [];
  return fs.readFileSync(HISTORY, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function escapePipe(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

function render(history) {
  const latest = history[history.length - 1] || { ts: new Date().toISOString(), rows: [], fixRows: [], p0: [], p1: [], p2: [], boundaryDiff: { baseline: 'unknown', output: '(no data yet)' } };
  if (!latest.fixRows) latest.fixRows = [];
  const firstTs = history[0]?.ts || latest.ts;
  const totalIters = history.length;
  const totalUniqueTasks = new Set(history.flatMap(s => s.rows.map(r => r.taskNum))).size;

  const lines = [];
  lines.push('# A2 — Worker Honesty Audit (Sprint 161 monitoring)');
  lines.push('');
  lines.push(`- First snapshot: \`${firstTs}\``);
  lines.push(`- Latest snapshot: \`${latest.ts}\``);
  lines.push(`- Snapshots taken: ${totalIters}`);
  lines.push(`- Unique finalized tasks observed: ${totalUniqueTasks}`);
  lines.push(`- Cadence: 180s poll`);
  lines.push(`- Termination: RETRO sprint-161 header / status COMPLETE / 6h cap`);
  lines.push('');

  lines.push('## Per-task honesty score (latest snapshot)');
  lines.push('');
  if (latest.rows.length === 0) {
    lines.push('_No finalized DONE/GO_WITH_TECH_DEBT results yet._');
  } else {
    lines.push('| Task | Self-assess | Files claimed | Citations | Sections | Words | Grade | Score | Reasons |');
    lines.push('|------|-------------|---------------|-----------|----------|-------|-------|-------|---------|');
    const sorted = [...latest.rows].sort((a, b) => a.taskNum.localeCompare(b.taskNum));
    for (const r of sorted) {
      lines.push(`| ${r.taskNum} | ${r.selfAssessment} | ${r.claimedFiles} | ${r.citations} | ${r.sectionsComplete}/${r.sectionsOf} | ${r.words} | ${r.grade} | ${r.score} | ${escapePipe(r.reasons.join('; '))} |`);
    }
  }
  lines.push('');

  // Fix-pass results
  if (latest.fixRows.length > 0) {
    lines.push('## Fix-pass results (Brain-spawned re-runs)');
    lines.push('');
    lines.push('| Task | Self-assess | Files claimed | No-op honest? | Notes (excerpt) |');
    lines.push('|------|-------------|---------------|---------------|------------------|');
    const sortedFix = [...latest.fixRows].sort((a, b) => a.taskNum.localeCompare(b.taskNum));
    for (const r of sortedFix) {
      lines.push(`| ${r.taskNum}-fix | ${r.selfAssessment} | ${r.claimedFiles} | ${r.noopHonest ? 'yes' : 'no'} | ${escapePipe((r.notes || '').slice(0, 120))} |`);
    }
    lines.push('');
    lines.push('> Fix-pass tasks self-asserting `files: []` + "no concrete fix" justification (no-op honest=yes) are an honest sprint-health signal: the original task already met its acceptance criteria.');
    lines.push('');
  }

  lines.push('## Findings');
  lines.push('');
  lines.push('### P0 — Dishonest tasks (grade F or MISSING report)');
  if (latest.p0.length === 0) {
    lines.push('_None._');
  } else {
    for (const r of latest.p0) {
      lines.push(`- **T-161-${r.taskNum}** (${r.selfAssessment}, ${r.grade}, score ${r.score}) — report=${r.reportFile || 'MISSING'}, citations=${r.citations}, sections=${r.sectionsComplete}/${r.sectionsOf}, words=${r.words} — ${r.reasons.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('### P1 — Partial coverage (grade C or D)');
  if (latest.p1.length === 0) {
    lines.push('_None._');
  } else {
    for (const r of latest.p1) {
      lines.push(`- **T-161-${r.taskNum}** (${r.selfAssessment}, ${r.grade}, score ${r.score}) — citations=${r.citations}, sections=${r.sectionsComplete}/${r.sectionsOf}, words=${r.words} — ${r.reasons.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('### P2 — Minor format gaps (grade A/B with caveats)');
  if (latest.p2.length === 0) {
    lines.push('_None._');
  } else {
    for (const r of latest.p2) {
      lines.push(`- **T-161-${r.taskNum}** (${r.selfAssessment}, ${r.grade}, score ${r.score}) — ${r.reasons.join('; ')}`);
    }
  }
  lines.push('');

  lines.push('## Boundary integrity check');
  lines.push('');
  const bd = latest.boundaryDiff || {};
  lines.push(`- Baseline SHA (audit start): \`${bd.baseline || 'unknown'}\``);
  lines.push(`- Pre-existing dirty paths at audit start: ${bd.baselineFiles ?? 'unknown'} (excluded from violation count)`);
  lines.push(`- Snapshot at \`${latest.ts}\``);
  lines.push('');
  if (bd.newViolations && bd.newViolations.length > 0) {
    lines.push(`### NEW worker source-code breaches (${bd.newViolations.length})`);
    lines.push('');
    lines.push('Files modified by workers OUTSIDE `docs/audits/sprint-161/`, NOT in pre-audit baseline, NOT system-generated:');
    lines.push('');
    for (const f of bd.newViolations) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  } else {
    lines.push('### NEW worker source-code breaches: 0');
    lines.push('');
    lines.push('No worker has modified source files outside the audit dir beyond the pre-audit baseline.');
    lines.push('');
  }
  // Brain-emitted panic snapshots — system events, not worker breaches, but
  // still surface them as a sprint-health signal.
  if (bd.brainPanics && bd.brainPanics.length > 0) {
    lines.push(`### Brain-emitted panic snapshots (${bd.brainPanics.length}) — system events, not worker breaches`);
    lines.push('');
    lines.push('These files were written by Brain itself (grace_period_timeout / heartbeat staleness). Surfaced for sprint-health visibility.');
    lines.push('');
    lines.push('| File | task_id | reason | timestamp |');
    lines.push('|------|---------|--------|-----------|');
    const byFile = new Map((bd.panicTaskIds || []).map((p, i) => [bd.brainPanics[i], p]));
    for (const f of bd.brainPanics) {
      const p = byFile.get(f) || {};
      lines.push(`| \`${f}\` | ${p.taskId || '?'} | ${p.reason || '?'} | ${p.timestamp || '?'} |`);
    }
    lines.push('');
  }
  lines.push('### Aggregate diff summary (vs audit-start SHA, audit dir excluded)');
  lines.push('');
  lines.push('```');
  lines.push((bd.output || '(none)').slice(0, 4000));
  lines.push('```');
  lines.push('');
  lines.push('> Workers should ONLY modify `docs/audits/sprint-161/T-161-NNN-*.md`. NEW paths above are boundary-violation candidates (pre-existing dirty state has been subtracted).');
  lines.push('');

  lines.push('## Snapshot history (compact)');
  lines.push('');
  lines.push('| ts | finalized | P0 | P1 | P2 |');
  lines.push('|----|-----------|----|----|----|');
  for (const s of history) {
    lines.push(`| ${s.ts} | ${s.rows.length} | ${s.p0.length} | ${s.p1.length} | ${s.p2.length} |`);
  }
  lines.push('');

  return lines.join('\n');
}

const md = render(readHistory());
fs.writeFileSync(OUT, md, 'utf8');
console.log(`wrote ${OUT}`);
