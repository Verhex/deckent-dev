# Sprint 161 God-Audit Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the three-lane parallel READ-ONLY god-audit per spec `docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md` and produce 5 deliverables (executive summary, migration triage matrix, public-repo migration plan, Sprint 162 directives draft, ROADMAP-GOD-LEVEL patch).

**Architecture:** Coordinator (CC main agent) spawns Lane 1 (deckent sprint background), Lane 2 (3 CC monitor sub-agents), Lane 3 (9 CC deep-dive sub-agents) in parallel at T+0. Periodic mid-sprint syncs. End barrier detection via Lane 1 COMPLETE event. Consolidator step merges all reports.

**Tech Stack:** deckent CLI (`deckent start --auto-approve`), MCP (`deckent_status`, `deckent_memory_query`), Claude Code Agent tool (`subagent_type: general-purpose`, `run_in_background: true`), context7 MCP (`mcp__plugin_context7_context7__query-docs`), Bash (read-only sqlite3, npm audit, find, grep), Read/Write to markdown only.

**Critical rule across the entire plan:** No source code writes. No file deletions. All outputs land under `docs/audits/sprint-161/`. Boundary integrity verified by `git diff --stat` at end barrier.

---

## File Structure

Files this plan will create (all under `docs/audits/sprint-161/`):

```
docs/audits/sprint-161/
├── EXECUTIVE-SUMMARY.md                      (Consolidator, Phase 8)
├── MIGRATION-TRIAGE-MATRIX.md                (Consolidator, Phase 8)
├── PUBLIC-REPO-MIGRATION-PLAN.md             (Consolidator, Phase 8)
├── SPRINT-162-DIRECTIVES-DRAFT.md            (Consolidator, Phase 8)
├── ROADMAP-PATCH.md                          (Consolidator, Phase 8)
├── T-161-NNN-{area}-{focus}.md               (Lane 1, ~160-235 files)
├── cc-monitor/
│   ├── A1-brain-rubric-anomalies.md          (Lane 2 A1)
│   ├── A2-worker-honesty.md                  (Lane 2 A2)
│   └── A3-auditor-authority.md               (Lane 2 A3)
└── cc-deepdive/
    ├── D1-node-modules.md                    (Lane 3 D1)
    ├── D2-dist-src-drift.md                  (Lane 3 D2)
    ├── D3-adr-cross-reference.md             (Lane 3 D3)
    ├── D4-library-version-mismatch.md        (Lane 3 D4)
    ├── D5a-doc-pollution.md                  (Lane 3 D5a)
    ├── D5b-migration-triage.md               (Lane 3 D5b)
    ├── D6-fixture-references-non-test.md     (Lane 3 D6)
    ├── D7-memory-v2-deep-audit.md            (Lane 3 D7)
    ├── D8-deckent-brain-structural.md        (Lane 3 D8)
    └── D9-security-surface.md                (Lane 3 D9, optional)
```

Files this plan will modify:
- `DIRECTIVES.md` (Phase 1 — Sprint 161 Lane 1 input)

Files this plan will NOT touch:
- Anything in `src/`, `tests/`, `dist/`, `node_modules/`, `.deckent/`, `.brain/`, root configs

---

## Phase 0: Pre-Flight Checks

**Goal:** Verify environment is sane before spawning anything.

### Files
None modified. Read-only checks.

- [ ] **Step 0.1: Verify git working tree state**

Run:
```bash
git status --short | head -20
git log --oneline -3
```

Expected: Working tree may have modifications (.brain/ exports, etc. from prior work) but no in-progress merge or rebase. HEAD points to a commit including spec doc `docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md`.

If unexpected (rebase in progress, detached HEAD): STOP, ask user.

- [ ] **Step 0.2: Verify deckent doctor passes**

Run:
```bash
npx deckent doctor 2>&1 | grep -E "PASS|FAIL|WARN"
```

Expected:
```
OK Platform — WSL2/Linux
OK Node.js — v20+ (or v22, v24)
OK git — v2+
OK Claude CLI — Ready
[PASS] Claude CLI ... session auth active
[PASS] Gemini CLI ... subscription auth active
[PASS] Environment — vscode (or similar) detected
```

`[WARN] Codex CLI not installed` and `[FAIL] Brain Dir — Missing: DECISIONS.md` are EXPECTED (Sprint 160 finding: legacy doctor check, Memory V2 makes DECISIONS.md kasıtlı yok). Proceed.

- [ ] **Step 0.3: Confirm Lane 1 / Lane 3 tool availability**

Run:
```bash
which gemini claude && command -v sqlite3 && command -v jq
node --version
docker --version
```

Expected: All commands resolve. Node ≥ 20. Docker daemon reachable.

- [ ] **Step 0.4: Confirm spec exists and is approved**

Run:
```bash
ls -la docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md
head -10 docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md
```

Expected: File exists, header includes `Status: APPROVED`.

If missing: STOP, plan execution cannot proceed without spec.

---

## Phase 1: Write Sprint 161 DIRECTIVES.md

**Goal:** Produce the Lane 1 input file. Brain's structured planner will parse this and emit 160-235 task JSONs into `.tasks/`.

### Files
- Modify: `DIRECTIVES.md` (overwrite — Brain auto-archives previous Sprint 160 to `.brain/archive/DIRECTIVES-sprint-160.md` already)

- [ ] **Step 1.1: Verify previous DIRECTIVES is archived**

Run:
```bash
ls .brain/archive/DIRECTIVES-sprint-160.md
head -3 DIRECTIVES.md
```

Expected: Archive exists; current `DIRECTIVES.md` says "(Sprint 161 için hazırlanıyor)".

- [ ] **Step 1.2: Write Sprint 161 DIRECTIVES.md**

Write the file with this exact content:

````markdown
# DIRECTIVES — Sprint 161: God-Level READ-ONLY Self-Audit (Lane 1)

## Referanslar
- Spec: docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md
- Önceki sprint arşiv: .brain/archive/DIRECTIVES-sprint-160.md
- ROADMAP context: docs/ROADMAP-GOD-LEVEL.md

## Goal
Pre-beta comprehensive READ-ONLY static audit of deckent project (excluding tests/).
10 macro areas: 7 source-code groups + docs/ + .deckent/+.brain/+Memory V2 + hidden config.
Decomposed into 160-235 audit tasks. Every file every line. Each task produces a
markdown finding report with severity-tagged P0-P3 items, file:line evidence, and
per-file migration triage classification (KEEP-PRIVATE / MIGRATE-PUBLIC /
DELETE-CANDIDATE / UNCERTAIN).

## ABSOLUTE RULES — Workers MUST OBEY

- DO NOT write source code anywhere
- DO NOT delete any file
- DO NOT refactor anything
- DO NOT modify .deckent/, .brain/, .github/, root config files
- DO NOT touch tests/ (out of scope this sprint)
- ONLY write to your assigned audit report at docs/audits/sprint-161/T-161-NNN-{area}-{focus}.md
- scope.filesWrite contains EXACTLY ONE PATH (the audit report)
- ADR-037 RBAC + ADR-039 self-modifying detector flag any deviation as P0 boundary violation

## Per-task report format (mandatory sections)

1. **Scope** — exact file list audited (paths)
2. **Findings** — per finding: severity tag (P0/P1/P2/P3), dimension category,
   one-line summary
3. **Evidence** — file:line citations, exact quoted text/code/config excerpt
4. **Migration triage** — for each audited file: KEEP-PRIVATE | MIGRATE-PUBLIC | DELETE-CANDIDATE | UNCERTAIN, with one-line rationale
5. **Recommendation** — Sprint 162+ work description (NOT a code change)

---

## Task 1: src/core/ Audit — Wave 1 (config + types subset)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-001-core-config-types.md
- Scope: src/core/

### Description
READ-ONLY audit of `src/core/config.ts`, `src/core/config-types.ts`, `src/core/types.ts`,
and 2-3 closely related `*-types.ts` modules (≤8 files, ≤2000 LoC). Apply 10 audit
dimensions:
1. Dead code (unused exports — grep ./src for caller, exclude tests/)
2. ADR violations (ADR-001 ESM, ADR-002 Node16 .js extension imports, ADR-004 3-layer config merge, ADR-008 dependency direction)
3. Conflicting areas (same config logic in multiple places)
4. Drift (comments vs behavior)
5. Type safety regressions (any, ts-ignore, as unknown as)
6. Dependency hygiene (import paths)
7. Documentation pollution (n/a for code)
8. Memory V2 coherence (n/a)
9. Config integrity (config defaults vs documented behavior)
10. Migration triage (per file)

Write findings to docs/audits/sprint-161/T-161-001-core-config-types.md.

**Kanıt:** `git diff --stat` shows ONLY +N lines in docs/audits/sprint-161/T-161-001-core-config-types.md
**Test:** READ-ONLY task — no test execution required.

---

## Task 2: src/core/ Audit — Wave 2 (Memory V2 modules)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-002-core-memory-v2.md
- Scope: src/core/

### Description
READ-ONLY audit of `src/core/memory-store.ts`, `src/core/memory-query.ts`,
`src/core/memory-normalize.ts`, `src/core/memory-types.ts`, `src/core/memory-export.ts`,
`src/core/memory-import.ts` (≤8 files, ≤2000 LoC). Specific lead questions:
- DB schema migration version vs schema_version table
- FTS5 dual-layer turkishNormalize columns alignment
- exports vs DB query result drift
- Decay-exempt entries correctness (PROJECT-IDENTITY etc.)

Apply 10 audit dimensions, write to docs/audits/sprint-161/T-161-002-core-memory-v2.md.

**Kanıt:** Single audit report file.
**Test:** N/A (read-only).

---

## Task 3 .. Task N: src/core/ Audit — Waves 3-N
[Brain will generate via structured planning. Each wave covers 3-8 modules,
≤2000 LoC, opus model, normal effort, output single audit report.]

PATTERN: Same structure as Tasks 1-2 — apply 10 dimensions, single output report,
READ-ONLY scope, single filesWrite path.

Brain will partition the 94 src/core/ modules into ~25-35 waves grouped by
semantic clusters (config, types, memory-V2, agent-pool, skill-pool, provider,
routing, model-registry, mode-presets, etc.).

---

## Task Group: src/orchestra/ Audit (~20-30 tasks)
[Brain partitions 76 modules. Wave themes: brain/sprint-controller, planner,
task-builder/router, result-evaluator, debt-manager, sprint-reporter, tmux,
spawn-backend (docker, subprocess), outcome-tracker, quality-assessor,
mid-sprint-adapter, rule-evolver, temp-skill-generator, promotion-pipeline,
sprint-utils, result-collector, sprint-lifecycle, sprint-finalizer,
sprint-docs-updater, sprint-phases, retro/decay/cleanup helpers]

Per-area lead question: After Sprint 154 wire-validation reform, are the 4 wired
exports (respawnEligibleTasks, applyCascadeToSprint, applyUnblockToSprint,
reconcileSpuriousNoGo) still alive? Any new dead exports since Sprint 154?

PATTERN: same as Task 1.

---

## Task Group: src/cli/commands/ Audit (~15-25 tasks)
[Brain partitions 46 commands. Wave themes: lifecycle (start/status/kill/cleanup),
planning (plan/init/set_directives), introspection (history/retro/explain/help),
config (config/doctor/sync/agent_list/skill_list), advanced (audit/feature_query/recover/checkpoint/docs/memory_query), CLI infrastructure (entry, helpers, register*)]

Per-area lead question: All 46 commands documented in CLAUDE.md? `register{Name}`
pattern (ADR-012) consistently applied? Each command has --help that reflects
parameters?

PATTERN: same.

---

## Task Group: src/mcp/ Audit (~15-20 tasks)
[Brain partitions 31 tools + 8 resources. Wave themes: lifecycle tools, planning
tools, observational tools, advanced tools (audit/feature_query/recover/nervous/*),
resources (dashboard/directives/memory/debt/config/retro/tasks/agents)]

Per-area lead question: 31 tools registered AND parameter schemas match CLI parity
(ADR-022-V2)? Each tool has consistent description, errors propagated correctly?

PATTERN: same.

---

## Task Group: src/agents/ + src/nervous/ Audit (~10-15 tasks)
[Brain partitions per-component: worker.ts, adaptive-agent.ts, agents helpers,
observer/detector-registry/decision-engine/proposer/dispatcher/executor/
authority-matrix/runtime-scope-check/history (nervous)]

Per-area lead question: ADR-040 nervous half-loop fix (Sprint 154 Wave B T8)
still wired? 11 detectors registered? Sprint 153 B1+B2 dogfood evidence in code?

PATTERN: same.

---

## Task Group: src/api/ + src/connectors/ + src/providers/ Audit (~10-15 tasks)
[Brain partitions per-module. Wave themes: api server/auth/sse, connectors
discord/telegram/whatsapp/incoming-router, providers claude/codex/gemini]

Per-area lead question: Discord/Telegram bot scaffolds aligned with what's
claimed in BETA-TRACKER (Gate #13)? Provider isAvailable() checks consistent
across 3 adapters?

PATTERN: same.

---

## Task Group: src/dashboard/ Audit (~15-20 tasks)
[Brain partitions per-page/component. Wave themes: pages (7), shared components,
hooks, state, routing, tailwind config]

Per-area lead question: 7 pages list match reality? Build artifacts in
dist-dashboard/ integrity-clean? Vite config matches Sprint 153 vitepress fix?

PATTERN: same.

---

## Task Group: docs/ + Project Root .md Files Audit (~30-50 tasks)
[Brain partitions per-section: docs/audits/, docs/superpowers/, docs/development/,
docs/analysis/, docs/architecture/, project-root .md (README, README-TR,
BETA-TRACKER, BETA-TRACKER-TR, CHANGELOG, CHANGELOG-TR, VISION, VISION-TR,
COMPETITIVE-ANALYSIS, CLAUDE.md, DECKENT.md, DIRECTIVES.md (current — recursive
note), DECKENT-MASTER-BLUEPRINT.md, DECKENT-ANA-PLAN-TR.md, ROADMAP-GOD-LEVEL.md,
KNOWN_ISSUES.md, etc.)]

Per-area lead question per .md file:
- When was it last meaningfully updated?
- Does it accurately reflect current Sprint 159+ state?
- Has duplicate/near-duplicate elsewhere?
- Orphaned (no inbound link from CLAUDE.md / DECKENT.md / README)?
- Outdated audit reports under docs/audits/sprint-NNN/ accumulation?

PATTERN: same.

---

## Task Group: .deckent/ + .brain/ + Memory V2 Audit (~15-20 tasks)
[Brain partitions per-substructure:
- .deckent/agents/*/agent.json (15 built-in + 3 custom)
- .deckent/skills/*/manifest.json (21)
- .deckent/decisions/ accumulation
- .deckent/archive/sprints/ retention
- .deckent/features-manifest.json vs runtime
- .deckent/project-stack.json accuracy
- .deckent/provider-cache.json staleness
- .deckent/ci-baseline.json correctness
- .deckent/config.json schema validation
- .brain/exports/*.md vs DB query
- .brain/archive/ retention
- .brain/ERRORS.md, MEMORY.md, PATTERNS.md, RETRO.md, PROJECT-IDENTITY.md
- .brain/sprints/sprint-NNN.md budget per CLAUDE.md gotcha (100 lines/file)]

Per-area lead question: Schema validity? Drift from runtime reality? Decay state
correctness? Budget compliance?

PATTERN: same. NOTE: Workers must NOT modify .deckent/ or .brain/ — read only.
SQLite access via `sqlite3 -readonly .brain/memory.db` if querying.

---

## Task Group: Hidden Config & Meta Files Audit (~5-10 tasks)
[Brain partitions:
- Root: .gitignore, .dockerignore, .npmrc, .editorconfig, .npmignore, .eslintrc*, .prettierrc*, tsconfig*.json, vitest.config*.ts, package.json, package-lock.json (presence/integrity), Dockerfile, docker-compose*.yml
- .github/: workflows, ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE, dependabot.yml, CODEOWNERS, SECURITY.md if any
- .vscode/: settings.json, launch.json, extensions.json
- .gemini/, .cursor/: rules, agent definitions
- Other dotdirs: .brain.bak* if exist]

Per-area lead question: .gitignore excludes correct paths (memory.db, .tasks/, .locks/, dist/, node_modules/, coverage/)? .dockerignore matches build context? package.json engines >=20 (Sprint 153)? .github workflows reference Node 20+? Any leaked secrets in vscode launch configs?

PATTERN: same.

---

## Sprint 161 Lane 1 Success Criteria

- 160-235 tasks generated by Brain structured planner
- Each task produces ONE audit report markdown under docs/audits/sprint-161/
- `git diff --stat` shows ONLY docs/audits/sprint-161/ additions across the whole sprint
- 0 boundary violations flagged by Auditor
- 0 self-modifying detector flags (ADR-039)
- Sprint completion ≥85% DONE or GO_WITH_TECH_DEBT

## Sprint 161 Lane 1 Failure Modes

- ANY worker writes to src/, .deckent/, .brain/, root config — FAIL, NO_GO + boundary violation alert
- ANY file deleted — FAIL, P0 alert
- Audit report missing required sections — GO_WITH_TECH_DEBT, format fix Sprint 162
- Audit report has 0 findings — accepted only if rationale provided in report

## Brain Planning Mode

Use `--structured` to ensure deterministic task generation matching macro area
decomposition above. AI mode introduces variance unsuitable for read-only audit
discipline.

````

(Above content goes verbatim to DIRECTIVES.md.)

- [ ] **Step 1.3: Verify DIRECTIVES.md was written**

Run:
```bash
wc -l DIRECTIVES.md
head -5 DIRECTIVES.md
grep -c "^## Task " DIRECTIVES.md
```

Expected: ~200+ lines; first line is `# DIRECTIVES — Sprint 161: God-Level READ-ONLY Self-Audit (Lane 1)`; ≥2 explicit Task headers (rest are Task Groups for Brain to fan out).

- [ ] **Step 1.4: Plan dry-run to verify Brain interprets**

Run:
```bash
npx deckent plan --structured --dry-run --no-confirm 2>&1 | tail -30
```

Expected: Output shows "Sprint 161 (sprint-161) planned with N tasks" where N is in [10, 50] for the explicitly-defined Tasks 1-2 + Task Groups parsed as group-level tasks. Structured mode may not fan out 160-235 from group prose alone; if N is too small, use `--mode auto` or `--mode ai` instead in Phase 3 (decision below).

If N < 10: STOP and revise DIRECTIVES.md (add more explicit Task blocks). If N ≥ 10: proceed.

---

## Phase 2: Coordinator Workspace Setup

**Goal:** Create output directories, snapshot pre-state.

- [ ] **Step 2.1: Create audit output directory tree**

Run:
```bash
mkdir -p docs/audits/sprint-161/cc-monitor docs/audits/sprint-161/cc-deepdive
ls -la docs/audits/sprint-161/
```

Expected: Three directories — root, cc-monitor, cc-deepdive — present, empty.

- [ ] **Step 2.2: Snapshot pre-audit state**

Run:
```bash
cp .brain/exports/summary.md docs/audits/sprint-161/PRE-AUDIT-BRAIN-SUMMARY.md
git rev-parse HEAD > docs/audits/sprint-161/PRE-AUDIT-HEAD-SHA.txt
date -u +%Y-%m-%dT%H:%M:%SZ > docs/audits/sprint-161/AUDIT-START-TIME.txt
```

Expected: Three reference files in docs/audits/sprint-161/ for end-of-sprint comparison.

- [ ] **Step 2.3: Verify expected agent count metadata**

Write file `docs/audits/sprint-161/EXPECTED-LANES.md`:

```markdown
# Sprint 161 Lane Roster (T+0)

## Lane 1 — Deckent workers
Expected task count: 160-235 (Brain structured generation)
Output dir: docs/audits/sprint-161/T-161-NNN-*.md

## Lane 2 — CC Behavior Monitor (3 agents)
- A1: Brain Rubric Watcher → cc-monitor/A1-brain-rubric-anomalies.md
- A2: Worker Honesty Auditor → cc-monitor/A2-worker-honesty.md
- A3: Auditor Authority Watcher → cc-monitor/A3-auditor-authority.md

## Lane 3 — CC Deep-Dive (9 mandatory + 1 optional)
- D1: node_modules Auditor → cc-deepdive/D1-node-modules.md
- D2: dist/src Drift Detector → cc-deepdive/D2-dist-src-drift.md
- D3: ADR Cross-Reference → cc-deepdive/D3-adr-cross-reference.md
- D4: Library Version Mismatch (context7) → cc-deepdive/D4-library-version-mismatch.md
- D5a: Documentation Pollution & Drift → cc-deepdive/D5a-doc-pollution.md
- D5b: Public-Repo Migration Triage → cc-deepdive/D5b-migration-triage.md
- D6: Doc-as-Code Fixture References → cc-deepdive/D6-fixture-references-non-test.md
- D7: Memory V2 Deep Audit → cc-deepdive/D7-memory-v2-deep-audit.md
- D8: .deckent/ & .brain/ Structural → cc-deepdive/D8-deckent-brain-structural.md
- D9 (optional): Security Surface → cc-deepdive/D9-security-surface.md
```

---

## Phase 3: Lane 1 Sprint Spawn

**Goal:** Start the deckent sprint in background.

- [ ] **Step 3.1: Final dry-run plan check**

Run:
```bash
npx deckent plan --structured --dry-run --no-confirm 2>&1 | tail -20
```

Verify task count is reasonable (≥10). Note exact number.

- [ ] **Step 3.2: USER APPROVAL CHECKPOINT — sprint start**

Surface to user (do NOT proceed without explicit approval):
> "Lane 1 deckent sprint about to start with auto-approve flag, background, ~5h expected duration. Dry-run shows N tasks. Proceed?"

If user says no: STOP, revise DIRECTIVES.md or plan.
If user says yes: continue Step 3.3.

- [ ] **Step 3.3: Spawn Lane 1 sprint**

Run (in background bash):
```bash
npx deckent start --auto-approve
```

Use Bash tool with `run_in_background: true`. Capture the bash ID for later monitoring.

Expected: Tool returns "Command running in background with ID: <ID>". Output file path captured.

- [ ] **Step 3.4: Verify sprint actually started (T+30s wake)**

Schedule a wake at T+60s, then run:
```bash
cat /tmp/claude-1000/-home-alperen-deckent-dev/<session-id>/tasks/<bash-id>.output | tail -20
```

Expected: Output shows "Sprint 161 ... PLAN ..." or "SPAWN ..." phase. If output shows error: STOP, diagnose. If output shows progress: continue.

---

## Phase 4: Lane 2 Behavior Monitor Dispatch

**Goal:** Spawn 3 CC monitor agents in parallel, all `run_in_background: true`.

### File
None directly. Each agent writes to its assigned cc-monitor/ report.

- [ ] **Step 4.1: Dispatch A1 — Brain Rubric Watcher**

Use Agent tool with these parameters:
- `subagent_type: general-purpose`
- `run_in_background: true`
- `description: "A1 Brain Rubric Watcher"`
- `prompt`:

```
You are Lane 2 Agent A1 — Brain Rubric Watcher — for Sprint 161 god-audit.

CONTEXT: Deckent sprint-161 is running in parallel. It produces .tasks/task-*.result
files (worker self-assessments) and Brain evaluation decisions. Sprint 160 surfaced
a Brain retro counter bug ("0/2 NO_GO" while workers reported GO_WITH_TECH_DEBT).
Your job: detect any such anomaly across all sprint-161 tasks.

TASK: Until sprint-161 completes (Brain emits BRAIN→*:SPRINT_PHASE_CHANGE to RETRO
or CLEANUP), repeatedly:
1. Read all .tasks/task-161-*.result files (and -fix variants) currently on disk
2. For each: extract selfAssessment, evaluationDecision, rubricScores, notes
3. Compare:
   - Does evaluationDecision align with rubric scores?
   - Does Brain's count of DONE/GO_WITH_TECH_DEBT/NO_GO match worker self-assessments?
   - Are TIMEOUT_WITH_WORK or honesty-trigger flags handled correctly?
4. Cadence: poll every 120 seconds. Use `sleep 120` between iterations.
5. Loop terminates when:
   a) `cat .brain/RETRO.md | grep "Sprint 161" | head -1` returns matching line, OR
   b) `npx deckent status --json 2>/dev/null | jq -r '.data.sprint.phase'` returns "COMPLETE", OR
   c) 6 hours elapsed (failsafe timeout)

OUTPUT: Write findings to docs/audits/sprint-161/cc-monitor/A1-brain-rubric-anomalies.md

Format:
```markdown
# A1 — Brain Rubric Anomalies (Sprint 161 monitoring)

## Snapshot {timestamp}

| Task | Worker self-assess | Brain evaluation | Rubric sum | Anomaly? |
|------|--------------------|------------------|-----------:|----------|
| 161-001 | DONE | DONE | 380/400 | none |
| 161-002 | GO_WITH_TECH_DEBT | NO_GO | 280/400 | YES — Brain promoted to NO_GO without rubric basis |
...

## Findings (severity-tagged)

### P0: Brain misclassified ...
- Evidence: .tasks/task-161-NNN.result line {N}, evaluationDecision={X} but rubric scores show ...
- Recommendation: Sprint 162 task — fix sprint-reporter counter logic

### P1: ...
```

CONSTRAINTS:
- READ-ONLY everywhere except your one output file
- Do NOT modify .tasks/ files
- Do NOT trigger any deckent command that writes (no kill/cleanup)
- Use `npx deckent status --json` (read-only) for Brain phase detection
- Use `cat`, `jq`, `grep` for inspection only

When loop exits, write final summary section to your report and finish.
```

Expected: Agent acknowledges and starts. Background ID captured.

- [ ] **Step 4.2: Dispatch A2 — Worker Honesty Auditor**

Use Agent tool with:
- `subagent_type: general-purpose`
- `run_in_background: true`
- `description: "A2 Worker Honesty Auditor"`
- `prompt`:

```
You are Lane 2 Agent A2 — Worker Honesty Auditor — for Sprint 161 god-audit.

CONTEXT: Deckent sprint-161 workers each claim to have audited specific files and
write findings to docs/audits/sprint-161/T-161-NNN-*.md. Workers may overstate
coverage or miss findings. Your job: cross-check worker claims against actual
deliverables.

TASK: Until sprint-161 completes, repeatedly (every 180s):
1. List finalized result files: `ls .tasks/task-161-*.result 2>/dev/null`
2. For each result with selfAssessment in {DONE, GO_WITH_TECH_DEBT}:
   a) Read .tasks/task-161-NNN.result — extract claimed `filesChanged`, `notes`, scope
   b) Read corresponding docs/audits/sprint-161/T-161-NNN-*.md (the audit report)
   c) Verify:
      - Was the claimed scope actually inspected? (count file:line citations in audit report — minimum 3 per audited file)
      - Does the audit report cover all 10 dimensions from spec?
      - Are findings backed by evidence?
      - Any sections empty or placeholder ("TBD", "n/a without rationale")?
3. Run `git diff --stat HEAD -- 'docs/audits/sprint-161/' | tail -5` periodically — confirm only audit reports were modified by workers.
4. Loop termination same as A1.

OUTPUT: Write to docs/audits/sprint-161/cc-monitor/A2-worker-honesty.md

Format:
```markdown
# A2 — Worker Honesty Audit (Sprint 161 monitoring)

## Per-task honesty score

| Task | Files claimed | Citations in report | Dimensions covered | Honesty grade |
|------|---------------|---------------------|---------------------|---------------|
| 161-001 | 5 | 22 (≥3 each) | 10/10 | A — full coverage |
| 161-002 | 6 | 8 (1.3 avg) | 4/10 | C — surface skim |
...

## Findings

### P0 dishonest tasks
- 161-NNN: claimed full coverage, evidence shows N file:line citations across M files
  (≤3 per file violates discipline)

### P1 partial coverage
- ...

## Boundary integrity check
- `git diff --stat HEAD -- ':!docs/audits/sprint-161/'` should be empty
- Snapshot at T+{timestamp}: {result}
```

CONSTRAINTS: same as A1. READ-ONLY. Loop terminates same way. Final summary on exit.
```

- [ ] **Step 4.3: Dispatch A3 — Auditor Authority Watcher**

Use Agent tool with:
- `subagent_type: general-purpose`
- `run_in_background: true`
- `description: "A3 Auditor Authority Watcher"`
- `prompt`:

```
You are Lane 2 Agent A3 — Auditor Authority Watcher — for Sprint 161 god-audit.

CONTEXT: Deckent's auditor scans every 30 seconds during sprint, writes to
.dashboard, appends new patterns to .brain/PATTERNS.md, may emit alerts. Sprint 161
must have ZERO boundary violations (workers writing outside docs/audits/sprint-161/)
and ZERO self-modifying detector flags. Your job: catch any anomaly the auditor
records.

TASK: Until sprint-161 completes, repeatedly (every 240s):
1. Read .dashboard (if exists): `cat .dashboard 2>/dev/null | jq '.alerts // []'`
2. Read .brain/PATTERNS.md for new entries since pre-audit snapshot
3. List .locks/ for any stale (>5min) lock — `find .locks/ -mmin +5 -ls`
4. Check ADR-039 self-modifying detector log if surfaced
5. Run `git diff --stat HEAD` and verify ALL changes confined to docs/audits/sprint-161/
6. Note phase transitions from event stream (via `npx deckent status --json`)
7. Loop termination same as A1/A2.

OUTPUT: Write to docs/audits/sprint-161/cc-monitor/A3-auditor-authority.md

Format:
```markdown
# A3 — Auditor Authority Watch (Sprint 161 monitoring)

## Boundary integrity (CRITICAL)
- Snapshot {timestamp}: git diff --stat HEAD shows N files modified outside docs/audits/sprint-161/
- Expected: 0
- Actual: {N}
- {if N>0:} Files: {list}, P0 boundary violation

## Alert log (from .dashboard)

| Time | Severity | Source | Alert text |
|------|----------|--------|------------|
| ... | ... | auditor | ... |

## Pattern delta (.brain/PATTERNS.md)

New patterns added during sprint-161:
- ...

## Lock health

Stale locks observed: {N} occurrences across sprint duration. {Details if any}.

## Self-modifying detector

ADR-039 flags raised: {N}. {Details}.

## Findings

### P0 boundary violations
{list}

### P1 stale locks / alerts
{list}
```

CONSTRAINTS: READ-ONLY. No edits anywhere except A3 report. Loop terminates same way. Final summary on exit.
```

- [ ] **Step 4.4: Verify all 3 Lane 2 agents launched**

Run:
```bash
# Use TaskList tool to confirm 3 active background agents
```

Expected: 3 agent IDs returned, all `running` status.

---

## Phase 5: Lane 3 Deep-Dive Dispatch

**Goal:** Spawn 9 mandatory + optional D9 deep-dive CC agents in parallel.

**IMPORTANT:** Send ALL 9-10 Agent calls in a SINGLE message (multiple tool_use blocks in one assistant turn) per Agent tool guidance — they run concurrently from the start.

- [ ] **Step 5.1: Dispatch D1 — node_modules Auditor**

```
subagent_type: general-purpose
run_in_background: true
description: "D1 node_modules Auditor"
prompt:

You are Lane 3 Agent D1 — node_modules Auditor — for Sprint 161 god-audit.

CONTEXT: Deckent has commander.js as its only declared runtime dependency
(ADR-010), but node_modules contains many transitive deps. We need a god-eye
view of dependency health before beta launch.

TASK: READ-ONLY audit of dependency landscape. Do all of:
1. `npm ls --all 2>&1 | head -200` — top-level dep tree
2. `npm outdated 2>&1` — outdated deps
3. `npm audit --json 2>&1 | head -300` — security advisories
4. `cat package.json | jq '.dependencies, .devDependencies'` — declared deps
5. `cat package-lock.json | jq '.packages | keys | length'` — total resolved
6. For top 50 deps by frequency: check Read for license file, deprecated note
7. context7 lookup: are any major deps near EOL or deprecated?

OUTPUT: docs/audits/sprint-161/cc-deepdive/D1-node-modules.md

Format:
```markdown
# D1 — node_modules Auditor (Sprint 161)

## Summary
- Total resolved packages: N
- Direct deps (package.json): N
- Outdated: N (M with security implications)
- Vulnerabilities: N (P0: critical, P1: high, P2: moderate, P3: low)

## Findings

### P0
| Package | Current | Latest | CVE | Migration cost |
|---------|---------|--------|-----|----------------|

### P1
...

## License inventory (top 50)
| Package | License | OSS-friendly? |

## Deprecated patterns observed
...

## Sprint 162+ recommendations
1. ...
```

CONSTRAINTS: READ-ONLY. Use only `npm ls/outdated/audit` (read-only commands).
DO NOT run `npm install`, `npm update`, `npm fix`. DO NOT modify package.json
or package-lock.json. Single output file, exit when done.
```

- [ ] **Step 5.2: Dispatch D2 — dist/src Drift Detector**

```
subagent_type: general-purpose
run_in_background: true
description: "D2 dist/src Drift Detector"
prompt:

You are Lane 3 Agent D2 — dist/src Drift Detector — for Sprint 161 god-audit.

CONTEXT: Sprint 160 surfaced a "dist/ auto-rebuild mystery" — dist/ was newer
than src/ without manual `npm run build`. We need to find the rebuild
mechanism and verify build integrity.

TASK: READ-ONLY audit:
1. `find dist/ -name "*.js" -newer src/ 2>/dev/null | wc -l` — files newer in dist/
2. `find src/ -name "*.ts" -newer dist/ 2>/dev/null | wc -l` — staleness reverse
3. For each src/orchestra/*.ts file, find dist/orchestra/*.js counterpart, diff timestamps
4. Compare specific cleanup discipline (Sprint 160 fix) — does dist/ reflect src/?
5. `find . -name "*.{ts,sh,mjs,cjs}" 2>/dev/null | xargs grep -l "tsc\b" 2>/dev/null` — locate auto-build triggers
6. Search for Brain-side build hooks: `grep -rn "spawn.*tsc\|exec.*tsc\|execSync.*build" src/orchestra/ src/agents/`
7. `find . -name "package.json" -not -path "./node_modules/*" | xargs jq '.scripts // {}' 2>/dev/null` — script triggers
8. Verify dist/cli/entry.js is current entry point per package.json `bin` field

OUTPUT: docs/audits/sprint-161/cc-deepdive/D2-dist-src-drift.md

Format:
```markdown
# D2 — dist/src Drift Detector (Sprint 161)

## Build artifact integrity
- Latest src/ change: {timestamp}
- Latest dist/ change: {timestamp}
- Drift: {forward / backward / synchronized}

## Auto-rebuild mechanism
- Sprint 160 finding: dist/ rebuilt without manual command
- Search results:
  - Direct tsc invocations in code: {locations}
  - Script triggers: {list}
- Hypothesis: {if found, describe; else "no automated mechanism located"}

## Per-module drift table
| src/file.ts mtime | dist/file.js mtime | Delta | Suspicious? |
|-------------------|--------------------|-------|-------------|

## Findings (severity-tagged with file:line evidence)
P0 / P1 / P2 / P3 ...

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. NO build invocations. NO writes to dist/ or src/.
Single output file, exit when done.
```

- [ ] **Step 5.3: Dispatch D3 — ADR Cross-Reference**

```
subagent_type: general-purpose
run_in_background: true
description: "D3 ADR Cross-Reference"
prompt:

You are Lane 3 Agent D3 — ADR Cross-Reference — for Sprint 161 god-audit.

CONTEXT: Deckent has 44 active ADRs (per .brain/exports/summary.md). Sprint 154
audit method surfaced 4 dead exports (advanced features written but never wired).
We must verify all ADRs have runtime call sites and there are no contradictions.

TASK: READ-ONLY audit:
1. Read .brain/exports/summary.md — full ADR list with status
2. Use MCP `deckent_memory_query` with type=['adr'] to get full ADR records
3. For each accepted/active ADR:
   a) Identify the implementation marker (file path or pattern in ADR text)
   b) `grep -rn "${pattern}" src/` — count call sites
   c) If 0 call sites in src/ (excluding tests/), flag as "potentially dormant"
   d) If status=deprecated/superseded, verify code reflects (no remnant call sites)
4. Cross-reference: any ADR contradictions? (e.g. ADR-X says "always sync"
   while ADR-Y says "never sync")
5. ADR governance check: ADR-036 enforcement — workers receive ADR list in prompt?

OUTPUT: docs/audits/sprint-161/cc-deepdive/D3-adr-cross-reference.md

Format:
```markdown
# D3 — ADR Cross-Reference (Sprint 161)

## Summary
- Total ADRs: 44 active + 2 (ADR-005 deprecated, ADR-022 superseded)
- With clear runtime call sites: N
- Potentially dormant: N
- Contradictions detected: N

## Per-ADR audit table

| ADR | Title | Status | Call sites in src/ | Verdict |
|-----|-------|--------|-------------------:|---------|
| 001 | TypeScript + ESM | accepted | hundreds | ✅ |
| 002 | Node16 Module Resolution | accepted | tsconfig + .js extensions | ✅ |
...
| 039 | Self-modifying detection | accepted | 1 (task-builder.ts) | ⚠️ verify wire still alive |

## Findings

### P0 dormant ADRs (Sprint 154 pattern)
- ADR-NNN: claimed accepted but 0 call sites in src/
  - Evidence: grep result, expected pattern
  - Recommendation: Sprint 162+ wire OR demote to deprecated

### P1 contradictions
- ADR-X vs ADR-Y: ...

### P2 governance gaps
- ADR-036 worker prompt injection coverage incomplete: ...

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. Use grep, Read, MCP queries only. Single output file.
```

- [ ] **Step 5.4: Dispatch D4 — Library Version Mismatch (context7)**

```
subagent_type: general-purpose
run_in_background: true
description: "D4 Library Version Mismatch (context7)"
prompt:

You are Lane 3 Agent D4 — Library Version Mismatch — for Sprint 161 god-audit.

CONTEXT: Deckent uses many third-party libraries. Their upstream APIs evolve;
we may be using deprecated patterns or missing new capabilities. context7 MCP
fetches current library docs.

TASK: READ-ONLY cross-reference deckent's usage of these libraries against
upstream docs:
1. **vitest** — test runner config, mock patterns, browser-mode features
2. **@anthropic-ai/sdk** — model IDs, tool use, prompt caching, agent SDK
3. **better-sqlite3** — N-API stability, prepared statements, FTS5 patterns
4. **commander** — sub-command pattern, option types
5. **zod** — schema syntax, `.parse` vs `.safeParse`, refinements
6. **react** + **vite** — dashboard relevance
7. **typescript** — strict mode features, ESM module resolution
8. **@google/generative-ai** — Gemini SDK current API
9. **@modelcontextprotocol/sdk** — MCP SDK changes since adoption

For each: use `mcp__plugin_context7_context7__resolve-library-id` then
`mcp__plugin_context7_context7__query-docs` to get current docs. Compare with
deckent usage (via grep + Read).

Find:
- Deprecated patterns we still use
- New APIs that would simplify our code
- Breaking changes upcoming in next major version

OUTPUT: docs/audits/sprint-161/cc-deepdive/D4-library-version-mismatch.md

Format:
```markdown
# D4 — Library Version Mismatch (context7) (Sprint 161)

## Per-library audit

### vitest
- Declared version: {package.json}
- Latest stable: {context7}
- Our usage patterns: {locations + counts}
- Deprecated patterns observed: {list with file:line}
- New API recommendations: ...

### @anthropic-ai/sdk
...

### better-sqlite3
...

(repeat for all 9 libraries)

## Findings

### P0 critical mismatches
- Library X: using pattern that's removed in Y.next
- Recommendation: Sprint 162+ migration

### P1 deprecation warnings
...

### P2 modernization opportunities
...

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. context7 + grep + Read only. NO npm install/upgrade.
Single output file.
```

- [ ] **Step 5.5: Dispatch D5a — Documentation Pollution & Drift**

```
subagent_type: general-purpose
run_in_background: true
description: "D5a Doc Pollution & Drift"
prompt:

You are Lane 3 Agent D5a — Documentation Pollution & Drift — for Sprint 161 god-audit.

CONTEXT: User reports "documentation pollution" — too many .md files, drift,
duplicates, orphans. ROADMAP-GOD-LEVEL.md mentions ~388 .md files (Sprint 149
reference). We need a comprehensive doc inventory + pollution catalog.

TASK: READ-ONLY exhaustive .md audit:
1. `find . -name "*.md" -not -path "./node_modules/*" -not -path "./.brain/archive/*" -not -path "./tests/*" | wc -l` — total count
2. For each .md file, capture:
   - Path
   - Last commit time (`git log -1 --format=%cs -- {file}`)
   - Size (lines)
   - Inbound links (grep for filename in other .md files)
3. Cross-reference claimed counts vs reality:
   - CLAUDE.md says 49 CLI commands; grep src/cli/commands/*.ts for register*
   - DECKENT.md says 31 MCP tools; verify
   - 15 built-in agents claim
   - 21 skills claim
   - 44 ADRs claim
4. Find duplicates and near-duplicates (similar headings, redundant content)
5. Find orphaned docs (zero inbound links from CLAUDE.md / DECKENT.md / README.md / ROADMAP-GOD-LEVEL.md tree)
6. Identify outdated audit accumulation in `docs/audits/sprint-NNN/`

OUTPUT: docs/audits/sprint-161/cc-deepdive/D5a-doc-pollution.md

Format:
```markdown
# D5a — Documentation Pollution & Drift (Sprint 161)

## Doc inventory
- Total .md files (excl. node_modules, .brain/archive, tests): N
- Project root: N
- docs/: N
- docs/audits/: N (across N sprint directories)
- docs/superpowers/: N

## Claim accuracy table
| Claim | Source doc | Actual | Match? |
|-------|------------|-------:|--------|
| 49 CLI commands | CLAUDE.md | {count} | ✅/❌ |
| 31 MCP tools | DECKENT.md | {count} | ✅/❌ |
| 15 built-in agents | DECKENT.md | {count} | ✅/❌ |
| 21 skills | DECKENT.md | {count} | ✅/❌ |
| 44 ADRs | summary.md | {count} | ✅/❌ |

## Pollution findings

### P0 contradictions
- File X says A; file Y says NOT A
  - Evidence: ...

### P1 duplicates / near-duplicates
- File X and file Y share N% content
- Recommendation: merge or delete one

### P2 orphans
| File | Last update | Rationale |
|------|------------|-----------|

### P3 outdated audit accumulation
- docs/audits/sprint-NNN/ — N files, last touched M months ago
  - Recommendation: prune or archive externally

## Sprint 162+ recommendations
1. Remove orphans: list
2. Merge duplicates: pairs
3. Archive sprint-NNN audits: cutoff sprint
```

CONSTRAINTS: READ-ONLY. find, grep, git log, Read only. Single output file.
```

- [ ] **Step 5.6: Dispatch D5b — Public-Repo Migration Triage**

```
subagent_type: general-purpose
run_in_background: true
description: "D5b Public-Repo Migration Triage"
prompt:

You are Lane 3 Agent D5b — Public-Repo Migration Triage — for Sprint 161 god-audit.

CONTEXT: This repo (/home/alperen/deckent-dev) is the SECRET dev repo. After
audit + cleanup, only NECESSARY files migrate to the public repo
(VerhexIO/deckent). We need a per-file classification matrix.

TASK: READ-ONLY classification of every file in repo (excluding):
- node_modules/ (npm install)
- dist/ (build artifact)
- tests/ (out of scope this sprint)
- .tasks/ (sprint runtime artifacts)
- .locks/ (sprint runtime artifacts)
- coverage/ (test artifact)
- .brain/archive/ (historical)

For each file: classify into one of:
- **KEEP-PRIVATE** — stays in dev repo only (e.g. internal sprint logs, dev notes, secret hooks)
- **MIGRATE-PUBLIC** — should go to public repo (e.g. all source under src/, public docs, README, CHANGELOG, LICENSE)
- **DELETE-CANDIDATE** — recommend removal (orphans, duplicates, deprecated)
- **UNCERTAIN** — need human review

Methodology:
1. `find . -type f -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./tests/*" -not -path "./.tasks/*" -not -path "./.locks/*" -not -path "./coverage/*" -not -path "./.brain/archive/*" -not -path "./.git/*" | wc -l` — total file count
2. Classify by directory pattern + per-file inspection where ambiguous
3. Cross-validate with Lane 1 worker triage flags (read sampling of T-161-NNN-*.md if available; otherwise rely on file content)

OUTPUT: docs/audits/sprint-161/cc-deepdive/D5b-migration-triage.md

Format:
```markdown
# D5b — Public-Repo Migration Triage (Sprint 161)

## Summary
- Total files audited: N
- KEEP-PRIVATE: N
- MIGRATE-PUBLIC: N
- DELETE-CANDIDATE: N
- UNCERTAIN: N

## Classification matrix (full)

| Path | Class | Rationale |
|------|-------|-----------|
| README.md | MIGRATE-PUBLIC | Public-facing entry doc |
| .brain/ERRORS.md | KEEP-PRIVATE | Internal dev sprint artifact |
| docs/audits/sprint-NNN/ | UNCERTAIN | Old audit, evaluate per-doc |
| ... | ... | ... |

## Aggregated by directory

| Directory | Total | KEEP | MIGRATE | DELETE | UNCERTAIN |
|-----------|------:|-----:|--------:|-------:|----------:|
| src/      | N | 0 | N | 0 | 0 |
| docs/     | N | A | B | C | D |
| .deckent/ | N | A | B | C | D |
| .brain/   | N | A | B | C | D |
| Root      | N | A | B | C | D |

## Findings

### P0 mis-classified by Lane 1
{cross-validation with worker triage flags}

### P1 UNCERTAIN flags requiring human decision
- {list}

## Sprint 162 cleanup recommendation
- Migrate: {top-level summary}
- Delete: {what + why}
- Hold: {what + reason}
```

CONSTRAINTS: READ-ONLY. find, Read only. Single output file.
```

- [ ] **Step 5.7: Dispatch D6 — Doc-as-Code Fixture References (non-test)**

```
subagent_type: general-purpose
run_in_background: true
description: "D6 Fixture References (non-test)"
prompt:

You are Lane 3 Agent D6 — Doc-as-Code Fixture References (non-test) — for Sprint 161
god-audit.

CONTEXT: Sprint 160 found generator-side asymmetry: spawn-backend-docker.ts
emits `.prompt-${taskId}` while sweep filter expects `.prompt-task-${taskId}`.
The actual `tests/` directory is excluded this sprint. Your scope: NON-TEST
references to test patterns from src/, docs/, scripts/, .deckent/, .brain/.

TASK: READ-ONLY audit:
1. `grep -rn "\.prompt-\|\.worker-\|task-[0-9]" src/ docs/ scripts/ .deckent/ .brain/ --include='*.ts' --include='*.md' --include='*.json' --include='*.sh'` — full reference list
2. Identify generator-side patterns (emitters)
3. Identify sweep/filter-side patterns (consumers)
4. Catalog asymmetries beyond what Sprint 160 already documented
5. Find any docs/scripts that reference old (`.prompt-NNN`) naming convention
6. Verify Sprint 160 T-001 fix references in docs are accurate

OUTPUT: docs/audits/sprint-161/cc-deepdive/D6-fixture-references-non-test.md

Format:
```markdown
# D6 — Fixture References (non-test) (Sprint 161)

## Generator vs consumer table

| Module | Side | Pattern | File:line |
|--------|------|---------|-----------|
| spawn-backend-docker.ts:167 | generator | `.prompt-${taskId}-` | ... |
| sprint-lifecycle.ts:269 | consumer | `.prompt-task-` | ... |
| ... | | | |

## Asymmetries beyond Sprint 160

### P0
- {list}

### P1
- {list}

## Doc references

| Doc | Reference text | Accurate? |
|-----|----------------|-----------|

## Sprint 162 generator migration recommendation
- Plan: {generator-side or filter-side, both options with tradeoffs}
```

CONSTRAINTS: READ-ONLY. grep, Read only. Single output file.
```

- [ ] **Step 5.8: Dispatch D7 — Memory V2 Deep Audit**

```
subagent_type: general-purpose
run_in_background: true
description: "D7 Memory V2 Deep Audit"
prompt:

You are Lane 3 Agent D7 — Memory V2 Deep Audit — for Sprint 161 god-audit.

CONTEXT: Memory V2 (DB-first) was introduced Sprint 145+. We need to verify
schema integrity, FTS5 health, exports/DB sync, decay correctness.

TASK: READ-ONLY DB inspection (use `sqlite3 -readonly`):
1. `sqlite3 -readonly .brain/memory.db ".schema"` — full schema
2. `sqlite3 -readonly .brain/memory.db "SELECT * FROM schema_version;"`
3. `sqlite3 -readonly .brain/memory.db "SELECT type, count(*) FROM entries GROUP BY type;"` — type distribution
4. `sqlite3 -readonly .brain/memory.db "SELECT name FROM sqlite_master WHERE type='table';"` — table inventory
5. Test FTS5 dual-layer: `sqlite3 -readonly .brain/memory.db "SELECT count(*) FROM entries_fts WHERE entries_fts MATCH 'sprint';"`
6. Cross-check exports: read `.brain/exports/summary.md`, `.brain/exports/decisions.md`, `.brain/exports/memory.md`, `.brain/exports/debt.md` and compare ADR/sprint/debt counts to DB query results
7. Decay state: `sqlite3 -readonly .brain/memory.db "SELECT type, decay_after_sprints FROM entries WHERE decay_exempt=1 LIMIT 20;"`
8. Orphan tags/relations check
9. Recent migrations applied?

OUTPUT: docs/audits/sprint-161/cc-deepdive/D7-memory-v2-deep-audit.md

Format:
```markdown
# D7 — Memory V2 Deep Audit (Sprint 161)

## Schema state
- schema_version: {N}
- Tables: entries, tags, relations, entry_history, schema_version, entries_fts
- Migration applied: {Y/N + version}

## Type distribution

| Type | Count |
|------|------:|
| adr | N |
| memory | N |
| sprint | N |
| ...

## FTS5 health
- Dual-layer columns present (4 original + 4 turkishNormalize): Y/N
- Index integrity: Y/N (PRAGMA integrity_check)
- Sample query 'sprint': N hits

## Export-DB sync

| Export file | Claim | DB count | Match? |
|-------------|------:|---------:|--------|
| summary.md (44 ADRs) | 44 | {N} | ✅/❌ |
| decisions.md | N | N | ✅/❌ |

## Findings

### P0 schema drift
{list}

### P1 export/DB mismatch
{list}

### P2 decay anomalies
{list}

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. `-readonly` flag MANDATORY. NO modifications.
Single output file.
```

- [ ] **Step 5.9: Dispatch D8 — .deckent/ & .brain/ Structural Audit**

```
subagent_type: general-purpose
run_in_background: true
description: "D8 .deckent/.brain/ Structural"
prompt:

You are Lane 3 Agent D8 — .deckent/ & .brain/ Structural Audit — for Sprint 161
god-audit.

CONTEXT: .deckent/ holds project-level config + agent/skill manifests + decision
log + features manifest + provider cache + CI baseline. .brain/ holds memory
(file side: ERRORS, MEMORY, PATTERNS, RETRO, PROJECT-IDENTITY, sprint logs +
exports). All these are dev artifacts; their integrity matters for runtime
behavior.

TASK: READ-ONLY audit:
1. `.deckent/agents/*/agent.json` (15+3) — schema valid? Required fields?
   `find .deckent/agents -name agent.json | xargs -I{} jq -e '.id and .description and .model and .skills' {}`
2. `.deckent/skills/*/manifest.json` (21) — schema valid?
3. `.deckent/decisions/` — count, accumulation pattern
4. `.deckent/archive/sprints/` — retention vs config (default 5 sprints?)
5. `.deckent/features-manifest.json` — list 16 active features per claim, verify
6. `.deckent/project-stack.json` — accuracy
7. `.deckent/provider-cache.json` — staleness check
8. `.deckent/ci-baseline.json` — current baseline
9. `.deckent/config.json` — schema validation, required keys
10. `.brain/PROJECT-IDENTITY.md` — claims vs current state
11. `.brain/sprints/sprint-NNN.md` — budget per CLAUDE.md gotcha (100 lines/file)
12. `.brain/MEMORY.md`, `.brain/RETRO.md`, `.brain/PATTERNS.md`, `.brain/ERRORS.md` — budget enforcement

OUTPUT: docs/audits/sprint-161/cc-deepdive/D8-deckent-brain-structural.md

Format:
```markdown
# D8 — .deckent/ & .brain/ Structural Audit (Sprint 161)

## .deckent/ inventory

### Agents (.deckent/agents/*/agent.json)
| Agent | Schema valid | Last modified | Notes |

### Skills (.deckent/skills/*/manifest.json)
| Skill | Schema valid | Last modified | Notes |

### Other .deckent/ files
| File | Status | Notes |

## .brain/ inventory

### Sprint logs
| File | Lines | Budget (100) | OK? |

### Memory files
| File | Lines | Budget | OK? |

## Findings

### P0 schema violations
{list}

### P1 budget violations
{list}

### P2 staleness
{list}

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. find, jq, Read only. NO modifications. Single output file.
```

- [ ] **Step 5.10: Dispatch D9 — Security Surface (OPTIONAL)**

Decision: include D9 IF Lane 3 capacity allows. We'll dispatch by default; if any
mandatory agent fails to spawn, drop D9.

```
subagent_type: general-purpose
run_in_background: true
description: "D9 Security Surface (optional)"
prompt:

You are Lane 3 Agent D9 — Security Surface — for Sprint 161 god-audit.

CONTEXT: Pre-beta security baseline. OWASP top 10 lens, secret leakage, sandbox
bypass. NOT a pen-test — read-only audit of surface.

TASK: READ-ONLY audit:
1. Secret scan: `grep -rEn '(api[_-]?key|secret|password|token|bearer)\s*[:=]\s*["\047][a-zA-Z0-9_-]{20,}' . --include='*.ts' --include='*.json' --include='*.md' --include='*.yml' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git`
2. .env / .deck files: `find . -name '.env*' -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null` — should be gitignored
3. Dockerfile USER non-root: `grep -n 'USER ' Dockerfile`
4. AST sandbox bypass surface: review src/core/marketplace/skill-sandbox.ts
5. .deck file interpolation: grep for direct env access bypassing .deck contract
6. SQL injection possibility: grep for string concatenation in `.brain/memory.db` queries
7. `.gitignore` excludes secrets: confirm

OUTPUT: docs/audits/sprint-161/cc-deepdive/D9-security-surface.md

Format:
```markdown
# D9 — Security Surface (Sprint 161, optional)

## Secret scan results
- Hits: N (expect 0 in tracked files)
- {if any: file:line + truncated context}

## .env / .deck inventory
- .env files found: N
- All gitignored: Y/N

## Dockerfile USER directive
- Status: {present non-root / present root / absent}

## AST sandbox observations
- Forbidden patterns blocked: {Y/N per pattern}

## SQL injection surface
- String concat queries: {N}

## Findings (severity-tagged)

## Sprint 162+ recommendations
...
```

CONSTRAINTS: READ-ONLY. NO writes anywhere except D9 report.
```

- [ ] **Step 5.11: Verify all Lane 3 agents launched**

Use TaskList tool. Expected: 9 (or 10 with D9) agent IDs, all `running`.

---

## Phase 6: Mid-Sprint Coordination Loop

**Goal:** Periodically check Lane 1 sprint health and Lane 2/3 agent progress without micromanaging.

### Pattern

Every ~10 min, wake (via ScheduleWakeup or natural pause), do this checklist:

- [ ] **Step 6.1: Lane 1 status snapshot**

Use MCP `deckent_status` tool. Capture:
- Sprint phase (PLAN / SPAWN / EXECUTE / EVALUATE / FIX / RETRO / CLEANUP / COMPLETE)
- Active worker count
- Done / total task count
- Alerts (if any)

If phase = PAUSED or status indicates failure: STOP, surface to user, ask for direction.
If phase = COMPLETE: proceed to Phase 7.

- [ ] **Step 6.2: Lane 2/3 progress check**

Use TaskList tool. Confirm:
- 3 Lane 2 agents still running (or finished — at least 1 should still run while Lane 1 runs)
- 9-10 Lane 3 agents either running or completed (some specialties finish faster than others)

If any agent failed unexpectedly: spawn replacement (max 1 retry per agent).

- [ ] **Step 6.3: Boundary integrity check**

Run:
```bash
git diff --stat HEAD -- ':!docs/audits/sprint-161/' 2>&1 | head -10
```

Expected: Empty output (no files outside docs/audits/sprint-161/ modified).

If output has files: STOP — boundary violation detected. Surface to user immediately.

- [ ] **Step 6.4: Schedule next wake**

Schedule wake at +600s (10 min). Loop back to 6.1.

Exit conditions:
- Lane 1 phase = COMPLETE → Phase 7
- 6h elapsed without completion → ask user

---

## Phase 7: End Barrier

**Goal:** Confirm all three lanes finished cleanly before consolidation.

- [ ] **Step 7.1: Confirm Lane 1 sprint complete**

Run:
```bash
npx deckent status --json 2>&1 | jq -r '.data.sprint.phase'
```

Expected: "COMPLETE" or sprint shows in retro listing.

- [ ] **Step 7.2: Final boundary integrity verification**

Run:
```bash
git diff --stat HEAD -- ':!docs/audits/sprint-161/' 2>&1
git diff --stat HEAD -- 'docs/audits/sprint-161/' 2>&1 | tail -3
```

Expected: First command empty (no source modifications). Second shows N audit reports added.

If first has output: P0 boundary violation, surface to user, document in EXECUTIVE-SUMMARY.

- [ ] **Step 7.3: Confirm Lane 2 agent reports written**

Run:
```bash
ls -la docs/audits/sprint-161/cc-monitor/
wc -l docs/audits/sprint-161/cc-monitor/*.md
```

Expected: 3 files (A1, A2, A3), each non-trivial size (≥30 lines).

If a file missing: that agent failed; note in consolidation.

- [ ] **Step 7.4: Confirm Lane 3 agent reports written**

Run:
```bash
ls -la docs/audits/sprint-161/cc-deepdive/
wc -l docs/audits/sprint-161/cc-deepdive/*.md
```

Expected: 9 (mandatory) or 10 (with D9) files, each ≥30 lines.

If <8 files: P1 finding, document missing specialty in consolidation.

- [ ] **Step 7.5: Stop any still-running Lane 2 agents**

Lane 2 agents have a built-in termination loop (Phase 4 prompts). If still running per TaskList: send "Sprint complete, finalize report" via SendMessage to each.

---

## Phase 8: Consolidator

**Goal:** Read all reports, produce 5 deliverables.

Approach: dispatch ONE consolidator agent (general-purpose, not background — wait for it). Pass it the master prompt below.

- [ ] **Step 8.1: Dispatch Consolidator agent**

Use Agent tool (NOT background — synchronous):
- `subagent_type: general-purpose`
- `run_in_background: false`
- `description: "Sprint 161 Consolidator"`
- `prompt`:

```
You are the Sprint 161 god-audit Consolidator. Lane 1 (deckent workers,
160-235 audit reports), Lane 2 (3 CC monitor reports), Lane 3 (9-10 CC
deep-dive reports) all completed. Your job: produce 5 unified deliverables.

INPUTS:
- Lane 1: docs/audits/sprint-161/T-161-NNN-*.md (read all, ~160-235 files)
- Lane 2: docs/audits/sprint-161/cc-monitor/{A1,A2,A3}-*.md
- Lane 3: docs/audits/sprint-161/cc-deepdive/{D1..D9}-*.md
- Pre-state: docs/audits/sprint-161/PRE-AUDIT-BRAIN-SUMMARY.md
- Spec: docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md

DELIVERABLES (write each to specified path):

### 1. docs/audits/sprint-161/EXECUTIVE-SUMMARY.md

Top-down narrative + master findings table:
- Sprint 161 audit overview (duration, scope, output volume)
- Findings count by severity (P0/P1/P2/P3)
- Findings count by dimension (dead/conflict/drift/doc-pollution/memory-V2/config-integrity/ADR-violation)
- Boundary integrity report (was the read-only mandate respected?)
- Lane 2 anomalies summary (Brain rubric, worker honesty, auditor authority)
- Lane 3 deep-dive summary per specialty
- Top 20 P0 findings table (file:line evidence, recommendation)

### 2. docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md

Aggregate all per-file triage flags into one matrix:
- Sources: Lane 1 worker triage flags + Lane 3 D5b
- Cross-validate: when worker said KEEP but D5b said MIGRATE, mark UNCERTAIN
- Output a sortable table: file path | class | rationale | source(s)

### 3. docs/audits/sprint-161/PUBLIC-REPO-MIGRATION-PLAN.md

From the matrix, produce migration manifest:
- "Migrate to VerhexIO/deckent (public repo)" — ordered file list by category
- "Keep in dev repo only" — explicit list with reasons
- "Delete candidates (Sprint 162+)" — list with rationale
- Required structural changes (e.g. "remove .brain/ from public, replace with .brain.example/ or boot doc")
- Order of operations (what migrates first, dependencies)

### 4. docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md

P0 + P1 findings → Sprint 162 task descriptions:
- One section per finding, formatted as a DIRECTIVES.md task block (Model: opus,
  Effort: low/normal, Skills: typescript-expert/etc, Files: ..., Scope: ...)
- Group into themes: cleanup, migration prep, ADR re-wire, doc consolidation
- Estimated total task count for Sprint 162

### 5. docs/audits/sprint-161/ROADMAP-PATCH.md

A markdown patch ready to apply to docs/ROADMAP-GOD-LEVEL.md (DO NOT actually
modify ROADMAP-GOD-LEVEL.md — output the patch text only):
- New section "## ⚡ 2026-05-XX Session Kapanış — Sprint 161 God-Audit Day"
- Match Sprint 152/154 audit section format style
- Findings count, key discoveries, hot fix candidates list, link to deliverables

CONSTRAINTS:
- READ-ONLY for everything except your 5 deliverables and possibly an
  intermediate working note (docs/audits/sprint-161/CONSOLIDATOR-NOTES.md, optional)
- DO NOT modify docs/ROADMAP-GOD-LEVEL.md (produce patch text in ROADMAP-PATCH.md)
- DO NOT modify any T-161-*.md, cc-monitor/, cc-deepdive/ inputs
- DO NOT auto-commit — leave files in working tree

When done, write a 1-paragraph "Consolidator complete" summary to your final response.
```

Wait for completion (synchronous). Capture summary.

- [ ] **Step 8.2: Verify 5 deliverables exist and are non-trivial**

Run:
```bash
for f in EXECUTIVE-SUMMARY MIGRATION-TRIAGE-MATRIX PUBLIC-REPO-MIGRATION-PLAN SPRINT-162-DIRECTIVES-DRAFT ROADMAP-PATCH; do
  echo "--- $f.md ---"
  wc -l "docs/audits/sprint-161/$f.md" 2>&1
done
```

Expected: 5 files, each ≥50 lines.

If any missing or too small: re-dispatch Consolidator with corrective prompt.

---

## Phase 9: User Review Gate

**Goal:** Stop. Surface findings to user. Wait for approval before commit.

- [ ] **Step 9.1: Surface results to user**

Send message to user:
```
Sprint 161 god-audit complete.

Wall-clock duration: {T+0 to T+now} hours
Total findings: {N} (P0: A, P1: B, P2: C, P3: D)
Boundary integrity: {PASS / VIOLATION DETECTED}
Lane completion: Lane 1 {N/M tasks}, Lane 2 {3/3 reports}, Lane 3 {N/9 reports}

Deliverables ready for review (none committed yet):
- docs/audits/sprint-161/EXECUTIVE-SUMMARY.md
- docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md
- docs/audits/sprint-161/PUBLIC-REPO-MIGRATION-PLAN.md
- docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md
- docs/audits/sprint-161/ROADMAP-PATCH.md

Plus per-task / per-agent reports (~170-245 files) in subdirectories.

Please review. When ready, you can:
1. Apply ROADMAP-PATCH.md manually to docs/ROADMAP-GOD-LEVEL.md
2. Approve commit of the entire docs/audits/sprint-161/ tree
3. Use SPRINT-162-DIRECTIVES-DRAFT.md as base for next sprint's DIRECTIVES.md
```

- [ ] **Step 9.2: Wait for user response**

Possibilities:
- "OK commit" → run `git add docs/audits/sprint-161/` then `git commit -m "..."` per Sprint 161 commit message template
- "Some changes needed in deliverable X" → re-dispatch Consolidator with corrections
- "Skip commit for now" → leave in working tree, end session

This is the natural plan terminus. The plan does NOT auto-commit.

---

## Self-Review Checklist (run by writer before handoff)

**Spec coverage** — every section of the spec has a phase:
- §1 Vision & READ-ONLY mandate → Phase 1 DIRECTIVES + Phase 6 boundary check
- §2 Architecture (3 lanes + Consolidator) → Phases 3, 4, 5, 8
- §3 Lane 1 (10 macro areas) → Phase 1 DIRECTIVES.md content covers all 10
- §4 Lane 2 (3 monitor agents) → Phase 4 with full prompts
- §5 Lane 3 (9-10 deep-dive agents) → Phase 5 with full prompts
- §6 Consolidator → Phase 8 with full prompt
- §7 Coordination → Phase 6 wake loop
- §8 Success criteria → Phase 7 end barrier verifies
- §9 Constraints (READ-ONLY) → DIRECTIVES Absolute Rules + agent prompts + boundary check
- §10 Decisions → captured in DIRECTIVES & agent prompts
- §11 DIRECTIVES draft → expanded fully in Phase 1 Step 1.2

**Placeholder scan** — no "TBD", "TODO", "fill in details" found in plan. Each agent prompt is complete copy-paste ready.

**Type/path consistency** —
- All output paths under `docs/audits/sprint-161/`
- Agent IDs A1-A3, D1-D9 match spec
- Lane 1 task IDs `T-161-NNN`
- Tools/commands consistent across phases

**Scope check** — single coordinated effort, not multiple independent subprojects. Plan represents one runnable orchestration script for one user.

Self-review issues found and fixed inline:
- Step 4.4 used "<bash-id>" placeholder; replaced with actual handling note (TaskList tool pattern)
- Step 9.1 made placeholders for `{N}` etc. clearly indicate runtime substitution at execution time

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-sprint-161-god-audit-execution.md`.

**Two execution options:**

1. **Inline Execution (recommended for this orchestration plan)** — I execute Phases 0-9 in this session using `superpowers:executing-plans`. Suitable here because: (a) checkpoints already built into Phase 6 wake loop and Phase 9 user gate; (b) the plan is fundamentally orchestration with built-in user approvals (Step 3.2 sprint start, Step 9.1 commit gate); (c) running fresh subagents per phase loses the live sprint state context.

2. **Subagent-Driven** — fresh subagent per phase, two-stage review between. Less suitable here because subagents can't easily resume the live deckent sprint background process; coordinator state must persist.

**Recommendation: option 1 (inline execution).** Subagent-driven works for code-writing plans where each task is independent; this plan has cross-phase dependencies (Lane 1 sprint must remain running while Lane 2/3 monitor it).

Awaiting user choice before invoking the next sub-skill.
