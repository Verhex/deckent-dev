# DIRECTIVES — Sprint 162: Sprint 161 Audit Hot Fix Wave + Public-Flip Prep

> **Source:** Generated from Sprint 161 god-audit findings (28 worker reports + 3 monitor + 10 deep-dive).
> **Sibling docs:** `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md`, `MIGRATION-TRIAGE-MATRIX.md`, `PUBLIC-REPO-MIGRATION-PLAN.md`, `ROADMAP-PATCH.md`.
> **Pre-Sprint-162 condition:** Sprint 161 broke mid-flight (Brain orchestration). Hot fix theme is BLOCKER for Beta GA + public-repo flip.

## Goal: Fix the 8 P0 orchestration/recover bugs that broke Sprint 161, plus the highest-impact P0/P1 audit findings, so that Sprint 163+ can resume normal directives-driven work and the public repo flip can proceed.

---

## THEME 1: CRITICAL — Orchestration repair (Bug A/B/C)

> Without these, every future audit-style sprint will re-trigger the 87.5% false-NO_GO rate. Sprint 161 was the live evidence — Brain marked 49/56 tasks Failed when worker self-assessment was DONE for all 28 finalized.

### Task 1.1: Heartbeat-aware EVALUATE — fix premature NO_GO synthesis (Bug A)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/result-collector.ts, tests/orchestra/sprint-phases.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
The synthetic-result path in `src/orchestra/sprint-phases.ts:492-525` synthesizes a `NO_GO` result for any task without a `.tasks/task-NNN.result` file at EVALUATE time, **ignoring active heartbeats**. Tasks still mid-execution (with fresh `.hb` files within `heartbeat_timeout`) are wrongly marked Failed.

Fix: before synthesizing NO_GO, check `task-NNN.hb` mtime. If within `heartbeat_timeout` window (default 120s), emit `WAITING` (not present in current `SprintPhase` semantics — add to `core/sprint-types.ts` if needed) OR defer EVALUATE for that task by one tick. Only after `heartbeat_timeout * 2` (or operator-configured grace) elapsed AND no result, synthesize NO_GO.

**Kanit:** `grep "synthesize" src/orchestra/sprint-phases.ts` shows new heartbeat-staleness branch; `vitest tests/orchestra/sprint-phases.test.ts -t heartbeat-aware` returns PASS

**Test:** 4+ tests (heartbeat fresh -> no synthesis; heartbeat stale -> NO_GO synthesis; heartbeat missing + .hb file absent -> NO_GO synthesis with TIMEOUT_NO_HB; mid-EXECUTE phase respects active heartbeat)

---

### Task 1.2: Audit-task rubric mode for READ-ONLY tasks (Bug B)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/quality-assessor.ts, src/orchestra/result-evaluator.ts, src/core/types.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
The current rubric scoring (`evaluateWithRubric` in `src/orchestra/result-evaluator.ts`) was designed for code-writing tasks. READ-ONLY audit tasks naturally score 0 on `test_coverage` (no test files written) and low on `correctness` (no code to grade). Aggregate downgrades to NO_GO even when the audit deliverable is correctly written.

Fix: introduce an `auditRubric` mode in `quality-assessor.ts` triggered when `task.scope.filesWrite` shape is purely-MD (no `*.ts`/`*.js`/`*.json`). Dimensions: clarity (60%), evidence-density (20%), scope-compliance (10%), completeness (10%). Wire `result-evaluator.ts:evaluateResult` to select rubric per task type.

**Kanit:** `grep "auditRubric" src/orchestra/quality-assessor.ts` shows new mode; T-161-NNN-style audit tasks pass evaluation under auditRubric

**Test:** 5+ tests (auditRubric path activates for MD-only scope; audit task with strong evidence scores >=80; audit task with no evidence scores <50; code task does not trigger auditRubric; mixed scope falls back to default rubric)

---

### Task 1.3: Synthetic result selfAssessment must be TIMEOUT_WITH_WORK (Bug C)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`src/orchestra/sprint-phases.ts:492-525` synthetic-result path hard-codes `selfAssessment: 'NO_GO'`. Per Sprint 138 ADR-035 verification-protocol, a worker that's still running with fresh heartbeat but no result yet should be marked `TIMEOUT_WITH_WORK` (Honest Assessment Calibration v2 layer). NO_GO is reserved for "worker explicitly returned failure".

Fix: change synthetic-result `selfAssessment` to `TIMEOUT_WITH_WORK` when heartbeat fresh; only `NO_GO` when heartbeat absent or `>2x heartbeat_timeout` stale.

**Kanit:** `grep "TIMEOUT_WITH_WORK" src/orchestra/sprint-phases.ts` returns >=1 hit in synthetic path

**Test:** 3+ tests (fresh hb -> TIMEOUT_WITH_WORK; stale hb -> NO_GO; absent hb -> NO_GO with `notes: 'no heartbeat file'`)

---

## THEME 2: CRITICAL — Recover repair (Bug R1-R4)

> `deckent recover` failed across all four assertions during Sprint 161 kill. These bugs combine to make recovery a no-op illusion.

### Task 2.1: Recover archive write must be verified (Bug R1)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/recover.ts, tests/cli/commands/recover.test.ts
- Scope: src/cli/, tests/

### Description
`deckent recover` claimed "241 task files archived to `.brain/archive/sprint-161-tasks/`" but the directory ended up **empty** (0 files). Either the archive write failed silently, or the move-step was mis-implemented.

Fix: after archive write, re-list the destination directory; if file count !== expected, throw + revert. Wrap entire archive operation in transactional fashion (write to temp dir -> atomic rename -> verify count).

**Kanit:** `grep "verify.*archive" src/cli/commands/recover.ts` returns >=1; recover with 5-task fixture leaves 5 files in archive dir

**Test:** 4+ tests (happy path: count matches; partial failure: revert + error; ENOENT source: handled; permission denied: handled)

---

### Task 2.2: Recover must reset sprint-state.json (Bug R2)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/recover.ts, src/core/sprint-state.ts (if exists)
- Scope: src/cli/, src/core/, tests/

### Description
After Sprint 161 recover, `.deckent/sprint-state.json` still showed `phase: EXECUTE, status: ACTIVE`. Subsequent `deckent status` reflected this stale state.

Fix: `recover` must force-write `sprint-state.json: { phase: 'CLEANUP', status: 'KILLED', killedAt: ISO_8601 }` before completing.

**Kanit:** After `deckent recover`, `cat .deckent/sprint-state.json | jq '.status'` returns `"KILLED"`

**Test:** 3+ tests (state reset on recover; idempotent (repeat recover doesn't fail); preserves `sprintId` for audit trail)

---

### Task 2.3: Recover must kill zombie Brain pid (Bug R3)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/recover.ts
- Scope: src/cli/, tests/

### Description
After Sprint 161 recover, the Brain controller process (pid 286601) was still running idle as a zombie. `recover` should have read the pid file and SIGTERM'd it (with SIGKILL fallback after 10s).

Fix: read `.deckent/pids/sprint-NNN.pid`; verify process exists (`process.kill(pid, 0)`); SIGTERM; wait up to 10s; SIGKILL if still alive; remove pid file.

**Kanit:** After `deckent recover`, `ps -p $PID` returns "no such process"

**Test:** 3+ tests (zombie killed; missing pid file handled; permission denied handled)

---

### Task 2.4: Status display lag fix (Bug R4)
- Model: haiku
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/status.ts
- Scope: src/cli/, tests/

### Description
After Sprint 161 recover, `deckent status` showed "0/49 done" — display didn't reflect the archive operation. (Downstream of Bug R2, but `status.ts` should also defensively detect inconsistencies.)

Fix: when reading sprint-state, cross-check task count against `.tasks/` directory. If mismatch, surface "Stale state detected; run `deckent doctor` for repair" warning.

**Kanit:** `deckent status` after archive returns `(no active sprint)` not `0/49`

**Test:** 2+ tests (consistent state passes; mismatch triggers warning)

---

### Task 2.5: Sprint-stall watchdog (Bug Sprint-Stall)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/result-collector.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
After FIX phase transition (08:18Z), 41 fix tasks were queued in `.tasks/` but no workers were spawned for >1 hour. `docker ps` empty, `tmux ls` empty. The spawn loop deadlocked silently.

Fix: add a watchdog timer in `processQueue` / `result-collector.waitForResults`. If `pendingTasks > 0` AND `0 workers spawned for >120s` AND `phase != CLEANUP`, log `"sprint-stall detected, forcing CLEANUP phase"` + transition to CLEANUP. Operator notification via DECKENT-USER-NOTIFY canal (Sprint 139 Task 41 dispatcher).

**Kanit:** Force-create stall scenario (mock `spawnWorker` no-op); after 120s, sprint-state.json shows `phase: CLEANUP`

**Test:** 4+ tests (stall detected after grace; no false-positive on healthy spawn cycle; CLEANUP transition idempotent; operator notification fires)

---

## THEME 3: HIGH — ADR conflicts

### Task 3.1: ADR-010 amendment — Single Runtime Dependency reconciliation
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: .brain/memory.db (via `deckent remember`/MemoryStore), .brain/exports/decisions.md, package.json
- Scope: .brain/, scripts/

### Description
ADR-010 declares "tek runtime dependency olarak `commander@^13.0.0`." Real `package.json` has 7 prod deps (commander, telegraf, zod, better-sqlite3, @noble/ed25519, @noble/hashes, @modelcontextprotocol/sdk) + 1 optional (discord.js).

Fix: insert ADR-045 (or next free slot) "Minimal-but-justified runtime dependencies" — list current 7 prod deps with single-line rationale per package + gating policy: "any new runtime dep requires ADR amendment." Mark ADR-010 as `superseded` by the new ADR.

**Kanit:** `deckent recall "ADR-010"` returns superseded; new ADR contains 7 deps + rationale

**Test:** N/A (doc-only task)

---

### Task 3.2: ADR-038 Kademe 2 reconciliation — handoff-protocol + brain-context disposition
- Model: sonnet
- Effort: low
- Skills: typescript-expert, documentation-writer
- Files: src/orchestra/handoff-protocol.ts, src/orchestra/brain-context.ts, .brain/memory.db
- Scope: src/orchestra/, .brain/

### Description
ADR-038 prescribed "@deprecated JSDoc + DEFERRED-ADR-038 marker" for these modules. Verification: 0 importers in src/, no `@deprecated` tag, no marker. 22+ sprints overdue for Sprint 145 reassessment.

Fix: choose path A (delete) OR path B (re-affirm with explicit Sprint 167 review checkpoint AND inject markers). Recommend path A given 22-sprint dormancy + 0 importers.

**Kanit:** Either `ls src/orchestra/handoff-protocol.ts` returns no-such-file, OR file head has `@deprecated // DEFERRED: ADR-038, reassess Sprint 167`

**Test:** 1+ test (no broken imports — `tsc --noEmit` clean post-removal)

---

### Task 3.3: ADR-005 fate decision (sync I/O)
- Model: opus
- Effort: low
- Skills: documentation-writer, system-architect
- Files: .brain/memory.db (ADR-005 amendment)
- Scope: .brain/

### Description
ADR-005 says synchronous I/O is deprecated. 804 sync I/O sites remain in src/ (50 in `src/orchestra/`). No migration plan, no follow-up ADR.

Fix: decide — (a) commit to async migration roadmap (multi-sprint plan, target Sprint 165-170) OR (b) rescind ADR-005 deprecation (mark `accepted` again with rationale: "synchronous I/O acceptable for orchestrator paths; async only mandated for hot-paths"). Recommend (b) given practical workload.

**Kanit:** `deckent recall "ADR-005"` shows updated status

**Test:** N/A (doc-only)

---

### Task 3.4: ADR-042 status promotion (proposed -> accepted)
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: .brain/memory.db (ADR-042 status update)
- Scope: .brain/

### Description
ADR-042 (Hybrid Mode) is `proposed` but Sprint 149/150 confirmed shipped. 32 active call sites in src/.

Fix: promote ADR-042 to `accepted` with backfilled acceptance evidence date.

**Kanit:** `deckent recall "ADR-042"` returns status=accepted

**Test:** N/A

---

### Task 3.5: ADR-035 backward-compat decision
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: .brain/memory.db (ADR-035 amendment)
- Scope: .brain/

### Description
ADR-035 specifies "Sprint 142: file-based removed, only event stream." We're at Sprint 161, .hb/.result still active. Milestone missed by 19 sprints.

Fix: amend ADR-035 with EITHER (a) extended timeline to Sprint 175 with explicit reason OR (b) "permanent dual-state — file-based + event stream both kanonik." Recommend (b) — file-based is dogfood-validated and operator-friendly.

**Kanit:** ADR-035 lists current dual-state status

**Test:** N/A

---

## THEME 4: HIGH — Documentation pollution cleanup (D5a P0 fixes)

### Task 4.1: Auto-regen claim counts script + publish gate
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: scripts/regen-claim-counts.mjs (NEW), scripts/validate-publish.ts, package.json
- Scope: scripts/, tests/

### Description
D5a P0-1..P0-5: CLAUDE.md, IDENTITY.md, DECKENT.md, README.md, .claude/rules/* claim counts have drifted (CLI=46/48/55+, MCP=31/27, sprint pointer 4-5 stale, ADR injection 42/45). Manual sync is failing.

Fix: write `scripts/regen-claim-counts.mjs` that computes:
- CLI commands (`grep -hE "^export function register" src/cli/commands/*.ts | wc -l`)
- MCP tools (file count in `src/mcp/tools/` excluding `index.ts` + `job-runner.ts`)
- MCP resources (file count in `src/mcp/resources/`)
- Built-in agents (dirs in `.deckent/agents/` excluding `archive/`, `temp-*`)
- Built-in skills (dirs in `.deckent/skills/`)
- ADRs (`grep -c "^## adr-"` in `.brain/exports/decisions.md`)
- Sprint pointer (`.brain/sprints/` max + `.deckent/config.json.last_sprint_id`)
- Total .md count

Write generated values to a single `docs/META-INVENTORY.md` (or extend `IDENTITY.md`). Update `validate-publish.ts` to fail if CLAUDE.md/DECKENT.md/IDENTITY.md/README.md claim counts diverge from script output.

**Kanit:** `npm run validate:publish` fails when CLAUDE.md is stubbed wrong; passes when regen script ran

**Test:** 5+ tests (each claim type detected; mismatch fails build; match passes; new metric type extensible; idempotent re-run)

---

### Task 4.2: Sprint 154 T-010 archival (3 root MDs to docs/archive/sprint-152/)
- Model: haiku
- Effort: low
- Skills: documentation-writer, git-expert
- Files: NEXT-SESSION-PROMPT.md, SYSTEM-MIGRATION-2026-04-22.md, DECKENT-TEST-REPORT.md, docs/archive/sprint-152/
- Scope: ./, docs/archive/

### Description
D5a P2-1..P2-3 + Sprint 154 T-010: these 3 root MDs are orphans flagged for archival 7 sprints ago, never executed.

Fix: `git mv NEXT-SESSION-PROMPT.md docs/archive/sprint-152/`, same for the other two. Pure relocation; no content change.

**Kanit:** `ls docs/archive/sprint-152/{NEXT-SESSION-PROMPT,SYSTEM-MIGRATION-2026-04-22,DECKENT-TEST-REPORT}.md` shows 3 files

**Test:** N/A (file-move; verify with link-checker)

---

### Task 4.3: CHANGELOG reconciliation
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: CHANGELOG.md, docs/CHANGELOG.md
- Scope: ./, docs/

### Description
D5a P0-6: root `CHANGELOG.md` (123 lines, frozen 2026-04-24) vs `docs/CHANGELOG.md` (2,612 lines, active). Public consumers find root first; serving them frozen content is misleading.

Fix: replace root `CHANGELOG.md` with a 5-line stub pointing to `docs/CHANGELOG.md`. OR delete root and update `package.json` (if any reference) to point at docs version.

**Kanit:** `wc -l CHANGELOG.md` returns ~5; first line links to docs version

**Test:** N/A

---

### Task 4.4: Code of Conduct dedup
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: CODE_OF_CONDUCT.md, docs/launch/CONDUCT.md
- Scope: ./, docs/launch/

### Description
D5a P0-7: root `CODE_OF_CONDUCT.md` (52 lines) vs `docs/launch/CONDUCT.md` (separate file, no cross-reference).

Fix: keep root canonical. Either delete `docs/launch/CONDUCT.md` or replace with a 1-line link to root.

**Kanit:** `diff CODE_OF_CONDUCT.md docs/launch/CONDUCT.md || true` shows reconciled state

**Test:** N/A

---

### Task 4.5: Regenerate `.claude/rules/{brain,auditor,worker-default}.md` ADR injection
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: .claude/rules/brain.md, .claude/rules/auditor.md, .claude/rules/worker-default.md
- Scope: .claude/

### Description
D5a P0-5: rules files inject 42 ADRs; DB has 45 (ADR-040, 041, 042, 045, 046 missing). Worker prompts miss 5 active ADRs.

Fix: integrate rules-file regeneration into existing `deckent memory export` flow. Generate from `.brain/exports/decisions.md` to ensure 45/45 sync.

**Kanit:** `grep -c "^- \*\*ADR-" .claude/rules/brain.md` returns >=45

**Test:** 1+ test (regen produces correct count)

---

## THEME 5: HIGH — Memory V2 fixes (D7 + D8)

### Task 5.1: Wire `store.decay()` into sprint CLEANUP phase
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/memory-store.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/, tests/

### Description
D7 P2-A: 11 entries (mem-132..139, sprint-log-136..139) below decay cutoff (`current_sprint - 20 = 140`) are NOT decayed. Decay never ran on memory/sprint types despite ADR-008 contract.

Fix: in CLEANUP phase, call `store.decay(currentSprintNum, decayAfterSprints)` for `type IN ('memory','sprint','retro')`. Verify ADRs/identity stay decay_exempt=1.

**Kanit:** After Sprint 162 CLEANUP, `sqlite3 .brain/memory.db "SELECT count(*) FROM entries WHERE type='memory' AND sprint_num < 142 AND deleted_at IS NULL"` returns 0

**Test:** 4+ tests (decay runs; exempt entries preserved; deleted_at written; idempotent)

---

### Task 5.2: Atomic export pipeline (D7 P1-B)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/memory-export.ts, tests/core/memory-export.test.ts
- Scope: src/core/, tests/

### Description
D7 P1-B: `decisions.md` 67-min stale vs other exports — non-atomic export pipeline.

Fix: wrap all 4 export writes (`summary.md`, `decisions.md`, `memory.md`, `debt.md`) in single transaction. Stamp each export with `db_mtime` footer for drift visibility.

**Kanit:** All 4 exports have identical mtime within 1s window after `deckent memory export`

**Test:** 3+ tests (atomic write; partial failure rollback; mtime sync)

---

### Task 5.3: PROJECT-IDENTITY.md auto-regen from config + agent-pool stats
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, scripts/regen-project-identity.mjs (NEW)
- Scope: src/, scripts/, .brain/, tests/

### Description
D8 P0: `.brain/PROJECT-IDENTITY.md` 14 days stale (claims sprint-160, MCP=22, Node>=18). 5 identity files disagree on every metric.

Fix: write `scripts/regen-project-identity.mjs` invoked from CLEANUP phase. Sources: `.deckent/config.json`, `agent-pool.getStats()`, `skill-pool.getStats()`, `package.json.engines.node`.

**Kanit:** Post-CLEANUP, `grep "Sprint:" .brain/PROJECT-IDENTITY.md` reflects current sprint

**Test:** 4+ tests (each metric source; staleness detected; idempotent regen; concurrent-write safe)

---

### Task 5.4: ERRORS.md cap + rotation
- Model: haiku
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts (or memory-decay), src/core/memory-store.ts
- Scope: src/, .brain/

### Description
D8 P1: `.brain/ERRORS.md` = 600 lines (67% of 900-line aggregate budget). No per-file cap.

Fix: add `ERRORS_MD_CAP = 250` constant. On overflow, rotate oldest entries to `.brain/archive/ERRORS-sprint-NNN.md`.

**Kanit:** After overflow simulation, `wc -l .brain/ERRORS.md` returns <=250; archive file created

**Test:** 2+ tests (overflow rotates; under-cap preserves)

---

## THEME 6: MEDIUM — Library version migration (D4)

### Task 6.1: Zod v3/v4 import unification (D4-F1 HIGH)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp/tools/feature-query.ts, src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/api/server.ts, src/cli/commands/skill.ts
- Scope: src/

### Description
5 files import plain `'zod'` (v3) while sibling MCP tools use `'zod/v4'`. `feature-query.ts` is highest risk — MCP SDK v2 will hard-bind to v4 schemas. Plus `task-builder.ts:67` uses deprecated `result.error.format()`.

Fix: migrate all 5 files to `'zod/v4'`. Replace `result.error.format()` with `z.treeifyError()` or `z.prettifyError()`. Keep schemas isomorphic.

**Kanit:** `grep -l "from 'zod'" src/` returns 0 (all migrated to `zod/v4`)

**Test:** 3+ tests per file (schema parses; error formatting works; round-trip with MCP SDK)

---

### Task 6.2: MCP SDK v2 import-path migration prep (D4-F2 MEDIUM)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/mcp/server.ts + 28 files in src/mcp/tools/, src/mcp/resources/
- Scope: src/mcp/, tests/mcp/

### Description
D4-F2: MCP SDK v2 splits into per-role packages. Mechanical import-path migration across 31 files when v1 EOL announced. Currently `1.27.1` -> patch-bump available `1.29.0` (closes hono/express-rate-limit/ip-address chain advisories — D1 P2).

Fix: bump to `@modelcontextprotocol/sdk@^1.29.0` first (closes 5 P2 audit advisories). Plan v2 import-path codemod as Sprint 168+ task; do NOT execute now (v1 still shipping).

**Kanit:** `npm audit --audit-level=moderate` returns 1 advisory (down from 6); MCP server/tools/resources unchanged

**Test:** Existing MCP suite passes; smoke test `deckent_status` via MCP

---

### Task 6.3: React 19 forwardRef removal (D4-F3 LOW)
- Model: haiku
- Effort: low
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/components/ui/select.tsx, src/dashboard/src/components/ui/input.tsx, src/dashboard/src/components/ui/scroll-area.tsx
- Scope: src/dashboard/, tests/

### Description
D4-F3: React 19 made `ref` a regular prop on functional components. `forwardRef` is soft-deprecated. 3 dashboard primitives still wrap with `forwardRef`.

Fix: destructure `ref` from props directly; remove `forwardRef` wrappers.

**Kanit:** `grep -l forwardRef src/dashboard/` returns 0

**Test:** Existing dashboard test suite passes (413 tests)

---

### Task 6.4: happy-dom security patch bump (D1 P1)
- Model: haiku
- Effort: low
- Skills: devops-engineer
- Files: package.json, package-lock.json
- Scope: ./

### Description
D1 P1: `happy-dom@20.8.4` has 2 high-severity CVEs (CVSS 7.5 + 8.8). Wanted: 20.9.0 (patch bump).

Fix: `npm install happy-dom@20.9.0 --save-dev`. Validate dashboard test suite passes.

**Kanit:** `npm audit --audit-level=high` no longer lists happy-dom

**Test:** `npm run test:dashboard` passes (413 tests)

---

## THEME 7: MEDIUM — Security HIGH-F13 (D9)

### Task 7.1: Migrate worker-verify shell template-literal to safer process spawn
- Model: opus
- Effort: normal
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/agents/worker-verify.ts, src/orchestra/mid-sprint-adapter.ts
- Scope: src/, tests/

### Description
D9 F13 HIGH: `worker-verify.ts:122-127` builds shell command string via template-literal with `scope.directories.join(' ')`. Same at `mid-sprint-adapter.ts:228 (pathArgs)` and `:284 (testPatterns)`. Defaults to `/bin/sh` shell parsing — if `.tasks/` is poisoned outside Brain (RBAC bypass / supply-chain), attacker can inject metacharacters.

Fix: migrate from shell-string template literal in `child_process.exec` family to `execFileSync(bin, args[])` form. The args-array form bypasses shell. Aligns with ADR-006 spirit.

**Kanit:** `grep -E '\.exec\(|spawnSync\(' src/agents/worker-verify.ts src/orchestra/mid-sprint-adapter.ts` shows only safe `(bin, args[])` form (no template-literal interpolation into command string)

**Test:** 4+ tests (execFile equivalent of each previous shell call; metacharacter injection no longer works; existing tsc/vitest invocations still succeed; scope with spaces handled correctly)

---

## THEME 8: MEDIUM — dist/test-marker cleanup (D2-F5)

### Task 8.1: Remove src/test-sprint-154-marker.ts (npm consumer leak)
- Model: haiku
- Effort: low
- Skills: typescript-expert, devops-engineer
- Files: src/test-sprint-154-marker.ts, .npmignore
- Scope: src/, ./

### Description
D2-F5 + D5b P0-7: Sprint 154 dogfood marker file ships in `dist/` and would leak to npm consumers as `dist/test-sprint-154-marker.js`.

Fix: `git rm src/test-sprint-154-marker.ts`. Run `npm run build` to confirm `dist/test-sprint-154-marker.js` is gone. Add a defensive `*-marker.{ts,js}` rule to `.npmignore` for future Sprint NNN markers.

**Kanit:** `ls dist/test-sprint-154-marker.js` returns "no such file"; `npm pack --dry-run` does not list it

**Test:** N/A (file-removal; verify with build + pack)

---

## THEME 9: MEDIUM — `.gitignore` extensions for public-flip (D5b P0)

### Task 9.1: `.gitignore` runtime-state extension
- Model: haiku
- Effort: low
- Skills: devops-engineer
- Files: .gitignore, scripts/verify-gitignore.mjs
- Scope: ./

### Description
D5b P0-3..P0-6: `.deckent/jobs/`, `sprint-*-*` runtime files, `pids/`, `cache/`, `.dashboard`, `config.json.bak*` should be `.gitignore`d.

Fix: extend `.gitignore` with patterns from `PUBLIC-REPO-MIGRATION-PLAN.md` Section 4.3. Run `scripts/verify-gitignore.mjs`.

**Kanit:** `git ls-files .deckent/jobs/ .deckent/sprint-*-* .deckent/pids/ .deckent/cache/` returns empty

**Test:** N/A (config; verify via scripts/verify-gitignore.mjs)

---

### Task 9.2: Remove deckent-hub/ misplaced sub-repo
- Model: haiku
- Effort: low
- Skills: git-expert
- Files: deckent-hub/ (entire dir), .gitignore
- Scope: ./

### Description
D5b P0-1: 65 files `deckent-hub/` looks like accidental clone of separate hub repo.

Fix: `git submodule status` first. If not a submodule, `git rm -r deckent-hub/`. Add `deckent-hub/` to `.gitignore` as defense.

**Kanit:** `ls deckent-hub/ 2>/dev/null` returns nothing; `.gitignore` lists pattern

**Test:** N/A

---

### Task 9.3: Remove .test-e2e-sprint-*/ orphan sandboxes
- Model: haiku
- Effort: low
- Skills: git-expert
- Files: .test-e2e-sprint-21914/, .test-e2e-sprint-33991/, .gitignore
- Scope: ./

### Description
D5b P0-2: 21 orphan e2e test sandbox files.

Fix: `git rm -rf .test-e2e-sprint-*/`. Add `.test-e2e-sprint-*/` to `.gitignore`.

**Kanit:** `ls .test-e2e-sprint-* 2>/dev/null` returns nothing

**Test:** N/A

---

## THEME 10: LOW — D6 generator-naming alignment (Plan A)

### Task 10.1: Generator-side prompt/worker naming alignment
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/orchestra/tmux.ts, src/cli/commands/cleanup.ts, src/orchestra/sprint-lifecycle.ts, src/orchestra/sprint-docs-updater.ts, src/mcp/tools/cleanup.ts, scripts/prompt-linter.mjs
- Scope: src/, scripts/, tests/

### Description
D6 P0-1..P0-3: Sprint 160 T-001 narrowed consumers to `.prompt-task-*`/`.worker-task-*` literals, but generators emit `.prompt-${taskId}-${hash}.txt` and `.worker-${taskId}.sh` — **no emitter ever produces the `task-` literal**. Sprint 160 fix is silently no-op for live sweeps. Plus `mcp/tools/cleanup.ts` was NOT updated alongside Sprint 160 (CLI/MCP parity violation per ADR-022-V2).

Fix (Plan A): rename generator emissions:
- `spawn-backend-docker.ts:167` -> `` `.prompt-task-${taskId}-${promptId}${fixSuffix}.txt` ``
- `spawn-backend-docker.ts:187` -> `` `.worker-task-${taskId}.sh` ``
- `tmux.ts:60` -> `` `.prompt-task-${taskId}-${id}.txt` `` (plumb `taskId` into `writePromptFile`)
- Update `prompt-linter.mjs:252,310` filter to new prefix
- Update `mcp/tools/cleanup.ts:28,46` to match CLI cleanup narrowing
- Update `docs/guide/docker-backend.md:186` (generator-naming reference)

**Kanit:** Live sprint produces `.tasks/.prompt-task-NNN-NNN-...txt` and `.tasks/.worker-task-NNN-NNN.sh`; cleanup phase actually unlinks them

**Test:** 6+ tests (Docker generator emits new format; tmux generator emits new format; sprint-lifecycle sweep matches; cleanup CLI matches; cleanup MCP matches; plant `.prompt-TEST-PLANT.txt` survives)

---

## SPRINT METRICS PROJECTION

**Estimated total task count for Sprint 162:** **~24 tasks**

By theme:
- Theme 1 (orchestration repair): 3 tasks
- Theme 2 (recover repair): 5 tasks
- Theme 3 (ADR conflicts): 5 tasks
- Theme 4 (doc pollution P0): 5 tasks
- Theme 5 (Memory V2): 4 tasks
- Theme 6 (library migration): 4 tasks
- Theme 7 (security HIGH): 1 task
- Theme 8 (dist/test-marker): 1 task
- Theme 9 (.gitignore P0): 3 tasks
- Theme 10 (D6 generator): 1 task

**Critical path (must-land for Beta GA flip):** Theme 1 + 2 (8 tasks). Without these, Sprint 163+ cannot run reliably.

**Estimated effort:**
- 6 high-effort opus tasks (Themes 1.1, 1.2, 2.5, 4.1, 7.1, 10.1)
- 12 normal-effort sonnet tasks
- 6 low-effort haiku tasks
- Total: ~12-16 hours of worker time + ~2-4 hours of operator review

**Mode recommendation:** start with Themes 1+2 in `performance` mode (opus for orchestration correctness), then 4+5+9 in `balanced` mode, then 6+8+10 in `economic` mode.

---

*End SPRINT-162-DIRECTIVES-DRAFT.md — 2026-05-08*
