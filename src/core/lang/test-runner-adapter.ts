// src/core/lang/test-runner-adapter.ts
//
// Six TestRunnerAdapter implementations (vitest, pytest, go test, cargo test,
// JUnit/maven, xUnit/dotnet) + factory + default.
//
// SECURITY: All commands are returned as `string[]` arrays — never shell strings —
// to comply with ADR-006 spawnSync security pattern. The single documented
// exception is the Python build adapter which uses `sh -c` (mypy + ruff
// composition); see build-adapter.ts and assertSpawnSafe in index.ts.

import type { StackId, TestRunnerAdapter } from './types.js';

const vitest: TestRunnerAdapter = {
  stack: 'typescript',
  label: 'vitest',
  command(opts) {
    const c = ['npx', 'vitest', 'run'];
    if (opts?.coverage) c.push('--coverage');
    if (opts?.filter) c.push('--testNamePattern', opts.filter);
    return c;
  },
  parse(stdout, stderr, exitCode) {
    // vitest summary lines: "Tests <N> passed (<T>)" / "Tests <N> failed".
    const passedMatch = stdout.match(/Tests\s+(\d+)\s+passed/);
    const failedMatch = stdout.match(/Tests\s+(\d+)\s+failed/);
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: passedMatch ? parseInt(passedMatch[1]!, 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]!, 10) : 0,
      skipped: 0,
      failedTests: [],
      raw: stdout + '\n' + stderr,
    };
  },
};

const pytest: TestRunnerAdapter = {
  stack: 'python',
  label: 'pytest',
  command(opts) {
    const c = ['pytest', '-q'];
    if (opts?.coverage) c.push('--cov', '--cov-report=xml');
    if (opts?.filter) c.push('-k', opts.filter);
    return c;
  },
  parse(stdout, _stderr, exitCode) {
    // pytest summary: "5 passed, 2 failed, 1 skipped in 0.42s" (any subset, in any order)
    const passed = matchInt(stdout, /(\d+)\s+passed/);
    const failed = matchInt(stdout, /(\d+)\s+failed/);
    const skipped = matchInt(stdout, /(\d+)\s+skipped/);
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed,
      failed,
      skipped,
      failedTests: [],
      raw: stdout,
    };
  },
};

const goTest: TestRunnerAdapter = {
  stack: 'go',
  label: 'go test',
  command(opts) {
    const c = ['go', 'test', './...'];
    if (opts?.coverage) c.push('-coverprofile=coverage.out');
    if (opts?.filter) c.push('-run', opts.filter);
    return c;
  },
  parse(stdout, _stderr, exitCode) {
    // Go output: "ok pkg/foo 0.1s" / "FAIL pkg/bar 0.2s" per package summary line.
    const failMatches = stdout.match(/^FAIL/gm) ?? [];
    const passMatches = stdout.match(/^ok/gm) ?? [];
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: passMatches.length,
      failed: failMatches.length,
      skipped: 0,
      failedTests: [],
      raw: stdout,
    };
  },
};

const cargoTest: TestRunnerAdapter = {
  stack: 'rust',
  label: 'cargo test',
  command(opts) {
    const c = ['cargo', 'test'];
    if (opts?.filter) c.push(opts.filter);
    return c;
  },
  parse(stdout, _stderr, exitCode) {
    // "test result: ok. 12 passed; 0 failed; 1 ignored;"
    const m = stdout.match(/test result: \w+\.\s+(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/);
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: m ? parseInt(m[1]!, 10) : 0,
      failed: m ? parseInt(m[2]!, 10) : 0,
      skipped: m ? parseInt(m[3]!, 10) : 0,
      failedTests: [],
      raw: stdout,
    };
  },
};

const junit: TestRunnerAdapter = {
  stack: 'java',
  label: 'maven-surefire (JUnit)',
  command() {
    return ['mvn', '-q', 'test'];
  },
  parse(stdout, _stderr, exitCode) {
    // "Tests run: 12, Failures: 0, Errors: 0, Skipped: 1"
    const m = stdout.match(
      /Tests run:\s+(\d+),\s+Failures:\s+(\d+),\s+Errors:\s+(\d+),\s+Skipped:\s+(\d+)/,
    );
    const total = m ? parseInt(m[1]!, 10) : 0;
    const fail = m ? parseInt(m[2]!, 10) + parseInt(m[3]!, 10) : 0;
    const skip = m ? parseInt(m[4]!, 10) : 0;
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: total - fail - skip,
      failed: fail,
      skipped: skip,
      failedTests: [],
      raw: stdout,
    };
  },
};

const xunit: TestRunnerAdapter = {
  stack: 'csharp',
  label: 'dotnet test (xUnit)',
  command() {
    return ['dotnet', 'test', '--nologo'];
  },
  parse(stdout, _stderr, exitCode) {
    // "Failed: 0, Passed: 12, Skipped: 1, Total: 13"
    const m = stdout.match(
      /Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/,
    );
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: m ? parseInt(m[2]!, 10) : 0,
      failed: m ? parseInt(m[1]!, 10) : 0,
      skipped: m ? parseInt(m[3]!, 10) : 0,
      failedTests: [],
      raw: stdout,
    };
  },
};

const REGISTRY: Record<StackId, TestRunnerAdapter> = {
  typescript: vitest,
  python: pytest,
  go: goTest,
  rust: cargoTest,
  java: junit,
  csharp: xunit,
};

/** Look up the test-runner adapter for a stack id. */
export function getTestRunnerAdapter(stack: StackId): TestRunnerAdapter {
  return REGISTRY[stack];
}

/** Default adapter used when stack detection fails — preserves backward compat. */
export const defaultTestRunnerAdapter = vitest;

function matchInt(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? parseInt(m[1]!, 10) : 0;
}
