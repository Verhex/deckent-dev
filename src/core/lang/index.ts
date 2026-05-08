// src/core/lang/index.ts
//
// Public surface for the multi-language adapter system. Single import path
// for consumers (result-evaluator.ts, future worker verify loop, dashboard).
//
// SECURITY: `assertSpawnSafe` is the single guard for adapter command output.
// Every spawn site that consumes adapter `command()` results MUST call
// `assertSpawnSafe(cmd)` before invoking spawnSync. The whitelist enforces
// ADR-006 and constrains the documented `sh -c` exception (mypy + ruff).

export type {
  StackId,
  BuildOutcome,
  TestOutcome,
  CoverageOutcome,
  TestRunnerAdapter,
  CoverageAdapter,
  BuildAdapter,
  StackAdapters,
  StackRegistryEntry,
} from './types.js';

export { STACKS, projectStackToStackId } from './types.js';
export { detectStack } from './stack-detector.js';
export {
  getTestRunnerAdapter,
  defaultTestRunnerAdapter,
} from './test-runner-adapter.js';
export {
  getCoverageAdapter,
  defaultCoverageAdapter,
} from './coverage-adapter.js';
export { getBuildAdapter, defaultBuildAdapter } from './build-adapter.js';

import { getBuildAdapter as gB } from './build-adapter.js';
import { getCoverageAdapter as gC } from './coverage-adapter.js';
import { getTestRunnerAdapter as gT } from './test-runner-adapter.js';
import type { StackAdapters, StackId } from './types.js';

/** Convenience: bundle all three adapters for a stack. */
export function getStackAdapters(stack: StackId): StackAdapters {
  return { testRunner: gT(stack), coverage: gC(stack), build: gB(stack) };
}

// ─── Spawn safety guard (ADR-006) ──────────────────────────────────────

/**
 * Whitelisted first-element binaries for adapter `command()` output.
 * Any new adapter MUST add its binary here AND update `assertSpawnSafe`
 * tests in `tests/core/lang/build-adapter.test.ts`.
 */
const ADAPTER_BIN_WHITELIST = new Set<string>([
  'npx',
  'pytest',
  'go',
  'cargo',
  'mvn',
  'dotnet',
  'sh',
]);

/**
 * Allowed `sh -c` payload — strictly mypy + ruff composition.
 * Anything else is rejected. This protects against accidental or malicious
 * adapter substitution at runtime.
 *
 * Path argument tokens use `[^\s&|;<>`$]+` (no shell metacharacters allowed
 * inside individual args). Exactly two binaries (`mypy` … `&& ruff check` …)
 * connected by a single `&&` are accepted; trailing `&& <anything>` is rejected.
 */
const SAFE_ARG = String.raw`[^\s&|;<>\x60$]+`;
const SH_C_ALLOWED = new RegExp(
  `^mypy(\\s+${SAFE_ARG})*\\s+&&\\s+ruff\\s+check(\\s+${SAFE_ARG})*$`,
);

/**
 * Assert that a command array is safe to spawn under ADR-006.
 *
 * Rules:
 *  - Non-empty array.
 *  - First element MUST be in the binary whitelist.
 *  - For `sh`, exactly `['sh', '-c', <payload>]` form is accepted, and the
 *    payload MUST match the mypy+ruff regex.
 *
 * Throws Error on violation. Callers (spawn sites) call this before spawnSync.
 */
export function assertSpawnSafe(cmd: string[]): void {
  if (!Array.isArray(cmd) || cmd.length === 0) {
    throw new Error('assertSpawnSafe: empty command');
  }
  const bin = cmd[0]!;
  if (!ADAPTER_BIN_WHITELIST.has(bin)) {
    throw new Error(`assertSpawnSafe: disallowed binary: ${bin}`);
  }
  if (bin === 'sh') {
    if (cmd.length !== 3 || cmd[1] !== '-c') {
      throw new Error('assertSpawnSafe: sh requires exactly -c <script>');
    }
    if (!SH_C_ALLOWED.test(cmd[2]!)) {
      throw new Error(`assertSpawnSafe: disallowed sh -c payload: ${cmd[2]}`);
    }
  }
}

/** Read-only view of the binary whitelist (test introspection). */
export function getAdapterBinaryWhitelist(): ReadonlySet<string> {
  return ADAPTER_BIN_WHITELIST;
}
