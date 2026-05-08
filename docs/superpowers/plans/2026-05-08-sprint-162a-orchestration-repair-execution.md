# Sprint 162A Orchestration Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair 8 orchestration bugs (A, B, C, R2, R3, R4, R5, Sprint-Stall) discovered in Sprint 161 + introduce 6-stack multi-language adapter pattern + close Pipeline Health Beta GA gate, all at T4 god-level (source + tests + observability + ADR + smoke + i18n + a11y + security + multi-lang).

**Architecture:** ADR-043 Hot Fix with Claude Subagents — CC main agent dispatches investigation subagents in parallel (Phase 1), then applies fixes in 3 sequential waves (Phase 2), validates via Sprint 161 56-task smoke replicate (Phase 3), and finalizes documentation (Phase 4). Deckent's own FIX phase is BYPASSED (dogfood-loop avoidance — Bug A in FIX phase would re-trigger).

**Tech Stack:** TypeScript ESM (Node16), Vitest, better-sqlite3, MCP SDK, Zod v4, commander, Anthropic SDK (CLI subprocess pattern). New: TestRunnerAdapter / CoverageAdapter / BuildAdapter pattern across 6 stacks (vitest, pytest, go test, cargo test, junit, xunit).

---

## Spec Reference

This plan executes `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md` (approved 2026-05-08, T4 tier).

---

## File Structure (locked decisions from spec)

Files this plan will create:

```
src/core/lang/                                          (multi-lang adapter pattern)
├── types.ts                                            (shared interfaces)
├── stack-detector.ts                                   (auto-detect from marker files)
├── test-runner-adapter.ts                              (interface + 6 implementations)
├── coverage-adapter.ts                                 (coverage parsing per stack)
├── build-adapter.ts                                    (build verification per stack)
└── index.ts                                            (public exports)

tests/core/lang/                                        (multi-lang tests)
├── stack-detector.test.ts                              (6 stack auto-detect)
├── test-runner-adapter.test.ts                         (6 stack run/parse)
├── coverage-adapter.test.ts                            (6 stack coverage)
└── build-adapter.test.ts                               (6 stack build)

tests/orchestra/                                        (orchestration bug fix tests)
├── sprint-phases-bug-a-heartbeat-gate.test.ts          (Bug A)
├── result-evaluator-audit-rubric.test.ts               (Bug B)
├── sprint-phases-bug-c-timeout-with-work.test.ts       (Bug C)
├── sprint-controller-spawn-loop.test.ts                (Bug Sprint-Stall)
├── result-collector-heartbeat-extend.test.ts           (waitForResults)
└── event-stream-new-events.test.ts                     (8 new events)

tests/cli/commands/                                     (recovery tests)
├── recover-r2-state-reset.test.ts                      (Bug R2)
├── recover-r3-zombie-kill.test.ts                      (Bug R3)
├── recover-r4-status-sync.test.ts                      (Bug R4)
└── recover-r5-tmpfile-sweep.test.ts                    (Bug R5)

tests/dashboard/                                        (i18n + a11y tests)
├── i18n-coverage.test.ts                               (12-lang coverage)
└── aria-events.test.ts                                 (ARIA attributes)

src/dashboard/i18n/                                     (12-language event labels)
├── en.json (existing — extend)
├── tr.json (existing — extend)
├── de.json (existing — extend)
├── fr.json (NEW)
├── es.json (NEW)
├── it.json (NEW)
├── pt.json (NEW)
├── ru.json (NEW)
├── ja.json (NEW)
├── ko.json (NEW)
├── zh.json (NEW)
└── ar.json (NEW)

docs/security/                                          (per-change security review)
└── sprint-162a-review.md                               (8 bugs + adapter)

docs/superpowers/specs/                                 (Phase 1 fix-specs)
├── 2026-05-08-sprint-162a-bug-a-fix-spec.md
├── 2026-05-08-sprint-162a-bug-b-fix-spec.md
├── 2026-05-08-sprint-162a-bug-c-fix-spec.md
├── 2026-05-08-sprint-162a-bug-r2-fix-spec.md
├── 2026-05-08-sprint-162a-bug-r3-fix-spec.md
├── 2026-05-08-sprint-162a-bug-r4-fix-spec.md
├── 2026-05-08-sprint-162a-bug-r5-fix-spec.md
└── 2026-05-08-sprint-162a-bug-stall-fix-spec.md

docs/superpowers/retros/                                (Phase 4 output)
└── sprint-162a-retro.md

docs/audits/sprint-162a-smoke/                          (Phase 3 smoke output)
├── SMOKE-VALIDATION-REPORT.md
└── (replicated 56 task audit reports)
```

Files this plan will modify:

```
src/orchestra/sprint-phases.ts        (Bug A heartbeat gate, Bug C TIMEOUT_WITH_WORK)
src/orchestra/result-evaluator.ts     (Bug B auditRubric + adapter delegation)
src/orchestra/sprint-controller.ts    (Bug Sprint-Stall spawn loop)
src/orchestra/result-collector.ts     (waitForResults heartbeat-extend)
src/orchestra/sprint-lifecycle.ts     (Bug R5 cleanup hook)
src/orchestra/sprint-docs-updater.ts  (Bug R5 archiveOrphanTasks)
src/orchestra/dashboard-manager.ts    (Bug R4 sync hook)
src/cli/commands/recover.ts           (Bug R2 + R3 + R5)
src/cli/commands/cleanup.ts           (Bug R5 sweep)
src/cli/commands/status.ts            (Bug R4 cache invalidation)
src/core/event-stream.ts              (8 new event types)
.brain/memory.db                      (4 ADR amendments via store.upsert/insert)
.brain/exports/decisions.md           (regenerated via deckent memory export)
docs/ROADMAP-GOD-LEVEL.md             (Phase 4 update — close Sprint 161 FAILED state)
CLAUDE.md                             (Sprint Metrics table → sprint-162a)
```

Files this plan will NOT touch:

```
.tasks/archive/sprint-161/            (forensic evidence, READ-ONLY)
docs/audits/sprint-161/               (audit deliverables, READ-ONLY)
src/agents/                           (worker code — no orchestration repair touches workers)
src/providers/                        (provider adapters — no Sprint 162A scope)
tests/orchestra/ (existing files)     (extend via new test files; existing tests untouched)
```

---

## Phase 1 — Parallel Investigation

### Task 1: Dispatch 8 parallel investigation subagents

**Files:**
- Output: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-{a,b,c,r2,r3,r4,r5,stall}-fix-spec.md` (8 files)

- [ ] **Step 1.1: Pre-flight build state**

Run:
```bash
cd /home/alperen/deckent-dev && npx tsc --noEmit && echo "exit=$?"
```
Expected: `exit=0` (clean). If non-zero: STOP, fix tsc errors before dispatching.

- [ ] **Step 1.2: Dispatch 8 subagents in single message**

Use Agent tool with `subagent_type: general-purpose`, `run_in_background: true` for each. Send all 8 calls in ONE assistant message (per Agent tool guidance for concurrent start).

**Subagent INV-A** (Bug A heartbeat-blind synthetic NO_GO):
```
You are Sprint 162A investigation subagent INV-A — Bug A heartbeat-blind synthetic NO_GO fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: During Sprint 161, runEvaluatePhase synthesized NO_GO TaskResult for tasks that were still EXECUTING (heartbeat alive). Code at src/orchestra/sprint-phases.ts:492-525 — when collectedIds.has(task.id) is false, synthesizes NO_GO without checking heartbeat liveness. Result: 25 premature fix tasks, 87.5% false-NO_GO across sprint.

YOUR JOB: Read the code surface, design the fix, produce one fix-spec markdown.

CODE SURFACE TO READ (READ-ONLY):
- src/orchestra/sprint-phases.ts (full file, especially lines 340-530)
- src/orchestra/heartbeat-daemon.ts (full file)
- src/core/heartbeat-types.ts (full file)
- src/orchestra/result-collector.ts (waitForResults function)
- .tasks/task-{id}.hb file format (look for HEARTBEAT_TIMEOUT_MS constant)
- .deckent/config.json (heartbeat_timeout config key)

OUTPUT: Write to docs/superpowers/specs/2026-05-08-sprint-162a-bug-a-fix-spec.md

STRUCTURE (mandatory sections):
## 1. Bug evidence (Sprint 161 filesystem + RCA)
## 2. Code surface analysis (file:line list)
## 3. Proposed fix (full diff for sprint-phases.ts:492-525)
## 4. Unit test draft (Vitest, ready to drop into tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts)
## 5. Integration test scenario (3-task mini sprint with stale + fresh heartbeats)
## 6. Observability hook (event-stream event sprint.eval.heartbeat-skip — payload schema)
## 7. ADR delta (ADR-035 V2 amendment text — synthetic result handling clause)
## 8. i18n strings (12-language event labels for "Heartbeat aktif, evaluation atlandı" / "Heartbeat alive, evaluation skipped")
## 9. a11y impact (dashboard event component ARIA attributes — role="status" + aria-live="polite")
## 10. Security review (no exec attack surface; heartbeat path under .tasks/, controlled by Brain)
## 11. Multi-language surface impact (n/a for Bug A)

CONSTRAINTS:
- READ-ONLY everywhere except your one output file
- DO NOT modify src/ or .tasks/ or .deckent/
- DO NOT run sprints
- Output is markdown spec only — no code edits
- Use file:line citations for every claim
```

**Subagent INV-B** (Bug B rubric mismatch + multi-lang — PRIMARY surface):
```
You are Sprint 162A investigation subagent INV-B — Bug B rubric mismatch + multi-language adapter spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: evaluateWithRubric (src/orchestra/result-evaluator.ts:709-780) recalculates rubric scores via scoreCriterion which is hardcoded for code-writing tasks (assumes new tests written, coverage measurable). For READ-ONLY audit tasks (Sprint 161 pattern: scope.filesWrite is single docs/audits/ markdown), scoreCriterion drops scores to ~0, totalScore < passingScore × 0.7, decision=NO_GO. Worker self-assessment DONE with rubric 95/100/100/95 ignored. AT THE SAME TIME, for Sprint 162A god-level vision (multi-language project support), scoreCriterion is TypeScript/vitest hardcoded — must abstract via TestRunnerAdapter + CoverageAdapter + BuildAdapter pattern across 6 stacks (TypeScript, Python, Go, Rust, Java, C#).

YOUR JOB: Design Bug B fix INCLUDING multi-language adapter pattern. PRIMARY surface — biggest scope.

CODE SURFACE TO READ (READ-ONLY):
- src/orchestra/result-evaluator.ts (FULL file — especially evaluateWithRubric, scoreCriterion, isVerificationTask, isDocTask, validateResultSchema)
- src/orchestra/quality-assessor.ts (FULL file)
- src/core/project-stack-types.ts
- .deckent/project-stack.json (current detection output)
- src/core/types.ts (Task, TaskResult, EvaluationRubric types)

OUTPUT: Write to docs/superpowers/specs/2026-05-08-sprint-162a-bug-b-fix-spec.md

STRUCTURE (mandatory sections):
## 1. Bug evidence
## 2. Code surface analysis
## 3. Proposed fix:
   - 3a. result-evaluator.ts evaluateWithRubric refactor (full diff)
   - 3b. NEW src/core/lang/types.ts content (TestRunnerAdapter, CoverageAdapter, BuildAdapter, ProjectStack interfaces)
   - 3c. NEW src/core/lang/stack-detector.ts content (auto-detect 6 stacks from marker files)
   - 3d. NEW src/core/lang/test-runner-adapter.ts content (factory + 6 implementations: vitest, pytest, go-test, cargo-test, junit, xunit)
   - 3e. NEW src/core/lang/coverage-adapter.ts content (6 stack coverage parsing)
   - 3f. NEW src/core/lang/build-adapter.ts content (6 stack build verification)
   - 3g. NEW src/core/lang/index.ts (public exports)
   - 3h. isAuditTask helper definition (heuristic: scope.filesWrite.length === 1 && filesWrite[0].startsWith('docs/audits/'))
   - 3i. evaluateAuditTask new path with auditRubric (audit_completeness 0.4 + finding_count 0.3 + citation_density 0.2 + migration_triage 0.1)
## 4. Unit test drafts (5 test files):
   - 4a. tests/orchestra/result-evaluator-audit-rubric.test.ts
   - 4b. tests/core/lang/stack-detector.test.ts (6 stacks)
   - 4c. tests/core/lang/test-runner-adapter.test.ts (6 stacks × parse + run mock)
   - 4d. tests/core/lang/coverage-adapter.test.ts (6 stacks × coverage parse)
   - 4e. tests/core/lang/build-adapter.test.ts (6 stacks × build mock)
## 5. Integration test scenario (audit task + 6-stack sample projects in fixtures)
## 6. Observability hook (sprint.eval.audit-rubric-applied event — payload schema includes detected stack)
## 7. ADR delta (NEW ADR-047 content — Multi-Language TestRunner/Coverage/Build Adapter Pattern)
## 8. i18n strings (12-language event labels for audit rubric applied + per-stack labels)
## 9. a11y impact (dashboard stack badge ARIA labels)
## 10. Security review (no rubric injection, adapter command whitelist via STACKS table)
## 11. Multi-language surface impact (PRIMARY — full design)

CONSTRAINTS: same as INV-A.
```

**Subagent INV-C** (Bug C synthetic selfAssessment NO_GO):
```
You are Sprint 162A investigation subagent INV-C — Bug C synthetic selfAssessment NO_GO fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: src/orchestra/sprint-phases.ts:493-505 — synthetic TaskResult uses selfAssessment: 'NO_GO' which prevents reconcileSpuriousNoGo (line 369) from recovering partial work. ADR-035 verification protocol mandates TIMEOUT_WITH_WORK for partial-result recovery scenarios.

YOUR JOB: Single-line change with ADR-035 V2 amendment.

CODE SURFACE TO READ:
- src/orchestra/sprint-phases.ts:340-530
- src/orchestra/result-evaluator.ts (reconcileSpuriousNoGo function)
- ADR-035 current text in .brain/memory.db (query via deckent_memory_query if available, else .brain/exports/decisions.md)

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-c-fix-spec.md

STRUCTURE: same 11-section format as INV-A. Bug C is small surface — most sections will be brief.

CONSTRAINTS: same.
```

**Subagent INV-R2** (Bug R2 sprint-state.json freeze):
```
You are Sprint 162A investigation subagent INV-R2 — Bug R2 sprint-state.json freeze fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: deckent recover (src/cli/commands/recover.ts) archives task files but does NOT reset sprint-state.json. Sprint 161 evidence: after recover, sprint-state.json still showed phase=EXECUTE, status=ACTIVE, updatedAt 1 hour stale.

YOUR JOB: Design recover.ts mutation to write {phase:'COMPLETE', status:'FAILED', updatedAt:now} after successful archive.

CODE SURFACE TO READ:
- src/cli/commands/recover.ts (FULL file)
- src/orchestra/sprint-state.ts if exists (sprint-state lifecycle)
- src/core/types.ts (SprintPhase, SprintStatus enums)

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-r2-fix-spec.md

STRUCTURE: 11-section format. Highlights:
- Section 3: recover.ts diff with sprint-state reset
- Section 4: tests/cli/commands/recover-r2-state-reset.test.ts
- Section 6: event sprint.recover.state-reset
- Section 7: ADR-037 V2 amendment (recover RBAC bounds)

CONSTRAINTS: same.
```

**Subagent INV-R3** (Bug R3 zombie process kill):
```
You are Sprint 162A investigation subagent INV-R3 — Bug R3 zombie Brain process kill fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: deckent recover does not kill zombie Brain processes. Sprint 161 evidence: pid 286601 stayed idle for 1+ hour after sprint stall; bash exit eventually cleared it but recover should guarantee.

YOUR JOB: Design PID-bounded SIGTERM+grace+SIGKILL pattern in recover.ts. Verify PID belongs to recorded sprint Brain (not arbitrary).

CODE SURFACE TO READ:
- src/cli/commands/recover.ts
- src/orchestra/sprint-state.ts (sprint-state.json schema — does it record Brain PID? if not, design PID recording)
- ADR-006 spawnSync security pattern reference
- ADR-037 RBAC matrix

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-r3-fix-spec.md

STRUCTURE: 11-section format. Highlights:
- Section 3: recover.ts diff with PID kill (verify PID matches sprint-state.brainPid; SIGTERM with 5s grace; SIGKILL fallback)
- Section 4: tests/cli/commands/recover-r3-zombie-kill.test.ts (mock child_process)
- Section 6: event sprint.recover.zombie-killed
- Section 7: ADR-037 V2 amendment (PID bounds)
- Section 10: Security review (PID validation — reject arbitrary PIDs)

CONSTRAINTS: same.
```

**Subagent INV-R4** (Bug R4 status display lag):
```
You are Sprint 162A investigation subagent INV-R4 — Bug R4 status display cache lag fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: deckent status displays stale counts after recover (Sprint 161 evidence: post-recover showed "0/49 done" instead of correct count). Cache invalidation missing.

YOUR JOB: Design cache invalidation in deckent status command + dashboard-manager sync hook.

CODE SURFACE TO READ:
- src/cli/commands/status.ts
- src/orchestra/dashboard-manager.ts (in-memory cache logic)
- src/orchestra/sprint-state.ts (state read path)

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-r4-fix-spec.md

STRUCTURE: 11-section format. Highlights:
- Section 3: status.ts + dashboard-manager.ts diffs (cache invalidation on sprint-state mtime change)
- Section 4: tests/cli/commands/recover-r4-status-sync.test.ts
- Section 6: event sprint.recover.status-sync
- Section 10: Security review (TOCTOU — verify single-process invariant)

CONSTRAINTS: same.
```

**Subagent INV-R5** (Bug R5 .worker-*.sh + .prompt-* sweep):
```
You are Sprint 162A investigation subagent INV-R5 — Bug R5 cleanup tmpfile sweep fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: deckent recover archives task-NNN.* artifacts but does NOT sweep .worker-*.sh and .prompt-* tmpfiles. Sprint 161 evidence: 34 .worker-*.sh files left in .tasks/ after recover; manual rm needed. Sprint 160 cleanup discipline asymmetry recurring.

YOUR JOB: Add tmpfile sweep to recover.ts AND ensure cleanup.ts/sprint-lifecycle.ts/sprint-docs-updater.ts:archiveOrphanTasks all sweep tmpfiles consistently. Match Sprint 160 fix pattern: target .worker-*.sh and .prompt-* but PRESERVE forensic plants (TEST-* prefix).

CODE SURFACE TO READ:
- src/cli/commands/recover.ts
- src/cli/commands/cleanup.ts:78
- src/orchestra/sprint-lifecycle.ts:266-273
- src/orchestra/sprint-docs-updater.ts:706 (archiveOrphanTasks)
- D6 fix-spec from Sprint 161 (docs/audits/sprint-161/cc-deepdive/D6-fixture-references-non-test.md)

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-r5-fix-spec.md

STRUCTURE: 11-section format. Highlights:
- Section 3: 4-file diff (recover.ts + cleanup.ts + sprint-lifecycle.ts + sprint-docs-updater.ts) with consistent tmpfile sweep + plant preservation
- Section 4: tests/cli/commands/recover-r5-tmpfile-sweep.test.ts (plant TEST-* preserved, real tmpfiles swept)
- Section 6: event sprint.recover.tmpfile-swept (payload includes sweptCount + preservedCount)
- Section 7: ADR-039 V2 amendment (cleanup discipline tmpfile mandate)
- Section 10: Security review (path traversal — filter by .tasks/ dir + prefix match; reject ..)

CONSTRAINTS: same.
```

**Subagent INV-Stall** (Bug Sprint-Stall spawn loop deadlock — DEEPEST investigation):
```
You are Sprint 162A investigation subagent INV-Stall — Bug Sprint-Stall spawn loop deadlock fix spec.

PROJECT ROOT: /home/alperen/deckent-dev

CONTEXT: Sprint 161 evidence: 41 fix tasks queued, 0 worker spawned for >1 hour, docker ps empty, tmux ls empty. Spawn loop sessizce deadlock'landı. This is the DEEPEST investigation — root cause unclear, requires code reading + Sprint 161 sprint-state forensics.

YOUR JOB: Diagnose root cause and design fix. Likely culprits:
- src/orchestra/sprint-controller.ts (main loop)
- src/orchestra/sprint-spawner.ts (spawn dispatch)
- src/orchestra/result-collector.ts (waitForResults — does it block forever?)
- max_workers semaphore stuck?
- file lock orphan blocking spawn?

CODE SURFACE TO READ (deeper than other subagents):
- src/orchestra/sprint-controller.ts (FULL file)
- src/orchestra/sprint-spawner.ts (FULL file)
- src/orchestra/result-collector.ts (FULL file — especially waitForResults, spawn coordination)
- src/orchestra/sprint-phases.ts (runFixPhase function)
- src/orchestra/spawn-backend.ts (slot accounting)
- src/orchestra/spawn-backend-docker.ts (docker spawn path)
- .deckent/config.json (max_workers, fix_phase_enabled, max_fix_retries)
- .tasks/archive/sprint-161/ (sprint-state forensics — last status before stall)

OUTPUT: docs/superpowers/specs/2026-05-08-sprint-162a-bug-stall-fix-spec.md

STRUCTURE: 11-section format. Highlights:
- Section 1: Sprint 161 forensic evidence — last sprint state before stall, queued task count, active worker count over time
- Section 2: Code surface analysis with hypothesis (likely: waitForResults blocks indefinitely + no spawn loop progress)
- Section 3: Diff for sprint-controller.ts + sprint-spawner.ts + result-collector.ts (whichever is the actual culprit per investigation)
- Section 4: tests/orchestra/sprint-controller-spawn-loop.test.ts (integration test: queued tasks → spawned within 60s)
- Section 5: Mock 41-task FIX phase scenario — assert no deadlock
- Section 6: event sprint.spawn.deadlock-detected (payload: queuedTaskCount, spawnedCount, durationStallMs, last 5 events from stream)
- Section 7: ADR-035 V2 amendment (spawn liveness mandate)
- Section 10: Security review (rate-limit attack — max_workers config bounded)

CONSTRAINTS: same. EXTRA: investigation may take 60min vs others' 20-45min — that's expected.
```

- [ ] **Step 1.3: Wait for all 8 subagent completions**

Each Agent dispatch returns an agent ID. They run in parallel. Wait for completion notifications (not poll — the harness notifies you).

Expected: 8 fix-spec markdown files exist under `docs/superpowers/specs/2026-05-08-sprint-162a-bug-*-fix-spec.md`.

Verify:
```bash
ls -la docs/superpowers/specs/2026-05-08-sprint-162a-bug-*.md | wc -l
```
Expected: `8`

If <8: re-dispatch missing subagents.

- [ ] **Step 1.4: Cross-reference fix-specs for contradictions**

For each pair of fix-specs that touch the same file (Bug A + Bug C both touch sprint-phases.ts:492-525), verify the proposed diffs do not conflict. Pairs to check:
- Bug A + Bug C → both modify sprint-phases.ts:492-525 → fix-specs should compose (one diff that includes both changes)
- Bug R2 + R3 + R5 → all modify recover.ts → 3 diffs should compose
- Bug R5 → modifies 4 files (recover.ts + cleanup.ts + sprint-lifecycle.ts + sprint-docs-updater.ts) consistently

If contradiction found: re-dispatch INV-A + INV-C (or affected pair) with cross-reference instructions: "Read sibling fix-spec at <path> first; produce composing diff."

- [ ] **Step 1.5: Commit Phase 1 deliverables**

```bash
cd /home/alperen/deckent-dev
git add docs/superpowers/specs/2026-05-08-sprint-162a-bug-*.md
git status
```

Expected: 8 new fix-spec files staged.

DO NOT commit yet (per memory rule "başarılı sprint sonunda commit"). Stage for visibility.

---

## Phase 2 — Wave 1: Orchestration Repair + Multi-Lang Adapter

### Task 2: Apply Bug A + Bug C to sprint-phases.ts

**Files:**
- Modify: `src/orchestra/sprint-phases.ts:492-525`
- Test: `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts` (NEW)
- Test: `tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-a-fix-spec.md`
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-c-fix-spec.md`

- [ ] **Step 2.1: Read fix-specs**

Read sections 3 (Proposed fix) and 4 (Unit test draft) of bug-a-fix-spec.md and bug-c-fix-spec.md.

- [ ] **Step 2.2: Write failing test for Bug A**

Create `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts` with content from bug-a-fix-spec.md section 4. Test scenarios:
- Active heartbeat (mtime within HEARTBEAT_TIMEOUT_MS) + no result → evaluation SKIPPED (next iteration)
- Stale heartbeat (mtime > HEARTBEAT_TIMEOUT_MS) + no result → synthetic NO_GO/TIMEOUT_WITH_WORK
- Live result available → normal evaluation path

- [ ] **Step 2.3: Run failing test**

Run: `npx vitest run tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts`
Expected: FAIL (Bug A not yet fixed — current code synthesizes NO_GO regardless of heartbeat)

- [ ] **Step 2.4: Apply Bug A fix to sprint-phases.ts:492-525**

Edit `src/orchestra/sprint-phases.ts` per bug-a-fix-spec.md section 3. Add heartbeat liveness check before synthetic NO_GO. Add `sprint.eval.heartbeat-skip` event emission.

- [ ] **Step 2.5: Apply Bug C fix to sprint-phases.ts:501**

In the same Edit, change `selfAssessment: 'NO_GO'` to `selfAssessment: 'TIMEOUT_WITH_WORK'` per bug-c-fix-spec.md section 3. Add `sprint.eval.synthetic-timeout` event emission.

- [ ] **Step 2.6: Run Bug A test — verify pass**

Run: `npx vitest run tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts`
Expected: PASS

- [ ] **Step 2.7: Write Bug C test**

Create `tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts` per bug-c-fix-spec.md section 4. Verify synthetic TaskResult has `selfAssessment: 'TIMEOUT_WITH_WORK'`.

- [ ] **Step 2.8: Run Bug C test — verify pass**

Run: `npx vitest run tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts`
Expected: PASS

- [ ] **Step 2.9: Run tsc — verify clean**

Run: `npx tsc --noEmit && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 2.10: Stage**

```bash
git add src/orchestra/sprint-phases.ts tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts
git status --short
```

Expected: 3 files modified/staged.

### Task 3: Create multi-lang adapter pattern (Bug B foundation)

**Files:**
- Create: `src/core/lang/types.ts`
- Create: `src/core/lang/stack-detector.ts`
- Create: `src/core/lang/test-runner-adapter.ts`
- Create: `src/core/lang/coverage-adapter.ts`
- Create: `src/core/lang/build-adapter.ts`
- Create: `src/core/lang/index.ts`
- Test: `tests/core/lang/stack-detector.test.ts`
- Test: `tests/core/lang/test-runner-adapter.test.ts`
- Test: `tests/core/lang/coverage-adapter.test.ts`
- Test: `tests/core/lang/build-adapter.test.ts`
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-b-fix-spec.md` sections 3b-3g

- [ ] **Step 3.1: Read bug-b-fix-spec sections 3b-3g + 4b-4e**

Bug B fix-spec contains complete file contents for the 6 new files + test content for 4 test files.

- [ ] **Step 3.2: Write failing tests first (TDD)**

Create the 4 test files with content from bug-b-fix-spec.md sections 4b-4e:
- `tests/core/lang/stack-detector.test.ts` — assert detectStack(fixturePath) returns expected ProjectStack[] for each of 6 marker file scenarios
- `tests/core/lang/test-runner-adapter.test.ts` — assert factory returns correct adapter per stack, parseOutput parses each runner's output format
- `tests/core/lang/coverage-adapter.test.ts` — assert parseCoverage extracts percent for each stack format (vitest JSON, coverage.py XML, go cover txt, tarpaulin XML, jacoco XML, opencover XML)
- `tests/core/lang/build-adapter.test.ts` — assert build adapter returns BuildResult with parseErrors

- [ ] **Step 3.3: Run failing tests**

Run: `npx vitest run tests/core/lang/`
Expected: ALL FAIL (modules don't exist yet)

- [ ] **Step 3.4: Create src/core/lang/types.ts**

Use content from bug-b-fix-spec.md section 3b. Defines `ProjectStack`, `TestResult`, `CoverageResult`, `BuildResult`, `TestRunnerAdapter`, `CoverageAdapter`, `BuildAdapter` interfaces + `STACKS` constant table for 6 baseline stacks.

- [ ] **Step 3.5: Create src/core/lang/stack-detector.ts**

Use content from bug-b-fix-spec.md section 3c. Implements `detectStack(projectRoot: string): ProjectStack[]` checking marker files (package.json/tsconfig → TypeScript; pyproject.toml/requirements.txt → Python; go.mod → Go; Cargo.toml → Rust; pom.xml/build.gradle → Java; *.csproj/*.sln → C#).

- [ ] **Step 3.6: Create src/core/lang/test-runner-adapter.ts**

Use content from bug-b-fix-spec.md section 3d. 6 implementations + factory + auto-detect.

- [ ] **Step 3.7: Create src/core/lang/coverage-adapter.ts**

Use content from bug-b-fix-spec.md section 3e. 6 stack coverage parsing.

- [ ] **Step 3.8: Create src/core/lang/build-adapter.ts**

Use content from bug-b-fix-spec.md section 3f. 6 stack build verification.

- [ ] **Step 3.9: Create src/core/lang/index.ts**

Public exports — re-export types + factories + detectors. Per bug-b-fix-spec section 3g.

- [ ] **Step 3.10: Run tsc — verify multi-lang module clean**

Run: `npx tsc --noEmit src/core/lang/*.ts && echo "exit=$?"`
(Or full project tsc.) Expected: `exit=0`

- [ ] **Step 3.11: Run tests — verify pass**

Run: `npx vitest run tests/core/lang/`
Expected: ALL PASS (6 stacks × 4 test categories = ~24+ test cases pass)

- [ ] **Step 3.12: Stage**

```bash
git add src/core/lang/ tests/core/lang/
git status --short | head -15
```

### Task 4: Apply Bug B fix to result-evaluator.ts

**Files:**
- Modify: `src/orchestra/result-evaluator.ts:709-780` (evaluateWithRubric refactor)
- Test: `tests/orchestra/result-evaluator-audit-rubric.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-b-fix-spec.md` sections 3a + 3h + 3i + 4a

- [ ] **Step 4.1: Read fix-spec sections 3a + 3h + 3i + 4a**

- [ ] **Step 4.2: Write failing audit-rubric test**

Create `tests/orchestra/result-evaluator-audit-rubric.test.ts` per bug-b-fix-spec section 4a. Scenarios:
- Audit task (scope.filesWrite single docs/audits/) → evaluateAuditTask called → DONE for honest worker output
- Code-writing task → standard evaluateWithRubric path
- Verification task → existing fast-path preserved

- [ ] **Step 4.3: Run failing test**

Run: `npx vitest run tests/orchestra/result-evaluator-audit-rubric.test.ts`
Expected: FAIL (auditRubric branch not yet implemented)

- [ ] **Step 4.4: Apply result-evaluator.ts diff**

Edit `src/orchestra/result-evaluator.ts` per bug-b-fix-spec section 3a + 3h + 3i:
- Add `isAuditTask(task)` helper
- Add `evaluateAuditTask(result, task)` function with auditRubric weights (audit_completeness 0.4 + finding_count 0.3 + citation_density 0.2 + migration_triage 0.1)
- Modify `evaluateWithRubric` to delegate to `evaluateAuditTask` for audit tasks
- For non-audit tasks, delegate to TestRunnerAdapter/CoverageAdapter/BuildAdapter via stack-detector
- Add `sprint.eval.audit-rubric-applied` event emission

- [ ] **Step 4.5: Run audit-rubric test — verify pass**

Run: `npx vitest run tests/orchestra/result-evaluator-audit-rubric.test.ts`
Expected: PASS

- [ ] **Step 4.6: Run full vitest suite — verify no regression**

Run: `npx vitest run tests/orchestra/result-evaluator`
Expected: ALL PASS (no regression in existing tests)

- [ ] **Step 4.7: Run tsc**

Run: `npx tsc --noEmit && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 4.8: Stage**

```bash
git add src/orchestra/result-evaluator.ts tests/orchestra/result-evaluator-audit-rubric.test.ts
```

### Task 5: Apply Bug Sprint-Stall fix

**Files:**
- Modify: per `bug-stall-fix-spec.md` section 3 (likely `src/orchestra/sprint-controller.ts` + `src/orchestra/sprint-spawner.ts` + `src/orchestra/result-collector.ts`)
- Test: `tests/orchestra/sprint-controller-spawn-loop.test.ts` (NEW)
- Test: `tests/orchestra/result-collector-heartbeat-extend.test.ts` (NEW)

- [ ] **Step 5.1: Read bug-stall-fix-spec.md sections 1-5**

Identify EXACT root cause + EXACT files to modify per investigation output.

- [ ] **Step 5.2: Write failing test (sprint-controller spawn loop)**

Create `tests/orchestra/sprint-controller-spawn-loop.test.ts` per fix-spec section 4. Scenario: 41 queued tasks + max_workers=6 → spawn loop dispatches workers, queue drains within 60s simulated time.

- [ ] **Step 5.3: Run failing test**

Run: `npx vitest run tests/orchestra/sprint-controller-spawn-loop.test.ts`
Expected: FAIL (deadlock reproduces)

- [ ] **Step 5.4: Apply sprint-controller / spawner / result-collector diffs**

Per bug-stall-fix-spec.md section 3. Add `sprint.spawn.deadlock-detected` event emission as guard.

- [ ] **Step 5.5: Run test — verify pass**

Run: `npx vitest run tests/orchestra/sprint-controller-spawn-loop.test.ts`
Expected: PASS

- [ ] **Step 5.6: Write waitForResults heartbeat-extend test**

Create `tests/orchestra/result-collector-heartbeat-extend.test.ts` — assert waitForResults extends timeout window when heartbeats are active (max 3 extensions).

- [ ] **Step 5.7: Apply result-collector waitForResults heartbeat-extend (if not done in step 5.4)**

- [ ] **Step 5.8: Run heartbeat-extend test — verify pass**

Run: `npx vitest run tests/orchestra/result-collector-heartbeat-extend.test.ts`
Expected: PASS

- [ ] **Step 5.9: Run tsc + full sprint test suite**

Run: `npx tsc --noEmit && npx vitest run tests/orchestra/`
Expected: tsc exit 0; vitest all pass

- [ ] **Step 5.10: Stage**

```bash
git add src/orchestra/sprint-controller.ts src/orchestra/sprint-spawner.ts src/orchestra/result-collector.ts tests/orchestra/sprint-controller-spawn-loop.test.ts tests/orchestra/result-collector-heartbeat-extend.test.ts
```

### Task 6: Wave 1 build + dist sync

- [ ] **Step 6.1: Build dist**

Run: `npm run build && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 6.2: Verify dist reflects src**

Run: `grep -n "heartbeat-skip\|TIMEOUT_WITH_WORK\|audit-rubric-applied" dist/orchestra/sprint-phases.js dist/orchestra/result-evaluator.js | head -10`
Expected: matches present (Wave 1 changes in dist).

- [ ] **Step 6.3: Wave 1 commit-prep**

DO NOT commit yet — wait for Wave 2 + 3 + smoke. State all changes staged in working tree.

```bash
git status --short
```

---

## Phase 2 — Wave 2: Recovery Repair

### Task 7: Apply Bug R2 — sprint-state.json reset in recover

**Files:**
- Modify: `src/cli/commands/recover.ts` (R2 mutation)
- Test: `tests/cli/commands/recover-r2-state-reset.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-r2-fix-spec.md`

- [ ] **Step 7.1: Read bug-r2-fix-spec.md sections 3 + 4**

- [ ] **Step 7.2: Write failing test**

Create `tests/cli/commands/recover-r2-state-reset.test.ts`. Scenario: write sprint-state.json with phase=EXECUTE/status=ACTIVE; run recover; assert sprint-state.json now has phase=COMPLETE/status=FAILED/updatedAt fresh.

- [ ] **Step 7.3: Run failing test**

Run: `npx vitest run tests/cli/commands/recover-r2-state-reset.test.ts`
Expected: FAIL

- [ ] **Step 7.4: Apply recover.ts R2 diff**

Edit `src/cli/commands/recover.ts` per bug-r2-fix-spec section 3. After successful archive, write sprint-state reset. Add `sprint.recover.state-reset` event emission.

- [ ] **Step 7.5: Run test — verify pass**

Run: `npx vitest run tests/cli/commands/recover-r2-state-reset.test.ts`
Expected: PASS

- [ ] **Step 7.6: Stage**

```bash
git add src/cli/commands/recover.ts tests/cli/commands/recover-r2-state-reset.test.ts
```

### Task 8: Apply Bug R3 — zombie process kill in recover

**Files:**
- Modify: `src/cli/commands/recover.ts` (R3 PID kill)
- Test: `tests/cli/commands/recover-r3-zombie-kill.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-r3-fix-spec.md`

- [ ] **Step 8.1: Read bug-r3-fix-spec.md sections 3 + 4 + 10**

- [ ] **Step 8.2: Write failing test (mock child_process.kill)**

Create `tests/cli/commands/recover-r3-zombie-kill.test.ts`. Mock child_process.kill. Scenario: sprint-state has brainPid=12345; recover sends SIGTERM; after 5s grace, sends SIGKILL.

- [ ] **Step 8.3: Run failing test**

Run: `npx vitest run tests/cli/commands/recover-r3-zombie-kill.test.ts`
Expected: FAIL

- [ ] **Step 8.4: Apply recover.ts R3 diff**

Edit `src/cli/commands/recover.ts` per bug-r3-fix-spec section 3:
- If sprint-state.brainPid exists, verify process is alive (process.kill(pid, 0))
- Send SIGTERM, wait 5s, send SIGKILL if still alive
- Verify PID belongs to sprint Brain (security guard from section 10)
- Emit `sprint.recover.zombie-killed` event

(If sprint-state schema doesn't record brainPid, add the field — recorded at sprint start.)

- [ ] **Step 8.5: Run test — verify pass**

Run: `npx vitest run tests/cli/commands/recover-r3-zombie-kill.test.ts`
Expected: PASS

- [ ] **Step 8.6: Stage**

```bash
git add src/cli/commands/recover.ts tests/cli/commands/recover-r3-zombie-kill.test.ts
```

### Task 9: Apply Bug R4 — status display sync

**Files:**
- Modify: `src/cli/commands/status.ts`
- Modify: `src/orchestra/dashboard-manager.ts`
- Test: `tests/cli/commands/recover-r4-status-sync.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-r4-fix-spec.md`

- [ ] **Step 9.1: Read bug-r4-fix-spec.md sections 3 + 4**

- [ ] **Step 9.2: Write failing test**

Create `tests/cli/commands/recover-r4-status-sync.test.ts`. Scenario: cache holds stale count; sprint-state mtime changes; status command reads fresh count after invalidation.

- [ ] **Step 9.3: Run failing test**

Run: `npx vitest run tests/cli/commands/recover-r4-status-sync.test.ts`
Expected: FAIL

- [ ] **Step 9.4: Apply status.ts + dashboard-manager.ts diffs**

Edit per bug-r4-fix-spec section 3. Cache invalidation on sprint-state mtime change. Emit `sprint.recover.status-sync` event.

- [ ] **Step 9.5: Run test — verify pass**

Run: `npx vitest run tests/cli/commands/recover-r4-status-sync.test.ts`
Expected: PASS

- [ ] **Step 9.6: Stage**

```bash
git add src/cli/commands/status.ts src/orchestra/dashboard-manager.ts tests/cli/commands/recover-r4-status-sync.test.ts
```

### Task 10: Apply Bug R5 — tmpfile sweep across 4 files

**Files:**
- Modify: `src/cli/commands/recover.ts`
- Modify: `src/cli/commands/cleanup.ts:78`
- Modify: `src/orchestra/sprint-lifecycle.ts:266-273`
- Modify: `src/orchestra/sprint-docs-updater.ts:706` (archiveOrphanTasks)
- Test: `tests/cli/commands/recover-r5-tmpfile-sweep.test.ts` (NEW)
- Reference: `docs/superpowers/specs/2026-05-08-sprint-162a-bug-r5-fix-spec.md`

- [ ] **Step 10.1: Read bug-r5-fix-spec.md sections 3 + 4 + 10**

- [ ] **Step 10.2: Write failing test**

Create `tests/cli/commands/recover-r5-tmpfile-sweep.test.ts`. Scenarios:
- Plant `.worker-task-{id}.sh` + `.prompt-task-{id}-h.txt` in `.tasks/`
- Plant `.worker-TEST-PRESERVE.sh` + `.prompt-TEST-PRESERVE.txt` (forensic plants)
- Run recover
- Assert: real tmpfiles swept; TEST-* plants preserved

- [ ] **Step 10.3: Run failing test**

Run: `npx vitest run tests/cli/commands/recover-r5-tmpfile-sweep.test.ts`
Expected: FAIL

- [ ] **Step 10.4: Apply 4-file diff per fix-spec section 3**

Consistent sweep logic across all 4 files: filter to `.tasks/` directory, match `.worker-{taskId}` + `.prompt-{taskId}` patterns (where taskId starts with sprint number digits), exclude TEST-/MANUAL- prefixes, reject `..` traversal. Emit `sprint.recover.tmpfile-swept` event.

- [ ] **Step 10.5: Run test — verify pass**

Run: `npx vitest run tests/cli/commands/recover-r5-tmpfile-sweep.test.ts`
Expected: PASS

- [ ] **Step 10.6: Run tsc + full vitest run for recover area**

Run: `npx tsc --noEmit && npx vitest run tests/cli/commands/`
Expected: tsc exit 0; vitest all pass.

- [ ] **Step 10.7: Stage**

```bash
git add src/cli/commands/recover.ts src/cli/commands/cleanup.ts src/orchestra/sprint-lifecycle.ts src/orchestra/sprint-docs-updater.ts tests/cli/commands/recover-r5-tmpfile-sweep.test.ts
```

### Task 11: Wave 2 build + dist sync

- [ ] **Step 11.1: Build dist**

Run: `npm run build && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 11.2: Wave 2 stage all**

```bash
git status --short | wc -l
```

Expected: ~10-15 files staged across Wave 1 + Wave 2.

---

## Phase 2 — Wave 3: Cross-cutting (ADR + observability + i18n + a11y + security)

### Task 12: Add 8 new event-stream event types

**Files:**
- Modify: `src/core/event-stream.ts`
- Test: `tests/orchestra/event-stream-new-events.test.ts` (NEW)

- [ ] **Step 12.1: Read all 8 fix-specs section 6 (observability hooks)**

- [ ] **Step 12.2: Write failing test for new events**

Create `tests/orchestra/event-stream-new-events.test.ts`. Assert each of 8 new event types is registered + emits with expected payload schema:
- sprint.eval.heartbeat-skip
- sprint.eval.audit-rubric-applied
- sprint.eval.synthetic-timeout
- sprint.spawn.deadlock-detected
- sprint.recover.state-reset
- sprint.recover.zombie-killed
- sprint.recover.status-sync
- sprint.recover.tmpfile-swept

- [ ] **Step 12.3: Run failing test**

Run: `npx vitest run tests/orchestra/event-stream-new-events.test.ts`
Expected: FAIL (event types not registered yet — most should already be added in Tasks 2/4/5/7-10, but registry might need update)

- [ ] **Step 12.4: Update src/core/event-stream.ts type registry**

Add 8 event type definitions with payload type schemas per each fix-spec section 6.

- [ ] **Step 12.5: Run test — verify pass**

Run: `npx vitest run tests/orchestra/event-stream-new-events.test.ts`
Expected: PASS

- [ ] **Step 12.6: Stage**

```bash
git add src/core/event-stream.ts tests/orchestra/event-stream-new-events.test.ts
```

### Task 13: Write ADR amendments (V2 + new ADR-047)

**Files:**
- Modify (via store.upsert): ADR-035, ADR-037, ADR-039 in `.brain/memory.db`
- Insert (via store.insert): ADR-047 in `.brain/memory.db`
- Regenerate: `.brain/exports/decisions.md`

- [ ] **Step 13.1: Compose ADR-035 V2 amendment text**

Append text from bug-c-fix-spec.md section 7 + bug-stall-fix-spec.md section 7 (both target ADR-035) to existing ADR-035 content. Mandate:
- Synthetic results MUST use `selfAssessment: 'TIMEOUT_WITH_WORK'`
- reconcileSpuriousNoGo MUST run before NO_GO commit
- Spawn liveness mandate (Bug Sprint-Stall guard)

- [ ] **Step 13.2: Compose ADR-037 V2 amendment text**

Append text from bug-r2-fix-spec.md section 7 + bug-r3-fix-spec.md section 7 + bug-r4-fix-spec.md section 7 to existing ADR-037 content:
- recover.ts RBAC bounds (PID validation, sprint-state mutation bounds)
- Cache invalidation for status display

- [ ] **Step 13.3: Compose ADR-039 V2 amendment text**

Append text from bug-r5-fix-spec.md section 7 to ADR-039:
- Cleanup discipline tmpfile mandate
- Plant preservation (TEST-/MANUAL- prefix exception)

- [ ] **Step 13.4: Compose ADR-047 NEW**

From bug-b-fix-spec.md section 7 — new ADR for Multi-Language TestRunner/Coverage/Build Adapter Pattern. 6 baseline stacks + extensibility rules.

- [ ] **Step 13.5: Apply ADRs to memory.db**

Use `node -e` script with better-sqlite3 + MemoryStore class, OR use `deckent recall` + manual edit pattern. Concrete approach:

```bash
node -e '
const { MemoryStore } = require("./dist/core/memory-store.js");
const store = new MemoryStore("./.brain/memory.db");

// ADR-035 V2 amendment
const adr035 = store.getById("adr-035");
const newContent035 = adr035.content + "\n\n## V2 Amendment (Sprint 162A — 2026-05-08)\n\n[FULL AMENDMENT TEXT FROM STEP 13.1 HERE]";
store.upsert({ id: "adr-035", type: "adr", content: newContent035, status: "accepted", title: adr035.title, sprint_id: "sprint-162a" });

// ADR-037 V2 amendment
const adr037 = store.getById("adr-037");
const newContent037 = adr037.content + "\n\n## V2 Amendment (Sprint 162A — 2026-05-08)\n\n[FULL AMENDMENT TEXT FROM STEP 13.2 HERE]";
store.upsert({ id: "adr-037", type: "adr", content: newContent037, status: "accepted", title: adr037.title, sprint_id: "sprint-162a" });

// ADR-039 V2 amendment
const adr039 = store.getById("adr-039");
const newContent039 = adr039.content + "\n\n## V2 Amendment (Sprint 162A — 2026-05-08)\n\n[FULL AMENDMENT TEXT FROM STEP 13.3 HERE]";
store.upsert({ id: "adr-039", type: "adr", content: newContent039, status: "accepted", title: adr039.title, sprint_id: "sprint-162a" });

// NEW ADR-047
store.insert({
  id: "adr-047",
  type: "adr",
  title: "Multi-Language TestRunner/Coverage/Build Adapter Pattern",
  content: "[FULL ADR-047 CONTENT FROM STEP 13.4 HERE]",
  status: "accepted",
  sprint_id: "sprint-162a",
  tags: ["adr", "architecture", "multi-language"],
});

store.close();
console.log("ADRs amended/inserted successfully");
'
```

Expected output: `ADRs amended/inserted successfully`

- [ ] **Step 13.6: Regenerate exports**

Run: `npx deckent memory export`
Expected: `.brain/exports/decisions.md` regenerated with new ADR-047 + V2 amendments visible.

- [ ] **Step 13.7: Verify**

Run: `grep -c "ADR-047\|V2 Amendment (Sprint 162A" .brain/exports/decisions.md`
Expected: ≥4 (ADR-047 entry + 3 V2 amendment markers).

- [ ] **Step 13.8: Stage**

```bash
git add .brain/exports/decisions.md
```

(memory.db is gitignored.)

### Task 14: Add 12-language i18n strings

**Files:**
- Modify: `src/dashboard/i18n/en.json` (extend)
- Modify: `src/dashboard/i18n/tr.json` (extend)
- Modify: `src/dashboard/i18n/de.json` (extend)
- Create: `src/dashboard/i18n/fr.json` (NEW)
- Create: `src/dashboard/i18n/es.json` (NEW)
- Create: `src/dashboard/i18n/it.json` (NEW)
- Create: `src/dashboard/i18n/pt.json` (NEW)
- Create: `src/dashboard/i18n/ru.json` (NEW)
- Create: `src/dashboard/i18n/ja.json` (NEW)
- Create: `src/dashboard/i18n/ko.json` (NEW)
- Create: `src/dashboard/i18n/zh.json` (NEW)
- Create: `src/dashboard/i18n/ar.json` (NEW)
- Test: `tests/dashboard/i18n-coverage.test.ts` (NEW)

- [ ] **Step 14.1: Read all 8 fix-specs section 8 (i18n strings)**

Each fix-spec defines event labels in 12 languages. Aggregate into a single 12-language event-labels schema.

- [ ] **Step 14.2: Read existing en/tr/de.json structure**

Run: `head -30 src/dashboard/i18n/en.json` to understand existing JSON shape.

- [ ] **Step 14.3: Write failing test**

Create `tests/dashboard/i18n-coverage.test.ts`. Assert:
- All 12 language files exist
- Each file contains 8 new event label keys (e.g., `events.sprint.eval.heartbeat-skip`)
- Each label is non-empty translated text in target language

- [ ] **Step 14.4: Run failing test**

Run: `npx vitest run tests/dashboard/i18n-coverage.test.ts`
Expected: FAIL (only 3 lang files exist + missing keys)

- [ ] **Step 14.5: Extend en.json**

Add 8 event label keys to `src/dashboard/i18n/en.json`. Example:
```json
{
  "events": {
    "sprint": {
      "eval": {
        "heartbeat-skip": "Heartbeat alive — evaluation deferred",
        "audit-rubric-applied": "Audit rubric applied",
        "synthetic-timeout": "Worker timed out, partial work preserved"
      },
      "spawn": {
        "deadlock-detected": "Spawn loop deadlock detected"
      },
      "recover": {
        "state-reset": "Sprint state reset",
        "zombie-killed": "Zombie process terminated",
        "status-sync": "Status display synchronized",
        "tmpfile-swept": "Temporary files swept"
      }
    }
  }
}
```

- [ ] **Step 14.6: Extend tr.json + de.json**

Use translations from each fix-spec section 8.

- [ ] **Step 14.7: Create 9 new language files**

Use translations from fix-spec sections 8: fr, es, it, pt, ru, ja, ko, zh, ar. Each file structured identically (same key tree).

- [ ] **Step 14.8: Run i18n test — verify pass**

Run: `npx vitest run tests/dashboard/i18n-coverage.test.ts`
Expected: PASS

- [ ] **Step 14.9: Stage**

```bash
git add src/dashboard/i18n/ tests/dashboard/i18n-coverage.test.ts
```

### Task 15: Add ARIA attributes to dashboard event component

**Files:**
- Modify: existing dashboard event component (path TBD per investigation; likely `src/dashboard/src/components/Event.tsx` or similar)
- Test: `tests/dashboard/aria-events.test.ts` (NEW)

- [ ] **Step 15.1: Locate dashboard event component**

Run: `grep -rln "event-stream\|eventStream\|sprint.eval\|sprint.recover" src/dashboard/src/ | head -5`
Expected: 1-3 relevant files.

- [ ] **Step 15.2: Read all 8 fix-specs section 9 (a11y impact)**

Aggregate ARIA attribute requirements:
- `role="status"` for non-critical info events (heartbeat-skip, audit-rubric-applied, status-sync)
- `role="alert"` for critical events (deadlock-detected, zombie-killed)
- `aria-live="polite"` for status events; `aria-live="assertive"` for alerts
- `aria-label` referencing i18n event label string

- [ ] **Step 15.3: Write failing a11y test**

Create `tests/dashboard/aria-events.test.ts` (use `@testing-library/react` + jsdom). Render event component with each of 8 event types; assert correct role + aria-live + aria-label per WCAG 2.1 AA.

- [ ] **Step 15.4: Run failing test**

Run: `npx vitest run tests/dashboard/aria-events.test.ts`
Expected: FAIL

- [ ] **Step 15.5: Apply ARIA attributes to event component**

Edit dashboard event component file (located in step 15.1). Add role/aria-live/aria-label per fix-specs section 9 mapping.

- [ ] **Step 15.6: Run test — verify pass**

Run: `npx vitest run tests/dashboard/aria-events.test.ts`
Expected: PASS

- [ ] **Step 15.7: Stage**

```bash
git add src/dashboard/src/ tests/dashboard/aria-events.test.ts
```

### Task 16: Compile security review

**Files:**
- Create: `docs/security/sprint-162a-review.md`

- [ ] **Step 16.1: Read all 8 fix-specs section 10 (security review)**

- [ ] **Step 16.2: Compile docs/security/sprint-162a-review.md**

Write file with structure:
```markdown
# Sprint 162A Security Review

**Date:** 2026-05-08
**Tier:** T4 (god-level — per-change security review mandatory)
**Reference ADRs:** ADR-006, ADR-035, ADR-037, ADR-039, ADR-047

## Bug A — heartbeat-blind synthetic NO_GO
- Threat surface: ...
- Mitigation: ...
- Residual risk: ...

## Bug B — rubric mismatch + multi-lang
... (per bug-b-fix-spec section 10)

## Bug C — synthetic selfAssessment
...

## Bug R2 — sprint-state.json reset
...

## Bug R3 — zombie process kill
- Threat surface: arbitrary PID kill
- Mitigation: PID validation against sprint-state.brainPid
- Residual risk: race window between PID check and kill — accepted (single-process invariant)

## Bug R4 — status display sync
...

## Bug R5 — tmpfile sweep
- Threat surface: path traversal via .. in filename
- Mitigation: filter to .tasks/ + prefix match; reject ..
- Residual risk: none

## Bug Sprint-Stall — spawn loop
- Threat surface: rate-limit attack via task queue flooding
- Mitigation: max_workers config-bounded
- Residual risk: none

## Multi-Language Adapter Pattern
- Threat surface: arbitrary command exec via stack adapter
- Mitigation: STACKS table whitelist; user cannot inject arbitrary stack; ADR-006 spawnSync pattern preserved across all 6 adapters
- Residual risk: none
```

- [ ] **Step 16.3: Stage**

```bash
git add docs/security/sprint-162a-review.md
```

### Task 17: Wave 3 build + final tsc/vitest

- [ ] **Step 17.1: Build dist**

Run: `npm run build && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 17.2: Run full vitest suite**

Run: `npx vitest run`
Expected: ALL pass (including all new tests from Tasks 2-15).

- [ ] **Step 17.3: Run tsc**

Run: `npx tsc --noEmit && echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 17.4: Stage all Wave 3**

```bash
git status --short
```

Expected: ~30+ files staged across Wave 1 + 2 + 3.

---

## Phase 3 — Smoke Replication

### Task 18: Pre-smoke setup

- [ ] **Step 18.1: Restore Sprint 161 DIRECTIVES.md**

Run:
```bash
cp .brain/archive/DIRECTIVES-sprint-161.md DIRECTIVES.md
head -5 DIRECTIVES.md
```

Expected: First line shows "DIRECTIVES — Sprint 161: God-Level READ-ONLY Self-Audit (Lane 1)" — but we'll change `sprint-161` to `sprint-162a-smoke` next step.

- [ ] **Step 18.2: Adjust DIRECTIVES sprint id for smoke**

Edit DIRECTIVES.md: replace all occurrences of `sprint-161` with `sprint-162a-smoke` and `T-161-` with `T-162A-SMOKE-`. Keep all 56 task definitions intact.

- [ ] **Step 18.3: USER APPROVAL CHECKPOINT — smoke sprint start**

Surface to user:
> "Smoke sprint about to start: 56-task Sprint 161 replicate with fixed orchestration. Expected: 0% false-NO_GO, all 56 tasks DONE/GO_WITH_TECH_DEBT, < 6h duration. Background bash. Proceed?"

Wait for explicit user OK.

### Task 19: Spawn smoke sprint

- [ ] **Step 19.1: Pre-flight doctor**

Run: `npx deckent doctor 2>&1 | tail -10`
Expected: Healthy state (Claude session active, Memory V2 healthy).

- [ ] **Step 19.2: Plan dry-run**

Run: `npx deckent plan --structured --dry-run --no-confirm 2>&1 | tail -10`
Expected: 56 tasks planned.

- [ ] **Step 19.3: Spawn smoke sprint background**

Run: `npx deckent start --auto-approve` (with `run_in_background: true` via Bash tool).
Expected: Background bash ID returned.

### Task 20: Monitor smoke sprint

- [ ] **Step 20.1: Spawn Monitor for sprint completion + boundary integrity**

Use Monitor tool with:
- `persistent: true`
- `timeout_ms: 25200000` (7h, exceeds 6h target)
- Command: poll every 180s — check phase, result count, boundary integrity (git diff outside docs/audits/sprint-162a-smoke/), emit on phase transitions and any boundary violation.

- [ ] **Step 20.2: Wait for sprint COMPLETE notification**

Sprint background bash will notify on completion.

- [ ] **Step 20.3: Stop monitor**

After sprint COMPLETE: `TaskStop` the monitor.

### Task 21: Validate smoke success criteria

**Files:**
- Create: `docs/audits/sprint-162a-smoke/SMOKE-VALIDATION-REPORT.md`

- [ ] **Step 21.1: Count results vs originals**

Run:
```bash
total=$(ls .tasks/task-162A-SMOKE-*.json 2>/dev/null | grep -v "\-fix" | wc -l)
results=$(ls .tasks/task-162A-SMOKE-*.result 2>/dev/null | grep -v "\-fix" | wc -l)
echo "originals=$total results=$results"
```

Expected: `originals=56 results=56` — all completed.

- [ ] **Step 21.2: Compute false-NO_GO rate**

Run a script to count: for each result file, compare `selfAssessment` (worker) vs `evaluationDecision` (Brain). Compute false-NO_GO = (worker said DONE/GO_WITH_TECH_DEBT but Brain said NO_GO).

```bash
node -e '
const fs = require("fs"); const path = require("path");
const results = fs.readdirSync(".tasks").filter(f => f.startsWith("task-162A-SMOKE-") && f.endsWith(".result"));
let total = results.length, falseNoGo = 0, alignedDone = 0, alignedTd = 0, alignedNoGo = 0;
for (const f of results) {
  const r = JSON.parse(fs.readFileSync(path.join(".tasks", f), "utf-8"));
  const self = r.selfAssessment;
  const ev = r.evaluationDecision;
  if ((self === "DONE" || self === "GO_WITH_TECH_DEBT") && ev === "NO_GO") falseNoGo++;
  else if (self === "DONE" && ev === "DONE") alignedDone++;
  else if (self === "GO_WITH_TECH_DEBT" && ev === "GO_WITH_TECH_DEBT") alignedTd++;
  else if (self === "NO_GO" && ev === "NO_GO") alignedNoGo++;
}
console.log({total, falseNoGo, alignedDone, alignedTd, alignedNoGo, falseNoGoRate: (falseNoGo/total*100).toFixed(2) + "%"});
'
```

Expected: `falseNoGoRate: 0.00%` (Sprint 161 baseline was 87.50%).

- [ ] **Step 21.3: Verify all 8 new event types fired**

Run:
```bash
for ev in sprint.eval.heartbeat-skip sprint.eval.audit-rubric-applied sprint.eval.synthetic-timeout sprint.spawn.deadlock-detected sprint.recover.state-reset sprint.recover.zombie-killed sprint.recover.status-sync sprint.recover.tmpfile-swept; do
  count=$(grep -c "$ev" .deckent/event-stream.jsonl 2>/dev/null || echo 0)
  echo "$ev: $count occurrences"
done
```

Expected: ≥1 occurrence for at least 4 events (others may be unused this sprint — acceptable). Critical: `sprint.eval.heartbeat-skip` should fire many times (replaces the false-NO_GO synthesis path).

- [ ] **Step 21.4: Verify boundary integrity**

Run: `git diff --name-only HEAD -- ':!docs/audits/sprint-162a-smoke/' ':!.tasks/' ':!.deckent/' ':!.brain/'`
Expected: empty (only Wave 1+2+3 staged changes from earlier tasks; smoke didn't break boundary).

- [ ] **Step 21.5: Compute sprint duration**

Read sprint start + end timestamps, compute delta.
Expected: < 6h.

- [ ] **Step 21.6: Write SMOKE-VALIDATION-REPORT.md**

Create `docs/audits/sprint-162a-smoke/SMOKE-VALIDATION-REPORT.md`:

```markdown
# Sprint 162A Smoke Validation Report

**Date:** 2026-05-08
**Source DIRECTIVES:** Sprint 161 birebir replicate (56 task)

## Success criteria

| Criterion | Target | Actual | Pass? |
|-----------|-------:|-------:|:-----:|
| Task completion | 56/56 | {N}/56 | ✅/❌ |
| False-NO_GO rate | 0% | {N}% | ✅/❌ |
| Boundary integrity | empty | empty / N files | ✅/❌ |
| New event types fired | ≥1 each | {table} | ✅/❌ |
| Sprint duration | < 6h | {Xh Ym} | ✅/❌ |
| Multi-lang adapter exercised | 6/6 | {N}/6 | ✅/❌ |

## Comparison vs Sprint 161 baseline

| Metric | Sprint 161 | Sprint 162A smoke | Delta |
|--------|----------:|----------:|-------:|
| Task completion | 7/56 (12.5%) | {N}/56 ({pct}%) | {delta} |
| False-NO_GO rate | 87.50% | {N}% | {delta} |
| Sprint duration | stalled >1h, recover | {duration} | {delta} |

## Conclusion

{PASS / FAIL with detail}
```

- [ ] **Step 21.7: Stage smoke report**

```bash
git add docs/audits/sprint-162a-smoke/
```

- [ ] **Step 21.8: If smoke FAILED: iterate Phase 1**

If false-NO_GO > 0% or task completion < 56: re-dispatch INV-A/B/C/Stall with new evidence (the smoke result files). Iterate Phase 1 → Phase 2 affected waves → Phase 3 again. Max 3 iterations; escalate to user if 3 iterations fail.

If smoke PASSED: proceed to Phase 4.

---

## Phase 4 — Documentation + ROADMAP

### Task 22: Write Sprint 162A retro

**Files:**
- Create: `docs/superpowers/retros/sprint-162a-retro.md`

- [ ] **Step 22.1: Compose retro content**

```markdown
# Sprint 162A Retrospective

**Date:** 2026-05-08
**Tier achieved:** T4 (god-level — all 9 dimensions delivered)
**Spec:** docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md
**Plan:** docs/superpowers/plans/2026-05-08-sprint-162a-orchestration-repair-execution.md

## Bugs closed (8/8)

[Per-bug summary: A, B, C, R2, R3, R4, R5, Sprint-Stall — what changed, evidence]

## New capability

- Multi-language project support: 6 baseline stacks (TS, Py, Go, Rust, Java, C#)
- 8 new observability event types
- 12-language i18n
- ARIA accessibility for dashboard events

## Validation evidence

- Smoke replicate: 56/56 tasks, {N}% false-NO_GO (vs Sprint 161 87.5%)
- Per-bug unit tests: 9 unit + 3 integration = 12 tests pass
- Multi-lang adapter tests: 18 tests pass (6 stacks × 3 dimensions)
- ADR amendments: ADR-035/037/039 V2 + new ADR-047
- Security review: 8 sections + adapter section

## Regression guards

[How does Sprint 162A prevent recurrence — list new test coverage + observability + ADR clauses]

## Sprint 161 FAILED state CLOSED

Sprint 161 marked FAILED in ROADMAP-GOD-LEVEL.md — closure documented in ROADMAP entry below.

## Beta GA gate update

| Gate | Sprint 161 | Sprint 162A |
|------|----------|------------|
| Pipeline Health | ⚠️ REGRESSION | ✅ closed via 162A smoke |
| Documentation sync | ⚠️ REGRESSION | (Sprint 162C target — pending) |
```

- [ ] **Step 22.2: Stage**

```bash
git add docs/superpowers/retros/sprint-162a-retro.md
```

### Task 23: Update ROADMAP-GOD-LEVEL.md

**Files:**
- Modify: `docs/ROADMAP-GOD-LEVEL.md`

- [ ] **Step 23.1: Update line 7 (Last update) and line 8 (Next audit)**

Edit ROADMAP. Replace existing values with Sprint 162A details + Sprint 162B/C/D/E next steps.

- [ ] **Step 23.2: Insert Sprint 162A section before Sprint 161 section**

Add new section "## ⚡ 2026-05-08 — Sprint 162A Orchestration Repair Closed" with:
- Brief summary
- 8 bugs closed
- Multi-lang adapter pattern introduced
- Validation evidence (smoke replicate metrics)
- Beta GA gate updates
- Reference to Sprint 162B/C/D/E pending sprints

- [ ] **Step 23.3: Stage**

```bash
git add docs/ROADMAP-GOD-LEVEL.md
```

### Task 24: Update CLAUDE.md Sprint Metrics + memory

**Files:**
- Modify: `CLAUDE.md` (Sprint Metrics table)
- Create: `/home/alperen/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint162a_orchestration_closed.md`

- [ ] **Step 24.1: Update CLAUDE.md Sprint Metrics**

Replace table with Sprint 162A actuals (sprint id, task count, completion rate, duration).

- [ ] **Step 24.2: Write auto memory entry**

Create memory file with content:
```markdown
---
name: Sprint 162A orchestration closed
description: 8 orchestration bugs closed (A, B, C, R2-R5, Sprint-Stall) + 6-stack multi-lang adapter + new ADR-047 + 12-lang i18n + a11y dashboard + per-change security review; T4 god-level achieved; Sprint 161 FAILED state closed
type: project
---

[Detailed bug-by-bug summary + multi-lang capability + Beta GA gate updates]
```

- [ ] **Step 24.3: Update memory MEMORY.md index**

Add line referencing new memory file.

- [ ] **Step 24.4: Stage**

```bash
git add CLAUDE.md
# Memory files are outside repo; auto-saved
```

### Task 25: USER APPROVAL CHECKPOINT — Final commit decision

- [ ] **Step 25.1: Surface final state to user**

```
Sprint 162A complete.

Wall-clock duration: {T+0 to T+now} hours
Phase 1: 8 fix-specs produced (parallel, ~2h)
Phase 2: 3 waves applied (~14h)
  Wave 1: orchestration repair + multi-lang adapter (sprint-phases, result-evaluator, sprint-controller, multi-lang module)
  Wave 2: recovery repair (recover.ts + cleanup paths + status sync)
  Wave 3: cross-cutting (8 new events + 4 ADR + 12-lang i18n + ARIA + security review)
Phase 3: smoke replicate {PASS / FAIL with metrics}
Phase 4: retro + ROADMAP update + memory

Test count: 30+ new tests, 100% pass
Build: tsc clean, vitest clean
Boundary integrity: PASS
False-NO_GO rate: Sprint 161 87.5% → Sprint 162A {N}%
Multi-language baseline: 6 stacks, 18 adapter tests pass

All changes staged in working tree (uncommitted per project rule).

Files staged: ~40+ across src/, tests/, docs/, .brain/exports/, memory/
Deliverables ready for review:
- docs/superpowers/retros/sprint-162a-retro.md
- docs/audits/sprint-162a-smoke/SMOKE-VALIDATION-REPORT.md
- docs/security/sprint-162a-review.md
- ROADMAP-GOD-LEVEL.md updates
- 8 fix-specs under docs/superpowers/specs/

Please review. When ready:
1. Approve commit (atomic single commit OR partitioned commits per wave)
2. Suggest changes (will iterate)
3. Hold for separate session
```

- [ ] **Step 25.2: Wait for user response**

If "approve commit" → execute commit (atomic OR partitioned per user choice).
If "changes needed" → iterate.
If "hold" → end session, working tree preserved.

This is the natural plan terminus.

---

## Self-Review Checklist (run by writer before handoff)

**Spec coverage:** Skim each section of the spec.

- ✅ Spec §1 Vision → covered in plan introduction + ADR-043 reference
- ✅ Spec §2 Architecture → covered in Phase structure
- ✅ Spec §3 Phase 1 (8 subagents) → Task 1 (8 subagent prompts inline)
- ✅ Spec §4 Wave 1 (orchestration + multi-lang) → Tasks 2-6
- ✅ Spec §4 Wave 2 (recovery) → Tasks 7-11
- ✅ Spec §4 Wave 3 (cross-cutting) → Tasks 12-17
- ✅ Spec §5 Phase 3 smoke → Tasks 18-21
- ✅ Spec §6 Phase 4 doc → Tasks 22-25
- ✅ Spec §7 T4 coverage matrix → all 9 dimensions covered (source + tests + obs + ADR + smoke + i18n + a11y + security + multi-lang)
- ✅ Spec §8 success criteria → Task 21.6 SMOKE-VALIDATION-REPORT enforces
- ✅ Spec §9 constraints → all hard rules respected (READ-ONLY archive, deckent FIX bypass, no tier downgrade, kill/cleanup user approval)

**Placeholder scan:** No "TBD"/"TODO"/"fill in" found. Some "[FULL ... TEXT FROM STEP X.Y HERE]" markers in Task 13.5 — these are explicit forwards to fix-spec content rather than placeholders, acceptable per skill (the actual content lives in fix-spec, plan describes how to extract).

**Type/path consistency:**
- File paths consistent across tasks (e.g., `src/orchestra/sprint-phases.ts:492-525` referenced identically in Task 2 and spec §3)
- Test file paths consistent (e.g., `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts` matches spec)
- Bug IDs consistent (A, B, C, R2-R5, Sprint-Stall — 8 total throughout)
- Multi-lang adapter file paths consistent (`src/core/lang/{types,stack-detector,test-runner-adapter,coverage-adapter,build-adapter,index}.ts`)
- Event type names consistent (`sprint.eval.*`, `sprint.spawn.*`, `sprint.recover.*` — 8 total)

**Scope check:** Single Sprint 162A scope (orchestration repair + multi-lang adapter foundation). Sprint 162B/C/D/E mentioned but explicitly out-of-scope. ✅

No issues found requiring inline fix.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-sprint-162a-orchestration-repair-execution.md`.

**Two execution options:**

1. **Subagent-Driven (recommended for ADR-043 pattern)** — I dispatch a fresh subagent per task using `superpowers:subagent-driven-development`. Two-stage review between tasks. Best for: parallel investigation in Phase 1 + isolated wave applications. Aligns with ADR-043 Hot Fix with Claude Subagents pattern.

2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints (Phase boundaries are natural checkpoints; Tasks 18+19 + 25 are explicit user gates). Best for: visible task-by-task progress without subagent context overhead.

**Recommendation: Option 1 (Subagent-Driven)** — sebepleri:
- ADR-043 Hot Fix pattern explicitly mandates Claude Code subagent dispatch (Sprint 154/152.5/150A precedent)
- Phase 1 is inherently parallel (8 subagents simultaneously) — only subagent-driven supports this
- Each Wave is isolated (Wave 1 ≠ Wave 2 ≠ Wave 3 file regions); fresh subagent per wave avoids context pollution
- Two-stage review per task = additional QA layer matching T4 god-level discipline
- Smoke (Phase 3) is naturally async background; subagent-driven harness already supports this

**Awaiting user choice before invoking the next sub-skill.**
