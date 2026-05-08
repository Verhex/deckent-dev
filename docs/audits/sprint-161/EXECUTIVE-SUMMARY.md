# Sprint 161 God-Audit — Executive Summary

**Audit type:** READ-ONLY pre-beta-GA architectural & quality god-audit
**Sprint:** 161 (FAILED mid-sprint due to Brain orchestration breakage — see §6)
**Audit window:** 2026-05-08 07:31Z → 11:51Z (~4h 20m)
**Consolidator:** 2026-05-08 (post-recover)
**Pre-audit HEAD SHA:** `6b3bc168cd72cb82a8ca9fea595f32aa5b51554a`
**Mode:** READ-ONLY across all lanes (zero source breaches confirmed; see §3)

---

## 1. Audit Overview

Sprint 161 was designed as a 56-task three-lane god-audit ahead of the Beta GA flip
(Sprint 162). Three parallel lanes ran concurrently:

| Lane | Description | Owner | Output |
|------|-------------|-------|--------|
| **Lane 1** | 28 deckent worker audit reports (T-161-001 .. T-161-028) covering core/, orchestra/, cli/ in granular slices | deckent dogfood (`deckent start sprint-161` Docker workers) | `docs/audits/sprint-161/T-161-NNN-*.md` |
| **Lane 2** | 3 Claude Code monitor reports tracking Brain rubric, worker honesty, auditor authority during the live sprint | CC monitor processes | `docs/audits/sprint-161/cc-monitor/{A1,A2,A3}-*.md` |
| **Lane 3** | 10 Claude Code deep-dive reports across orthogonal dimensions (deps, dist drift, ADR cross-ref, libs, doc pollution, public-repo triage, fixture references, Memory V2, brain structural, security) | CC deep-dive subagents | `docs/audits/sprint-161/cc-deepdive/D{1..9}-*.md` |

**Sprint failure context:** Sprint 161 originally planned 56 tasks. Workers
finalized **28 of 56 audit reports** (T-161-001 .. T-161-028) before the Brain
controller broke (~08:14Z) and the remainder of the sprint (T-161-029 through
T-161-056) never executed. **All deliverables in this consolidation derive from
the 28 finalized worker reports + 3 monitor reports + 10 deep-dive reports.**
T-161-029..056 were never produced — Lane 2 and Lane 3 are **complete**, Lane 1
is partial-complete (50% coverage of the planned slices). The unfinished
Lane 1 slices are deferred to Sprint 162+ as follow-up.

---

## 2. Findings count

### By severity (across all lanes)

| Severity | Lane 1 (worker reports) | Lane 2 (monitor) | Lane 3 (deep-dive) | **Total** |
|----------|------------------------:|-----------------:|-------------------:|----------:|
| **P0** (critical / blocks beta) | ~11 | 1 (orphan stale-agent) | 8 (ADR-038, ADR-005, ADR-010, deckent-hub, jobs/ leak, generator-asymmetry, identity drift, sprint-stall) | **~20** |
| **P1** (high / fix in Sprint 162) | ~63 | 1 (orphan persistent) | ~24 | **~88** |
| **P2** (medium) | ~110 | 2 | ~30 | **~142** |
| **P3** (low / hygiene) | ~92 | — | ~14 | **~106** |
| **TOTAL** | **~276** | **~4** | **~76** | **~356** |

> Severity counts are aggregated from per-report finding tables. Some reports
> use 🔴/🟡/🟢 instead of P0/P1/P2 — those have been mapped 🔴=P1, 🟡=P2, 🟢=P3.
> P0 is reserved across all reports for "blocks correctness/runtime" or
> "blocks public-flip" findings. The orchestration-break findings (§6) are
> classified P0 separately from the audit findings above.

### By dimension (top categories surfaced)

| Dimension | Count | Lead reports |
|-----------|------:|--------------|
| **Dead code / dormant exports** | ~38 | T-161-001/004/005/012/015 + D3 (ADR-038 Kademe 2 unfinished) |
| **Conflicting / contradictory implementations** | ~22 | T-161-015 (dual `evaluateResult`), T-161-013 (sprint-controller regrowth), D6 (generator-vs-consumer asymmetry) |
| **Drift (doc vs code, type vs runtime)** | ~45 | D5a (701 .md, 12 hard mismatches), T-161-001 (claude_backend), D8 (5 identity files disagree), D7 (decay never ran) |
| **Doc pollution / stamp-pad** | ~18 | D5a (17 load-test stamps, 28 sprint-152 cluster, 3-clone 148/149/150) |
| **Memory V2 issues** | 6 | D7 (decay anomaly, mem-134 gap, debt format, decisions.md export lag) |
| **Config integrity** | ~12 | T-161-001 (`dependency_pipeline_enabled`, `brain_tier` dashboard mismatch), D8 (`testFailed=24` in ci-baseline) |
| **ADR violations / status drift** | ~14 | D3 (ADR-005, ADR-010, ADR-022-V2, ADR-035, ADR-038, ADR-042) |
| **Security / sandbox surface** | 14 | D9 (HIGH F13 shell-injection in worker-verify; MEDIUM F3/F4 sandbox bypass) |
| **Library version migration** | 9 | D4 (zod v3/v4 split, MCP SDK v2, React 19 forwardRef, vitest 4) |
| **Orchestration broken (NEW — sprint-161)** | 8 | §6 below (Bug A/B/C/R1-R4/sprint-stall) |

---

## 3. Boundary integrity report

**The READ-ONLY mandate was respected.** Lane 2 Agent A2 (worker-honesty) and
Agent A3 (auditor-authority) both confirm zero worker-attributable source-code
breaches:

- **A3 snapshot 3 (07:49:49Z)** — *"PERFECT BOUNDARY COMPLIANCE — workers
  161-001..006 reported filesChanged 100% inside `docs/audits/sprint-161/`."*
- **A2 final snapshot (08:49:14Z)** — only 1 NEW worker-attributable file
  appeared outside the audit dir: `.brain/archive/retro-sprint-161.md`
  (this was Brain-emitted at sprint kill, **not a worker breach** — written
  by sprint-finalizer not by any T-161-NNN worker).
- **Pre-existing dirty paths** at audit start: 101 (carried over from
  sprints 150/153/159/160). These are baseline hygiene observations, **not**
  Sprint 161 violations.
- **3 Brain-emitted panic snapshots** (`sprint-161-panic-*.json`) for tasks
  161-026..028 with reason `grace_period_timeout` — system events, not
  worker breaches.

**Aggregate diff vs audit-start SHA** (audit dir excluded): 54 files changed,
1893 insertions, 763 deletions — all carry-over from prior sprints
(`sprint-docs-updater.ts`, `sprint-lifecycle.ts`, `cleanup.ts`, agent/skill
manifests, `.brain/exports/*`). **None of these are Sprint 161 worker writes.**

**Verdict:** The sprint-161 worker pool obeyed the audit-only scope. Pipeline
boundary enforcement (ADR-037 RBAC) worked — every worker stayed within
`docs/audits/sprint-161/T-161-NNN-*.md`.

---

## 4. Lane 2 anomalies summary

### A1 — Brain Rubric Watcher
**Outcome:** Inconclusive monitoring data — A1 only captured 3 snapshots before
the sprint was killed; 0 finalized DONE/GO_WITH_TECH_DEBT results were
processed in time. The crucial Brain rubric anomalies that this lane was
designed to catch (rubric-vs-self-assessment mismatch) became the source of the
**87.5% false-NO_GO bug** that ultimately broke the sprint — but the sample
size was too small to characterize the rubric distribution. **See §6 Bug B.**

### A2 — Worker Honesty Watcher
**Outcome:** 28 finalized tasks observed across 23 snapshots. **Zero P0
dishonest tasks (grade F or MISSING report)**, **zero P1 partial coverage**,
**11 P2 minor format gaps** (worker-honesty grade A/B with caveats — primarily
"self-assessment line missing" or "files-changed not enumerated"). Worker
self-assessment was **DONE for all 28** — but Brain evaluator marked **most**
of these as Failed (see §6 Bug A/B). This is the smoking gun of the Brain
orchestration break.

### A3 — Auditor Authority Watcher
**Outcome:** Auditor scan loop **healthy throughout** — alerts: [], violations:
0/1 (the only violation was the orphan `docker-test-docker-317411` stale-agent
from a pre-existing pre-sprint-161 e2e test artifact, correctly detected per
ADR-035 verification protocol). **Phase transitions clean** (SPAWN→EXECUTE→FIX
observed; no FIX→RETRO transition because Brain broke before that point).
**Self-modifying detector (ADR-039) silent throughout** — clean.
PATTERNS.md updated occurrences=4390→4436 from orphan stale-hb during scan,
no new pattern entries.

---

## 5. Lane 3 deep-dive summary per specialty

### D1 — `node_modules` audit
- **9 npm-audit advisories** (3 high, 6 moderate, 0 critical). All have fixes available.
- **11 outdated packages**, 4 patch-bumps available immediately (`happy-dom`, `@modelcontextprotocol/sdk`, `@types/node`, `discord.js`).
- **2 deprecated transitives** (`glob@10.5.0`, `prebuild-install@7.1.3`) — non-actionable from Deckent side.
- **License surface 100% MIT-compatible** (305 MIT, 19 ISC, 16 Apache-2.0, 8 BSD-3-Clause; no GPL/AGPL/LGPL/SSPL).
- **ADR-010 contradiction:** declares "tek runtime dependency: commander" but real package.json has 7 prod deps. ADR-010 must be amended (see ADR cross-ref D3).

### D2 — `dist/` ↔ `src/` drift
- **dist/ fully synchronized with src/.** All 392 dist files have mtime within a 0.7s window (single tsc pass at 2026-05-08 10:39:43). No reverse drift.
- **Sprint 160 reported "27 src newer than dist"** confirmed as `find -newer` artifact (directory mtime stale due to in-place file overwrite by tsc).
- **No internal auto-rebuild mechanism** — Brain/Worker/Auditor only call `tsc --noEmit`. The "auto-rebuild mystery" from Sprint 160 most likely came from a leftover `npm run dev` (`tsc --watch`) process, not an orchestra path.
- **F5 (MEDIUM):** `dist/test-sprint-154-marker.js` ships in dist/ — should be excluded via `.npmignore` or moved to `tests/` so tsc doesn't emit it.

### D3 — ADR cross-reference
- **5 dormant or status-mismatched ADRs** (ADR-005 deprecated but 804 sync I/O sites remain; ADR-010 1-vs-7 deps; ADR-022-V2 19/19 vs 28/56 counts; ADR-038 Kademe 2 unfinished — `handoff-protocol.ts`+`brain-context.ts` 0 importers, no `@deprecated` marker, **22+ sprints overdue**; ADR-042 status="proposed" but shipped per Sprint 149/150).
- **Sprint 154 hot-fix wires verified intact:** `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint`, `reconcileSpuriousNoGo` all wired.
- **ADR-035 backward-compat milestone missed:** "Sprint 142 file-based removed" planned, today still in active use 19 sprints later.

### D4 — Library version mismatch (context7 cross-ref)
- **F1 (HIGH):** Zod import-path inconsistency. `feature-query.ts` imports plain `'zod'` (v3) while sibling MCP tools use `'zod/v4'` — MCP SDK v2 will hard-bind to v4 schemas → registration-time failure risk.
- **F2 (MED):** MCP SDK v2 import-path rewrite preordained (mechanical migration of 31 files when v1 EOL).
- **F3 (LOW):** React 19 `forwardRef` holdovers in 3 dashboard UI primitives.
- **F4 (LOW):** Anthropic apiId one rev behind upstream (`claude-opus-4-6` vs `claude-opus-4-7`).
- **F5/F6/F7 (INFO):** Vitest 4 / Vite 7-8 / TypeScript 5.9+6.0 readiness all GREEN.
- **F8 (INFO):** `better-sqlite3` usage canonical.

### D5a — Documentation pollution
- **701 working .md files** (excluding `node_modules` + analysis archives). Block E claim of "388 .md" is **313 files stale**.
- **7 P0 contradictions** (CLI count 46/48/55+, MCP tools 31/27, sprint pointer 4-5 stale, MCP resources 8/6, ADR injection 42/45, root vs docs CHANGELOG drift, root CoC vs docs/launch CoC).
- **17 stamp-pad `load-test-report.md`** files (sprints 143-160) — auto-emitted, no analytical content.
- **Sprint 154 T-010 archival recommendation 7 sprints overdue** (`NEXT-SESSION-PROMPT.md`, `SYSTEM-MIGRATION-2026-04-22.md`, `DECKENT-TEST-REPORT.md` still in repo root).
- **`.deckent/sprint-141-analysis-archive/` + `sprint-god-analysis/`** = 5.1 MB / ~810 .md inflating every doc query.
- **Recommendation:** `scripts/regen-claim-counts.mjs` + publish-gate prevents recurring P0-1..P0-5 contradictions.

### D5b — Public-repo migration triage
- **2,222 files audited** (after filtering nested node_modules/dist).
- **Class breakdown:** ~735 MIGRATE-PUBLIC (33%) / ~1,265 KEEP-PRIVATE (57%) / ~205 DELETE-CANDIDATE (9%) / ~17 UNCERTAIN (1%).
- **8 P0 critical items** before public flip: `deckent-hub/` (65 files — misplaced sub-repo), `.test-e2e-sprint-21914/` + `.test-e2e-sprint-33991/` (21 orphan e2e files), `.deckent/jobs/` (161 files runtime state), `.deckent/sprint-NNN-*` (75+ binary archives), `.deckent/config.json.bak*` (4 stale backups), `.deckent/{sprint.lock,sprint-state.json,pids/,cache/}` + `.dashboard` (live runtime state), `src/test-sprint-154-marker.ts`, `scripts/insert-sprint-154-adrs.mjs`.

### D6 — Fixture references (non-test)
- **P0 (critical):** Sprint 160 T-001 fix is **silently no-op**. Generators emit `.worker-${taskId}.sh` and `.prompt-${taskId}-${hash}${fix}.txt` — Sprint 160 narrowed consumers expect literal `.worker-task-` / `.prompt-task-` prefix, which **no emitter ever produces**. Live filesystem evidence: `.tasks/.worker-161-001.sh`, `.tasks/.prompt-test-docker-317411-64210aee9bf7a00c.txt`. The "plant survival" tests pass because BOTH plants AND real task files are now skipped.
- **P0 (CLI/MCP parity):** `src/mcp/tools/cleanup.ts` was NOT updated alongside Sprint 160 T-001 — `deckent_cleanup` (MCP) eats forensic plants the CLI preserves.
- **P1:** Three independent prompt-emitter naming conventions co-exist (tmux random hex; docker `${taskId}-${hash}`; consumer `.prompt-task-` literal). `scripts/prompt-linter.mjs:252` only matches Docker-backend sprints — silent capability gap for tmux backend.

### D7 — Memory V2 deep audit
- **Schema clean** (v1, FTS5 dual-layer, integrity OK, 198/198/198 row sync).
- **P1 export drift:** `decisions.md` 67min older than other exports — non-atomic export pipeline.
- **P2 decay anomaly:** `decay_after_sprints=20`, current sprint=160 → 11 entries below cutoff are NOT decayed (`mem-132..139`, `sprint-log-136..139`). **Decay never ran on memory/sprint types** despite ADRs/identity correctly flagged exempt.
- **P2 `mem-134` missing** (132, 133, 135 present — Sprint 134 retro extensively referenced in ADR-008, suggesting data loss).
- **P2 sprint-log coverage 4/29** — `type='sprint'` only present for sprint-log-136..139.

### D8 — `.deckent/` + `.brain/` structural
- **P0 identity drift:** 5 files claim 5 different sprint numbers / agent counts / MCP tool counts (`CLAUDE.md=sprint-155/15+0/31`, `IDENTITY.md=sprint-155/15+3/27`, `PROJECT-IDENTITY.md=sprint-160/16/22`, `config.json=sprint-161`, real on-disk=18 enabled agents).
- **P0 ci-baseline panic:** `ci-baseline.json` shows `testPassed=0, testFailed=24, coverage=0` — sprint should not have started without operator override.
- **P1 budget violation:** `.brain/` aggregate 928 lines > 900 budget. ERRORS.md alone = 600 lines (67% of total).
- **P1 zombie temps:** `temp-react-specialist`, `temp-react-ts-specialist` at top-level + duplicates in archive (LRU eviction broken).
- **P2 panic-loop bug:** 5 sprint-153-panic dumps within same minute → fingerprint dedup missing.
- **P2 provider-cache mismatch:** Only 2 of 3 providers registered (codex missing).
- **P2 .deckent root pollution:** Sprint-150..161 root artifacts (~80 files); sprint_root_artifacts_to_archive postcondition missing.

### D9 — Security surface
- **HIGH F13:** Shell-string template-literal interpolation of task `scope.directories`/`pathArgs`/`testPatterns` in `worker-verify.ts:127,254` and `mid-sprint-adapter.ts:228,258,284`. Defaults to `/bin/sh` shell parsing → if `.tasks/` is poisoned outside Brain, attacker can inject metacharacters via scope. **Fix:** migrate to `execFileSync(bin, args[])`.
- **MEDIUM F3:** Skill-sandbox AST scan silently degrades to regex-only if `typescript` package missing at runtime.
- **MEDIUM F4:** `_collectFiles` skips `name.startsWith('.')` — payload-hide bypass via `.hidden/` directory.
- **CLEAN:** Secret scan 0 hits, all SQL parameterized via `better-sqlite3` named binds, Dockerfile non-root, npm script chain has no user input. NPM_TOKEN single secret, OIDC `id-token: write` enabled for `--provenance`.

---

## 6. In-flight Brain orchestration breakage findings (NEW — discovered during Sprint 161 itself)

While the audit was running, the Brain controller broke catastrophically.
**The audit captured the live data, the recover command failed to clean up,
and the resulting findings are the highest-priority Sprint 162 items.**

### Bug A — Premature evaluate (false NO_GO synthesis)

**Site:** `src/orchestra/sprint-phases.ts:492-525`

**Behavior:** When the EVALUATE phase runs and encounters a task without a
`.tasks/task-NNN.result` file on disk, it synthesizes a NO_GO result —
**ignoring active heartbeats**. Tasks still mid-execution (with fresh `.hb`
files within the heartbeat-staleness window) are wrongly synthesized as failed.

**Impact:** **87.5% false NO_GO rate** (49 of 56 tasks marked Failed by Brain
when worker self-assessment was DONE for all 28 finalized; remaining 28 had no
chance to write results because of Bug R1+sprint-stall).

### Bug B — Rubric mismatch for READ-ONLY audit tasks

**Site:** `src/orchestra/quality-assessor.ts` / `evaluateWithRubric` in
`result-evaluator.ts`

**Behavior:** The rubric scoring (correctness/coverage/scope/completeness)
was designed for code-writing tasks. READ-ONLY audit tasks naturally score 0
on `test_coverage` (no test files written) and low on `correctness` (no code
to grade). The aggregate downgrades to NO_GO even when the audit deliverable
is correctly written.

**Impact:** Even tasks that wrote complete `.result` files were re-graded NO_GO
because the rubric had no notion of `auditRubric` (READ-ONLY mode).

### Bug C — Synthetic result selfAssessment NO_GO (should be TIMEOUT_WITH_WORK)

**Site:** Same site as Bug A (`sprint-phases.ts:492-525`).

**Behavior:** Synthetic result records hard-code `selfAssessment: 'NO_GO'`
when the worker never wrote a result. The correct mark for "worker is still
running, heartbeat fresh, no result yet" is `TIMEOUT_WITH_WORK` (per Sprint 138
ADR-035 verification-protocol contract). Existing partial-result promotion
(host monitor → `panic.json`) was bypassed.

### Bug R1 — `deckent recover` claims 241 archived but archive dir empty

**Behavior:** `deckent recover` reported "241 task files archived to
`.brain/archive/sprint-161-tasks/`" but the directory ended up empty
(0 files). Either the archive write failed silently or the move-step was
mis-implemented.

**Site:** `src/cli/commands/recover.ts` (or wherever recover's archive logic
lives — to be confirmed in Sprint 162 fix task).

### Bug R2 — `deckent recover` doesn't reset sprint-state.json

**Behavior:** After recover, `.deckent/sprint-state.json` still showed
`phase: EXECUTE`, `status: ACTIVE`, even though no workers were running and
the user had explicitly invoked recover. Subsequent `deckent status` commands
reflected this stale state.

### Bug R3 — `deckent recover` doesn't kill zombie Brain process

**Behavior:** After recover, the Brain controller process (pid 286601) was
still running idle. No tasks claimed, no workers spawned, but the process
remained alive as a zombie. `deckent status` couldn't reach it because the
sprint loop was deadlocked.

### Bug R4 — `deckent status` display lag

**Behavior:** After recover, `deckent status` showed "0/49 done" for the
sprint that had been "archived" — display didn't reflect the archive operation.
The status display reads from `.deckent/sprint-state.json` (which Bug R2
left stale).

### Bug Sprint-Stall — Brain spawn loop dead

**Behavior:** After the FIX phase transition (08:18:58Z), 41 fix tasks were
queued in `.tasks/`, **but no workers were spawned for >1 hour**. `docker ps`
empty, `tmux ls` empty, no subprocess child PIDs. The spawn loop in
`sprint-controller.ts` / `sprint-spawner.ts` deadlocked silently.

**Likely root cause:** `result-collector.ts` waitForResults timeout
miscalculation OR `mid-sprint-adapter.ts` reroute-decision returning empty set
OR Bug R2's stale state preventing `processQueue` from finding pending tasks.

**Impact:** The 28 unfinished worker reports (T-161-029 .. T-161-056) were
never executed. The audit corpus is therefore at 50% of its planned scope.

### Summary table

| Bug ID | Severity | Site (file:line approx) | Effect |
|--------|----------|-------------------------|--------|
| A | P0 | `sprint-phases.ts:492-525` | 87.5% false NO_GO synthesis (heartbeat-blind) |
| B | P0 | `quality-assessor.ts` + `result-evaluator.ts:evaluateWithRubric` | READ-ONLY audit tasks scored against code-writing rubric |
| C | P0 | `sprint-phases.ts:492-525` | Synthetic NO_GO instead of TIMEOUT_WITH_WORK |
| R1 | P0 | `cli/commands/recover.ts` | "241 archived" claim unbacked by filesystem |
| R2 | P0 | `cli/commands/recover.ts` | sprint-state.json never reset |
| R3 | P0 | `cli/commands/recover.ts` | zombie Brain pid not killed |
| R4 | P1 | `cli/commands/status.ts` | status display lag (downstream of R2) |
| Sprint-Stall | P0 | `sprint-controller.ts`/`sprint-spawner.ts`/`result-collector.ts` | spawn loop dead after FIX transition |

---

## 7. Top 30 P0 findings table (master, cross-lane)

Format: **#** | **ID** | **Severity** | **File:line evidence** | **Recommendation**

| # | ID | Sev | File:line evidence | Recommendation |
|---|----|-----|--------------------|----------------|
| 1 | Bug-A | P0 | `src/orchestra/sprint-phases.ts:492-525` | Heartbeat-aware EVALUATE: skip synthesis if `task-NNN.hb` mtime within `heartbeat_timeout`; emit `WAITING` instead of `NO_GO` |
| 2 | Bug-B | P0 | `src/orchestra/quality-assessor.ts` + `result-evaluator.ts:evaluateWithRubric` | Add `auditRubric` mode (correctness/clarity/evidence-density/scope-compliance) for READ-ONLY tasks; gate by `task.scope.filesWrite` shape |
| 3 | Bug-C | P0 | `src/orchestra/sprint-phases.ts:492-525` | Synthetic result must use `selfAssessment: 'TIMEOUT_WITH_WORK'` when heartbeat fresh; only NO_GO when truly absent |
| 4 | Bug-R1 | P0 | `src/cli/commands/recover.ts` | Verify archive write before reporting count; include verification step (re-list archive dir) |
| 5 | Bug-R2 | P0 | `src/cli/commands/recover.ts` | Force-write `sprint-state.json: { phase: 'CLEANUP', status: 'KILLED' }` on recover |
| 6 | Bug-R3 | P0 | `src/cli/commands/recover.ts` | SIGTERM zombie Brain pid (read from `.deckent/pids/sprint-NNN.pid`); fall back to SIGKILL after 10s |
| 7 | Bug-Stall | P0 | `src/orchestra/sprint-spawner.ts` + `result-collector.ts` | Watchdog timer in `processQueue`; if pending tasks > 0 and 0 workers spawned for >2min, log + force-end FIX phase |
| 8 | D9-F13 | P0 (HIGH) | `src/agents/worker-verify.ts:127,254`; `src/orchestra/mid-sprint-adapter.ts:228,258,284` | Migrate from shell template-literal to `execFileSync(bin, args[])` |
| 9 | D3-P0-1 | P0 | `src/orchestra/handoff-protocol.ts`, `src/orchestra/brain-context.ts` (0 importers, 22+ sprints dormant) | Either delete (Kademe 1) or inject `@deprecated` markers per ADR-038 contract; ADR amendment required |
| 10 | D3-P0-2 | P0 | 804 `readFileSync`/`writeFileSync` sites in `src/` (50 in `src/orchestra/`) | ADR-005 deprecation: rescind OR commit migration roadmap |
| 11 | D3-P1-1 | P0 | `package.json` 7 prod deps vs ADR-010 "1 dep" | Amend ADR-010 with current 7 prod deps + per-dep rationale (or supersede) |
| 12 | D5a-P0-1..5 | P0 | `CLAUDE.md`/`IDENTITY.md`/`DECKENT.md` claim count drift | Add `scripts/regen-claim-counts.mjs` + publish-gate to prevent recurrence |
| 13 | D5b-P0-1 | P0 | `deckent-hub/` (65 files) | Verify if intentional submodule; if not, `.gitignore` and remove before public flip |
| 14 | D5b-P0-2 | P0 | `.test-e2e-sprint-21914/`, `.test-e2e-sprint-33991/` (21 files) | Add to `.gitignore` (`.test-e2e-sprint-*/`); delete from working tree |
| 15 | D5b-P0-3 | P0 | `.deckent/jobs/` (161 files) | Verify `.gitignore` covers; clean before public flip |
| 16 | D5b-P0-4 | P0 | `.deckent/sprint-NNN-*.{json,jsonl,tar.gz,sha256,seq}` (75+ files) | `.gitignore` pattern `.deckent/sprint-*-*.{json,jsonl,tar.gz,sha256,seq}` |
| 17 | D5b-P0-7 | P0 | `src/test-sprint-154-marker.ts` | Delete before publish; add to `.npmignore` if needed |
| 18 | D6-P0-1 | P0 | `src/orchestra/spawn-backend-docker.ts:167,187` (gen) ↔ `sprint-lifecycle.ts:269` `cleanup.ts:78` `sprint-docs-updater.ts:706` (consumer) | Plan A: rename generator emissions to `.prompt-task-${taskId}-...` / `.worker-task-${taskId}.sh`; align with consumers |
| 19 | D6-P0-2 | P0 | `src/mcp/tools/cleanup.ts:28,46` | Sync MCP cleanup with CLI cleanup narrowing (ADR-022-V2 parity violation) |
| 20 | D8-P0 (identity) | P0 | `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md`, `.brain/PROJECT-IDENTITY.md`, `.deckent/config.json` | Single source of truth; auto-regen `.brain/PROJECT-IDENTITY.md` from config + agent-pool stats; CI gate |
| 21 | D8-P0 (ci-baseline) | P0 | `.deckent/ci-baseline.json` `testPassed=0, testFailed=24, coverage=0` | Block sprint start when `testFailed > 0` without operator override flag |
| 22 | D7-P2-A | P1 | `MemoryStore.decay()` not invoked on `type IN ('memory','sprint','retro')` | Wire `store.decay()` into sprint CLEANUP phase |
| 23 | T-161-001 P1 | P1 | `src/core/config-types.ts:118` `claude_backend` removed-not-removed | Add `@deprecated` to `CONFIG_METADATA`; remove field after one-sprint deprecation cycle |
| 24 | T-161-001 P1 | P1 | `src/core/config-types.ts:513` `dependency_pipeline_enabled` only on `ResolvedConfig` | Add to `DeckentConfig`; default in `createDefaultConfig`; pass-through in `loadConfig` |
| 25 | T-161-001 P1 | P1 | `src/dashboard/src/pages/ConfigPage.tsx:67-68` (`brain_tier`/`worker_tier` top-level) | Migrate dashboard to `model_strategy.brain_tier` nested path |
| 26 | T-161-013 P1-A | P1 | `src/orchestra/sprint-controller.ts` regrowth (post-Sprint 76 ADR-024/026 split) | Split into 5 sub-modules per ADR-026 mandate |
| 27 | T-161-015 P0 | P0 | Dual `evaluateResult()` implementations (legacy + Sprint 138 rubric) | Consolidate to single source; deprecate older |
| 28 | T-161-015 P0 | P0 | `applyTechDebtDowngrade()` 0 production callers ("Honest Assessment Calibration v2" Sprint 138 layer dormant) | Wire into FIX phase OR delete with ADR amendment |
| 29 | D4-F1 | P1 | `src/mcp/tools/feature-query.ts:7` imports plain `'zod'` (v3) | Migrate to `'zod/v4'` for MCP boundary consistency |
| 30 | D4-F1 (cont) | P1 | `src/orchestra/task-builder.ts:67` `result.error.format()` | Replace with `z.treeifyError()` or `z.prettifyError()` (and unify import to `zod/v4`) |

---

## 8. Provenance & files

### Inputs (unchanged)
- `docs/audits/sprint-161/T-161-001-..028-*.md` (28 worker reports)
- `docs/audits/sprint-161/cc-monitor/{A1,A2,A3}-*.md` (3 monitor reports)
- `docs/audits/sprint-161/cc-deepdive/D{1,2,3,4,5a,5b,6,7,8,9}-*.md` (10 deep-dive reports)
- `docs/audits/sprint-161/PRE-AUDIT-BRAIN-SUMMARY.md`
- `docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md`
- `docs/superpowers/plans/2026-05-08-sprint-161-god-audit-execution.md`

### Sibling deliverables (this consolidator output)
- `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md` (this file)
- `docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md`
- `docs/audits/sprint-161/PUBLIC-REPO-MIGRATION-PLAN.md`
- `docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md`
- `docs/audits/sprint-161/ROADMAP-PATCH.md`

---

## 9. Beta GA gate impact

| # | Gate | Sprint 154 status | Sprint 161 audit impact |
|---|------|-------------------|--------------------------|
| #1-12 | Build/test/MCP/CLI/Memory etc. | ✅ | ✅ (no regression in audit window) |
| #11 Documentation sync | ✅ Sprint 154 T3 | ⚠️ **REGRESSION** — D5a found 7 new P0 contradictions; auto-regen script not yet built |
| #13 Messaging trio smoke | 🟡 token bekleniyor | 🟡 (eternal) |
| #14 Dockerfile USER non-root | ✅ | ✅ (D9 confirmed) — `Dockerfile.worker` separate audit pending Sprint 162 |
| #15 DeckentHub 20 seed signed | ✅ | ✅ |
| #16-20 | ✅ | ✅ |
| Implicit: Pipeline Health | ✅ Sprint 154 LIVE dogfood | ⚠️ **REGRESSION** — Sprint 161 itself broke (Bug A/B/C/R1-R4/Stall); pipeline-health gate must be re-run after Sprint 162 hot fix |

**Net:** Beta GA flip is now blocked on Sprint 162 hot fix wave (orchestration
repair + recover repair). Once Sprint 162 lands, re-test pipeline health with
a controlled smoke sprint, then proceed to public flip.

---

*End EXECUTIVE-SUMMARY.md — 2026-05-08*
