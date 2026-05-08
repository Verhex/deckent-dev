# T-161-010 — `src/core/` Validators & Utilities Audit

**Sprint:** 161 (Lane 1 — God-Level READ-ONLY Self-Audit)
**Task:** 161-010
**Agent:** doc-writer
**Skill:** typescript-expert
**Date:** 2026-05-08
**Mode:** READ-ONLY static audit (no source-code changes)

---

## 1. Scope

Four files audited under `src/core/`. Total **1267 LoC**.

| File | LoC | Concern Domain |
|------|----:|----------------|
| `src/core/validators.ts` | 122 | Path traversal protection, sprint/phase/task ID validation |
| `src/core/utils.ts` | 340 | Debug logging, safe file I/O, sprint ID lifecycle, debt table I/O, DECKENT.md import, i18n date/duration formatters |
| `src/core/sprint-file-retention.ts` | 354 | Hybrid `keep_last_n` + `size_cap_mb` retention for sprint-prefixed files; counter cleanup; forensic file migration |
| `src/core/orphan-cleaner.ts` | 451 | Post-finalize task archival, pre-flight orphan cleanup, IPC dir cleanup with live-PID check |

**Lead questions (per DIRECTIVES):**
1. Path traversal protection — sound surface?
2. Retention config correctness — defaults, bounds, hybrid semantics?

---

## 2. Findings

Severity scale: **P0** (security/correctness must-fix), **P1** (significant defect or large debt), **P2** (correctness drift or hygiene), **P3** (minor / clarity / style).

### 2.1 Security & Path Traversal

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F1 | **P1** | Security boundary — `validatePath` is exported but underutilized | `validatePath()` is the canonical path-traversal guard (`src/core/validators.ts:31`), but it is invoked in **only 4 files** out of 97 that consume a user-supplied `root` parameter. MCP tools `start.ts`, `init.ts`, `cleanup.ts`, `status.ts` accept `root: string` from caller-controlled input but never validate it before joining or reading. ADR-034 (Multi-Project Isolation — Per-Project Security Boundaries) implies path inputs into MCP entry points should be validated. |
| F2 | P2 | Drift — `validatePhase` casing | `validatePhase()` validates by lower-casing both sides, but returns the **caller's original casing** unchanged (`src/core/validators.ts:79-87`). `SprintPhase` enum values are uppercase (`'PLAN' \| 'EXECUTE' \| ...` at `src/core/sprint-types.ts:8-17`). A caller that passes `"execute"` will receive `"execute"` back; downstream `switch (phase) { case SprintPhase.EXECUTE: ... }` will not match. The function should return the canonical (uppercase) form to act as a true sanitizer. |
| F3 | P2 | Subtle correctness — `validatePath` Windows separator | `normalize(resolvedBase + '/')` (`src/core/validators.ts:34`) hard-codes `'/'` — on Windows, `path.normalize` converts to `\\`, but the appended trailing `/` will still appear. `'C:\\foo\\'.startsWith('C:\\foo/')` ≠ true. Cross-platform deployment (CLAUDE.md DECKENT.md lists Windows in `Platform: macOS, Linux, WSL2`, so direct Windows is out-of-scope today, but ADR-001 ESM does not preclude future Windows). Use `path.sep` instead. |
| F4 | P3 | Hygiene — `validateTaskId` inconsistent length check | `TASK_ID_MAX_LENGTH = 100` (line 93) is checked **before** the regex test (line 106) but **after** the empty check (line 103). The null-byte check (line 112) and regex test (line 115) are at the end. Reordering to do regex first would short-circuit faster for clearly-malformed inputs, but functionally correct as is. |
| F5 | P3 | Defense-in-depth — `validateTaskId` regex permits leading/trailing hyphens | `TASK_ID_REGEX = /^[\w-]+$/` (line 92) accepts inputs like `"-foo"` or `"--"`. Not a security issue (the regex prevents path traversal characters), but `--` could collide with CLI flag parsing if a task ID is interpolated unsanitized into a shell argv list. ADR-006 spawnSync security pattern uses `argv` arrays so this is mitigated by current architecture. |

### 2.2 Dead Code & Disposition

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F6 | **P1** | Dead code (unused exports) — `cleanOrphanIpcDirsLegacy` | The legacy async API `cleanOrphanIpcDirsLegacy()` (`src/core/orphan-cleaner.ts:306`) is `@deprecated` and exported, but **has zero callers** anywhere in `src/`. Only the synchronous `cleanOrphanIpcDirs()` is wired into `start.ts`, `recover.ts` (CLI + MCP). ADR-038 (Dead Code Disposition — Sprint 139 Audit Results) mandates removal of confirmed dead exports. |
| F7 | **P1** | ADR-009 conflict — `parseDebtTable` / `generateDebtTable` deprecated yet live | Both functions in `src/core/utils.ts:205, 241` are JSDoc-`@deprecated` ("Memory V2 stores debt in SQLite DB. Kept for V1 fallback and migration") **and still actively used** by 6 modules: `src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-finalizer.ts`, `src/cli/commands/archive-debt.ts`, `src/core/adr-seed.ts`, `src/core/index.ts`. Memory V2 is the documented single source of truth (DECKENT.md "Memory V2 — DB-First Architecture"). Keeping a deprecated path live without a migration deadline is debt that contradicts ADR-009 (DEBT.md format mandates timeboxed resolution). |

### 2.3 Retention Config Correctness

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F8 | P2 | Retention semantics — hybrid bounds not validated | `enforceRetention()` (`src/core/sprint-file-retention.ts:223-316`) accepts `Partial<SprintFileRetentionConfig>`. There is **no validation** that `keep_last_n >= 0`, `size_cap_mb > 0`, or `archive_path` is non-empty / not equal to `'.deckent/'` (which would cause infinite recursion if archive_path is inside the scanned dir). A caller passing `keep_last_n: -1` would cause `slice(0, sprintIds.length - (-1))` = `slice(0, n+1)`, archiving everything plus an extra phantom slot (no actual error, but unintended). |
| F9 | P2 | Retention semantics — size cap loop opacity | The size-cap loop at `src/core/sprint-file-retention.ts:269-275` mutates `archiveSet` while iterating a copy of `keptIds`. The function works because `totalSize -= sprintSize` happens with each `archiveSet.add`, but the loop reads `grouped[id]` without removing from `keptFiles` — relies on `archiveSet` set-membership for the final `result.kept` filter at line 313. This is correct but easy to break in future edits; a clearer pattern would compute `archiveSet` once, then do all I/O. |
| F10 | P3 | Drift — DEFAULT_RETENTION_CONFIG vs config-types comments | `DEFAULT_RETENTION_CONFIG` (`src/core/sprint-file-retention.ts:25-29`): `keep_last_n: 10`, `size_cap_mb: 500`. `config-types.ts:434-438` comments say "default: 10" and "default: 500". These are aligned now, but defaults are duplicated in two places. If the source of truth changes, drift is likely. Recommendation: import the constant in the comment via JSDoc `@default` linking, or have one canonical declaration. |
| F11 | P3 | Cross-device fallback — stale fileSize race | At `src/core/sprint-file-retention.ts:296-307`, the cross-device fallback re-calls `statSync(srcPath).size` **after** the failed `renameSync`. If the file was unlinked between the rename failure and the size read, this re-throws and the file is silently lost (best-effort comment). Low probability but worth a `try/catch` guard. |

### 2.4 Orphan Cleaner Correctness

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F12 | P2 | Drift — `extractSprintNumber` does NOT pad | `extractSprintNumber()` (`src/core/orphan-cleaner.ts:56`) returns the raw digits matched by `sprint-(\d+)`. For `"sprint-9"`, it returns `"9"`, then `prefix = "task-9-"`. If actual task files are named `task-009-001.json` (zero-padded), the prefix won't match. **Today this is benign** because `getNextSprintId` (`src/core/utils.ts:140`) always pads to 3 digits, and DIRECTIVES uses `sprint-NNN` (e.g. `sprint-161`). But the function is permissive on input and will silently miss files if a non-padded sprint ID ever leaks in. |
| F13 | P2 | Regex clarity — `TASK_FILE_RE` redundant alternation | `TASK_FILE_RE = /\.(json\|result\|hb\|plan\|log\|timeout\|verify-delta\.json)$/` (`src/core/orphan-cleaner.ts:33`). The `verify-delta\.json` alternation requires a leading `.` from the `\.` anchor PLUS an internal `.` from the `\.` inside the group. For input `task-001.verify-delta.json`, the regex matches via backtracking. Functionally correct, but the structure is confusing and an unwitting developer might think `verify-delta.json` already includes its leading dot. Suggest split: `/\.(?:json\|result\|hb\|plan\|log\|timeout)$\|\.verify-delta\.json$/` or use separate matchers. |
| F14 | P2 | Race window — `cleanOrphanIpcDirs` `mtime` vs `mtimeMs` correctness | At `src/core/orphan-cleaner.ts:384-388, 410-415`, `statSync(...).mtimeMs` is used for age guard (default 30 s). If system clock is skewed (NTP correction during sprint) or the dir was created on another machine, `mtimeMs` may be in the future, making `now - stat.mtimeMs` negative; `Math.max(0, ...)` clamps it correctly so the dir is never preserved by a future-mtime quirk. Defensively sound. ✓ |
| F15 | P3 | Inconsistency — `cleanOrphanIpcDirs` does NOT respect `checkLivePid: false` | The function signature accepts `checkLivePid: boolean`, but if `checkLivePid: false`, the live-PID branch (`src/core/orphan-cleaner.ts:397-432`) is skipped entirely. Result: dirs **with** a `config.json` are **preserved** (no deletion path). The function silently no-ops for those entries. Either document this or add an "unconditional remove" branch when `checkLivePid: false`. |
| F16 | P3 | Inconsistency — `postFinalizeCleanup` always groups but only archives if `allFiles.length > 0` | At `src/core/orphan-cleaner.ts:114`, the branch is taken when ANY task file exists, but stale-lock cleanup (`clearStaleLocks`) at line 157 runs **always** (correct). Slight readability gain by hoisting `taskGroups` and the loop unconditionally so dead branches are obvious. |
| F17 | P3 | Mixed I/O paradigm — sync + async APIs in same module | `cleanOrphanIpcDirsLegacy()` is `async` using `fsPromises`, while `cleanOrphanIpcDirs()` is sync using `readdirSync`/`existsSync`. With F6 (legacy is dead), this collapses to "sync-only" — but documenting the choice in the file header would help future maintainers. ADR-005 (Synchronous I/O) is `deprecated` per `.brain/exports/summary.md`, so net direction should be async over time. |

### 2.5 Utils.ts — God Module Concerns

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F18 | **P1** | ADR-026 (god-object split) not applied | `src/core/utils.ts` mixes **6 unrelated concerns**: (a) debug logging + ERRORS.md persistence (lines 14-52), (b) safe file I/O wrappers (lines 64-102), (c) sprint ID lifecycle (lines 110-175), (d) DEBT.md table parse/serialize (lines 205-247), (e) DECKENT.md import management (lines 256-266), (f) i18n date/duration formatters (lines 270-340). **750 occurrences across 97 files** depend on this module — splitting it requires a coordinated migration. Sprint 076 (ADR-026) split god objects to faz 1-3 but did not touch `utils.ts`. |
| F19 | P2 | Race — `appendToErrorsFile` read-then-write | `appendToErrorsFile()` (`src/core/utils.ts:29-52`) does `appendFileSync` + then `readFileSync` + `writeFileSync` to trim. Two concurrent workers writing the same `.brain/ERRORS.md` could interleave such that line trimming loses entries. Marked "Non-fatal" — acceptable, but document the design intent. |
| F20 | P2 | Atomicity — `updateLastSprintId` non-atomic write | `writeFileSync(configPath, JSON.stringify(...))` (`src/core/utils.ts:164`) is **not atomic**. SIGKILL during write corrupts `.deckent/config.json`. Subsequent `readJsonSafe` returns null → `updateLastSprintId` returns early "to preserve settings" (line 156-158) — but the file is already corrupted on disk by then. ADR-006 spawnSync security recommends pattern; an `atomicWriteFileSync` helper (Sprint 139 Docker HB Core Fix introduced one) should be used here. |
| F21 | P2 | Drift — `shouldRemoveResolvedDebt` legacy semantics surprising | `src/core/utils.ts:186-195`. Behavior: `resolved && resolvedInSprintId === undefined` → **immediately remove** ("legacy → remove"). If a developer marks an entry as resolved but forgets to set `resolvedInSprintId`, the entry is decayed at the very next sprint with no buffer. Comments call this "legacy" but the field is required for current entries — should this be an assertion error instead? At minimum, `debugLog` the removal. |
| F22 | P3 | Hardcoded i18n — only `en` and `tr` | `DATE_LOCALES` (`src/core/utils.ts:270-273`) and `DURATION_UNITS` (lines 288-293) hardcode 2 languages. ADR-032 (i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği) mandates this scope, so it is **compliant**. Flagged only because adding `de` (mentioned in `memory-normalize.ts` Turkish-normalize covering TR/EN/DE %100) would be cross-cutting. |
| F23 | P3 | Type safety — `as` casts | `JSON.parse(...) as T` (lines 81, 97) — caller-supplied generic T is unverified. The comment "validation is deferred to caller; null returned on parse failure" is correct but the `as` cast is a TypeScript blind-spot. ADR-001 (TypeScript + ESM) does not forbid generic `as`, and `unknown` would push validation to every caller — the current trade-off is reasonable for a "safe" wrapper. |

### 2.6 Type Safety, ADR Compliance, Other Hygiene

| ID | Severity | Dimension | Summary |
|----|:-:|:--|--|
| F24 | ✓ | ADR-001/002 (TypeScript + ESM, Node16) | All 4 files use `.js` extensions in imports (e.g. `'./sprint-types.js'`, `'./constants.js'`, `'./file-lock.js'`). **Compliant.** |
| F25 | ✓ | ADR-008 (Brain merkezi import — tek yönlü bağımlılık) | `validators.ts` imports only `node:path` and `./sprint-types.js`; `utils.ts` imports only `./constants.js`, `./types.js`, and `node:fs`; `sprint-file-retention.ts` imports only `./config-types.js`; `orphan-cleaner.ts` imports `./constants.js`, `./file-lock.js`, `./utils.js`. **No upward imports** from orchestra/agents/cli. **Compliant.** |
| F26 | P3 | Dependency hygiene — `orphan-cleaner.ts` mixes sync `node:fs` and async `node:fs/promises` | `import { ... } from 'node:fs'` for sync APIs **and** `import { promises as fsPromises } from 'node:fs'` for async (lines 11-15). The async-using function is `cleanOrphanIpcDirsLegacy` (F6, dead). After dead-code removal, drop the async import. |
| F27 | ✓ | ADR-006/007 (spawnSync security pattern, SpawnOptions) | None of the 4 files invoke `spawn`/`exec`. ADR not directly applicable. **Compliant by absence.** |
| F28 | ✓ | ADR-009 (DEBT.md markdown table format) | `parseDebtTable`/`generateDebtTable` (`src/core/utils.ts:205, 241`) implement the 9-column format documented in ADR-009. Header constant comes from `./constants.js`. **Compliant** (deprecation per F7 separate concern). |
| F29 | P3 | Documentation — `validators.ts` lacks module header | `src/core/validators.ts:1-3` has a 3-line file header but no `@module` JSDoc tag, while `sprint-file-retention.ts:1-13` has a proper module header with `@since`. Minor inconsistency. |
| F30 | ✓ | No `// @ts-ignore` / `// @ts-expect-error` / `any` usage in the 4 files | Verified via inspection. typescript-expert skill compliance: ✓ |

---

## 3. Evidence (file:line)

### Path Traversal Surface
- `src/core/validators.ts:31` — `validatePath(base, userPath)` definition.
- `src/core/validators.ts:34` — `normalize(resolvedBase + '/')` hard-coded forward-slash (F3).
- `src/mcp/tools/docs.ts:69, 110, 130` — only MCP tool that calls `validatePath`.
- `src/mcp/tools/checkpoint.ts:56` — calls validatePath on a derived (not user-supplied) filename.
- `src/orchestra/tmux.ts` (referenced in ToolSearch grep) — calls validatePath for sprint helper paths.
- `src/orchestra/decision-logger.ts:75` — uses validatePath for decision file path.
- `src/mcp/tools/init.ts:28-44` — `generateToolsContent(root: string)` and `appendToGitignore(root, ...)` consume `root` directly without `validatePath`.
- `src/mcp/tools/start.ts:10, 59` — imports `cleanOrphanIpcDirs` and uses `root` argument; no `validatePath`.

### Phase Casing Drift
- `src/core/validators.ts:70` — `VALID_PHASES = new Set(Object.values(SprintPhase).map(v => v.toLowerCase()))`
- `src/core/validators.ts:79-87` — return value preserves original casing.
- `src/core/sprint-types.ts:7-18` — `SprintPhase` enum (uppercase canonical values).

### Dead Code
- `src/core/orphan-cleaner.ts:306` — `cleanOrphanIpcDirsLegacy` `@deprecated`.
- Cross-grep: only callers found are within the file itself (no external imports of `cleanOrphanIpcDirsLegacy`).

### Deprecated-but-live Debt I/O
- `src/core/utils.ts:201-203, 237-239` — JSDoc `@deprecated` annotations.
- `src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-finalizer.ts`, `src/cli/commands/archive-debt.ts`, `src/core/adr-seed.ts`, `src/core/index.ts` — call sites still active.

### Retention Config
- `src/core/sprint-file-retention.ts:25-29` — `DEFAULT_RETENTION_CONFIG`.
- `src/core/sprint-file-retention.ts:223-316` — `enforceRetention` body with hybrid policy.
- `src/core/sprint-file-retention.ts:269-275` — opaque size-cap loop.
- `src/core/config-types.ts:430-440` — `SprintFileRetentionConfig` interface (defaults documented twice).

### Atomicity Gap
- `src/core/utils.ts:147-166` — `updateLastSprintId` write path.

### Orphan Regex Concerns
- `src/core/orphan-cleaner.ts:33` — `TASK_FILE_RE` mixed alternation.
- `src/core/orphan-cleaner.ts:56-59` — `extractSprintNumber` no-pad.
- `src/core/orphan-cleaner.ts:75-78` — `sprintNumberFromFilename` no-pad (consistent peer).

### IPC Cleanup PID Check
- `src/core/orphan-cleaner.ts:352-435` — `cleanOrphanIpcDirs` body.
- `src/core/orphan-cleaner.ts:442-451` — `isPidAlive` helper (correct ESRCH/EPERM split).
- Callers: `src/cli/commands/recover.ts:78`, `src/mcp/tools/start.ts:59`, `src/mcp/tools/recover.ts:87`.

### Test Coverage (sanity check, not exhaustive)
- `tests/core/validators.test.ts` — exists.
- `tests/core/utils-debug.test.ts`, `tests/core/utils-sprint-id.test.ts`, `tests/core/utils-io.test.ts`, `tests/core/utils-debug-logging.test.ts`, `tests/core/utils-decay.test.ts`, `tests/core/utils-deckent.test.ts` — utils split into 6 test files mirrors the 6 concerns identified in F18 (god module). Test split confirms the implicit module split waiting to happen.
- `tests/core/sprint-file-retention.test.ts` — exists.
- `tests/core/orphan-cleaner.test.ts`, `tests/core/orphan-cleaner-ipc.test.ts` — exists.

---

## 4. Migration Triage (per file)

| File | Classification | Rationale |
|------|:-:|--|
| `src/core/validators.ts` | **KEEP-PRIVATE** | Internal sanitizer. Not part of public API surface (deckent CLI/MCP). Improvements (F1, F2, F3) are internal hardening. Should remain in the deckent runtime. |
| `src/core/utils.ts` | **MIGRATE-PUBLIC** *(partial)* | Two faces. **i18n date/duration formatters** (lines 268-340) and **`getNextSprintId` / `parseSprintNumber`** are user-facing primitives a `deckent-sdk` consumer might want — candidates for `MIGRATE-PUBLIC`. **`appendToErrorsFile`, `ensureDeckentImport`, `parseDebtTable`/`generateDebtTable`** are internal — `KEEP-PRIVATE`. The whole module needs F18 split before triage can be definitive. |
| `src/core/sprint-file-retention.ts` | **KEEP-PRIVATE** | Pure runtime concern (file system house-keeping). Public consumers don't operate `.deckent/` directly. |
| `src/core/orphan-cleaner.ts` | **KEEP-PRIVATE** *(after F6 deletion)* | Runtime concern. `cleanOrphanIpcDirsLegacy` is **DELETE-CANDIDATE** (F6). Rest stays private. |

---

## 5. Recommendations (Sprint 162+ work — NOT a code change in this sprint)

Listed from highest impact to lowest, mapped to findings.

### P0 (none found)

### P1 — Should be Sprint 162 priority

1. **R1 (F1) — Audit MCP `root` validation surface and backfill `validatePath`.**
   Inventory: `src/mcp/tools/{init, start, status, kill, cleanup, run, plan, set_directives, history, retro, doctor, ...}.ts` — every tool that accepts `root` but does not call `validatePath(processCwd, root)` (or equivalent). Decide: (a) validate at every entry point, or (b) introduce a single `resolveProjectRoot(input): string` helper that all tools route through. ADR-034 implies (b).
2. **R2 (F6) — Delete `cleanOrphanIpcDirsLegacy`.**
   No callers. ADR-038 (Dead Code Disposition) compliance. Single-line export removal + JSDoc cleanup. Drop the `node:fs/promises` import (F26).
3. **R3 (F7) — Migrate the 6 callers of `parseDebtTable` / `generateDebtTable` to Memory V2 SQLite, then delete the deprecated functions.**
   Callers: `sprint-phases.ts`, `sprint-finalizer.ts`, `archive-debt.ts`, `adr-seed.ts`, `core/index.ts`. Memory V2 (`memory-store.ts`, `memory-types.ts`) already supports `type: 'debt'` entries. The .md export is auto-generated via `memory-export.ts`. Hard cut-over reduces drift risk.
4. **R4 (F18) — Split `utils.ts` into 6 focused modules** (mirror existing test-file split):
   - `core/error-log.ts` — `debugLog`, `appendToErrorsFile`
   - `core/safe-fs.ts` — `readFileSafe`, `readJsonSafe`, `readJsonSafeAsync`
   - `core/sprint-id.ts` — `getNextSprintId`, `updateLastSprintId`, `parseSprintNumber`
   - `core/debt-table.ts` *(legacy, gated for deletion per R3)*
   - `core/deckent-import.ts` — `ensureDeckentImport`
   - `core/i18n.ts` — `formatDate`, `formatDuration`, `formatRelativeTime`
   Replace `utils.ts` with a re-export shim during transition to avoid breaking the 97 callers.

### P2 — Defensive hardening

5. **R5 (F2) — `validatePhase` returns canonical case.**
   Change return to canonical uppercase form: `return SprintPhase[phase.toUpperCase() as keyof typeof SprintPhase];` (with type narrowing). Removes downstream switch-case mismatch risk.
6. **R6 (F3) — Use `path.sep` in `validatePath`.**
   `normalize(resolvedBase + path.sep)` for Windows correctness.
7. **R7 (F8) — Validate retention config bounds.**
   Add a small `validateRetentionConfig(cfg)` that asserts `keep_last_n >= 0`, `size_cap_mb > 0`, `archive_path` is non-empty and not a parent of `.deckent/`.
8. **R8 (F20) — Use atomic write in `updateLastSprintId`.**
   Sprint 139 introduced `atomicWriteFileSync`. Apply here. Same fix should propagate to other config writers — separate audit.
9. **R9 (F21) — `shouldRemoveResolvedDebt` legacy branch should warn.**
   Add `debugLog('shouldRemoveResolvedDebt', 'legacy entry without resolvedInSprintId — removing')` so unintended decay is visible in `.brain/ERRORS.md`.
10. **R10 (F12, F13) — Standardize sprint number padding & simplify `TASK_FILE_RE`.**
    Either always pad sprint number on extraction, or assert padded form. Split `TASK_FILE_RE` for clarity.

### P3 — Hygiene polish

11. **R11 (F4, F5, F15, F16, F17, F22, F23, F26, F29)** — Polish items, low risk, batch under a single doc-style cleanup task. None are correctness defects.

### Cross-cutting

12. **R12** — Add a `deckent doctor` check that scans MCP tool entry points for `root: string` parameters and verifies they pass through `resolveProjectRoot()` (R1 helper). Prevents regression.
13. **R13** — Once F18 split lands, audit `utils.ts` re-export shim usage and remove it after a deprecation cycle.

---

## Summary

- **0** P0 findings (no critical security or correctness defects).
- **4** P1 findings — `validatePath` underutilized (F1), `cleanOrphanIpcDirsLegacy` dead (F6), deprecated debt-table I/O still live (F7), `utils.ts` god module (F18).
- **11** P2 findings — defensive hardening, retention bounds, atomicity, cross-platform paths, semantic drift.
- **15** P3 findings — clarity, regex structure, JSDoc consistency, deferred i18n extension, hygiene.
- **6** ADR-positive observations (compliant with ADR-001/002/006/007/008/009).

**Net assessment:** the four files are **functionally sound today**. Path-traversal protection exists but is not consistently invoked at MCP entry points (F1) — this is the single biggest security-hygiene gap. `utils.ts` is the largest refactor candidate (F18) and its mirror test-file split shows the team has already tacitly identified the boundaries. `parseDebtTable`/`generateDebtTable` (F7) and `cleanOrphanIpcDirsLegacy` (F6) are concrete ADR-038 dead-code candidates ready for Sprint 162.

— end of report —
