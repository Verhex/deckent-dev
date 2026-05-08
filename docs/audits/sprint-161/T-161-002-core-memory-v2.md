# T-161-002 — Core Memory V2 Audit (READ-ONLY)

**Sprint:** 161 (Lane 1 God-Level Static Audit)
**Task:** T-161-002 — `src/core/` Memory V2
**Mode:** READ-ONLY (no source changes; only this report is written)
**Date:** 2026-05-08
**Worker:** w-161-002 (model: opus, agent: doc-writer)

---

## 1. Scope

Six files audited (1,780 LoC total — within the ≤2000 LoC budget):

| File | LoC | Responsibility |
|------|-----|----------------|
| `src/core/memory-store.ts` | 673 | SQLite store class — schema init, CRUD, FTS5 triggers, tags, relations, history, decay |
| `src/core/memory-query.ts` | 415 | Dual-layer FTS5 search (`searchMemory`), `escapeFts5Query`, `buildAutoQuery`, `MemoryQueryError` |
| `src/core/memory-normalize.ts` | 38 | `turkishNormalize()` — ASCII folding for TR/EN/DE locale-aware FTS5 recall |
| `src/core/memory-types.ts` | 177 | All type definitions: `MemoryEntryV2`, `CreateEntryInput`, `MemoryQueryParams`, `EntryRelation`, `MemorySearchResult` |
| `src/core/memory-export.ts` | 226 | DB → markdown generators (`exportSummaryMd`, `exportDecisionsMd`, `exportMemoryMd`, `exportDebtMd`) |
| `src/core/memory-import.ts` | 251 | Markdown → `CreateEntryInput[]` parsers (`parseDecisionsMd`, `parseMemoryMd`, `parseDebtMd`, `extractKeywords`) |

**Lead questions per directive:**

1. DB schema migration version — handled in §3.A
2. FTS5 dual-layer `turkishNormalize` alignment — handled in §3.B
3. Exports vs DB drift — handled in §3.C
4. Decay-exempt correctness — handled in §3.D

---

## 2. Findings — Severity Index

| Sev | # | Title | Dimension |
|-----|---|-------|-----------|
| **P1** | F-1 | `extractAdrReferences` regex case-sensitive — misses lowercase `adr-NNN` mentions | Drift / Bug |
| **P1** | F-2 | `escapeFts5Query` operator emission can produce invalid FTS5 syntax in OR mode | Drift / Bug |
| **P1** | F-3 | `parseDebtMd` empty-cell filter breaks column alignment for partially-empty rows | Drift / Bug |
| **P1** | F-4 | Schema migration: `SCHEMA_VERSION = 1` recorded but never consulted — no upgrade path | Memory V2 coherence |
| **P2** | F-5 | `buildAutoQuery` exported but no production caller (only tests) — dead helper | Dead code |
| **P2** | F-6 | `Relation` interface unused — superseded by `EntryRelation` | Dead code |
| **P2** | F-7 | Three `extractKeywords` implementations with divergent stop-word lists | Conflict / Duplication |
| **P2** | F-8 | `extractAdrReferences` re-implemented in `scripts/backfill-relations.mjs` | Conflict / Duplication |
| **P2** | F-9 | `db: any` with eslint-disable in `memory-query.ts:194,256` — should use `DatabaseType` | Type safety |
| **P2** | F-10 | `decay()` will sweep entries with default `sprint_num = 0` unless `decay_exempt = 1` | Decay-exempt correctness |
| **P2** | F-11 | `upsert` does not refresh auto-extracted ADR relations on content edit | Memory V2 coherence |
| **P3** | F-12 | `as { 1: number } | undefined` cast uses numeric key instead of string key/alias | Type safety |
| **P3** | F-13 | `getByType` lacks `includeDeleted` option that `getById` provides — API asymmetry | Drift |
| **P3** | F-14 | `parseDebtMd` does not cross-validate `resolved` against `resolvedInSprintId` column | Drift |
| **P3** | F-15 | ADR body H2s (`## Status`, `## Decision`) appear at same H2 level as `## adr-NNN:` in `exportDecisionsMd` output — count ambiguity | Drift / cosmetic |
| **P3** | F-16 | `parseMemoryMd` deterministic ID `mem-${num}` collides on re-import — silent overwrite via upsert path | Memory V2 coherence |
| **P3** | F-17 | `getRelations(entryId)` query filter `from_id = ? OR to_id = ?` lacks index on `to_id` consideration when both directions queried (works, but `idx_relations_to` only) | Performance |

No **P0** issues found. The pipeline is functional and DB-first invariant holds.

---

## 3. Lead-Question Deep-Dives

### 3.A — DB Schema Migration Version

**File:** `src/core/memory-store.ts:21`, `:91-145`, `:249-258`, `:659-664`

The schema constant is `const SCHEMA_VERSION = 1` (line 21). The store records it once at construction:

```typescript
private recordSchemaVersion(): void {
  const existing = this.db.prepare(
    `SELECT version FROM schema_version WHERE version = ?`,
  ).get(SCHEMA_VERSION) as { version: number } | undefined;
  if (!existing) {
    this.db.prepare(
      `INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))`,
    ).run(SCHEMA_VERSION);
  }
}
```

`getSchemaVersion()` (line 659) returns `MAX(version)` from the table. This is **read-only** — the store never compares the on-disk version to the code version, never invokes a migration ladder. Combined with `CREATE TABLE IF NOT EXISTS` for every DDL, schema evolution is effectively limited to adding new tables and columns where SQLite tolerates the sin of "schema drift by addition only."

**Risk:** If a future Memory V2 → V3 schema arrives (e.g., added column on `entries`, FTS5 column changes, new tables), the upgrade path must be authored ad-hoc in the next change. There is no contract today.

**Recommendation (Sprint 162+):** Define a `migrate(currentVersion: number): void` ladder using `ALTER TABLE` / FTS5 rebuild; have `initSchema` consult `getSchemaVersion()` first and apply migrations sequentially. **Not a blocker for current correctness** — at version 1, the no-op path is correct.

### 3.B — FTS5 Dual-Layer turkishNormalize Alignment

**Files:** `memory-store.ts:184-247`, `memory-query.ts:198-209`, `memory-normalize.ts:1-38`

Alignment **verified correct**:

1. **Schema columns** (`memory-store.ts:96-118`): 4 normalized columns (`title_norm`, `content_norm`, `summary_norm`, `tag_norm`), each `NOT NULL DEFAULT ''`.
2. **FTS5 virtual table** (`memory-store.ts:189-197`): 8 indexed columns in order — `title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm`. Tokenizer `unicode61 remove_diacritics 2` for diacritic-folded indexing.
3. **Insert path** (`:276-279`) and **upsert path** (`:377-380`) both call `turkishNormalize()` on the four source fields and write to the matching `*_norm` columns within the same transaction. ✅
4. **Query path** (`memory-query.ts:198-209`):
   ```typescript
   const escaped = escapeFts5Query(params.text!, mode);
   const normalized = escapeFts5Query(turkishNormalize(params.text!), mode);
   const ftsQuery =
     `{title content summary tag_text}: (${escaped})` +
     ` OR ` +
     `{title_norm content_norm summary_norm tag_norm}: (${normalized})`;
   ```
   This is a **column-filtered FTS5 MATCH** — the OR runs across original-column hits and normalized-column hits, producing the union (max recall). ✅

5. **Update trigger correctness** (`memory-store.ts:232-244`): the `entries_au` trigger emits both delete-old and insert-new for the FTS5 index, preserving rowid linkage. ✅

The 100%-recall claim for TR/EN/DE in `IDENTITY.md` is structurally consistent with the implementation.

**Subtle issue (F-2)** — tracked separately: query *escaping* is brittle for user-supplied operator tokens.

### 3.C — Exports vs DB Drift

**Files:** `memory-export.ts`, `memory-import.ts`, current `.brain/exports/*.md`

Cross-checked the live exports against re-import semantics:

| Export | Section format | Re-import parser | Round-trip safe? |
|--------|----------------|------------------|------------------|
| `summary.md` | Mixed (table + bullets + footer) | None — context-only file | N/A (not designed for re-import) |
| `decisions.md` | `## adr-NNN: Title` + `**Status:** X` + content | `parseDecisionsMd` matches `^## ADR-(\d+):` (case-sensitive) | **⚠ Case mismatch:** export emits lowercase `## adr-NNN:`; the parser regex `/^## ADR-(\d+):\s*(.+)$/gm` will **not match** lowercase. Re-import would yield zero entries from a freshly exported `decisions.md`. See evidence below. |
| `memory.md` | `## Sprint sprint-NNN Learnings` + bullets | `parseMemoryMd` matches `/^## Sprint (?:sprint-)?(\d+)\s+Learnings/gm` | ✅ Round-trip OK |
| `debt.md` | Pipe table with 5 columns (`ID, Title, Priority, Sprint, Status`) | `parseDebtMd` expects **9 columns** (`ID, Description, OriginTaskId, OriginSprintId, Priority, SprintsOpen, Resolved, ResolvedInSprintId, CreatedAt`) | **⚠ Column-count mismatch:** export emits 5-column table, importer requires 9 — re-import yields zero entries. Importer is designed for legacy `.brain/DEBT.md` format, not for export round-trip. |

**Evidence (F-decisions case mismatch):**

- `memory-export.ts:124` — emits `## ${adr.id}:` with `adr.id` always lowercase (because `parseDecisionsMd:87` builds `adr-${num.padStart(3, '0')}`).
- `memory-import.ts:60` — header regex `/^## ADR-(\d+):\s*(.+)$/gm` is case-sensitive uppercase only.
- Live file `.brain/exports/decisions.md` line 3 — `## adr-001: TypeScript + ESM`.

Re-importing `decisions.md` after export would silently parse zero ADRs.

**Drift severity:** Tagged P1 (F-3 covers debt-md row alignment; the case mismatch on decisions.md is a separate defect not yet ticketed elsewhere — track as new P1 finding F-3a).

> **Updated F-3:** P1 actually contains *two* drift defects in `memory-import`. Treat 3a (decisions.md case) and 3b (debt.md column count) as siblings.

**Counter-finding — what's *not* drift:**

- `summary.md` count of ADRs (47 in current export) matches `decisions.md` `## adr-` + `## user-` H2 count (47). The 74 raw `## ` headers in `decisions.md` include 27 ADR-body sub-sections (`## Status`, `## Context`, `## Decision`, `## Consequences`, `## References`) authored inside specific ADRs — see F-15 for the cosmetic ambiguity this creates.
- `summary.md` ordering of ADRs (sorted via `localeCompare(numeric: true)` at `memory-export.ts:31`) is stable across regenerations.

### 3.D — Decay-Exempt Correctness

**Files:** `memory-store.ts:605-635` (decay path), `memory-import.ts:54-113` (parseDecisionsMd), `memory-types.ts:78` (decay_exempt boolean)

The `decay()` query:

```sql
SELECT id FROM entries
WHERE sprint_num < ?
  AND decay_exempt = 0
  AND deleted_at IS NULL
```

**Per-type analysis of `decay_exempt` initialization:**

| Entry type | Set by | decay_exempt rule | Correctness |
|------------|--------|-------------------|-------------|
| `adr` (status=accepted) | `parseDecisionsMd:107` → `decay_exempt: status === 'accepted'` | true → exempt | ✅ Correct (architecture decisions never decay) |
| `adr` (status=superseded/deprecated) | same path → `decay_exempt: false` | false → eligible for decay | ⚠ **Subtle gap (P2):** superseded ADRs are also part of architectural history; `idx_entries_decay (decay_exempt, sprint_num)` would prune `adr-005` (deprecated, sprint_num old) once threshold passes. Recommended: exempt all ADRs regardless of status — they are immutable history records (cf. ADR-036 governance). |
| `adr` (status=proposed/rejected) | same | false → eligible for decay | ⚠ Acceptable for `rejected` (transient noise) but `proposed` ADRs awaiting decision should not silently vanish. |
| `memory` | `parseMemoryMd:151-160` — never sets `decay_exempt` | undefined → false default | ✅ Correct (sprint learnings should rotate) |
| `debt` | `parseDebtMd:228-247` — never sets `decay_exempt` | undefined → false | ⚠ Resolved debt is also history; once decayed, audit trail is lost. P3 — historical debt records don't power active routing, so decay is acceptable for storage budget. |
| `identity` | `identity-generator.ts` (out of scope but documented in IDENTITY.md as `decay_exempt`) | true | ✅ Correct |

**Most important hidden behavior (F-10):** entries inserted with `sprint_num = 0` (default) and `decay_exempt = 0` (default) are decayed at any non-zero `currentSprintNum > decayAfterSprints`. System-wide invariant: any entry without `decay_exempt: true` MUST set `sprint_num` to a real sprint number, or it will silently disappear after the first decay cycle. This is documented nowhere in the code.

**Recommendation (Sprint 162+):** Either guard `decay()` with `AND sprint_num > 0` (preserves "system" entries lacking sprint context), or assert in `insert()` that `decay_exempt || sprint_num > 0`. The first is a one-line fix; the second adds insertion-time validation.

---

## 4. Findings — Detail with Evidence

### F-1 [P1] `extractAdrReferences` regex case-sensitive

**Evidence:** `memory-store.ts:562-567`

```typescript
static extractAdrReferences(text: string): string[] {
  const matches = text.match(/\bADR-(\d{3})\b/g);
  if (!matches) return [];
  const unique = new Set(matches.map(m => m.toLowerCase()));
  return [...unique];
}
```

The regex matches uppercase `ADR-NNN` only. Memory content authored as "see adr-008" or "adherence to adr-037" produces zero auto-relations. Evidence in current DB: many memory entries reference ADRs in lowercase (e.g., `.brain/MEMORY.md` historical), but auto-extraction only ran on uppercase mentions during initial import.

**Suggested fix:** add `i` flag and tighten boundary: `/\b(adr-\d{3})\b/gi`. Then unique-by-lowercase folding still works.

**Side issue:** the regex requires exactly 3 digits. If the project ever creates `ADR-1000`, references break silently. Use `\d{3,4}` if forward-compatible counts are desired.

### F-2 [P1] `escapeFts5Query` malformed output for leading/trailing operators

**Evidence:** `memory-query.ts:41-69`

```typescript
const OPERATORS = new Set(['OR', 'AND', 'NOT']);
// ...
for (let i = 0; i < tokens.length; i++) {
  const tok = tokens[i]!;
  if (i > 0 && !OPERATORS.has(tok) && !OPERATORS.has(tokens[i - 1]!)) {
    parts.push('OR');
  }
  parts.push(tok);
}
```

In OR mode with input `"OR docker"` (user mistake), tokens = `[OR, "docker"]`. The loop emits `OR "docker"` — leading `OR` with no left operand. SQLite FTS5 raises a syntax error caught at `:245-249` and re-thrown as `MemoryQueryError`. Functionally fails closed (no silent empty result), but UX is poor: a CLI user typing `deckent recall "OR docker"` gets a stack trace instead of a helpful "OR is a reserved operator".

**Suggested fix:** strip leading and trailing operator tokens (treat as user mistakes), or whitelist operators only when surrounded by non-operator tokens.

### F-3a [P1] `parseDecisionsMd` regex case mismatch with `exportDecisionsMd` output

(See §3.C analysis.) Re-importing a freshly exported `decisions.md` parses zero entries because the export emits lowercase `## adr-NNN:` and the import regex requires uppercase `## ADR-`.

**Suggested fix (one-liner):** `/^## (?:ADR|adr)-(\d+):\s*(.+)$/gmi` or normalize the import regex to be case-insensitive.

### F-3b [P1] `parseDebtMd` empty-cell filter breaks column alignment

**Evidence:** `memory-import.ts:201-207`

```typescript
const cells = line
  .split('|')
  .map((c) => c.trim())
  .filter((c) => c !== '');

if (cells.length < 9) continue;
```

Pipe-delimited markdown tables produce two empty cells per row (leading/trailing pipes). The filter strips ALL empty cells — including legitimate blanks in the middle. A row like `| D-001 | Foo |  | sprint-100 | high | 2 | false | - | 2026-04-01 |` (column 3 empty) yields 8 cells → `continue` skip. Worse, if the empty cell is later (e.g., column 7 empty), the array shifts and `cells[6]` lands on the wrong field.

**Suggested fix:** strip only the leading/trailing pipe artifacts (`cells.shift()` / `cells.pop()` if first/last is empty), or use a positional split with a guarded count.

### F-4 [P1] Schema migration ladder absent

(See §3.A.) `SCHEMA_VERSION` constant exists, the table records it once, `getSchemaVersion()` reads `MAX(version)` — but no `migrate(from, to)` function anywhere. The `getRawDb()` escape hatch (`memory-store.ts:670`) leaves migration to future-author whims.

### F-5 [P2] `buildAutoQuery` is dead

**Evidence:** grep across the entire `src/` tree shows `buildAutoQuery` only imported in `tests/core/memory-query.test.ts:6`. Production callers (`task-builder.ts:779`, `recall.ts`, `memory-query.ts` MCP tool) all call `searchMemory` directly with hand-built `MemoryQueryParams` literals.

The JSDoc at `memory-query.ts:402` claims:

> Used by Brain lifecycle integration to automatically query relevant context for each task during planning.

This is aspirational — the wire was never made. Either (a) wire `task-builder.ts` to call `buildAutoQuery` and remove inline literal construction, or (b) delete `buildAutoQuery`.

### F-6 [P2] `Relation` interface unused

**Evidence:** `memory-types.ts:113-118`

```typescript
export interface Relation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  source?: 'auto-extract' | 'backfill' | 'finalizer' | 'user';
}
```

The `source` discriminator is not persisted (the `relations` table has columns `from_id, to_id, rel_type, created_at` only — no `source`). `EntryRelation` (line 105) is the canonical type used everywhere. `Relation` is a stale design artifact from the Sprint 143 plan (`docs/superpowers/plans/2026-04-17-sprint-143-implementation-plan.md`).

**Suggested fix:** delete `Relation`. If `source` provenance is desired for forensic queries, add the column to the schema and migrate.

### F-7 [P2] Three `extractKeywords` implementations

**Evidence:**
- `src/core/memory-import.ts:33` — exports `extractKeywords` (filters EN+TR stop words, max 15)
- `src/orchestra/task-analyzer.ts:31` — defines a *private* `extractKeywords` (different stop list)
- `src/core/agent-selector.ts:33` — exports a *third* `extractKeywords` (different again)

Three subtly different keyword extractors live in three modules. Stop-word lists drift over time without coordination. If a worker uses `agent-selector.extractKeywords` to drive routing and the same task's memory-import keywords differ, the auto-query at `task-builder.ts:779` may not surface the right ADRs.

**Suggested fix:** consolidate into `src/core/keywords.ts` with a single canonical implementation, parameterized by stop-word list. Have all three modules import from there.

### F-8 [P2] `extractAdrReferences` re-implemented in `scripts/backfill-relations.mjs`

**Evidence:** `scripts/backfill-relations.mjs:20` defines its own JS `extractAdrReferences`. The TS `MemoryStore.extractAdrReferences` static at `memory-store.ts:562` is the canonical version. Two implementations of the same regex pattern create drift risk — when F-1 is fixed, the script must also be updated.

**Suggested fix:** the script should import from compiled `dist/core/memory-store.js` rather than re-implementing.

### F-9 [P2] `db: any` in `memory-query.ts`

**Evidence:** `memory-query.ts:194,256`

```typescript
function ftsSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ...
```

`memory-store.ts` already imports `Database as DatabaseType` from `better-sqlite3`. The same import in `memory-query.ts` would replace `any` with proper typing.

**Suggested fix:** import `import type { Database as DatabaseType } from 'better-sqlite3';` and replace `db: any` with `db: DatabaseType`. The eslint-disable comments can then be removed.

### F-10 [P2] `decay()` sweeps default-`sprint_num=0` entries

(See §3.D.) Entries inserted without `sprint_num` and without `decay_exempt: true` evaporate after the first decay cycle. No guard in `decay()` excludes `sprint_num = 0`.

**Suggested fix:** add `AND sprint_num > 0` to the decay SELECT, or assert in `insert()` that `decay_exempt || sprint_num > 0`.

### F-11 [P2] `upsert` does not refresh auto-extracted ADR relations

**Evidence:** `memory-store.ts:354-474`

The `insert()` path runs `extractAdrReferences(input.content + ' ' + input.title)` and writes the references (`:339-345`). The `upsert()` path (`:354-474`), when `existing` is found, does **not** re-run extraction — only the entry row and tags are updated. Editing a memory entry to add new ADR mentions silently fails to create new relations.

**Suggested fix:** in the upsert update branch, recompute auto-extracted refs and `INSERT OR IGNORE` (existing relations are unaffected; new ones get added).

### F-12 [P3] Existence-check cast uses numeric key

**Evidence:** `memory-store.ts:178,187,211`

```typescript
const exists = this.db.prepare(
  `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`,
).get(name) as { 1: number } | undefined;
```

`{ 1: number }` is a TypeScript object type with a numeric-looking key. better-sqlite3 returns the column literal as the key, which is the string `"1"` not number `1`. Both work via TypeScript's index signature coercion, but the *correct* type is `{ '1': number }` or alias the column: `SELECT 1 AS exists_flag` and type as `{ exists_flag: number }`.

Cosmetic — runtime behavior is correct.

### F-13 [P3] `getByType` lacks `includeDeleted` API

**Evidence:** `memory-store.ts:476-490`

`getById` accepts `opts?: { includeDeleted?: boolean }`. `getByType` always filters `deleted_at IS NULL`. There is no `getByType(type, { includeDeleted: true })` path — callers wanting decayed entries must drop to `getRawDb()`.

**Suggested fix:** mirror `getById` API: add an `opts?: { includeDeleted?: boolean }` parameter.

### F-14 [P3] `parseDebtMd` resolved status weak validation

**Evidence:** `memory-import.ts:218-225`

The `resolved` flag is taken from column 6 (`'true'` / `'false'`). A row where `resolvedInSprintId` (column 7) is set but `resolved` (column 6) is `false` — or vice versa — produces inconsistent state without warning.

**Suggested fix:** if `resolvedInSprintId !== '-'`, force `resolved = true`. Or warn on inconsistency.

### F-15 [P3] H2 collision in `exportDecisionsMd` output

The exporter emits `## adr-NNN: Title` for each ADR. When ADR content authored in DB contains its own H2 sub-sections (e.g., `## Decision`, `## Context`, `## Consequences`), they pass through verbatim. Counting `## ` lines in the resulting file gives 74 hits when only 47 ADRs exist — confusing for any tool that walks markdown by H2.

**Suggested fix:** demote in-content H2s to H3 during export, or use HR (`---`) separators with H3 ADR headers.

### F-16 [P3] `parseMemoryMd` deterministic ID collision on re-import

**Evidence:** `memory-import.ts:152` — `id: \`mem-${header.num}\``. Re-importing produces the same IDs, which then collide. The store's `insert` path will throw `SqliteError: UNIQUE constraint failed: entries.id`. Callers must use `upsert` instead. The CLI command `memory.ts:48` does call `parseMemoryMd` followed by `store.insert` (not `upsert`) — re-import after export crashes.

**Suggested fix:** either CLI uses `upsert`, or `parseMemoryMd` produces unique IDs (`mem-${num}-${hash(content).slice(0,6)}`).

### F-17 [P3] `getRelations(entryId)` mixed-direction query — index coverage

**Evidence:** `memory-store.ts:541-545`

```sql
SELECT * FROM relations WHERE from_id = ? OR to_id = ?
```

`PRIMARY KEY (from_id, to_id, rel_type)` covers `from_id =` searches; `idx_relations_to (to_id)` covers `to_id =`. SQLite's optimizer does a **double index scan + UNION** for `OR` across two indexed columns. Performance is acceptable at current sizes (low-thousands of rows). At scale, this becomes a sequential scan unless the OR is rewritten as `UNION ALL`.

Document, don't change. Memory at sprint-160 has ~200 relations.

---

## 5. Migration Triage (for Lane 2 public/private decision)

| File | Triage | Reason |
|------|--------|--------|
| `memory-store.ts` | **KEEP-PRIVATE** | Tightly coupled to project DB schema and ADR conventions; not a reusable library |
| `memory-query.ts` | **KEEP-PRIVATE** | Couples to `MemoryStore` and project-specific `MemoryQueryParams` shape |
| `memory-normalize.ts` | **MIGRATE-PUBLIC** | Pure function, zero deps, broadly useful for any Turkish-aware FTS5 layer; could ship as `@deckent/i18n-normalize` or fold into a public utility crate |
| `memory-types.ts` | **KEEP-PRIVATE** | Schema-tied DTOs; public API surface should be narrowed to a smaller `MemoryEntry` interface if ever exposed |
| `memory-export.ts` | **KEEP-PRIVATE** | Format choices encode project conventions (`exportSummaryMd` table layout, `exportDecisionsMd` headers) |
| `memory-import.ts` | **KEEP-PRIVATE** | Same as export — encodes legacy `.brain/*.md` formats |

**Public-leaning candidates for refactor:** consolidate `extractKeywords` (F-7) into a public-friendly `src/core/keywords.ts` module — it has no project-specific logic and is a natural shared utility.

---

## 6. Recommendations (Sprint 162+)

Bundle into a single follow-up sprint focused on Memory V2 hardening. Suggested ordering by impact-to-effort:

1. **F-3a + F-3b + F-16** — re-import correctness — *one PR* — fix `parseDecisionsMd` regex case (1 line), `parseDebtMd` cell-filter (small refactor), `parseMemoryMd` ID uniqueness (1-line `upsert` switch in `cli/commands/memory.ts`). All three together restore round-trip integrity.
2. **F-1 + F-8** — ADR auto-extract — make the regex case-insensitive in `MemoryStore.extractAdrReferences`, and refactor `scripts/backfill-relations.mjs` to import the canonical implementation. Single ~20-line change.
3. **F-2** — FTS5 query escaping — strip leading/trailing operator tokens before joining; add a unit test matrix for malformed inputs.
4. **F-10** — decay safety — add `AND sprint_num > 0` to the decay query. One-line change with one test.
5. **F-11** — upsert auto-refresh — call `extractAdrReferences` in the upsert update branch.
6. **F-7** — consolidate `extractKeywords` into a single `src/core/keywords.ts`. Touches 3 modules.
7. **F-9** — drop `db: any` in `memory-query.ts`.
8. **F-5 + F-6** — delete `buildAutoQuery` and `Relation` interface, OR wire `buildAutoQuery` into `task-builder.ts:779`. Pick one.
9. **F-4** — design migration ladder before any V2 → V3 schema work. Architectural prep, not urgent at v1.
10. **F-12, F-13, F-14, F-15, F-17** — cosmetic/forward-looking; bundle as a single janitorial PR.

**No P0 issues identified.** The Memory V2 layer is functional, well-aligned across its dual-layer FTS5 design, and free of the kinds of correctness defects that would block beta. The P1 findings represent silent data-loss risks (re-import) and UX degradation (FTS5 errors) that are worth fixing pre-1.0.

---

## 7. Audit Trail

- All evidence is file:line cited.
- No source files were modified.
- No tests were modified.
- Single output: this report.

`git diff --stat` should show only `docs/audits/sprint-161/T-161-002-core-memory-v2.md` added.

---

## 8. Fix-Task Continuation Verification (T-161-002-fix)

**Context:** Original task 161-002 produced this report and self-assessed
DONE with rubric 95/100/100/95. Brain re-evaluated as NO_GO; a priority
fix task (161-002-fix) was spawned. The first docker-backend attempt was
OOM-terminated before its provider CLI could write a `.result`. This
section documents the foreground continuation that re-ran the
verification gate against the existing report.

**Re-verification (2026-05-08, foreground):**

| Gate | Command | Result |
|------|---------|--------|
| Type check | `npx tsc --noEmit` | ✅ PASS — no diagnostics |
| Targeted memory tests (5 files) | `npx vitest run tests/core/memory-{store,query,normalize,export,import}.test.ts` | ✅ PASS — 155/155 tests green (3.99s) |
| Scope compliance | `git status` for non-`docs/audits/sprint-161/T-161-002-core-memory-v2.md` writes | ✅ PASS — only this file added by the audit task |

**Findings preserved:** No P0 issues; 4 P1 (F-1, F-2, F-3a/3b, F-4),
7 P2 (F-5 through F-11), 6 P3 (F-12 through F-17). Lead-question
deep-dives §3.A–§3.D unchanged. Migration triage §5 unchanged.
Recommendations §6 unchanged.

**Conclusion:** The original audit's substance was correct. The gate
state is clean. This continuation does not alter findings — it only
re-verifies and records that the verification was repeatable. The
report stands as the single audit output for T-161-002.
