# T-161-018 — src/orchestra/ — sprint-finalizer + lifecycle + phases

**Sprint:** 161 — God-Level READ-ONLY Self-Audit (Lane 1)
**Date:** 2026-05-08
**Auditor:** w-161-018 (claude opus)
**Mode:** READ-ONLY — no source changes
**Skills:** typescript-expert

---

## 1. Scope

| File | LoC | Last Modified |
|---|---|---|
| `src/orchestra/sprint-finalizer.ts` | 1234 | 2026-05-05 |
| `src/orchestra/sprint-lifecycle.ts` | 527  | 2026-05-08 |
| `src/orchestra/sprint-phases.ts`    | 761  | 2026-05-07 |
| **Total** | **2522** | — |

> NOTE: total LoC slightly exceeds the 2000 LoC budget set in DIRECTIVES.md. The three modules are cohesively assigned in Task 18 of the explicit task list, so the audit proceeds with all three. Recommend splitting `sprint-finalizer.ts` (1234 LoC) into a dedicated task in future sprints when it crosses 1500.

### Lead Questions (DIRECTIVES.md)

1. **`cleanup_delay_ms` wire** — is the config plumbed end-to-end? ✅ wired but accessed via type-bypass cast (see F-04).
2. **`archiveOrphanTasks` pattern** — does the snapshot/preserve guard actually prevent archiving active tasks? ❌ classify is computed, preserved list is logged but never enforced (see F-08).
3. **Phase transitions** — PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP correctness? ✅ functionally correct; phase 3 (EXECUTE) lives outside `sprint-phases.ts` (in `sprint-controller.ts`) — module header omits this caveat (see F-12).

---

## 2. Findings (severity × dimension)

| ID | Severity | Dimension | File | Line(s) | Summary |
|----|----------|-----------|------|---------|---------|
| F-01 | **P1** | Type safety / Config integrity | sprint-phases.ts | 742 | `cleanup_delay_ms` accessed via `(config as unknown as Record<string, unknown>)` cast even though field is properly typed in `config-types.ts:281,511` — unnecessary type bypass. |
| F-02 | **P1** | Type safety / Config integrity | sprint-phases.ts | 637 | `fix_phase_timeout` accessed via same cast pattern; field is **NOT defined** in `ResolvedConfig` / `DeckentConfig` — a true config integrity gap, not just dead pattern. |
| F-03 | **P1** | Type safety / Config integrity | sprint-finalizer.ts | 709, 878-879, 1035-1036, 998 | Repeated `(config as unknown as Record<string, unknown>)` for `routing_engine`, `output_mode`, `auto_archive_directives`, `observability.rotation`. `routing_engine`/`output_mode`/`observability` are typed; `auto_archive_directives` is missing from config types. |
| F-04 | **P1** | Drift (claim vs behavior) | sprint-finalizer.ts | 1044-1072 | `archiveOrphanTasks` guard pattern is half-implemented: `classifyTaskFiles` computes a `preserved` list (active PENDING/EXECUTING tasks) at line 1061, logs it at 1064, but `archiveOrphanTasks(projectRoot, sprint.id)` at line 1070 **does not consume** the list. Comment at 1068 explicitly admits "archiveOrphanTasks archives all — we accept this for now". |
| F-05 | **P2** | Dead code | sprint-finalizer.ts | 129-136 | `runHonestyCheck` is a stub returning `Promise.resolve(0)`. Re-exported via `sprint-controller.ts:166`. The actual honesty check used by `finalizeSprint` is inlined into `runSelfAuditGate` at lines 314-352 — the exported stub is never called outside its own unit tests. |
| F-06 | **P2** | Dead code | sprint-phases.ts | 716-720 | `runDecayPhase` exported but has **zero external callers** (verified via grep). Decay runs inside `finalizeSprint:683-693`. The standalone wrapper is reachable only by import — no CLI / MCP / test path invokes it. |
| F-07 | **P2** | Conflicting / Duplicated logic | sprint-phases.ts | 116-156 | `toTaskEvaluation`, `now`, `readFileSafe`, `safeDashboardUpdate` are duplicated from `sprint-controller.ts` "to avoid circular init-time deps" (per comment line 116). `safeDashboardUpdate` also appears in `sprint-lifecycle.ts:196-210`. Three near-identical copies invite drift. |
| F-08 | **P2** | Conflicting / Duplicated logic | sprint-lifecycle.ts | 248-264 | Two `readdirSync(tasksDir)` cleanup loops. Loop #1 (250-253) unlinks ALL files matching `TASK_FILE_EXTENSIONS`. Loop #2 (256-263) re-scans and unlinks "stale" files matching the *same* extension filter. After loop #1 the second pass should always find nothing — defensive paranoia or unintended dead pass. |
| F-09 | **P2** | Type safety | sprint-phases.ts | 378, 408-409 | Result-extension casts `(result as TaskResult & { reconcileNotes?: string })`, `(result as TaskResult & { regressionDetected?: boolean })`, `(result as TaskResult & { ciAlerts?: string[] })`. Side-bands ad-hoc fields onto `TaskResult` instead of extending the interface in `core/types.ts`. |
| F-10 | **P2** | Type safety | sprint-finalizer.ts | 753, 761, 764 | `evaluation as unknown as string`, `evaluation as unknown as 'DONE' \| 'GO_WITH_TECH_DEBT' \| 'NO_GO'`, plus an inline TaskDNA fallback literal cast. Indicates the `TaskEvaluation` enum and the `'DONE'\|'GO_WITH_TECH_DEBT'\|'NO_GO'` string literal type are used interchangeably without a single normalization helper (one exists locally as `toTaskEvaluation` — but unused for the reverse conversion). |
| F-11 | **P2** | ADR-008 tension (documented) | sprint-phases.ts | 7-9, 101-113 | Module header acknowledges a **circular dependency** with `sprint-controller.ts`: "all cross-module references are inside function bodies (deferred execution)". ADR-008 mandates one-way dependency from Brain. The circular is mitigated by deferred execution but is still a structural exception that was not amended into ADR-008. Suggest either an ADR amendment or a refactor to a third "lifecycle/phase utilities" module. |
| F-12 | **P3** | Drift (header vs behavior) | sprint-phases.ts | 1-9 | Module header lists phases 1, 2, 4, 5, 6+7, 7, 8 as section markers — Phase 3 (EXECUTE / waitForResults) is silently absent because it lives in `sprint-controller.ts`. New readers will be confused by the gap. |
| F-13 | **P3** | Drift / orphan claim | sprint-finalizer.ts | 122-136 | Header comment "Hook Stubs (Task 13 / Task 14 / Task 15 will fill these)" — Task 14 was completed (runSelfAuditGate is implemented), Task 13 partially (writeRubricDetail), Task 15 (runHonestyCheck) is still a stub. Comment is stale roadmap documentation. |
| F-14 | **P3** | Drift / sync I/O | sprint-finalizer.ts | 645-646, 954, 967, 1059, 1089, 1103, 1175 | Sprint 139 async migration is incomplete. Mixed `existsSync + readdirSync`, `readFileSync`, `writeFileSync`, `mkdirSync` calls remain alongside the migrated `fsPromises.*` paths. ADR-005 ("Synchronous I/O") is **deprecated**, so this is a quality issue, not a hard ADR violation. |
| F-15 | **P3** | Dependency hygiene | sprint-finalizer.ts | 654-655, 740-741, 774-775, 840-841, 606 | Five `await import(...)` dynamic imports inside `finalizeSprint`: `MemoryStore`, `MEMORY_DB_FILE`, `OutcomeTracker`, `assessQuality`, `RuleEvolver`, `PromotionPipeline`. Mostly required because they would create new circular cycles. Document the rationale — currently silent. |
| F-16 | **P3** | Resilience | sprint-phases.ts | 741-757 | `setTimeout(...cleanupDelay...)` is fire-and-forget. If the Node process exits between `runCleanupPhase` returning and the timer firing, cleanup never happens — leaves `.locks/`, `.tasks/` dirty. No `unref()`/`ref()` strategy. Acceptable trade-off for `cleanup_delay_ms`, but undocumented. |
| F-17 | **P3** | Resilience | sprint-lifecycle.ts | 102-103 | Module-level mutable state (`_activeSprint`, `_isInterrupted`) requires `resetInterruptState()` for test isolation (line 116-119). Documented but fragile — any forgotten reset leaks state across tests. |
| F-18 | **P3** | Drift (interrupt blind phases) | sprint-phases.ts | 337-531, 578-662 | `runEvaluatePhase` and `runFixPhase` do not call `isInterrupted()` (exported by sprint-lifecycle). Long evaluation / fix loops cannot abort early on SIGINT — caller must wait for full phase completion. |
| F-19 | **P3** | Drift (per-task respawn serialization) | sprint-phases.ts | 449-454 | `respawnEligibleTasks` is `await`ed inside the per-task evaluation loop. Each respawn computation runs sequentially. Could be batched after the loop to avoid serial latency. |
| F-20 | **P3** | Documentation pollution | sprint-finalizer.ts | 481-501 | Docstring for `finalizeSprint` lists step `3. Update MEMORY.md with sprint learnings (trimMemoryWithHeader)` — but `trimMemoryWithHeader` is not visible in this file. The actual update happens transitively via `writeRetrospective` which itself calls `writeMemoryUpdate` etc. Reference is not actionable. |

---

## 3. Evidence (citations)

### F-01: cleanup_delay_ms cast bypass

```ts
// src/orchestra/sprint-phases.ts:742
const delayMs = (config as unknown as Record<string, unknown>).cleanup_delay_ms as number | undefined;
```

```ts
// src/core/config-types.ts:281,511
cleanup_delay_ms?: number;          // DeckentConfig
cleanup_delay_ms?: number;          // ResolvedConfig
```

The field is properly declared on both interfaces; the cast can be removed: `config.cleanup_delay_ms`.

### F-02: fix_phase_timeout — config-types.ts gap

```ts
// src/orchestra/sprint-phases.ts:637-639
const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
  ?? opts?.fixPhaseTimeoutMs
  ?? 1_800_000;
```

`fix_phase_timeout` is not declared in `src/core/config-types.ts` (grep returned 0 hits). `opts.fixPhaseTimeoutMs` IS the documented escape hatch but the cast is the actually-consulted path for users editing `.deckent/config.json`. Either:
- Add `fix_phase_timeout?: number` to `DeckentConfig` + `ResolvedConfig`, OR
- Drop the cast and expose only `RunSprintOptions.fixPhaseTimeoutMs`.

### F-03: routing_engine / output_mode / observability cast bypass + auto_archive_directives gap

```ts
// src/orchestra/sprint-finalizer.ts:709
const routingVersion = (opts?.config as Record<string, unknown> | undefined)?.['routing_engine'] as string | undefined;

// src/orchestra/sprint-finalizer.ts:1036
const autoArchive = rawCfg?.['auto_archive_directives'] ?? true;
```

`routing_engine` is typed in `config-types.ts:279,503`; `output_mode` at line 126; `observability` at lines 303,523. `auto_archive_directives` is **missing** — same problem class as F-02.

### F-04: archiveOrphanTasks guard half-wired

```ts
// src/orchestra/sprint-finalizer.ts:1055-1071
const tasksDir = join(projectRoot, '.tasks');
const sprintMatch = sprint.id.match(/sprint-(\d+)/);
if (existsSync(tasksDir) && sprintMatch) {
  const prefix = `task-${sprintMatch[1]}-`;
  const allFiles = readdirSync(tasksDir);
  const sprintFiles = allFiles.filter(f => f.startsWith(prefix));
  const { preserved } = classifyTaskFiles(tasksDir, prefix, sprintFiles);
  if (preserved.length > 0) {
    debugLog('finalizeSprint:archiveGuard', `Preserving ${preserved.length} active task files: ${preserved.slice(0, 5).join(', ')}${preserved.length > 5 ? '...' : ''}`);
  }
}
// Step 12b-iii: Archive only completed tasks (archiveOrphanTasks archives all — we accept this for now
// since the snapshot provides rollback capability)
const count = archiveOrphanTasks(projectRoot, sprint.id);
```

`preserved` is computed and logged but **never passed** to `archiveOrphanTasks`. `archiveOrphanTasks` (sprint-docs-updater.ts:685) also has no `preserved` parameter. The `createPreArchiveSnapshot` rollback safety net is real but the "selective archiving" promised by the comment is fictional.

### F-05: runHonestyCheck is dead

```ts
// src/orchestra/sprint-finalizer.ts:129-136
export async function runHonestyCheck(
  _projectRoot: string,
  _sprintId: string,
  _results: TaskResult[],
): Promise<number> {
  // Stub: returns 0 violations (no-op until Task 5 integrates)
  return 0;
}
```

Verified: only references are sprint-controller.ts:166 (re-export), tests/orchestra/sprint-finalizer.test.ts:217-241 (unit tests), and design/plan markdown files. No production caller. The actual honesty check is inlined at sprint-finalizer.ts:314-352 inside `runSelfAuditGate`.

### F-06: runDecayPhase has no callers

```ts
// src/orchestra/sprint-phases.ts:716-720
export function runDecayPhase(projectRoot: string, sprintId: string): void {
  try {
    runDecay(projectRoot, sprintId);
  } catch (e) { debugLog('runDecayPhase:runDecay', e); }
}
```

Verified: grep for `runDecayPhase(` matched only the definition itself plus a markdown audit doc (`.deckent/sprint-god-analysis/...`). The DECAY phase that actually runs is invoked from `finalizeSprint:683-693` via `runDecay()`.

### F-07: Triple `safeDashboardUpdate` copies

```ts
// src/orchestra/sprint-phases.ts:142-156   (local copy)
function safeDashboardUpdate(projectRoot: string, sprint: Sprint, errorMessage: string): void { ... }

// src/orchestra/sprint-lifecycle.ts:196-210   (exported)
export function safeDashboardUpdate(projectRoot: string, sprint: Sprint, errorMessage: string): void { ... }

// header comment on sprint-phases.ts:141: "mirrors sprint-controller's private helper"
```

The `phases` and `lifecycle` copies are byte-equivalent. The third copy (in sprint-controller.ts, per comment) is the original. Three sources of truth.

### F-08: Two-pass cleanup in sprint-lifecycle.ts

```ts
// src/orchestra/sprint-lifecycle.ts:248-264
const tasksDir = join(projectRoot, TASKS_DIR);
if (existsSync(tasksDir)) {
  for (const file of readdirSync(tasksDir).filter(f => TASK_FILE_EXTENSIONS.some(ext => f.endsWith(ext)))) {
    try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTaskFile', e); }
  }
}
if (existsSync(tasksDir)) {
  for (const file of readdirSync(tasksDir)) {
    if (TASK_FILE_EXTENSIONS.some(ext => file.endsWith(ext))) {
      const fullPath = join(tasksDir, file);
      if (isStaleTaskFile(fullPath)) {
        try { unlinkSync(fullPath); } catch (e) { debugLog('cleanup:unlinkStaleTaskFile', e); }
      }
    }
  }
}
```

After loop #1 unlinks all matching files, loop #2's `isStaleTaskFile` check is unreachable for files that were successfully removed. Only files where `unlinkSync` silently failed in loop #1 (caught and logged via `debugLog`) reach loop #2. Effectively a paranoid retry of a single failed delete — but written as if it were independent logic.

### F-11: Documented circular dep with sprint-controller.ts

```ts
// src/orchestra/sprint-phases.ts:7-9
// NOTE: This module and sprint-controller.ts form a safe circular
// dependency. All cross-module references are inside function bodies
// (deferred execution), never at module initialization time.

// src/orchestra/sprint-phases.ts:101-113
import {
  BrainError,
  readContext,
  planSprint,
  writeSprintState,
  spawnWorkers,
  buildSpawnRetryHint,
  waitForResults,
  finalizeSprint,
  cleanup,
} from './sprint-controller.js';
```

These imports — pulled at module load — are real circular dependencies. The mitigation (function-body usage) works at runtime but TypeScript's module graph still shows the cycle. ADR-008 ("one-way dependency, Brain is centre") does not formally accept this exception.

---

## 4. Migration Triage

| File | Classification | Reason |
|------|----------------|--------|
| `sprint-finalizer.ts` | **KEEP-PRIVATE** | Deckent-internal sprint orchestration — finalize, decay, retro, gate, post-finalize hooks. Tightly coupled to Deckent's internal state machine; no value as a generic library export. |
| `sprint-lifecycle.ts` | **KEEP-PRIVATE** | Internal lifecycle: SIGINT interrupt handling, pause/resume, cleanup. Tightly bound to `.tasks/`, `.locks/`, tmux/spawn-backend abstractions. |
| `sprint-phases.ts`    | **KEEP-PRIVATE** | Phase orchestration glue. Depends on `sprint-controller`, debt-manager, mid-sprint-adapter — all Deckent-internal. |

No symbols here are candidates for `MIGRATE-PUBLIC`. No symbols are full `DELETE-CANDIDATE`s — but two are partial candidates pending product owner decision:

- `runHonestyCheck` (F-05) — stub never wired; recommend either (a) delete + remove re-export + remove tests, or (b) actually wire it (the sprint-134 plan intended this).
- `runDecayPhase` (F-06) — no external caller; recommend either (a) delete, or (b) expose via CLI for manual trigger (`deckent decay --sprint sprint-NNN`).

**Triage UNCERTAIN** entries:
- The `safeDashboardUpdate` triple-copy (F-07) — single owner debate: should it live in `sprint-lifecycle.ts` (current export), `sprint-controller.ts` (current original per comment), or be promoted to `monitor/auditor.ts` next to `updateDashboard`?

---

## 5. Recommendations (Sprint 162+ Work — NOT a code change here)

> Each recommendation is **a description of work**, not a patch. Per Sprint 161 read-only mandate, this audit produces no source diff.

### R-01 — Fix config type bypass (P1, addresses F-01/F-02/F-03)
**Effort:** low (~1 hour). **Risk:** none — adding fields, not removing.
1. Add to `src/core/config-types.ts` (both `DeckentConfig` and `ResolvedConfig`):
   - `fix_phase_timeout?: number` (default 1_800_000)
   - `auto_archive_directives?: boolean` (default true)
2. Remove the four `(config as unknown as Record<string, unknown>)` casts in `sprint-finalizer.ts` (lines 709, 879, 1036) and `sprint-phases.ts` (lines 637, 742).
3. Replace the `as Record<string, unknown>` access for already-typed fields (`routing_engine`, `output_mode`, `observability.rotation`) with direct access.
**Acceptance:** `tsc --noEmit` clean; grep `as unknown as Record<string, unknown>` in `sprint-finalizer.ts`/`sprint-phases.ts` returns 0.

### R-02 — Wire archiveOrphanTasks guard or drop the dead computation (P1, F-04)
**Effort:** low (~1 hour).
- Option A (preferred): extend `archiveOrphanTasks(projectRoot, sprintId, options?: { excludeFiles?: string[] })` and pass `preserved` from `classifyTaskFiles`.
- Option B (cheap): delete the `classifyTaskFiles` call + `preserved` log if the snapshot rollback is sufficient. Update the misleading "Step 12b-iii" comment.
**Acceptance:** if A — active PENDING/EXECUTING task files remain in `.tasks/` after a sprint that errors out mid-flight. Test: integration test that pauses a worker, finalizes, asserts file existence.

### R-03 — Decide runHonestyCheck / runDecayPhase fate (P2, F-05/F-06)
**Effort:** low. **Decision required:** keep stubs or delete.
- `runHonestyCheck`: if intended (sprint-134 plan said yes), wire it inside `finalizeSprint` and remove the inline duplicate at lines 314-352. Otherwise remove the stub, the re-export, and `tests/orchestra/sprint-finalizer.test.ts` references.
- `runDecayPhase`: expose via `deckent decay` CLI command, OR delete (decay already runs inside finalize).
**Acceptance:** no exported function in `src/orchestra/` lacks at least one production caller.

### R-04 — Consolidate `safeDashboardUpdate` (P2, F-07)
**Effort:** low. Move the canonical implementation to `monitor/auditor.ts` next to `updateDashboard`; export from there. Delete the two duplicate copies in `sprint-phases.ts` and `sprint-lifecycle.ts`. Same treatment optionally for `now()`/`readFileSafe()`.
**Acceptance:** grep `function safeDashboardUpdate` returns 1 hit.

### R-05 — Drop the dead second pass in sprint-lifecycle.cleanup (P2, F-08)
**Effort:** trivial. Either delete loop #2 (lines 256-263) entirely, or refactor loop #1 to retry-on-failure with a small delay. The current double-pass adds no protection — both loops use the same filter + the second never finds files that loop #1 successfully removed.
**Acceptance:** cleanup function ≤ ~30 LoC.

### R-06 — Move ad-hoc `result` extension fields into TaskResult (P2, F-09)
**Effort:** low (~30 min).
Add `reconcileNotes?`, `regressionDetected?`, `ciAlerts?` to `TaskResult` in `core/types.ts`. Drop the three `(result as TaskResult & { ... })` casts in `sprint-phases.ts`.
**Acceptance:** zero `result as TaskResult &` patterns in the codebase.

### R-07 — ADR-008 amendment OR phase-helpers extraction (P2, F-11)
**Effort:** medium.
- Option A — amendment: write ADR-008-V2 (or supplement) that explicitly accepts the `sprint-phases.ts ↔ sprint-controller.ts` deferred-execution circular as a permitted pattern. Cost: 1 ADR, no code change.
- Option B — refactor: extract the pieces of `sprint-controller.ts` that `sprint-phases.ts` imports (`BrainError`, `readContext`, `planSprint`, `writeSprintState`, `spawnWorkers`, `buildSpawnRetryHint`, `waitForResults`, `finalizeSprint`, `cleanup`) into a third "phase-utilities" module. Cost: moderate refactor. Benefits: ADR-008 cleanly satisfied.

### R-08 — Sync→async I/O migration completion (P3, F-14)
**Effort:** medium. Continue the Sprint 139 async-migration. Convert remaining `existsSync + readFileSync + writeFileSync` blocks (lines 645-646, 954, 967, 1059, 1089, 1103, 1175 in sprint-finalizer.ts) to `fsPromises` equivalents. Defer until ADR-005 is formally re-affirmed or replaced.

### R-09 — Stale comments cleanup (P3, F-12/F-13/F-20)
**Effort:** trivial. (a) Add Phase-3 note to sprint-phases.ts header. (b) Update the "Hook Stubs" header comment on sprint-finalizer.ts:122. (c) Drop the "trimMemoryWithHeader" reference from finalizeSprint docstring or replace with the actual function name.

### R-10 — Interrupt-aware long phases (P3, F-18)
**Effort:** low. Inject `isInterrupted()` checks at the start of each iteration of the per-task loops in `runEvaluatePhase` and `runFixPhase`. Allows SIGINT to abort during long evaluations.

---

## 6. ADR Cross-Reference

| ADR | Status w.r.t. these files | Notes |
|---|---|---|
| ADR-001 (TS+ESM) | ✅ Compliant | Strict TS, ESM with `.js` extensions throughout. |
| ADR-002 (Node16 resolution) | ✅ Compliant | All imports use `.js` extension. |
| ADR-005 (Synchronous I/O) | ⚠️ Deprecated | Mixed sync/async; tracked under F-14, not a hard violation. |
| ADR-006 (spawnSync security) | ✅ Compliant | `spawnSync` calls use `{ cwd, timeout, encoding }` options consistently. |
| ADR-008 (one-way Brain import) | ⚠️ Tension | `sprint-phases.ts ↔ sprint-controller.ts` circular — F-11. Not formally amended. |
| ADR-009 (DEBT.md format) | n/a | DEBT writes go through `debt-manager.ts`. |
| ADR-024/026 (god-object split) | ✅ Compliant | sprint-controller has been progressively split; current sizes acceptable. |
| ADR-029/030 (managed-docs) | ✅ Compliant | `updateProjectDocs` invocation at sprint-finalizer.ts:869 honors registry. |
| ADR-035 (verification protocol) | ✅ Compliant | Event channels (`SPRINT_PHASE_CHANGE`, `METRIC_EMITTED`, `GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`) emitted with proper from/to authority, matching auditor↔brain protocol. |
| ADR-037 (RBAC authority matrix) | ✅ Compliant | `writeEvent(..., 'auditor', 'brain', CHANNELS.GATE_COMPUTED, ...)` correctly attributes the auditor role even though the call site is in `finalizeSprint`. |
| ADR-038 (dead-code disposition) | ⚠️ New candidates | F-05 (`runHonestyCheck`), F-06 (`runDecayPhase`) — recommend Sprint 162 review. |
| ADR-039 (self-modifying detection) | n/a | Not applicable to this audit (read-only). |
| ADR-043 (hot-fix subagents) | n/a | — |

---

## 7. Cohesion / Architectural Signals

- **finalizeSprint is doing too much.** The function is 730+ LoC (sprint-finalizer.ts:502-1234) with 14 numbered steps. Steps 1-9 are sprint accounting; 10-13 are reporting/observability/archive; 14 is post-finalize hooks. The `breadcrumb` debugLogs (lines 874, 903, 973, 995, 1010, 1033, 1046, 1075, 1082, 1100, 1182) are evidence the author themselves wanted phase markers. Sprint 162+ candidate: split into `finalizeMetrics`, `finalizeReporting`, `finalizeRetention`, `finalizePostHooks` — each independently testable.
- **Cleanup duplication on the file-system side:** sprint-finalizer.ts (Step 12-12d) does archive/retention/cleanTasksArchive/sprintFileRetention, then sprint-lifecycle.ts cleanup() unlinks remaining task files. Two cleanup pipelines run in sequence at sprint end. Audit if one of them is now redundant given the retention work.
- **Event-stream broadcasts are well-placed.** Phase transition events at 517-521, 601-605, 1213-1217 cleanly broadcast PLAN→EXECUTE, EVALUATE→RETRO, RETRO→CLEANUP. The header phase markers in sprint-phases.ts mirror this. Consumers (auditor, dashboard) get a complete trail.

---

## 8. Summary

| Severity | Count | Top File |
|---|---|---|
| **P1** | 4 | sprint-finalizer.ts (3) + sprint-phases.ts (1) |
| **P2** | 7 | distributed across all three files |
| **P3** | 9 | distributed |

**Highest-leverage Sprint 162+ work:**
1. R-01 (config type bypass) — 1 hour, removes 5 type bypasses, no behavior change.
2. R-02 (archiveOrphanTasks guard wire) — 1 hour, fixes a real safety gap.
3. R-03 (runHonestyCheck / runDecayPhase decision) — needs product call but trivial implementation cost.

**Module health verdict:** Functionally sound. Phase transitions execute correctly; retro/decay/cleanup work. The technical-debt surface is dominated by **incremental migration leftovers** (Sprint 139 async, Sprint 134 hook stubs, the half-wired archive guard) rather than fundamental design issues. None of the P1 items are correctness bugs that would NO_GO a production sprint — but R-02 in particular leaves a window where active-task files could be archived during a mid-sprint resume.

— end of T-161-018 —
