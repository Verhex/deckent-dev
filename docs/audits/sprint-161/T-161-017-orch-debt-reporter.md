# T-161-017 — `src/orchestra/` debt-manager + sprint-reporter Audit

**Sprint:** 161 (Lane 1 — God-Level READ-ONLY Self-Audit)
**Auditor:** w-161-017 (claude / opus)
**Date:** 2026-05-08
**Mode:** READ-ONLY static audit. No source modified.

---

## 1. Scope

Files audited (in scope per task `scope.directories=src/orchestra/`):

| File | LoC | Purpose |
|------|----:|---------|
| `src/orchestra/debt-manager.ts` | 413 | Task-evaluation outcome handler; debt CRUD; cross-dep fix; budget audit; decay |
| `src/orchestra/sprint-reporter.ts` | 98 | Thin barrel re-exporting 4 split modules (Sprint 134 T-009) |
| **Total** | **511** | |

Cross-referenced (read-only) for callers / dead-code verification:
`src/orchestra/brain.ts`, `sprint-phases.ts`, `sprint-finalizer.ts`, `sprint-metrics.ts`, `sprint-retro-writer.ts`, `sprint-docs-updater.ts`, `ci-reporter.ts`, `src/cli/commands/cleanup.ts`, `history.ts`, `init-steps.ts`, `src/mcp/tools/init.ts`, `cleanup.ts`, `history.ts`, `src/cli/helpers/output.ts`.

---

## 2. Findings

Severity legend: **P0** = breaking / data-loss risk; **P1** = correctness/contract drift; **P2** = clean-up / maintenance debt; **P3** = cosmetic.

### 2.1 Sprint 134 T-009 4-Way Split — VERIFIED ✅

`sprint-reporter.ts` is a pure re-export barrel. The 4-way split is structurally intact:

| Child module | Exists | LoC barrel claims |
|--------------|:------:|------------------:|
| `sprint-metrics.ts` | ✅ | 19 named + 5 type re-exports |
| `sprint-retro-writer.ts` | ✅ | 9 named + 2 type re-exports |
| `sprint-docs-updater.ts` | ✅ | 17 named + 1 type re-exports |
| `ci-reporter.ts` | ✅ | 5 named + 3 type re-exports |

No logic resides in the barrel — ADR-024/026 (god-object split) preserved.

### 2.2 ADR-009 DEBT.md Format — Migrated, not Violated (P3)

ADR-009 mandates a markdown table format for DEBT.md. The audit confirms `debt-manager.ts` no longer writes DEBT.md directly — the file is generated downstream via `memory-export.ts` (Memory V2 DB-first, per CLAUDE.md). All debt CRUD goes through `MemoryStore` (`debt-manager.ts:101-113, 242-247, 269-273, 300-302`).

This is correct architecture, but the file's **comments still describe the old behavior**, which is the source of the drift findings below.

### 2.3 Counter Accuracy — `runDecay()` Returns Always Zero in V2 (P1) ⚠️

**File/Line:** `src/orchestra/debt-manager.ts:376-404`

`runDecay()` invokes `store.decay(currentNum, decaySprints)` (line 390) but the surrounding return objects hard-code zeros:

```ts
// line 388 — early-exit, before-budget path
return { linesBefore: totalBefore, linesAfter: totalBefore, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };

// lines 392-398 — actual-decay path
return {
  linesBefore: totalBefore,
  linesAfter: totalAfter,
  archivedSprints: [],          // always empty
  removedDebtCount: 0,          // always 0 in V2
  removedPatternCount: 0,       // always 0 in V2
};
```

**Impact:** The lead question explicitly asks about counter accuracy. `DecayResult.removedDebtCount` and `removedPatternCount` are **structurally unfillable** in V2 because `store.decay()` returns no count. Consumers (e.g. `mcp/tools/cleanup.ts:113`, `cli/commands/cleanup.ts:111`) display these zeros to the user as accurate decay statistics — **this is a documented lie**.

**Recommendation (Sprint 162+):** Either (a) extend `MemoryStore.decay()` to return `{ removedDebtCount, removedPatternCount, archivedSprintIds }`, or (b) deprecate those fields and update the `DecayResult` type to drop them.

### 2.4 `BrainBudgetAudit` Field Names Lie About Units (P1)

**File/Line:** `src/orchestra/debt-manager.ts:320-329, 343-353`

Interface declares `decayableLines`, `permanentLines`, `totalLines` — but in V2 the values are **entry counts**, not line counts:

```ts
const total = store.totalCount();              // entries, not lines
const exempt = store.getByType('identity').length + store.getByType('adr').length;
const decayable = total - exempt;
return { ..., totalLines: total, permanentLines: exempt, decayableLines: decayable };
```

This propagates outward: `sprint-finalizer.ts:688` logs "Brain budget OVER: ${budgetAudit.decayableLines} decayable lines > ${memBudget} budget" — but those are entries, not lines.

The default budget value `900` (line 338, line 377) was selected per the CLAUDE.md/DECKENT.md memory budget rule "900 lines max in `.brain/`", which was a *line* budget. Reusing the same number for *entry* count is a semantic-mismatch bomb.

**Recommendation:** Rename fields to `decayableCount`, `permanentCount`, `totalCount`; reconsider the default budget for entry-based accounting; update finalizer log line.

### 2.5 Stale Comment / Drift — `archiveResolvedDebt` (P2)

**File/Line:** `src/orchestra/debt-manager.ts:284-307`

Docblock claims:
> "Moves resolved records out of DEBT.md into a separate archive file, keeping only open (unresolved) items in the active debt table."

V2 implementation (lines 297-307) performs **no file I/O**, no archive write, no DEBT.md mutation — just counts resolved entries in the DB. The comment lies about behavior.

Combined with **finding 2.6**, this function is a likely deletion candidate.

### 2.6 Dead Code — Three Exports With Zero Consumers (P2)

Verified via repo-wide grep across `src/`:

| Export | File:Line | External callers | Status |
|--------|-----------|-----------------:|--------|
| `archiveResolvedDebt` | `debt-manager.ts:291` | **0** | Unused |
| `DECAY_EXEMPT` (Set) | `debt-manager.ts:315` | **0** | Unused |
| `decay` (legacy alias) | `debt-manager.ts:411` | **0** | Unused (re-exported via `brain.ts:48` but no importer of `decay` was found) |

`DECAY_EXEMPT` references file names `'DECISIONS.md'` and `'PROJECT-IDENTITY.md'`, but `.contracts/api-surface.md` notes DECISIONS.md was relocated to `.brain/archive/pre-v2/DECISIONS.md` under Memory V2. The constant is doubly stale (unused + paths wrong).

`decay()` (line 411) is an explicit "Backward-compatible alias for runDecay" — but no caller exists. ADR-026 god-object cleanup didn't include this alias.

**Recommendation (Sprint 162+):** Delete all three. ~30 LoC removable.

### 2.7 Potential ADR-008 Violation — Direction of Import (P2)

**File/Line:** `src/orchestra/debt-manager.ts:14`

```ts
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';
```

ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) per `.contracts/api-surface.md`:
> "Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker."

`debt-manager.ts` is part of `orchestra/` but is *not* `sprint-controller.ts` / `brain.ts`. The function `handleEvaluation` is invoked by `sprint-phases.ts` (line 417, 505, 646), which itself is downstream of `sprint-controller.ts` — so the runtime behavior is fine, but the **module-level import direction** crosses the ADR-008 boundary.

**Disposition:** **UNCERTAIN** — debt-manager is logically a brain submodule; the contract may need an amendment to read "any orchestra/ module orchestrating the lifecycle may import worker.ts" or the two helper calls (`updateTaskStatus`, `releaseAllLocks`) should be moved into `sprint-phases.ts` and `handleEvaluation` invoked with status/lock callbacks injected.

### 2.8 Duplicated Sprint-Number Parsing Logic (P3)

**File/Lines:** `debt-manager.ts:58-61` (helper) vs. `debt-manager.ts:110` (inline)

```ts
function getSprintNumber(sprintId: string): number {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}
// later:
sprint_num: parseInt((task.sprintId ?? '').replace(/\D/g, ''), 10) || 0,  // line 110
```

Two different regexes for the same logical extraction. The inline version (`replace(/\D/g, '')`) is *less* strict — it would accept `'foo123'` as sprint 123. Helper is unused for the line-110 case.

**Recommendation:** Use `getSprintNumber(task.sprintId ?? '')` at line 110 for consistency.

### 2.9 Type Safety — Acceptable, No `any` ✅

Audit of both files for `any`, `as unknown as`, `// @ts-ignore`, `// @ts-expect-error`:

- `debt-manager.ts`: 3 instances of `as Record<string, unknown>` (lines 50, 237, 268) — all bounded JSON.parse coercion at the I/O boundary. Acceptable per typescript-expert skill ("Prefer `unknown` over `any`").
- `sprint-reporter.ts`: zero type-erasing constructs (pure re-export barrel).

No suppressions found in either file.

### 2.10 Dependency Hygiene — Clean ✅

- All imports use `.js` extensions (ADR-002 Node16 ESM): `debt-manager.ts:3-16`, `sprint-reporter.ts:32, 54, 79, 92`.
- No circular imports introduced (debt-manager imports only types + worker helpers; sprint-reporter imports only its 4 children).
- Single runtime dep budget (ADR-010) honored — no new third-party imports.

### 2.11 Documentation Pollution — Barrel Mostly Vestigial (P2)

**File/Line:** `src/orchestra/sprint-reporter.ts` (entire file)

Verified via grep: only 3 of the ~50 re-exports have actual external consumers through the barrel:

| Export | Consumer file(s) |
|--------|-------------------|
| `collectSprintFiles` | `cli/commands/history.ts:7`, `mcp/tools/history.ts:7` |
| `generateProjectIdentity` | `cli/commands/init-steps.ts:42`, `mcp/tools/init.ts:13` |
| `formatHumanSprintComplete` | `cli/helpers/output.ts:5` |

All other consumers (e.g. `cli/commands/cleanup.ts:4` for `cleanTasksArchive`) import directly from the child module. The barrel's purpose was backward-compatibility during the Sprint 134 T-009 split, but downstream code has largely re-pathed.

**Note:** `cleanTasksArchive` is imported elsewhere from `sprint-docs-updater.js` directly but is **not** in the barrel re-export list — the barrel is also incomplete relative to the children.

**Recommendation:** (a) Either fully deprecate the barrel (re-path the 3 remaining barrel-consumers and delete sprint-reporter.ts), or (b) restore parity with children and document that downstream code SHOULD prefer the barrel. Status quo (90%+ vestigial) is a footgun.

### 2.12 Memory V2 Coherence — Mostly Clean (P3)

`debt-manager.ts` correctly funnels every CRUD through `MemoryStore` and uses `try/finally store.close()` consistently (lines 115, 248, 275, 302, 354, 399). One subtle smell:

- `auditBrainBudget` exempt count is `getByType('identity').length + getByType('adr').length`, which mixes two semantically different decay-exempt categories. Hard-coding ADR exemption is consistent with `MemoryStore.decay()` behavior, but isn't documented in the JSDoc — readers comparing to `DECAY_EXEMPT` (which lists files, not types) may be confused.
- Every V2 branch ends with a `// No DB available — ... skipped` comment + early return (lines 117-119, 250-251, 278-279, 305-306, 357-358, 402-403). Per CLAUDE.md/DECKENT.md, Memory V2 DB is **mandatory**. These no-op fallbacks are dead branches in the steady state — keep only if a fresh-init project may transiently lack the DB; otherwise simplify.

### 2.13 Config Integrity — `decaySprints = 8` Default (P3)

**File/Line:** `debt-manager.ts:378`

```ts
const decaySprints = opts?.decaySprints ?? 8;
```

DECKENT.md mentions `memory.decay_after_sprints` as a configurable. The default `8` is hard-coded here; cross-check whether `config.ts` provides a different default (`memory.decay_after_sprints`) and whether the call sites (`sprint-finalizer.ts:686-693`) wire it through. Spot-check shows `sprint-finalizer.ts:686-693` does **not** pass `decaySprints`, so the hard-coded 8 wins regardless of config — **possible config wire-gap**, worth a focused inspection in Sprint 162.

---

## 3. Evidence — Citation Index

| Finding | File | Line(s) |
|--------|------|---------|
| 4-way split | `sprint-reporter.ts` | 1-99 |
| Counter zeros | `debt-manager.ts` | 388, 392-398 |
| Lines vs counts | `debt-manager.ts` | 320-329, 343-353; `sprint-finalizer.ts` 688 |
| `archiveResolvedDebt` stale comment | `debt-manager.ts` | 284-307 |
| Dead exports | `debt-manager.ts` | 291, 315, 411 |
| ADR-008 cross | `debt-manager.ts` | 14 |
| Duplicate parser | `debt-manager.ts` | 58-61 vs. 110 |
| `as Record` (3x) | `debt-manager.ts` | 50, 237, 268 |
| ESM `.js` ext | `debt-manager.ts` | 3-16; `sprint-reporter.ts` 32, 54, 79, 92 |
| Vestigial barrel | `sprint-reporter.ts` | full file |
| V2 fallback dead branches | `debt-manager.ts` | 117-119, 250-251, 278-279, 305-306, 357-358, 402-403 |
| Hard-coded `decaySprints=8` | `debt-manager.ts` | 378 |

---

## 4. Migration Triage

| File | Disposition | Rationale |
|------|------------|-----------|
| `src/orchestra/debt-manager.ts` | **KEEP-PRIVATE** | Internal orchestrator module; logic is project-internal sprint-lifecycle wiring. Some parts (Memory V2 patterns) could inform a public guide, but the file itself is private. Needs cleanup (findings 2.3, 2.4, 2.5, 2.6, 2.8) before any public exposure. |
| `src/orchestra/sprint-reporter.ts` | **KEEP-PRIVATE / DELETE-CANDIDATE** | Vestigial barrel; if downstream re-paths the 3 remaining consumers, the file becomes a delete-candidate. Otherwise keep as the documented "deprecated barrel" entry point. |

---

## 5. Recommendation (Sprint 162+ Work)

These are **descriptions of follow-up work**, NOT proposed code changes. No code is altered by this audit.

1. **P1 — Counter accuracy fix** (finding 2.3): Extend `MemoryStore.decay()` to return removal counts; thread through `runDecay()` so `cleanup` CLI/MCP no longer shows "0 items" lies.
2. **P1 — Rename `BrainBudgetAudit` fields** (finding 2.4): `*Lines` → `*Count` to match V2 semantics; update `sprint-finalizer.ts:688` log; reconsider numeric default `900` for entry-based accounting.
3. **P2 — Delete dead exports** (finding 2.6): Remove `archiveResolvedDebt`, `DECAY_EXEMPT`, `decay` (legacy alias). ~30 LoC.
4. **P2 — Resolve ADR-008 import direction** (finding 2.7): Either amend ADR-008 to permit orchestra-internal worker imports, or refactor to inject status/lock helpers into `handleEvaluation` from `sprint-phases.ts`.
5. **P2 — Decide barrel fate** (finding 2.11): Either re-path 3 remaining consumers and delete `sprint-reporter.ts`, or restore export parity with children.
6. **P3 — Comment cleanup** (findings 2.5, 2.12): Update `archiveResolvedDebt` docstring to match V2 behavior; document `auditBrainBudget` exempt-type computation in JSDoc.
7. **P3 — Dedup sprint-number extraction** (finding 2.8): Apply `getSprintNumber()` at line 110.
8. **P3 — `decaySprints` config wire** (finding 2.13): Inspect whether `config.memory.decay_after_sprints` is read at any call site; if not, wire it through `runDecay` options or document the hard-coded default.

---

## 6. Audit Summary

| Dimension | Result |
|-----------|--------|
| 1. Dead code | 3 unused exports (P2) + 6 V2-fallback dead branches (P3) |
| 2. ADR violations | ADR-008 import direction (P2 — UNCERTAIN); ADR-009 migrated, not violated |
| 3. Conflicting / duplicated logic | Sprint-number parsing duplicate (P3) |
| 4. Drift | `archiveResolvedDebt` comment, `BrainBudgetAudit` field names, `DECAY_EXEMPT` paths (P1+P2) |
| 5. Type safety | Clean — 0 `any`, 0 suppressions ✅ |
| 6. Dependency hygiene | Clean — `.js` ESM, no circulars ✅ |
| 7. Documentation pollution | Vestigial barrel (~94% unused externally) (P2) |
| 8. Memory V2 coherence | DB-first correctly enforced; comments lag behind (P3) |
| 9. Config integrity | Possible `decaySprints=8` config wire gap (P3) |
| 10. Migration triage | Both files KEEP-PRIVATE; barrel a DELETE-CANDIDATE on re-path |

**Overall verdict:** No P0 issues. Two P1 counter/contract bugs (findings 2.3, 2.4) and several P2 cleanup opportunities. The Sprint 134 T-009 4-way split is structurally healthy; the debt-manager carries V1→V2 migration scar tissue that has not been pruned.

---
*End of T-161-017 audit. 0 source files modified. 0 tests modified.*
