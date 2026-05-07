# Sprint 156 — docs/development/ Staleness Audit

> Audit date: 2026-05-07 | Sprint 156 | Auditor: w-156-002 (doc-writer)
> Scope: all 6 files under `docs/development/` — agent-guide, brain-guide, dashboard-guide, plugin-guide, troubleshooting, worker-guide.

---

## Methodology

Each file was read in full and checked for:
- **Dead links** — linked files verified via filesystem check
- **Stale source references** — source paths validated against actual `src/` tree
- **Agent/CLI drift** — current agent list, config fields, and CLI commands compared against code
- **Sprint-gated changes** — Sprint 148 (agent reform), Sprint 140+ (Memory V2), Sprint 153 (Node ≥20) tracked
- **TODO / FIXME / deprecated keywords** — searched (none found)

---

## Findings by File

### agent-guide.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | STALE | `## 2. Built-in Agents (8 Agents)` | Section title says 8 agents; current count is **15** built-in agents | HIGH |
| 2 | STALE | `### test-writer` | `test-writer` agent **removed in Sprint 148** reform | HIGH |
| 3 | STALE | `### performance-optimizer` | Agent renamed to `performance-analyzer` | MEDIUM |
| 4 | STALE | `### api-designer` | Agent renamed to `api-builder` | MEDIUM |
| 5 | STALE | `### devops-agent` | Agent renamed to `devops-engineer` | MEDIUM |
| 6 | MISSING | Section 2 | 9 current agents not documented at all: `architect`, `architecture-planner`, `bug-fixer`, `ci-guardian`, `data-engineer`, `frontend-designer`, `accessibility-auditor`, `refactorer`, `migration-specialist` | HIGH |
| 7 | STALE | `deckent agent stats` | Correct syntax — command confirmed in source (`agent.ts:328`) | OK |

**Summary**: Agent guide is severely outdated. The entire section 2 was written before Sprint 148 and reflects an 8-agent pool; the current pool is 15 built-in agents. The removed `test-writer` and the three renamed agents would mislead users trying to configure or reference agents.

---

### brain-guide.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | DEAD LINK | Header | `[ARCHITECTURE.md](ARCHITECTURE.md)` — `docs/development/ARCHITECTURE.md` does not exist | HIGH |
| 2 | DEAD LINK | Config Reference | `[CONFIG-REFERENCE.md](CONFIG-REFERENCE.md)` — `docs/development/CONFIG-REFERENCE.md` does not exist | MEDIUM |
| 3 | DEAD LINK | Header | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` — relative path resolves to `docs/DECKENT-MASTER-BLUEPRINT.md` (does not exist); file is at workspace root, correct path would be `../../DECKENT-MASTER-BLUEPRINT.md` | MEDIUM |
| 4 | STALE | `## Memory Management` | Entire section describes 3-tier `.md` file system (MEMORY.md / sprint-NNN.md / archive/) — **replaced by Memory V2 DB-first (SQLite) architecture** in Sprint 140+ | HIGH |
| 5 | STALE | `runDecay` description | Describes trimming MEMORY.md, DEBT.md, PATTERNS.md files — now `store.decay(sprintNum, decayAfterSprints)` operates on SQLite DB | HIGH |
| 6 | STALE | `readContext(root)` table | "Loads DECISIONS" listed as .md file context — `.brain/DECISIONS.md` **does not exist**; ADRs are now in `memory.db` via `store.getByType('adr')` | HIGH |
| 7 | STALE | Config Reference table | `brain_model` field described — renamed to **`brain_tier`** (provider-agnostic, Sprint 072) | MEDIUM |
| 8 | STALE | `spawnWorkers` description | Only tmux described — Deckent now supports 3 spawn backends: tmux, Docker, subprocess | LOW |

**Summary**: The Memory Management section is the largest stale block. The entire 3-tier file memory system was replaced in Sprint 140+ by Memory V2 (SQLite DB). This misleads developers debugging brain memory or implementing memory-related features.

---

### dashboard-guide.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | DEAD LINK | Header | `[ARCHITECTURE.md](ARCHITECTURE.md)` — does not exist in `docs/development/` | HIGH |
| 2 | DEAD LINK | Header | `[API.md](API.md)` — does not exist in `docs/development/` | HIGH |
| 3 | DEAD LINK | Header | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` — wrong relative path (see brain-guide finding #3) | MEDIUM |
| 4 | STALE | `### Pages` table | Lists 4 pages (Dashboard, History, Settings, Memory) — `IDENTITY.md` states **7 dashboard pages** | MEDIUM |
| 5 | STALE | GET /api/memory | "Returns `{ content: string }` (markdown)" — with Memory V2, content comes from DB exports, not raw `.brain/MEMORY.md` | LOW |

**Summary**: The three broken relative links in the header are the most actionable fix. The Pages table being at 4/7 means new pages (Analytics, etc.) are undocumented.

---

### worker-guide.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | DEAD LINK | Header / References | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` — wrong relative path | MEDIUM |
| 2 | STALE | `## 1. Worker Role Overview` | "Worker spawned by Brain inside a dedicated **tmux window**" — now 3 backends (tmux, Docker, subprocess); worker may run in a container | LOW |
| 3 | STALE | Result JSON format | `TaskResult` JSON example missing `tokenUsage` field — **required since Sprint 139** (missing tokenUsage → NO_GO in Sprint 140+) | HIGH |
| 4 | STALE | Plan format | Plan file described as JSON (`TaskPlan` object) — current workers write plain Markdown execution plans in practice | LOW |

**Summary**: The missing `tokenUsage` field in the result format example is the highest-priority fix. Workers following this guide literally would omit tokenUsage and trigger a synthetic NO_GO in evaluation.

---

### plugin-guide.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | STALE | Section 3, 4 model fields | Model options documented as `"opus"`, `"sonnet"`, `"haiku"` only — Deckent now supports **13 models across 3 providers** (Codex: gpt-5/gpt-4.1/o3/o4-mini/gpt-5-mini/gpt-4.1-mini; Gemini: gemini-2.5-pro/gemini-2.5-flash/gemini-2.0-flash/gemini-3.1-pro-preview) | MEDIUM |
| 2 | STALE / MISSING | `## 7. Installing and Managing Plugins` | Documents `deckent plugin enable/disable` commands — these subcommands **do not exist** in `src/cli/commands/plugin.ts`; enable/disable are only available for agents (`agent enable/disable`) | HIGH |

**Summary**: The documented `deckent plugin enable` and `deckent plugin disable` commands don't exist. Users following this guide would get "unknown command" errors.

---

### troubleshooting.md

| # | Type | Line / Section | Issue | Severity |
|---|------|----------------|-------|----------|
| 1 | STALE | File header | `Last updated: Sprint 065 (2026-03-26)` — content is ~90 sprints behind | INFO |
| 2 | STALE | `### 1.2` symptom | "`deckent doctor` fails with Node.js ≥ 18 required" — minimum is **≥20** since Sprint 153 (Node 18 EOL dropped 2026-05-06) | HIGH |
| 3 | STALE | `### 1.2` fix code | `node --version  # should be v22.x or >=v20.x` has right version but symptom line says ≥18 | MEDIUM |
| 4 | STALE | `### 2.4` | "Brain Budget over **600** lines" — actual budget is **900 lines** (CLAUDE.md, Sprint 135+) | HIGH |
| 5 | STALE | Section 6 doctor table | "Node.js ≥ 18" in Required/Pass Condition column — should be ≥20 | HIGH |
| 6 | DEAD LINK | `## Additional Resources` | "Memory System: `.brain/MEMORY.md`, `.brain/DECISIONS.md`, `.brain/DEBT.md`" — `.brain/DECISIONS.md` does not exist | MEDIUM |
| 7 | STALE | `### 3.4` | MCP `deckent://memory` described as returning `.brain/MEMORY.md` — with Memory V2, content comes from SQLite DB export | LOW |
| 8 | STALE | Pre-flight section 2.1 | "Doctor required checks: Node.js ≥ 18" — should be ≥20 | MEDIUM |

**Summary**: Three separate places in troubleshooting.md say "Node.js ≥18" but the actual requirement is ≥20. This is the most actionable fix. The Brain Budget 600→900 discrepancy would cause confusing doctor output messages for users.

---

## Dead Links Summary

| File | Dead Link | Correct Path / Status |
|------|-----------|----------------------|
| brain-guide.md | `[ARCHITECTURE.md](ARCHITECTURE.md)` | File never created |
| brain-guide.md | `[CONFIG-REFERENCE.md](CONFIG-REFERENCE.md)` | File never created |
| brain-guide.md | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` | File at workspace root; correct: `../../DECKENT-MASTER-BLUEPRINT.md` |
| dashboard-guide.md | `[ARCHITECTURE.md](ARCHITECTURE.md)` | File never created |
| dashboard-guide.md | `[API.md](API.md)` | File never created |
| dashboard-guide.md | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` | Wrong relative path |
| worker-guide.md | `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` | Wrong relative path |
| troubleshooting.md | `.brain/DECISIONS.md` (Additional Resources) | Removed — now SQLite DB |

---

## Stale Source References

| File | Reference | Actual State |
|------|-----------|-------------|
| brain-guide.md | `.brain/DECISIONS.md` in readContext | Does not exist; replaced by `memory.db` + `exports/decisions.md` |
| brain-guide.md | 3-tier memory system (MEMORY.md / sprint-NNN.md / archive/) | Replaced by Memory V2 SQLite DB-first (Sprint 140+) |
| brain-guide.md | `brain_model` config field | Renamed to `brain_tier` (provider-agnostic naming) |
| troubleshooting.md | `.brain/DECISIONS.md` | Does not exist |
| worker-guide.md | `tokenUsage` absent from result JSON | Required since Sprint 139, enforced since Sprint 140 |
| agent-guide.md | `test-writer` agent | Removed Sprint 148 |
| plugin-guide.md | `deckent plugin enable/disable` | Commands do not exist in plugin.ts |

---

## Recommended Fixes (Priority Order)

1. **[agent-guide.md — HIGH]** Rewrite Section 2 "Built-in Agents" — update count from 8→15, remove `test-writer`, rename `performance-optimizer`→`performance-analyzer`, `api-designer`→`api-builder`, `devops-agent`→`devops-engineer`, add 9 missing agents.

2. **[worker-guide.md — HIGH]** Add `tokenUsage` field to the result JSON format example (Section 10). Workers following the old format will fail evaluation.

3. **[troubleshooting.md — HIGH]** Update all 3 Node.js version references from "≥18" to "≥20" (section 1.2, section 2.1, section 6 table).

4. **[troubleshooting.md — HIGH]** Update Brain Budget threshold from 600→900 lines (section 2.4 and section 6 table).

5. **[brain-guide.md — HIGH]** Replace Memory Management section to describe Memory V2 SQLite DB-first architecture. Remove `.brain/DECISIONS.md` reference.

6. **[plugin-guide.md — HIGH]** Remove `deckent plugin enable/disable` documentation (commands don't exist). Note that `deckent agent enable/disable <name>` works for agents.

7. **[brain-guide.md + dashboard-guide.md + worker-guide.md — MEDIUM]** Fix `[DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)` links → `../../DECKENT-MASTER-BLUEPRINT.md`.

8. **[brain-guide.md + dashboard-guide.md — MEDIUM]** Remove or replace `[ARCHITECTURE.md](ARCHITECTURE.md)` and `[API.md](API.md)` dead links — either create the files or remove the references.

9. **[brain-guide.md — MEDIUM]** Update `brain_model` config field reference to `brain_tier`.

10. **[dashboard-guide.md — MEDIUM]** Update Pages table from 4 to 7 pages.
