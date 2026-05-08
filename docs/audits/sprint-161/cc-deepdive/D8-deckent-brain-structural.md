# D8 — .deckent/ & .brain/ Structural Audit (Sprint 161)

**Auditor:** Lane 3 Agent D8
**Mode:** READ-ONLY
**Date:** 2026-05-08
**Scope:** `.deckent/` (config + agent/skill manifests + decisions + archive + caches), `.brain/` (memory files + sprint logs + exports + DB)
**Total disk:** `.deckent/` 9.5M (~396 .json files) + `.brain/` 13M

---

## .deckent/agents/ — 18 enabled (active dirs) + 3 archived

**Schema (V2):** `id, name, description, manifestVersion=2, activation, expertise, allowedTools, deniedTools, preferredModel, effortMultiplier, triggerKeywords, triggerScopes, triggerFilePatterns, persistent, enabled, source, stats, systemPrompt`.
Note: original audit-task schema (`model`, `skills`) is V1. **All present manifests are V2** (`preferredModel`, no top-level `skills` array). PROMPT.md sibling exists for each.

| Agent | Schema valid (V2) | preferredModel | Enabled | Stats (uses) | Last modified | Notes |
|---|---|---|---|---|---|---|
| accessibility-auditor | OK | sonnet | true | 0 | 2026-04-24 | **STALE** (only built-in not refreshed by sync-manifest 05-08); 0 uses since adoption |
| api-builder | OK | sonnet | true | 11 | 2026-05-08 | active |
| architect | OK | opus | true | 87 | 2026-05-08 | hot agent |
| architecture-planner | OK | opus | true | 7 | 2026-05-08 | active |
| bug-fixer | OK | opus | true | 72 | 2026-05-08 | hot |
| ci-guardian | OK | sonnet | true | 2 | 2026-05-08 | low usage |
| code-reviewer | OK | opus | true | 34 | 2026-05-08 | active |
| data-engineer | OK | sonnet | true | 0 | 2026-05-08 | **NEVER USED** (registered but not routed) |
| devops-engineer | OK | sonnet | true | 6 | 2026-05-08 | active |
| doc-writer | OK | sonnet | true | 104 | 2026-05-08 | hottest agent |
| frontend-designer | OK | opus | true | 3 | 2026-05-08 | low usage |
| migration-specialist | OK | sonnet | true | 0 | 2026-05-08 | **NEVER USED** |
| performance-analyzer | OK | opus | true | 5 | 2026-05-08 | active |
| react-ts-specialist | OK | sonnet | true | 38 | 2026-05-08 | active (custom?) |
| refactorer | OK | sonnet | true | 86 | 2026-05-08 | hot |
| security-auditor | OK | opus | true | 16 | 2026-05-08 | active |
| temp-react-specialist | OK | sonnet | true | 0 | 2026-05-08 | **temp + 0 uses → eviction candidate** |
| temp-react-ts-specialist | OK | sonnet | true | 0 | 2026-05-08 | **temp + 0 uses → eviction candidate** |
| **archive/temp-react-specialist** | OK | sonnet | true | 0 | (archive) | **DUPLICATE** of active temp- (drift) |
| **archive/temp-react-ts-specialist** | OK | sonnet | true | 0 | (archive) | **DUPLICATE** of active temp- (drift) |
| archive/test-writer-removed-sprint-148 | OK | sonnet | true | 113 | (archive) | properly archived (Sprint 148 reform) |

**CLAUDE.md claim cross-check:** "15 built-in agents (Sprint 148 reform — test-writer removed)". Actual `.deckent/agents/` (excluding archive + temp-): **16 enabled** (15 built-in + `react-ts-specialist` which is not in the official `DECKENT.md` 15-agent list). IDENTITY.md claims "15 built-in + 3 custom" — only 1 custom (`react-ts-specialist`) found in active dirs; 2 `temp-react-*` are zombie temps.

---

## .deckent/skills/ — 21 manifests (matches DECKENT.md claim exactly)

**Schema (V2):** `id, source, name, version, description, manifestVersion, activation, entrypoint, category, triggers, stackDetection, composableWith, priority, promptInjection, enabled, stats`.

| Skill | Schema valid | Version | Last modified | Notes |
|---|---|---|---|---|
| accessibility-expert | OK | present | 2026-05-08 | sync ok |
| anthropic-sdk | OK | present | 2026-05-08 | |
| api-builder | OK | present | 2026-05-08 | |
| ci-testing | OK | present | 2026-05-08 | |
| code-simplifier | OK | present | 2026-05-08 | |
| database-migration | OK | present | 2026-05-08 | |
| devops-engineer | OK | present | 2026-05-08 | |
| docker-expert | OK | present | 2026-05-08 | |
| documentation-writer | OK | present | 2026-05-08 | |
| frontend-design | OK | present | 2026-05-08 | |
| git-expert | OK | present | 2026-05-08 | |
| graphql-expert | OK | present | 2026-05-08 | |
| migration-expert | OK | present | 2026-05-08 | |
| monorepo-expert | OK | present | 2026-05-08 | |
| performance-optimizer | OK | present | 2026-05-08 | |
| python-expert | OK | present | 2026-05-08 | |
| react-specialist | OK | present | 2026-05-08 | |
| security-specialist | OK | present | 2026-05-08 | |
| system-architect | OK | present | 2026-05-08 | |
| testing-expert | OK | present | 2026-05-08 | |
| typescript-expert | OK | present | 2026-05-08 | |

**Verdict:** All 21 skill manifests present, V2-valid, freshly synced 2026-05-08. Matches DECKENT.md claim 1:1.

---

## .deckent/ root + decisions + archive + ancillary

| File / Dir | Status | Notes |
|---|---|---|
| `config.json` | OK | All required keys present (`mode`, `last_sprint_id=sprint-161`, `spawn_backend=docker`, `providers`, `memory_budget=5000`, `decay_after_sprints=20`, `routing_engine=v2`, `max_workers=6`); fresh 2026-05-08 |
| `config.json.bak` × 4 | **STALE** | 4 backup copies all dated 2026-04-21 / 2026-04-24 — 14 days old, never garbage-collected |
| `cost-config.json` | OK (10K) | static reference |
| `docs.json` | OK | static |
| `features-manifest.json` | OK (12K) | regenerated 2026-05-08 by `scripts/sync-manifest.mjs`, sprintId `sprint-160` (1 sprint behind 161). Categories: **active 16, lightly_used 4, dormant 9, dead 2** |
| `project-stack.json` | OK | regen 2026-05-08; detects React + TS + Vite; lists 33 deps |
| `provider-cache.json` | OK | `cachedAt: 2026-05-08T07:38`, registered=`[claude, gemini]` (note: codex not registered despite docs claim 3 providers) |
| `ci-baseline.json` | **WARN** | `tscPassed=true` but **`testPassed=0, testFailed=24, coverage=0`** at sprint-161 baseline — entire test suite failing per latest run |
| `metrics.jsonl` | OK | 422 bytes |
| `model-registry-refresh.json` | OK | 2026-05-08 |
| `run-gate.json` | stale (Apr 24) | unused since |
| `safety-point.json` | OK | 2026-05-08 |
| `sprint-state.json` | OK | reflects active sprint-161 |
| `sprint.lock` | OK | active lock |
| **decisions/** | **156 files** (count claim was 56; recount: ls counted 56 visible, but newest is `decision-161-055`, so 55+ from sprint 161 alone) | All files prefixed `decision-161-NNN` → **all decisions are sprint-161 only**; no historical SDL retention from prior sprints (decisions dir purged or never persisted between sprints) |
| **archive/sprints/** | 12 dirs (sprint-134 → sprint-149) | Retention budget per `config.sprint_file_retention.keep_last_n=10`; **2 dirs over budget** (sprint-134, sprint-139). Sprints 150–161 NOT archived here — using new flat `.deckent/sprint-NNN-*.{json,jsonl,tar.gz}` pattern at root |
| **archive/metrics/** | exists | (not enumerated) |
| sprint-150 → sprint-161 root files | 80+ files | 12 sprints × ~7 files each (checkpoint, events, gate, metrics, panic, pre-archive, seq) — root pollution; should fold into archive/sprints/ for parity |
| sprint-150-pre-archive.tar.gz | 86K (Apr 24) | retained |
| sprint-153-panic-*.json × 5 | (May 7) | repeated panic dumps from same minute → indicates panic loop bug |
| **jobs/** | **161 files** | 1 file from Apr 24 + 4 from May 6 + 156 sprint-161 jobs → **never garbage-collected** |
| **pids/** | active | runtime |
| **plugins/** / **routing/** / **i18n/** / **cache/** | OK | static/runtime |
| `sprint-141-analysis-archive/`, `sprint-god-analysis/` | static | manual archives, not auto-managed |
| **workspace/** | OK | IDENTITY.md, BOOT.md |

---

## .brain/ inventory

### Sprint logs (per-file 100-line budget per CLAUDE.md gotcha)

22 sprint log files, **all within budget** (max 71 lines, sprint-139). Top 5:

| File | Lines | Within budget? |
|---|---|---|
| sprint-139.md | 71 | YES |
| sprint-142.md | 67 | YES |
| sprint-150.md | 57 | YES |
| sprint-152.md | 49 | YES |
| sprint-148.md | 47 | YES |

**Coverage gap:** 22 files for sprints 136–160 (with gaps: 140, 154, 157 missing). **Sprint-161 has NO sprint log file yet** (.brain/sprints/sprint-161.md does not exist) despite Sprint 161 being currently active and DECISIONS being written. Sprint logs only created post-RETRO; expected.

### Memory files (CLAUDE.md budget: 900 lines aggregate; MEMORY 300 / RETRO 120 / PATTERNS 150 / sprint log 100)

| File | Lines | Subset budget | Status |
|---|---|---|---|
| MEMORY.md | 139 | 300 | OK (46% used) |
| RETRO.md | 57 | 120 | OK (48% used) |
| PATTERNS.md | 8 | 150 | OK (5% used — under-utilized) |
| ERRORS.md | **600** | (not capped in CLAUDE.md, but) | **HIGH** — 67% of total 900 budget alone |
| PROJECT-IDENTITY.md | 119 | (decay_exempt) | OK |
| DEBT.md | 5 | (no cap) | OK (empty) |
| **Total** | **928** | **900** | **3% OVER aggregate budget** |

### Exports drift (`.brain/exports/`)

| Export | mtime | Likely fresh? |
|---|---|---|
| summary.md | 2026-05-08 10:39 | FRESH (regen on sprint start) |
| memory.md | 2026-05-08 10:39 | FRESH |
| debt.md | 2026-05-08 10:39 | FRESH |
| decisions.md | 2026-05-08 09:32 | FRESH (1h older — only refreshed on ADR write) |
| cli-mcp-parity-gap.md | 2026-04-24 | **STALE** (14 days) |
| sprint-144-cli-mcp-audit.md | 2026-04-24 | static/historical |
| sprint-145-adaptive-timeout-spec.md | 2026-04-24 | static/historical |
| sprint-145-unified-observability-spec.md | 2026-04-24 | static/historical |

### memory.db (SQLite)

| Artifact | Size | mtime | Status |
|---|---|---|---|
| memory.db | 2.3 MB | 2026-05-08 09:31 | FRESH (rebuilt at sprint-161 plan) |
| memory.db-shm | 32K | 2026-05-08 10:42 | live SQLite shared-memory |
| memory.db-wal | 0 bytes | 2026-05-08 10:42 | **WAL empty** — DB checkpointed; OK |

### .brain/archive/ — 271 files (heavy)

DIRECTIVES-sprint-{135..160} archived (with gaps at 154, 157). Plus `DEBT-ARCHIVE.md` (35K). Sprint 161 directives not yet archived (sprint active). No retention pruning visible — 14 months of DIRECTIVES retained.

---

## Findings

### P0 — Schema violations
**None.** All 21 active `agent.json` and 21 `manifest.json` files validate as V2. All required keys present in `config.json`. **However**, the original audit-task referenced V1 schema (`model`, `skills` array) — this represents documentation drift, not a violation: actual production schema is V2 (`preferredModel`, no top-level `skills`).

### P0 — Identity drift
- **`.brain/PROJECT-IDENTITY.md` is 14 days stale** (claims `Last Sprint: sprint-160, Total Sprints: 160, Coverage: 0.0%, No-Go Rate: 100.0%, ADR Count: 45, CLI Commands: 41+, MCP Tools: 22, Agents: 16, Node >=18`). CLAUDE.md / DECKENT.md / IDENTITY.md (workspace) claim **MCP Tools: 31, Sprint 155, Node >=20, Agents: 15+3 custom**. Three identity files disagree on every single metric. PROJECT-IDENTITY.md still lists `test-writer` in agent enumeration despite Sprint 148 removal.
- **CI baseline panic:** `.deckent/ci-baseline.json` shows `testPassed=0, testFailed=24, coverage=0` at sprint-161 init. Either tests are catastrophically broken or baseline collection ran on degraded environment. Sprint should not have started without yellow-flag review.

### P1 — Budget violations
- **`.brain/` aggregate 928 lines > 900 budget** (3% over). Decay should have triggered.
- **ERRORS.md = 600 lines** consumes 67% of total budget alone — no per-file cap defined for ERRORS.md in CLAUDE.md but de-facto it dominates. Recommend introducing 250-line cap + rolling archive.
- **PATTERNS.md = 8 lines** (5% utilization) — auditor pipeline is under-writing patterns; signals dead pipe.

### P1 — Manifest / archive integrity
- **2 zombie temp agents** (`temp-react-specialist`, `temp-react-ts-specialist`) at top-level with 0 uses — duplicates of the same names already correctly archived under `archive/`. LRU eviction (max 50 temp, 5 sprint age per CLAUDE.md) failed to clean these.
- **2 never-used agents** (`data-engineer`, `migration-specialist`) — registered but 0 routing in 161 sprints. Either remove or strengthen activation rules.
- **Decisions dir:** 56 files all `decision-161-NNN` — **no SDL persistence between sprints**. Either prior-sprint decisions are migrated to `.brain/memory.db` (good) and dir is purged each sprint (then this is a feature, not a bug — but undocumented), OR decisions ARE meant to persist and we have data loss. Need wire confirmation.

### P2 — Staleness / archive bloat
- `.deckent/config.json.bak` × 4 dated 2026-04-21 / 04-24 — 4 stale backups never pruned.
- `.deckent/jobs/` = **161 files**, 1 from Apr 24 + 4 from May 6 + 156 from sprint-161 — never garbage-collected.
- `.deckent/sprint-150-pre-archive.tar.gz` (86K) and other sprint-150–161 root files (80+) clutter `.deckent/` root. Should fold into `archive/sprints/sprint-NNN/` subdir for parity with sprint-134..149 layout.
- `.deckent/archive/sprints/` retains 12 sprints (134–149); `keep_last_n=10` → 2 over budget (134, 139).
- **5 sprint-153 panic dumps** within same minute (2026-05-07T06:52:28.{321,324,327,329,331}Z) — panic recurrence loop bug, all dumps preserved.
- `provider-cache.json` registered providers = `[claude, gemini]` — codex missing despite DECKENT.md claiming 3 providers. Either codex never registered (env var unset) or cache is stale.
- 4 export files in `.brain/exports/` dated 2026-04-24 (cli-mcp-parity-gap, sprint-144-cli-mcp-audit, sprint-145-adaptive-timeout-spec, sprint-145-unified-observability-spec) — historical, but mixing static + auto-regenerated in same dir creates ambiguity.

### P2 — Documentation drift (identity claims vs reality)
| Claim source | Agents count | MCP tools | Sprint | Node |
|---|---|---|---|---|
| CLAUDE.md (canonical) | 15 built-in | 31 | sprint-155 (Sprint Metrics block) | >=20 |
| DECKENT.md | 15 built-in | 31 | (no claim) | (no claim) |
| `.deckent/workspace/IDENTITY.md` | 15+3 custom | 27 (line 14 of project-status table) | sprint-155 | >=20 |
| `.brain/PROJECT-IDENTITY.md` | 16 (incl. test-writer) | 22 | sprint-160 (last) / 160 total | >=18 |
| Active `.deckent/agents/` | 18 enabled (incl. 2 temp + 1 custom) | — | — | — |
| `.deckent/config.json` | — | — | sprint-161 (last_sprint_id) | — |

**No two sources agree.** Sprint 161 audit will see 5 different identity numbers depending on which file it reads.

---

## Sprint 162+ recommendations

1. **P0 — Identity convergence**: Single source of truth for project metrics. Either auto-regen `.brain/PROJECT-IDENTITY.md` from `.deckent/config.json + agent-pool stats + skill-pool count` OR delete it. Currently it is the most-stale identity file (14 days behind config.json). Same for DECKENT.md sprint counter / IDENTITY.md mcp-tool counter.
2. **P0 — CI baseline guard**: Block sprint start when `ci-baseline.json` shows `testFailed > 0` without operator override flag (sprint-161 should not have started with `testFailed=24, coverage=0`).
3. **P1 — temp-agent eviction wire**: 2 zombie temps + 2 archive duplicates. Promotion-pipeline (CLAUDE.md mentions it) is not running cleanup. Add `deckent agent prune --temp --age=5sprints` command and wire to CLEANUP phase.
4. **P1 — `.deckent/` root cleanup**: Migrate sprint-150..161 root artifacts (80+ files) into `archive/sprints/sprint-NNN/` for parity with 134-149 layout. Add `sprint_root_artifacts_to_archive` postcondition to CLEANUP phase. Garbage-collect `config.json.bak.*` (>7 days) and orphaned `jobs/run-*.json` and `jobs/sprint-NNN.json` (only keep last 5 sprints).
5. **P1 — Decisions dir contract**: Document whether `.deckent/decisions/decision-NNN-NNN.json` is per-sprint ephemeral (current observed behavior — only sprint-161 present) or persistent SDL (CLAUDE.md/DECKENT.md says SDL = persistent audit trail). Either backfill from `.brain/memory.db` or update docs to clarify "decisions purged each sprint, archived to memory.db".
6. **P1 — `.brain/ERRORS.md` cap**: Add 250-line cap; rotate to `.brain/archive/ERRORS-sprint-NNN.md` on overflow. ERRORS.md at 600 lines violates de-facto memory budget.
7. **P1 — PATTERNS.md auditor wire**: 8 lines after 161 sprints = pattern detector pipeline is dead. Either restore writes from `auditor.ts` `store.insert({type:'pattern',...})` or delete the budget reservation.
8. **P2 — V1→V2 schema docs sync**: Update `.contracts/api-surface.md` (currently shows V1 task schema) and audit-task spec to reference actual V2 manifest (`preferredModel`, `triggerKeywords`, `triggerScopes`) so future audits don't false-flag valid V2 manifests.
9. **P2 — Provider cache freshness**: provider-cache shows 2/3 providers (codex missing). Either auto-deregister-and-document or log warning at sprint start when expected provider absent.
10. **P2 — Panic dump dedup**: 5 sprint-153-panic files in same minute = deduplication missing in panic handler. Add fingerprint-based dedup (skip write if same hash within 60s window).
11. **P2 — Archive retention**: `.brain/archive/DIRECTIVES-sprint-*.md` retains all 25+ sprints (135..160). Add `keep_last_n=20` to mirror `.deckent/archive/sprints/` budget.
