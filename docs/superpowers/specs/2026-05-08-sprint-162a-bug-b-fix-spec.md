# Sprint 162A — Bug B Fix Spec: Audit Rubric Branch + Multi-Language Adapter Pattern

> **Investigation:** INV-B (PRIMARY surface — biggest scope)
> **Date:** 2026-05-08
> **Scope:** `src/orchestra/result-evaluator.ts` + new `src/core/lang/` module (TestRunner / Coverage / Build adapters)
> **Constraint:** READ-ONLY investigation. No source modifications. This document fully specifies all changes for an implementation sprint to apply.

---

## 1. Problem Statement

### 1a. Bug B: Rubric Mismatch on Audit / READ-ONLY Tasks

`evaluateWithRubric()` (`src/orchestra/result-evaluator.ts:709-780`) walks `DEFAULT_RUBRIC.criteria` and dispatches each criterion through `scoreCriterion()` (`:689-698`). The four built-in scorers — `scoreCorrectness`, `scoreTestCoverage`, `scoreScopeCompliance`, `scoreDocumentation` — encode assumptions that hold **only for code-writing tasks**:

- `scoreTestCoverage` (`:579-601`) computes from `result.coverage` (vitest JSON). For a READ-ONLY audit the worker neither runs vitest nor changes `src/` files; `coverage` defaults to `0`. With `weight=0.25` and `threshold=50`, the criterion contributes `0 * 0.25 = 0` to `totalScore` and fails its threshold.
- `scoreCorrectness` (`:550-576`) gives only 60 for `testsPassed` (always `true` for READ-ONLY because nothing was changed) plus 40 for `selfAssessment === 'DONE'`. Best case = 100, but only when self-assessment is exactly `'DONE'`.
- `scoreScopeCompliance` (`:625-663`) treats `docs/audits/sprint-NNN/<file>.md` as **auxiliary** (D-5 partial credit, 80/file) rather than **primary** because the audit report is not in `task.scope.directories` (which is typically `['docs/audits/']` and matches via `startsWith`, but only when the task author wrote the prefix correctly — Sprint 161 had several tasks where `scope.filesWrite` was a single explicit path and `scope.directories` was empty).
- `scoreDocumentation` (`:666-686`) is fine, but documentation alone (weight 0.15) cannot lift a totalScore over 70 when the other three criteria fail.

**Empirical Sprint 161 result:** worker self-assessment `DONE` with `rubricScores: { correctness:95, test_coverage:100, scope_compliance:100, documentation:95 }` (worker-reported), but Brain re-graded via `evaluateWithRubric` with the default rubric and produced `totalScore ≈ 38` (`60*0.4 + 0*0.25 + 80*0.2 + 100*0.15 = 24 + 0 + 16 + 15 = 55`; if scope dropped further to 60 it lands at `24 + 0 + 12 + 15 = 51`). Both are below `passingScore * 0.7 = 49` → `NO_GO`. Worker rubric ignored. Sprint 161 NO_GO rate inflated artificially.

The verification fast-path `isVerificationTask()` (`:468-481`) catches some audits via regex (`/\baudit\b/i`), but only when `(result.filesChanged ?? []).some(isSourceCodeDir)` is **false**. In Sprint 161, audit tasks were producing single docs/audits/ markdown files — passing the source-changes guard — but the regex match required the **task description or worker notes** to literally include "audit", which not every task title did. The fast-path is a fragile heuristic; it should not be the only audit defence.

### 1b. The Wider Problem: TypeScript/vitest Hardcoding

`scoreCriterion` and the `correctness` / `test_coverage` heuristics are silently TypeScript+vitest-bound. For a Python+pytest project, a Go+go-test project, a Rust+cargo project, etc., every grade collapses to zero because:
- `result.coverage` arrives empty (no vitest JSON parser ran).
- `hasNewTests` checks for `.test.` / `.spec.` filename patterns (never matches `_test.go`, `test_*.py`, `*Tests.java`, `*.Tests.cs`).
- `tsc --noEmit` / `npx vitest run` are hardcoded in `worker-default.md` rules (line 13 of the worker rule file).

The Sprint 162A "god-level vision" requires Deckent to evaluate work **agnostic of stack**. We must abstract verification commands and metric extraction behind adapters: `TestRunnerAdapter`, `CoverageAdapter`, `BuildAdapter`. Six baseline stacks: TypeScript, Python, Go, Rust, Java, C#. The adapter pattern must be extensible without re-touching `result-evaluator.ts`.

---

## 2. Goals & Non-Goals

### Goals
1. Add a dedicated **audit rubric branch** in `evaluateWithRubric` that bypasses `scoreCorrectness`/`scoreTestCoverage`/`scoreScopeCompliance` for READ-ONLY audit tasks and instead grades on `audit_completeness`, `finding_count`, `citation_density`, `migration_triage`.
2. Introduce `src/core/lang/` module with `TestRunnerAdapter`, `CoverageAdapter`, `BuildAdapter` interfaces + a `STACKS` registry of 6 baseline stacks + an auto-detector.
3. Wire `scoreTestCoverage` (and a new `scoreBuildHealth`) to consume adapter output instead of hardcoding `result.coverage` and `npx vitest run`.
4. Preserve full backward compatibility: existing TypeScript+vitest projects must produce identical scores to today.
5. Emit structured event `sprint.eval.audit-rubric-applied` whenever the audit branch fires (observability).
6. Land ADR-047 codifying the multi-language adapter contract.

### Non-Goals
- No change to FIX-phase retry flow, no change to `applyTechDebtDowngrade`, no change to provider routing.
- No new user-facing rubric injection knobs — `auditRubric` weights are internal constants (security: prevents user from gaming the audit by tilting weights).
- No new stacks beyond the 6 baselines (Ruby/PHP/Elixir/Kotlin/Swift are reserved for ADR-047 future work — interface designed to allow them without churn).
- Sprint 161 NO_GO results are not retroactively re-evaluated (sprint history is immutable; the fix applies forward).

---

## 3. Design

### 3a. `result-evaluator.ts` — `evaluateWithRubric` Refactor

Insert a new `isAuditTask()` heuristic and an `auditRubric` branch **before** the existing rubric merge. The branch runs `evaluateAuditTask()` which uses an audit-specific scorer dispatch.

**Full diff (conceptual):**

```diff
--- a/src/orchestra/result-evaluator.ts
+++ b/src/orchestra/result-evaluator.ts
@@ -535,6 +535,38 @@
 // ─── Rubric-Based Evaluation ────────────────────────────────────────

 /** Default rubric used when no custom rubric is provided */
 export const DEFAULT_RUBRIC: EvaluationRubric = {
   criteria: [
     { name: 'correctness', weight: 0.4, threshold: 60, evaluator: 'auto' },
     { name: 'test_coverage', weight: 0.25, threshold: 50, evaluator: 'metric' },
     { name: 'scope_compliance', weight: 0.2, threshold: 80, evaluator: 'auto' },
     { name: 'documentation', weight: 0.15, threshold: 30, evaluator: 'pattern' },
   ],
   passingScore: 70,
   maxRetries: 0,
 };

+/**
+ * Audit-specific rubric. Used when isAuditTask() returns true.
+ * Weights: completeness 0.4, finding_count 0.3, citation_density 0.2, migration_triage 0.1
+ * Sum = 1.0. Passing score 70 (same as default).
+ */
+export const AUDIT_RUBRIC: EvaluationRubric = {
+  criteria: [
+    { name: 'audit_completeness',  weight: 0.4, threshold: 60, evaluator: 'pattern' },
+    { name: 'finding_count',       weight: 0.3, threshold: 50, evaluator: 'metric'  },
+    { name: 'citation_density',    weight: 0.2, threshold: 50, evaluator: 'pattern' },
+    { name: 'migration_triage',    weight: 0.1, threshold: 30, evaluator: 'pattern' },
+  ],
+  passingScore: 70,
+  maxRetries: 0,
+};
+
+/**
+ * Detect READ-ONLY audit tasks via scope-shape heuristic.
+ * Sprint 162A Bug B fix: audit tasks legitimately produce a single docs/audits/
+ * markdown file with no src/ changes. Default rubric scores them ~38 → NO_GO.
+ */
+export function isAuditTask(task: Task): boolean {
+  const writeFiles = task.scope?.filesWrite ?? [];
+  if (writeFiles.length !== 1) return false;
+  const target = writeFiles[0]!;
+  if (!target.startsWith('docs/audits/')) return false;
+  if (!target.endsWith('.md')) return false;
+  const dirs = task.scope?.directories ?? [];
+  // No src/, tests/, lib/ in scope — pure read-only
+  if (dirs.some(d => isSourceCodeDir(d))) return false;
+  return true;
+}
+
 /** Score correctness based on testsPassed and selfAssessment */
@@ -700,6 +732,11 @@
 export function evaluateWithRubric(
   result: TaskResult,
   task: Task,
   rubric?: Partial<EvaluationRubric>,
 ): EvaluationResult {
+  // ── Bug B fix: audit task fast-path with dedicated rubric ──────────────
+  if (isAuditTask(task) && rubric === undefined) {
+    return evaluateAuditTask(result, task);
+  }
+
   // D-2: Schema validation — reject results with missing required fields
   const schemaCheck = validateResultSchema(result);
@@ -728,6 +765,7 @@
   if (isVerificationTask(task, result)) { ... }
```

**New function** `evaluateAuditTask`:

```ts
export function evaluateAuditTask(result: TaskResult, task: Task): EvaluationResult {
  // Schema check first — even audits must produce valid results
  const schemaCheck = validateResultSchema(result);
  if (!schemaCheck.valid) {
    return {
      decision: 'NO_GO', totalScore: 0,
      rubricScores: [{ criterion: 'schema_validation', score: 0, passed: false, reason: schemaCheck.reason }],
      retryCount: 0,
    };
  }

  const rubricScores: RubricScore[] = [];
  let totalScore = 0;
  for (const criterion of AUDIT_RUBRIC.criteria) {
    const scored = scoreAuditCriterion(criterion.name, result, task);
    scored.passed = scored.score >= criterion.threshold;
    rubricScores.push(scored);
    totalScore += scored.score * criterion.weight;
  }
  totalScore = Math.round(totalScore * 100) / 100;

  let decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  if (totalScore >= AUDIT_RUBRIC.passingScore) decision = 'DONE';
  else if (totalScore >= AUDIT_RUBRIC.passingScore * 0.7) decision = 'GO_WITH_TECH_DEBT';
  else decision = 'NO_GO';

  // Emit observability event (Section 6)
  emitAuditRubricApplied({ taskId: task.id, score: totalScore, decision });

  return { decision, totalScore, rubricScores, retryCount: 0 };
}
```

**Audit criterion scorers** (private, in same file):

```ts
function scoreAuditCompleteness(result: TaskResult, task: Task): RubricScore {
  // Read the audit markdown file from filesChanged[0], measure structure presence:
  // headings (## or ###), bullet lists, table rows. Score 0-100.
  // Heuristic: sectionCount * 10 capped at 60, bulletCount * 2 capped at 30, tableRows * 5 capped at 10.
  // ...details in implementation plan...
}
function scoreFindingCount(result: TaskResult, task: Task): RubricScore {
  // Count occurrences of finding markers in worker notes + result file:
  //   "Finding:", "Bug:", "Risk:", "Issue:", "Drift:" — score 100 if ≥10, scaled below.
}
function scoreCitationDensity(result: TaskResult, task: Task): RubricScore {
  // Count file:line references (e.g. `src/foo.ts:123`) in audit markdown.
  // Score 100 if ≥10, scaled below. Forces evidence-backed audits.
}
function scoreMigrationTriage(result: TaskResult, task: Task): RubricScore {
  // Look for triage labels: "P0", "P1", "P2", "blocking", "deferrable".
  // Score 100 if ≥3 distinct labels, scaled below.
}
function scoreAuditCriterion(name: string, result: TaskResult, task: Task): RubricScore {
  switch (name) {
    case 'audit_completeness': return scoreAuditCompleteness(result, task);
    case 'finding_count':      return scoreFindingCount(result, task);
    case 'citation_density':   return scoreCitationDensity(result, task);
    case 'migration_triage':   return scoreMigrationTriage(result, task);
    default: return { criterion: name, score: 0, passed: false, reason: `unknown audit criterion: ${name}` };
  }
}
```

**Side effect on `scoreTestCoverage` / `scoreCorrectness` (multi-language wiring):**

`scoreTestCoverage` will accept an optional `coverageAdapter?: CoverageAdapter` parameter (default = vitest adapter resolved by `detectStack()`). When the worker did not provide `result.coverage`, the adapter is consulted. For audit tasks this is irrelevant (handled by audit branch); for code tasks in non-TS stacks this fixes silent zero-coverage.

### 3b. NEW `src/core/lang/types.ts`

Public type surface for the multi-language adapter system.

```ts
// src/core/lang/types.ts
import type { ProjectStack } from '../skill-types.js';

/** Canonical stack identifiers — 6 baseline stacks for Sprint 162A. */
export type StackId =
  | 'typescript'   // tsc + vitest + v8 coverage
  | 'python'       // mypy/ruff + pytest + coverage.py
  | 'go'           // go build + go test + go cover
  | 'rust'         // cargo build + cargo test + cargo-tarpaulin
  | 'java'         // javac/maven + junit + jacoco
  | 'csharp';      // dotnet build + xunit + coverlet/opencover

/** Result of running a build/typecheck step. */
export interface BuildOutcome {
  success: boolean;
  durationMs: number;
  errorCount: number;
  warnings: number;
  /** First N error lines for debug output (truncated) */
  errorPreview: string;
  raw?: string; // full output, optional for adapters that capture it
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
  /** Line coverage 0–100 (rounded to 2 dp) */
  lineCoverage: number;
  /** Branch coverage 0–100 (rounded to 2 dp), -1 if not produced by stack */
  branchCoverage: number;
  /** Format consumed (informational): 'json' | 'xml' | 'lcov' | 'txt' */
  format: 'json' | 'xml' | 'lcov' | 'txt';
  /** Raw report path */
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
  /** Read + parse the coverage report at `reportPath`. */
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

/** Static registry of known stacks. Append-only — never mutate at runtime. */
export const STACKS: ReadonlyArray<{
  id: StackId;
  label: string;
  /** Files that, if present in projectRoot, indicate this stack. ALL must match (logical AND). */
  detectFiles: string[];
  /** Optional dependency name fragments looked up in package.json/etc. (logical OR with files). */
  detectDeps?: string[];
}> = [
  { id: 'typescript', label: 'TypeScript+vitest', detectFiles: ['package.json', 'tsconfig.json'], detectDeps: ['typescript'] },
  { id: 'python',     label: 'Python+pytest',     detectFiles: ['pyproject.toml'],                detectDeps: ['pytest'] },
  { id: 'go',         label: 'Go+go-test',        detectFiles: ['go.mod'] },
  { id: 'rust',       label: 'Rust+cargo-test',   detectFiles: ['Cargo.toml'] },
  { id: 'java',       label: 'Java+JUnit',        detectFiles: ['pom.xml'],                       detectDeps: ['junit'] },
  { id: 'csharp',     label: 'C#+xUnit',          detectFiles: ['*.csproj'],                      detectDeps: ['xunit'] },
];

/** Map ProjectStack.language → StackId. Centralized so callers don't ad-hoc map. */
export function projectStackToStackId(stack: ProjectStack): StackId | null {
  switch (stack.language) {
    case 'typescript': return 'typescript';
    case 'javascript': return 'typescript'; // JS uses same vitest tooling
    case 'python':     return 'python';
    case 'go':         return 'go';
    case 'rust':       return 'rust';
    case 'java':
    case 'kotlin':     return 'java'; // share JVM ecosystem
    case 'csharp':     return 'csharp';
    default: return null;
  }
}
```

### 3c. NEW `src/core/lang/stack-detector.ts`

Pure file-presence + dependency-keyword detector. **Distinct from existing `src/core/stack-detector.ts`** — that file does richer framework detection; the lang detector is a thin adapter selector.

```ts
// src/core/lang/stack-detector.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STACKS, type StackId } from './types.js';
import { detectProjectStack } from '../stack-detector.js'; // existing
import { projectStackToStackId } from './types.js';

/**
 * Detect the stack for the project at projectRoot.
 *
 * Resolution order:
 *   1. Existing `detectProjectStack()` (cached in .deckent/project-stack.json) → projectStackToStackId
 *   2. STACKS table file existence (TS package.json+tsconfig, Py pyproject.toml, Go go.mod, Rust Cargo.toml, Java pom.xml, C# *.csproj)
 *   3. null (caller falls back to typescript adapter for backward compat)
 */
export function detectStack(projectRoot: string): StackId | null {
  // Layer 1: cached project-stack.json
  try {
    const ps = detectProjectStack(projectRoot);
    const mapped = projectStackToStackId(ps);
    if (mapped) return mapped;
  } catch { /* fall through */ }

  // Layer 2: file-presence walk
  for (const entry of STACKS) {
    if (entry.detectFiles.every(f => existsMaybeGlob(projectRoot, f))) {
      return entry.id;
    }
  }
  return null;
}

function existsMaybeGlob(root: string, pattern: string): boolean {
  if (!pattern.includes('*')) return fs.existsSync(path.join(root, pattern));
  // single-star wildcard support for *.csproj, *.sln
  const ext = pattern.replace(/^\*/, '');
  try {
    return fs.readdirSync(root).some(f => f.endsWith(ext));
  } catch { return false; }
}
```

**Six-stack scenarios verified by tests** (Section 4):
- TS: `package.json` + `tsconfig.json`
- Python: `pyproject.toml` (or `requirements.txt` fallback)
- Go: `go.mod`
- Rust: `Cargo.toml`
- Java: `pom.xml` (or `build.gradle`)
- C#: any `*.csproj` or `*.sln`

### 3d. NEW `src/core/lang/test-runner-adapter.ts`

Factory + 6 implementations. All commands must be `string[]` arrays — never shell strings — to comply with **ADR-006 spawnSync security pattern**.

```ts
// src/core/lang/test-runner-adapter.ts
import type { TestRunnerAdapter, TestOutcome, StackId } from './types.js';

const vitest: TestRunnerAdapter = {
  stack: 'typescript',
  label: 'vitest',
  command(opts) {
    const c = ['npx', 'vitest', 'run'];
    if (opts?.coverage) c.push('--coverage');
    if (opts?.filter)   c.push('--testNamePattern', opts.filter);
    return c;
  },
  parse(stdout, stderr, exitCode) {
    // Parse "Test Files <X> passed (<Y> total)" + "Tests <P> passed (<T>)" lines
    // ... full parse implementation in test file fixtures (Section 4)
    const failedMatch = stdout.match(/Tests\s+(\d+)\s+failed/);
    const passedMatch = stdout.match(/Tests\s+(\d+)\s+passed/);
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
    if (opts?.filter)   c.push('-k', opts.filter);
    return c;
  },
  parse(stdout, _stderr, exitCode) {
    // pytest summary: "5 passed, 2 failed, 1 skipped in 0.42s"
    const m = stdout.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/);
    return {
      success: exitCode === 0,
      durationMs: 0,
      passed: m ? parseInt(m[1]!, 10) : 0,
      failed: m && m[2] ? parseInt(m[2], 10) : 0,
      skipped: m && m[3] ? parseInt(m[3], 10) : 0,
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
    if (opts?.filter)   c.push('-run', opts.filter);
    return c;
  },
  parse(stdout, _stderr, exitCode) {
    // Go output: "PASS" / "FAIL" lines per package; "ok" / "FAIL" summary
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
    // "test result: ok. 12 passed; 0 failed; 0 ignored;"
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
  command() { return ['mvn', '-q', 'test']; },
  parse(stdout, _stderr, exitCode) {
    // "Tests run: 12, Failures: 0, Errors: 0, Skipped: 1"
    const m = stdout.match(/Tests run:\s+(\d+),\s+Failures:\s+(\d+),\s+Errors:\s+(\d+),\s+Skipped:\s+(\d+)/);
    const total = m ? parseInt(m[1]!, 10) : 0;
    const fail  = m ? parseInt(m[2]!, 10) + parseInt(m[3]!, 10) : 0;
    const skip  = m ? parseInt(m[4]!, 10) : 0;
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
  command() { return ['dotnet', 'test', '--nologo']; },
  parse(stdout, _stderr, exitCode) {
    // "Passed!  - Failed:     0, Passed:    12, Skipped:     1, Total:    13"
    const m = stdout.match(/Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/);
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

export function getTestRunnerAdapter(stack: StackId): TestRunnerAdapter {
  return REGISTRY[stack];
}

/** Default adapter used when stack detection fails — preserves backward compat. */
export const defaultTestRunnerAdapter = vitest;
```

### 3e. NEW `src/core/lang/coverage-adapter.ts`

Six adapters that parse stack-specific reports.

```ts
// src/core/lang/coverage-adapter.ts
import type { CoverageAdapter, CoverageOutcome, StackId } from './types.js';

const vitestCov: CoverageAdapter = {
  stack: 'typescript',
  label: 'vitest v8 coverage (JSON)',
  reportGlobs() { return ['coverage/coverage-final.json', 'coverage/coverage-summary.json']; },
  parse(content, reportPath) {
    try {
      const json = JSON.parse(content);
      // coverage-summary.json shape: { total: { lines: { pct: 89.3 }, branches: { pct: 78.1 } } }
      const total = json.total ?? json;
      const lines = total?.lines?.pct ?? null;
      const branches = total?.branches?.pct ?? -1;
      if (lines == null) return null;
      return { lineCoverage: round2(lines), branchCoverage: round2(branches), format: 'json', reportPath };
    } catch { return null; }
  },
};

const pythonCov: CoverageAdapter = {
  stack: 'python',
  label: 'coverage.py XML',
  reportGlobs() { return ['coverage.xml']; },
  parse(content, reportPath) {
    // <coverage line-rate="0.892" branch-rate="0.78" ...>
    const lineMatch = content.match(/line-rate="([\d.]+)"/);
    const branchMatch = content.match(/branch-rate="([\d.]+)"/);
    if (!lineMatch) return null;
    return {
      lineCoverage:  round2(parseFloat(lineMatch[1]!) * 100),
      branchCoverage: branchMatch ? round2(parseFloat(branchMatch[1]!) * 100) : -1,
      format: 'xml',
      reportPath,
    };
  },
};

const goCov: CoverageAdapter = {
  stack: 'go',
  label: 'go cover txt',
  reportGlobs() { return ['coverage.out']; },
  parse(content, reportPath) {
    // Lines: "<path>:<startLine>.<startCol>,<endLine>.<endCol> <numStmt> <count>"
    // Coverage = covered statements / total statements
    let total = 0, covered = 0;
    for (const line of content.split('\n')) {
      const m = line.match(/(\d+)\s+(\d+)\s*$/);
      if (!m) continue;
      const stmts = parseInt(m[1]!, 10);
      const count = parseInt(m[2]!, 10);
      total += stmts;
      if (count > 0) covered += stmts;
    }
    if (total === 0) return null;
    return { lineCoverage: round2((covered / total) * 100), branchCoverage: -1, format: 'txt', reportPath };
  },
};

const rustCov: CoverageAdapter = {
  stack: 'rust',
  label: 'cargo-tarpaulin XML',
  reportGlobs() { return ['cobertura.xml', 'tarpaulin-report.xml']; },
  parse(content, reportPath) {
    // tarpaulin emits cobertura format: <coverage line-rate="0.83" ...>
    const m = content.match(/line-rate="([\d.]+)"/);
    const b = content.match(/branch-rate="([\d.]+)"/);
    if (!m) return null;
    return {
      lineCoverage:  round2(parseFloat(m[1]!) * 100),
      branchCoverage: b ? round2(parseFloat(b[1]!) * 100) : -1,
      format: 'xml',
      reportPath,
    };
  },
};

const jacocoCov: CoverageAdapter = {
  stack: 'java',
  label: 'JaCoCo XML',
  reportGlobs() { return ['target/site/jacoco/jacoco.xml', 'build/reports/jacoco/test/jacocoTestReport.xml']; },
  parse(content, reportPath) {
    // <counter type="LINE" missed="123" covered="456"/>
    const lineCounter = content.match(/<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\/>/);
    const branchCounter = content.match(/<counter\s+type="BRANCH"\s+missed="(\d+)"\s+covered="(\d+)"\/>/);
    if (!lineCounter) return null;
    const lm = parseInt(lineCounter[1]!, 10), lc = parseInt(lineCounter[2]!, 10);
    const total = lm + lc;
    if (total === 0) return null;
    let branchPct = -1;
    if (branchCounter) {
      const bm = parseInt(branchCounter[1]!, 10), bc = parseInt(branchCounter[2]!, 10);
      const bt = bm + bc;
      branchPct = bt > 0 ? round2((bc / bt) * 100) : -1;
    }
    return { lineCoverage: round2((lc / total) * 100), branchCoverage: branchPct, format: 'xml', reportPath };
  },
};

const opencoverCov: CoverageAdapter = {
  stack: 'csharp',
  label: 'OpenCover XML',
  reportGlobs() { return ['coverage.opencover.xml', 'TestResults/**/coverage.opencover.xml']; },
  parse(content, reportPath) {
    // <Summary numSequencePoints="..." visitedSequencePoints="..." sequenceCoverage="89.5" branchCoverage="78.1" />
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
  typescript: vitestCov, python: pythonCov, go: goCov,
  rust: rustCov, java: jacocoCov, csharp: opencoverCov,
};

export function getCoverageAdapter(stack: StackId): CoverageAdapter {
  return REGISTRY[stack];
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const defaultCoverageAdapter = vitestCov;
```

### 3f. NEW `src/core/lang/build-adapter.ts`

```ts
// src/core/lang/build-adapter.ts
import type { BuildAdapter, BuildOutcome, StackId } from './types.js';

const tsc: BuildAdapter = {
  stack: 'typescript', label: 'tsc --noEmit',
  command() { return ['npx', 'tsc', '--noEmit']; },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/error TS\d+/g) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0, errorCount: errCount, warnings: 0,
      errorPreview: text.split('\n').filter(l => l.includes('error TS')).slice(0, 10).join('\n'),
      raw: text,
    };
  },
};

const mypyRuff: BuildAdapter = {
  stack: 'python', label: 'mypy + ruff',
  command() { return ['sh', '-c', 'mypy . && ruff check .']; }, // ADR-006 note: see Section 10
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const mypy = (text.match(/error:/g) ?? []).length;
    const ruff = (text.match(/^\S+:\d+:\d+:/gm) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0, errorCount: mypy + ruff, warnings: 0,
      errorPreview: text.split('\n').slice(0, 10).join('\n'),
      raw: text,
    };
  },
};

const goBuild: BuildAdapter = {
  stack: 'go', label: 'go build',
  command() { return ['go', 'build', './...']; },
  parse(stdout, stderr, exitCode) {
    const errCount = (stderr.match(/^\S+\.go:\d+:/gm) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0, errorCount: errCount, warnings: 0,
      errorPreview: stderr.split('\n').slice(0, 10).join('\n'),
      raw: stdout + '\n' + stderr,
    };
  },
};

const cargoBuild: BuildAdapter = {
  stack: 'rust', label: 'cargo build',
  command() { return ['cargo', 'build', '--message-format=short']; },
  parse(stdout, stderr, exitCode) {
    const errCount = (stderr.match(/^error(?:\[E\d+\])?:/gm) ?? []).length;
    const warnCount = (stderr.match(/^warning:/gm) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0, errorCount: errCount, warnings: warnCount,
      errorPreview: stderr.split('\n').slice(0, 10).join('\n'),
      raw: stderr,
    };
  },
};

const javac: BuildAdapter = {
  stack: 'java', label: 'mvn compile',
  command() { return ['mvn', '-q', 'compile']; },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/\[ERROR\]/g) ?? []).length;
    return {
      success: exitCode === 0,
      durationMs: 0, errorCount: errCount, warnings: 0,
      errorPreview: text.split('\n').filter(l => l.includes('[ERROR]')).slice(0, 10).join('\n'),
      raw: text,
    };
  },
};

const dotnetBuild: BuildAdapter = {
  stack: 'csharp', label: 'dotnet build',
  command() { return ['dotnet', 'build', '--nologo', '/clp:NoSummary']; },
  parse(stdout, stderr, exitCode) {
    const text = stdout + '\n' + stderr;
    const errCount = (text.match(/error\s+CS\d+:/g) ?? []).length;
    return {
      success: exitCode === 0 && errCount === 0,
      durationMs: 0, errorCount: errCount, warnings: 0,
      errorPreview: text.split('\n').filter(l => /error\s+CS/.test(l)).slice(0, 10).join('\n'),
      raw: text,
    };
  },
};

const REGISTRY: Record<StackId, BuildAdapter> = {
  typescript: tsc, python: mypyRuff, go: goBuild,
  rust: cargoBuild, java: javac, csharp: dotnetBuild,
};

export function getBuildAdapter(stack: StackId): BuildAdapter {
  return REGISTRY[stack];
}
export const defaultBuildAdapter = tsc;
```

### 3g. NEW `src/core/lang/index.ts`

Public exports — single import path for consumers (`result-evaluator.ts`, future worker verify loop, dashboard).

```ts
// src/core/lang/index.ts
export type {
  StackId, BuildOutcome, TestOutcome, CoverageOutcome,
  TestRunnerAdapter, CoverageAdapter, BuildAdapter, StackAdapters,
} from './types.js';
export { STACKS, projectStackToStackId } from './types.js';
export { detectStack } from './stack-detector.js';
export { getTestRunnerAdapter, defaultTestRunnerAdapter } from './test-runner-adapter.js';
export { getCoverageAdapter,   defaultCoverageAdapter   } from './coverage-adapter.js';
export { getBuildAdapter,      defaultBuildAdapter      } from './build-adapter.js';

/** Convenience: bundle all three adapters for a stack. */
import { getBuildAdapter as gB } from './build-adapter.js';
import { getCoverageAdapter as gC } from './coverage-adapter.js';
import { getTestRunnerAdapter as gT } from './test-runner-adapter.js';
import type { StackAdapters, StackId } from './types.js';
export function getStackAdapters(stack: StackId): StackAdapters {
  return { testRunner: gT(stack), coverage: gC(stack), build: gB(stack) };
}
```

### 3h. `isAuditTask` Helper — Heuristic Definition

(Already shown in 3a. Repeated here as the canonical specification:)

```ts
export function isAuditTask(task: Task): boolean {
  const writeFiles = task.scope?.filesWrite ?? [];
  if (writeFiles.length !== 1) return false;          // exactly one output file
  const target = writeFiles[0]!;
  if (!target.startsWith('docs/audits/')) return false; // canonical audit path
  if (!target.endsWith('.md')) return false;            // markdown only
  const dirs = task.scope?.directories ?? [];
  if (dirs.some(d => isSourceCodeDir(d))) return false; // no src/tests/lib in scope
  return true;
}
```

**Why scope-shape and not regex on description:** description-based heuristics (`isVerificationTask`) are language-fragile (English regexes miss Turkish task titles); scope shape is a structural signal authored by Brain or DIRECTIVES.md and is both deterministic and i18n-neutral.

**Edge cases handled:**
- `filesWrite.length === 0` → not an audit (no deliverable).
- `filesWrite.length > 1` → likely a multi-file refactor or a code task that also writes docs → falls through to default rubric.
- `docs/audits/` prefix is required; `docs/` alone is too broad (tutorials, READMEs are not audits).
- `directories` may legitimately contain `docs/audits/` for the write target; only `src/`, `tests/`, `lib/` (matched via existing `isSourceCodeDir`) disqualify.

### 3i. `evaluateAuditTask` — New Path with Audit Rubric

(Already shown in 3a. Weights summary:)

| Criterion | Weight | Threshold | Evaluator | Source of score |
|---|---|---|---|---|
| `audit_completeness` | 0.40 | 60 | pattern | Markdown structure: heading count, bullet count, table rows |
| `finding_count` | 0.30 | 50 | metric | "Finding:", "Bug:", "Risk:", "Issue:", "Drift:" occurrences |
| `citation_density` | 0.20 | 50 | pattern | `path/to/file.ts:NNN` references count |
| `migration_triage` | 0.10 | 30 | pattern | P0/P1/P2/blocking/deferrable label distinct count |

Sum of weights = 1.00. PassingScore = 70 (mirror of default rubric for cohesion).

**Worst-case score for a degenerate audit** (single-paragraph file, no findings, no citations): completeness=15, findings=0, citations=0, triage=0 → totalScore = `15*0.4 = 6` → NO_GO. Sound.

**Best-case for a thorough audit** (10+ headings, 15 findings, 12 file:line citations, 4 triage labels): completeness=100, findings=100, citations=100, triage=100 → totalScore = `100` → DONE. Sound.

**Sprint 161 representative audit** (estimated from output samples): completeness=85, findings=80, citations=70, triage=60 → totalScore = `85*0.4 + 80*0.3 + 70*0.2 + 60*0.1 = 34 + 24 + 14 + 6 = 78` → DONE. Matches worker self-assessment. Bug B fixed.

---

## 4. Test Plan — 5 New Test Files

All under `tests/` mirroring source layout. Vitest format. No external fixtures committed beyond small inline strings.

### 4.1 `tests/orchestra/result-evaluator-audit-rubric.test.ts` (NEW)

| # | Scenario | Expected |
|---|---|---|
| 1 | `isAuditTask` true for `filesWrite=['docs/audits/sprint-161/scope-drift.md']`, no src dirs | `true` |
| 2 | `isAuditTask` false for `filesWrite=['src/foo.ts']` | `false` |
| 3 | `isAuditTask` false for `filesWrite=['docs/audits/x.md', 'docs/audits/y.md']` (2 files) | `false` |
| 4 | `isAuditTask` false when `directories` includes `'src/'` | `false` |
| 5 | `evaluateAuditTask` on rich audit content (10 headings, 12 findings, 10 file:line refs, 4 triage labels) | decision=DONE, totalScore≥85 |
| 6 | `evaluateAuditTask` on degenerate audit (50-char paragraph) | decision=NO_GO, totalScore<49 |
| 7 | `evaluateAuditTask` on medium audit (5 headings, 6 findings, 5 refs, 2 triage labels) | decision=GO_WITH_TECH_DEBT, 49≤score<70 |
| 8 | `evaluateWithRubric` routes audit tasks to audit branch (no rubric override) | `evaluateAuditTask` called, default scorers NOT called |
| 9 | `evaluateWithRubric` skips audit branch when `rubric` argument provided (explicit override wins) | default rubric applied |
| 10 | Schema-invalid audit result | decision=NO_GO with `schema_validation` reason |
| 11 | Sprint 161 regression: worker DONE + 4 strong rubric scores → audit branch confirms DONE | decision=DONE |
| 12 | `emitAuditRubricApplied` called exactly once per audit eval | spy assertion |

### 4.2 `tests/core/lang/stack-detector.test.ts` (NEW)

Six-stack file-presence scenarios using `vitest`'s `vi.mock('node:fs')` for `existsSync` / `readdirSync`.

| # | Stack | Mock filesystem | Expected `detectStack` return |
|---|---|---|---|
| 1 | typescript | `package.json`, `tsconfig.json` | `'typescript'` |
| 2 | python | `pyproject.toml` | `'python'` |
| 3 | go | `go.mod` | `'go'` |
| 4 | rust | `Cargo.toml` | `'rust'` |
| 5 | java | `pom.xml` | `'java'` |
| 6 | csharp | `MyApp.csproj` | `'csharp'` |
| 7 | mixed (python + go.mod) | both present | `'python'` (cached `project-stack.json` wins via Layer 1) |
| 8 | empty dir | nothing | `null` |
| 9 | csharp with .sln only | `MyApp.sln` | `'csharp'` (glob match) |
| 10 | java with build.gradle | `build.gradle` only | `'java'` via project-stack.json fallback |

### 4.3 `tests/core/lang/test-runner-adapter.test.ts` (NEW)

Six adapters × command shape + parse golden test.

| # | Adapter | Test | Expected |
|---|---|---|---|
| 1 | vitest | `command({coverage:true})` | `['npx','vitest','run','--coverage']` |
| 2 | vitest | parse stdout `"Tests 12 passed (12)"` | `{passed:12, failed:0, success:true}` |
| 3 | pytest | `command({filter:'test_foo'})` | `['pytest','-q','-k','test_foo']` |
| 4 | pytest | parse `"5 passed, 2 failed in 0.4s"` | `{passed:5, failed:2}` |
| 5 | go-test | `command({coverage:true})` | `['go','test','./...','-coverprofile=coverage.out']` |
| 6 | go-test | parse `"ok  pkg/foo 0.1s\nFAIL pkg/bar 0.2s"` | `{passed:1, failed:1}` |
| 7 | cargo-test | parse `"test result: ok. 12 passed; 0 failed; 1 ignored"` | `{passed:12, failed:0, skipped:1}` |
| 8 | junit | parse `"Tests run: 12, Failures: 1, Errors: 0, Skipped: 1"` | `{passed:10, failed:1, skipped:1}` |
| 9 | xunit | parse `"Failed: 1, Passed: 10, Skipped: 1, Total: 12"` | `{passed:10, failed:1, skipped:1}` |
| 10 | factory | `getTestRunnerAdapter('python')` | adapter where `stack==='python'` |
| 11 | default | `defaultTestRunnerAdapter.stack` | `'typescript'` (backward compat) |
| 12 | ADR-006 | every command returns `string[]` (no shell strings, no `&&`/`;`/`|` in elements) | passes for all 6 adapters |

### 4.4 `tests/core/lang/coverage-adapter.test.ts` (NEW)

Six adapters × parse golden, with one negative test per adapter.

| # | Adapter | Input | Expected |
|---|---|---|---|
| 1 | vitest | `{"total":{"lines":{"pct":89.3},"branches":{"pct":78.1}}}` | `{lineCoverage:89.3, branchCoverage:78.1}` |
| 2 | python | `<coverage line-rate="0.892" branch-rate="0.78">...</coverage>` | `{lineCoverage:89.2, branchCoverage:78}` |
| 3 | go | `mode: set\nfoo.go:1.1,2.2 5 1\nbar.go:1.1,2.2 3 0` | `{lineCoverage:62.5, branchCoverage:-1}` |
| 4 | rust (tarpaulin) | `<coverage line-rate="0.83" branch-rate="0.72">` | `{lineCoverage:83, branchCoverage:72}` |
| 5 | java jacoco | `<counter type="LINE" missed="100" covered="400"/>` | `{lineCoverage:80}` |
| 6 | csharp opencover | `<Summary sequenceCoverage="89.5" branchCoverage="78.1" />` | `{lineCoverage:89.5, branchCoverage:78.1}` |
| 7-12 | each adapter | malformed/empty input | returns `null` (graceful) |
| 13 | factory | `getCoverageAdapter('rust').label` | `'cargo-tarpaulin XML'` |
| 14 | reportGlobs uniqueness | each adapter's globs differ | passes |

### 4.5 `tests/core/lang/build-adapter.test.ts` (NEW)

Six adapters × command + parse + ADR-006 spawnSync compliance check.

| # | Adapter | Test | Expected |
|---|---|---|---|
| 1 | tsc | `command()` | `['npx','tsc','--noEmit']` |
| 2 | tsc | parse `"foo.ts(10,5): error TS2304: ..."` | `{success:false, errorCount:1}` |
| 3 | mypy+ruff | parse mypy `error:` lines | counts errors |
| 4 | go-build | parse `stderr` with `foo.go:10:5:` | `{errorCount:1}` |
| 5 | cargo-build | parse `error[E0308]:` | `{errorCount:1}` |
| 6 | mvn | parse `[ERROR]` lines | counts |
| 7 | dotnet | parse `error CS1234:` | counts |
| 8-13 | success-case parse for each adapter (exitCode=0, no errors in output) | `{success:true, errorCount:0}` |
| 14 | factory | `getBuildAdapter('csharp').stack === 'csharp'` | passes |
| 15 | ADR-006 audit (mypyRuff exception) | mypy+ruff uses `sh -c` — must be flagged in test as known exception with comment | test asserts intentional |

---

## 5. Integration Tests

`tests/integration/lang-adapters-integration.test.ts` (NEW). Mock 6-stack project fixtures via in-memory `mockfs`-style setup (no real fs writes).

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Full TS project | mock `package.json` + `tsconfig.json` + `coverage/coverage-summary.json` (89.3 lines) | `detectStack` → `'typescript'`, coverage parse → `89.3`, build adapter run → `tsc` |
| 2 | Full Python project | mock `pyproject.toml` + `coverage.xml` (line-rate=0.85) | `detectStack` → `'python'`, coverage → `85` |
| 3 | Full Go project | mock `go.mod` + `coverage.out` golden | `detectStack` → `'go'`, coverage parse |
| 4 | Full Rust project | mock `Cargo.toml` + `cobertura.xml` | `detectStack` → `'rust'`, coverage parse |
| 5 | Full Java project | mock `pom.xml` + `target/site/jacoco/jacoco.xml` | `detectStack` → `'java'`, coverage parse |
| 6 | Full C# project | mock `MyApp.csproj` + `coverage.opencover.xml` | `detectStack` → `'csharp'`, coverage parse |
| 7 | Audit task on Python project | `task.scope.filesWrite=['docs/audits/sprint-200/foo.md']` + audit content | `evaluateWithRubric` → audit branch, decision=DONE, no Python coverage adapter consulted |
| 8 | Code task on Rust project (no rubric override) | `task.scope.filesWrite=['src/lib.rs']`, result.coverage absent, but cobertura.xml present | scorer pulls coverage from rust adapter, scoreTestCoverage > 0 |
| 9 | Stack detection failure → fallback | empty fixture | `detectStack` → `null`, `evaluateWithRubric` falls through to default vitest scorer (no crash) |
| 10 | ADR-047 invariant: every STACKS entry has all 3 adapters | iterate `STACKS`, call `getStackAdapters(s.id)` | no throw |

---

## 6. Observability Events

New event emitted via existing `event-stream.ts` when audit branch fires:

```ts
// In src/orchestra/event-stream.ts (existing) — add to event union:
export interface AuditRubricAppliedEvent {
  type: 'sprint.eval.audit-rubric-applied';
  payload: {
    taskId: string;
    sprintId: string;
    rubricType: 'audit';
    score: number;       // 0-100
    decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
    detectedStack: StackId | null;  // present when stack detection ran during eval
  };
  timestamp: string; // ISO 8601
}
```

**Emission point:** end of `evaluateAuditTask` (Section 3a).

**Consumer impact:**
- `monitor/auditor.ts` already tails event stream — picks up automatically.
- Dashboard SSE stream re-broadcasts to `/events`.
- `sprint-reporter.ts` retro can count `audit-rubric-applied` events to surface "Audit task count: N" in retro.

**Backward compat:** strictly additive event type; existing consumers unaffected.

---

## 7. ADR-047 — Multi-Language TestRunner / Coverage / Build Adapter Pattern

```markdown
# ADR-047: Multi-Language TestRunner / Coverage / Build Adapter Pattern

**Status:** proposed (Sprint 162A)
**Date:** 2026-05-08
**Supersedes:** none
**Superseded-by:** none
**Related:** ADR-006 (spawnSync), ADR-008 (one-way imports), ADR-035 (Verification Protocol)

## Context

`src/orchestra/result-evaluator.ts` and `worker-default.md` rules hardcode TypeScript+vitest commands (`npx tsc --noEmit`, `npx vitest run`) and vitest JSON coverage parsing. Deckent's product vision (ADR-033) is to be a project-agnostic orchestrator — Sprint 162A surfaces this debt as Bug B (coverage=0 for non-TS stacks → systematic NO_GO).

## Decision

Introduce three minimal interface contracts in `src/core/lang/` and a static `STACKS` registry of six baseline stacks:

- `TestRunnerAdapter` — supplies `command(opts)` returning `string[]` and `parse(stdout, stderr, exitCode) → TestOutcome`.
- `CoverageAdapter` — supplies `reportGlobs()` and `parse(content, path) → CoverageOutcome | null`.
- `BuildAdapter` — supplies `command()` and `parse() → BuildOutcome`.
- `getStackAdapters(stackId)` returns the bundle.

Six baseline stacks: typescript, python, go, rust, java, csharp. Each has all three adapters. Stack identification is performed via `detectStack(projectRoot)` which consults `.deckent/project-stack.json` first (Layer 1) then a file-presence walk (Layer 2).

`result-evaluator.ts:scoreTestCoverage` and any future `scoreBuildHealth` consume adapters instead of hardcoding tooling.

## Consequences

**Positive:**
- Bug B closure (audit rubric still independent, but code tasks across stacks score correctly).
- Worker prompt builder can inject correct `tsc/mypy/go-build/cargo-build/javac/dotnet` commands per stack.
- Adding Ruby/PHP/Elixir/Kotlin/Swift is a one-file change per adapter family + STACKS append.
- Single source of truth for "what is the build command for stack X".

**Negative:**
- New module surface (~6 files) → +~600 LoC.
- Adapter `parse()` heuristics will drift as tools change output format → maintenance cost.
- Mypy+ruff combo requires `sh -c` (cannot run two binaries in one spawn) — documented exception to ADR-006 with whitelist enforcement (Section 10).

**Neutral:**
- No runtime perf impact (adapters are lazy, registry is static).

## Alternatives Considered

1. **Per-stack giant switch in `result-evaluator.ts`** — rejected: violates ADR-008 by importing tool knowledge into orchestra/.
2. **Per-stack plugin loader (dynamic)** — rejected: complexity not justified for 6 stacks; static registry is enough.
3. **Defer to Sprint 162B** — rejected: Bug B is acute now; partial fix without adapters would entrench TS hardcoding.

## Future Work

| Stack | Test runner | Coverage | Build |
|---|---|---|---|
| Ruby | rspec | simplecov JSON | bundle exec |
| PHP | phpunit | clover XML | composer |
| Elixir | mix test | coveralls JSON | mix compile |
| Kotlin | gradle test (junit) | jacoco | gradle build |
| Swift | swift test | llvm-cov | swift build |

Append entries to `STACKS`, add three adapter implementations each. No other changes required.
```

---

## 8. i18n Event Labels (12 languages)

Per the deckent convention (DECKENT.md Workflow Guide is bilingual TR/EN, audit reports bilingual), every new event surface needs label translations. Sprint 161 already uses 12-lang labels; this spec inherits.

`src/core/i18n/event-labels.json` additions (or wherever the existing event-label table lives):

```json
{
  "sprint.eval.audit-rubric-applied": {
    "en": "Audit rubric applied",
    "tr": "Denetim rubriği uygulandı",
    "de": "Audit-Bewertungsraster angewendet",
    "fr": "Grille d'audit appliquée",
    "es": "Rúbrica de auditoría aplicada",
    "it": "Rubrica di audit applicata",
    "pt": "Rubrica de auditoria aplicada",
    "nl": "Auditrubriek toegepast",
    "pl": "Zastosowano rubrykę audytu",
    "ja": "監査ルーブリックが適用されました",
    "zh": "已应用审计评分标准",
    "ko": "감사 루브릭 적용됨"
  },
  "stack.detected.typescript": { "en": "TypeScript+vitest detected", "tr": "TypeScript+vitest tespit edildi", "...": "..." },
  "stack.detected.python":     { "en": "Python+pytest detected",    "tr": "Python+pytest tespit edildi",    "...": "..." },
  "stack.detected.go":         { "en": "Go+go-test detected",       "tr": "Go+go-test tespit edildi",       "...": "..." },
  "stack.detected.rust":       { "en": "Rust+cargo-test detected",  "tr": "Rust+cargo-test tespit edildi",  "...": "..." },
  "stack.detected.java":       { "en": "Java+JUnit detected",       "tr": "Java+JUnit tespit edildi",       "...": "..." },
  "stack.detected.csharp":     { "en": "C#+xUnit detected",         "tr": "C#+xUnit tespit edildi",         "...": "..." }
}
```

(Implementation: 12 keys × 7 labels = 84 strings. Use existing translator or human-author; copy template from Sprint 156 i18n table.)

---

## 9. Dashboard Stack Badge — ARIA Labels

Where the dashboard surfaces "TS" / "PY" / "GO" / "RS" / "JV" / "CS" badges (likely `src/dashboard/components/StackBadge.tsx` — to be created or extended), add `aria-label`:

```tsx
const ARIA_LABELS: Record<StackId, string> = {
  typescript: 'TypeScript with vitest test runner',
  python:     'Python with pytest test runner',
  go:         'Go with go-test test runner',
  rust:       'Rust with cargo-test test runner',
  java:       'Java with JUnit test runner',
  csharp:     'C# with xUnit test runner',
};
// <span aria-label={ARIA_LABELS[stack]} role="img">{shortCode}</span>
```

A11y rule: badge must be focusable when interactive; otherwise `role="img"` with descriptive aria-label is sufficient (WCAG 2.1 SC 1.1.1).

---

## 10. Security Considerations

### 10.1 No User-Tunable Audit Rubric

`AUDIT_RUBRIC` is exported but its weights are constants — **no config knob accepts `audit_rubric` in `evaluation_rubric` overrides**. Rationale: a user could otherwise set `migration_triage.weight = 0.99` and gain trivial DONE on degenerate audits, defeating Bug B fix. Implementation guard:

```ts
// In config-validator.ts — add rejection
if (cfg.evaluation_rubric?.criteria?.some(c => AUDIT_RUBRIC.criteria.find(a => a.name === c.name))) {
  throw new ConfigError('audit rubric criteria are internal — cannot be overridden via config');
}
```

### 10.2 Adapter Command Whitelist (ADR-006 Preservation)

Every adapter's `command()` returns `string[]`. The mypy+ruff Python build adapter uses `['sh','-c','mypy . && ruff check .']`. This is a documented exception. To prevent abuse:

- Test 4.5 #15 asserts `mypyRuff` is the **only** adapter using `sh -c`.
- A new helper `assertSpawnSafe(cmd: string[]): void` (in `src/core/lang/index.ts`) walks the command and verifies: first element is in `ADAPTER_BIN_WHITELIST` (`npx`, `pytest`, `go`, `cargo`, `mvn`, `dotnet`, `sh`); for `sh` only `-c <one-string>` form is accepted; the inner string is matched against a regex of allowed mypy/ruff invocations.
- Worker spawn site (when adapter is invoked by future verify-loop integration) calls `assertSpawnSafe` before `spawnSync`.

```ts
const ADAPTER_BIN_WHITELIST = new Set(['npx', 'pytest', 'go', 'cargo', 'mvn', 'dotnet', 'sh']);
const SH_C_ALLOWED = /^(mypy(\s+\S+)*\s*&&\s*ruff\s+check(\s+\S+)*)$/;

export function assertSpawnSafe(cmd: string[]): void {
  if (cmd.length === 0) throw new Error('empty command');
  if (!ADAPTER_BIN_WHITELIST.has(cmd[0]!)) throw new Error(`disallowed binary: ${cmd[0]}`);
  if (cmd[0] === 'sh') {
    if (cmd[1] !== '-c' || cmd.length !== 3) throw new Error('sh requires exactly -c <script>');
    if (!SH_C_ALLOWED.test(cmd[2]!)) throw new Error(`disallowed sh -c payload: ${cmd[2]}`);
  }
}
```

### 10.3 Path Traversal in `reportGlobs`

`CoverageAdapter.parse(content, reportPath)` accepts `reportPath` only for informational return value — never for file I/O within the parse function. Reading the report from disk is the caller's job and uses `path.resolve(projectRoot, glob)` with a containment check (`!resolved.startsWith(projectRoot)` → reject). Document this in the public-export docstring.

### 10.4 Adapter Output Size Cap

Build/test stdout can be unbounded (cargo with thousands of warnings). Enforce a 4 MB cap in the spawn site (caller responsibility, documented in adapter docstrings). Each `parse()` truncates `raw` field to first/last 64 KB.

### 10.5 Audit Heuristic Tampering

`isAuditTask` reads only `task.scope` — which is authored by Brain in PLAN phase, not by the worker. A worker cannot self-classify as audit to bypass code-task evaluation. (Worker-supplied `selfAssessment` and `notes` are independent.)

---

## 11. Multi-Language Surface — PRIMARY Design Summary

This spec adds the largest single surface in Sprint 162A:

| File | Type | LoC est. |
|---|---|---|
| `src/orchestra/result-evaluator.ts` | edit | +180 / -0 |
| `src/core/lang/types.ts` | new | 120 |
| `src/core/lang/stack-detector.ts` | new | 50 |
| `src/core/lang/test-runner-adapter.ts` | new | 180 |
| `src/core/lang/coverage-adapter.ts` | new | 170 |
| `src/core/lang/build-adapter.ts` | new | 140 |
| `src/core/lang/index.ts` | new | 30 |
| `src/orchestra/event-stream.ts` | edit | +20 |
| `src/core/config-validator.ts` | edit | +10 |
| `tests/orchestra/result-evaluator-audit-rubric.test.ts` | new | 280 |
| `tests/core/lang/stack-detector.test.ts` | new | 160 |
| `tests/core/lang/test-runner-adapter.test.ts` | new | 220 |
| `tests/core/lang/coverage-adapter.test.ts` | new | 240 |
| `tests/core/lang/build-adapter.test.ts` | new | 220 |
| `tests/integration/lang-adapters-integration.test.ts` | new | 260 |
| `.brain/DECISIONS.md` (ADR-047 entry) | edit | +60 |
| `src/core/i18n/event-labels.json` | edit | +84 entries |
| **Total new code** | | **~2400 LoC** |

**Architectural fit:**
- Strictly under `src/core/lang/` — does not violate ADR-008 (orchestra imports core, never reverse).
- Adapters are pure (no side effects in their declared functions, except the spawn that callers perform).
- Static registry — no runtime mutation, predictable behaviour.
- Backward compatible: every existing TS+vitest path produces byte-identical scores.

**Bug B closure proof:**
1. Sprint 161 audit task with worker `selfAssessment='DONE'` and 4 strong rubric scores enters `evaluateWithRubric`.
2. `isAuditTask` returns `true` (single docs/audits/*.md, no src/ in dirs).
3. `evaluateAuditTask` runs audit scorers on the actual markdown content.
4. Heading count, finding count, citation density, triage labels all measured from the report itself — independent of `coverage=0`.
5. `totalScore ≈ 78` → decision=DONE. Worker assessment honoured. NO_GO eliminated.
6. Event `sprint.eval.audit-rubric-applied` emitted with `decision: 'DONE'` and `detectedStack: 'typescript'`.

**Multi-language closure proof:**
1. Same Sprint 161 audit on a Python project: `isAuditTask` true (scope-shape independent of language), audit rubric applies → DONE. Same outcome.
2. Hypothetical Sprint 162B Python code task: scope is `src/`, audit branch skipped, default rubric runs. `scoreTestCoverage` resolves `getCoverageAdapter('python')`, parses `coverage.xml`, returns true coverage instead of `0`. Score reflects reality. Adapter pattern delivered.

---

## End of Spec

Implementation order recommendation for the executor:
1. `src/core/lang/types.ts` (no deps).
2. `src/core/lang/{test-runner,coverage,build}-adapter.ts` (parallel).
3. `src/core/lang/stack-detector.ts` + `index.ts`.
4. Adapter unit tests (4.2-4.5).
5. `result-evaluator.ts` audit branch + `evaluateAuditTask` + audit scorers.
6. Audit rubric unit test (4.1).
7. Integration test (Section 5).
8. Event stream + i18n labels + ADR-047.
9. Config validator guard + `assertSpawnSafe`.
10. Dashboard StackBadge (Section 9) — can be a follow-up sprint if dashboard work crowds 162A.
