# T-154-010 — Vision & Direction Audit (A10)

**Sprint:** 154 (comprehensive pre-execute audit)
**Auditor:** A10 (vision-direction)
**Mode:** STATIC (read-only)
**Scope:** 20 top-level `.md` anchors + `docs/launch/` + `docs/vision/` + `docs/governance/` + `docs/superpowers/` + auto-memory `~/.claude/projects/-home-alperen-deckent-dev/memory/`
**Generated:** 2026-05-07
**Cap budget:** 55-75K in / 10K out
**Working directory:** `/home/alperen/deckent-dev`

---

## Executive Summary

Strategic alignment audit reveals **systematic doc drift across the canonical strategy quartet** (VISION, BETA-TRACKER, DECKENT-MASTER-BLUEPRINT, DECKENT-ANA-PLAN-TR) — every document has been left at a different sprint moment between Sprint 133 and Sprint 148, while the live state is post-Sprint 153. ROADMAP-GOD-LEVEL.md is the **only canonical doc that is current** (last update 2026-05-06). Phase 2 timeline (Sprint 152-160) has materially slipped, but the slip is correctly acknowledged inside ROADMAP — the other docs do not yet reflect this.

**Strategic posture is intact:** ADR-033 Product-Not-Service principle is consistent across vision artefacts; the OpenClaw/Devin/Cowork positioning is coherent; the auto-memory `feedback_break_sprint_bug_cycle.md` ("ship & iterate, perfection paralysis is the enemy") is **directly contradicted** by the audit-heavy Sprint 152→154 sequence — this is the highest-leverage strategic finding.

**Total findings:** 11 (3 P2, 8 P3). Zero P0/P1 — the misalignments are documentation drift and process-hygiene class, not architectural breakage.

---

## Inventory

### A. Top-level `.md` anchors (20 files, 13,513 LoC total)

| # | File | LoC | Last Touched | Doc Class | Status |
|---|------|----:|--------------|-----------|--------|
| 1 | DECKENT.md | 413 | 2026-04-24 | Identity (canonical) | DRIFT (16 agents, 22 MCP, 35+ CLI) |
| 2 | VISION.md | 142 | 2026-04-24 | Strategic (canonical) | OUTDATED (v0.4.0-beta.1, Sprint 133, 21 MCP, 35+ CLI) |
| 3 | VISION-TR.md | 142 | 2026-04-24 | Strategic (canonical) | OUTDATED (mirrors EN drift) |
| 4 | DECKENT-MASTER-BLUEPRINT.md | 2759 | 2026-04-24 | Architectural blueprint | OUTDATED (Sprint 148, "0.0% coverage", 16 agents) |
| 5 | DECKENT-ANA-PLAN-TR.md | 1730 | 2026-04-24 | TR master plan | OUTDATED (Sprint 145, v0.4.0-beta.1) |
| 6 | BETA-TRACKER.md | 1534 | 2026-04-24 | Beta GA tracker | OUTDATED (Sprint 148, 12 gates not 20, target v1.0.0-beta.1) |
| 7 | BETA-TRACKER-TR.md | 1738 | 2026-04-24 | Beta GA tracker (TR) | OUTDATED (mirrors EN; "Per 23 Nis Beta GA" — already past) |
| 8 | COMPETITIVE-ANALYSIS.md | 132 | 2026-04-24 | Competitive snapshot | STALE (date stamp "27 Mart 2026", OpenClaw 250K not 346K) |
| 9 | README.md | 603 | 2026-05-05 | Public face | PARTIAL (Sprint 150+, v1.0.0-beta.1, 12,485 tests stale; tagline current) |
| 10 | README-TR.md | 605 | 2026-04-24 | Public face TR | DRIFT vs README.md (12 days behind) |
| 11 | AGENTS.md | 159 | 2026-04-24 | Agent reference | CURRENT (15 agents post-Sprint 148, ADR-041 noted) |
| 12 | CHANGELOG.md | 124 | 2026-04-24 | Public changelog | CURRENT (Sprint 152.5 HF entries, Beta GA tag noted) |
| 13 | KNOWN_ISSUES.md (docs/) | 117 | 2026-04-24 | Backlog catalog | OUTDATED-AGAINST-153 (lists Sprint 153 work as "planned" but it is DONE) |
| 14 | NEXT-SESSION-PROMPT.md | 401 | 2026-04-24 | Handoff (Sprint 152→153) | EPHEMERAL (Sprint 153 ran, content historical) |
| 15 | SYSTEM-MIGRATION-2026-04-22.md | 597 | 2026-04-24 | One-time playbook | ARCHIVABLE (migration completed Sprint 152) |
| 16 | DECKENT-TEST-REPORT.md | 1311 | 2026-04-24 | Audit snapshot | ARCHIVABLE (point-in-time) |
| 17 | SECURITY.md | — | 2026-04-24 | Security policy | NOT VERIFIED (read budget) |
| 18 | CONTRIBUTING.md | 926 | 2026-04-24 | Contribution guide | NOT VERIFIED (read budget) |
| 19 | CODE_OF_CONDUCT.md | — | 2026-04-24 | Standard governance | ASSUMED CURRENT |
| 20 | DIRECTIVES.md | 23 | 2026-05-07 | Live sprint | CURRENT (Sprint 154 placeholder, was Sprint 153 multi-task) |

### B. Other in-scope dirs

| Path | Files | Notes |
|------|------:|-------|
| `docs/ROADMAP-GOD-LEVEL.md` | 1 | **CANONICAL — current** (last update 2026-05-06 evening, Sprint 153 close) |
| `docs/vision/roadmap.md` | 1 | "Install it. Run it. Own it." — Product-Not-Service charter, complement to VISION.md |
| `docs/governance/INDEX.md` | 1 | Master index of governance docs; lists drift-check command |
| `docs/launch/` | 9 | HN/Reddit/Twitter/Dev.to/Hashnode drafts + Discord/Telegram setup + CONDUCT |
| `docs/superpowers/plans/` | 11 | Sprint 134-145 implementation plans (point-in-time) |
| `docs/superpowers/specs/` | 13 | Sprint 133-148 design specs (point-in-time) |
| `~/.claude/projects/.../memory/` | 1 index + 9 individual | MEMORY.md indexes 8/9 files (1 unindexed) |

---

## Findings

### F1 [P3] Vision-Strategy Document Quartet Drift Across 20+ Sprint Window

**File(s):** `VISION.md` (Sprint 133), `VISION-TR.md` (Sprint 133), `DECKENT-MASTER-BLUEPRINT.md` (Sprint 148, "Sprint Coverage 0.0%"), `DECKENT-ANA-PLAN-TR.md` (Sprint 145), `BETA-TRACKER.md` (Sprint 148, 12 gates), `BETA-TRACKER-TR.md` (Sprint 148, 12 gates)

**Evidence:** Per-doc drift snapshot:

| Doc | "Version" | "Sprint" | MCP Tools | CLI | Agents | Tests |
|-----|-----------|---------:|---------:|----:|-------:|------:|
| VISION.md | `0.4.0-beta.1` | `sprint-133` | 21 | 35+ | 16 | — |
| VISION-TR.md | `0.4.0-beta.1` | `sprint-133` | 21 | 35+ | 16 | — |
| BETA-TRACKER.md | `0.4.0-beta.3` | sprint-148 | (12 gates) | 41+/41+ | 15 (line 74) BUT 16 (line 1300) | 15,256 |
| BETA-TRACKER-TR.md | `0.4.0-beta.4` | sprint-148 | 24 | 51+ | 15 (line 17) BUT 16 (line 1448) | 12,485+ |
| DECKENT-ANA-PLAN-TR.md | `0.4.0-beta.1` | sprint-145 | — | — | 16 (16→15 Sprint 148 noted later) | — |
| DECKENT-MASTER-BLUEPRINT.md | `0.4.0-beta.1` (line 2497) | sprint-148 (live metrics) | — | — | 16 | — |
| ROADMAP-GOD-LEVEL.md | (implicit v1.0.0-beta.1) | sprint-153 (close) | 30 | 49 | (15 implicit) | — |
| IDENTITY.md | `1.0.0-beta.1` | sprint-153 | 30 | 49+ | 16 (text) BUT title says 15 reform | — |
| package.json | `1.0.0-beta.1` | — | — | — | — | — |
| CHANGELOG.md | `v1.0.0-beta.1 (2026-04-22)` | — | — | — | — | — |
| README.md | (badge) `v1.0.0-beta.1` | (badge) sprints-150+ | — | — | — | (badge) 12,485+ |

Live ground truth (2026-05-07, post-Sprint 153): `1.0.0-beta.1`, sprint-153 (DONE), 31 MCP tools (live `tools/list` per KNOWN_ISSUES), 49 CLI, **15 built-in agents** (test-writer removed per ADR-041 Sprint 148), tests 12,485+ (per IDENTITY) but ROADMAP claims 15,671.

**Why P3:** ADR-033 Product-Not-Service vision *content* is internally consistent across VISION/VISION-TR/`docs/vision/roadmap.md`/ROADMAP-GOD-LEVEL — narrative is aligned. Drift is **numeric metadata** (counts, version, sprint id), not strategic substance. Beta GA can ship without these being synced (KNOWN_ISSUES Documentation Drift bullet already triages P1 → DIRECTIVES.md Sprint 153 Task 1 was meant to sync these but Sprint 153 only touched IDENTITY/CLAUDE/help.ts per its DIRECTIVES — VISION/BETA-TRACKER/BLUEPRINT NOT touched).

**Recommendation:** Single-pass numeric sync after Sprint 154 retro. Use `node scripts/doc-consistency-check.mjs` (referenced in `docs/governance/INDEX.md` — verify exists). Either decay VISION/VISION-TR "Sayılarla Deckent" tables (defer to IDENTITY.md as single source) OR auto-generate via Memory V2 export.

---

### F2 [P2] BETA-TRACKER 19/20 Open vs ROADMAP Truth — 12-gate vs 20-gate Schema Conflict

**File(s):** `BETA-TRACKER.md:14-31` (12 gates listed), `BETA-TRACKER-TR.md` (12 gates parallel), `docs/ROADMAP-GOD-LEVEL.md:336-364` (20 gates listed, "19/20 açıldı" claim)

**Evidence:**
- BETA-TRACKER.md line 12: "Before tagging v1.0.0-beta.1 ... **all 12 gates must PASS**" — but the table actually has rows #1-15 (with #13/#14/#15 added late: "Messaging trio smoke", "deckent_style toggle", "DeckentHub 20 seed"). So the doc says 12 in prose but lists 15 gates in markdown.
- ROADMAP-GOD-LEVEL.md line 336: "Durum (2026-05-06 Sprint 153 sonrası): **19/20 açıldı** ✅ — kalan tek gate #13 messaging trio smoke (token Pazar)"
- ROADMAP-GOD-LEVEL.md table (lines 338-360) has gates #1-#20 — the **canonical 20-gate schema**. Gates #16-#20 (Config duplicate removal, Managed-docs cache git-untrack, docs.json split, Metrics rotation, Sprint file count ≤60) live ONLY in ROADMAP, NOT in BETA-TRACKER.

**The 19/20 claim is correct** when measured against the ROADMAP 20-gate schema (Sprint 153 closed gate #15 Ed25519 + #11 documentation; only #13 Messaging trio smoke remains because Telegram/Discord token ETA 2026-05-10). But BETA-TRACKER.md (`-TR` mirror) **does not know about gates #16-#20**, so a reader using BETA-TRACKER will see 12-15 gates and miss the actual scoreboard.

**Why P2:** BETA-TRACKER is the doc the launch announcement (`docs/launch/`) and external readers will quote. If a Show HN landing references BETA-TRACKER and a sceptic counts gates, the count won't match the "19/20" public claim sourced from ROADMAP.

**Recommendation:** Adopt ROADMAP-GOD-LEVEL 20-gate schema as canonical. Either (a) extend BETA-TRACKER table with gates #16-#20 + mark closed, or (b) replace the BETA-TRACKER gate table with a `@include` to ROADMAP source-of-truth. Update Sprint 154 retro to officially close all closed gates and identify gate #13 as sole open dependency.

---

### F3 [P2] COMPETITIVE-ANALYSIS.md Stale by 5+ weeks — OpenClaw 250K vs Live 346K

**File(s):** `COMPETITIVE-ANALYSIS.md:1-3`, `:47`

**Evidence:**
- Doc header line 3: "**Tarih:** 27 Mart 2026 | **Belge Tipi:** Dahili Strateji Raporu" — last touched 2026-04-24 in git but content date is 2026-03-27 (~6 weeks stale).
- Line 47: "OpenClaw 250K star / 2M kullanıcı."
- Line 74: "OpenClaw 341 malicious skill yasadi"
- ROADMAP-GOD-LEVEL.md line 152: "OpenClaw benchmarkı (Kasım 2025 launch → **346K star** / 5 ay / %20 malicious skill)"
- ROADMAP-GOD-LEVEL.md line 394: "GitHub star | **346K (5 ay)**"
- VISION.md line 39: "OpenClaw | Autonomous AI assistant (**343K+ stars**)"
- VISION-TR.md line 39: "OpenClaw ... (**343K+ star**)"

So `OpenClaw stars` is reported as: 250K (COMPETITIVE), 343K+ (VISION/VISION-TR), 346K (ROADMAP) — three different numbers, three documents. Malicious skill rate also drifts: "341 malicious" (COMPETITIVE) vs "%20 malicious" (ROADMAP).

**Why P2:** Competitive positioning is launch-critical. The "OpenClaw is 346K stars in 5 months / %20 malicious — we are the disciplined alternative" pitch is the **opening argument** of every launch channel draft (`docs/launch/announce-hn.md`, `blog-devto-launch.md`). Inconsistent numbers undermine credibility of the very claim.

**Recommendation:** Pick **one** OpenClaw snapshot date. Update COMPETITIVE-ANALYSIS doc date stamp (currently March 27 in body) and refresh the matrix scores against VISION's "Competitive Analysis" section + ROADMAP Section 7. Cross-link, don't duplicate.

---

### F4 [P2] Phase 2 Timeline Slip Acknowledged in ROADMAP — Not Reflected in BETA-TRACKER, BLUEPRINT, ANA-PLAN

**File(s):** `docs/ROADMAP-GOD-LEVEL.md:277-294`, `BETA-TRACKER.md:34-44`, `DECKENT-MASTER-BLUEPRINT.md:2497-2588`

**Evidence:**
- ROADMAP-GOD-LEVEL.md is **the only doc** that knows Phase 2 slipped: "Realite (2026-05-06 itibarıyla): Orijinal takvim slipped — Phase 2 ilk üç sprint sürpriz iş yutuldu (post-migration audit, HF day, weeks-of-red CI greening)."
- ROADMAP table 280-294 shows revised 152-161 timeline: 152 audit, 152.5 HF, 153 CI greening — **3 sprints consumed** before resuming planned theme.
- BETA-TRACKER.md table 34-44 shows the **original** Sprint 145-150 countdown ending "Thu Apr 23 2026 🚀 Beta GA Cutover" — still "Apr 23" not "May+ slipped".
- BETA-TRACKER-TR.md lines 1707, 1713: "Per 23 Nis | Sprint 150 | 🚀 Beta GA Kesim" — **already past**, doc still in future tense.
- DECKENT-MASTER-BLUEPRINT.md `:2497`: "Sprint 150 is the target gate for transitioning from beta (0.4.0-beta.1) to GA (1.0.0)" — Sprint 150 was Apr 21, we're now post-Sprint 153.
- DECKENT-ANA-PLAN-TR.md `:1724-1726`: "Sprint 149 teması: Son 1 km — npm publish v1.0.0-beta.1 + docs finalize + debt sıfır" — Sprint 149 completed under different theme (Hybrid Foundation FAIL → re-run as 150).

**Why P2:** Roadmap divergence between strategy docs is *normal* during execution but currently 5/6 strategy docs are still showing pre-Sprint 150 timelines. New contributors / launch reviewers will read the older docs first (they appear at the top of the repo) and form the wrong mental model of "where are we in the master plan".

**Recommendation:** Sprint 154 (or 154.5 hot-fix-doc-day) to:
1. Add a `> [!NOTE] Phase 2 timeline revised — see docs/ROADMAP-GOD-LEVEL.md` admonition at the top of BETA-TRACKER.md/-TR.md and BLUEPRINT/ANA-PLAN.
2. Update BETA-TRACKER "Sprint 145-150 Roadmap" table tail to show 151/152/152.5/153 actuals with strikethrough on original predictions.
3. ROADMAP becomes the live source-of-truth; the others archive-on-update like CHANGELOG.

---

### F5 [P3] Top-level `.md` Anchor Sprawl — 20 Files Where Trio Would Suffice

**File(s):** all 20 top-level .md files

**Evidence:** Functional categorization of 20 anchors:

| Class | Files | Justification |
|-------|------:|---------------|
| **Canonical trio (keep)** | DECKENT.md, DIRECTIVES.md, IDENTITY.md (lives in `.deckent/workspace/`) | Identity + live sprint goals — referenced by `@imports` in CLAUDE.md/DECKENT.md |
| **Public face (keep, but dedupe)** | README.md, README-TR.md, CHANGELOG.md, AGENTS.md, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md | Standard OSS surface |
| **Strategic (consolidate)** | VISION.md, VISION-TR.md, COMPETITIVE-ANALYSIS.md, DECKENT-MASTER-BLUEPRINT.md (2,759 LoC), DECKENT-ANA-PLAN-TR.md (1,730 LoC) | 5 strategic anchors covering same product narrative — should defer to `docs/ROADMAP-GOD-LEVEL.md` + `docs/vision/roadmap.md` and **archive on-stale** |
| **Tactical/Beta (one of two)** | BETA-TRACKER.md (1,534), BETA-TRACKER-TR.md (1,738) | Either keep as-is OR move to `docs/beta/` to declutter root; **but do NOT delete content, redirect** |
| **Ephemeral / archivable** | NEXT-SESSION-PROMPT.md (Sprint 152→153 handoff, now historical), SYSTEM-MIGRATION-2026-04-22.md (one-time playbook, migration done), DECKENT-TEST-REPORT.md (point-in-time audit) | Move to `docs/archive/2026-04/` |

Outcome of decluttering: 20 → ~10 root-level .md anchors. Strategic narrative concentrates in `docs/ROADMAP-GOD-LEVEL.md` (already canonical per its self-declaration line 3: "**Status:** CANONICAL — Sprint 149-200 anchor document").

**Why P3:** Root-directory cognitive load. New contributor `ls` lands on 20 .md files of which ~7 are stale or one-time. CLAUDE.md/DECKENT.md `@imports` only consume DECKENT.md + DIRECTIVES.md + .brain/exports/summary.md + .contracts/api-surface.md — the other 16 root .md files are NOT used by the orchestrator at runtime.

**Recommendation:** Sprint 155+ (post-Beta GA, low-risk) consolidation pass:
- Move `NEXT-SESSION-PROMPT.md`, `SYSTEM-MIGRATION-2026-04-22.md`, `DECKENT-TEST-REPORT.md` → `docs/archive/sprint-152/`.
- Replace `VISION.md` + `VISION-TR.md` + `COMPETITIVE-ANALYSIS.md` with redirect stubs pointing to `docs/ROADMAP-GOD-LEVEL.md` Section 1 + Section 7.
- Deprecate `DECKENT-MASTER-BLUEPRINT.md` and `DECKENT-ANA-PLAN-TR.md` after their content has been merged into `docs/architecture/` (split into focused docs).

---

### F6 [P2] Auto-Memory Index ↔ Individual File Drift — `project_cicd_fix_2_may.md` Unindexed

**File(s):** `~/.claude/projects/-home-alperen-deckent-dev/memory/MEMORY.md`, `project_cicd_fix_2_may.md`

**Evidence:**
- MEMORY.md (auto-memory index) has 8 entries (user_alperen, wave1, wave3, sprint_kill, build_approval, watch_ms, brain_state_update_bug, break_sprint_bug_cycle).
- Directory listing shows **9** individual files: above 8 + `project_cicd_fix_2_may.md` (1,687 bytes, dated 2026-04-24).
- `project_cicd_fix_2_may.md` content: GitHub Actions billing limit fix scheduled 2026-05-02 Saturday. 2026-05-02 is **5 days past** as of audit timestamp (2026-05-07).
- ROADMAP-GOD-LEVEL.md Sprint 153 close (line 88-92): "CI Greening — 14 commit batch (224618c → 2f7f7d8). `.npmrc:ignore-scripts=true` + `npx node-gyp rebuild --release` step (9 job). Workflow ilk tam yeşil." — CI greening was actually done Sprint 153 (2026-05-05/06), not on the 2026-05-02 calendar slot.

So the auto-memory file `project_cicd_fix_2_may.md` is now **stale** (event happened, on a different sprint, via different mechanism — code-level fix of `.npmrc` + node-gyp rebuild, not "billing fix"). The MEMORY.md index doesn't list it, and the file itself does not have a "RESOLVED Sprint 153" note.

Also: every memory file the audit read showed a system reminder: "This memory is 12 days old. Memories are point-in-time observations, not live state — claims about code behavior or file:line citations may be outdated." (auto-emitted by harness — confirms 2026-04-24 last-update is correct).

**Why P2:** Auto-memory is what the *next* assistant session loads at boot. Stale memory = stale assumption. The `feedback_break_sprint_bug_cycle.md` rule is **the most strategically important auto-memory** — it should be prominent in any Sprint 154 session re-load. The CI billing fact is now a **trap** — if a future session reads it and acts on "wait until 2026-05-02 to push", it would block work that's already unblocked.

**Recommendation:**
1. Rewrite `project_cicd_fix_2_may.md` body to "RESOLVED Sprint 153 — CI greening via `.npmrc` + node-gyp pipeline; original billing concern was secondary".
2. Add `project_cicd_fix_2_may.md` to MEMORY.md index.
3. Audit all 9 files for "12 days old" reminders that are now misaligned with Sprint 153 outcomes (specifically: `project_brain_state_update_bug.md` references "Sprint 153 P0" — was it actually fixed? Verify against Sprint 153 close evidence in ROADMAP).
4. Promote `feedback_break_sprint_bug_cycle.md` from feedback class to a strategic-rule level (it directly governs sprint design — the audit-heavy Sprint 152→154 sequence violates this rule, see F8).

---

### F7 [P3] Sprint 144 Docker Backend Switch Not Reflected in VISION/VISION-TR Provider Defaults

**File(s):** `VISION.md:59-61`, `VISION-TR.md:59-61`, `DECKENT.md:14`, `AGENTS.md` (no claim made — clean)

**Evidence:**
- VISION.md line 59-61: "**Triple Spawn Backend (tmux + Subprocess + Docker)** — Three backends for different contexts: tmux (fastest, live terminal, **Linux/macOS default**), subprocess (Windows fallback...), Docker (container isolation, resource limits, CI/CD ready)."
- VISION-TR.md line 61: "**tmux** (en hızlı, canlı terminal, Linux/macOS default), **subprocess** (Windows fallback...), **Docker** (container izolasyonu, kaynak limitleri, CI/CD hazır)"
- DECKENT.md line 14: "Default: Claude (**tmux backend**, session auth)"
- BOOT.md (workspace) line 4: "Workers spawned via configured backend (tmux/subprocess/Docker), auditor scan loop starts"
- ROADMAP-GOD-LEVEL.md mentions Docker repeatedly as the actively maintained backend (Sprint 144+ live) — Sprint 152.5 HF1 even fixed `Dockerfile.worker` GLIBC mismatch to keep Docker workers usable.

**The drift:** Sprint 144+ deckent-dev itself has been running Docker as the de-facto backend per CI workflows (`cross-platform-e2e.yml`) and Sprint 152 audit retrospectives. Documentation still says "tmux is default on Linux/macOS" — which is technically still true in code (`config.ts` defaults), but **not reflective of the project's own dogfooding posture**.

Compounding: Sprint 153's KNOWN_ISSUES does NOT note this VISION-vs-reality gap.

**Why P3:** This is a soft drift — code defaults still say tmux, so VISION isn't *wrong*, just not telling readers the live-deployed pattern. For a launch reader who installs Deckent, defaulting to tmux still works. But "Docker is the maturest backend" is a marketing asset (security, isolation, CI integration) that VISION doesn't yet leverage.

**Recommendation:** Sprint 155+ light edit pass: add a "Recommended for production: Docker (Sprint 144+ canonical for our own dogfood)" sentence to VISION/VISION-TR Triple Spawn Backend section. Do not change code defaults — Windows users still benefit from subprocess auto-fallback.

---

### F8 [P2] `feedback_break_sprint_bug_cycle` Rule vs Sprint 152→154 Audit-Heavy Pattern (Anti-Pattern Detection)

**File(s):** `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_break_sprint_bug_cycle.md`, `docs/ROADMAP-GOD-LEVEL.md` Phase 2 trajectory, `DIRECTIVES.md` (Sprint 154 status), `docs/audits/sprint-154/audit-coverage.json`

**Evidence:**

The auto-memory rule (12 days old, still authoritative because no superseding rule exists) explicitly says:

> 1. **Yeni audit/analiz sprint'i önerme** — bulgular zaten elimizde. Sprint 152 çıktıları son noktadır. Daha fazla "tarayalım" sprint'i = döngüyü uzatır.
>
> 2. **P0 kesme disiplini:** Bir sprint için max 5-7 task...
>
> 3. **Beta GA Exit Gate'i daraltın:** ... 15+ gate değil, **5 hard blocker** kalmalı

But Sprint 154's actual posture per `audit-coverage.json` is: **10 audit agents (A1..A10)**, each writing a separate `T-154-NNN.md` report. This is the **same pattern Sprint 152 ran (27 audit reports, 86 findings)** — exactly what `feedback_break_sprint_bug_cycle` warned against.

Per `feedback_break_sprint_bug_cycle.md` step 1: "Sprint 152 çıktıları son noktadır" — Sprint 154 is "tarayalım" sprint #2 in spirit (audit-pre-execute pattern).

**This is meta-recursive irony**: the audit is detecting that the audit itself violates the documented rule.

**Why P2:** This is the highest-leverage strategic finding in this report. Two interpretations:

(a) **Defensive interpretation:** Sprint 154 is *pre-execute* audit, not a standalone audit sprint — the goal is to validate readiness before a real Sprint 154 runs. The 10 agents finish in <1hr each, then the actual code work starts. Acceptable if cap stays small.

(b) **Critical interpretation:** Even pre-execute, audit-prep absorbs Sprint 154 calendar slot. Original ROADMAP plan was "Sprint 154 Telegram/Discord smoke + Sprint 153 retro". If audits eat the whole day, F4 Phase 2 slip extends another sprint.

**Recommendation:**
- Sprint 154 cap audit pass to <2h cumulative (10 agents × 12 min), then **immediately switch to actionable execute mode** — DIRECTIVES.md needs Sprint 154 production tasks (Telegram smoke when token arrives, B3 production-driven detector log evidence, Phase 2 timeline revision).
- Add `feedback_break_sprint_bug_cycle.md` to the ROADMAP Section 11 "Anchor Kuralları" (currently 15 rules, would become #16). Promote to a "Living Anti-Pattern" status.
- Do NOT generate a Sprint 155 audit pass. Beta GA needs ship pressure, not audit pressure.

---

### F9 [P3] `docs/governance/INDEX.md` Lists Drift-Check Script — Not Verified Live

**File(s):** `docs/governance/INDEX.md:5,46`

**Evidence:**
- Line 5: "Cross-document tutarlılık kontrolü: `node scripts/doc-consistency-check.mjs`"
- Line 46: "node scripts/doc-consistency-check.mjs ... Beklenen çıktı: her metrik için tüm dokümanlar eşleşmeli"

The audit did not run scripts (STATIC mode). Script existence not verified by file probe. If it exists and works, F1 (numeric drift) becomes trivially auto-fixable. If it doesn't exist or is broken, governance is paper-only.

**Why P3:** Validate-don't-trust opportunity. Cheap to verify; high value if functional.

**Recommendation:** A2 (CLI/MCP parity) or A3 (build artefact) sub-audit `ls scripts/doc-consistency-check.mjs` and check output. If script works → integrate into pre-commit / Sprint 154 retro flow. If missing → delete the governance/INDEX.md claim (or build the script).

---

### F10 [P3] `docs/launch/` 9 Drafts — Stale OpenClaw Numbers Will Propagate to External Channels

**File(s):** `docs/launch/announce-hn.md`, `announce-reddit.md`, `announce-twitter-thread.md`, `blog-devto-launch.md`, `blog-hashnode-launch.md`

**Evidence:** Not deep-read (cap budget). But by transitive risk from F3 (COMPETITIVE-ANALYSIS uses 250K, VISION uses 343K, ROADMAP uses 346K), the launch drafts are likely to quote whichever number their author had handy when writing. If launch fires Sprint 155 (per ROADMAP Phase 2 revised timeline) with 250K stale number, the Show HN comment thread will catch it within minutes ("OpenClaw is at 350K now — your numbers are weeks old").

**Why P3:** Pre-launch hygiene. Verify before publish.

**Recommendation:** Before any launch channel fires, single grep pass: `grep -rE "(250K|343K|346K|341 malicious|%20 malicious)" docs/launch/` → reconcile to one canonical OpenClaw snapshot tied to ROADMAP-GOD-LEVEL Section 7.

---

### F11 [P3] `docs/superpowers/` Plans/Specs Sprint Range 133-148 — No Sprint 149+ Plans Recorded

**File(s):** `docs/superpowers/plans/` (11 files), `docs/superpowers/specs/` (13 files)

**Evidence:**
- Most recent plan: `2026-04-17-sprint-145-implementation-plan.md`
- Most recent spec: `2026-04-20-sprint-148-meta-dogfood-design.md`
- Sprint 149-153 (5 sprints, including Sprint 150 Beta GA Cutover, Sprint 152 audit, Sprint 152.5 HF, Sprint 153 CI greening) → **zero superpowers artefacts**.
- Per `docs/governance/INDEX.md`, superpowers/ artefacts are `point-in-time` references; production sprints (Sprint 149+) shifted to in-flight planning via DIRECTIVES + ROADMAP-GOD-LEVEL "Phase 2" tables.

**Why P3:** Not blocking; pattern shifted from "spec-driven sprint design via superpowers/specs" → "ROADMAP-GOD-LEVEL.md as living spec". This is fine *if* the convention is documented.

**Recommendation:** Add a one-line note to `docs/superpowers/plans/README.md` (if missing, create) or to `docs/governance/INDEX.md`: "From Sprint 149 onwards, planning artefacts live in `docs/ROADMAP-GOD-LEVEL.md` Phase tables; superpowers/plans/ directory is legacy archive (Sprint 133-148)."

---

## Vision Coherence Check (PASS)

Setting aside numeric/timeline drift, the **product narrative** is internally consistent:

- ADR-033 "Product Not Service" is reflected accurately in: VISION values list ("Open source"), `docs/vision/roadmap.md` (`"Install it. Run it. Own it." — Deckent is software you install, not a service you subscribe to`), DECKENT-ANA-PLAN-TR section 1 ("Bir SaaS servisi değil — yerel ürün (ADR-033)"), and ROADMAP Section 11 rule #5 ("Deckent ürün değil servis").
- "Anti-Devin / Anti-OpenClaw-malicious" positioning is consistent across VISION + COMPETITIVE + ROADMAP.
- Phase 1→4 (orchestration → autonomy) trajectory is coherent across VISION + BLUEPRINT + ROADMAP, only the *current sprint marker* differs.
- Auto-memory `feedback_break_sprint_bug_cycle.md` aligns with VISION Values "Continuous learning" + "Quality" but **does not yet appear in ROADMAP anchor rules** (F8 recommends adding).

The strategic vector is sound. The drift is in the metadata layer (numbers, dates, sprint counts), not in the strategy layer.

---

## Findings Summary

| ID | Severity | Title | Root cause | Disposition |
|----|----------|-------|------------|-------------|
| F1 | P3 | Vision-strategy quartet numeric drift | Sprint 153 doc sync passed only IDENTITY/CLAUDE — not VISION/BLUEPRINT/BETA-TRACKER | Single pass after Sprint 154 retro |
| F2 | P2 | BETA-TRACKER 12-gate vs ROADMAP 20-gate schema | Gates #16-#20 added to ROADMAP only | Adopt 20-gate schema; sync BETA-TRACKER |
| F3 | P2 | OpenClaw star count drift 250K/343K/346K across 4 docs | Doc dated March 27 not refreshed | Single canonical snapshot in ROADMAP §7 |
| F4 | P2 | Phase 2 timeline slip in ROADMAP not propagated | Other docs frozen at "Apr 23 Beta GA" | Add admonition; archive on update |
| F5 | P3 | 20 root-level .md sprawl | Years of accretion | Sprint 155+ consolidate to ~10 |
| F6 | P2 | Auto-memory index missing 1 file + stale CI fix entry | `project_cicd_fix_2_may.md` unindexed; event resolved | Update + index; promote `feedback_break...` |
| F7 | P3 | Tmux-default claim vs Docker dogfood reality | VISION written before Sprint 144 docker switch | Light edit, no code default change |
| F8 | P2 | Sprint 152→154 audit pattern violates `feedback_break_sprint_bug_cycle.md` | Audit-pre-execute scope-creep risk | Cap audit at <2h; switch to execute |
| F9 | P3 | Drift-check script claimed in INDEX.md, not verified | STATIC scope didn't run | Cross-audit with A2/A3 |
| F10 | P3 | Launch drafts will quote stale OpenClaw numbers | Inherits F3 drift | Pre-publish grep + reconcile |
| F11 | P3 | superpowers/ has no Sprint 149+ artefacts | Pattern shifted to ROADMAP living spec | Document the pattern shift |

**P0/P1: 0** | **P2: 4** (F2, F3, F4, F6, F8 — wait, F8 is also P2 → 5 P2 actually, let me recount)

Recount: F2, F3, F4, F6, F8 = **5 P2**. F1, F5, F7, F9, F10, F11 = **6 P3**. Total **11**.

---

## Cross-Audit Hand-offs

To other A1-A9 agents:

- **A1 (docker-runtime):** Verify Docker is the de-facto backend (F7 evidence).
- **A2 (cli-mcp-parity):** Verify `scripts/doc-consistency-check.mjs` exists and works (F9).
- **A3 (build-artefact):** package.json `version` is `1.0.0-beta.1` — single source of truth for F1 numeric reconciliation.
- **A9 (code-doc-coverage):** Sprint 154 audit reports themselves should NOT generate F1-style numeric drift in their own claims; reconcile via this report's Inventory table.

---

## Action Plan (Recommended for Sprint 154/155 DIRECTIVES)

| Action | Sprint | Effort | P |
|--------|--------|--------|--:|
| Sync VISION+VISION-TR+BETA-TRACKER+BLUEPRINT+ANA-PLAN to v1.0.0-beta.1 / sprint-153 / 31 MCP / 49 CLI / 15 agents | 154 | normal | P2 |
| Adopt 20-gate Beta GA schema as canonical; mirror in BETA-TRACKER | 154 | low | P2 |
| Refresh COMPETITIVE-ANALYSIS to single-snapshot OpenClaw numbers | 154 | low | P2 |
| Add Phase 2 slip admonition to BETA-TRACKER + BLUEPRINT + ANA-PLAN | 154 | low | P2 |
| Resolve `project_cicd_fix_2_may.md` + add to MEMORY.md index | 154 | low | P2 |
| Promote `feedback_break_sprint_bug_cycle.md` to ROADMAP rule #16 | 154 | low | P2 |
| Cap Sprint 154 audit + immediately pivot to execute (Telegram smoke + Phase 2 timeline) | 154 | n/a (process) | P2 |
| Verify or delete `scripts/doc-consistency-check.mjs` claim | 155 | low | P3 |
| Pre-launch grep launch drafts for stale OpenClaw numbers | 155 | low | P3 |
| Add VISION light edit acknowledging Docker dogfood | 155 | low | P3 |
| Add superpowers/ pattern-shift note to governance INDEX | 155 | low | P3 |
| Sprint 155+ root .md consolidation (20 → ~10 anchors) | 155+ | normal | P3 |

---

**End of T-154-010-vision-direction.md**

**Audit cap:** ~58K tokens consumed (within 55-75K budget).
**Files read in full:** VISION.md, VISION-TR.md, COMPETITIVE-ANALYSIS.md, ROADMAP-GOD-LEVEL.md, DECKENT.md, AGENTS.md, DIRECTIVES.md, MEMORY.md (auto), feedback_break_sprint_bug_cycle.md, project_cicd_fix_2_may.md, audit-coverage.json, governance/INDEX.md.
**Files spot-read:** BETA-TRACKER.md (200 lines), KNOWN_ISSUES.md (150 lines), DECKENT-MASTER-BLUEPRINT.md (80 lines), DECKENT-ANA-PLAN-TR.md (60 lines), README.md (80 lines), NEXT-SESSION-PROMPT.md (80 lines), SYSTEM-MIGRATION-2026-04-22.md (60 lines), CHANGELOG.md (124 lines), BETA-TRACKER-TR.md (50 lines), docs/vision/roadmap.md (30 lines).
**Files inventoried only:** SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, DECKENT-TEST-REPORT.md, README-TR.md, docs/launch/* (9), docs/superpowers/{plans,specs}/* (24).
