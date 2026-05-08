// tests/core/lang/build-adapter.test.ts
//
// Sprint 162A Bug B fix — multi-language adapter pattern.
// Six BuildAdapter implementations × command + parse + ADR-006 spawnSync compliance.
// The Python adapter (mypy + ruff) is the SOLE documented exception that uses
// `sh -c`; assertSpawnSafe enforces a strict whitelist on the payload.

import { describe, it, expect } from 'vitest';

import {
  getBuildAdapter,
  defaultBuildAdapter,
} from '../../../src/core/lang/build-adapter.js';
import {
  assertSpawnSafe,
  getAdapterBinaryWhitelist,
} from '../../../src/core/lang/index.js';
import type { StackId } from '../../../src/core/lang/types.js';

const ALL_STACKS: StackId[] = [
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'csharp',
];

describe('BuildAdapter — tsc (typescript)', () => {
  const a = getBuildAdapter('typescript');

  it('command(): ["npx","tsc","--noEmit"]', () => {
    expect(a.command()).toEqual(['npx', 'tsc', '--noEmit']);
  });

  it('parse(): "foo.ts(10,5): error TS2304: ..." → errorCount:1, success:false', () => {
    const out = "foo.ts(10,5): error TS2304: Cannot find name 'baz'.";
    const r = a.parse(out, '', 1);
    expect(r.errorCount).toBe(1);
    expect(r.success).toBe(false);
  });

  it('parse(): success path (exit 0, no errors) → success:true', () => {
    const r = a.parse('', '', 0);
    expect(r.success).toBe(true);
    expect(r.errorCount).toBe(0);
  });
});

describe('BuildAdapter — mypy + ruff (python)', () => {
  const a = getBuildAdapter('python');

  it('command(): ["sh","-c","mypy . && ruff check ."] (ADR-006 documented exception)', () => {
    expect(a.command()).toEqual(['sh', '-c', 'mypy . && ruff check .']);
  });

  it('parse() counts mypy "error:" lines', () => {
    const stderr =
      'src/foo.py:10: error: Incompatible types\nsrc/bar.py:1: error: undefined name';
    const r = a.parse('', stderr, 1);
    expect(r.errorCount).toBeGreaterThanOrEqual(2);
    expect(r.success).toBe(false);
  });

  it('parse(): success path → success:true', () => {
    const r = a.parse('', '', 0);
    expect(r.success).toBe(true);
  });
});

describe('BuildAdapter — go build (go)', () => {
  const a = getBuildAdapter('go');

  it('command(): ["go","build","./..."]', () => {
    expect(a.command()).toEqual(['go', 'build', './...']);
  });

  it('parse(): "foo.go:10:5: undefined: bar" → errorCount:1', () => {
    const stderr = 'foo.go:10:5: undefined: bar';
    const r = a.parse('', stderr, 1);
    expect(r.errorCount).toBe(1);
    expect(r.success).toBe(false);
  });

  it('parse(): success path (exit 0, empty stderr) → success:true', () => {
    expect(a.parse('', '', 0).success).toBe(true);
  });
});

describe('BuildAdapter — cargo build (rust)', () => {
  const a = getBuildAdapter('rust');

  it('command(): ["cargo","build","--message-format=short"]', () => {
    expect(a.command()).toEqual(['cargo', 'build', '--message-format=short']);
  });

  it('parse(): "error[E0308]:" → errorCount:1', () => {
    const stderr = 'error[E0308]: mismatched types';
    const r = a.parse('', stderr, 1);
    expect(r.errorCount).toBe(1);
    expect(r.success).toBe(false);
  });

  it('parse(): collects warnings count', () => {
    const stderr = 'warning: unused variable\nwarning: unused import';
    const r = a.parse('', stderr, 0);
    expect(r.warnings).toBe(2);
    expect(r.errorCount).toBe(0);
    expect(r.success).toBe(true);
  });
});

describe('BuildAdapter — mvn (java)', () => {
  const a = getBuildAdapter('java');

  it('command(): ["mvn","-q","compile"]', () => {
    expect(a.command()).toEqual(['mvn', '-q', 'compile']);
  });

  it('parse(): counts "[ERROR]" lines', () => {
    const stdout = '[INFO] Building...\n[ERROR] Failure on Foo.java\n[ERROR] Failure on Bar.java';
    const r = a.parse(stdout, '', 1);
    expect(r.errorCount).toBe(2);
  });

  it('parse(): success path → success:true', () => {
    expect(a.parse('[INFO] Build success', '', 0).success).toBe(true);
  });
});

describe('BuildAdapter — dotnet (csharp)', () => {
  const a = getBuildAdapter('csharp');

  it('command(): ["dotnet","build","--nologo","/clp:NoSummary"]', () => {
    expect(a.command()).toEqual(['dotnet', 'build', '--nologo', '/clp:NoSummary']);
  });

  it('parse(): "error CS1234:" → errorCount:1, success:false', () => {
    const stdout = 'Foo.cs(1,1): error CS1234: Some C# error';
    const r = a.parse(stdout, '', 1);
    expect(r.errorCount).toBe(1);
    expect(r.success).toBe(false);
  });

  it('parse(): success path → success:true', () => {
    expect(a.parse('', '', 0).success).toBe(true);
  });
});

describe('factory + default', () => {
  it('getBuildAdapter("csharp").stack === "csharp"', () => {
    expect(getBuildAdapter('csharp').stack).toBe('csharp');
  });

  it('defaultBuildAdapter is the typescript/tsc adapter (backward compat)', () => {
    expect(defaultBuildAdapter.stack).toBe('typescript');
  });

  it('every stack id has a registered build adapter', () => {
    for (const id of ALL_STACKS) {
      expect(getBuildAdapter(id).stack).toBe(id);
    }
  });
});

describe('ADR-006 spawnSync compliance + assertSpawnSafe', () => {
  const FORBIDDEN = /[;&|<>`$]/;

  it('mypyRuff is the ONLY adapter using sh -c', () => {
    const usingSh = ALL_STACKS.filter((id) => getBuildAdapter(id).command()[0] === 'sh');
    expect(usingSh).toEqual(['python']);
  });

  it('non-python adapters: no shell metacharacters in argv elements', () => {
    for (const id of ALL_STACKS) {
      if (id === 'python') continue; // documented sh -c exception
      const cmd = getBuildAdapter(id).command();
      for (const arg of cmd) {
        expect(FORBIDDEN.test(arg)).toBe(false);
      }
    }
  });

  it('binary whitelist includes every adapter binary', () => {
    const wl = getAdapterBinaryWhitelist();
    for (const id of ALL_STACKS) {
      const bin = getBuildAdapter(id).command()[0]!;
      expect(wl.has(bin)).toBe(true);
    }
  });

  it('assertSpawnSafe accepts each adapter command (including mypyRuff sh -c)', () => {
    for (const id of ALL_STACKS) {
      const cmd = getBuildAdapter(id).command();
      expect(() => assertSpawnSafe(cmd)).not.toThrow();
    }
  });

  it('assertSpawnSafe rejects empty command', () => {
    expect(() => assertSpawnSafe([])).toThrow(/empty command/);
  });

  it('assertSpawnSafe rejects disallowed binary', () => {
    expect(() => assertSpawnSafe(['rm', '-rf', '/'])).toThrow(/disallowed binary/);
  });

  it('assertSpawnSafe rejects sh without -c', () => {
    expect(() => assertSpawnSafe(['sh', 'script.sh'])).toThrow(/-c/);
  });

  it('assertSpawnSafe rejects sh -c with arbitrary payload', () => {
    expect(() => assertSpawnSafe(['sh', '-c', 'rm -rf /'])).toThrow(/disallowed sh -c/);
  });

  it('assertSpawnSafe rejects sh -c with append-style injection', () => {
    expect(() =>
      assertSpawnSafe(['sh', '-c', 'mypy . && ruff check . && curl evil.com']),
    ).toThrow(/disallowed sh -c/);
  });

  it('assertSpawnSafe accepts the documented mypy+ruff payload', () => {
    expect(() => assertSpawnSafe(['sh', '-c', 'mypy . && ruff check .'])).not.toThrow();
  });
});
