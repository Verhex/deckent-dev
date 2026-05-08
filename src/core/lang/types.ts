// src/core/lang/types.ts
//
// Multi-language adapter pattern types — Sprint 162A Bug B / ADR-047.
//
// Six baseline stacks: typescript, python, go, rust, java, csharp.
// All adapters speak `string[]` commands (ADR-006 spawnSync security pattern)
// and return strongly-typed Outcomes. The STACKS registry is append-only and
// static; new stacks are added via additional entries + 3 adapters.

import type { ProjectStack } from '../skill-types.js';

/** Canonical stack identifiers — 6 baseline stacks for Sprint 162A. */
export type StackId =
  | 'typescript' // tsc + vitest + v8 coverage
  | 'python'     // mypy/ruff + pytest + coverage.py
  | 'go'         // go build + go test + go cover
  | 'rust'       // cargo build + cargo test + cargo-tarpaulin
  | 'java'       // javac/maven + junit + jacoco
  | 'csharp';    // dotnet build + xunit + coverlet/opencover

/** Result of running a build/typecheck step. */
export interface BuildOutcome {
  success: boolean;
  durationMs: number;
  errorCount: number;
  warnings: number;
  /** First N error lines for debug output (truncated). */
  errorPreview: string;
  /** Optional full output. Adapters that capture it set this; callers must cap size at the spawn site. */
  raw?: string;
}

/** Result of running a test suite. */
export interface TestOutcome {
  success: boolean;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: string[];
  raw?: string;
}

/** Coverage extraction result. */
export interface CoverageOutcome {
  /** Line coverage 0–100 (rounded to 2 dp). */
  lineCoverage: number;
  /** Branch coverage 0–100 (rounded to 2 dp), -1 if not produced by stack. */
  branchCoverage: number;
  /** Format consumed (informational). */
  format: 'json' | 'xml' | 'lcov' | 'txt';
  /** Raw report path (informational; never used for I/O inside parse()). */
  reportPath: string;
}

/** Adapter that runs the test suite for a given stack. */
export interface TestRunnerAdapter {
  readonly stack: StackId;
  /** Display name, used in event labels and dashboard. */
  readonly label: string;
  /** Returns the canonical command line (string array — no shell). ADR-006 spawnSync. */
  command(opts?: { coverage?: boolean; filter?: string }): string[];
  /** Parse tool output → TestOutcome. Adapter-specific. */
  parse(stdout: string, stderr: string, exitCode: number): TestOutcome;
}

/** Adapter that extracts coverage from a stack-specific report. */
export interface CoverageAdapter {
  readonly stack: StackId;
  readonly label: string;
  /** Path glob(s) where the adapter expects to find a coverage report. */
  reportGlobs(): string[];
  /**
   * Read + parse the coverage report at `reportPath`.
   *
   * SECURITY: parse() is pure — never reads from disk. Caller is responsible
   * for resolving `reportPath` against `projectRoot` with a containment check
   * (`!resolved.startsWith(projectRoot)` → reject).
   */
  parse(reportContent: string, reportPath: string): CoverageOutcome | null;
}

/** Adapter that runs the typecheck/build step for a given stack. */
export interface BuildAdapter {
  readonly stack: StackId;
  readonly label: string;
  command(): string[];
  parse(stdout: string, stderr: string, exitCode: number): BuildOutcome;
}

/** Bundle of adapters for a single stack. */
export interface StackAdapters {
  testRunner: TestRunnerAdapter;
  coverage: CoverageAdapter;
  build: BuildAdapter;
}

/** Static registry entry for a known stack. */
export interface StackRegistryEntry {
  id: StackId;
  label: string;
  /** Files that, if present in projectRoot, indicate this stack. ALL must match (logical AND). */
  detectFiles: string[];
  /** Optional dependency name fragments looked up in package.json/etc. (logical OR with files). */
  detectDeps?: string[];
}

/** Static registry of known stacks. Append-only — never mutate at runtime. */
export const STACKS: ReadonlyArray<StackRegistryEntry> = [
  { id: 'typescript', label: 'TypeScript+vitest', detectFiles: ['package.json', 'tsconfig.json'], detectDeps: ['typescript'] },
  { id: 'python',     label: 'Python+pytest',     detectFiles: ['pyproject.toml'],                detectDeps: ['pytest'] },
  { id: 'go',         label: 'Go+go-test',        detectFiles: ['go.mod'] },
  { id: 'rust',       label: 'Rust+cargo-test',   detectFiles: ['Cargo.toml'] },
  { id: 'java',       label: 'Java+JUnit',        detectFiles: ['pom.xml'],                       detectDeps: ['junit'] },
  { id: 'csharp',     label: 'C#+xUnit',          detectFiles: ['*.csproj'],                      detectDeps: ['xunit'] },
];

/**
 * Map ProjectStack.language → StackId. Centralized so callers don't ad-hoc map.
 * Returns null when the language is unknown to the lang adapter pattern; caller
 * is expected to fall back to the default TypeScript adapter for backward compat.
 */
export function projectStackToStackId(stack: ProjectStack): StackId | null {
  switch (stack.language) {
    case 'typescript': return 'typescript';
    case 'javascript': return 'typescript'; // JS shares vitest tooling
    case 'python':     return 'python';
    case 'go':         return 'go';
    case 'rust':       return 'rust';
    case 'java':
    case 'kotlin':     return 'java'; // share JVM ecosystem
    case 'csharp':     return 'csharp';
    default: return null;
  }
}
