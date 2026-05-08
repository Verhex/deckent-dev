# Sprint 161 God-Level Self-Audit — Three-Lane Parallel Design

**Created:** 2026-05-08
**Author:** Coordinator (CC main agent), brainstormed with Alperen
**Status:** APPROVED — ready for implementation plan
**Goal:** Pre-beta comprehensive audit producing ROADMAP-GOD-LEVEL.md update + Sprint 162 backlog
**Reference:** `docs/ROADMAP-GOD-LEVEL.md` (born from a similar comprehensive analysis after Sprint 148)
**Sibling sprints:** Sprint 152 audit (27 reports), Sprint 154 audit (10-agent parallel, 87 findings)

---

## 1. Vision & Scope

Comprehensive god-eye **READ-ONLY self-audit** of deckent project before beta launch. **Absolute rule for the entire sprint and all three lanes: NO source code is written, NO files are deleted, NO refactor is performed.** This is an analysis-only sprint. Every output is a markdown finding report; every recommendation is deferred to a future sprint (162+) for implementation.

Three independent lanes run in parallel to maximize coverage by tool-advantage:

- **Lane 1** — Deckent workers read source + docs + config (their strength: scope discipline, ADR enforcement, rubric grading)
- **Lane 2** — Claude Code agents observe deckent's *runtime behavior* during the sprint (their strength: cross-system reasoning, post-hoc honesty checks)
- **Lane 3** — Claude Code agents do deep-dive into areas deckent workers cannot easily reach (their strength: context7 library docs, web access, full-file Read across very large surfaces)

The lanes feed into a Consolidator step that produces unified findings, a Sprint 162 directives draft, a ROADMAP-GOD-LEVEL.md patch, and a **public-repo migration triage list** (what stays in this private dev repo vs. what gets moved to the public `VerhexIO/deckent` repo).

### Why this audit now

This repo (`/home/alperen/deckent-dev`) is the **secret dev repo**. After this audit:
1. Findings → Sprint 162+ cleanup work (still in this repo)
2. After cleanup → migrate only the cleaned, validated set into the public repo
3. Then npm publish v1.0.0-beta.1

The audit is the *prerequisite* for both repo migration and beta launch.

### Out of scope (NOT audited this sprint)

- **`tests/` directory** — explicitly excluded per user; covers a separate concern (test quality) that needs its own focused pass
- Open repo migration mechanics (Sprint 162+ work)
- npm publish v1.0.0-beta.1 (post-cleanup)
- Hub Growth (Sprint 161 in ROADMAP — re-prioritized to Sprint 162+)
- Any source code writes, file deletions, refactors, or feature additions

### What "god-eye" means here

Per ROADMAP-GOD-LEVEL.md Sprint 154 audit precedent: every file every line, dead/conflict/drift detection, ADR cross-reference, runtime call site validation, **plus documentation pollution**, **plus `.deckent/` / `.brain/` / Memory V2 internal coherence**, **plus hidden config files** (`.gitignore`, `.dockerignore`, `.npmrc`, `.editorconfig`, `.github/`, `.vscode/`, etc.). Workers must not be overloaded — even if it takes 1000 tasks and 10h, correctness over speed.

---

## 2. Architecture

```
                    ┌──────────────────────────────┐
                    │  Coordinator (CC main agent) │
                    │  - Spawn lanes               │
                    │  - Sync barriers             │
                    │  - Consolidate outputs       │
                    └─────────────┬────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │   LANE 1     │  │   LANE 2     │  │   LANE 3     │
        │ Deckent      │  │ CC Behavior  │  │ CC Deep-Dive │
        │ Audit Sprint │  │ Monitor      │  │ Audit        │
        │ ~150-250 tk  │  │ 3 agents     │  │ 5-7 agents   │
        └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
               ▼                 ▼                 ▼
        deckent-audit-     cc-behavior-      cc-deepdive-
        findings.md        report.md         findings/D{N}.md
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Consolidator Agent  │
                    │ → 3 deliverables    │
                    └─────────────────────┘
```

### Lifecycle

| Time | Event |
|------|-------|
| T+0 | Coordinator pre-flight, spawn 3 lanes in parallel |
| T+0 → T+5h | Lane 1 deckent sprint runs (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→CLEANUP) |
| T+0 → T+5h | Lane 2 CC monitor agents tail event stream + result files |
| T+0 → T+3h | Lane 3 CC deep-dive agents do specialized audits independently |
| T+5h | End barrier: Lane 1 COMPLETE, Lane 2 receives stop signal |
| T+5h → T+6h | Consolidator merges 3 outputs into unified deliverables |

Total wall-clock: ~6h. Sequential equivalent (deckent only): ~10h.

---

## 3. Lane 1 — Deckent Audit Sprint

### **READ-ONLY ENFORCEMENT (non-negotiable)**

Every Lane 1 worker task MUST satisfy:
- `scope.filesWrite = ["docs/audits/sprint-161/T-161-NNN-{area}-{focus}.md"]` — exactly one file, the audit report
- `scope.directories = [...read paths only...]` — areas being audited
- Worker prompt header: `THIS IS A READ-ONLY AUDIT TASK. DO NOT MODIFY ANY SOURCE CODE. DO NOT DELETE ANY FILE. WRITE FINDINGS TO YOUR AUDIT REPORT ONLY. ANY EDIT TO src/, .deckent/, .brain/, .github/, OR ROOT CONFIG FILES IS A SCOPE VIOLATION AND WILL BE FLAGGED BY ADR-037 RBAC + ADR-039 self-modifying detector.`
- Auditor (deckent's own auditor) `git diff --stat` should show ONLY `docs/audits/sprint-161/*.md` additions across the whole sprint. Anything else is a boundary violation.

If a worker thinks a code change is needed, it writes `RECOMMENDATION:` in the audit report and stops. Implementation belongs to Sprint 162+.

### Decomposition

10 macro areas (excluding `tests/`), each split into 5-50 tasks. Total ≈ 160-235 tasks.

| Macro Area | Tasks | Scope per Task |
|------------|------:|----------------|
| **Source code** | | |
| `src/core/` (94 modules) | 25-35 | 3-5 module group |
| `src/orchestra/` (76 modules) | 20-30 | brain/lifecycle/router/memory subgroups |
| `src/cli/commands/` (46 commands) | 15-25 | 2-3 command group |
| `src/mcp/` (31 tools + 8 resources) | 15-20 | tool group |
| `src/agents/` + `src/nervous/` | 10-15 | per-component |
| `src/api/` + `src/connectors/` + `src/providers/` | 10-15 | per-module |
| `src/dashboard/` (React + Vite + Tailwind) | 15-20 | per-page/component |
| **Documentation** | | |
| `docs/` + project root .md files (README, README-TR, BETA-TRACKER, CHANGELOG, VISION, COMPETITIVE-ANALYSIS, CLAUDE.md, DECKENT.md, DIRECTIVES.md, ROADMAP-GOD-LEVEL, etc. — count est. 388 .md files per ROADMAP Sprint 149 reference) | 30-50 | per-section, ≤8 .md per task |
| **Project state & memory** | | |
| `.deckent/` (config, agents/*/agent.json, skills/*/manifest.json, decisions/, archive/, features-manifest.json, project-stack.json, ci-baseline.json) + `.brain/` (memory.db schema, exports/, archive/, ERRORS.md, MEMORY.md, PATTERNS.md, RETRO.md, PROJECT-IDENTITY.md, sprint logs) + Memory V2 (DB-export sync, decay state) | 15-20 | per-substructure |
| **Hidden config & meta files** | | |
| Project root configs: `.gitignore`, `.dockerignore`, `.npmrc`, `.editorconfig`, `.npmignore`, `.eslintrc*`, `.prettierrc*`, `tsconfig*.json`, `vitest.config*.ts`, `package.json`, `package-lock.json` (presence/integrity, not content audit), `Dockerfile`, `docker-compose*.yml` + `.github/` (workflows, ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE, dependabot.yml, CODEOWNERS) + `.vscode/` + `.gemini/` + `.cursor/` + `.brain.bak*/` if exist | 5-10 | per-config or per-related-group |

### Audit dimensions per task

Every worker checks all of these dimensions for their assigned scope:

1. **Dead code / dead doc** — exports / docs / config with 0 production reference (also flag duplicate or near-duplicate documentation)
2. **ADR violations** — cross-reference against 44 active ADRs (especially ADR-008 dependency direction, ADR-037 RBAC, ADR-039 self-modifying detection, ADR-001/002 ESM/Node16, ADR-035 verification protocol)
3. **Conflicting areas** — same logical operation done in multiple places (e.g. cleanup discipline asymmetry surfaced in Sprint 160; same content in two .md files with drift)
4. **Drift** — comments/docstrings vs actual behavior; documentation claims vs code reality; `.brain/exports/*.md` vs `memory.db` actual state
5. **Type safety regressions** — `any`, `as unknown as`, ts-ignore (source files only)
6. **Dependency hygiene** — import paths, ESM `.js` extension correctness, circular deps (source files only)
7. **Documentation pollution** — outdated, contradictory, redundant, or orphaned `.md` files; especially in `docs/audits/sprint-NNN/` accumulation
8. **Memory V2 coherence** — DB schema vs migration state; FTS5 dual-layer sanity; exports vs DB sync; decay-exempt entries correctness
9. **Config integrity** — `.gitignore` excludes correct paths; `.dockerignore` matches build context; `package.json` `exports` map vs actual `dist/` files; tsconfig paths vs actual structure
10. **Migration triage flag** — for each file, classify: `KEEP-PRIVATE` (stays in dev repo), `MIGRATE-PUBLIC` (goes to open repo), `DELETE` (recommend removal in Sprint 162+), `UNCERTAIN` (needs human review)

### Per-area focused questions (worker prompt customization)

To prevent surface-skim, each macro area gets specific lead questions:

- **`src/core/`**: Are the 94 modules actually all used by orchestra/cli/mcp? Find unused exports. Cross-check `*-types.ts` against producers/consumers.
- **`src/orchestra/`**: After Sprint 154 wire-validation reform, are the 4 wired exports still alive? Any new dead exports since then?
- **`src/cli/commands/`**: All 46 commands documented in CLAUDE.md? `register{Name}` pattern (ADR-012) consistently applied?
- **`src/mcp/`**: 31 tools registered AND parameter schemas match CLI parity (ADR-022-V2)?
- **`src/dashboard/`**: 7 pages list match reality? Build artifacts in `dist-dashboard/` are integrity-clean?
- **`docs/`**: For every .md file: when last updated? Reflects current sprint? Has duplicate elsewhere? Orphaned (no inbound link)?
- **`.deckent/`**: 15 agent JSONs valid against schema? 21 skill manifests valid? `provider-cache.json` stale? `features-manifest.json` matches code?
- **`.brain/`**: `memory.db` schema_version current? `entries_fts` rebuilt clean? exports drift from DB? sprint log files within budget per CLAUDE.md gotcha?
- **Hidden config**: `.gitignore` excludes `memory.db`, `.tasks/`, `.locks/`, `dist/`, `node_modules/`, `coverage/`? `.dockerignore` matches? `package.json` engines `>=20` (Sprint 153)?

### Worker constraints (ROADMAP Sprint 153 dogfood lessons)

- **Max 8 files per task** — keeps audit thorough; bigger scope = surface skim
- **Max 2000 LoC per task scope** — fits comfortably in worker context
- **Per-task timeout** `1800s` (30min, post Sprint 154 reform 600→1800)
- **READ-ONLY** — no source code writes; only audit report markdown output (single file)
- **Effort: low/normal** — no high-effort writes (write effort doesn't apply to read-only audit)

### Output

- Per-task: `docs/audits/sprint-161/T-161-NNN-{area}-{focus}.md`
- Per-task report sections:
  - **Scope** (file list audited)
  - **Findings** (severity P0/P1/P2/P3, dimension tag from list above)
  - **Evidence** (file:line citations, exact quote/diff)
  - **Migration triage** (KEEP-PRIVATE/MIGRATE-PUBLIC/DELETE/UNCERTAIN per file)
  - **Recommendation** (Sprint 162+ candidate description, NOT a code change)
- Standard rubric scores from worker (correctness/coverage/scope/docs)

---

## 4. Lane 2 — CC Behavior Monitor

3 parallel CC agents, alive throughout Lane 1's duration.

| Agent | Responsibility | Cadence | Output |
|-------|---------------|---------|--------|
| **A1: Brain Rubric Watcher** | Read each `.tasks/task-NNN.result` and compare `selfAssessment` vs `evaluationDecision`. Track retro counter (Sprint 160 found `0/2 NO_GO` while workers reported GO_WITH_TECH_DEBT) | 120s | `docs/audits/sprint-161/cc-monitor/brain-rubric-anomalies.md` |
| **A2: Worker Honesty Auditor** | Heartbeat + result + `git diff --stat` cross-reference. "Reported X done" vs "actually wrote Y" | 180s | `docs/audits/sprint-161/cc-monitor/worker-honesty.md` |
| **A3: Auditor Authority Watcher** | `.dashboard` snapshot + `PATTERNS.md` deltas + alert log. Boundary violation, lock issue, ADR check failure | 240s | `docs/audits/sprint-161/cc-monitor/auditor-authority.md` |

### Implementation pattern

Each agent runs as a `subagent_type: general-purpose` Agent task, `run_in_background: true`. Coordinator wakes periodically (~10min via `TaskOutput`) to poll status, but agents auto-notify when they finish. Stop signal = "Lane 1 sprint COMPLETE event detected" — agent finalizes its report and exits.

No `/loop` skill. Agent self-paces with internal sleep cadence; coordinator does not micromanage.

### Bug-detection focus

Lane 2's value is *runtime* meta-dogfood — Brain rubric counter bugs, Worker dishonesty patterns, Auditor missing alerts. Sprint 160 surfaced one such bug (retro `0/2 done`); Lane 2 systematically catalogs all others.

---

## 5. Lane 3 — CC Deep-Dive Audit

9-10 parallel CC agents (9 mandatory + D9 optional), each a domain specialist. Independent of Lane 1 timing. **All read-only — no Edit/Write/Bash-mutating tools used.** Each agent's output is exactly one markdown report under `docs/audits/sprint-161/cc-deepdive/`.

`tests/` directory is OUT OF SCOPE for D6; D6 redirected to fixture-pattern findings discoverable from non-test code references.

| Agent | Specialty | Tools (read-only) |
|-------|-----------|-------|
| **D1: node_modules Auditor** | Top 50 deps, version drift, deprecated/vulnerable, license check, security advisories | Bash (npm audit, npm outdated, npm ls — read-only), Read |
| **D2: dist/src Drift Detector** | dist/ rebuild integrity, src changes reflected in dist, stale build, **dist/ auto-rebuild mystery** (Sprint 160 finding) | Bash (find -newer, diff stat — read-only), Read |
| **D3: ADR Cross-Reference** | 44 ADRs vs runtime call sites — Sprint 154 method (4 dead exports surfaced); cross-check ADR-001..046 against current code | grep, Read, MCP `deckent_memory_query` |
| **D4: Library Version Mismatch (context7)** | vitest, anthropic-sdk, better-sqlite3, commander, zod, react, vite, esbuild, typescript, openai, @google/generative-ai docs cross-reference; identify deprecated patterns and upgrade candidates | context7 query-docs, Read |
| **D5a: Documentation Pollution & Drift** | All `.md` files (project root + `docs/` recursive). Claims vs reality (CLI count, MCP count, agent count, skill count, sprint count, ADR count). Duplicate/redundant docs detection. Orphaned docs (no inbound link from CLAUDE.md / DECKENT.md / README). Outdated audit reports under `docs/audits/sprint-NNN/` accumulation pattern. | Read all .md, grep claimed numbers, find orphans |
| **D5b: Public-Repo Migration Triage** | For every file in repo (excluding `tests/`, `node_modules/`, `dist/`, `.tasks/`, `.locks/`, `coverage/`, `.brain/archive/` which are excluded by intent): classify `KEEP-PRIVATE` / `MIGRATE-PUBLIC` / `DELETE-CANDIDATE` / `UNCERTAIN`. Output is the migration triage matrix. | Read, grep |
| **D6: Doc-as-Code Fixture References (non-test)** | Generator-side asymmetry (`.prompt-${taskId}` vs `.prompt-task-${taskId}` — Sprint 160 finding) confirmed beyond src/ code? Any docs/scripts referencing old fixture patterns? **NOTE: actual `tests/` directory excluded — only references to test patterns from non-test code/docs** | Read, grep |
| **D7: Memory V2 Deep Audit** | `.brain/memory.db` SQLite schema vs migration version; `entries_fts` FTS5 health (dual-layer turkishNormalize columns); `.brain/exports/*.md` content vs DB query result — drift detection; decay state correctness; orphan tags/relations. **Read-only DB access** — `sqlite3 -readonly` flag enforced. | Bash (sqlite3 readonly), Read |
| **D8: `.deckent/` & `.brain/` Structural Audit** | All `.deckent/agents/*/agent.json` schema validity; all `.deckent/skills/*/manifest.json` schema validity; `.deckent/decisions/` accumulation; `.deckent/archive/sprints/` retention; `.deckent/features-manifest.json` vs runtime feature reality; `.deckent/project-stack.json` accuracy; `.deckent/provider-cache.json` staleness; `.deckent/ci-baseline.json` baseline correctness; `.brain/PROJECT-IDENTITY.md` claims vs current state. | Read, grep |
| **D9 (optional): Security Surface** | OWASP top 10 localized, `.env`/`.deck` exposure scan in tracked files, secrets-in-code grep (api keys, tokens, passwords), `Dockerfile` USER non-root verification, AST sandbox bypass surface | Bash (read-only secret scan), grep |

### Output

Per agent: `docs/audits/sprint-161/cc-deepdive/D{N}-{specialty}.md`

Report sections:
- **Scope** (what was inspected)
- **Findings** (severity P0/P1/P2/P3 tagged, dimension category)
- **Evidence** (file:line citations, command output, query result excerpts)
- **Migration triage** (when applicable per file/area)
- **Recommended Sprint 162+ work** (description, NOT code)

### Why D4 is critical

User explicit: "use context7". context7 fetches current library docs. Deckent's 13-model ModelRegistry, anthropic-sdk usage, vitest config, better-sqlite3 schema — all should be cross-checked against current upstream APIs (deprecations, new patterns we should adopt, breaking changes in upcoming versions).

### Why D5b is critical

The audit's *terminal output* is repo cleanup + selective public-repo migration. D5b produces the per-file decision matrix that Sprint 162 cleanup work uses as input. Without D5b, Lane 1 worker triage flags would need manual aggregation from 160-235 task reports — D5b does it as one focused pass.

---

## 6. Consolidator

### Trigger

Both barriers must clear: Lane 1 sprint COMPLETE event AND Lane 2/3 agent completion notifications.

### Tasks

1. **Read all Lane 1 outputs** (160-235 task reports) — categorize by dimension (dead/conflict/drift/doc-pollution/memory-V2/config-integrity/ADR-violation/migration-triage)
2. **Read Lane 2 outputs** (3 monitor reports) — count Brain/Worker/Auditor anomalies
3. **Read Lane 3 outputs** (9-10 deep-dive reports) — classify by specialty
4. **Build master findings table** — severity (P0/P1/P2/P3), area, evidence, recommendation
5. **Build migration triage matrix** — every audited file (~thousands) classified KEEP-PRIVATE/MIGRATE-PUBLIC/DELETE-CANDIDATE/UNCERTAIN, aggregated from Lane 1 per-task triage flags + Lane 3 D5b
6. **Draft Sprint 162 backlog** — P0+P1 candidates as task descriptions ready for DIRECTIVES; cleanup tasks separated from migration tasks
7. **Draft ROADMAP-GOD-LEVEL.md patch** — new section "Sprint 161 God-Audit (2026-05-XX)" matching the existing format style of Sprint 152/154 sections
8. **Draft Public-Repo Migration Plan** — file-list manifest of what crosses to `VerhexIO/deckent`, ordered by category (source / docs / config / ADR / brand assets)

### Deliverables

| File | Purpose |
|------|---------|
| `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md` | All findings unified, severity-sorted |
| `docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md` | Per-file KEEP/MIGRATE/DELETE/UNCERTAIN classification |
| `docs/audits/sprint-161/PUBLIC-REPO-MIGRATION-PLAN.md` | Ordered manifest for what to copy to public repo (Sprint 162+ input) |
| `docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md` | P0/P1 fix candidates ready for review (read-only audit findings → write-action sprint) |
| `docs/audits/sprint-161/ROADMAP-PATCH.md` | Diff/patch ready to apply to ROADMAP-GOD-LEVEL.md |
| (no auto-commit) — user reviews and commits manually after the entire bundle is produced |

---

## 7. Coordination & Synchronization

### Start barrier (T+0)

1. Coordinator confirms `git status` clean (or stash)
2. Snapshot `.brain/exports/summary.md`
3. Lane 1: write Sprint 161 DIRECTIVES.md → `deckent_plan` → `deckent start --auto-approve` background
4. Lane 2: dispatch 3 Agent calls with `run_in_background: true`
5. Lane 3: dispatch 5-7 Agent calls with `run_in_background: true`

### Mid-sprint syncs

- Coordinator wakes every ~10min to check Lane 1 (via `deckent_status` MCP), Lane 2/3 (via `TaskList`/`TaskOutput`)
- If Lane 1 NO_GO/TIMEOUT: **sprint kill requires user approval** (memory `feedback_sprint_kill_always_ask_user.md`); coordinator pauses and asks
- Lane 2 agents stop themselves when Lane 1 COMPLETE event detected
- Lane 3 agents finish on their own timeline (independent)

### End barrier

- Lane 1 sprint COMPLETE event observed
- All Lane 2 agents report final
- All Lane 3 agents report final
- Coordinator runs Consolidator step

### Error handling

| Scenario | Mitigation |
|----------|-----------|
| Lane 1 single task NO_GO | FIX phase auto-retry (max_fix_retries=2 in config); Consolidator notes |
| Lane 1 sprint TIMEOUT | Notify user, ask whether to extend or kill |
| Lane 2 agent fail | Continue with remaining 2; mark missing data in Consolidator |
| Lane 3 agent fail | Spawn replacement (max 1 retry); if replacement also fails, omit specialty |
| Consolidator fails | Manual fallback: user reads docs/audits/sprint-161/ directly |
| MCP deckent server hang | Restart MCP per CLAUDE.md gotcha; sprint state preserved on disk |

---

## 8. Success Criteria

| Criterion | Target |
|-----------|--------|
| Lane 1 task completion | ≥ 85% DONE or GO_WITH_TECH_DEBT (across 160-235 tasks) |
| Lane 1 boundary integrity | `git diff --stat` shows ONLY `docs/audits/sprint-161/*.md` modifications |
| Lane 2 monitoring coverage | 3 agents alive throughout Lane 1 duration |
| Lane 3 deep-dive completion | ≥ 8 of 9 mandatory agents finished (D9 security optional) |
| Findings count | ≥ 50 net findings, severity-tagged with file:line evidence |
| Migration triage matrix | Every audited file (excl. `tests/`, `node_modules/`, `dist/`, `.tasks/`, `.locks/`, `coverage/`, `.brain/archive/`) classified |
| Documentation pollution catalog | All redundant/orphaned/outdated `.md` files identified |
| Memory V2 coherence report | DB schema, FTS5 health, exports drift documented |
| ROADMAP-GOD-LEVEL update | New "Sprint 161 God-Audit" section drafted |
| Sprint 162 backlog | P0+P1 directives draft ready (cleanup + migration tracks separated) |
| Public-repo migration plan | File manifest produced |
| Wall-clock duration | < 10h |
| User approval before commit | Yes (no auto-commit of audit artifacts) |

---

## 9. Constraints (User Standing Rules + Sprint 161 Mandates)

### Hard rules — non-negotiable

- **READ-ONLY MANDATE** — no source code writes, no file deletions, no refactors, no feature additions across all three lanes. Output is markdown reports under `docs/audits/sprint-161/` only. Any deviation is a P0 boundary violation flagged by Auditor.
- **`tests/` excluded** — Lane 1 macro areas do not cover `tests/`; Lane 3 D6 redirected to non-test references only
- **Sprint kill / cleanup** — user approval required (memory rule, no exception)
- **Build (npm publish)** — user approval required (memory rule)
- **Open repo migration / npm publish** — deferred (this sprint NOT in scope; only the migration TRIAGE PLAN is produced this sprint)
- **No auto-commit** — every audit deliverable lands in working tree only; user reviews and commits manually
- **Plant forensic files** — `.worker-TEST-*` confirmed preserved per Sprint 160 fix; `.prompt-TEST-*` only partially preserved (Sprint 160 surfaced `archivePromptFiles` asymmetry, candidate for Sprint 162). Audit must not regress the `.worker-` side
- **Data exfiltration** — CC monitor agents write to local files only; no chat/web posting of secrets
- **Deckent code = opus, docs = sonnet** (memory rule for sprint task model selection — Lane 1 read-only audit tasks default to opus since precision over speed)

---

## 10. Open Questions / Decisions Made

### Resolved by user during brainstorming

- ✅ Approach B (Three-Lane Parallel) chosen over A (deckent + observer only) and C (iterative phased)
- ✅ Sprint 161 audit replaces "Hub Growth 20→50" theme from ROADMAP for Sprint 161 — that theme moves to Sprint 162+
- ✅ context7 explicitly required for Lane 3 D4
- ✅ CC parallel agents for monitoring — not /loop skill (loop is too rigid for the asymmetric agent cadence)
- ✅ **READ-ONLY entire sprint** — no code writes, no deletes, only audit markdown reports
- ✅ **`tests/` excluded** from this audit — separate concern, separate sprint
- ✅ **Documentation pollution** is a first-class audit dimension (not a side note)
- ✅ **`.deckent/`, `.brain/`, Memory V2** structures get a dedicated macro area in Lane 1 + dedicated D7+D8 in Lane 3
- ✅ **Hidden config files** (`.gitignore`, `.dockerignore`, `.npmrc`, etc.) audited — full file coverage across project
- ✅ **End goal context**: this audit feeds Sprint 162+ cleanup work + selective migration to public `VerhexIO/deckent` repo. After cleanup + migration, npm publish v1.0.0-beta.1 — but that's not this sprint.

### Decisions inside design (not user-asked)

- Lane 3 D9 (security) marked optional — if 9 agents already saturate parallelism budget, defer security to Sprint 162+
- Per-task timeout 1800s — based on Sprint 154 reform; Sprint 153 had 1200s cap and dogfood showed it was insufficient
- Audit reports in markdown — not JSON, because human review is the final consumer
- No auto-commit — user reviews + commits manually (consistent with build approval rule)
- Lane 3 D5 split into D5a (doc pollution) + D5b (migration triage) — different deliverables, separable agent prompts
- Migration triage flag as a per-task Lane 1 dimension AND a Lane 3 D5b consolidator — redundant by design (cross-validation between worker and CC perspective)
- DB read-only access for D7 (`sqlite3 -readonly`) — prevents accidental Memory V2 mutation during deep audit

---

## 11. Sprint 161 DIRECTIVES Draft (Lane 1 input)

This section is what gets written to `DIRECTIVES.md` when Lane 1 starts. Goal preview:

```markdown
# DIRECTIVES — Sprint 161: God-Level Self-Audit (Lane 1 — READ-ONLY)

## Goal
Pre-beta comprehensive READ-ONLY static audit of deckent project (excluding
tests/). 10 macro areas: 7 source-code groups + docs/ + .deckent/+.brain/
+ Memory V2 + hidden config files. Decomposed into 160-235 audit tasks.
Every file every line. Each task produces a markdown finding report with
severity-tagged P0-P3 items, file:line evidence, and per-file migration
triage classification (KEEP-PRIVATE / MIGRATE-PUBLIC / DELETE-CANDIDATE
/ UNCERTAIN).

ABSOLUTE RULES:
- Workers DO NOT write source code
- Workers DO NOT delete any files
- Workers DO NOT refactor anything
- Workers ONLY write to docs/audits/sprint-161/T-161-NNN-*.md (their report)
- tests/ directory is OUT OF SCOPE this sprint
- Findings recommend Sprint 162+ work; this sprint produces NO code change

scope.filesWrite for every task = exactly one path under docs/audits/sprint-161/
ADR-037 RBAC + ADR-039 self-modifying detector flag any deviation.
...
```

Detailed task list (with per-area lead questions, file lists, and prompt customization) will be generated by the writing-plans skill, following the worker constraint discipline (≤8 files, ≤2000 LoC scope, 1800s timeout, opus default).

---

## 12. Next Step (Brainstorming Skill Terminal)

Per the brainstorming skill flow, the next action after spec review is to invoke `superpowers:writing-plans` to convert this design into a step-by-step implementation plan with specific Lane 1 task list, Lane 2 agent prompts, Lane 3 agent prompts, Coordinator wake schedule, and Consolidator merge logic.

The implementation plan will be the immediate-execution artifact. This spec is the contract.

---

**Approval signature:** Alperen 2026-05-08 (auto-mode brainstorming session)
**Implementation owner:** Coordinator (CC main agent) + 3 Lane 2 + 5-7 Lane 3 + 150-250 deckent workers
**Estimated cost:** ~3-5M tokens (paralleled across lanes), 6-10h wall clock
