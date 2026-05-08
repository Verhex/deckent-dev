# Sprint 162A — Bug C Fix Spec: Synthetic `selfAssessment: 'NO_GO'` blocks `reconcileSpuriousNoGo`

**Subagent:** INV-C
**Bug:** Bug C — synthetic timeout result hardcodes `selfAssessment: 'NO_GO'`, preventing the partial-result recovery pathway specified by ADR-035.
**Code surface:** `src/orchestra/sprint-phases.ts:493-505`
**ADR delta:** ADR-035 V2 amendment (synthetic results MUST use `TIMEOUT_WITH_WORK`)
**Estimated wave-application size:** 1 LoC source change + 1 new test file + 1 new event-stream emit + ADR-035 amendment.

---

## 1. Problem Statement

When the EVALUATE phase runs and a task is missing from `collectedIds` (i.e. no `.result` file collected within `waitForResults` window), `runEvaluatePhase` synthesises a placeholder `TaskResult`:

```ts
// src/orchestra/sprint-phases.ts:493-503 (current)
const syntheticResult: TaskResult = {
  taskId: task.id,
  workerId: task.assignedWorker ?? 'unknown',
  filesChanged: [],
  linesAdded: 0,
  linesRemoved: 0,
  testsPassed: false,
  coverage: 0,
  selfAssessment: 'NO_GO',                       // ← Bug C: blocks reconcile
  notes: 'Timeout - no result received',
};
```

Two failures cascade from this:

1. **`reconcileSpuriousNoGo` is bypassed.** The synthetic result is fed into `handleEvaluation(... TaskEvaluation.NO_GO ...)` directly (line 505) — the `evaluation === NO_GO` branch in the **other** loop (lines 368-381) where reconcile runs is never reached, because the `else` branch (lines 492-525) handles its own evaluation/notify/hooks inline.
2. **`evaluateWithRubric` partial-credit path is also bypassed.** `result-evaluator.ts:567-573` gives `TIMEOUT_WITH_WORK` a partial-credit score (+10) that lets reconcile’s `git diff --stat` evidence determine the outcome. With `'NO_GO'` hardcoded, the rubric collapses to “self-assessment NO_GO” reasoning even when the worker container died after writing real files to `src/`.

Per **ADR-035 protocol V1.0**: `WORKER→BRAIN:RESULT` carries `selfAssessment` whose `'TIMEOUT_WITH_WORK'` value is the canonical signal that *the worker was killed but partial work exists on disk* (Sprint 145 trap). Brain must call `reconcileSpuriousNoGo` before committing NO_GO. The Docker EXIT trap (`spawn-backend-docker.ts:243`) already writes `TIMEOUT_WITH_WORK` for this exact scenario; the synthetic-result code-path inside Brain is the only place that hand-rolls `'NO_GO'` instead.

**Sprint 161 evidence:** 49/56 tasks NO_GO with `notes: "Timeout - no result received"` while `git diff --stat` showed real file edits — partial work was present but discarded because reconcile never ran.

---

## 2. Root Cause

`runEvaluatePhase` has two evaluation branches:

| Branch | Trigger | Reconcile wired? |
|--------|---------|------------------|
| `if (collectedIds.has(task.id))` (lines 357-491) | `.result` file present | ✅ lines 368-381 |
| `else` (lines 492-525) | No `.result` collected | ❌ — synthetic NO_GO commits directly |

The synthetic-result branch was added to make the EVALUATE loop **total** over `sprint.tasks` (avoids "lost" tasks), but it short-circuits ADR-035 verification. Setting `selfAssessment: 'NO_GO'` is also semantically wrong: the worker did **not** self-assess — Brain is the one *imposing* a self-assessment value here. The closest honest value is `'TIMEOUT_WITH_WORK'` because (a) the worker timed out, and (b) the *evidence of partial work* is exactly what reconcile examines via `git diff --stat`.

> Note: `SelfAssessment` type in `src/core/task-types.ts:142` is currently `'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'`. Existing call sites (`result-evaluator.ts:90`, `567`) cast through `(result.selfAssessment as string)` to handle the documented-but-untyped `'TIMEOUT_WITH_WORK'` value. Wave 1 keeps the same string-cast pattern for the synthetic write to remain compatible with the existing rubric. A type-broadening cleanup (`SelfAssessment = ... | 'TIMEOUT_WITH_WORK'`) is **out of scope for Bug C** — leave for a follow-up.

---

## 3. Code Diff

**File:** `src/orchestra/sprint-phases.ts`

```diff
@@ -498,7 +498,7 @@
           linesRemoved: 0,
           testsPassed: false,
           coverage: 0,
-          selfAssessment: 'NO_GO',
+          selfAssessment: 'TIMEOUT_WITH_WORK' as SelfAssessment,
           notes: 'Timeout - no result received',
         };
         debugLog('runEvaluatePhase:timeout', `task=${task.id} — no result collected, marking NO_GO (timeout/missing)`);
```

**Why the cast:** matches the existing pattern at `result-evaluator.ts:90` and `:567` until the type is broadened in a follow-up change. No runtime behaviour difference — `TIMEOUT_WITH_WORK` is already recognised by the rubric and reconcile pipeline.

**Behaviour change:** With `'TIMEOUT_WITH_WORK'`, `evaluateWithRubric` (which Brain already runs everywhere) now hits the `result-evaluator.ts:567` branch giving partial credit, and the existing reconcile path inside the `if` branch (lines 368-381) becomes reachable for synthetic results when we move `handleEvaluation` to flow through the same downgrade gate. **Wave 1 keeps the synthetic call site in the `else` branch unchanged** — Bug A heartbeat-gate reform (sibling fix-spec INV-A) is the cleaner place to consolidate the two branches; Bug C confines itself to *the value*, not the *control flow*.

The downstream effect is that `result-evaluator.ts:evaluateResult` (when re-run on the synthetic via FIX-phase or external auditor) calls `reconcileSpuriousNoGo` (lines 90-99): if `git diff --stat` shows partial work + tsc passes + vitest pass ratio ≥ 50%, the task is reconciled to `GO_WITH_TECH_DEBT` instead of being lost as NO_GO.

---

## 4. Unit Test Draft

**Path:** `tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { TaskStatus, SprintStatus, SprintPhase, type Task, type Sprint, type TaskResult } from '../../src/core/types.js';

// Mock heavy dependencies (dashboard, hooks, debt-manager, auditor)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(),
  parseDebtTable: vi.fn().mockReturnValue([]),
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  resolveDebt: vi.fn(),
}));

vi.mock('../../src/core/notification-dispatcher.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

// Capture the synthetic result that handleEvaluation receives.
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

describe('Bug C — synthetic timeout result uses TIMEOUT_WITH_WORK', () => {
  const projectRoot = '/tmp/bug-c-test';
  let sprint: Sprint;
  let task: Task;

  beforeEach(() => {
    vi.clearAllMocks();
    task = {
      id: '001-001',
      title: 'Sample timeout task',
      description: 'Worker times out',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: '',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING,
      sprintId: 'sprint-162a-test',
      createdAt: new Date().toISOString(),
      assignedWorker: 'w-001-001',
    } as Task;
    sprint = {
      id: 'sprint-162a-test',
      tasks: [task],
      status: SprintStatus.SPAWNING,
      phase: SprintPhase.EVALUATE,
      startedAt: new Date().toISOString(),
    } as Sprint;
  });

  it('synthesises a TaskResult with selfAssessment=TIMEOUT_WITH_WORK when no .result is collected', async () => {
    const evaluations = new Map();
    // No results collected — triggers synthetic branch (sprint-phases.ts:492-525)
    await runEvaluatePhase(projectRoot, sprint, [], evaluations, 90, undefined, undefined);

    expect(handleEvaluation).toHaveBeenCalledTimes(1);
    const [, , , syntheticResult] = vi.mocked(handleEvaluation).mock.calls[0] as unknown as [
      string, Task, unknown, TaskResult,
    ];
    expect(syntheticResult.taskId).toBe('001-001');
    expect(syntheticResult.selfAssessment).toBe('TIMEOUT_WITH_WORK');
    expect(syntheticResult.notes).toContain('Timeout');
    expect(syntheticResult.workerId).toBe('w-001-001');
  });

  it('regression guard — synthetic result MUST NOT be NO_GO', async () => {
    const evaluations = new Map();
    await runEvaluatePhase(projectRoot, sprint, [], evaluations, 90, undefined, undefined);

    const [, , , syntheticResult] = vi.mocked(handleEvaluation).mock.calls[0] as unknown as [
      string, Task, unknown, TaskResult,
    ];
    // Guard against a regression where someone reverts the literal back to 'NO_GO'.
    expect(syntheticResult.selfAssessment).not.toBe('NO_GO');
  });
});
```

> 3 assertions: (1) value is `TIMEOUT_WITH_WORK`, (2) basic shape preserved (taskId, notes, workerId), (3) regression guard against literal reverting to `'NO_GO'`.

---

## 5. Integration Test Scenario

Not required for Bug C in isolation — the synthetic-result code path is exercised end-to-end by:

- Sprint 162A Phase 3 smoke replicate (`docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md` §5).
- Bug A’s `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts` (sibling fix-spec INV-A) — Bug A’s heartbeat gate tests will see `TIMEOUT_WITH_WORK` synthetic-results and assert reconcile is consulted before NO_GO commits.

No new integration suite for Bug C alone.

---

## 6. Observability Hook

**New event-stream event:**

| Event channel | Source | Target | Payload |
|---------------|--------|--------|---------|
| `sprint.eval.synthetic-timeout` | `sprint-phases.ts:501` | `*` (broadcast) | `{ taskId, hbAgeMs, lastResult }` |

- `taskId`: e.g. `"001-001"`
- `hbAgeMs`: age of the last heartbeat file in ms (read via `readHeartbeat(task.id)` if present — `null` if no `.hb` file).
- `lastResult`: snapshot of the synthetic result (the same object handed to `handleEvaluation`); enables auditor & post-mortem reconstruction without re-reading `.tasks/`.

**Wire location:** Immediately before `handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, syntheticResult);` at `sprint-phases.ts:505`. Use the existing `writeEvent(...)` helper from `src/orchestra/event-stream.ts:167`:

```ts
import { writeEvent } from './event-stream.js';
import { CHANNELS } from './event-stream.js'; // if added — see below
// ...
try {
  writeEvent(projectRoot, sprint.id, 'brain', '*', 'sprint.eval.synthetic-timeout', {
    taskId: task.id,
    hbAgeMs: getHeartbeatAgeMs(projectRoot, task.id),  // null if absent
    lastResult: syntheticResult,
  });
} catch (e) { debugLog('runEvaluatePhase:event:synthetic-timeout', e); }
```

**Channel-code registration:** Add `'sprint.eval.synthetic-timeout'` to the `CHANNELS` table in `src/orchestra/event-stream.ts` alongside Bug A’s `'sprint.eval.heartbeat-skip'` and Bug B’s `'sprint.eval.audit-rubric-applied'` (already documented in design Section 4 Wave 3).

**Fail-safe:** `writeEvent` already has try/catch + `console.warn` fallback (event-stream.ts:195-200) — Bug C wire never blocks evaluation.

---

## 7. ADR Delta — ADR-035 V2 Amendment

**Target ADR:** `ADR-035 — Brain ↔ Worker ↔ Auditor Verification Protocol Standard`
**Status change:** `accepted` → `accepted (Sprint 162A V2 amendment)`
**Date:** 2026-05-08

**Insertion point:** Immediately after the “Mesaj Formatı” section, before “Backward Compatibility Roadmap”. Add a new subsection:

```markdown
### Sprint 162A V2 Amendment — Synthetic Result Handling

The `WORKER→BRAIN:RESULT` channel may, in degenerate cases, be replaced by a
**Brain-synthesised result** when `waitForResults` returns without a `.result`
file (worker spawn failure, container kill, infra timeout). In all such cases:

1. **Synthetic results MUST set `selfAssessment: 'TIMEOUT_WITH_WORK'`.**
   `'NO_GO'` is reserved for *worker-self-assessed* failures. Brain MUST NOT
   write `'NO_GO'` on the worker's behalf — the absence of a `.result` is not
   an authoritative failure signal; partial work may exist on disk.

2. **`reconcileSpuriousNoGo` MUST run before any synthetic NO_GO commit.**
   Brain queries `git diff --stat` (within `task.scope`), `tsc --noEmit`, and
   `vitest run --filter` over the task's scope. If reconcile returns
   `GO_WITH_TECH_DEBT`, the synthetic NO_GO is downgraded; otherwise NO_GO
   stands with reconcile evidence attached to `result.notes`.

3. **Regression guard.** A unit test in `tests/orchestra/` MUST assert that
   the synthetic-result path produces `selfAssessment === 'TIMEOUT_WITH_WORK'`
   and not `'NO_GO'`. This guards against silent regressions of Bug C.

4. **Event emission.** Brain MUST emit `sprint.eval.synthetic-timeout`
   (broadcast) with `{taskId, hbAgeMs, lastResult}` payload before
   `handleEvaluation` is called for synthetic results. This makes the
   synthesis observable to the auditor and post-mortem reconstruction.

**Rationale:** Sprint 161 dogfood produced 49/56 false-NO_GO tasks because
synthetic-result synthesis bypassed the partial-work recovery pipeline
documented in Sprint 145. The rubric and reconcile helpers already supported
`'TIMEOUT_WITH_WORK'`; only Brain's synthetic write site mis-typed the value.
```

**Type follow-up (separate amendment, not Bug C scope):** Broaden
`SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'TIMEOUT_WITH_WORK'`
in `src/core/task-types.ts:142` so the `as SelfAssessment` cast becomes
unnecessary. Tracked as a follow-up debt item.

**ADR cross-references to update:**
- ADR-038 (RBAC): no change — Brain may write synthetic results to `.tasks/*` per existing matrix; Bug C does not expand surface.
- ADR-039: no change.

---

## 8. i18n — 12-Language Event Labels

For dashboard rendering of `sprint.eval.synthetic-timeout` events. Source key: `event.sprint.eval.synthetic-timeout.label`.

| Lang | Key | Translation |
|------|-----|-------------|
| en | `event.sprint.eval.synthetic-timeout.label` | "Worker timed out, partial work preserved" |
| tr | `event.sprint.eval.synthetic-timeout.label` | "Worker zaman aşımına uğradı, kısmi iş korundu" |
| de | `event.sprint.eval.synthetic-timeout.label` | "Worker hat das Zeitlimit überschritten, Teilarbeit erhalten" |
| fr | `event.sprint.eval.synthetic-timeout.label` | "Le worker a expiré, travail partiel préservé" |
| es | `event.sprint.eval.synthetic-timeout.label` | "Worker agotó el tiempo, trabajo parcial preservado" |
| it | `event.sprint.eval.synthetic-timeout.label` | "Worker scaduto, lavoro parziale preservato" |
| pt | `event.sprint.eval.synthetic-timeout.label` | "Worker atingiu tempo limite, trabalho parcial preservado" |
| ru | `event.sprint.eval.synthetic-timeout.label` | "Время ожидания воркера истекло, частичная работа сохранена" |
| ja | `event.sprint.eval.synthetic-timeout.label` | "ワーカーがタイムアウト、部分的な作業を保持" |
| ko | `event.sprint.eval.synthetic-timeout.label` | "워커 시간 초과, 부분 작업 보존됨" |
| zh | `event.sprint.eval.synthetic-timeout.label` | "工作进程超时，已保留部分工作" |
| ar | `event.sprint.eval.synthetic-timeout.label` | "انتهت مهلة العامل، تم الحفاظ على العمل الجزئي" |

**File targets:** `src/dashboard/i18n/{en,tr,de,fr,es,it,pt,ru,ja,ko,zh,ar}.json` (per design Section 4 Wave 3 — single shared addition across 12 lang files).

---

## 9. a11y Impact

Dashboard renders `sprint.eval.synthetic-timeout` events through the existing event component. ARIA additions piggy-back on the Bug A/B/Sprint-Stall event-component extension:

- `role="status"` (non-interrupting live region — synthetic-timeout is informational).
- `aria-live="polite"` (announce on next idle).
- `aria-label`: i18n key `event.sprint.eval.synthetic-timeout.label`.

No additional Bug C-specific ARIA work — it inherits from the design's Wave 3 a11y task (`tests/dashboard/aria-events.test.ts`).

---

## 10. Security Review

| Vector | Assessment |
|--------|------------|
| Synthetic result manipulation | The synthetic result is composed entirely within `runEvaluatePhase` from trusted inputs (`task.id`, `task.assignedWorker`, hardcoded zeros, fixed strings). No external input — **safe**. |
| `selfAssessment` value injection | The literal `'TIMEOUT_WITH_WORK'` is a constant string; no user-controlled path — **safe**. |
| Event payload injection | `taskId` flows from the validated `Task` JSON written by Brain into `.tasks/`; `hbAgeMs` is a numeric `Date.now() - mtime`; `lastResult` is the same trusted synthetic. No injection vector — **safe**. |
| `as SelfAssessment` cast bypass | Cast is type-system only, has no runtime effect. Downstream rubric and reconcile already accept the value via existing `as string` casts in `result-evaluator.ts:90, 567` — no new attack surface. |
| ADR-006 spawnSync compliance | Bug C does not invoke any subprocess. Reconcile (called downstream) uses the existing `spawnSync` pattern with literal `'tsc'` / `'vitest'` argv — already compliant. **Safe**. |
| ADR-037 RBAC | Brain is permitted to write synthetic results into `.tasks/*` per the authority matrix. No surface widening — **safe**. |

**Conclusion:** No new security concerns. The change reduces a self-inflicted false-NO_GO risk (denial-of-service against legitimate partial work) without introducing new vectors.

---

## 11. Multi-Language Surface

n/a — Bug C is **TypeScript-only** orchestration logic. The Multi-Language Adapter Pattern (Bug B INV-B PRIMARY surface) is not affected; the synthetic-result code path runs in Brain regardless of the worker's project stack. Bug C's fix is stack-agnostic.

---

## Summary Checklist for Wave 1 Coordinator

- [ ] Apply 1-LoC source change at `src/orchestra/sprint-phases.ts:501`.
- [ ] Add `tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts` (3 assertions).
- [ ] Wire `writeEvent('sprint.eval.synthetic-timeout', ...)` immediately before `handleEvaluation` at line 505.
- [ ] Register `'sprint.eval.synthetic-timeout'` in `CHANNELS` table (Wave 3, alongside Bug A/B events).
- [ ] Insert ADR-035 V2 amendment (Section 7 above) into `.brain/memory.db` via `store.upsert({ type: 'adr', id: 'adr-035', ... })` and re-export.
- [ ] Add 12-lang `event.sprint.eval.synthetic-timeout.label` keys (Section 8) to `src/dashboard/i18n/*.json` (Wave 3).
- [ ] Verify `tsc --noEmit` clean after all edits.
- [ ] Verify `npx vitest run tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts` green.
- [ ] Smoke replicate (Phase 3) shows `sprint.eval.synthetic-timeout` events emit and reconcile downgrades partial work to GO_WITH_TECH_DEBT.

---

**Subagent INV-C complete.** Ready for Wave 1 coordinator.
