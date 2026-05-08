// src/core/lang/build-adapter.ts
//
// Six BuildAdapter implementations (tsc, mypy+ruff, go build, cargo build,
// mvn compile, dotnet build) + factory + default.
//
// SECURITY: All commands return `string[]`. The Python adapter uses
// `['sh','-c','mypy . && ruff check .']` because the project requires running
// two binaries in a single verification step (no native composition primitive).
// This is the SOLE documented exception to ADR-006 spawnSync pattern; the
// `sh -c` payload is constrained by `assertSpawnSafe` (see index.ts) so an
// adapter cannot be replaced at runtime with an arbitrary script.

import type { BuildAdapter, StackId } from './types.js';

const tsc: BuildAdapter = {
  stack: 'typescript',
  label: 'tsc --noEmit',
  command() {
    return ['npx', 'tsc', '--noEmit'];
  },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/error TS\d+/g) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0,
      errorCount: errCount,
      warnings: 0,
      errorPreview: text
        .split('\n')
        .filter((l) => l.includes('error TS'))
        .slice(0, 10)
        .join('\n'),
      raw: text,
    };
  },
};

/**
 * Python build adapter — ADR-006 documented exception.
 * Uses `sh -c 'mypy . && ruff check .'` because the project requires both
 * tools in a single verification step. The payload is whitelisted by
 * `assertSpawnSafe`; any other `sh -c` invocation is rejected at the spawn site.
 */
const mypyRuff: BuildAdapter = {
  stack: 'python',
  label: 'mypy + ruff',
  command() {
    return ['sh', '-c', 'mypy . && ruff check .'];
  },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const mypy = (text.match(/error:/g) ?? []).length;
    const ruff = (text.match(/^\S+:\d+:\d+:/gm) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0,
      errorCount: mypy + ruff,
      warnings: 0,
      errorPreview: text.split('\n').slice(0, 10).join('\n'),
      raw: text,
    };
  },
};

const goBuild: BuildAdapter = {
  stack: 'go',
  label: 'go build',
  command() {
    return ['go', 'build', './...'];
  },
  parse(_stdout, stderr, exitCode) {
    const errCount = (stderr.match(/^\S+\.go:\d+:/gm) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0,
      errorCount: errCount,
      warnings: 0,
      errorPreview: stderr.split('\n').slice(0, 10).join('\n'),
      raw: _stdout + '\n' + stderr,
    };
  },
};

const cargoBuild: BuildAdapter = {
  stack: 'rust',
  label: 'cargo build',
  command() {
    return ['cargo', 'build', '--message-format=short'];
  },
  parse(_stdout, stderr, exitCode) {
    const errCount = (stderr.match(/^error(?:\[E\d+\])?:/gm) ?? []).length;
    const warnCount = (stderr.match(/^warning:/gm) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0,
      errorCount: errCount,
      warnings: warnCount,
      errorPreview: stderr.split('\n').slice(0, 10).join('\n'),
      raw: stderr,
    };
  },
};

const javac: BuildAdapter = {
  stack: 'java',
  label: 'mvn compile',
  command() {
    return ['mvn', '-q', 'compile'];
  },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/\[ERROR\]/g) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0,
      errorCount: errCount,
      warnings: 0,
      errorPreview: text
        .split('\n')
        .filter((l) => l.includes('[ERROR]'))
        .slice(0, 10)
        .join('\n'),
      raw: text,
    };
  },
};

const dotnetBuild: BuildAdapter = {
  stack: 'csharp',
  label: 'dotnet build',
  command() {
    return ['dotnet', 'build', '--nologo', '/clp:NoSummary'];
  },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/error\s+CS\d+:/g) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0,
      errorCount: errCount,
      warnings: 0,
      errorPreview: text
        .split('\n')
        .filter((l) => /error\s+CS/.test(l))
        .slice(0, 10)
        .join('\n'),
      raw: text,
    };
  },
};

const REGISTRY: Record<StackId, BuildAdapter> = {
  typescript: tsc,
  python: mypyRuff,
  go: goBuild,
  rust: cargoBuild,
  java: javac,
  csharp: dotnetBuild,
};

/** Look up the build adapter for a stack id. */
export function getBuildAdapter(stack: StackId): BuildAdapter {
  return REGISTRY[stack];
}

/** Default adapter used when stack detection fails — preserves backward compat. */
export const defaultBuildAdapter = tsc;
