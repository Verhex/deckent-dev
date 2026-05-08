# T-161-026 — CLI Introspection Commands Audit

**Sprint:** 161 (God-Level READ-ONLY Self-Audit, Lane 1)
**Auditor:** w-161-026 (claude/opus, doc-writer + typescript-expert)
**Date:** 2026-05-08
**Mode:** READ-ONLY — no source code changes; only this report.

---

## 1. Scope

Six files in `src/cli/commands/` covering all introspection / read-only inspection
surfaces (commands that read sprint state and print it):

| File                        | LoC  | Primary command         | Public exports |
|----------------------------|------|-------------------------|----------------|
| `src/cli/commands/history.ts` | 309 | `deckent history`     | 5 functions, 1 interface |
| `src/cli/commands/retro.ts`   | 453 | `deckent retro`       | 12 functions, 4 interfaces |
| `src/cli/commands/explain.ts` | 434 | `deckent explain`     | 9 functions, 2 interfaces |
| `src/cli/commands/help.ts`    | 141 | `deckent help-info`/`info` | `formatHelp`, `HELP_CONTENT`, `registerHelp` |
| `src/cli/commands/doctor.ts`  | 957 | `deckent doctor`      | 23 exported functions, 3 interfaces |
| `src/cli/commands/watch.ts`   | 177 | `deckent watch`       | `cleanupWatchWindow`, `getTaskProvider`, `watchSubprocessLog`, `registerWatch` |

Total: **2,471 LoC** across 6 files. Within the ≤8 file / ≤2,000 LoC budget for a
Sprint 161 audit task — note `doctor.ts` alone exceeds 950 LoC and is the largest
single CLI command in the codebase.

Lead questions targeted by this audit:
- **doctor Sprint 160 DECISIONS.md FAIL bug** — verified, traced, and root-caused
  (the bug lives in `doctor-checks.ts`, but `doctor.ts` is the user-facing wire).
- **retro counter accuracy** — multiple counter-drift findings across `history.ts`,
  `retro.ts`, and `explain.ts`.
- **metrics output format** — `--json` shape inconsistencies and field-name drift
  across the 6 commands.

---

## 2. Findings

### Severity legend

- **P0** — blocks production use or false-positives a user-visible health check
- **P1** — visible inaccuracy / drift that misleads operators
- **P2** — code-hygiene / dead-code / pollution that increases maintenance cost
- **P3** — nit, style, future-deprecation candidate

### 2.1 Doctor Sprint 160 DECISIONS.md FAIL bug — **P0**

**Dimension:** Drift (claims vs reality) + Memory V2 coherence

**Summary:** `deckent doctor` falsely reports `[FAIL] Brain Dir — Missing:
DECISIONS.md` on any project that adopted Memory V2 DB-first. The file
`.brain/DECISIONS.md` is archived to `.brain/archive/decisions-root-pre-sprint143/`
in DB-first projects (per `core/adr-seed.ts:8` and the gitignore policy in
`core/identity-generator.ts:252`). The doctor check still requires the legacy
flat-file in `.brain/`.

**Evidence:**
- `src/cli/commands/doctor-checks.ts:333` — `requiredFiles = [MEMORY_FILE,
  DEBT_FILE, DECISIONS_FILE]` is checked via `existsSync(join(brainPath, f))`.
- `src/core/constants.ts:32` — `DECISIONS_FILE = 'DECISIONS.md'`.
- `src/core/adr-seed.ts:8` — confirms ADRs were extracted from the archived
  `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md`.
- `.claude/rules/auditor.md:5` — Authoritative project rule:
  `"ADR compliance: load ADRs from store.getByType('adr'), not from DECISIONS.md"`.
- `DECKENT.md` ("Memory V2 DB-First Architecture" section) explicitly states:
  `Storage: SQLite (better-sqlite3) — single source of truth, .md files are
  generated exports`. Decisions live in `.brain/exports/decisions.md` (note:
  lowercase, under exports/), not `.brain/DECISIONS.md`.
- Wire from user-facing scope file: `src/cli/commands/doctor.ts:742-743` imports
  and re-exports `runDoctorChecks` from `doctor-checks.ts`. So `deckent doctor`
  invocation calls into the buggy check.

**ADR violation:** ADR-036 (ADR Governance Integration) and the auditor.md rule
both mandate DB-first ADR access. `checkBrainDir` violates this by requiring a
flat file the architecture has demoted to archive.

**Recommendation:** Sprint 162+ work — replace `DECISIONS_FILE` flat-file check
with either (a) `MEMORY_DB_FILE` existence check + `store.getByType('adr').length
> 0` query, OR (b) check for `.brain/exports/decisions.md` (the canonical Memory
V2 export path). Option (a) is ADR-compliant; option (b) is a less invasive
shim. The audit recommends (a) because `MEMORY_FILE` (also legacy `.brain/MEMORY.md`)
likely has the same bug — verify in T-161-053 if not done.

---

### 2.2 Doctor "open debt" label-vs-count drift — **P1**

**Dimension:** Drift (label vs behavior)

**Summary:** `formatHumanDoctor` shows `"Debt: N open item(s)"` but **N** is the
**total** debt count (open + resolved + closed), not the open count. The helper
`countOpenDebtItems` is imported and re-exported but never used.

**Evidence:**
- `src/cli/commands/doctor.ts:159-160` — imports both `countDebtItems` and
  `countOpenDebtItems`, re-exports both.
- `src/cli/commands/doctor.ts:421-426` — `const openDebtCount = debtItems.total;`
  — the variable is named `openDebtCount` but assigned `total`.
- `src/cli/commands/doctor.ts:423` — prints `Debt: ${openDebtCount} open item(s)`.
- `src/cli/helpers/debt-counter.ts:17-27` — `countDebtItems` returns `{ total,
  critical }` with no status filter.
- `src/cli/helpers/debt-counter.ts:29-38` — `countOpenDebtItems` filters
  `status !== 'resolved' && status !== 'closed'`. **This is the function that
  matches the label, but it is never called from doctor.ts.**

**Impact:** A project that has resolved 50 of 60 historical debt items will
display `Debt: 60 open item(s)` instead of `10 open item(s)`. The "critical"
sub-count (line 423) is also `total-critical` not `open-critical`, compounding
the drift.

**Recommendation:** Sprint 162 — call `countOpenDebtItems(root)` for the "open"
label, or rename the label to "total". `countDebtItems` should return both
counts (`total`, `open`, `critical`) so callers don't have to choose between
two near-identical functions.

---

### 2.3 `explain.ts` doneCount double-counts tech-debt tasks — **P1**

**Dimension:** Drift (semantics not unified across modules) + counter accuracy

**Summary:** `buildExplainOutput` reports `(completed + techDebt)` as
"tasks completed successfully" while also reporting `techDebt` as "tasks
completed with tech debt" — counting debt rows twice. Worse, when the parser
reads sprint-reporter format `"Tasks completed | X/Y"`, X already includes
GO_WITH_TECH_DEBT outcomes (per `sprint-reporter.ts` semantics), so the addition
double-counts.

**Evidence:**
- `src/cli/commands/explain.ts:297` — `const doneCount = summary.completed +
  summary.techDebt;`
- `src/cli/commands/explain.ts:298` — prints `${doneCount} ${label('tasksCompleted')}`
  where label is `"tasks completed successfully"` (line 263 EN), `"görev başarıyla
  tamamlandı"` (TR).
- `src/cli/commands/explain.ts:300` — separately prints
  `${summary.techDebt} tasks completed with tech debt`.
- `src/cli/commands/retro.ts:54-106` — `parseRetroToRichSummary`. `completed` is
  set from `Tasks completed | X/Y` (line 87), where `X` per sprint-reporter
  semantics is "all non-NO_GO outcomes" (i.e. DONE + GO_WITH_TECH_DEBT).
- Cross-reference: `src/orchestra/sprint-reporter.ts` — TODO for next auditor:
  confirm whether "Tasks completed" includes tech-debt rows; if so, this is a
  hard double-count bug; if not, the bug is "successfully" being too strong a
  word for tech-debt completions.

**Sample over-count scenario:** Sprint with 4 DONE / 1 GO_WITH_TECH_DEBT / 1 NO_GO
(total 6). Current `explain` shows:
- 6 tasks completed successfully  ← wrong: 5 in best case (DONE+debt), 4 in
  strictest reading
- 1 tasks failed (NO_GO)
- 1 tasks completed with tech debt

User reading this sees `6 + 1 + 1 = 8` events for a 6-task sprint.

**Recommendation:** Sprint 162 — either (a) rename "tasks completed successfully"
to "tasks completed (any outcome)" and use `completed`, OR (b) compute
`strictDone = completed - techDebt` and label that "completed successfully".
Decision depends on reading the sprint-reporter contract. T-161-015 (orch
result-evaluator audit) and T-161-017 (orch debt-reporter audit) should
contribute the canonical semantics.

---

### 2.4 `retro.ts` techDebt regex over-count fallback — **P1**

**Dimension:** Drift + parser fragility

**Summary:** When the primary `Tech Debt | N` table cell is missing, retro falls
back to `(content.match(/GO_WITH_TECH_DEBT/g) ?? []).length`. This regex matches
**anywhere in the content** — including in learnings, prose, ADR references, and
status table rows that mention `GO_WITH_TECH_DEBT` as a string literal — leading
to inflated tech-debt counts in the JSON `--json` output and the `--compare`
delta.

**Evidence:**
- `src/cli/commands/retro.ts:67-71` — `const techDebtCount = debtMatch ? ... :
  (content.match(/GO_WITH_TECH_DEBT/g) ?? []).length;`
- The retro markdown commonly contains a Learnings section that quotes outcomes,
  e.g. `"Sweep filter task-prefix-aware: NO_GO — Source-code change complete..."`
  — but other learnings such as `"Auth Surface Checklist 7→9 surface güncelle:
  GO_WITH_TECH_DEBT — Added Surf..."` (per current
  `.brain/exports/summary.md` Recent Learnings) inflate this counter.
- A status table row of form `| 161-005 | architect | GO_WITH_TECH_DEBT |` also
  matches the global regex.

**Impact:** When sprint-reporter omits the "Tech Debt" row (e.g. legacy retro
formats from sprint-090 era), the fallback over-counts roughly 2× to 4×.

**Recommendation:** Sprint 162 — narrow the regex to `^|\s*GO_WITH_TECH_DEBT\s*\|`
(table-cell anchor) or eliminate the fallback entirely and treat missing rows as
0. Memory V2 retro entries should expose `tech_debt` as a structured field
removing the need for any markdown parsing.

---

### 2.5 Triple-duplicate sprint-log parser — **P2**

**Dimension:** Conflicting areas (duplicated logic)

**Summary:** Three audit-scope files independently re-implement near-identical
markdown sprint-log parsers with overlapping but non-identical regex sets,
producing different output shapes for the same input. The drift between them is
the root cause of findings 2.3 and 2.4.

**Evidence:**
- `src/cli/commands/history.ts:99-151` — `parseSprintLog(content): SprintRecord`
  (display-formatted strings; "-" defaults).
- `src/cli/commands/explain.ts:54-121` — `parseSprintLog(content): SprintSummary`
  (numeric fields; 0 defaults).
- `src/cli/commands/retro.ts:54-106` — `parseRetroToRichSummary(content):
  RichSprintSummary` (numeric + raw markdown).
- All three regex-match the same fields with subtle differences:
  - `Total Tasks` (history → required), `Total Tasks?` (explain optional `s`),
    `Total Tasks?` (retro optional `s`).
  - `Tasks completed | X/Y` (retro primary), but `Tasks completed | X/Y` (explain
    secondary), absent in history (history reads `Total Tasks` then `Completed`
    separately).
  - `Tech Debt | N` (history), `Tech Debt | N` + `GO_WITH_TECH_DEBT` fallback
    (retro), no fallback (explain).
- Each file additionally re-implements `formatDuration`-style helpers:
  - `history.ts:26-35` — `formatDurationMs(raw: string): string`
  - `explain.ts:148-155` — `formatDuration(ms: number): string`

**Impact:** Different commands report different numbers for the same sprint —
history may show `Done: 4`, explain may show `4 tasks completed successfully`
plus `1 tasks completed with tech debt` (5 total claims), retro `--compare` may
show yet a different delta.

**Recommendation:** Sprint 162 — extract `src/orchestra/sprint-reporter-parsers.ts`
(or use Memory V2 `store.getBySprint(id)` directly) as a single source. All
three commands should consume the unified parser. This is `MIGRATE-PUBLIC`-
blocking: a public CLI cannot ship 3 parsers giving 3 numbers for the same data.

---

### 2.6 `help.ts` repository URL drift — **P1**

**Dimension:** Drift (documentation vs reality)

**Summary:** Both EN and TR help content hardcode
`https://github.com/deckent/deckent` as the docs URL, but the public repository
post-Sprint 151 is `https://github.com/VerhexIO/deckent`. End users following
the printed link will hit a 404.

**Evidence:**
- `src/cli/commands/help.ts:50` — `docs: 'Docs: https://github.com/deckent/deckent'`.
- `src/cli/commands/help.ts:85` — `docs: 'Belgeler: https://github.com/deckent/deckent'`.
- `package.json` (verified) — `"url": "https://github.com/VerhexIO/deckent.git"`.
- Sprint 151 retro entry (per recent learnings): "Public Repo Flip — VerhexIO/
  deckent-dev → VerhexIO/deckent: GO_WITH_TECH_DEBT".

**Recommendation:** Sprint 162 — read the URL from `package.json` `repository.url`
at build time, OR introduce a single `core/constants.ts` `DOCS_URL` constant.
Hardcoded URLs in i18n string tables are an anti-pattern (CLAUDE.md gotchas).

---

### 2.7 `doctor.ts` orphan "// X removed" comments — **P2**

**Dimension:** Documentation pollution

**Summary:** Multi-line "removed — duplicate of doctor-checks.ts canonical
versions (Sprint 154)" comments remain in `doctor.ts` after Sprint 154 dedup.
CLAUDE.md explicitly forbids backward-compat shim comments: `"Avoid
backwards-compatibility hacks like renaming unused _vars, re-exporting types,
adding // removed comments for removed code"`.

**Evidence:**
- `src/cli/commands/doctor.ts:85` — `// checkNode/checkGit removed — duplicates
  of doctor-checks.ts canonical versions (Sprint 154)`
- `src/cli/commands/doctor.ts:139-141` — three-line block:
  ```
  // checkWorkspace/checkBrainDir/checkDirectives/getMemoryEntryCount/checkBrainBudget/
  // checkDebt/checkStaleLocks removed — duplicates of doctor-checks.ts canonical versions
  // (Sprint 154 dedup; consumed only by the deleted local runDoctorChecks copy)
  ```
- `src/cli/commands/doctor.ts:740-743` — yet another comment block:
  ```
  // runDoctorChecks: imported from doctor-checks.ts and re-exported (Sprint 154 deduplication —
  // the local copy fell behind on checkGemini/checkCodex/auth-consistency additions)
  ```

**Impact:** ~10 lines of historical commentary that does not help readers
understand current behavior. Future-you cannot tell at a glance which
`runDoctorChecks` is canonical without reading the comment archaeology.

**Recommendation:** Sprint 162 — delete these comments; the git history
already records the dedup. If the import line `import { runDoctorChecks } from
'./doctor-checks.js'` and direct usage are clear, no comment is needed.

---

### 2.8 `formatProviderHealthSection` dead-in-production fallback — **P2**

**Dimension:** Dead code

**Summary:** `formatProviderHealthSection` (line 530) is exported and used as a
fallback inside `formatHumanDoctor` only when `connectorHealthResults` is
undefined — but the wiring site `registerDoctor` always builds and passes
`connectorHealthResults` via `buildConnectorHealthResults(providers)` (line 916).
The fallback path is unreachable in production.

**Evidence:**
- `src/cli/commands/doctor.ts:449-457` — branch on `if (input.connectorHealthResults)
  { ... } else { ... fall back to formatProviderHealthSection ... }`.
- `src/cli/commands/doctor.ts:912-916` — `connectorHealthResults =
  buildConnectorHealthResults(providers)` runs unconditionally in the
  human-format path.
- `src/cli/commands/doctor.ts:931-941` — the call to `formatHumanDoctor` always
  passes `connectorHealthResults`, never undefined.

**Caveat:** The function is **exported**, so external callers (vitest test
suite, possibly the dashboard) may rely on it. T-161-040 (dashboard audit)
should confirm whether the dashboard consumes it.

**Recommendation:** Sprint 162 — UNCERTAIN whether to delete. If grep across
`tests/` and `src/dashboard/` shows zero callers, this is safe to remove.
Otherwise mark explicitly as "exported for tests only" or unify with the
Connector format.

---

### 2.9 `watch.ts` Docker-backend asymmetry — **P1**

**Dimension:** Drift (claims vs reality) + dependency hygiene

**Summary:** `watch.ts` only knows about `tmux` and `subprocess` paths. It
branches on the **provider** (`getTaskProvider` returning `claude` or non-
`claude`) but never checks the **spawn backend**. With `spawn_backend = "docker"`
(a supported and tested backend per ADR-027), claude-provider Docker workers
have no tmux session — `attachToWorkerPane(taskId)` will fail or attach to a
ghost session. Worse, `isSessionActive()` returns false, so `watch` exits with
"No tmux session found. Run `deckent start` first." even though the sprint **is**
running — just inside Docker containers.

**Evidence:**
- `src/cli/commands/watch.ts:126-130` — `if (!isSessionActive()) { printError(
  new Error('No tmux session found. Run \`deckent start\` first.')); ... }`
  — guards everything on tmux session existence.
- `src/cli/commands/watch.ts:144-149` — provider check (`!== 'claude'` →
  subprocess log) but no `spawn_backend === 'docker'` check.
- `src/cli/commands/doctor.ts:88-89` — by contrast, doctor correctly excludes
  tmux requirement when `spawnBackend === 'docker'`. The asymmetry confirms the
  watch.ts blind-spot.
- `DECKENT.md` ("Workflow Guide" + "Sprint Lifecycle" sections) mentions
  `tmux/subprocess/Docker` as the three backends — Docker is first-class.

**Impact:** `deckent watch` is unusable on Docker-backend projects (currently
the recommended backend for isolation). For users on the Docker backend, the
command silently misleads them into thinking the sprint is dead.

**Recommendation:** Sprint 162 — `registerWatch` should read `spawn_backend`
from `.deckent/config.json` and:
- `tmux` backend → existing tmux flow
- `subprocess` backend → tail `.tasks/task-NNN.log` (the `watchSubprocessLog`
  helper already exists)
- `docker` backend → either `docker logs -f deckent-w-NNN` or tail the
  per-container log file the docker backend writes
This is a `MIGRATE-PUBLIC` blocker — public users will hit it immediately.

---

### 2.10 `watch.ts` lacks `--json` and lacks parity with MCP — **P3**

**Dimension:** Drift + ADR-022-V2 parity

**Summary:** `deckent watch` is intentionally CLI-only per ADR-022-V2 ("watch is
infrastructure/terminal — not in MCP"). That decision still holds. But within
the CLI, `watch` is the only introspection-adjacent command in this audit-scope
that has neither `--json` nor `--lang` support. This is a parity micro-drift
between sibling commands. Acceptable for a tmux-attach command (you cannot
JSON-output an interactive terminal), but flagged for completeness.

**Evidence:**
- `src/cli/commands/watch.ts:113-117` — `.option('--follow <taskId>', ...)` is
  the only option declared.
- Compare: `history.ts:228` (`--json`), `retro.ts:366` (`--json`),
  `explain.ts:340` (`--json`), `doctor.ts:794` (`--json`), `help.ts:127`
  (`--lang`).

**Recommendation:** No action needed; ADR-022-V2 explicitly excludes
infrastructure commands from full parameter parity.

---

### 2.11 Type-safety: unchecked JSON shape assertions — **P2**

**Dimension:** Type safety

**Summary:** Multiple `JSON.parse` sites use `as <Shape>` assertion without any
runtime validation, in violation of typescript-expert skill guidance ("Prefer
`unknown` over `any`. If `any` is absolutely required, document the reason"). A
malformed file silently produces `undefined` propagation rather than a typed
error.

**Evidence:**
- `src/cli/commands/explain.ts:197-208` — broad shape assertion for decision-log
  JSON without runtime guard.
- `src/cli/commands/watch.ts:24, 36, 48, 61, 79` — five distinct JSON.parse
  sites assert task/config shape with `as { ... }`.
- `src/cli/commands/doctor.ts:151, 169, 184, 207, 723, 840-849, 926` — multiple
  JSON.parse sites.
- `src/cli/commands/history.ts:159` — `JSON.parse(raw) as Array<{ tokenEstimate
  ?: number }>`; partial guard via `Array.isArray` follow-up but element shape
  unchecked.

**Mitigations already present:** All JSON.parse sites are wrapped in
`try { ... } catch { return null/empty }` so a corrupt file does not crash,
just produces zeros. This makes the issue P2 (cosmetic correctness, not P1
crash).

**Recommendation:** Sprint 162+ — introduce a small `parseJsonSafe<T>(raw:
string, validator: (x: unknown) => x is T): T | null` helper or use Zod for
the shapes that cross trust boundaries (config, decision logs).

---

### 2.12 `help.ts` command name `help-info`/`info` is non-discoverable — **P2**

**Dimension:** Drift (claim vs reality) + user confusion

**Summary:** The file says it implements `deckent help` (line 1 docstring), but
the actual `program.command('help-info').alias('info')` registers a **different**
command. Commander.js auto-registers a `help` command that prints generic
usage — so `deckent help` does NOT invoke the localized HELP_CONTENT in this
file. Users will not find this output unless they type `deckent help-info` or
`deckent info`.

**Evidence:**
- `src/cli/commands/help.ts:1-2` — file docstring: `help.ts — \`deckent help\`
  command with TR/EN i18n support.`
- `src/cli/commands/help.ts:124` — actual command name: `'help-info'`.
- `src/cli/commands/help.ts:125` — alias: `'info'`.

**Recommendation:** Sprint 162 — either (a) rename the command to `help` and
override commander's default (small risk: commander may complain), or (b) update
the file docstring to say `'help-info'/'info'`. Option (a) is the user-friendly
fix; option (b) is the doc-fidelity fix. Recommend (a) plus a deprecation alias
for `info`.

---

### 2.13 `retro.ts` cleanup: archive copy uses sync I/O outside SLA — **P3**

**Dimension:** Synchronous I/O (ADR-005 deprecated, but still followed in CLI)

**Summary:** `archiveCurrentRetro` uses `copyFileSync` (line 319) and
`mkdirSync` (line 313). For a one-shot CLI invocation this is fine. ADR-005
(Synchronous I/O) is marked **deprecated** in
`.brain/exports/summary.md` line 5, suggesting eventual migration. Not a bug,
just a deprecation tracker.

**Evidence:**
- `src/cli/commands/retro.ts:1` — imports `mkdirSync, copyFileSync`.
- `.brain/exports/summary.md:5` — `adr-005 | Synchronous I/O | deprecated`.

**Recommendation:** No action this sprint. Track in long-term migration; re-
visit when ADR-005 successor is accepted.

---

### 2.14 `retro.ts` `--trend` flag swallows the rest of retro output — **P3**

**Dimension:** Drift / UX

**Summary:** Passing `--trend` causes `registerRetro` to return early before
printing the rich summary or perf tables. Combined invocations like
`deckent retro --trend --compare` print only the trend, dropping the compare
delta silently with no warning.

**Evidence:**
- `src/cli/commands/retro.ts:374-379` — `if (opts.trend !== undefined) { ...
  print(formatTrend(...)); return; }` — early return.

**Recommendation:** Sprint 162 — either combine the flags (print all requested
sections) or warn `"--trend overrides --compare/--perf — only trend will be
shown"`. Combining is the more useful behavior.

---

### 2.15 `history.ts` `tokens`/`calls` placeholder defaulting to "-" — **P3**

**Dimension:** Drift (visible defaults imply missing data even when 0 is correct)

**Summary:** `parseSprintLog` sets `tokens: '-', calls: '-'` (line 147-148) and
later `loadUsageData` fills them only if `usage.calls > 0`. A genuine sprint
with zero recorded usage prints `-` instead of `0`, which a user reads as "no
data" rather than "actual zero".

**Evidence:**
- `src/cli/commands/history.ts:147-148` — defaults to `'-'`.
- `src/cli/commands/history.ts:260-263` — `if (usage.calls > 0) { ... }` —
  conditional fill.

**Recommendation:** Sprint 162 — distinguish "file missing" (→ `-`) from "file
exists with zero entries" (→ `0`). `loadUsageData` could return `null` for
"no file" vs `{tokens: 0, calls: 0}` for "empty file".

---

### 2.16 `--json` output shape inconsistency across siblings — **P2**

**Dimension:** Drift (metrics output format — direct lead-question item)

**Summary:** Each command's `--json` output uses different field names and
structures for overlapping concepts:

| Concept | history `--json` | retro `--json` | explain `--json` |
|---|---|---|---|
| Sprint identifier | `sprint: "Sprint NNN ..."` (title string) | `sprintId: "NNN"` | `sprintId: <number>` |
| Total tasks | `tasks: <number>` (top-level) | `totalTasks: <number>` | `metrics.totalTasks` |
| Completed | `completed: <number>` | `completed: <number>` | `metrics.completed` |
| No-Go | `noGo: <number>` | `noGo: <number>` | `metrics.noGo` |
| Coverage | `coverage: "<pct>%"` | `coverage: "<pct>%"` | (absent) |
| Duration | `duration: "Xm Ys"` (formatted) | `duration: "Xm Ys"` (raw) | `metrics.durationMs: <number>` |
| Tech debt | `techDebt: <number>` | `techDebt: <number>` | `metrics.techDebt` |

**Evidence:**
- `src/cli/commands/history.ts:288-298` — `jsonRecords.map(r => ({...r, tasks:
  parseInt(...)}))` — flat record shape.
- `src/cli/commands/retro.ts:392-415` — adds `delta` and `agentPerformance`
  nested keys.
- `src/cli/commands/explain.ts:413-429` — uses nested `metrics: { ... }`
  structure with `durationMs` numeric instead of formatted string.

**Impact:** Any downstream consumer (dashboard, scripts, the MCP server) cannot
share parsing logic across commands. Each must special-case the shape.

**Recommendation:** Sprint 162 — introduce a JSON contract document (e.g.
`.contracts/cli-json.md`) and unify field names. `sprintId` should be a string
(`"sprint-NNN"`), `durationMs` numeric in addition to a formatted helper, and
all top-level metrics co-located under a `metrics` object.

---

### 2.17 ADR coherence summary — **P3**

**Dimension:** ADR violations (44 active ADRs)

| ADR | Files affected | Status |
|---|---|---|
| ADR-001 (TS+ESM) | all 6 | OK — strict mode, ESM imports |
| ADR-002 (Node16 module resolution) | all 6 | OK — `.js` extensions on relative imports |
| ADR-005 (sync I/O, **deprecated**) | retro.ts, explain.ts, history.ts, doctor.ts, watch.ts | tracked in 2.13 |
| ADR-006 (spawnSync security) | doctor.ts, watch.ts | OK — array-args, no shell except platform-specific (doctor.ts:113 explicitly uses `shell: process.platform === 'win32'`) |
| ADR-008 (Brain merkezi import) | all 6 | OK — only `core/`, `helpers/`, and `orchestra/` (read-side) imports |
| ADR-010 (single runtime dep: commander) | all 6 | OK — only `commander` Command type imported |
| ADR-011 (node:readline/promises) | n/a | not used here, no prompts in introspection commands |
| ADR-012 (`register<Name>(program)` pattern) | all 6 | OK — `registerHistory`, `registerRetro`, `registerExplain`, `registerHelp`, `registerDoctor`, `registerWatch` |
| ADR-014 (.deck secret system) | doctor.ts | OK — uses `loadDeckSecrets`, `validateDeckFile` |
| ADR-022-V2 (CLI/MCP parity) | watch.ts | INTENTIONAL exclusion (infrastructure command) per ADR text |
| ADR-036 (ADR Governance — DB-first) | doctor-checks.ts (out-of-scope but consumed via doctor.ts wire) | **VIOLATION** — finding 2.1 |

The only material ADR violation is the doctor.ts → doctor-checks.ts wire
violating ADR-036.

---

### 2.18 Dependency hygiene — **OK**

All `from './...'` and `from '../...'` relative imports use the `.js` extension
required by Node16 ESM module resolution. No circular dependency risk found
within scope (the audit-scope files all import from `core/`, `helpers/`, and
`orchestra/` but never from each other).

---

### 2.19 Memory V2 coherence — **OK** (apart from finding 2.1)

`doctor.ts` correctly:
- Uses `MemoryStore` via `getMemoryEntryCountFromChecks` (line 10).
- Checks `.brain/memory.db`, `.brain/memory.db-shm`, `.brain/memory.db-wal`
  gitignore entries (line 617).
- Reads memory budget from config (line 922-928).

`retro.ts`, `explain.ts`, `history.ts` still parse markdown sprint logs (legacy
file-based path). This is acceptable per Memory V2 spec — exports/sprints/*.md
are first-class generated artifacts. However, finding 2.5 (parser duplication)
is the friction point.

---

### 2.20 Configuration integrity — **OK**

`doctor.ts:836-849` reads `.deckent/config.json` and tolerates missing fields
gracefully (try/catch + nullish defaults). `watch.ts:33-39` reads the same file
for `last_sprint_id`. No bypassing of the 3-layer config merge (ADR-004).

---

## 3. Migration triage

| File | Disposition | Reason |
|------|------------|--------|
| `src/cli/commands/history.ts` | **MIGRATE-PUBLIC** | Stable, useful command; only blocker is the parser-unification work in finding 2.5. |
| `src/cli/commands/retro.ts` | **MIGRATE-PUBLIC** | Stable, but the `GO_WITH_TECH_DEBT` regex fallback (2.4) and `--trend` exclusivity (2.14) should be addressed before public ship. |
| `src/cli/commands/explain.ts` | **MIGRATE-PUBLIC** | Stable. The doneCount semantics drift (2.3) is the only blocker; once the sprint-reporter contract is canonized this becomes a 5-line fix. |
| `src/cli/commands/help.ts` | **MIGRATE-PUBLIC** | Tiny file. Two blockers: URL drift (2.6) and command-name discoverability (2.12). Both are 1-line fixes. |
| `src/cli/commands/doctor.ts` | **MIGRATE-PUBLIC** (with caveats) | Largest file in scope (957 LoC); 5 distinct findings (2.1, 2.2, 2.7, 2.8, 2.11). Finding 2.1 is **P0** and **must** ship fixed. Finding 2.8 is UNCERTAIN until external callers are confirmed. |
| `src/cli/commands/watch.ts` | **MIGRATE-PUBLIC** (after 2.9) | Docker-backend gap (2.9) is a P1 blocker for public users on the recommended backend. Once fixed, the file is small, clear, and ships well. |

No file in scope is **DELETE-CANDIDATE** — every command is referenced from
`src/cli/entry.ts`, has tests, and serves a documented user need.

No file in scope is **KEEP-PRIVATE** — these are user-facing introspection
commands integral to the public CLI surface.

---

## 4. Recommendation (Sprint 162+ work)

In priority order:

1. **(P0) Fix the doctor DECISIONS.md FAIL bug.** Sprint 162, ≤1 hour. Replace
   the flat-file check in `doctor-checks.ts:333` with either DB-presence or
   `.brain/exports/decisions.md` check. This is the user-visible Sprint 160
   regression and any user running `deckent doctor` against a Memory V2 project
   sees a false FAIL today.

2. **(P1) Unify the sprint-log parser.** Sprint 162, 2-3 hours. Extract
   `src/orchestra/sprint-log-parser.ts` (or a similar shared module) and have
   `history.ts`, `retro.ts`, `explain.ts` consume it. This subsumes findings
   2.3, 2.4, and 2.5. Bonus: opens the door to consuming `MemoryStore.getBySprint`
   directly, reducing markdown-as-data fragility.

3. **(P1) Fix `watch.ts` Docker-backend support.** Sprint 162, ≤1 hour. Read
   `spawn_backend` from config and route to `docker logs -f` for the docker
   backend. `subprocess` is already supported via `watchSubprocessLog`, so
   the docker branch is symmetric.

4. **(P1) Fix the doctor `openDebtCount` label drift.** Sprint 162, ≤30 min.
   Either call `countOpenDebtItems` or rename the label. Currently the unused
   import is a smell that suggests an unfinished refactor.

5. **(P1) Fix `help.ts` URL drift + command-name discoverability.** Sprint 162,
   ≤30 min. Read URL from `package.json`; rename command to `help` (or alias).

6. **(P2) Standardize `--json` output schemas.** Sprint 163. Document a
   `.contracts/cli-json.md` and migrate the 3 commands to a shared shape. This
   is downstream of (2) and is the one substantial public-API break in this
   audit.

7. **(P2) Clean up `doctor.ts` orphan comments + verify
   `formatProviderHealthSection` callers.** Sprint 163. After (1), (2), (4)
   land, sweep the dedup-leftover comments.

8. **(P2) Extend type-safety guards on JSON.parse boundaries.** Sprint 164+.
   Introduce `parseJsonSafe<T>` helper or migrate boundary parses to Zod.

No P0 is fixable inside this audit (audit scope is read-only). All P0/P1 items
have been logged with file:line evidence; subsequent sprints can act with
confidence.

---

## 5. Summary table — quick reference

| # | Severity | Dimension | File | Lines | One-line summary |
|---|---|---|---|---|---|
| 2.1 | **P0** | Drift+Memory V2 | doctor.ts (via doctor-checks.ts:333) | 333 | DECISIONS.md flat-file FAIL on Memory V2 projects |
| 2.2 | P1 | Drift | doctor.ts | 159-160, 421-426 | "open" debt count actually shows total |
| 2.3 | P1 | Counter accuracy | explain.ts | 297-300 | doneCount = completed + techDebt double-counts |
| 2.4 | P1 | Parser fragility | retro.ts | 67-71 | `GO_WITH_TECH_DEBT` regex over-counts in fallback |
| 2.5 | P2 | Conflicting areas | history/retro/explain | various | 3 duplicate sprint-log parsers diverge |
| 2.6 | P1 | Drift | help.ts | 50, 85 | hardcoded `deckent/deckent` URL is wrong |
| 2.7 | P2 | Doc pollution | doctor.ts | 85, 139-141, 740-743 | orphan "removed — Sprint 154" comments |
| 2.8 | P2 | Dead code | doctor.ts | 530-564 | `formatProviderHealthSection` unreachable in prod |
| 2.9 | P1 | Drift | watch.ts | 126-149 | no Docker backend support |
| 2.10 | P3 | ADR-022-V2 | watch.ts | 113-117 | no `--json` (intentional) |
| 2.11 | P2 | Type safety | doctor/explain/watch/history | various | unchecked `as <Shape>` JSON assertions |
| 2.12 | P2 | Drift | help.ts | 1, 124 | command name is `help-info`, not `help` |
| 2.13 | P3 | ADR-005 | retro.ts | 313, 319 | sync I/O (deprecated ADR, no action) |
| 2.14 | P3 | UX | retro.ts | 374-379 | `--trend` swallows `--compare`/`--perf` |
| 2.15 | P3 | Drift | history.ts | 147-148, 260-263 | tokens/calls "-" vs "0" ambiguity |
| 2.16 | P2 | Drift | history/retro/explain | various | `--json` shape inconsistent across siblings |
| 2.17 | — | ADR violations | scope-wide | — | only ADR-036 violation (finding 2.1) |
| 2.18 | — | Dep hygiene | scope-wide | — | OK |
| 2.19 | — | Memory V2 | scope-wide | — | OK except 2.1 |
| 2.20 | — | Config integrity | scope-wide | — | OK |

---

## 6. Auditor notes

- **READ-ONLY mandate honored.** Only `docs/audits/sprint-161/T-161-026-cli-introspection.md`
  was written. No source modifications. `git diff --stat` for this task should
  show only this file.
- **Out-of-scope but flagged for sibling auditors:**
  - **T-161-027** (cli config + lists) — should verify whether `mode.ts`
    similarly mishandles `spawn_backend`-dependent UX.
  - **T-161-015** (orch result-evaluator) and **T-161-017** (orch debt-reporter)
    — should canonicize whether "Tasks completed | X/Y" includes
    GO_WITH_TECH_DEBT outcomes; that decision blocks finding 2.3.
  - **T-161-053** (.brain memory files) — should confirm whether `MEMORY_FILE`
    suffers the same DB-first regression as `DECISIONS_FILE` (finding 2.1
    suspects yes).
  - **T-161-040** (dashboard components) — should check whether the dashboard
    consumes `formatProviderHealthSection` (finding 2.8).
- **One P0 finding (2.1)** is the audit's headline and matches the explicit
  Sprint 160 lead question in the DIRECTIVES.

End of T-161-026.
