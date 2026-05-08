# D5a — Documentation Pollution & Drift (Sprint 161)

**Lane 3 Agent D5a** — READ-ONLY exhaustive `.md` audit
**Generated:** 2026-05-08
**Method:** `find`, `grep`, `git log -1 --format=%cs`, `wc -l`, basename-frequency analysis (no Read of binary content beyond the headers needed to verify claim accuracy)

---

## Executive snapshot

- The repository carries **701 working `.md` files** (excludes `node_modules/`, `docs/node_modules/`, `.git/`, both `.deckent/sprint-*-analysis*` snapshot trees, and `src/dashboard/node_modules/`). Including those archives → **1,261 .md** outside `node_modules`. Including `node_modules` everywhere → **1,650 .md**.
- The **388 .md** figure quoted in `docs/ROADMAP-GOD-LEVEL.md` (Block E) is stale (Sprint 149 vintage) — current working surface is ~**701** (working) / **378** (under `docs/` excluding `node_modules`).
- Sprint 154 audit (`docs/audits/sprint-154/T-154-010-vision-direction.md`) **already** flagged the same root-level orphans (`NEXT-SESSION-PROMPT.md`, `SYSTEM-MIGRATION-2026-04-22.md`, `DECKENT-TEST-REPORT.md`) for archival — recommendation never executed → still in repo as of HEAD.
- 4 high-impact contradictions detected between core docs and source-of-truth (CLI count, MCP tool count, sprint number, ADR count).
- 17 **identical-named** `load-test-report.md` files across 17 sprint audit dirs — stamp-pad pollution (Sprint 145–160).

---

## 1. Doc inventory

### 1.1 Top-line totals

| Scope | Count |
|---|---:|
| All `.md` (incl. `node_modules`, `.git/` excluded) | 1,650 |
| Excl. `node_modules` (all flavours) | 1,261 |
| Excl. `node_modules` + `.deckent/sprint-*-analysis*` snapshots | 701 |
| Initial scope (excl. `node_modules`, `.brain/archive`, `tests/`, `.git/`) | 1,403 |

The 1,403 → 701 collapse comes almost entirely from two duplicated source-tree snapshots in `.deckent/`:
- `.deckent/sprint-141-analysis-archive/` — 2.0 MB, **~415 .md** (mirror of `src/`, `tests/`, `brain/`, `meta/`)
- `.deckent/sprint-god-analysis/` — 3.1 MB, **~395 .md** (parallel mirror)

These are **one-shot debug snapshots** (Sprint 141 / Sprint god-sprint) treated like archives but never moved out of an active config dir. They inflate every `find . -name "*.md"` query by ~810 entries.

### 1.2 Project root (20 files)

```
AGENTS.md                       BETA-TRACKER-TR.md          BETA-TRACKER.md
CHANGELOG.md                    CLAUDE.md                   CODE_OF_CONDUCT.md
COMPETITIVE-ANALYSIS.md         CONTRIBUTING.md             DECKENT-ANA-PLAN-TR.md
DECKENT-MASTER-BLUEPRINT.md     DECKENT-TEST-REPORT.md      DECKENT.md
DIRECTIVES.md                   NEXT-SESSION-PROMPT.md      README-TR.md
README.md                       SECURITY.md                 SYSTEM-MIGRATION-2026-04-22.md
VISION-TR.md                    VISION.md
```

### 1.3 `docs/` breakdown (378 files, 17 subdirs)

| Subdir | Count | Note |
|---|---:|---|
| `docs/audits/` | 101 | 26 sprint subdirs (132 → 161) |
| `docs/superpowers/` | 26 | 14 specs + 12 plans |
| `docs/directives/` | 32 | sprint-027 → sprint-145, **all stale** (current sprint is 161) |
| `docs/reference/` | 17 | `cli.md`, `cli-commands.md`, `api.md`, `api-examples.md` (4 near-duplicates) |
| `docs/launch/` | 9 | Reddit/HN/devto/twitter announcements (all 1-shot) |
| `docs/archive/` | 8 | observations + landing page + `full-audit-pre036.md` |
| `docs/development/` | 7 | guides per role (brain/agent/worker/dashboard/plugin) |
| `docs/guide/` | 7 | quickstart/getting-started/concepts/faq/first-sprint/docker-backend/deckent-nedir |
| `docs/architecture/` | 6 | architecture/agents/agent-skill-architecture/authority-matrix/memory-system/sprint-lifecycle |
| `docs/release/` | 6 | release-checklist/notes/roadmap/handoffs/manifest |
| `docs/analysis/` | 5 | full-audit + cli-deep + cli-mcp-master + competitive + sprint-metrics |
| `docs/sprint-log/` | 2 | only Sprint-146 + Sprint-148 (sprint log split orphan) |
| `docs/governance/` | 1 | INDEX.md |
| `docs/vision/` | 1 | roadmap.md |
| `docs/design/` | 1 | multi-project-isolation |
| `docs/.vitepress/` | 0 | VitePress config dir |
| **`docs/` root** | 6 | `index.md`, `ROADMAP-GOD-LEVEL.md`, `CHANGELOG.md`, `SPRINT-LOG.md`, `worker-guide.md`, `KNOWN_ISSUES.md` |

### 1.4 Audit accumulation per sprint

| Sprint | Files | Notes |
|---|---:|---|
| sprint-132 | 7 | W1–W6 + FINAL-EXECUTIVE-REPORT (256 KB) |
| sprint-134 | 2 | |
| sprint-135 | 1 | |
| sprint-136 | 1 | |
| sprint-137 | 2 | |
| sprint-138 | 2 | |
| sprint-139 | 8 | dead-code, layer3 scorecard, plan-file diagnostic |
| sprint-140 | 1 | |
| sprint-143–147 | 1 each | only `load-test-report.md` |
| sprint-148 | 9 | i18n + linux/wsl2/macos validation + provider parity + npm dry |
| sprint-149 | 4 | load + npm-publish-dry-final + doc-review + i18n-parity |
| sprint-150 | 4 | identical pattern to 149 (clone) |
| sprint-151 | 1 | |
| **sprint-152** | **28** | T-152-001…027 + load-test (largest pollution cluster) |
| sprint-153 | 1 | |
| sprint-154 | 12 | T-154-001…010 + EXECUTIVE-SUMMARY + DIRECTIVES |
| sprint-155, 156, 158, 159, 160 | 1 each | only `load-test-report.md` (auto-emitted) |
| sprint-161 | 3 | this audit (in progress) |

Oldest audit file timestamp: **2026-04-24 09:24** (filesystem mtime; git history older). 17 of 26 sprint dirs contain *only* `load-test-report.md` — these are auto-emitted stamps with no analytical content per sprint.

### 1.5 Largest individual `.md` files

| Size (B) | Path |
|---:|---|
| 256,271 | `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` |
| 153,704 | `DECKENT-MASTER-BLUEPRINT.md` |
| 151,265 | `.deckent/sprint-god-analysis/FINAL-REPORT.md` |
| 145,457 | `docs/SPRINT-LOG.md` |
| 131,145 | `.deckent/sprint-god-analysis/FINAL-REPORT-TR.md` |
| 122,974 | `docs/audits/sprint-150/doc-review-report.md` |
| 121,912 | `docs/audits/sprint-149/doc-review-report.md` |
| 121,063 | `.brain/exports/decisions.md` |
| 120,699 | `docs/CHANGELOG.md` (vs 4,015 B for root `CHANGELOG.md` — see P1) |
| 118,600 | `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` |
| 110,349 | `DECKENT-ANA-PLAN-TR.md` |

### 1.6 Sample of 50 root + key .md files (path | lines | last commit)

| Path | Lines | Last commit |
|---|---:|---|
| `./CLAUDE.md` | 116 | 2026-05-07 |
| `./DECKENT.md` | 412 | 2026-05-07 |
| `./README.md` | 603 | 2026-05-07 |
| `./README-TR.md` | 605 | 2026-05-07 |
| `./DIRECTIVES.md` | 995 | 2026-05-07 |
| `./BETA-TRACKER.md` | 1,553 | 2026-05-07 |
| `./BETA-TRACKER-TR.md` | 1,754 | 2026-05-07 |
| `./CHANGELOG.md` | 123 | 2026-04-24 |
| `./AGENTS.md` | 159 | 2026-04-21 |
| `./VISION.md` | 141 | 2026-04-10 |
| `./VISION-TR.md` | 141 | 2026-04-10 |
| `./CONTRIBUTING.md` | 926 | 2026-04-10 |
| `./CODE_OF_CONDUCT.md` | 52 | 2026-03-19 |
| `./SECURITY.md` | 59 | 2026-03-21 |
| `./COMPETITIVE-ANALYSIS.md` | 132 | 2026-03-27 |
| `./DECKENT-TEST-REPORT.md` | 1,311 | 2026-03-27 |
| `./DECKENT-MASTER-BLUEPRINT.md` | 2,759 | 2026-04-20 |
| `./DECKENT-ANA-PLAN-TR.md` | 1,730 | 2026-04-20 |
| `./SYSTEM-MIGRATION-2026-04-22.md` | 597 | 2026-04-22 |
| `./NEXT-SESSION-PROMPT.md` | 352 | 2026-05-05 |
| `./docs/ROADMAP-GOD-LEVEL.md` | 563 | 2026-05-07 |
| `./docs/CHANGELOG.md` | 2,612 | (active) |
| `./docs/SPRINT-LOG.md` | (145 KB) | 2026-05-08 |
| `./docs/index.md` | (small) | — |
| `./docs/KNOWN_ISSUES.md` | (small) | — |
| `./docs/worker-guide.md` | (small) | (duplicate — see P1) |
| `./docs/development/worker-guide.md` | (small) | (duplicate — see P1) |
| `./docs/architecture/agents.md` | 174 | — |
| `./docs/architecture/agent-skill-architecture.md` | — | — |
| `./docs/reference/skills.md` | 214 | — |
| `./docs/reference/cli.md` | — | — |
| `./docs/reference/cli-commands.md` | — | — |
| `./docs/release/roadmap.md` | — | (vs `docs/vision/roadmap.md` — duplicate) |
| `./docs/vision/roadmap.md` | — | (vs `docs/release/roadmap.md` — duplicate) |
| `./docs/launch/CONDUCT.md` | — | (vs root `CODE_OF_CONDUCT.md` — divergent) |
| `./.brain/MEMORY.md` | — | active |
| `./.brain/RETRO.md` | — | active |
| `./.brain/DEBT.md` | — | active |
| `./.brain/PATTERNS.md` | — | active |
| `./.brain/ERRORS.md` | — | active |
| `./.brain/PROJECT-IDENTITY.md` | — | active |
| `./.brain/exports/summary.md` | — | auto-generated |
| `./.brain/exports/decisions.md` | — | auto-generated (121 KB) |
| `./.brain/exports/memory.md` | — | auto-generated |
| `./.brain/exports/debt.md` | — | auto-generated |
| `./.brain/exports/cli-mcp-parity-gap.md` | — | (one-shot) |
| `./.brain/exports/sprint-144-cli-mcp-audit.md` | — | (one-shot) |
| `./.brain/exports/sprint-145-adaptive-timeout-spec.md` | — | (one-shot) |
| `./.brain/exports/sprint-145-unified-observability-spec.md` | — | (one-shot) |
| `./docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` | (256 KB) | 2026-04-20 |
| `./docs/audits/sprint-152/T-152-001-migration-delta.md` | — | 2026-05-05 |

(50/701 sampled. Remaining 651 follow the same patterns documented above — directives backfill, audit stamps, superpowers specs, dashboard `node_modules` mirror.)

---

## 2. Claim accuracy table

Source of truth in column "Actual" measured at HEAD (Sprint 159 final commit `6b3bc16`).

| Claim | Source doc | Claimed | Actual | Match? |
|---|---|---:|---:|:---:|
| CLI top-level commands | `CLAUDE.md` line 59 | **46** | **48** distinct `registerXxx(program)` functions across `src/cli/commands/*.ts` | ❌ off-by-2 (low) |
| CLI Commands | `IDENTITY.md` | **46** | 48 | ❌ |
| CLI Commands | `DECKENT.md` *(in identity table)* | **55+** | 48 | ❌ over-claim |
| MCP tools | `CLAUDE.md` / `DECKENT.md` / `README.md` | **31** | **29** files in `src/mcp/tools/` (excl. `index.ts`, `job-runner.ts` infrastructure → 27 user-facing) | ⚠ depends on definition; matches *MCP server instructions* announcement (31 tools) |
| MCP Tools | `IDENTITY.md` *(table)* | **27** | same as above | ⚠ self-conflict with CLAUDE.md/DECKENT.md/README.md |
| MCP resources | core docs | **8** | **6** files in `src/mcp/resources/` (`dashboard`, `config`, `retro`, `debt`, `agents`, `directives`) — `tasks` + `memory` URIs claimed in DECKENT.md but no source file present | ❌ 6/8 present |
| Built-in agents | `CLAUDE.md` / `DECKENT.md` / `README.md` / `AGENTS.md` | **15** | **15** dirs in `.deckent/agents/` matching list (excl. `archive/`, `temp-react-specialist/`, `temp-react-ts-specialist/` which are temp) | ✅ |
| Built-in skills | `CLAUDE.md` / `DECKENT.md` / `README.md` | **21** | **21** dirs in `.deckent/skills/` | ✅ |
| ADRs (active) | `summary.md` table | **44** rows (incl. user-1778… entries) | **45** `## adr-NNN:` headers in `.brain/exports/decisions.md` | ❌ off-by-1 |
| Active ADR Constraints injected into rules files | `.claude/rules/brain.md` / `auditor.md` / `worker-default.md` | **42** ADR-NNN items each | 45 ADRs in DB | ❌ ADR-005 (deprecated), ADR-022 (superseded) and 3 newer (042/045/046) absent from rules injection |
| Sprint number | `IDENTITY.md` | sprint-155 | sprint-160 active (sprint-159 final commit) | ❌ stale by ~5 sprints |
| Sprint number | `CLAUDE.md` `## Sprint Metrics` | sprint-155 | sprint-160 | ❌ stale |
| `.md` file count Block E | `docs/ROADMAP-GOD-LEVEL.md` | "388 .md review" | 701 working / 1,261 incl. analysis archives | ❌ stale (Sprint 149 baseline) |
| Total agents (`Agents`) | `IDENTITY.md` | "15 built-in + 3 custom" | 15 built-in + 2 temp (`temp-react-specialist`, `temp-react-ts-specialist`) + `archive/` ≠ "3 custom" | ❌ |
| Sprint Metrics table | `CLAUDE.md` | sprint-155 (Total Tasks 5, Completed 4, Tech Debt 1, NoGo 1, Coverage 40%) | Same row repeated; `summary.md` "Recent Learnings" lists sprint-159, 158, 156, 155… → CLAUDE.md not regenerated post-155 | ❌ frozen |

**Summary of mismatches:** 12 hard mismatches across CLI count (3 different numbers in 3 places: 46 / 48 / 55+), MCP resources (8 vs 6), ADR injection (42 vs 45), and a stale sprint pointer in 3 docs.

---

## 3. Pollution findings

### P0 — Contradictions (file X says A; file Y says NOT A)

| # | Topic | Doc A | Doc B | Contradiction |
|---|---|---|---|---|
| **P0-1** | CLI command count | `CLAUDE.md` "46 top-level commands" | `IDENTITY.md` "CLI Commands: 46" + `IDENTITY.md` table "CLI Commands 55+" | Same file disagrees with itself; both disagree with source (48). |
| **P0-2** | MCP tool count | `CLAUDE.md` / `DECKENT.md` / `README.md` "31 tools" | `IDENTITY.md` "MCP Tools: 27" | 31 ≠ 27. Reality: 29 source files; 27 user-facing if you exclude infra. |
| **P0-3** | Active sprint | `CLAUDE.md` Sprint Metrics: sprint-155 | `.brain/exports/summary.md` Recent Learnings: sprint-159, 158, 156 | CLAUDE.md is 4–5 sprints stale. |
| **P0-4** | MCP resources | `DECKENT.md` enumerates `tasks`, `memory` (8 total) | `src/mcp/resources/` only contains 6 files (no `tasks.ts`, no `memory.ts`) | Doc claim does not match shipped code. |
| **P0-5** | ADR governance | `.claude/rules/*.md` injects 42 ADRs | `.brain/exports/decisions.md` carries 45 ADRs (incl. ADR-040, 041, 042 explicitly active) | Worker prompts miss 3 active ADRs; rules-files generation is out of date. |
| **P0-6** | CHANGELOG | Root `CHANGELOG.md` (123 lines, 4 KB, last touched 2026-04-24) | `docs/CHANGELOG.md` (2,612 lines, 121 KB, actively updated) | `diff -q` confirms different contents; users following root link see a frozen file. |
| **P0-7** | Code of Conduct | Root `CODE_OF_CONDUCT.md` (52 lines, 2026-03-19) | `docs/launch/CONDUCT.md` (separate file, never reconciled) | Two CoC files, neither links to the other. |

### P1 — Duplicates / near-duplicates

| # | Pattern | Paths | Verdict |
|---|---|---|---|
| **P1-1** | `worker-guide.md` × 2 | `docs/worker-guide.md` + `docs/development/worker-guide.md` | Same filename; duplicate. Keep one canonical. |
| **P1-2** | `roadmap.md` × 2 | `docs/release/roadmap.md` + `docs/vision/roadmap.md` (+ root `docs/ROADMAP-GOD-LEVEL.md`) | Three roadmap surfaces, no INDEX disambiguating. |
| **P1-3** | CLI reference triple | `docs/reference/cli.md` + `docs/reference/cli-commands.md` + `docs/analysis/cli-deep-analysis.md` + `docs/analysis/cli-mcp-master-audit.md` + `.brain/exports/cli-mcp-parity-gap.md` + `.brain/exports/sprint-144-cli-mcp-audit.md` | 6 CLI-ref documents; user has no signpost for which is current. |
| **P1-4** | API reference pair | `docs/reference/api.md` + `docs/reference/api-examples.md` | Adjacent; intent unclear. |
| **P1-5** | `agents.md` × 4 (architecture surface) | `docs/architecture/agents.md` (174 L) + `docs/architecture/agent-skill-architecture.md` + `AGENTS.md` (159 L) + `docs/reference/skills.md` (214 L) | Same agent table is restated in 4 places; AGENTS.md is the only one with the live activation-keywords matrix. |
| **P1-6** | Sprint 132 audit repackaged | `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` (256 KB) + 6 W*-* siblings + `docs/archive/full-audit-pre036.md` | 256 KB executive report has not been touched since 2026-04-20; W1–W6 broken-out files redundant with executive. |
| **P1-7** | Doc-review report (Sprints 149/150 clones) | `docs/audits/sprint-149/doc-review-report.md` (122 KB) + `docs/audits/sprint-150/doc-review-report.md` (123 KB) — both produced, not consolidated | Audit work duplicated rather than diff'd against prior sprint. |
| **P1-8** | i18n-parity (149/150 clones) | same pattern | |
| **P1-9** | npm-publish-dry triplicate | `docs/audits/sprint-148/npm-publish-dry.md`, `sprint-149/npm-publish-dry-final.md`, `sprint-150/npm-publish-dry-final.md` | Three "final" reports; nothing in repo says which is authoritative. |
| **P1-10** | DECKENT-MASTER-BLUEPRINT vs DECKENT-ANA-PLAN-TR | `DECKENT-MASTER-BLUEPRINT.md` (153 KB, EN) + `DECKENT-ANA-PLAN-TR.md` (110 KB, TR) | Sibling EN/TR pair (intentional, OK), but neither links to the other and they have drifted (lines 2,759 vs 1,730). Keep, but cross-reference. |
| **P1-11** | `BETA-TRACKER.md` vs `BETA-TRACKER-TR.md` | 1,553 vs 1,754 lines | TR/EN intentional pair (OK), but TR is **201 lines longer** — content drift, not just translation. |

> Notably **NOT pollution**: the `README.md` ↔ `README-TR.md` and `VISION.md` ↔ `VISION-TR.md` pairs are intentional bilingual pairs (the user explicitly flagged these as TR/EN intentional in the task description). They match line-count (603/605, 141/141) — translation discipline is healthy here.

### P2 — Orphans (zero inbound links from CLAUDE.md / DECKENT.md / README.md / ROADMAP-GOD-LEVEL.md / DIRECTIVES.md)

| # | File | Inbound (core 5) | Inbound (any .md) | Last commit | Already flagged |
|---|---|---:|---:|---|---|
| **P2-1** | `NEXT-SESSION-PROMPT.md` | 0 | 10 | 2026-05-05 | ✅ Sprint 154 T-010 → ARCHIVABLE (never executed) |
| **P2-2** | `SYSTEM-MIGRATION-2026-04-22.md` | 0 | 7 | 2026-04-22 | ✅ Sprint 154 T-010 → ARCHIVABLE (never executed) |
| **P2-3** | `DECKENT-TEST-REPORT.md` | 0 | 4 | 2026-03-27 | ✅ Sprint 154 T-010 → ARCHIVABLE (never executed) |
| **P2-4** | `.brain/exports/cli-mcp-parity-gap.md` | 0 | (low) | one-shot from Sprint 144 | not flagged |
| **P2-5** | `.brain/exports/sprint-144-cli-mcp-audit.md` | 0 | (low) | one-shot | not flagged |
| **P2-6** | `.brain/exports/sprint-145-adaptive-timeout-spec.md` | 0 | (low) | one-shot | not flagged |
| **P2-7** | `.brain/exports/sprint-145-unified-observability-spec.md` | 0 | (low) | one-shot | not flagged |
| **P2-8** | `docs/sprint-log/Sprint-146.md`, `docs/sprint-log/Sprint-148.md` | 0 | 2 | sprint-log dir abandoned (only 2 of 161 sprints) | not flagged |
| **P2-9** | `docs/directives/sprint-027.md` … `sprint-145.md` (32 files) | 0 from core | each links from old planning notes | All sprints from 027–145 mirrored here, then directory abandoned (no 146+); `INDEX.md` not updated since Sprint 145. | not flagged |
| **P2-10** | `docs/launch/CONDUCT.md` | 0 | (none from launch toolset) | abandoned (other launch artifacts referenced in `docs/launch/announce-*` but CONDUCT not) | not flagged |
| **P2-11** | `docs/launch/{telegram,discord-bot,discord-server}-setup.md` | 0 | (low) | one-shot setup scripts | not flagged |
| **P2-12** | `docs/archive/landing-page-content.md`, `docs/archive/full-audit-pre036.md`, `docs/archive/observations/SPRINT-{18..25,MEGA}-OBSERVATION.md` | 0 | (low) | already in `archive/` (correct) but `MEGA-SPRINT-OBSERVATION.md` is unindexed | low priority |
| **P2-13** | `COMPETITIVE-ANALYSIS.md` | 2 (in core) | 11 | 2026-03-27 | content frozen since Sprint 100-era; superseded by `README.md` competitive table |
| **P2-14** | `AGENTS.md` | 2 (in core) | 62 | 2026-04-21 | well-linked but content duplicated in 3 other files (P1-5) |

### P3 — Outdated audit accumulation

`docs/audits/` carries **101 files across 26 sprint dirs** (sprint-132 → sprint-161). Pollution patterns:

1. **Stamp-pad `load-test-report.md`** — 17 sprint dirs (143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 155, 156, 158, 159, 160, plus 134) contain only or primarily an auto-emitted `load-test-report.md`. **No analytical content** — 17 nearly-identical files. (Sprint 154 doc-review-report flagged 142 KB of these as "auto-emitted artifacts".)
2. **Sprint-132 monolith** — 256 KB `FINAL-EXECUTIVE-REPORT.md` + 6 W-files = 7 files. Untouched since 2026-04-20 (16+ sprints ago). Content covers a customization/scalability/reliability audit that has been superseded by Sprint 138 ADR-035, Sprint 139 ADR-037, Sprint 154 EXECUTIVE-SUMMARY.
3. **Sprint-152 cluster** (28 files) — T-152-001…027 + load-test = 28. Each T-152-NNN.md is a per-task audit; the sprint-152 retro itself was NO_GO. These are debug artifacts from the Sprint 152 verification-blind incident; never indexed; partially superseded by Sprint 154 audit (`docs/audits/sprint-154/T-154-*` re-audited overlapping surfaces).
4. **Sprint-148/149/150 trio** repeats the same 4 deliverables (load + npm-publish-dry + doc-review + i18n-parity) with no diff/changelog between them. 122 KB × 3 = **~370 KB of largely identical doc-review reports**.
5. **Oldest filesystem mtime** on any audit: 2026-04-24 09:24 (mass restore from migration). Even sprint-132 audit was rewritten then; provenance is "moved into place during 2026-04-22 system migration", not original creation date.

### Additional findings

- **`.deckent/sprint-141-analysis-archive/` and `.deckent/sprint-god-analysis/` (5.1 MB combined, ~810 .md)** — these are mirror dumps of `src/`, `tests/`, and meta directories from Sprint 141 + Sprint 139. They exist inside the active config dir (`.deckent/`) but are not used by any tool. They are the single largest source of `.md` count inflation.
- **`.brain/archive/` carries 271 entries** including `pre-v2/DECISIONS.md` (96 KB) and `decisions-root-pre-sprint143/DECISIONS.md` (96 KB) — **byte-identical** legacy ADR backups. One can be deleted.
- **`docs/SPRINT-LOG.md` (145 KB)** is monolithic; `docs/sprint-log/` exists alongside but only carries Sprint-146 and Sprint-148. Pattern abandoned without consolidation.
- **`docs/directives/INDEX.md`** indexes sprint-027 → sprint-145; sprint-146..161 directives never made it in. The directory is effectively frozen; modern directives live in `.brain/archive/DIRECTIVES-sprint-*.md`.

---

## 4. Cross-reference of claimed counts vs reality (final)

| Claim | Stated | Source-of-truth method | Actual | Δ |
|---|---:|---|---:|---:|
| CLI commands (top-level) | 46 (CLAUDE.md) / 55+ (IDENTITY) | `grep -hE "^export function register[A-Za-z]+" src/cli/commands/*.ts \| sort -u \| wc -l` | 48 | -2 / +7 |
| MCP tools | 31 | files in `src/mcp/tools/` excl. `index.ts` | 28 (29 incl. `job-runner.ts` infra) | -2..-3 |
| MCP resources | 8 | files in `src/mcp/resources/` excl. `index.ts` | 6 | -2 |
| Built-in agents | 15 | dirs in `.deckent/agents/` excl. `archive/`, `temp-*` | 15 | 0 |
| Built-in skills | 21 | dirs in `.deckent/skills/` | 21 | 0 |
| ADRs (active) | 44 (summary.md) / 42 (rules) | `## adr-` headers in `decisions.md` | 45 | +1 / +3 |
| Sprint pointer | sprint-155 | `.brain/sprints/sprint-NNN.md` highest + `sprint-159` final commit | sprint-160 (active) / sprint-159 (last sealed) | -4 / -5 |
| Total .md (working) | "388" (ROADMAP-GOD Block E) | `find . -name "*.md" -not -path './node_modules/*' -not -path './docs/node_modules/*' -not -path './.git/*' -not -path './.deckent/sprint-*-analysis*/*' -not -path './src/dashboard/node_modules/*'` | 701 | +313 |

---

## 5. Sprint 162+ recommendations

Ordered by "least risk, highest signal-to-noise gain":

### Quick wins (Sprint 162 — single sprint, 4–6 hours total)

1. **Execute Sprint 154 T-010 archival recommendation** that has been pending 7 sprints. Move to `docs/archive/sprint-152/`:
   - `NEXT-SESSION-PROMPT.md` (handoff doc, now historical)
   - `SYSTEM-MIGRATION-2026-04-22.md` (one-time playbook, migration done)
   - `DECKENT-TEST-REPORT.md` (point-in-time audit)
   - **No content change. Pure file-move + git-mv. Eliminates 3 root-level orphans.**

2. **Reconcile CHANGELOG**:
   - Root `CHANGELOG.md` (4 KB, frozen 2026-04-24) → either delete or rewrite as a 5-line stub pointing to `docs/CHANGELOG.md`.
   - All public consumers find root `CHANGELOG.md` first; serving them a frozen file is misleading.

3. **Single source of truth doc** (`docs/META-INVENTORY.md` or extend `IDENTITY.md`) regenerated by a script (`scripts/regen-claim-counts.mjs`) that computes:
   - CLI commands (`grep -hE "^export function register"` count)
   - MCP tools/resources (file count)
   - Agents/skills (dir count)
   - ADRs (`grep -c "^## adr-"`)
   - Sprint pointer (`.brain/sprints/` max)
   - `.md` total
   Make `npm run validate:publish` fail if `CLAUDE.md` / `DECKENT.md` / `README.md` / `IDENTITY.md` claim numbers diverge from script output. **This is the meta-fix that prevents P0-1..P0-5 from recurring.**

4. **Regenerate `.claude/rules/{brain,auditor,worker-default}.md` ADR injection** from `.brain/exports/decisions.md` (currently 42 vs 45 mismatch). Hook this into the existing `deckent memory export` flow.

### Structural cleanups (Sprint 163 — separate sprint)

5. **Collapse `docs/audits/` stamp-pad**:
   - For sprints 143, 144, 145, 146, 147, 151, 153, 155, 156, 158, 159, 160 that contain only `load-test-report.md`: move all `load-test-report.md` files to a single `docs/audits/load-test-history.md` rolling log (one row per sprint).
   - Removes 12 nearly-empty sprint dirs.

6. **Consolidate sprint-148/149/150 audit clones** — diff the three doc-review-reports and i18n-parity reports; keep latest, archive older two with explicit `docs/archive/sprint-148/` location. Eliminates ~370 KB of near-duplicates.

7. **Sprint-152 cluster** — collapse 27 `T-152-NNN.md` files into single `docs/audits/sprint-152/AUDIT-INDEX.md` with executive summary + per-task subsections. Or move the entire dir to `docs/archive/sprint-152-historical/` (Sprint 154 T-010 already noted Sprint 152 was NO_GO and verification-blind).

8. **Move `.deckent/sprint-141-analysis-archive/` and `.deckent/sprint-god-analysis/` out of the active config dir** → `docs/archive/sprint-snapshots/{sprint-139, sprint-141}/`. Preserves history but prevents `find . -name "*.md"` queries from being polluted by 5.1 MB of dead snapshots. Cuts 810+ files from default doc surface.

9. **Resolve agent/skill doc trio (P1-5)**:
   - Make `AGENTS.md` (root) the canonical activation matrix (it has the keyword table).
   - `docs/architecture/agents.md` → narrative architecture only, remove the table.
   - `docs/architecture/agent-skill-architecture.md` → keep (different topic — taxonomy reform / ADR-041).
   - `docs/reference/skills.md` → reference table only, remove anything that duplicates `AGENTS.md`.

10. **Delete or merge** the two byte-identical legacy ADR backups in `.brain/archive/pre-v2/DECISIONS.md` and `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md` (96 KB × 2 = 192 KB redundant).

### Process changes (Sprint 162+, ongoing)

11. **`docs/directives/` is dead** (frozen at sprint-145). Either revive (mirror `.brain/archive/DIRECTIVES-sprint-*` automatically) or formally archive with a `DEPRECATED.md` header. Do not leave in mixed state.

12. **`docs/sprint-log/` is dead** (only 2 sprints out of 161). Either roll into `docs/SPRINT-LOG.md` monolith or delete the dir.

13. **Add a `docs/INDEX.md`** that points to canonical files for each topic — currently users have no way to know which of the 6 CLI-reference files is current.

14. **Auto-pollution gate** in CI: detect new audit files matching `docs/audits/sprint-NNN/load-test-report.md` and require either a sibling analytical file or auto-deletion. Prevents the 17-stamp-pad pattern from continuing.

15. **`ROADMAP-GOD-LEVEL.md` Block E ("388 .md review")** — mark this block superseded by D5a (this report) so nobody re-runs the count from a stale baseline.

### Estimated impact

| Action | Files removed/moved | Bytes recovered |
|---|---:|---:|
| Sprint 154 T-010 archival | 3 (move) | 0 (just relocate) |
| `.deckent/sprint-*-analysis*` move | 810 from working surface | 5.1 MB |
| Audit stamp-pad collapse | -16 sprint dirs flattened | ~10 KB × 16 = 160 KB |
| 148/149/150 doc-review consolidation | -2 files | ~245 KB |
| Sprint-132 audit consolidation | -6 files | minor |
| Sprint-152 cluster archive | -27 files (or +1 INDEX) | preserved as archive |
| Legacy DECISIONS.md dedup | -1 file | 96 KB |
| **Total working `.md` reduction** | **701 → ~545** (≈ -22%) | **~5.6 MB** |

The fundamental finding is that **the content is not the problem — the indexing is**. Every numerical claim in `CLAUDE.md`/`DECKENT.md`/`IDENTITY.md` is reproducible from source code in <100 ms. The drift exists because there is no automated reconciliation. Recommendation #3 (regen-claim-counts script + publish-gate) is a single small TypeScript module that prevents the entire P0 class of contradictions from recurring.

---

*End of D5a report.*
