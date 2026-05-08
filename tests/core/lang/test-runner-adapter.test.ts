// tests/core/lang/test-runner-adapter.test.ts
//
// Sprint 162A Bug B fix — multi-language adapter pattern.
// Six TestRunnerAdapter implementations × command shape + parse golden tests.
// ADR-006 spawnSync compliance: every command() returns string[] without
// embedded shell metacharacters in argv elements (the sole exception is the
// Python build adapter, tested in build-adapter.test.ts).

import { describe, it, expect } from 'vitest';

import {
  getTestRunnerAdapter,
  defaultTestRunnerAdapter,
} from '../../../src/core/lang/test-runner-adapter.js';
import type { StackId } from '../../../src/core/lang/types.js';

const ALL_STACKS: StackId[] = [
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'csharp',
];

describe('TestRunnerAdapter — vitest (typescript)', () => {
  const a = getTestRunnerAdapter('typescript');

  it('command(): default returns ["npx","vitest","run"]', () => {
    expect(a.command()).toEqual(['npx', 'vitest', 'run']);
  });

  it('command({coverage:true}) appends --coverage', () => {
    expect(a.command({ coverage: true })).toEqual(['npx', 'vitest', 'run', '--coverage']);
  });

  it('command({filter:"foo"}) appends --testNamePattern', () => {
    expect(a.command({ filter: 'foo' })).toEqual([
      'npx',
      'vitest',
      'run',
      '--testNamePattern',
      'foo',
    ]);
  });

  it('parse(): "Tests 12 passed" → {passed:12,failed:0,success:true}', () => {
    const r = a.parse('Tests 12 passed (12)\nDone.', '', 0);
    expect(r.passed).toBe(12);
    expect(r.failed).toBe(0);
    expect(r.success).toBe(true);
  });

  it('parse(): "Tests 2 failed" with exit 1 → success:false', () => {
    const r = a.parse('Tests 2 failed (2)', '', 1);
    expect(r.failed).toBe(2);
    expect(r.success).toBe(false);
  });
});

describe('TestRunnerAdapter — pytest (python)', () => {
  const a = getTestRunnerAdapter('python');

  it('command(): default ["pytest","-q"]', () => {
    expect(a.command()).toEqual(['pytest', '-q']);
  });

  it('command({filter:"test_foo"}) → ["pytest","-q","-k","test_foo"]', () => {
    expect(a.command({ filter: 'test_foo' })).toEqual(['pytest', '-q', '-k', 'test_foo']);
  });

  it('command({coverage:true}) adds --cov flags', () => {
    const c = a.command({ coverage: true });
    expect(c).toContain('--cov');
    expect(c).toContain('--cov-report=xml');
  });

  it('parse(): "5 passed, 2 failed in 0.4s" → {passed:5, failed:2}', () => {
    const r = a.parse('5 passed, 2 failed in 0.4s', '', 1);
    expect(r.passed).toBe(5);
    expect(r.failed).toBe(2);
  });

  it('parse(): "12 passed, 1 skipped in 0.42s" → {passed:12,skipped:1}', () => {
    const r = a.parse('12 passed, 1 skipped in 0.42s', '', 0);
    expect(r.passed).toBe(12);
    expect(r.skipped).toBe(1);
    expect(r.success).toBe(true);
  });
});

describe('TestRunnerAdapter — go test (go)', () => {
  const a = getTestRunnerAdapter('go');

  it('command(): default ["go","test","./..."]', () => {
    expect(a.command()).toEqual(['go', 'test', './...']);
  });

  it('command({coverage:true}) adds -coverprofile', () => {
    expect(a.command({ coverage: true })).toEqual([
      'go',
      'test',
      './...',
      '-coverprofile=coverage.out',
    ]);
  });

  it('parse(): "ok pkg/foo\\nFAIL pkg/bar" → {passed:1, failed:1}', () => {
    const stdout = 'ok  \tpkg/foo\t0.1s\nFAIL\tpkg/bar\t0.2s\n';
    const r = a.parse(stdout, '', 1);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(1);
  });
});

describe('TestRunnerAdapter — cargo test (rust)', () => {
  const a = getTestRunnerAdapter('rust');

  it('command(): default ["cargo","test"]', () => {
    expect(a.command()).toEqual(['cargo', 'test']);
  });

  it('parse(): "test result: ok. 12 passed; 0 failed; 1 ignored" → counts', () => {
    const r = a.parse(
      'running 13 tests\ntest result: ok. 12 passed; 0 failed; 1 ignored;\n',
      '',
      0,
    );
    expect(r.passed).toBe(12);
    expect(r.failed).toBe(0);
    expect(r.skipped).toBe(1);
  });
});

describe('TestRunnerAdapter — JUnit/maven (java)', () => {
  const a = getTestRunnerAdapter('java');

  it('command(): ["mvn","-q","test"]', () => {
    expect(a.command()).toEqual(['mvn', '-q', 'test']);
  });

  it('parse(): "Tests run: 12, Failures: 1, Errors: 0, Skipped: 1" → {passed:10,failed:1,skipped:1}', () => {
    const r = a.parse('Tests run: 12, Failures: 1, Errors: 0, Skipped: 1', '', 1);
    expect(r.passed).toBe(10);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
  });
});

describe('TestRunnerAdapter — xUnit/dotnet (csharp)', () => {
  const a = getTestRunnerAdapter('csharp');

  it('command(): ["dotnet","test","--nologo"]', () => {
    expect(a.command()).toEqual(['dotnet', 'test', '--nologo']);
  });

  it('parse(): "Failed: 1, Passed: 10, Skipped: 1, Total: 12" → counts', () => {
    const r = a.parse('Failed: 1, Passed: 10, Skipped: 1, Total: 12', '', 1);
    expect(r.passed).toBe(10);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
  });
});

describe('factory + default', () => {
  it('getTestRunnerAdapter("python").stack === "python"', () => {
    expect(getTestRunnerAdapter('python').stack).toBe('python');
  });

  it('defaultTestRunnerAdapter is the typescript/vitest adapter (backward compat)', () => {
    expect(defaultTestRunnerAdapter.stack).toBe('typescript');
    expect(defaultTestRunnerAdapter.label).toBe('vitest');
  });

  it('every stack id has a registered adapter', () => {
    for (const id of ALL_STACKS) {
      const a = getTestRunnerAdapter(id);
      expect(a).toBeDefined();
      expect(a.stack).toBe(id);
    }
  });
});

describe('ADR-006 spawnSync compliance', () => {
  // No element of any TestRunnerAdapter command may contain shell metacharacters.
  // Test runner adapters specifically: NO `sh -c` exception (only build adapter
  // has that documented exception).
  const FORBIDDEN = /[;&|<>`$]/;

  it('no test-runner command embeds shell metacharacters', () => {
    for (const id of ALL_STACKS) {
      const a = getTestRunnerAdapter(id);
      const cmds = [
        a.command(),
        a.command({ coverage: true }),
        a.command({ filter: 'mytest' }),
      ];
      for (const cmd of cmds) {
        expect(Array.isArray(cmd)).toBe(true);
        expect(cmd.length).toBeGreaterThan(0);
        for (const arg of cmd) {
          // Each argument must be a plain string with no shell separators.
          expect(typeof arg).toBe('string');
          expect(FORBIDDEN.test(arg)).toBe(false);
        }
      }
    }
  });

  it('no test-runner adapter uses sh', () => {
    for (const id of ALL_STACKS) {
      const a = getTestRunnerAdapter(id);
      expect(a.command()[0]).not.toBe('sh');
    }
  });
});
