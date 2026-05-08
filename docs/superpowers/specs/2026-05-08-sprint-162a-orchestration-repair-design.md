# Sprint 162A — Orchestration Repair Design (T4 god-level)

**Created:** 2026-05-08
**Author:** Coordinator (CC main agent), brainstormed with Alperen
**Status:** APPROVED — ready for implementation plan
**Tier:** T4 (god-level: source + tests + observability + ADR + smoke + i18n + a11y + security + multi-language extensibility)
**Reference:**
- `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md` — RCA evidence base
- `docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md` — consolidator's 24-task draft (this design refines Sprint 162A subset)
- `docs/ROADMAP-GOD-LEVEL.md` — canonical roadmap, Sprint 161 FAILED state to be closed via 162A
- ADR-043 (Hot Fix with Claude Subagents) — execution method
- ADR-035, ADR-037, ADR-039 (V2 amendments target)

---

## 1. Vision & Scope

Sprint 162A repairs deckent's Brain orchestration broken mid-flight during Sprint 161, evidenced by 87.5% false-NO_GO rate (49/56 tasks falsely Failed when worker self-assessment was DONE for all 28 finalized). Eight bugs (A, B, C, R2, R3, R4, R5, Sprint-Stall) caused the failure; this sprint closes all eight at god-level T4 quality + introduces multi-language project extensibility (6 stacks: TypeScript, Python, Go, Rust, Java, C#/.NET) so future audit sprints validate beyond TypeScript-only assumptions.

### Why this sprint matters

- **BLOCKER for all other Sprint 162 themes** (B/C/D/E) — no future sprint can run safely until orchestration repaired
- **Pipeline Health Beta GA gate REGRESSION** (per Sprint 161 audit) — 162A closes this gate
- **Multi-language extensibility** = positioning Deckent as god-level enterprise+ product (per memory `project_deckent_god_level_vision.md`); TypeScript-only is a competitive limitation vs OpenClaw (multi-language skills) and Devin (any-language)
- **Sprint 154 hot fix was T1** (source only) → regressed in Sprint 161; Sprint 162A T4 prevents recurrence with full coverage matrix

### Out of scope (deferred to other Sprint 162 sub-sprints)

- ADR-010/038/005/042/035 amendments (Sprint 162B — separate ADR work)
- Documentation pollution cleanup (Sprint 162C)
- Library migration / D9 F13 security beyond review (Sprint 162D)
- Public-flip prep / D5b matrix execution (Sprint 162E)
- `tests/` directory broad cleanup (Sprint 162F+ — separate concern)
- Future stacks beyond 6 baseline (Ruby/PHP/Elixir/Kotlin/Swift) — own sprints or community contributions

### What god-level T4 means here

Per memory rule `feedback_t3_minimum_discipline_baseline.md`: T4 = source fixes + targeted unit tests + observability instrumentation + ADR amendments + smoke replication + i18n (UI/output messages) + accessibility audit (where applicable) + security review per change + multi-language project extensibility (where architectural surface implicates). All 8 bugs covered across all 9 dimensions. No tier downgrade permitted.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Parallel Investigation (~2h)                      │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐  │
│  │ Bug  │ Bug  │ Bug  │ Bug  │ Bug  │ Bug  │ Bug  │ Bug  │  │
│  │  A   │  B   │  C   │  R2  │  R3  │  R4  │  R5  │Stall │  │
│  └──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬───┘  │
│     ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼       │
│  8× fix-spec.md (code read + test draft + ADR delta + i18n) │
└──────────────────────────┬──────────────────────────────────┘
                           │ harmanla
┌──────────────────────────▼──────────────────────────────────┐
│  Phase 2: Coherent Wave Application (~14h)                  │
│                                                              │
│  Wave 1: Orchestration Repair (Bug A+B+C+Stall +            │
│          multi-lang TestRunner/Coverage/Build adapter)       │
│  Wave 2: Recovery Repair (Bug R2+R3+R4+R5)                   │
│  Wave 3: Cross-cutting (ADR + observability + i18n + a11y +  │
│          security review compile)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Phase 3: Smoke Replication (~2h)                            │
│  Sprint 161 56-task re-run, %0 false-NO_GO target            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Phase 4: Documentation + ROADMAP (~2h)                     │
│  Sprint 162A retro + ADR V2 + ROADMAP update + memory       │
└─────────────────────────────────────────────────────────────┘

Total wall-clock: ~20h (parallel investigation saves ~2h vs strict sequential)
Execution method: ADR-043 Claude Code subagent driven; deckent FIX phase YASAK
```

### Lifecycle

| Time | Phase | Output |
|------|-------|--------|
| T+0 | Phase 1 dispatch (8 parallel investigation subagents) | 8 fix-spec.md |
| T+2h | Phase 2 Wave 1 (orchestration + multi-lang adapters) | source + tests committed |
| T+10h | Phase 2 Wave 2 (recovery repair) | source + tests committed |
| T+14h | Phase 2 Wave 3 (ADR + observability + i18n + a11y + security) | ADR V2 + i18n strings + dashboard ARIA + security doc |
| T+16h | Phase 3 smoke replicate | 56-task re-run validated |
| T+18h | Phase 4 doc + ROADMAP | retro + memory + ROADMAP update |
| T+20h | DONE | All success criteria met |

---

## 3. Phase 1 — Parallel Investigation

8 paralel CC subagent dispatch (single message, multiple Agent tool_use blocks per Agent tool guidance). Each subagent produces ONE fix-spec markdown.

### Subagent prompts (template)

Each subagent receives a domain-specific prompt:
1. **Code surface to read** (file:line range)
2. **Bug description** + Sprint 161 evidence (filesystem + result file evidence cited)
3. **Required output** = `docs/superpowers/specs/2026-05-08-sprint-162a-bugN-fix-spec.md` containing:
   - Code diff (proposed source change)
   - Unit test draft (Vitest, ready to drop into `tests/`)
   - Integration test scenario (where applicable)
   - Observability hook (event-stream event name + payload)
   - ADR delta (which ADR amends + new clauses needed)
   - i18n strings (12-language event labels)
   - a11y impact (ARIA attributes for dashboard render)
   - Security review (per ADR-006 spawnSync + ADR-037 RBAC + path traversal)
   - Multi-language surface (where applicable; for Bug B PRIMARY surface)

### Subagent table

| ID | Bug | Code surface | Estimated investigation time |
|----|-----|--------------|------------------------------|
| INV-A | Bug A heartbeat-blind synthetic NO_GO | `src/orchestra/sprint-phases.ts:492-525`, `src/orchestra/heartbeat-daemon.ts`, `src/core/heartbeat-types.ts` | ~30min |
| INV-B | Bug B rubric mismatch + multi-lang | `src/orchestra/result-evaluator.ts:709-780`, `src/orchestra/quality-assessor.ts`, `src/core/project-stack-types.ts`, scoreCriterion + project stack detection | ~60min (PRIMARY multi-lang surface) |
| INV-C | Bug C synthetic selfAssessment NO_GO | `src/orchestra/sprint-phases.ts:493-505`, ADR-035 verification protocol | ~20min |
| INV-R2 | Bug R2 sprint-state.json freeze | `src/cli/commands/recover.ts`, sprint-state lifecycle | ~30min |
| INV-R3 | Bug R3 zombie process kill | `src/cli/commands/recover.ts`, process tree handling | ~45min (process management surface) |
| INV-R4 | Bug R4 status display lag | `src/cli/commands/status.ts`, `src/orchestra/dashboard-manager.ts`, in-memory cache | ~30min |
| INV-R5 | Bug R5 .worker-*.sh + .prompt-* sweep | `src/cli/commands/cleanup.ts`, `src/orchestra/sprint-lifecycle.ts:266+`, `src/orchestra/sprint-docs-updater.ts:706+` (archiveOrphanTasks), `src/cli/commands/recover.ts` | ~30min |
| INV-Stall | Bug Sprint-Stall spawn loop deadlock | `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-spawner.ts`, `src/orchestra/result-collector.ts:waitForResults` | ~60min (deepest investigation) |

### Coordinator role during Phase 1

- Dispatch 8 subagents in single message
- Wait for all 8 completion notifications
- Read each fix-spec.md in turn (or via consolidator agent if combined synthesis preferred)
- Verify all fix-specs produce coherent picture (no contradictions between bug fixes)
- If contradictions: re-dispatch affected subagents with cross-references

---

## 4. Phase 2 — Wave Application

### Wave 1: Orchestration Repair + Multi-Language Adapter (~8h)

#### Files modify

| Path | Change |
|------|--------|
| `src/orchestra/sprint-phases.ts:492-525` | Bug A heartbeat gate (skip evaluate if hb age < HEARTBEAT_TIMEOUT_MS) + Bug C `selfAssessment: 'TIMEOUT_WITH_WORK'` (line 501) |
| `src/orchestra/result-evaluator.ts:709-780` | Bug B auditRubric branch + delegation to TestRunner/Coverage/Build adapters |
| `src/orchestra/sprint-controller.ts` | Bug Sprint-Stall spawn loop fix (per INV-Stall fix-spec) |
| `src/orchestra/result-collector.ts` | waitForResults heartbeat-aware extension (max 3x window) |

#### Files create — Multi-Language Adapter Pattern

| Path | Purpose |
|------|---------|
| `src/core/lang/types.ts` | Shared types: `TestRunnerAdapter`, `CoverageAdapter`, `BuildAdapter`, `ProjectStack`, `TestResult`, `CoverageResult`, `BuildResult` |
| `src/core/lang/test-runner-adapter.ts` | Interface + factory + 6 implementations (vitest, pytest, go-test, cargo-test, junit, xunit) |
| `src/core/lang/coverage-adapter.ts` | Coverage parsing per stack (vitest JSON, coverage.py, go cover, tarpaulin, jacoco, opencover) |
| `src/core/lang/build-adapter.ts` | Build verification per stack (tsc, mypy/ruff, go build, cargo build, javac, dotnet build) |
| `src/core/lang/stack-detector.ts` | Auto-detect from marker files; extends `.deckent/project-stack.json` |
| `src/core/lang/index.ts` | Public exports |

#### Tests create

| Path | Coverage |
|------|----------|
| `tests/orchestra/sprint-phases-bug-a-heartbeat-gate.test.ts` | Bug A: hb-aware skip / hb-stale synthesis paths |
| `tests/orchestra/result-evaluator-audit-rubric.test.ts` | Bug B: auditRubric branch entry + delegation |
| `tests/orchestra/sprint-phases-bug-c-timeout-with-work.test.ts` | Bug C: synthetic uses TIMEOUT_WITH_WORK |
| `tests/orchestra/sprint-controller-spawn-loop.test.ts` | Bug Sprint-Stall: spawn loop progress, no deadlock |
| `tests/orchestra/result-collector-heartbeat-extend.test.ts` | waitForResults extension on active heartbeat |
| `tests/core/lang/test-runner-adapter.test.ts` | 6 stack adapter implementations |
| `tests/core/lang/coverage-adapter.test.ts` | 6 stack coverage parse |
| `tests/core/lang/build-adapter.test.ts` | 6 stack build verify |
| `tests/core/lang/stack-detector.test.ts` | 6 stack auto-detect from marker files |

#### Multi-Language Adapter Pattern detail

```typescript
// src/core/lang/types.ts
export interface ProjectStack {
  name: 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'csharp';
  rootMarkers: string[];      // e.g. ['package.json', 'tsconfig.json'] for TypeScript
  testRunner: string;          // e.g. 'vitest'
  coverageTool: string;        // e.g. 'vitest-coverage'
  buildTool: string;           // e.g. 'tsc'
}

export interface TestResult {
  passed: boolean;
  passCount: number;
  failCount: number;
  skipCount: number;
  failures: Array<{ name: string; message: string; file?: string; line?: number }>;
}

export interface CoverageResult {
  percent: number;             // 0-100
  filesCovered: number;
  filesTotal: number;
  perFile?: Record<string, number>;
}

export interface BuildResult {
  passed: boolean;
  errors: Array<{ file: string; line: number; message: string }>;
}

export interface TestRunnerAdapter {
  name: ProjectStack['testRunner'];
  detect(projectRoot: string): boolean;
  runTests(scope: string[]): Promise<TestResult>;
  parseOutput(rawStdout: string, rawStderr?: string): TestResult;
}

export interface CoverageAdapter {
  name: ProjectStack['coverageTool'];
  parseCoverage(rawOutput: string, projectRoot?: string): CoverageResult;
}

export interface BuildAdapter {
  name: ProjectStack['buildTool'];
  build(scope: string[]): Promise<BuildResult>;
  parseErrors(rawStderr: string): BuildResult;
}
```

**Adapter factory + auto-detect**:
```typescript
// src/core/lang/stack-detector.ts
export function detectStack(projectRoot: string): ProjectStack[] {
  const detected: ProjectStack[] = [];
  if (existsSync(join(projectRoot, 'package.json'))) detected.push(STACKS.typescript);
  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'requirements.txt'))) detected.push(STACKS.python);
  if (existsSync(join(projectRoot, 'go.mod'))) detected.push(STACKS.go);
  if (existsSync(join(projectRoot, 'Cargo.toml'))) detected.push(STACKS.rust);
  if (existsSync(join(projectRoot, 'pom.xml')) || existsSync(join(projectRoot, 'build.gradle'))) detected.push(STACKS.java);
  if (globExists(join(projectRoot, '*.csproj')) || globExists(join(projectRoot, '*.sln'))) detected.push(STACKS.csharp);
  return detected;  // empty = unsupported stack
}
```

**Result-evaluator integration**:
```typescript
// src/orchestra/result-evaluator.ts (Wave 1 modification)
import { detectStack } from '../core/lang/stack-detector.js';
import { getTestRunner, getCoverage, getBuild } from '../core/lang/index.js';

function isAuditTask(task: Task): boolean {
  // Sprint 161-style: scope.filesWrite is single docs/audits/... path
  return task.scope.filesWrite.length === 1
      && task.scope.filesWrite[0].startsWith('docs/audits/');
}

export function evaluateWithRubric(result: TaskResult, task: Task, rubric?: Partial<EvaluationRubric>): EvaluationResult {
  // ... existing schema validation ...

  if (isAuditTask(task)) {
    return evaluateAuditTask(result, task);  // new auditRubric path
  }

  // Standard rubric: delegate to detected stack adapters
  const stacks = detectStack(projectRoot);
  // ... rest of evaluation using adapters ...
}
```

### Wave 2: Recovery Repair (~3h)

#### Files modify

| Path | Change |
|------|--------|
| `src/cli/commands/recover.ts` | R2 sprint-state.json reset to `phase: COMPLETE, status: FAILED` after archive; R3 zombie process detection + kill (PID from sprint-state, SIGTERM with 5s grace then SIGKILL); R5 sweep `.worker-*` + `.prompt-*` tmpfiles |
| `src/orchestra/sprint-lifecycle.ts:266-273` | R5 cleanup hook align with new convention |
| `src/orchestra/sprint-docs-updater.ts:706` | R5 archiveOrphanTasks include `.worker-*` + `.prompt-*` |
| `src/cli/commands/cleanup.ts:78` | R5 sweep alignment |
| `src/cli/commands/status.ts` | R4 invalidate in-memory cache before render; read fresh from disk |
| `src/orchestra/dashboard-manager.ts` | R4 sync hook on sprint-state change |

#### Tests create

| Path | Coverage |
|------|----------|
| `tests/cli/commands/recover-r2-state-reset.test.ts` | After recover: sprint-state.json `phase=COMPLETE, status=FAILED, updatedAt=now` |
| `tests/cli/commands/recover-r3-zombie-kill.test.ts` | Mock PID, recover sends SIGTERM, then SIGKILL after grace |
| `tests/cli/commands/recover-r4-status-sync.test.ts` | After recover, status command shows correct count (no cache lag) |
| `tests/cli/commands/recover-r5-tmpfile-sweep.test.ts` | After recover, .worker-* and .prompt-* swept; plant files (TEST-* prefix) preserved |

### Wave 3: Cross-cutting (ADR + observability + i18n + a11y + security) (~3h)

#### ADR amendments (V2)

- **ADR-035 V2**: Verification protocol clarifies synthetic result handling — `selfAssessment: 'TIMEOUT_WITH_WORK'` mandate, reconcileSpuriousNoGo wire requirement, Bug C regression guard. Insert `Sprint 162A amendment: synthetic results MUST use TIMEOUT_WITH_WORK; reconcileSpuriousNoGo MUST run before NO_GO commit`.
- **ADR-037 V2**: RBAC bounds on recover.ts — when killing zombie processes, recover MUST verify PID belongs to sprint-state.json's recorded Brain, not arbitrary; SIGTERM+grace+SIGKILL pattern documented.
- **ADR-039 V2**: Self-modifying detector scope — orchestration repair (Sprint 162A) is exempt from self-modifying flag because Brain is fixing Brain via CC subagent (ADR-043 Hot Fix pattern); audit log entry required when 162A-class fix runs.
- **NEW ADR-047**: Multi-Language TestRunner/Coverage/Build Adapter Pattern — interface contracts, 6 baseline stacks, factory + auto-detect, extensibility for future stacks.

#### Observability — new event-stream events

| Event | Source | Payload |
|-------|--------|---------|
| `sprint.eval.heartbeat-skip` | sprint-phases.ts:495 (Bug A new gate) | `{taskId, hbAgeMs, skipReason}` |
| `sprint.eval.audit-rubric-applied` | result-evaluator.ts (Bug B branch) | `{taskId, rubricType: 'audit', score}` |
| `sprint.eval.synthetic-timeout` | sprint-phases.ts:501 (Bug C fix) | `{taskId, hbAgeMs, lastResult}` |
| `sprint.spawn.deadlock-detected` | sprint-controller.ts (Bug Sprint-Stall guard) | `{queuedTaskCount, spawnedCount, durationStallMs}` |
| `sprint.recover.state-reset` | recover.ts (Bug R2 fix) | `{sprintId, oldPhase, newPhase, oldStatus, newStatus}` |
| `sprint.recover.zombie-killed` | recover.ts (Bug R3 fix) | `{sprintId, pid, signal, gracePeriodMs}` |
| `sprint.recover.status-sync` | status.ts/dashboard-manager.ts (Bug R4 fix) | `{sprintId, cacheInvalidated, freshRead}` |
| `sprint.recover.tmpfile-swept` | recover.ts (Bug R5 fix) | `{sprintId, sweptCount, preservedCount, files}` |

#### i18n — 12 languages

`src/dashboard/i18n/{en,tr,de,fr,es,it,pt,ru,ja,ko,zh,ar}.json` — event labels, error messages, ARIA labels for new orchestration events.

Languages chosen per global reach + existing Memory V2 normalize precedent (TR/EN/DE) + 9 expansion (FR/ES/IT/PT/RU/JA/KO/ZH/AR top global).

#### a11y — ARIA attributes

Dashboard event component (existing) extended with `role`, `aria-live`, `aria-label` (i18n-driven) for new event types. WCAG 2.1 AA compliance verified.

#### Security review

`docs/security/sprint-162a-review.md` — per-change review compile:
- Bug A: heartbeat path traversal? (file path under `.tasks/` controlled by Brain, no user input — safe)
- Bug B: rubric injection? (auditRubric is internal, not user-tunable — safe)
- Bug C: synthetic result manipulation? (synthetic result composed in trusted code — safe)
- Bug R2: sprint-state.json reset arbitrary write? (write to fixed path, JSON.stringify-controlled — safe)
- Bug R3: process.kill arbitrary PID? (verified PID against sprint-state.json — guarded; reject otherwise)
- Bug R4: cache invalidation TOCTOU? (single-process invariant, no race — safe)
- Bug R5: cleanup path traversal? (filter to `.tasks/` dir + prefix match — safe; `..` traversal blocked)
- Bug Sprint-Stall: spawn rate limit attack? (max_workers config-bounded — safe)
- Multi-lang adapter: arbitrary command exec? (whitelist via STACKS table; user cannot inject arbitrary stack — safe; ADR-006 spawnSync pattern preserved)

#### Tests create (Wave 3)

| Path | Coverage |
|------|----------|
| `tests/orchestra/event-stream-new-events.test.ts` | 8 new event types register and emit correctly |
| `tests/dashboard/i18n-coverage.test.ts` | 12-lang coverage of new event labels |
| `tests/dashboard/aria-events.test.ts` | ARIA attributes present, screen-reader-compatible |

---

## 5. Phase 3 — Smoke Replicate (~2h)

Re-run Sprint 161 birebir with fixed orchestration. Use existing `DIRECTIVES.md` archived at `.brain/archive/DIRECTIVES-sprint-161.md`.

### Procedure

1. Restore `DIRECTIVES.md` from `.brain/archive/DIRECTIVES-sprint-161.md`
2. Pre-flight: tsc clean, vitest clean, dist rebuilt (`npm run build`)
3. Spawn sprint with `npx deckent start --auto-approve` (background, ADR-027 spawn backend per config)
4. Coordinator monitors via existing event-stream tail + heartbeat snapshots
5. Wait for SPRINT COMPLETE event (true terminal, not premature)

### Success criteria (god-level)

| Criterion | Target |
|-----------|-------:|
| Task completion | 56/56 task DONE or GO_WITH_TECH_DEBT (worker self-assessment matches Brain decision) |
| False NO_GO rate | **0%** (Sprint 161 baseline 87.5%) |
| Boundary integrity | `git diff --stat HEAD -- ':!docs/audits/sprint-162a-smoke/'` empty |
| New observability events | 8/8 event types emitted at least once during sprint |
| Multi-lang adapter exercises | 6/6 stacks exercised via mock projects in test fixtures (Wave 1 unit tests) |
| Recover not triggered | Brain finalizes naturally without recover (Bug Sprint-Stall closed) |
| Sprint duration | < 6h (Sprint 161 stalled at >1h) |
| Heartbeat-aware events | `sprint.eval.heartbeat-skip` fires when hb < threshold; doesn't synthesize NO_GO |

### Output

`docs/audits/sprint-162a-smoke/` — replicated sprint deliverables:
- 56 task audit reports
- Lane 2 monitor reports (if dispatched — optional for smoke)
- `SMOKE-VALIDATION-REPORT.md` — pass/fail per criterion

### Failure handling

- Smoke produces same 87.5% false-NO_GO → Phase 1 ITERATION (re-dispatch INV-A/B/C/Stall with cross-references)
- 3 iterations fail → escalate to user, stop sprint
- Boundary violation → stop immediately, investigate which fix introduced the issue

---

## 6. Phase 4 — Documentation + ROADMAP (~2h)

### Deliverables

| Path | Content |
|------|---------|
| `docs/superpowers/retros/sprint-162a-retro.md` | What changed (8 bugs + 6-stack multi-lang), validation evidence (smoke 0% false-NO_GO), tier achieved (T4), regression guards added |
| `.brain/memory.db` (entries) | 4 entries: ADR-035 V2, ADR-037 V2, ADR-039 V2, ADR-047 (multi-lang) — `store.upsert/insert` |
| `.brain/exports/decisions.md` | Regenerated via `deckent memory export` |
| `docs/ROADMAP-GOD-LEVEL.md` | Append section "## ⚡ 2026-05-08 — Sprint 162A Orchestration Repair Closed" — match existing format; close Sprint 161 FAILED state and Pipeline Health REGRESSION gate |
| `/home/alperen/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint162a_orchestration_closed.md` | Auto memory entry: 8 bugs closed + multi-lang ext'y added; reference for future debugging |
| `CLAUDE.md` Sprint Metrics table | Updated to sprint-162a |

### Beta GA gate update

Per Sprint 161 ROADMAP entry, "Pipeline Health" gate REGRESSION → ✅ via Sprint 162A smoke. Documentation sync gate still REGRESSION (Sprint 162C target).

---

## 7. T4 Coverage Matrix (verification — every bug × every dimension)

| Bug | Source | Tests | Observability | ADR | Smoke | i18n | a11y | Security | Multi-lang |
|-----|--------|-------|---------------|-----|-------|------|------|----------|------------|
| A | sprint-phases.ts:492-525 | 1 unit + 1 integration | sprint.eval.heartbeat-skip | ADR-035 V2 | replicate | event label 12-lang | ARIA event | review (no exec attack) | n/a |
| B | result-evaluator.ts:709 | 1 unit (per stack 6×) | sprint.eval.audit-rubric-applied | new ADR-047 | replicate | event label 12-lang | ARIA event | review (no rubric injection) | **PRIMARY surface** |
| C | sprint-phases.ts:501 | 1 unit | sprint.eval.synthetic-timeout | ADR-035 V2 | replicate | event label 12-lang | ARIA event | review | n/a |
| R2 | recover.ts | 1 unit | sprint.recover.state-reset | ADR-037 V2 | replicate | event label 12-lang | ARIA event | review | n/a |
| R3 | recover.ts | 1 unit + 1 integration | sprint.recover.zombie-killed | ADR-037 V2 | replicate | event label 12-lang | ARIA event | review (PID bounds) | n/a |
| R4 | status.ts + dashboard | 1 unit | sprint.recover.status-sync | ADR-037 V2 | replicate | event label 12-lang | ARIA event | review (TOCTOU) | n/a |
| R5 | cleanup paths × 4 | 1 unit | sprint.recover.tmpfile-swept | ADR-039 V2 | replicate | event label 12-lang | ARIA event | review (path traversal) | n/a |
| Stall | sprint-controller + result-collector | 1 integration | sprint.spawn.deadlock-detected | ADR-035 V2 | replicate | event label 12-lang | ARIA event | review (rate-limit) | n/a |

**Total**: 9 unit tests + 3 integration tests + 18 multi-lang stack tests + 8 new event types + 4 ADR amendments + 12-lang i18n + ARIA + 8 security review sections.

---

## 8. Success Criteria

| Category | Target |
|----------|--------|
| Source fix correctness | 8/8 bug closed, `tsc --noEmit` exit 0, `npx vitest run` 100% pass |
| Multi-lang adapter coverage | 6 stack adapter implementations, 18+ unit tests pass, factory works for each detected stack |
| Observability | 8 new event types registered, dashboard renders correctly, event-stream JSONL captures during smoke |
| ADR governance | 3 V2 amendments + 1 new ADR-047 in `.brain/memory.db`, `.brain/exports/decisions.md` regenerated |
| Smoke replicate | 56/56 Sprint 161 task DONE/GO_WITH_TECH_DEBT, 0% false-NO_GO, duration < 6h, all 8 new events fired |
| i18n | 12-lang event labels (en, tr, de, fr, es, it, pt, ru, ja, ko, zh, ar) JSON files coverage |
| a11y | Dashboard event ARIA labels, WCAG 2.1 AA compliance |
| Security review | Per-change review compile in `docs/security/sprint-162a-review.md` (8 sections + multi-lang adapter section) |
| Documentation + ROADMAP | Sprint 162A retro + project memory + ROADMAP-GOD-LEVEL update; Sprint 161 FAILED → CLOSED |
| Beta GA gate | Pipeline Health gate ✅ (was REGRESSION per Sprint 161 audit) |

---

## 9. Constraints / Risk Mitigation

### Hard rules

- **READ-ONLY for `.tasks/` archive** — Sprint 161 archive at `.tasks/archive/sprint-161/` is forensic evidence, must not be touched
- **deckent FIX phase YASAK** — ADR-043 Hot Fix with Claude Subagents pattern; CC main agent dispatches subagents that produce diffs, then CC main applies via Edit/Write tool. Sprint pipeline bypass is critical because Bug A is in the FIX phase — using deckent to fix Bug A would re-trigger Bug A → infinite loop
- **No tier downgrade** — T4 mandate, all 9 dimensions delivered (per memory rule `feedback_t3_minimum_discipline_baseline.md`)
- **Sprint kill / cleanup user approval** — if smoke fails, kill sprint requires explicit user OK
- **Build (npm publish)** — out of scope this sprint (Sprint 162E or later)

### Risk mitigation

| Risk | Mitigation |
|------|-----------|
| Multi-lang adapter scope creep | Sprint 162A locks 6 baseline stacks; future stacks (Ruby/PHP/Elixir/Kotlin/Swift) = own sprints |
| Wave 1 ↔ Wave 2 inter-dependency | Wave 2 recovery tests need Wave 1 fixes for fixture setup; sequential ordered explicit |
| Smoke replicate produces same false-NO_GO | Phase 1 ITERATION pattern (re-dispatch INV-A/B/C/Stall with cross-references); 3 iteration cap → escalate |
| dist/ rebuild gerekli | Each wave end: `npm run build` + MCP server restart per CLAUDE.md gotcha |
| Test fixture stale (Sprint 160 generator-asymmetry) | Wave 1 simultaneously refreshes test fixtures matching new generator output (`.prompt-task-${taskId}` if Plan A migration in 162E; until then keep existing format) |
| TypeScript build errors during multi-lang adapter introduction | INV-B fix-spec produces type contracts first; Wave 1 implements with strict mode; CI matrix `[20.x, 22.x, 24.x]` validates |
| User approval gates blocking iteration | Pre-define iteration boundaries (3 iterations max for Phase 1 re-dispatch); kill sprint requires user OK |

---

## 10. Open Questions / Decisions Made

### Resolved by user during brainstorming

- ✅ Approach C (Parallel Investigation + TDD Wave) chosen over A (sequential wave) and B (strict TDD)
- ✅ T4 god-level tier chosen over T3 minimum baseline (with reasoning: code-side validation alone insufficient; smoke + multi-lang extensibility required for "milyon user" target)
- ✅ Multi-language extensibility = 6 baseline stacks (TS/Py/Go/Rust/Java/C#); future stacks own sprints
- ✅ 12-language i18n (existing TR/EN/DE + 9 global expansion: FR/ES/IT/PT/RU/JA/KO/ZH/AR)
- ✅ 56-task full smoke replicate (not subset) — Sprint 161 birebir re-run
- ✅ ADR-043 Hot Fix with Claude Subagents — deckent FIX phase YASAK (dogfood loop avoidance)
- ✅ T3 = bundan sonra Deckent için MINIMUM baseline (memory rule)

### Decisions inside design (not user-asked)

- `isAuditTask(task)` heuristic: `scope.filesWrite.length === 1 && filesWrite[0].startsWith('docs/audits/')` — simple, robust, unambiguous
- `ProjectStack['name']` enum closed for 6 baseline stacks; mixed projects supported via array
- `STACKS` constant (in `src/core/lang/types.ts`) holds adapter wiring; new stack = new entry
- 8 new event types under `sprint.eval.*` and `sprint.spawn.*` and `sprint.recover.*` namespaces
- 12-lang i18n strategy: JSON-per-language (existing pattern), ARIA labels referenced via `t()` function
- Security review compile lives at `docs/security/sprint-162a-review.md` — new directory if missing

---

## 11. Next Step (Brainstorming Skill Terminal)

Per the brainstorming skill flow, the next action after spec review is to invoke `superpowers:writing-plans` to convert this design into a step-by-step implementation plan with specific Phase 1 dispatch script, Wave 1/2/3 step-by-step edits, Phase 3 smoke procedure, and Phase 4 documentation pipeline.

The implementation plan will be the immediate-execution artifact. This spec is the contract.

---

**Approval signature:** Alperen 2026-05-08 (auto-mode brainstorming session, T4 tier explicit + multi-language extensibility explicit + Approach C explicit)
**Implementation owner:** Coordinator (CC main agent) + 8 Phase 1 investigation subagents + 3 Wave application subagents + 1 smoke coordinator + 1 documentation subagent = ~13 subagent dispatches over ~20h wall-clock
**Estimated cost:** ~6-10M tokens (parallel investigation peak), ~20h wall-clock, $30-60 in API/inference cost
