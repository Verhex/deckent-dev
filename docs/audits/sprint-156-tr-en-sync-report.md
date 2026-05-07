# Sprint 156 — TR/EN Documentation Sync Audit

**Generated:** 2026-05-07 | **Task:** 156-001 | **Auditor:** doc-writer (architect agent)
**Scope:** README.md ↔ README-TR.md, BETA-TRACKER.md ↔ BETA-TRACKER-TR.md

---

## README sync

| Section | EN status | TR status | Drift? |
|---------|-----------|-----------|--------|
| Header / tagline | "The AI orchestrator for developers who want discipline." | "Disiplin isteyen geliştiriciler için AI orkestratör." | ✓ |
| Badges (tests, coverage, license, sprints, version) | 12485+ tests, 89.33%, 150+, v1.0.0-beta.1 | Same values | ✓ |
| Quick Start section | Present, identical commands | Present, translated commands | ✓ |
| Dual Mode table (Sprint + Task) | Present | Present | ✓ |
| Architecture diagram | Present | Present (translated labels) | ✓ |
| Key Features — Core Orchestration | 8-phase lifecycle, 10 workers | Same | ✓ |
| Key Features — Security | AST Sandbox, RBAC, `.deck` interpolation | Same (translated) | ✓ |
| Key Features — Intelligence & Memory | Memory V2, Brain Auto-Query, Self-Learning | Same (translated) | ✓ |
| Key Features — Agents & Skills | 15 built-in agents, 21 built-in skills | Same (translated) | ✓ |
| Key Features — Infrastructure | MCP 31 tools + 8 resources | Same (31 tool + 8 resource) | ✓ |
| Comparison table (feature matrix) | 31 tools, 8 resources | 31 tool, 8 resource | ✓ |
| Requirements — Node.js version | `>= 20` | `>= 18` | ⚠️ DRIFT |
| Doctor output example — node_version | `v20.11.0 (>=20 required)` | `v20.11.0 (>=18 required)` | ⚠️ DRIFT |
| Installation section | npm install -g deckent | Same | ✓ |
| CLI usage — init, mode, status | Present | Present (translated) | ✓ |
| CLI usage — deckent recall/remember | Present (5 example commands) | Present (5 example commands) | ✓ |
| All Commands table (30+ rows) | Present | Present (all commands matched) | ✓ |
| MCP integration section | MCP Tools (22) in table | MCP Tool'lar (22) in table | ✓ |
| MCP Resources section | 8 resources table | 8 resources table | ✓ |
| Configuration — Key Options table | 9 options listed | 9 options listed | ✓ |
| Configuration — Multi-Provider Support | 13 models, 3 providers | Same | ✓ |
| Docker Backend section | Present | Present (translated) | ✓ |
| Nervous System section | Present | Present (translated) | ✓ |
| Web Dashboard section | 6 pages | 6 sayfa | ✓ |
| Workspace Structure (directory tree) | Present | Present (translated labels) | ✓ |
| Crash Recovery section | Present | Present (translated) | ✓ |
| DeckentHub section | 20 seed skills | 20 seed skill | ✓ |
| Contributing / Documentation links | Present | Present (translated) | ✓ |
| License / Contact | MIT, Verhex, deckent.agency | Same | ✓ |

**README drift summary:** 1 section with 2 related lines in drift — both caused by Sprint 153's Node 18 EOL drop that was applied to EN but not propagated to TR.

---

## BETA-TRACKER sync

| Gate / Section | EN status | TR status | Drift? |
|----------------|-----------|-----------|--------|
| Header — Last updated date | 2026-05-07 | 2026-04-20 | ⚠️ DRIFT |
| Header — Sprint reference | 154 multi-provider Faz A→C DONE | 145+ | ⚠️ DRIFT |
| Header — Test count | 15,671 | 12,485+ | ⚠️ DRIFT |
| Header — Version | v1.0.0-beta.1 | 0.4.0-beta.1 | ⚠️ DRIFT |
| Current Status table (sprint, MCP tools, etc.) | sprint-155, MCP 27, CLI 55+, 15 agents, 21 skills | sprint-155, MCP 27, CLI 55+, 15 agents, 21 skills | ✓ |
| Overview — TypeScript modules | 882 TypeScript modules | 250+ TypeScript modülü | ⚠️ DRIFT |
| Overview — current version | v0.4.0-beta.1 text body | v0.4.0-beta.1 text body | ✓ (both stale vs identity) |
| Phase Plan — Sprint 145 status | COMPLETE (in EN detail table) | AKTİF (in-progress unchecked) | ⚠️ DRIFT |
| Phase Plan — Sprint 146-155 entries | All present and COMPLETE | Not present | ⚠️ DRIFT |
| 5-Sprint Roadmap (S145-150) | Present (historical reference) | Present (showing as future targets) | ⚠️ DRIFT |
| M0-M9 Milestone table | Present | Not present (section absent) | ⚠️ DRIFT |
| Beta GA Exit Criteria — 20-gate overall summary | "18/20 PASS" (gate #8 reopened post Sprint 154) | "19/20 açıldı" (gate #8 still ✅) | ⚠️ DRIFT |
| Gate #1 — tsc 0 errors | ✅ PASS | ✅ PASS | ✓ |
| Gate #2 — vitest ≥ 99.5% | ✅ PASS (99.94%, 15671 tests) | ✅ PASS (99.94%, 15671 tests) | ✓ |
| Gate #3 — Coverage ≥ 85% | 🔄 Phase 2 (Sprint 160+) | 🔄 Phase 2 (long) | ✓ |
| Gate #4 — 27+ MCP tools | ✅ 30 | ✅ 30 | ✓ |
| Gate #5 — 45+ CLI commands | ✅ 49 | ✅ 49 | ✓ |
| Gate #6 — npm pack clean | ✅ | ✅ | ✓ |
| Gate #7 — Cross-platform 3/3 | ✅ Sprint 148 | ✅ Sprint 148 | ✓ |
| Gate #8 — Multi-provider 3/3 | 🟡 Sprint 155 (2/3 live; codex pending; Sprint 154 reopened) | ✅ Sprint 148 (stale — pre-Sprint 154 gap discovery) | ⚠️ DRIFT |
| Gate #9 — deckent_style toggle | ✅ | ✅ | ✓ |
| Gate #10 — Memory V2 stress | ✅ Sprint 145 | ✅ Sprint 145 | ✓ |
| Gate #11 — Documentation sync | ✅ Sprint 153 | ✅ Sprint 153 | ✓ |
| Gate #12 — Built-in Bundle | ✅ 36/36 | ✅ 36/36 | ✓ |
| Gate #13 — Messaging trio smoke | 🟡 Sprint 154 (token pending) | 🟡 Sprint 154 (token pending) | ✓ |
| Gate #14 — Dockerfile non-root | ✅ | ✅ | ✓ |
| Gate #15 — DeckentHub 20 seeds | ✅ Sprint 153 E | ✅ T-150-031 | ✓ |
| Gate #16 — Config duplicate removal | ✅ | ✅ | ✓ |
| Gate #17 — Managed-docs cache untrack | ✅ | ✅ | ✓ |
| Gate #18 — docs.json private/public split | ✅ | ✅ | ✓ |
| Gate #19 — Metrics.jsonl rotation | ✅ | ✅ | ✓ |
| Gate #20 — Sprint file count ≤ 60 | ✅ | ✅ | ✓ |
| Sprint 145-150 Roadmap table | Present | Present (different readiness scores visible) | ✓ |
| Sprint 151+ phases (detailed) | Present through Sprint 155 | Absent post Sprint 145 | ⚠️ DRIFT |

---

## Drift Summary

| File | Drift count | Severity |
|------|-------------|----------|
| README.md ↔ README-TR.md | 2 lines (same root cause) | HIGH — affects Node install requirement |
| BETA-TRACKER.md ↔ BETA-TRACKER-TR.md | 9 sections | CRITICAL — header, overview, phase plan, gate #8 |

---

## Recommended fixes

1. **[HIGH] README-TR.md — Node version requirement**: Change `>= 18` to `>= 20` in the Requirements table to match Sprint 153's Node 18 EOL drop (same commit that updated EN).

2. **[HIGH] README-TR.md — Doctor output snippet**: Update `node_version   v20.11.0 (>=18 required)` to `(>=20 required)` — the EN snippet already reflects this.

3. **[CRITICAL] BETA-TRACKER-TR.md — Header**: Update `Son güncelleme: 2026-04-20 | Sprint: 145+ | Test: 12,485+ | Versiyon: 0.4.0-beta.1` to match EN `2026-05-07 | Sprint: 154 multi-provider | Tests: 15,671 | Version: v1.0.0-beta.1`.

4. **[CRITICAL] BETA-TRACKER-TR.md — Overview paragraph**: Update `882 TypeScript modules` (currently `250+ TypeScript modülü`) and version references (`v0.4.0-beta.1` → `v1.0.0-beta.1` where appropriate in body text).

5. **[CRITICAL] BETA-TRACKER-TR.md — Gate #8**: Change status from `✅ Sprint 148` to `🟡 Sprint 155 (codex E2E)` with Sprint 154 description of the real architectural gap discovered (`spawn-backend-docker.ts` hardcoded Claude pre-Sprint 154). The overall gate summary should be `18/20 PASS`, not `19/20`.

6. **[HIGH] BETA-TRACKER-TR.md — Phase Plan Sprint 146-155**: Add translated entries for Sprint 146, 147, 148, 149, 150, 151, 152, 153, 154, 155 matching EN COMPLETE entries (currently Sprint 145 is shown as AKTİF in TR).

7. **[HIGH] BETA-TRACKER-TR.md — M0-M9 Milestone table**: The entire `Sprint 145-150 Roadmap — Beta GA Countdown` and `M0-M9 Milestone Progress Matrix` sections present in EN are absent from TR. These should be translated and added.

8. **[MEDIUM] BETA-TRACKER-TR.md — Roadmap section tone**: Sprint 150 roadmap is shown in future tense in TR (target/hedef readiness) but is now historical. The TR version should reflect post-Sprint 150 achieved state, consistent with EN.

9. **[MEDIUM] BETA-TRACKER-TR.md — Current Status table cross-check**: The `Current Status` table in TR correctly shows sprint-155 and current metrics, but this is inconsistent with the stale header. Confirm these values were updated separately and are correct.

10. **[LOW] Establish a sync gate for future sprints**: The EN BETA-TRACKER header includes a note that changes must propagate to TR. Add an explicit step in the sprint-reporter or docs-updater to flag when EN BETA-TRACKER diverges from TR (e.g., a lint check that compares header dates between the two files).
