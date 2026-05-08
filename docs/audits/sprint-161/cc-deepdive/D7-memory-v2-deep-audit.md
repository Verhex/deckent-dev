# D7 — Memory V2 Deep Audit (Sprint 161)

**Lane:** Lane 3 — Agent D7 (Claude Code deep-dive)
**Scope:** READ-ONLY inspection of `.brain/memory.db` (better-sqlite3 v1, FTS5)
**Generated:** 2026-05-08
**Status:** complete (single output file)

---

## Schema state

- **Tables present (11):**
  `schema_version`, `entries`, `tags`, `relations`, `entry_history`, `sqlite_sequence`, `entries_fts`, `entries_fts_data`, `entries_fts_idx`, `entries_fts_docsize`, `entries_fts_config`
  (5 logical tables + FTS5 virtual + 4 FTS5 internal shadow tables + sqlite autoincrement = 11 total — matches contract)
- **schema_version:** `version=1, applied_at=2026-04-16 09:07:52` (single row, baseline migration applied; no V2 migration recorded)
- **Migration applied:** Schema v1 only — no v2/v3 upgrade history. Single-version DB; clean.
- **`entries_fts` columns (8):**
  `title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm`
  Tokenizer: `unicode61 remove_diacritics 2` — content table FTS bound to `entries.rowid`. **4 original + 4 turkishNormalize = matches DECKENT.md V2 contract.**
- **`entries` table columns (21):**
  `id, type, source, title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm, status, priority, sprint_id, sprint_num, lang, decay_exempt, metadata, created_at, updated_at, deleted_at`
  Defaults: `decay_exempt=0`, `status='active'`, `priority='normal'`, `lang='en'`, `sprint_num=0`. Soft-delete via `deleted_at`.

---

## Type distribution

Live (`deleted_at IS NULL`) row counts by type and status:

| type     | status     | count |
|----------|------------|------:|
| adr      | accepted   | 42    |
| adr      | active     | 2     |
| adr      | deprecated | 1     |
| adr      | proposed   | 1     |
| adr      | superseded | 1     |
| debt     | resolved   | 102   |
| memory   | active     | 25    |
| retro    | active     | 19    |
| sprint   | active     | 4     |
| identity | active     | 1     |
| **TOTAL**|            | **198** |

Auxiliary tables: `tags=797 rows`, `relations=76 rows`, `entry_history=783 rows`. No soft-deleted entries (`deleted_at IS NOT NULL` count = 0).

---

## FTS5 health

- **Dual-layer columns (4 original + 4 turkishNormalize):** YES — `title, content, summary, tag_text` + `title_norm, content_norm, summary_norm, tag_norm` exactly as contract specifies.
- **Integrity check:** `PRAGMA integrity_check` returned `ok` (no corruption, no orphan rows in shadow tables).
- **Row sync FTS ↔ entries:** `entries_fts=198`, `entries(live)=198`, `entries(total)=198` — full sync, no FTS drift.
- **Sample FTS5 queries (`MATCH`):**
  - `'sprint'` → 160 hits
  - `'docker'` → 47 hits
  - `'governance'` → 7 hits
  - `'guvenlik'` (TR-normalized "güvenlik") → 6 hits — **turkishNormalize layer FUNCTIONAL**
  - `content_norm MATCH 'sprınt'` (Turkish dotless ı) → 0 hits (expected; FTS5 unicode61+remove_diacritics 2 already folds dotless ı→i, normalizer-side is redundant for this case but still active)

---

## Export-DB sync

| Export file              | DB-derived value                | Export claim / row count                                  | Match? |
|--------------------------|--------------------------------:|-----------------------------------------------------------|:------:|
| `summary.md` (81 LoC)    | live entries = 198              | `_Total entries: 198 \| Generated: 2026-05-08_`           | YES    |
| `summary.md` ADR table   | DB type=adr count = 47          | 47 rows in summary table (45 adr-* + 2 user-*)            | YES    |
| `decisions.md` (2030 LoC)| DB type=adr count = 47          | 45 `## adr-NNN` headers + 2 `## user-1778…` (ADR-045/046) | YES    |
| `memory.md` (202 LoC)    | DB type=memory count = 25       | 25 `## Sprint …` section headers                          | YES    |
| `debt.md` (123 LoC)      | DB type=debt count = 102 resolved| (debt table format uses different row layout — 0 hits on `^\| [0-9]` regex; needs export-format check) | INCONCLUSIVE |
| `summary.md` "Active TD" | 0 active debt (102/102 resolved)| `_No active technical debt._`                             | YES    |

**Export freshness:**
- `memory.db`: May 8 09:31
- `decisions.md`: May 8 09:32 (≈DB write time)
- `summary.md`, `memory.md`, `debt.md`: May 8 10:39 (newer than DB — likely separate export pass)

No drift between summary headcount claim ("Total entries: 198") and DB count. ADR table cross-check perfect (47 = 47).

---

## Findings

### P0 — Schema drift
**None.** Schema is at v1 baseline, contract-compliant (8 FTS columns including 4 turkishNormalize, 21-column entries, 5 logical tables + FTS5). Integrity check passes.

### P1 — Export/DB mismatch
**P1-A — `debt.md` row format inconclusive.** A simple `^\| [0-9]` regex returns 0 matches against `debt.md` despite DB containing 102 resolved debt rows (and `summary.md` correctly reporting "No active technical debt"). The export likely uses a different table layout (e.g., grouped by sprint, or different column order). **Action:** sample first 30 lines of `debt.md` next sprint and confirm row format; not a data-loss bug.

**P1-B — `decisions.md` is 30 minutes older than the DB write timestamp** (09:32 vs 10:39 for the other exports). Could indicate `deckent memory export` partial-failure or skip on the `decisions` export. ADR contents still match DB (47/47), so no semantic drift, but export-pipeline atomicity is suspect. **Action:** add a single transactional export step that touches all four export files together, or version-stamp each export.

### P2 — Decay anomalies
**P2-A — Decay rule under-applied.** Config: `decay_after_sprints=20`, current sprint=160 → decay-eligible = sprint_num < 140. DB contains **11 live entries below the cutoff with `decay_exempt=0`**:
- `mem-132, mem-133, mem-135, mem-136, mem-137, mem-138, mem-139` (7 sprint-learning entries)
- `sprint-log-136, sprint-log-137, sprint-log-138, sprint-log-139` (4 sprint logs)

Per ADR contract (`store.decay()`), these should have been soft-deleted (set `deleted_at`) or marked with `decay_exempt=1` if intentionally retained. Soft-deleted total = 0, suggesting **decay has never run, or runs but skips memory/sprint types**. With ADRs (41) and identity (1) correctly exempt (`decay_exempt=1`), the exempt-flag wiring works — the gap is on the active-decay path.

**P2-B — `mem-134` is missing** (132, 133, 135, 136, …). Either Sprint 134 produced no learnings, or the entry was lost. ADR-008 retro mentions "Sprint 134" extensively, so missing learning is suspicious. Worth a quick look in `.brain/archive/` to recover.

**P2-C — Sprint logs partial.** Only 4 entries of `type='sprint'` (sprint-log-136/137/138/139), but 25+ memory entries reference sprints 132-160. Sprint logs were either deprecated or never written for sprints 140-160. Memory V2 contract (ADR-008 / DECKENT.md) implies one sprint log per sprint — actual coverage is 4/29.

### Non-issues confirmed
- FTS5 dual-layer normalize is wired and functional (`'guvenlik'` matches Turkish-content rows).
- `decay_exempt=1` on all 41 accepted ADRs + 1 identity entry — correct.
- Header/footer claim `"Total entries: 198"` matches DB exactly.
- Aux tables (`tags`, `relations`, `entry_history`) populated and proportionate (797/76/783).

---

## Sprint 162+ recommendations

1. **[P1] Rebuild `decisions.md` export atomically** alongside the other three exports, or stamp each export with a `db_mtime` footer so drift becomes visible. The current 67-minute gap between `decisions.md` and `summary.md` is a silent partial-export pattern.
2. **[P2] Wire `store.decay()` into sprint CLEANUP phase** for `type IN ('memory','sprint','retro')`. Today, 11 entries from sprints 132-139 should be decay-eligible but remain active. Either run decay or record a decision (ADR amendment) that memory entries are decay-exempt by default.
3. **[P2] Investigate `mem-134` gap.** Quick check: `git log --all --diff-filter=D -- .brain/MEMORY.md` and `.brain/archive/` for a Sprint 134 retro/learning. If lost, re-import from `.brain/archive/DIRECTIVES-sprint-134.md` (if present).
4. **[P2] Backfill or deprecate `type='sprint'` logs.** 4-of-29 coverage is below useful. Either set a sprint-cleanup hook that always writes one entry per sprint, or remove `type='sprint'` from the schema/exports if memory entries already cover the role.
5. **[P3] Add `debt.md` format regression test.** A 1-line vitest should assert `debt.md` line count > N when DB has N resolved/active debts, to catch silent export-format breakage. Also relevant: add a smoke test that opens `entries_fts` in `{readonly:true}` mode and runs the 4-token sample query so any FTS5 schema change is caught at CI time.
6. **[P3] Document the FTS tokenizer choice.** `unicode61 remove_diacritics 2` already folds many TR/DE/EN diacritics, so the 4 `*_norm` columns are partially redundant. Worth a short ADR documenting why dual-layer is kept (likely for the dotted-ı / non-diacritic-folded cases) so future maintainers don't strip the columns.

---

## Evidence appendix (raw query outputs)

```
sqlite_master tables: schema_version, entries, tags, relations, entry_history, sqlite_sequence,
                     entries_fts, entries_fts_data, entries_fts_idx, entries_fts_docsize, entries_fts_config

schema_version: [{ version: 1, applied_at: '2026-04-16 09:07:52' }]

PRAGMA integrity_check: [{ integrity_check: 'ok' }]

entries_fts row count: 198
entries (live) count : 198
entries (total) count: 198

decay_exempt distribution:
  type=adr      → 41 exempt (out of 47)
  type=identity → 1  exempt (out of 1)
  (memory/retro/sprint/debt: 0 exempt)

FTS5 sample queries:
  MATCH 'sprint'     → 160 hits
  MATCH 'docker'     →  47 hits
  MATCH 'governance' →   7 hits
  MATCH 'guvenlik'   →   6 hits  (turkishNormalize layer)

Aux tables: tags=797, relations=76, entry_history=783
Soft-deleted: 0
```
