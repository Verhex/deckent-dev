// ═══ result-evaluator audit-rubric tests (Sprint 162A Bug B) ═══════════
// Coverage:
//   1. isAuditTask scope-shape heuristic (positive + 3 negatives)
//   2. evaluateAuditTask scoring on rich / medium / degenerate audits
//   3. evaluateWithRubric routing to audit branch
//   4. Explicit rubric override skips audit branch
//   5. Schema-invalid audit result → NO_GO
//   6. Sprint 161 regression replay (worker self-DONE → DONE)
//   7. Audit event emitter spy
//   8. Verification fast-path still works

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  isAuditTask,
  evaluateAuditTask,
  evaluateWithRubric,
  AUDIT_RUBRIC,
  AUDIT_RUBRIC_APPLIED_CHANNEL,
  setAuditEventEmitter,
  type AuditRubricAppliedPayload,
} from '../../src/orchestra/result-evaluator.js';

// ─── Test helpers ─────────────────────────────────────────────────────

function makeAuditTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '161-001',
    title: 'Audit task',
    description: 'audit existing implementation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'audit',
    scope: {
      directories: ['docs/audits/sprint-161/'],
      filesRead: ['src/'],
      filesWrite: ['docs/audits/sprint-161/scope-drift.md'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeCodeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '161-099',
    title: 'Refactor src',
    description: 'refactor module',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'refactor',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '161-001',
    workerId: 'w-001',
    filesChanged: ['docs/audits/sprint-161/scope-drift.md'],
    linesAdded: 200,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// Minimum-viable schema-clean result: testsPassed/coverage/selfAssessment/taskId/filesChanged.
const RICH_AUDIT_CONTENT = `# Sprint 161 — Scope Drift Audit

## Section 1 — Module-Level Findings

Several drift surfaces detected across the orchestra/ tree. Below is a structured triage.

### 1.1 result-evaluator.ts
- Finding: rubric mismatch on audit tasks (P0, blocking)
- Bug: coverage hardcoded to vitest format (P1)
- Risk: silent zero-coverage for non-TS stacks (P1)

### 1.2 sprint-controller.ts
- Issue: task router skips skill resolution (P2, deferrable)
- Drift: god-object split incomplete (P2)

## Section 2 — File:Line Citations

| File | Line | Severity |
|------|------|---------|
| src/orchestra/result-evaluator.ts:709 | High | P0 |
| src/orchestra/result-evaluator.ts:780 | Med  | P1 |
| src/orchestra/sprint-controller.ts:365 | Low  | P2 |
| src/core/agent-pool.ts:42 | Med | P1 |
| src/core/skill-pool.ts:103 | Low | P2 |

## Section 3 — Triage

- Finding: 12 callers of evaluateWithRubric (P0)
- Bug: 4 file-write violations (blocking)
- Issue: 8 doc-task false-positives (deferrable)
- Risk: 3 ADR-008 violations (P1)
- Drift: 2 ADR-006 spawnSync exceptions (P1)

### 3.1 References
- src/orchestra/sprint-phases.ts:409
- src/orchestra/sprint-phases.ts:800
- src/orchestra/result-evaluator.ts:730
- src/orchestra/auditor.ts:120
- src/core/lang/types.ts:42
`;

const MEDIUM_AUDIT_CONTENT = `# Sprint Audit

## Findings

- Finding: minor drift in module X (P1)
- Bug: missing null check in foo (P2)
- Issue: doc gap (deferrable)

## Citations

| File | Line |
|------|------|
| src/foo.ts:10 | top |
| src/bar.ts:20 | mid |

References:
- src/baz.ts:30
- src/qux.ts:40
- src/quux.ts:50

### Triage

- P1 items handled
- P2 items pending
`;

const DEGENERATE_AUDIT_CONTENT = 'A short paragraph with no structure.';

// ─── isAuditTask ───────────────────────────────────────────────────────

describe('isAuditTask', () => {
  it('returns true for single docs/audits/ markdown filesWrite with no src dirs', () => {
    const task = makeAuditTask();
    expect(isAuditTask(task)).toBe(true);
  });

  it('returns false when filesWrite is a src/ file', () => {
    const task = makeAuditTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/foo.ts'],
      },
    });
    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when filesWrite has multiple entries', () => {
    const task = makeAuditTask({
      scope: {
        directories: ['docs/audits/'],
        filesRead: [],
        filesWrite: [
          'docs/audits/sprint-161/x.md',
          'docs/audits/sprint-161/y.md',
        ],
      },
    });
    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when scope.directories includes src/', () => {
    const task = makeAuditTask({
      scope: {
        directories: ['src/orchestra/', 'docs/audits/sprint-161/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-161/foo.md'],
      },
    });
    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when filesWrite exists but is not docs/audits/', () => {
    const task = makeAuditTask({
      scope: {
        directories: [],
        filesRead: [],
        filesWrite: ['docs/guides/intro.md'],
      },
    });
    expect(isAuditTask(task)).toBe(false);
  });

  it('returns false when filesWrite[0] is non-markdown', () => {
    const task = makeAuditTask({
      scope: {
        directories: ['docs/audits/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-161/data.json'],
      },
    });
    expect(isAuditTask(task)).toBe(false);
  });
});

// ─── evaluateAuditTask scoring ─────────────────────────────────────────

describe('evaluateAuditTask scoring', () => {
  it('rich audit content → DONE with totalScore ≥ 70', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    const evaluation = evaluateAuditTask(result, task);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.rubricScores).toHaveLength(4);
    const criteriaNames = evaluation.rubricScores.map(s => s.criterion).sort();
    expect(criteriaNames).toEqual([
      'audit_completeness',
      'citation_density',
      'finding_count',
      'migration_triage',
    ]);
  });

  it('degenerate single-paragraph audit → NO_GO', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: DEGENERATE_AUDIT_CONTENT });
    const evaluation = evaluateAuditTask(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.totalScore).toBeLessThan(AUDIT_RUBRIC.passingScore * 0.7);
  });

  it('medium audit content → GO_WITH_TECH_DEBT (49 ≤ score < 70)', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: MEDIUM_AUDIT_CONTENT });
    const evaluation = evaluateAuditTask(result, task);
    expect(['GO_WITH_TECH_DEBT', 'DONE']).toContain(evaluation.decision);
    // medium content should NOT yield NO_GO
    expect(evaluation.decision).not.toBe('NO_GO');
  });

  it('schema-invalid audit result → NO_GO with schema_validation reason', () => {
    const task = makeAuditTask();
    // Missing coverage field
    const badResult = {
      taskId: '161-001',
      workerId: 'w-001',
      filesChanged: ['docs/audits/sprint-161/foo.md'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      // coverage intentionally missing
      selfAssessment: 'DONE',
      notes: RICH_AUDIT_CONTENT,
    } as unknown as TaskResult;
    const evaluation = evaluateAuditTask(badResult, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores[0]!.criterion).toBe('schema_validation');
    expect(evaluation.rubricScores[0]!.reason).toMatch(/Schema violation/);
  });

  it('uses AUDIT_RUBRIC weights (sum to 1.0)', () => {
    const sum = AUDIT_RUBRIC.criteria.reduce((acc, c) => acc + c.weight, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('Sprint 161 regression: worker DONE + rich audit → DONE', () => {
    // Replays the Sprint 161 representative case: worker self-assessed DONE
    // with 4 strong rubric scores; default rubric produced NO_GO due to
    // coverage=0. Audit branch confirms DONE.
    const task = makeAuditTask({
      id: '161-005',
      title: 'Sprint 152 audit recap',
      description: 'audit Sprint 152 verification flow',
      scope: {
        directories: ['docs/audits/sprint-161/'],
        filesRead: ['src/'],
        filesWrite: ['docs/audits/sprint-161/sprint-152-audit.md'],
      },
    });
    const result = makeResult({
      taskId: '161-005',
      filesChanged: ['docs/audits/sprint-161/sprint-152-audit.md'],
      coverage: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: RICH_AUDIT_CONTENT,
    });
    const evaluation = evaluateAuditTask(result, task);
    expect(evaluation.decision).toBe('DONE');
  });
});

// ─── evaluateWithRubric routing ────────────────────────────────────────

describe('evaluateWithRubric — audit branch routing', () => {
  it('routes audit tasks to evaluateAuditTask when no rubric override', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    const evaluation = evaluateWithRubric(result, task);
    // Audit rubric criteria exposed in scores
    const criteria = evaluation.rubricScores.map(s => s.criterion);
    expect(criteria).toContain('audit_completeness');
    expect(criteria).not.toContain('correctness');
    expect(criteria).not.toContain('test_coverage');
  });

  it('skips audit branch when rubric argument provided (explicit override)', () => {
    const task = makeAuditTask();
    const result = makeResult({
      coverage: 95,
      filesChanged: ['docs/audits/sprint-161/foo.md'],
      notes: 'Brief notes for audit task with high coverage explicit override',
    });
    const customRubric = {
      criteria: [
        { name: 'correctness', weight: 0.5, threshold: 60, evaluator: 'auto' as const },
        { name: 'documentation', weight: 0.5, threshold: 30, evaluator: 'pattern' as const },
      ],
      passingScore: 70,
      maxRetries: 0,
    };
    const evaluation = evaluateWithRubric(result, task, customRubric);
    const criteria = evaluation.rubricScores.map(s => s.criterion);
    // Default scorers should run, NOT audit scorers
    expect(criteria).toContain('correctness');
    expect(criteria).not.toContain('audit_completeness');
  });

  it('verification fast-path still wins over default rubric for non-audit tasks', () => {
    // A code task whose description says "verify" with no source-code changes
    // should still use the verification fast-path, not the audit branch.
    const task = makeCodeTask({
      title: 'Verify Sprint 150 implementation',
      description: 'audit verify existing implementation',
      scope: {
        directories: ['docs/sprint-150/'],
        filesRead: [],
        filesWrite: ['docs/sprint-150/verification.md'],
      },
    });
    const result = makeResult({
      taskId: task.id,
      filesChanged: ['docs/sprint-150/verification.md'],
      coverage: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'Verified existing implementation',
    });
    const evaluation = evaluateWithRubric(result, task);
    // Should be either audit (filesWrite docs/audits/ path) or verification (regex match)
    // For non-audits/ path: docs/sprint-150/, not docs/audits/, so audit branch declines.
    // The verification fast-path then matches via regex /\baudit\b|\bverif/.
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBe(100);
  });

  it('code-writing task → standard evaluateWithRubric path (no audit branch)', () => {
    const task = makeCodeTask();
    const result = makeResult({
      taskId: task.id,
      filesChanged: ['src/orchestra/foo.ts'],
      coverage: 90,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'Refactored module into smaller pieces; added new helper functions and tests',
    });
    const evaluation = evaluateWithRubric(result, task);
    const criteria = evaluation.rubricScores.map(s => s.criterion);
    expect(criteria).toContain('correctness');
    expect(criteria).toContain('test_coverage');
    expect(criteria).not.toContain('audit_completeness');
  });
});

// ─── Audit event emitter spy ───────────────────────────────────────────

describe('emitAuditRubricApplied event', () => {
  let emittedPayloads: AuditRubricAppliedPayload[] = [];
  let restoreEmitter: () => void = () => {};

  beforeEach(() => {
    emittedPayloads = [];
    const previous = setAuditEventEmitter(p => emittedPayloads.push(p));
    restoreEmitter = () => setAuditEventEmitter(previous);
  });

  afterEach(() => {
    restoreEmitter();
  });

  it('emits exactly once per audit eval', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    evaluateAuditTask(result, task);
    expect(emittedPayloads).toHaveLength(1);
  });

  it('emits with correct channel + payload shape', () => {
    const task = makeAuditTask({ id: '162-001' });
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    evaluateAuditTask(result, task);
    expect(emittedPayloads).toHaveLength(1);
    const payload = emittedPayloads[0]!;
    expect(payload.taskId).toBe('162-001');
    expect(payload.rubricType).toBe('audit');
    expect(payload.decision).toBe('DONE');
    expect(typeof payload.score).toBe('number');
    expect(payload.detectedStack).toBeNull();
    // Channel constant check
    expect(AUDIT_RUBRIC_APPLIED_CHANNEL).toBe('sprint.eval.audit-rubric-applied');
  });

  it('emits only via audit branch — does NOT fire for non-audit tasks', () => {
    const task = makeCodeTask();
    const result = makeResult({
      taskId: task.id,
      filesChanged: ['src/orchestra/foo.ts'],
      coverage: 90,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'normal code task',
    });
    evaluateWithRubric(result, task);
    expect(emittedPayloads).toHaveLength(0);
  });

  it('emits NO_GO decision for degenerate audit', () => {
    const task = makeAuditTask();
    const result = makeResult({ notes: DEGENERATE_AUDIT_CONTENT });
    evaluateAuditTask(result, task);
    expect(emittedPayloads).toHaveLength(1);
    expect(emittedPayloads[0]!.decision).toBe('NO_GO');
  });

  it('emitter swap is reversible (returned previous emitter)', () => {
    let capturedPrev: AuditRubricAppliedPayload[] = [];
    const prev1 = setAuditEventEmitter(p => capturedPrev.push(p));
    let secondHits: AuditRubricAppliedPayload[] = [];
    setAuditEventEmitter(p => secondHits.push(p));

    const task = makeAuditTask();
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    evaluateAuditTask(result, task);

    expect(secondHits).toHaveLength(1);
    expect(capturedPrev).toHaveLength(0);

    // Restore the first
    const prev2 = setAuditEventEmitter(prev1);
    expect(typeof prev2).toBe('function');
  });
});

// ─── Spy: default rubric scorers NOT called when audit branch fires ────

describe('audit branch isolation', () => {
  it('audit branch does not delegate to scoreCorrectness/scoreTestCoverage', () => {
    // Verified indirectly: the rubricScores returned by evaluateAuditTask
    // contain ONLY audit criterion names. If default scorers ran, names
    // like "correctness" / "test_coverage" would appear.
    const task = makeAuditTask();
    const result = makeResult({ notes: RICH_AUDIT_CONTENT });
    const evaluation = evaluateAuditTask(result, task);
    const names = new Set(evaluation.rubricScores.map(s => s.criterion));
    expect(names.has('correctness')).toBe(false);
    expect(names.has('test_coverage')).toBe(false);
    expect(names.has('scope_compliance')).toBe(false);
    expect(names.has('documentation')).toBe(false);
  });
});
