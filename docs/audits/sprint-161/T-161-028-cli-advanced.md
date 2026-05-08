# T-161-028 — Advanced CLI Commands Audit (READ-ONLY)

**Sprint:** 161 (Lane 1, God-Level Static Audit)
**Task:** 161-028
**Agent:** doc-writer
**Skill:** typescript-expert
**Date:** 2026-05-08
**Status:** READ-ONLY — no source code modified.

---

## 1. Scope

### Files audited (intended targets per DIRECTIVES → resolved actual paths)

| DIRECTIVES claim       | Actual path                                      | Status              |
|------------------------|--------------------------------------------------|---------------------|
| `audit.ts`             | `src/cli/commands/audit.ts`                      | Exists (45 LoC)     |
| `feature-query.ts`     | `src/cli/commands/features.ts` (renamed)         | Exists (149 LoC)    |
| `recover.ts`           | `src/cli/commands/recover.ts`                    | Exists (168 LoC)    |
| `docs.ts`              | `src/cli/commands/docs.ts`                       | Exists (158 LoC)    |
| `memory-query.ts`      | `src/cli/commands/memory.ts` (split into 3)      | Exists (218 LoC)    |
| `memory-query.ts/recall`| `src/cli/commands/recall.ts`                    | Exists (58 LoC)     |
| `memory-query.ts/remember`| `src/cli/commands/remember.ts`                | Exists (47 LoC)     |
| `notify.ts`            | **NOT FOUND in `src/cli/commands/`**             | **Drift (P2)**      |
| `metrics.ts`           | `src/cli/commands/metrics.ts`                    | Exists (537 LoC)    |

Total LoC audited: ~1380 across 8 files. The 9th promised file (`notify.ts`) does not
exist as a CLI command — `notify` lives at `src/orchestra/notify.ts` (in-process
helper, not a user-invokable CLI command).

### Cross-references consulted (read-only)

- `src/cli/index.ts` — `register*` wire-up (ADR-012)
- `src/mcp/server.ts`, `src/mcp/tools/{audit,docs,feature-query,memory-query,recover}.ts`, `src/mcp/tools/help.ts` — CLI/MCP parity (ADR-022-V2)
- `src/orchestra/managed-docs/docs-config.ts` — `addDoc`, `removeDoc`, `saveDocsConfig`
- `src/core/orphan-cleaner.ts`, `src/core/file-lock.ts`, `src/orchestra/sprint-finalizer.ts` — recover pipeline collaborators
- `tests/cli/`, `tests/cli/commands/`, `tests/core/features-manifest.test.ts` — test coverage map
- `git log --diff-filter=A` — sprint-of-introduction verification

### Sprint-of-introduction (git diff-filter=A confirmed)

| File          | Introduced in commit | Sprint     |
|---------------|----------------------|------------|
| `audit.ts`    | `9c054a6`            | Sprint 150 |
| `features.ts` | `9c054a6`            | Sprint 150 |
| `recover.ts`  | `9c054a6`            | Sprint 150 |
| `recall.ts`   | `2e3ba2a`            | Sprint 143 |
| `remember.ts` | `2e3ba2a`            | Sprint 143 |
| `memory.ts`   | `b09bfe2`            | Memory V2 (pre-143) |
| `metrics.ts`  | `8d521a1`            | Sprint 159 |
| `docs.ts`     | `78586d6`            | Sprint 100 |

DIRECTIVES claim "Sprint 150 new commands wire" is **VERIFIED** for `audit`/`features`/`recover`. Claim "Sprint 159 deckent metrics summary" is **VERIFIED** for `metrics.ts`.

---

## 2. Findings

Severity legend: **P0** = blocker, **P1** = important, **P2** = minor, **P3** = nit.

### F1 — DIRECTIVES drift on file naming (P2 / dim-4 Drift, dim-7 Doc pollution)

DIRECTIVES Task 28 enumerates `feature-query.ts`, `memory-query.ts`, and `notify.ts`,
but those file names do not exist in `src/cli/commands/`. Reality:

- `feature-query.ts` → renamed to `features.ts` (registers `deckent features`)
- `memory-query.ts` → split into `memory.ts` (subcommand `memory rebuild|export|stats|relations`), `recall.ts` (`deckent recall`), and `remember.ts` (`deckent remember`)
- `notify.ts` → no CLI command exists; only `src/orchestra/notify.ts` (internal helper) and `src/core/notification-dispatcher.ts` exist

Impact: Future audit tasks may waste time chasing missing files. DIRECTIVES is a
project document; it should match what shipped.

### F2 — ADR-022-V2 (CLI/MCP Feature Parity) gaps (P1 / dim-2 ADR violation)

**Three CLI commands lack equivalent MCP tools:**

| CLI command          | MCP tool          | Parity status |
|----------------------|-------------------|---------------|
| `deckent metrics summary` | _(none)_      | **Missing** — no `deckent_metrics` MCP tool |
| `deckent recall`     | `deckent_memory_query` (close cousin, different signature) | Partial — query parameters differ |
| `deckent remember`   | _(none)_          | **Missing** — no MCP write counterpart |
| `deckent memory rebuild/export/stats` | _(none)_  | **Missing** — DB management is CLI-only |

ADR-022-V2 mandates: "CLI/MCP Feature Parity — Parametre Eşitleme + Eksik
Komutlar". `metrics summary` and `remember` are user-visible commands shipped to
the public CLI but not exposed via MCP. This is either an active backlog item or
an unintentional gap. Either way, document it.

### F3 — Drift between MCP `deckent_recover` description and actual behavior (P1 / dim-4 Drift)

`src/mcp/server.ts:50` and `src/mcp/tools/help.ts:75` describe `deckent_recover` as:
> "Resume a paused/checkpointed sprint from .deckent/sprint.lock"

But the tool's own metadata in `src/mcp/tools/recover.ts:19` correctly states:
> "Recover from a crashed or stuck sprint. Runs audit, cleans orphan IPC directories
> (dead PIDs only), clears stale locks (>5min), and archives terminal task files."

The CLI `deckent recover` (`src/cli/commands/recover.ts:104-105`) matches the
correct description. The "Resume a paused/checkpointed sprint" wording is a stale
draft — checkpoint resume is a different feature (`src/orchestra/resume.ts`,
Sprint 138 Task 9). Users reading the MCP tool listing may misconfigure their
recovery flow.

### F4 — Dead code: `parseMetricsJsonl` and `MetricEvent` exported but unused in production (P2 / dim-1 Dead code)

`src/cli/commands/metrics.ts:87-102` exports `parseMetricsJsonl(content: string): MetricEvent[]`.
The runtime `metrics summary` command does NOT call this function: it goes
through `buildMetricsSummary → resolveSprintTasksDir → scanSprintTasks` (lines
393–407) which reads `.tasks/*.json`/`*.result` directly, never `.deckent/sprint-*-metrics.jsonl`.

Confirmation: `Grep parseMetricsJsonl` across `src/` returns only the export
itself. The only consumer is `tests/cli/commands/metrics.test.ts:7,85,92`.

Same for the `MetricEvent` interface (line 12) and the JSONL-pure helper
existence: defined for testability per the original task plan
(`.brain/archive/sprint-159-tasks/task-159-003.plan:36`), but the production
metrics command never wires JSONL events into the summary.

Triage candidates:
- **Option A**: Wire `parseMetricsJsonl` into `buildMetricsSummary` to merge
  duration/trace data from `.deckent/sprint-*-metrics.jsonl`. (Scope expansion.)
- **Option B**: Remove `parseMetricsJsonl` + `MetricEvent` as dead exports.
  (Tightening.)

This is the closest dead-code finding in this audit batch.

### F5 — Missing direct test coverage for `features.ts` and `docs.ts` registerFeatures/registerDocs (P2 / dim-1 + dim-7)

- `src/cli/commands/features.ts` (registerFeatures): **No** dedicated test
  file. `tests/core/features-manifest.test.ts` covers the manifest schema, not
  the CLI action.
- `src/cli/commands/docs.ts` (registerDocs): **No** dedicated test for the
  registration / subcommand routing. `tests/cli/commands/docs-add-interactive.test.ts`
  covers a different surface (interactive `docs add` flow), not `docs list`,
  `docs remove`, `docs update`, `docs run`.

Compared with the rest of the batch, which all have direct tests:
- `tests/cli/commands/audit.test.ts` ✓
- `tests/cli/commands/recover.test.ts` ✓
- `tests/cli/commands/recall.test.ts` ✓
- `tests/cli/remember.test.ts` ✓
- `tests/cli/memory.test.ts` ✓
- `tests/cli/commands/metrics.test.ts` ✓

This is uneven coverage, not necessarily a bug — but `features` is the
public-facing way to inspect the manifest, and `docs` mutates project state
(`saveDocsConfig`); both deserve registration smoke tests.

### F6 — `recover.ts` `--force` option declared but never used (P3 / dim-1 Dead code)

`src/cli/commands/recover.ts:107` declares `.option('--force', 'Skip interactive
confirmation')`, and the action signature receives `opts.force`. The flag is
honored at line 131 (`if (!opts.force)`), so it IS used in CLI runtime — but
the `runRecovery` helper signature at line 26 also accepts `force?: boolean` in
its options object yet never reads it (lines 23–100 never reference `opts.force`).
Mild redundancy: the helper's type signature claims a knob it does not
implement; harmless but confusing.

### F7 — `docs.ts` uses bare `parseInt` (no radix) as commander coercion (P3 / dim-2 light)

`src/cli/commands/docs.ts:25` and `:98` pass bare `parseInt` to commander's
`.option()`:

```ts
.option('--max-lines <n>', 'Max lines for auto sections', parseInt)
```

`parseInt` without radix mostly works (modern V8 defaults to base 10 for normal
strings) but `parseInt("08")` returns `8` only since ES5; `parseInt("0xFF")`
returns `255`. For a numeric CLI flag this is fine but lint-strict shops flag
it. The other modules use the explicit `parseInt(x, 10)` form (e.g.,
`metrics.ts:166-167`, `recall.ts:34-35`). Inconsistency.

### F8 — `recover.ts` calls `existsSync` then `readdirSync` without TOCTOU guard (P3 / dim-5 minor)

Lines 49–52, 55–63, 67–71: classic check-then-read. Not a real risk in this
context (workers are gated by sprint-controller, no concurrent recover sessions
expected) but worth noting if the recovery command ever becomes parallelizable.

### F9 — `memory.ts` uses raw SQL via `getRawDb()` (P2 / dim-2 light)

`src/cli/commands/memory.ts:144-147`:

```ts
const db = store.getRawDb();
const rows = db.prepare(
  `SELECT from_id, to_id, rel_type, created_at FROM relations ORDER BY created_at DESC LIMIT 50`,
).all() as EntryRelation[];
```

The MemoryStore class is the abstraction; bypassing it for a SELECT is a small
encapsulation leak. Not a security issue (no string interpolation, parameterized
ORDER BY/LIMIT are constants), but a future schema change in `relations` would
break this raw query silently. Consider adding `MemoryStore.listRelations(limit)`
to encapsulate.

### F10 — `recall.ts` uses untyped `opts` callback (P3 / dim-5 light)

`src/cli/commands/recall.ts:18`:

```ts
.action((query: string, opts) => {
```

The `opts` parameter has no explicit type — commander infers `unknown`-ish.
Same applies in `remember.ts:16`. Other modules in the batch (e.g.,
`audit.ts:13`, `recover.ts:109`) use explicit `opts: { ... }` type annotations
which match the typescript-expert skill's "prefer interface/type" guidance.
Inconsistent. Either inline the type or extract a shared `RecallOpts`.

### F11 — `recall.ts` printError message references stale command (P3 / dim-4 Drift)

`src/cli/commands/recall.ts:23` and `remember.ts:21`:

```ts
printError('Memory V2 DB not found. Run `deckent memory migrate` first.');
```

But `deckent memory migrate` does not exist. Available subcommands per
`memory.ts:14` are `rebuild`, `export`, `stats`, `relations` (no `migrate`).
The user is sent to a non-existent command. Likely should say `deckent memory rebuild`
since that's the canonical recreate path.

### F12 — `audit.ts` writes gate file even on tsc/vitest failure (P3 / dim-9 Config integrity light)

`src/cli/commands/audit.ts:21-23` always writes `.deckent/<sprint-id>-gate.json`
inside the try/catch, regardless of whether `runSelfAuditGate` reported PASS or
GATE_FAILURE. Only the catch (line 39) skips the write. This is intentional
(the gate file IS the audit artifact), but the side-effect on a `GATE_FAILURE`
overrides any prior PASS file silently. Worth a one-line confirmation comment
or write to a `<sprint-id>-gate.<timestamp>.json` instead. Low priority.

### F13 — `metrics.ts` `aggregateModelStats` always sets `routing: 'direct'` (P3 / dim-4 Drift)

`src/cli/commands/metrics.ts:299` hardcodes `routing: 'direct'` for every model.
The `ModelStat.routing` field exists in the type definition (line 50) and
suggests support for richer routing taxonomies (intent, manifest, fallback).
Either:
1. Wire actual routing source from the task's `routingMeta.routingVersion`/
   `intent.primary` (richer signal already present in task JSONs), or
2. Drop the field and simplify the type.

Currently the field is type-truthful but value-blind. Sprint 159 deferral?

### F14 — Type-safety: zero violations across 8 files (POSITIVE / dim-5)

`Grep` for `: any\b`, `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`
across the 8 audited files returns **0 matches**. This is a clean batch.

### F15 — ESM `.js` extension hygiene: 100% compliant (POSITIVE / dim-6)

All imports across the 8 files use the `.js` extension as required by ADR-002
(Node16 module resolution). No bare `./foo` imports.

### F16 — ADR-010 single-runtime-dep compliance (POSITIVE / dim-2)

All 8 files use only `commander` (runtime) plus Node built-ins (`node:fs`,
`node:path`, `node:readline`, `node:readline/promises`). No additional runtime
dependencies introduced. `recover.ts:139` uses `node:readline/promises` per
ADR-011. ✓

### F17 — ADR-012 register pattern compliance (POSITIVE / dim-2)

All 8 modules export a `register<Name>(program: Command): void` function:

| File          | Export            | Wired in `src/cli/index.ts` |
|---------------|-------------------|-----------------------------|
| audit.ts      | `registerAudit`   | line 48, 116                |
| features.ts   | `registerFeatures`| line 47, 115                |
| recover.ts    | `registerRecover` | line 49, 117                |
| docs.ts       | `registerDocs`    | line 36, 105                |
| memory.ts     | `registerMemory`  | line 41, 110                |
| recall.ts     | `registerRecall`  | line 39, 108                |
| remember.ts   | `registerRemember`| line 40, 109                |
| metrics.ts    | `registerMetrics` | line 50, 118                |

All modules conform to ADR-012. ✓

### F18 — `features.ts` uses `console.log/console.error` instead of helper print/printError (P3 / dim-3 Conflict)

`src/cli/commands/features.ts:97,106,110,112-117,124,131-137,142-146` uses
`console.log`/`console.error` directly. Other modules in the batch use the
project's `print`/`printError` helpers from `../helpers/output.js` (e.g.,
`audit.ts:5`, `recover.ts:9`, `docs.ts:10`, `memory.ts:10`, `metrics.ts:5`,
`recall.ts:8`, `remember.ts:7`).

This breaks output uniformity — the helpers may add color, prefixing, or test
fixtures that `console.log` skips. Stylistic inconsistency at minimum.

---

## 3. Evidence (file:line citations)

| Finding | Citation                                                      |
|---------|---------------------------------------------------------------|
| F1      | DIRECTIVES.md Task 28; `Glob src/cli/commands/notify*` → no match |
| F2      | `Grep deckent_metrics src/mcp/` → 0; `Grep deckent_remember src/mcp/` → 0 |
| F3      | `src/mcp/server.ts:50`; `src/mcp/tools/help.ts:75`; vs `src/mcp/tools/recover.ts:19`; vs `src/cli/commands/recover.ts:104-105` |
| F4      | `src/cli/commands/metrics.ts:87-102` (export); `Grep parseMetricsJsonl src/` → only definition |
| F5      | `Glob tests/**/features*.test.ts` → only `tests/core/features-manifest.test.ts`; `Grep registerDocs tests/` → 0 |
| F6      | `src/cli/commands/recover.ts:23-26,107`; helper never reads `opts.force` (lines 28–100) |
| F7      | `src/cli/commands/docs.ts:25,98` |
| F8      | `src/cli/commands/recover.ts:49-71` |
| F9      | `src/cli/commands/memory.ts:144-147` |
| F10     | `src/cli/commands/recall.ts:18`; `src/cli/commands/remember.ts:16` |
| F11     | `src/cli/commands/recall.ts:23`; `src/cli/commands/remember.ts:21`; `src/cli/commands/memory.ts:14` |
| F12     | `src/cli/commands/audit.ts:21-23,39` |
| F13     | `src/cli/commands/metrics.ts:50,292-303` |
| F14     | `Grep ': any\|as any\|as unknown as\|@ts-ignore\|@ts-expect-error' src/cli/commands/{audit,features,recover,docs,memory,recall,remember,metrics}.ts` → 0 |
| F15     | All `import` lines across the 8 files use `.js` |
| F16     | All `import { Command } from 'commander'`; otherwise only `node:*` |
| F17     | `src/cli/index.ts:36-50,105-118` and per-module exports cited above |
| F18     | `src/cli/commands/features.ts:97,106,110,112-117,124,131-137,142-146` vs others |

---

## 4. Migration Triage

Per Sprint 161 mandate, classify each audited file for the public-vs-private
boundary (KEEP-PRIVATE / MIGRATE-PUBLIC / DELETE-CANDIDATE / UNCERTAIN).

| File                  | Disposition       | Rationale |
|-----------------------|-------------------|-----------|
| `audit.ts`            | MIGRATE-PUBLIC    | Self-audit gate is a deckent core user feature. Already documented in DECKENT.md MCP table (`deckent_audit`). Public-ready. |
| `features.ts`         | MIGRATE-PUBLIC    | Reads from `.deckent/features-manifest.json` which is project-local; the command itself is generic and useful for any user. F18 (console.log) should be cleaned before public migration. |
| `recover.ts`          | MIGRATE-PUBLIC    | Crash-recovery is a universal sprint-lifecycle feature. CLI command is correctly described and tested. F3 (MCP description drift) should be fixed before public release. |
| `docs.ts`             | MIGRATE-PUBLIC    | Managed-Docs system (ADR-029) is a public feature. Add tests (F5) and decide on `parseInt` consistency (F7) before flipping. |
| `memory.ts`           | MIGRATE-PUBLIC    | Memory V2 is the headline feature in DECKENT.md. CLI is well-tested. F9 (raw SQL) and F11 (stale `migrate` reference) should be addressed. |
| `recall.ts`           | MIGRATE-PUBLIC    | Public memory-search UX. Same as memory.ts; fix F11 (`memory migrate` → `memory rebuild`) and F10 (typed opts) for polish. |
| `remember.ts`         | MIGRATE-PUBLIC    | Public memory-write UX. Consider an MCP counterpart (F2) to satisfy ADR-022-V2 before public release. |
| `metrics.ts`          | MIGRATE-PUBLIC    | Sprint metrics summary is a useful general feature. Resolve F4 (dead `parseMetricsJsonl`) — wire it OR delete it. F13 (hardcoded `routing: 'direct'`) is a minor blemish. |
| _Hypothetical_ `notify.ts` (CLI) | UNCERTAIN | Does not exist as CLI today. If a `deckent notify` command is intended, it would need a spec; current `src/orchestra/notify.ts` is internal-only. |

**Summary**: All 8 audited modules are MIGRATE-PUBLIC with light cleanup. None
are DELETE-CANDIDATE at the file granularity. The sole DELETE-CANDIDATE is the
**function** `parseMetricsJsonl` + `MetricEvent` interface (F4) — these are
intra-file dead code.

---

## 5. Recommendation (for Sprint 162+)

A focused 1-sprint cleanup task ("CLI/MCP advanced commands polish") could
absorb the bulk of this audit:

### High-value, low-risk:

1. **F3 — Fix MCP `deckent_recover` description drift** (5 min). Sync wording in
   `src/mcp/server.ts:50` and `src/mcp/tools/help.ts:75` with the correct
   `recover.ts:19` description.

2. **F11 — Fix stale `memory migrate` reference** in `recall.ts:23` and
   `remember.ts:21`. Replace with `deckent memory rebuild`. (2 min)

3. **F4 — Decide on `parseMetricsJsonl`**: either wire JSONL parsing into
   `buildMetricsSummary` to enrich duration data, or delete the function and
   `MetricEvent` interface. ~30 min depending on choice.

4. **F18 — `features.ts` console.log → print/printError**. Mechanical refactor.
   (10 min)

### Medium-value, design discussion:

5. **F2 — Decide ADR-022-V2 parity stance**. Either add MCP tools
   `deckent_metrics`, `deckent_remember`, and possibly `deckent_memory_rebuild`,
   OR explicitly document the asymmetry as accepted (CLI-only DB management).
   This is a roadmap call, not a one-shot fix.

6. **F5 — Add `features` and `docs` registration tests**. Two new test files,
   covering subcommand wiring and basic happy-path. ~1 hour.

### Low priority / nits:

7. **F6** — Drop `force?: boolean` from `runRecovery` helper signature (it's
   not consumed at the helper layer).
8. **F7** — Promote `docs.ts` `parseInt` to `parseInt(x, 10)` for consistency.
9. **F9** — Consider `MemoryStore.listRelations(limit)` to remove the
   `getRawDb()` escape-hatch in `memory.ts:144-147`.
10. **F10** — Type the `opts` callback in `recall.ts`/`remember.ts` for
    typescript-expert skill compliance.
11. **F13** — Either drop `ModelStat.routing` or wire actual routing source
    from `routingMeta.routingVersion`.

### Defer / accept:

- **F1** (DIRECTIVES drift): document under Sprint 161 lessons; tighten the
  Sprint 162+ DIRECTIVES template so file-name claims are validated against
  `Glob` before sprint starts.
- **F8** (TOCTOU in `recover.ts`): no current concurrency surface; defer.
- **F12** (audit gate file overwrite): intentional behavior; document only.

### Out of scope for this audit:

- No source code modifications.
- No deletions.
- No MCP server reorganization — the parity decision in F2 is architectural.
- No retroactive change to DIRECTIVES.md.

---

## 6. 10-Dimension Coverage Matrix

| #  | Dimension                  | Findings                          |
|----|----------------------------|-----------------------------------|
| 1  | Dead code                  | F4 (parseMetricsJsonl/MetricEvent), F6 (force opt) |
| 2  | ADR violations             | F2 (ADR-022-V2 partial), F16-17 (positive) |
| 3  | Conflicting areas          | F18 (console.log vs print helper) |
| 4  | Drift                      | F1 (file rename), F3 (MCP recover desc), F11 (memory migrate), F13 (routing field) |
| 5  | Type safety                | F8 (TOCTOU light), F10 (untyped opts), F14 (zero `any` — positive) |
| 6  | Dependency hygiene (.js)   | F15 (100% compliant — positive) |
| 7  | Documentation pollution    | F1, F5 (test asymmetry) |
| 8  | Memory V2 coherence        | F11 (stale `memory migrate`), F9 (raw SQL leak) — both correctness adjacent |
| 9  | Config integrity           | F12 (audit gate file overwrite) |
| 10 | Migration triage           | Section 4 (8/8 MIGRATE-PUBLIC, 0 DELETE-CANDIDATE) |

---

## 7. Audit Hygiene Footnote

- **Files modified by this audit**: only `docs/audits/sprint-161/T-161-028-cli-advanced.md` (this file).
- **Source code touched**: none.
- **Tests modified**: none.
- **ADRs touched**: none.
- **`git diff --stat`**: should show only this single audit report.
- **Self-modifying detector (ADR-039)**: this is a Deckent-on-Deckent audit;
  scope.filesWrite is single-path; no boundary violation expected.
