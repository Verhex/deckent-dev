// tests/core/lang/coverage-adapter.test.ts
//
// Sprint 162A Bug B fix — multi-language adapter pattern.
// Six CoverageAdapter implementations × parse golden + negative tests.
// Coverage parsers are pure (no I/O); we feed them inline string fixtures.

import { describe, it, expect } from 'vitest';

import {
  getCoverageAdapter,
  defaultCoverageAdapter,
} from '../../../src/core/lang/coverage-adapter.js';
import type { StackId } from '../../../src/core/lang/types.js';

const ALL_STACKS: StackId[] = [
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'csharp',
];

describe('CoverageAdapter — vitest v8 (typescript)', () => {
  const a = getCoverageAdapter('typescript');

  it('parses coverage-summary.json with total/lines/branches', () => {
    const json = JSON.stringify({
      total: { lines: { pct: 89.3 }, branches: { pct: 78.1 } },
    });
    const r = a.parse(json, '/p/coverage/coverage-summary.json');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(89.3);
    expect(r!.branchCoverage).toBe(78.1);
    expect(r!.format).toBe('json');
  });

  it('returns null on malformed JSON', () => {
    expect(a.parse('not json', '/p/coverage.json')).toBeNull();
  });

  it('returns null when total.lines.pct is missing', () => {
    const r = a.parse(JSON.stringify({ total: { branches: { pct: 50 } } }), '/p/x.json');
    expect(r).toBeNull();
  });

  it('reportGlobs returns vitest paths', () => {
    const g = a.reportGlobs();
    expect(g).toContain('coverage/coverage-summary.json');
  });
});

describe('CoverageAdapter — coverage.py XML (python)', () => {
  const a = getCoverageAdapter('python');

  it('parses cobertura-style line-rate + branch-rate', () => {
    const xml = '<coverage line-rate="0.892" branch-rate="0.78" version="1.0"></coverage>';
    const r = a.parse(xml, '/p/coverage.xml');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(89.2);
    expect(r!.branchCoverage).toBe(78);
    expect(r!.format).toBe('xml');
  });

  it('returns null on missing line-rate', () => {
    expect(a.parse('<coverage></coverage>', '/p/coverage.xml')).toBeNull();
  });
});

describe('CoverageAdapter — go cover txt (go)', () => {
  const a = getCoverageAdapter('go');

  it('parses go cover txt with mode header', () => {
    const txt = [
      'mode: set',
      'foo.go:1.1,2.2 5 1', // 5 stmts, count>0 → covered
      'bar.go:1.1,2.2 3 0', // 3 stmts, count=0 → uncovered
    ].join('\n');
    const r = a.parse(txt, '/p/coverage.out');
    expect(r).not.toBeNull();
    // covered=5, total=8 → 62.5%
    expect(r!.lineCoverage).toBe(62.5);
    expect(r!.branchCoverage).toBe(-1);
    expect(r!.format).toBe('txt');
  });

  it('returns null on empty content', () => {
    expect(a.parse('', '/p/coverage.out')).toBeNull();
  });

  it('returns null when only the mode header is present', () => {
    expect(a.parse('mode: set\n', '/p/coverage.out')).toBeNull();
  });
});

describe('CoverageAdapter — cargo-tarpaulin (rust)', () => {
  const a = getCoverageAdapter('rust');

  it('parses cobertura with line-rate + branch-rate', () => {
    const xml = '<coverage line-rate="0.83" branch-rate="0.72"></coverage>';
    const r = a.parse(xml, '/p/cobertura.xml');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(83);
    expect(r!.branchCoverage).toBe(72);
  });

  it('returns null on missing line-rate', () => {
    expect(a.parse('<garbage/>', '/p/cobertura.xml')).toBeNull();
  });
});

describe('CoverageAdapter — JaCoCo XML (java)', () => {
  const a = getCoverageAdapter('java');

  it('parses LINE counter (missed=100, covered=400) → 80%', () => {
    const xml =
      '<report>' +
      '<counter type="LINE" missed="100" covered="400"/>' +
      '</report>';
    const r = a.parse(xml, '/p/jacoco.xml');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(80);
  });

  it('parses BRANCH counter alongside LINE', () => {
    const xml =
      '<report>' +
      '<counter type="LINE" missed="100" covered="400"/>' +
      '<counter type="BRANCH" missed="50" covered="50"/>' +
      '</report>';
    const r = a.parse(xml, '/p/jacoco.xml');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(80);
    expect(r!.branchCoverage).toBe(50);
  });

  it('returns null on missing LINE counter', () => {
    expect(a.parse('<report><counter type="BRANCH" missed="0" covered="1"/></report>', '/p/x.xml')).toBeNull();
  });
});

describe('CoverageAdapter — OpenCover (csharp)', () => {
  const a = getCoverageAdapter('csharp');

  it('parses Summary sequenceCoverage + branchCoverage', () => {
    const xml =
      '<CoverageSession><Summary numSequencePoints="100" visitedSequencePoints="89" sequenceCoverage="89.5" branchCoverage="78.1" /></CoverageSession>';
    const r = a.parse(xml, '/p/coverage.opencover.xml');
    expect(r).not.toBeNull();
    expect(r!.lineCoverage).toBe(89.5);
    expect(r!.branchCoverage).toBe(78.1);
  });

  it('returns null on missing sequenceCoverage', () => {
    expect(a.parse('<CoverageSession></CoverageSession>', '/p/x.xml')).toBeNull();
  });
});

describe('factory + default + globs', () => {
  it('getCoverageAdapter("rust").label === "cargo-tarpaulin XML"', () => {
    expect(getCoverageAdapter('rust').label).toBe('cargo-tarpaulin XML');
  });

  it('defaultCoverageAdapter is vitest (backward compat)', () => {
    expect(defaultCoverageAdapter.stack).toBe('typescript');
  });

  it('every stack id has a registered coverage adapter', () => {
    for (const id of ALL_STACKS) {
      const a = getCoverageAdapter(id);
      expect(a).toBeDefined();
      expect(a.stack).toBe(id);
      expect(a.reportGlobs().length).toBeGreaterThan(0);
    }
  });

  it('reportGlobs entries differ across adapters (no two stacks share identical glob set)', () => {
    const fingerprints = new Set<string>();
    for (const id of ALL_STACKS) {
      const fp = getCoverageAdapter(id).reportGlobs().join('|');
      fingerprints.add(fp);
    }
    expect(fingerprints.size).toBe(ALL_STACKS.length);
  });
});
