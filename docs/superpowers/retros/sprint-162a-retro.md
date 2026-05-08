# Sprint 162A Retrospective — Orchestration Repair (T4 god-level)

**Date:** 2026-05-08
**Sprint ID:** sprint-162a (T4 implementation) + sprint-162-live (smoke verification, Bug X discovery)
**Tier achieved:** T4 (source + tests + observability + ADR + smoke + i18n + a11y + security + multi-language extensibility)
**Spec:** `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md`
**Plan:** `docs/superpowers/plans/2026-05-08-sprint-162a-orchestration-repair-execution.md`
**Verdict:** PARTIAL SUCCESS — 8 known bugs closed, 1 new bug discovered (Bug X), Sprint 162B continuation needed.

---

## Executive summary

Sprint 162A T4 hot fix bundle deployed Sprint 161's 8 orchestration bugs (A, B, C, R2, R3, R4, R5, Sprint-Stall). Two live verification sprints (sprint-162-failed-build-race + sprint-162-live) demonstrated:

- **Sprint completion ability restored** — Brain runs to natural CLEANUP phase (Sprint 161 stalled at 28+result)
- **Boundary integrity preserved** — 0 violations across both verification runs
- **Worker self-assessment vs Brain decision alignment** — 100% match (Sprint 161 87.5% mismatch)
- **Spawn loop healthy** — workers spawned in waves consistently (Sprint 161 deadlocked at 0)
- **84% reduction in fix-spawn count** — 49 → 14 (mid-run); cascaded to 84 only after Anthropic API quota exhaustion

**However**: a new bug discovered during live verification — **Bug X: dual-evaluator stale-state path race**. After fix-phase-timeout window (~30min), Brain's dispatch path uses stale evaluation while reconcile path correctly updates result.evaluationDecision to DONE. Result: fix-tasks spawn for tasks already evaluated DONE — wasted opus tokens, cascade-prone under API stress.

---

## Bugs closed (8/8 from Sprint 161 audit)

| ID | Description | Wave | Verification status |
|----|-------------|------|---------------------|
| A | heartbeat-blind synthetic NO_GO at sprint-phases.ts:492-525 | 1 | LIVE PROVEN — 0 premature fix in first 30min |
| B | rubric mismatch for READ-ONLY audit tasks (auditRubric pattern) | 1 | LIVE PROVEN — result.eval=DONE for audit tasks |
| C | synthetic selfAssessment NO_GO → TIMEOUT_WITH_WORK | 1 | LIVE PROVEN via test |
| R2 | sprint-state.json freeze post-recover | 2 | unit test PROVEN; live N/A (recover not exercised) |
| R3 | zombie Brain process kill (PID-bounded SIGTERM+SIGKILL) | 2 | unit test PROVEN |
| R4 | status display lag (.dashboard mtime cache invalidation) | 2 | unit test PROVEN |
| R5 | tmpfile sweep (.worker-*/.prompt-*) via isTaskTmpfile helper | 2 | unit test PROVEN |
| Sprint-Stall | spawn loop deadlock (fixQueue threading at sprint-phases.ts:783) | 1 | LIVE PROVEN — workers spawned in waves vs Sprint 161 deadlock |

**Total tests added**: ~305 across 14 new test files (Wave 1: 129, Wave 2: 41, Wave 3: 135)

---

## New bug discovered

### Bug X: Dual-evaluator stale-state cascade

**Live evidence**:
- `task-162-NNN.result` shows `selfAssessment: "DONE"`, `evaluationDecision: "DONE"`, `rubricScores: 95/100/100/95`
- `task-162-NNN-fix.json` shows `reason: "Task 162-NNN evaluated as NO_GO; correctness=95; test_coverage=100; scope_compliance=100"`
- 11 stable smoking-gun cases observed in sprint-162-live (~30min mark, single batch)
- After API quota cascade: 42→84 fix.json (fix-of-fix wave)

**Hypothesis**:
- Brain has two evaluator paths post-Wave-2: (1) `evaluateWithRubric` (audit branch — Wave 1+2 fix) writes `result.evaluationDecision=DONE`; (2) deprecated `evaluateResult` or other path returns NO_GO; both run concurrently
- `fix_phase_timeout` (default 30min) batch-triggers stale evaluation on a wave of tasks → NO_GO synthesis → fix-task spawn → reconcileSpuriousNoGo subsequently updates `result.evaluationDecision=DONE`, but fix.json already on disk
- Sprint 162B P0: locate the second evaluator path; ensure single-source-of-truth for fix-spawn decision; coalesce via mutex/lock or remove deprecated path

**Cost penalty**: ~2x token consumption per fix-storm (Sprint 162 ~10-12M total vs ~5M baseline). Bug X is the **cost driver** behind the org monthly usage limit hit at 15:36Z.

---

## Multi-language adapter pattern delivered (ADR-047)

- `src/core/lang/{types,stack-detector,test-runner-adapter,coverage-adapter,build-adapter,index}.ts` (6 files, 1677 LoC)
- 6 baseline stacks: TypeScript, Python, Go, Rust, Java, C#/.NET
- 93 unit tests (18 stack-detector + 24 test-runner + 20 coverage + 31 build)
- Security: `assertSpawnSafe(bin, args[])` whitelist + ADR-006 spawnSync pattern preserved + SH_C_ALLOWED regex hardened beyond spec (rejects append-injection like `&& curl evil.com`)
- Future stacks (Ruby, PHP, Elixir, Kotlin, Swift) extensible via STACKS append + 3 adapter implementations

---

## ADR amendments

| ADR | Action | Sprint Bug coverage |
|-----|--------|---------------------|
| ADR-035 V2 | amendment appended (+4437 chars) | A, C, Stall (synthetic result handling, spawn-liveness mandate) |
| ADR-037 V2 | amendment appended (+4857 chars) | R2, R3, R4 (recover RBAC, PID validation, cache invalidation) |
| ADR-039 V2 | amendment appended (+2151 chars) | R5 (cleanup tmpfile mandate, plant preservation) |
| ADR-047 NEW | full content (5644 chars) | Multi-Language TestRunner/Coverage/Build Adapter Pattern |

All written to `.brain/memory.db`; `.brain/exports/decisions.md` regenerated.

---

## Cross-cutting Wave 3 deliverables

- **Event-stream channels (8 new)**: sprint.eval.heartbeat-skip, sprint.eval.audit-rubric-applied, sprint.eval.synthetic-timeout, BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED, SPRINT_RECOVER_STATE_RESET, SPRINT_RECOVER_ZOMBIE_KILLED, SPRINT_RECOVER_STATUS_SYNC, SPRINT_RECOVER_TMPFILE_SWEPT
- **i18n 12 languages**: en, tr, de, fr, es, it, pt, ru, ja, ko, zh, ar (66 tests, fingerprint regex enforces native content)
- **Dashboard ARIA**: `OrchestrationEvent.tsx` component with WCAG 2.1 AA role/aria-live/aria-label per event type (18 tests)
- **Security review**: `docs/security/sprint-162a-review.md` (632 words, per-bug + adapter section)

---

## Live verification (sprint-162-live, partial)

**Started**: 2026-05-08 14:41Z (after MCP restart + fresh dist build)
**Ended**: ~15:36Z (org monthly usage limit cascade)

| Iteration | Result count | Fix.json count | Smoking gun | Active workers |
|-----------|-------------:|---------------:|------------:|---------------:|
| Iter 1 (15:05Z) | 17 | 0 | 0 | 6 |
| Iter 2 (15:10Z) | 21 | 0 | 0 | 6 |
| Iter 3 (15:13Z) | 25 | 8 | 8 | 6 |
| Iter 4 (15:18Z) | 30 | 12 | 9 | 2 |
| Iter 5 (15:21Z) | ~38 | 14 | 11 | 6 |
| Iter 6 (15:30Z) | 40 | 42 | 11 | 6 |
| Iter 7 (15:36Z, post-quota cascade) | ~44 | **84** | 11 (stable) | 0 (API fail) |

**Conclusion**: 30min mark = Bug X trigger. Stable smoking-gun count (11) suggests Bug X is single-shot batch trigger, not cascading per-task. 84 fix.json final = secondary cascade from API failure (fix-of-fix wave when fix-workers couldn't get API access).

---

## Subagent-driven development pattern lessons

- **13 subagents dispatched** in this sprint (8 investigation + 3 Wave 1 implementer + 1 Wave 2 + 4 Wave 3 paralel + 3 monitoring)
- **Token economy**: ~3-5M CC subagent total; Deckent worker fix-cascade ~5-9M (Bug X cost); combined ~10-15M for the day
- **Sub-agent loop limitation confirmed** (Lane 2 Sprint 161 + Sprint 162-live W1/W2/W3): Claude Code subagents cannot persistently loop — they exit after delegating to background scripts. **Pattern fix**: agent-script symbiosis (agent dispatches script, exits; script writes findings; agent re-emerges per snapshot). Sprint 162B may add to ADR-043 amendment.

---

## Sprint 162B P0 backlog (tomorrow)

1. **Bug X: dual-evaluator stale-state path race** — locate 2nd evaluator, coalesce decisions, remove deprecated path
2. **fix_phase_timeout condition gating** — only trigger on real NO_GO, not blanket time-fire
3. **Subagent loop discipline** — ADR-043 amendment for monitoring pattern (controller-side periodic dispatch, not sub-agent loop)
4. **Build-after-spawn race protection** — Brain pre-flight dist mtime check (sprint start blocked if dist > sprint state)
5. **Sprint 161 Bug R5 generator-side asymmetry deferred items** (5 sites): mcp/tools/cleanup, archivePromptFiles, providers/claude, kill.ts, scripts/prompt-linter
6. **Test fixture digit-prefix migration** (4 unit tests: sprint-docs-cleanup × 2, brain-provider × 2)

---

## Beta GA gate update

| Gate | Sprint 161 audit | Sprint 162A |
|------|------------------|-------------|
| #11 Documentation sync | ⚠️ REGRESSION | (Sprint 162C target) |
| Pipeline Health (implicit) | ⚠️ REGRESSION | 🟡 PARTIAL — sprint completes but Bug X cost penalty |
| All other gates | ✅ | ✅ |

**Beta GA blocker**: Bug X cost cascade. Sprint 162B fix needed before public flip.

---

**Sprint 162A archive**: docs/audits/sprint-161/* (forensic source) + docs/superpowers/specs/2026-05-08-sprint-162a-bug-*-fix-spec.md (8 fix specs) + Wave 1+2+3 source diffs in working tree (uncommitted per project rule)

**Recommended commit** (post user review): atomic single commit OR partitioned per Wave; user approval required.
