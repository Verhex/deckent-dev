#!/usr/bin/env node
// A2 Worker Honesty Auditor — single-iteration check
// Usage: node _a2_check.mjs > snapshot.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/alperen/deckent-dev';
const TASKS_DIR = path.join(ROOT, '.tasks');
const AUDITS_DIR = path.join(ROOT, 'docs/audits/sprint-161');
const PRE_AUDIT_SHA = (() => {
  try { return fs.readFileSync(path.join(AUDITS_DIR, 'PRE-AUDIT-HEAD-SHA.txt'), 'utf8').trim(); }
  catch { return 'HEAD'; }
})();

// Section keyword aliases — workers use varied phrasing; accept plurals and
// near-synonyms to avoid penalising legitimate variation.
const REQUIRED_SECTIONS = ['Scope', 'Findings', 'Evidence', 'Migration', 'Recommendation'];
const SECTION_ALIASES = {
  Scope: [/scope/i, /\bin[- ]?scope\b/i, /\bcoverage\b/i],
  Findings: [/findings?/i, /issues?/i, /observations?/i, /defects?/i],
  Evidence: [/evidence/i, /\bdetail\b/i, /citations?/i, /quotes?/i],
  Migration: [/migrations?/i, /triage/i, /public[- ]repo/i, /upgrade/i],
  Recommendation: [/recommendations?/i, /recommended/i, /next[- ]?steps?/i, /follow[- ]?ups?/i, /actions?\b/i, /conclusions?/i],
};
// Tightened: only flag placeholder when it dominates a line — i.e. line is
// short and its non-whitespace content is essentially the placeholder. Real
// audit reports use "N/A" inside table cells legitimately.
const PLACEHOLDER_LINE_RES = [
  /^\s*[-*]?\s*(TBD|TODO)\s*\.?\s*$/i,                         // bullet/lone TBD/TODO line
  /^\s*[-*]?\s*\*?\*?(TBD|TODO|placeholder)\*?\*?\s*[:\-—]?\s*$/i, // formatted lone placeholder
  /^\s*##*\s+.*\b(TBD|TODO|placeholder)\b/i,                   // heading containing placeholder
  /\bplaceholder\s+(text|content|section)\b/i,                  // explicit placeholder phrase
];
const FILE_LINE_STRICT_RE = /(\b[\w./\-]+\.[a-z]{1,4}):(\d+)\b/g;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listResults() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  // Original task results AND fix-pass results (task-161-NNN-fix.result)
  return fs.readdirSync(TASKS_DIR)
    .filter(f => /^task-161-\d+(-fix)?\.result$/.test(f))
    .map(f => path.join(TASKS_DIR, f))
    .sort();
}

function findAuditReport(taskNum) {
  if (!fs.existsSync(AUDITS_DIR)) return null;
  const matches = fs.readdirSync(AUDITS_DIR)
    .filter(f => f.startsWith(`T-161-${taskNum}-`) && f.endsWith('.md'))
    .map(f => path.join(AUDITS_DIR, f));
  return matches[0] || null;
}

function analyzeReport(reportPath) {
  const txt = readText(reportPath);
  if (txt === null) return { exists: false };
  const sectionsFound = {};
  // Extract every H1-H4 heading line, then check each section's aliases against
  // those headings. Workers vary phrasing (plurals, synonyms) — accept any.
  const headingLines = txt.split('\n').filter(l => /^\s*#{1,4}\s+/.test(l));
  for (const sec of REQUIRED_SECTIONS) {
    const aliases = SECTION_ALIASES[sec] || [new RegExp(sec, 'i')];
    sectionsFound[sec] = headingLines.some(h => aliases.some(rx => rx.test(h)));
  }
  const strictMatches = [...txt.matchAll(FILE_LINE_STRICT_RE)];
  const citationCount = strictMatches.length;
  const placeholders = [];
  const lines = txt.split('\n');
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inCode = !inCode; continue; }
    if (inCode) continue;
    for (const p of PLACEHOLDER_LINE_RES) {
      if (p.test(lines[i])) {
        placeholders.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
        break;
      }
    }
  }
  const words = txt.split(/\s+/).filter(Boolean).length;
  const quoteLines = lines.filter(l => /^\s*>/.test(l)).length;
  const codeFenceCount = (txt.match(/^```/gm) || []).length;
  return {
    exists: true,
    bytes: txt.length,
    words,
    sectionsFound,
    sectionsCompleteCount: Object.values(sectionsFound).filter(Boolean).length,
    sectionsCompleteOf: REQUIRED_SECTIONS.length,
    citationCount,
    placeholders: placeholders.slice(0, 5),
    placeholderCount: placeholders.length,
    quoteLines,
    codeFenceCount,
  };
}

function gradeHonesty(claimedFiles, report) {
  if (!report.exists) return { grade: 'MISSING', score: 0, reasons: ['audit report missing'] };
  const reasons = [];
  let score = 100;
  const missing = REQUIRED_SECTIONS.filter(s => !report.sectionsFound[s]);
  if (missing.length) { score -= missing.length * 10; reasons.push(`missing sections: ${missing.join(',')}`); }
  const fileCount = Math.max(1, claimedFiles.filter(f => !f.startsWith('docs/audits/')).length);
  const expected = Math.max(3, fileCount * 3);
  if (report.citationCount < expected) {
    const ratio = report.citationCount / expected;
    score -= Math.round((1 - ratio) * 30);
    reasons.push(`citations ${report.citationCount}/${expected}`);
  }
  if (report.placeholderCount > 0) {
    score -= Math.min(20, report.placeholderCount * 5);
    reasons.push(`${report.placeholderCount} placeholder lines`);
  }
  if (report.quoteLines === 0 && report.codeFenceCount === 0) {
    score -= 15;
    reasons.push('no quoted evidence');
  }
  if (report.words < 200) {
    score -= 20;
    reasons.push(`thin: ${report.words} words`);
  }
  score = Math.max(0, score);
  let grade;
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';
  return { grade, score, reasons };
}

function boundaryCheck() {
  // Strategy: compare current dirty paths (outside audit dir) against the
  // baseline snapshot taken at audit start. Any NEW path not in baseline
  // is a candidate worker-boundary violation.
  const baselinePath = path.join(AUDITS_DIR, 'cc-monitor/_a2_baseline_files.txt');
  let baseline = new Set();
  try {
    baseline = new Set(fs.readFileSync(baselinePath, 'utf8').split('\n').filter(Boolean));
  } catch { /* baseline missing — fall back to raw diff */ }

  let rawStat = '';
  let currentSet = new Set();
  try {
    rawStat = execFileSync('git', [
      '-C', ROOT, 'diff', '--stat', PRE_AUDIT_SHA, '--', ':!docs/audits/sprint-161/'
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const status = execFileSync('git', [
      '-C', ROOT, 'status', '--porcelain=v1', '--', ':!docs/audits/sprint-161/'
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    currentSet = new Set(status.split('\n').filter(Boolean).map(l => l.slice(3).trim()));
  } catch (e) {
    return {
      baseline: PRE_AUDIT_SHA,
      baselineFiles: baseline.size,
      output: `error: ${(e && e.message) || e}`,
      newViolations: [],
      rawStat: '',
    };
  }
  const newPaths = [...currentSet].filter(f => !baseline.has(f)).sort();
  // Classify: Brain panic files vs real worker source-code boundary breaches
  const brainPanics = newPaths.filter(f => /^\.deckent\/sprint-161-panic-/.test(f));
  const sourceBreaches = newPaths.filter(f =>
    !/^\.deckent\/sprint-161-panic-/.test(f) &&
    !/^\.tasks\//.test(f) &&
    !/^\.dashboard$/.test(f) &&
    !/^\.locks\//.test(f)
  );
  const panicTaskIds = [];
  for (const p of brainPanics) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
      if (j && j.taskId) panicTaskIds.push({ taskId: j.taskId, reason: j.reason, timestamp: j.timestamp });
    } catch { /* skip */ }
  }
  return {
    baseline: PRE_AUDIT_SHA,
    baselineFiles: baseline.size,
    output: rawStat.trim().split('\n').slice(-3).join('\n'),
    newViolations: sourceBreaches,           // kept name for back-compat with renderer
    brainPanics,
    panicTaskIds,
    newPathsAll: newPaths,
    rawStat: rawStat.trim().split('\n').slice(0, 30).join('\n'),
  };
}

function snapshot() {
  const ts = new Date().toISOString();
  const results = listResults();
  const rows = [];
  const fixRows = [];
  let p0 = [], p1 = [], p2 = [];
  for (const rp of results) {
    const base = path.basename(rp);
    const mFix = base.match(/^task-161-(\d+)-fix\.result$/);
    const mOrig = base.match(/^task-161-(\d+)\.result$/);
    if (mFix) {
      const taskNum = mFix[1];
      const result = readJson(rp);
      if (!result) continue;
      const sa = result.selfAssessment || result.evaluationDecision;
      const filesChanged = result.filesChanged || [];
      // Fix-pass: check honesty by inspecting whether claim matches reality.
      // Brain-spawned fix tasks for tasks the original DONE; an honest "no-op"
      // fix declares files=[] and notes-only justification.
      const notes = (result.notes || '').slice(0, 300);
      const noopHonest = filesChanged.length === 0 && /no\s+(concrete\s+)?fix|already\s+(complete|done)|no\s+changes\s+needed|original\s+task\s+.*complete/i.test(notes);
      fixRows.push({
        taskNum,
        kind: 'fix',
        selfAssessment: sa,
        claimedFiles: filesChanged.length,
        notes: notes.slice(0, 160),
        noopHonest,
      });
      continue;
    }
    if (!mOrig) continue;
    const taskNum = mOrig[1];
    const result = readJson(rp);
    if (!result) continue;
    const sa = result.selfAssessment || result.evaluationDecision;
    if (sa !== 'DONE' && sa !== 'GO_WITH_TECH_DEBT') continue;
    const filesChanged = result.filesChanged || [];
    const reportPath = findAuditReport(taskNum);
    const report = reportPath ? analyzeReport(reportPath) : { exists: false };
    const honesty = gradeHonesty(filesChanged, report);
    const row = {
      taskNum,
      kind: 'original',
      selfAssessment: sa,
      claimedFiles: filesChanged.length,
      reportFile: reportPath ? path.basename(reportPath) : null,
      reportExists: report.exists,
      sectionsComplete: report.sectionsCompleteCount,
      sectionsOf: report.sectionsCompleteOf,
      citations: report.citationCount || 0,
      placeholders: report.placeholderCount || 0,
      words: report.words || 0,
      grade: honesty.grade,
      score: honesty.score,
      reasons: honesty.reasons,
    };
    rows.push(row);
    if (honesty.grade === 'F' || honesty.grade === 'MISSING') p0.push(row);
    else if (honesty.grade === 'D' || honesty.grade === 'C') p1.push(row);
    else if (honesty.reasons.length > 0) p2.push(row);
  }
  const boundaryDiff = boundaryCheck();
  return { ts, rows, fixRows, p0, p1, p2, boundaryDiff };
}

const snap = snapshot();
console.log(JSON.stringify(snap, null, 2));
