// src/core/lang/coverage-adapter.ts
//
// Six CoverageAdapter implementations (vitest JSON, coverage.py XML, go cover,
// cargo-tarpaulin/cobertura XML, JaCoCo XML, OpenCover XML) + factory + default.
//
// SECURITY: parse() is pure — receives report content as a string and never
// performs file I/O. Path resolution + containment checks are caller's
// responsibility (see CoverageAdapter docstring in types.ts).

import type { CoverageAdapter, StackId } from './types.js';

const vitestCov: CoverageAdapter = {
  stack: 'typescript',
  label: 'vitest v8 coverage (JSON)',
  reportGlobs() {
    return ['coverage/coverage-final.json', 'coverage/coverage-summary.json'];
  },
  parse(content, reportPath) {
    try {
      const json = JSON.parse(content) as Record<string, unknown>;
      // coverage-summary.json shape: { total: { lines: { pct: 89.3 }, branches: { pct: 78.1 } } }
      const total = (json.total as Record<string, unknown> | undefined) ?? json;
      const lines = readPct(total, 'lines');
      const branches = readPct(total, 'branches');
      if (lines == null) return null;
      return {
        lineCoverage: round2(lines),
        branchCoverage: branches == null ? -1 : round2(branches),
        format: 'json',
        reportPath,
      };
    } catch {
      return null;
    }
  },
};

const pythonCov: CoverageAdapter = {
  stack: 'python',
  label: 'coverage.py XML',
  reportGlobs() {
    return ['coverage.xml'];
  },
  parse(content, reportPath) {
    // <coverage line-rate="0.892" branch-rate="0.78" ...>
    const lineMatch = content.match(/line-rate="([\d.]+)"/);
    const branchMatch = content.match(/branch-rate="([\d.]+)"/);
    if (!lineMatch) return null;
    return {
      lineCoverage: round2(parseFloat(lineMatch[1]!) * 100),
      branchCoverage: branchMatch ? round2(parseFloat(branchMatch[1]!) * 100) : -1,
      format: 'xml',
      reportPath,
    };
  },
};

const goCov: CoverageAdapter = {
  stack: 'go',
  label: 'go cover txt',
  reportGlobs() {
    return ['coverage.out'];
  },
  parse(content, reportPath) {
    // Format: "<path>:<startLine>.<startCol>,<endLine>.<endCol> <numStmt> <count>"
    // Coverage = sum(stmts where count>0) / sum(stmts).
    let total = 0;
    let covered = 0;
    for (const line of content.split('\n')) {
      // Skip the "mode:" header and any blank line.
      if (line.startsWith('mode:') || line.trim() === '') continue;
      const m = line.match(/(\d+)\s+(\d+)\s*$/);
      if (!m) continue;
      const stmts = parseInt(m[1]!, 10);
      const count = parseInt(m[2]!, 10);
      total += stmts;
      if (count > 0) covered += stmts;
    }
    if (total === 0) return null;
    return {
      lineCoverage: round2((covered / total) * 100),
      branchCoverage: -1,
      format: 'txt',
      reportPath,
    };
  },
};

const rustCov: CoverageAdapter = {
  stack: 'rust',
  label: 'cargo-tarpaulin XML',
  reportGlobs() {
    return ['cobertura.xml', 'tarpaulin-report.xml'];
  },
  parse(content, reportPath) {
    // tarpaulin emits cobertura format: <coverage line-rate="0.83" branch-rate="0.72" ...>
    const m = content.match(/line-rate="([\d.]+)"/);
    const b = content.match(/branch-rate="([\d.]+)"/);
    if (!m) return null;
    return {
      lineCoverage: round2(parseFloat(m[1]!) * 100),
      branchCoverage: b ? round2(parseFloat(b[1]!) * 100) : -1,
      format: 'xml',
      reportPath,
    };
  },
};

const jacocoCov: CoverageAdapter = {
  stack: 'java',
  label: 'JaCoCo XML',
  reportGlobs() {
    return [
      'target/site/jacoco/jacoco.xml',
      'build/reports/jacoco/test/jacocoTestReport.xml',
    ];
  },
  parse(content, reportPath) {
    // <counter type="LINE" missed="123" covered="456"/> (attribute order may vary)
    const lineCounter = matchCounter(content, 'LINE');
    const branchCounter = matchCounter(content, 'BRANCH');
    if (!lineCounter) return null;
    const total = lineCounter.missed + lineCounter.covered;
    if (total === 0) return null;
    let branchPct = -1;
    if (branchCounter) {
      const bt = branchCounter.missed + branchCounter.covered;
      branchPct = bt > 0 ? round2((branchCounter.covered / bt) * 100) : -1;
    }
    return {
      lineCoverage: round2((lineCounter.covered / total) * 100),
      branchCoverage: branchPct,
      format: 'xml',
      reportPath,
    };
  },
};

const opencoverCov: CoverageAdapter = {
  stack: 'csharp',
  label: 'OpenCover XML',
  reportGlobs() {
    return ['coverage.opencover.xml', 'TestResults/**/coverage.opencover.xml'];
  },
  parse(content, reportPath) {
    // <Summary ... sequenceCoverage="89.5" branchCoverage="78.1" ... />
    const lineMatch = content.match(/sequenceCoverage="([\d.]+)"/);
    const branchMatch = content.match(/branchCoverage="([\d.]+)"/);
    if (!lineMatch) return null;
    return {
      lineCoverage: round2(parseFloat(lineMatch[1]!)),
      branchCoverage: branchMatch ? round2(parseFloat(branchMatch[1]!)) : -1,
      format: 'xml',
      reportPath,
    };
  },
};

const REGISTRY: Record<StackId, CoverageAdapter> = {
  typescript: vitestCov,
  python: pythonCov,
  go: goCov,
  rust: rustCov,
  java: jacocoCov,
  csharp: opencoverCov,
};

/** Look up the coverage adapter for a stack id. */
export function getCoverageAdapter(stack: StackId): CoverageAdapter {
  return REGISTRY[stack];
}

/** Default adapter used when stack detection fails — preserves backward compat. */
export const defaultCoverageAdapter = vitestCov;

// ─── Internal helpers ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readPct(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const entry = (obj as Record<string, unknown>)[key];
  if (!entry || typeof entry !== 'object') return null;
  const pct = (entry as Record<string, unknown>).pct;
  return typeof pct === 'number' ? pct : null;
}

function matchCounter(
  content: string,
  type: 'LINE' | 'BRANCH',
): { missed: number; covered: number } | null {
  // Allow `type` and missed/covered attributes to appear in any order on a
  // single <counter .../> tag. Two passes: capture the whole tag, then read
  // attributes individually.
  const tagRe = new RegExp(`<counter\\b[^/]*type="${type}"[^/]*/>`);
  const tagRe2 = new RegExp(`<counter\\b(?:(?!type=)[^/])*?[^/]*?\\/>`);
  let tag = content.match(tagRe)?.[0];
  if (!tag) {
    // type attribute might appear after missed/covered — search again with a permissive pattern
    const all = content.match(/<counter\b[^/]*\/>/g) ?? [];
    tag = all.find((t) => t.includes(`type="${type}"`));
  }
  if (!tag) {
    // Nothing matched
    void tagRe2; // explicit reference to avoid unused warning in hostile linters
    return null;
  }
  const missed = tag.match(/missed="(\d+)"/);
  const covered = tag.match(/covered="(\d+)"/);
  if (!missed || !covered) return null;
  return {
    missed: parseInt(missed[1]!, 10),
    covered: parseInt(covered[1]!, 10),
  };
}
