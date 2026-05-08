# T-161-023 — src/orchestra/ — sprint-utils + sprint-docs-updater + remaining

**Sprint:** 161 — God-Level READ-ONLY Self-Audit (Lane 1)
**Date:** 2026-05-08
**Auditor:** w-161-023 (claude opus)
**Mode:** READ-ONLY — no source changes
**Skills:** typescript-expert

---

## 1. Scope

| File | LoC | Notes |
|------|----:|-------|
| `src/orchestra/sprint-utils.ts` | 361 | Explicit Task 23 file — pure utilities, sprint state, classification, provider resolution. |
| `src/orchestra/sprint-docs-updater.ts` | 782 | Explicit Task 23 file — managed-docs runner, project identity, debt auto-resolve, ADR auto-draft, DIRECTIVES archive, orphan-task archive. |
| `src/orchestra/sprint-docs-helpers.ts` | 346 | Pure builders for sprint log + project identity + DIRECTIVES placeholder + ADR markdown. |
| `src/orchestra/index.ts` | 109 | Public API barrel re-exporting tmux + brain + doc-updater + routing-v2 + ecosystem-intelligence symbols. |
| `src/orchestra/doc-updaters/index.ts` | 18 | Plugin barrel + auto-registration of 4 built-in updaters. |
| `src/orchestra/doc-updaters/registry.ts` | 28 | DocUpdater registry: `registerUpdater`, `runAllUpdaters`, `getRegisteredUpdaters`, `clearUpdaters`. |
| `src/orchestra/doc-updaters/types.ts` | 28 | `DocUpdater`, `DocUpdateContext`, `DocUpdateResult` interfaces. |
| `src/orchestra/doc-updaters/changelog.ts` | 91 | Built-in changelog updater — Keep-a-Changelog format. |
| `src/orchestra/doc-updaters/metrics-updater.ts` | 91 | **NEVER registered** — confirmed dead code (single grep hit in own file). |
| **Total** | **1854** | within ≤2000 LoC budget |

### Tasks NOT covered here (covered elsewhere)

T-13 brain/sprint-controller, T-14 planner/task-builder, T-15 result-evaluator/quality-assessor, T-16 task-router/rule-evolver/outcome-tracker, T-17 debt-manager/sprint-reporter, T-18 sprint-finalizer/lifecycle/phases, T-19 tmux/spawn-backend-docker, T-20 spawn-backend (subprocess), T-21 mid-sprint-adapter/result-collector, T-22 promotion-pipeline/temp-skill-generator. ~50 other orchestra/ files (managed-docs subdir, decision-engine, multi-agent, etc.) remain unaudited in Sprint 161 — flag for Sprint 162+.

### Lead Questions (DIRECTIVES.md)

1. **`archiveOrphanTasks` pattern — correctly used?** ⚠️ Function works, but co-exists with a *separately-named* `cleanTasksArchive` that targets a **different** archive directory; documentation conflates them. See F-09, F-12. T-018 already found that the upstream guard is half-wired (preserved-list logged but not enforced).
2. **ADR governance integration wire?** ✅ ADR injection lives in `task-builder.ts:753, 830` and `core/rule-generator.ts` — none of those files are in this audit's scope. Within-scope contribution: `autoDraftDecisions` (`sprint-docs-updater.ts:381`) auto-creates **PROPOSED** ADR stubs for new `src/` directories at sprint end. Stubs are written without i18n awareness (F-17) and without a phase guard (unlike `archiveDirectives`).

---

## 2. Findings (severity × dimension)

| ID | Severity | Dimension | File | Line(s) | Summary |
|----|----------|-----------|------|---------|---------|
| F-01 | **P1** | Dead code | `doc-updaters/metrics-updater.ts` | 1-91 | `sprintMetricsUpdater` defined and exported but **never imported or registered** anywhere in src/. Only registered updaters are the four in `doc-updaters/index.ts:15-18` (changelog, sprint-log, readme-metrics, health-check). DELETE-CANDIDATE. |
| F-02 | **P1** | Conflicting / Duplicated logic | `sprint-utils.ts` + `result-evaluator.ts` | utils:62-75 / eval:23-61 | `isSourceCodeDir` and `isDocTask` re-implemented in **both** modules with identical (but slightly drifted) bodies. `result-evaluator.ts:23` defines a private `isSourceCodeDir` instead of importing the exported one. Two sources of truth invite drift. |
| F-03 | **P1** | Conflicting / Duplicated logic | 6 modules | various | `readFileSafe` duplicated **6×**: `core/utils.ts:64` (canonical), `sprint-utils.ts:47` (exported), `sprint-docs-updater.ts:42` (private), `sprint-phases.ts:132` (private), `sprint-retro-writer.ts:34` (private), `sprint-metrics.ts:17` (private). One canonical exporter exists in core/ but orchestra/ files refuse to depend on it. |
| F-04 | **P1** | ADR-006 violation | `sprint-docs-updater.ts` | 387 | `execSync('git diff --name-status HEAD~1', …)` violates the **ADR-006 spawnSync security pattern** (string-style shell command, not array form). `spawnSync` IS used elsewhere in this file (lines 204, 232 for vitest), so the safe pattern is known — `execSync` here is an inconsistent regression. Input is hard-coded so direct injection risk = low; ADR violation severity = high. |
| F-05 | **P2** | Drift (header vs reality) | `index.ts` | 9-19, 33-40 | Header doc-block claims "Public doc-updater API (sprint-reporter.ts internal + external plugin authors)" — but `sprint-reporter.ts` does **not** import from this barrel. The actual consumer is `sprint-docs-updater.ts:15` which imports `runAllUpdaters` from `./doc-updaters/registry.js` directly, plus a side-effect import of `./doc-updaters/index.js`. Header lies about the consumer. |
| F-06 | **P2** | Drift (header doc vs reality) | `index.ts` | 9-19 | Header lists 9 "public functions" — but lines 96-109 actually export **~16 more** (OutcomeTracker, RoutingOutcome, LearningsData, SynergyEntry, assessQuality, assessSkillRelevance, QualityScore, RuleEvolver, PromotionPipeline, MidSprintAdapter, generateProjectConventionsSkill, generateDataDrivenSkills, filterSkillPrompts, filterSkillPromptsByDNA, computeSkillRelevance, analyzeNewSkill, persistSkillActivation). Header is stale relative to the file's actual surface. |
| F-07 | **P2** | Dead code (interface field) | `doc-updaters/types.ts` | 23 | `DocUpdater.internal: boolean` is set on every updater (`changelog.ts:18`, `health-check.ts`, `readme-metrics.ts`, `sprint-log.ts`, `metrics-updater.ts:12`) but **never consumed** — grep `\.internal\s` / `u\.internal` / `updater\.internal` returns zero hits. The field has no behavior. |
| F-08 | **P2** | Type safety | `doc-updaters/metrics-updater.ts` | 70-72 | `(sprintResult as unknown as Record<string, unknown>).usageData` — side-bands extra fields onto `SprintResult`. Same antipattern flagged in T-018 F-09 for `TaskResult`. The proper fix is to extend `SprintResult` in `core/types.ts` with optional `usageData`. (Compounded by F-01 — this code is dead anyway.) |
| F-09 | **P2** | Drift (claim vs behavior) / Dead path | `sprint-docs-updater.ts` | 743-782 | `cleanTasksArchive` retention loop calls `rmdirSync(dirPath)` **without** the `recursive` option (line 770). Inline comment admits "Best-effort: non-empty dirs (nested) are left as-is" — meaning any nested subdirectory inside `.tasks/archive/sprint-NNN/` defeats the retention policy. Real-world risk: `cleanup.ts:193` writes `.tasks/archive/sprint-{id}/<files>` but if any future code adds nested dirs (or `.deckent/sprint-141-analysis-archive` style), retention silently no-ops. |
| F-10 | **P2** | Resilience / Observability | `doc-updaters/registry.ts` | 22-25 | `runAllUpdaters` swallows ALL exceptions with `catch { return { … reason: 'error' } }` — no `debugLog`, no error message, no stack. When changelog/sprint-log/health-check/readme-metrics throws, the failure is invisible to the auditor and the user. Compare to `sprint-docs-updater.ts:117` which at least uses `debugLog`. |
| F-11 | **P2** | Config integrity (ADR-004) | `sprint-docs-updater.ts` | 86-110 | `updateProjectDocs` builds a **synthetic** default `ResolvedConfig` with hard-coded values when `config` is undefined (e.g. `coverage_threshold: 90`, `max_workers: 8`, `auto_docs.tier3: false`). These are NOT the result of the 3-layer merge defined in ADR-004 (`config-loader.ts → loadConfig()`). Two divergent default paths exist. Either drop the fallback or call `loadConfig()`. |
| F-12 | **P3** | Documentation pollution / Confusing names | `sprint-docs-updater.ts` | 675-684, 736-742 | Two distinct archives with confusingly similar prose: `archiveOrphanTasks` writes to `.brain/archive/sprint-NNN-tasks/` (line 714); `cleanTasksArchive` cleans `.tasks/archive/` (line 744). They are NOT a producer/consumer pair — they target **different** directories. New maintainer assumes the cleaner cleans what the archiver wrote — incorrect. Rename one of them or unify under a single archive root. |
| F-13 | **P3** | Documentation / @internal annotation gap | `sprint-utils.ts` | 224-262, 47-57 | Sprint-state functions (`writeSprintState`, `readSprintState`, `clearSprintState`) are exported but used **only** within orchestra/. Compare with peers in the same file that DO carry `@internal` JSDoc tags: `isStaleTaskFile:79`, `isTmuxProvider:94`, `resolveDefaultUsageCli:118`, `resolveTaskProvider:149`, `getProviderAdapterForTask:170`. Inconsistent `@internal` discipline across the same file. Same gap for `readFileSafe`, `now`, `readSubprocessWorkerLog`, `hasSubprocessWorkerLog`. |
| F-14 | **P3** | Type safety | `sprint-docs-updater.ts` | 326-371 | `autoResolveDebt(…, evaluations: Map<string, string>, …)` accepts string-typed values but the body checks both `ev === 'DONE' \|\| ev === TaskEvaluation.DONE` (line 341). The defensive `\|\|` admits the caller passes a heterogeneous map. Either narrow the parameter type to `Map<string, TaskEvaluation>` or normalize at call site. |
| F-15 | **P3** | Robustness / Cross-platform | `sprint-docs-helpers.ts` | 301-310 | `parseAddedSrcFiles` splits diff output on `\n`, then matches `/^A\t(.+)$/`. On Windows the diff may contain `\r\n`, leaving `\r` at end of `match[1]`. `addedFiles.includes(dirPrefix + entry)` (sprint-docs-updater.ts:416) would then fail to match the entry name (which has no `\r`). No CI matrix runs Windows so the bug is dormant but real. |
| F-16 | **P3** | Dependency hygiene | `sprint-docs-updater.ts` | 15-18 | Two imports of the same path: `import { runAllUpdaters } from './doc-updaters/registry.js'` (named) AND `import './doc-updaters/index.js'` (side-effect, for auto-register). Couples the file to *both* the registry implementation and the auto-register barrel. A barrel-level re-export of `runAllUpdaters` could consolidate to a single import line. |
| F-17 | **P3** | ADR-032 i18n drift | `sprint-docs-helpers.ts` + `sprint-docs-updater.ts` | helpers:191-221, 334-346 / updater:444-446 | `buildAdrEntry` (helpers:334) and `buildDirectivesPlaceholder` (helpers:191) hard-code Turkish/English mixed strings (`# DIRECTIVES — (Sprint N için hazırlanıyor)`, `**Status:** PROPOSED`, `**Context:** New module added in Sprint #N`). ADR-032 (i18n Pattern System) requires TR/EN content variation through the i18n layer; these helpers bypass it. Auto-drafted ADRs and DIRECTIVES placeholders are therefore locale-fixed. |
| F-18 | **P3** | Resilience / ADR-029 wire | `sprint-docs-updater.ts` | 113-120 | `runManagedDocUpdates` is wrapped in try/catch and on error returns ONLY `builtinResults` with `debugLog` — the user sees nothing visible. ADR-029 ("Managed-Docs Universalization") promotes user-defined docs as first-class. Failures should surface to the sprint summary at minimum. |
| F-19 | **P3** | Sync I/O (deprecated ADR-005) | `sprint-docs-updater.ts` + others | 3, 67, 207, 237, 314, 367, 446, 496, 565, 660, 715, 722, 765 | Heavy synchronous I/O (`readFileSync`/`writeFileSync`/`readdirSync`/`copyFileSync`/`unlinkSync`/`mkdirSync`/`rmdirSync`/`existsSync`). ADR-005 ("Synchronous I/O") is **deprecated** so this is a code-quality issue, not a hard violation — but it is the same antipattern T-018 noted for `sprint-finalizer.ts`. Async migration is incomplete. |
| F-20 | **P3** | Documentation pollution | `index.ts` | 1-40 | Header doc-block lists *consumers* of each public function (e.g. `runSprint — execute a full sprint (start.ts, test-run.ts, server.ts, mcp/start.ts)`). Such consumer lists rot: any time a CLI or MCP file is renamed/moved the header silently drifts. Prefer linking to source via `// USAGE: see cli/commands/start.ts` only when the assertion is mechanically verifiable. |

### Out-of-scope but discovered during audit (informational)

- `extractGoNogoCriteria` regex (sprint-utils.ts:332): pattern `(?:Kanıt|Kan[ıi]t|Proof|Doğrulama|Verify|Verification|Test:)` includes `Test:` ending in `:` — combined with the trailing `(?:\*\*)?:` the regex would match `Test::` (double colon) literals. Tiny edge case; cosmetic.
- `sprint-utils.ts:281`: `validWorkers = new Set(state.taskIds.map(id => 'w-${id}'))` — assumes worker IDs follow the `w-{taskId}` convention. ADR-037 RBAC and tmux backend both honor this, but Docker backend uses `docker-{taskId}` (per `sprint-finalizer.ts` and `task-161-023.hb` workerId `docker-161-023`). `detectOrphanWorkers` would incorrectly classify Docker-spawned workers as orphans. P2-ish but file-out-of-scope as written. Recommend cross-check in Sprint 162.

---

## 3. Evidence (citations)

### F-01: metrics-updater.ts is dead

```ts
// src/orchestra/doc-updaters/metrics-updater.ts:9
export const sprintMetricsUpdater: DocUpdater = { … };
```

```ts
// src/orchestra/doc-updaters/index.ts:15-18 (only 4 registrations, no sprintMetricsUpdater)
registerUpdater(changelogUpdater);
registerUpdater(sprintLogUpdater);
registerUpdater(readmeMetricsUpdater);
registerUpdater(healthCheckUpdater);
```

```text
$ grep -rn "sprintMetricsUpdater\|metrics-updater" /workspace/src
src/orchestra/doc-updaters/metrics-updater.ts (1 hit — own file)
```

### F-02: isDocTask / isSourceCodeDir duplicated

```ts
// src/orchestra/sprint-utils.ts:62-75
export function isSourceCodeDir(dir: string): boolean { … }
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}

// src/orchestra/result-evaluator.ts:23-61 (private re-implementation)
function isSourceCodeDir(dir: string): boolean { … }
…
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}
```

`result-evaluator.ts` could `import { isDocTask, isSourceCodeDir } from './sprint-utils.js'`.

### F-03: readFileSafe duplicated 6×

```text
src/core/utils.ts:64                    export function readFileSafe(…) {…}   ← canonical
src/orchestra/sprint-utils.ts:47        export function readFileSafe(…) {…}   ← orchestra duplicate
src/orchestra/sprint-docs-updater.ts:42 function readFileSafe(…) {…}          ← private duplicate
src/orchestra/sprint-phases.ts:132      function readFileSafe(…) {…}          ← T-018 already noted
src/orchestra/sprint-retro-writer.ts:34 function readFileSafe(…) {…}
src/orchestra/sprint-metrics.ts:17      function readFileSafe(…) {…}
```

### F-04: ADR-006 spawnSync violation

```ts
// src/orchestra/sprint-docs-updater.ts:386-394
let diffOutput: string;
try {
  diffOutput = execSync('git diff --name-status HEAD~1', {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 10000,
  });
} catch (e) {
```

ADR-006 mandates the `spawnSync('git', ['diff', '--name-status', 'HEAD~1'], { … })` array form. The very same file uses `spawnSync` correctly at lines 204 and 232 — this is an internal inconsistency.

### F-05: index.ts header lies about consumer

```ts
// src/orchestra/index.ts:33
//   Public doc-updater API (sprint-reporter.ts internal + external plugin authors):
```

```text
$ grep -n "registerUpdater\|runAllUpdaters" src/orchestra/sprint-reporter.ts
(no hits)
$ grep -n "runAllUpdaters" src/orchestra/sprint-docs-updater.ts
src/orchestra/sprint-docs-updater.ts:15 import { runAllUpdaters } from './doc-updaters/registry.js';
```

The actual consumer is `sprint-docs-updater.ts`, not `sprint-reporter.ts`.

### F-06: index.ts header omits exported symbols

```ts
// src/orchestra/index.ts:9-19 (header — claimed surface)
//   runSprint, readContext, planSprint, confirmDraftTasks, buildWorkerPrompt,
//   cleanup, finalizeSprint, runDecay, BrainError
```

```ts
// src/orchestra/index.ts:96-109 (additional exports NOT in header)
export { OutcomeTracker } from './outcome-tracker.js';
export type { RoutingOutcome, LearningsData, SynergyEntry } from './outcome-tracker.js';
export { assessQuality, assessSkillRelevance } from './quality-assessor.js';
export type { QualityScore } from './quality-assessor.js';
export { RuleEvolver } from './rule-evolver.js';
export { PromotionPipeline } from './promotion-pipeline.js';
export { MidSprintAdapter } from './mid-sprint-adapter.js';
export { generateProjectConventionsSkill, generateDataDrivenSkills } from './temp-skill-generator.js';
export { filterSkillPrompts, filterSkillPromptsByDNA, computeSkillRelevance } from './prompt-token-optimizer.js';
export { analyzeNewSkill, persistSkillActivation } from './ecosystem-intelligence.js';
```

### F-07: DocUpdater.internal field unused

```ts
// src/orchestra/doc-updaters/types.ts:23
export interface DocUpdater {
  name: string;
  tier: 1 | 2 | 3;
  internal: boolean;     // ← NEVER read
  targetFile: string;
  …
}
```

```text
$ grep -rn "\.internal\s\|u\.internal\|updater\.internal" /workspace/src
(no hits)
```

### F-08: SprintResult side-band cast

```ts
// src/orchestra/doc-updaters/metrics-updater.ts:70-72
const usageData = (sprintResult as unknown as Record<string, unknown>).usageData as
  | { totalCalls: number; totalTokens: number }
  | undefined;
```

### F-09: cleanTasksArchive non-recursive rmdirSync

```ts
// src/orchestra/sprint-docs-updater.ts:763-773
const files = readdirSync(dirPath);
for (const file of files) {
  try { unlinkSync(join(dirPath, file)); } catch { /* skip */ }
}
try {
  rmdirSync(dirPath);
} catch {
  // Best-effort: non-empty dirs (nested) are left as-is
}
```

`unlinkSync` only removes flat files; subdirectories silently survive both passes.

### F-10: runAllUpdaters silent error swallow

```ts
// src/orchestra/doc-updaters/registry.ts:22-25
try {
  return u.run(ctx);
} catch {
  return { file: u.targetFile, updated: false, reason: 'error' };
}
```

No log, no `debugLog(...)`, no error message embedded in `reason`.

### F-11: Synthetic default ResolvedConfig divergence

```ts
// src/orchestra/sprint-docs-updater.ts:87-110
const resolvedConfig: ResolvedConfig = config ?? {
  mode: 'performance',
  activeModeConfig: {
    max_workers: 8,
    brain_model: …,
    default_model: …,
    haiku_allowed: true,
    brain_planning: 'auto',
  },
  modes: {} as ResolvedConfig['modes'],
  language: 'en',
  …
  coverage_threshold: 90,
  max_reroutes: 3,
  reroute_on_tech_debt: false,
  …
};
```

These hard-coded defaults are NOT the values produced by ADR-004's 3-layer merge. The fallback path is a phantom config.

### F-12: Two confusingly-named archives

```ts
// archiveOrphanTasks — writes .brain/archive/sprint-NNN-tasks/
const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, `${sprintId}-tasks`);

// cleanTasksArchive — cleans .tasks/archive/
const archiveDir = join(projectRoot, '.tasks', 'archive');
```

Two distinct directories with different sprint-id namespacing patterns (`sprint-NNN-tasks` vs `sprint-{id}` from `cleanup.ts:193`).

### F-13: @internal discipline gap

```ts
// sprint-utils.ts — peers with @internal:
export function isStaleTaskFile(...) { … }    // line 79: @internal
export function isTmuxProvider(...) { … }     // line 94: @internal
export function resolveDefaultUsageCli(...) { … }   // line 118: @internal

// sprint-utils.ts — peers WITHOUT @internal but only used internally:
export function readFileSafe(...) { … }       // line 47: no @internal
export function now(...) { … }                // line 55: no @internal
export function writeSprintState(...) { … }   // line 227: no @internal
export function readSprintState(...) { … }    // line 248: no @internal
export function clearSprintState(...) { … }   // line 256: no @internal
```

### F-14: autoResolveDebt mixed enum/string

```ts
// src/orchestra/sprint-docs-updater.ts:341
const ev = evaluations.get(task.id);
if (ev === 'DONE' || ev === TaskEvaluation.DONE) {
```

Defensive `||` indicates the caller passes either string or enum. Map type signature `Map<string, string>` is intentionally loose.

### F-17: ADR-032 i18n bypass

```ts
// src/orchestra/sprint-docs-helpers.ts:191-221  (Turkish-only)
return [
  `# DIRECTIVES — (Sprint ${nextNum} için hazırlanıyor)`,
  `> Önceki sprint (${archivedSprintId}) tamamlandı. Bu dosya yeni sprint hedefleri için hazırdır.`,
  `## Referanslar`, …
  `## Goal: (Sprint ${nextNum} hedefini buraya yazın)`,
  …
];

// src/orchestra/sprint-docs-helpers.ts:339-345 (English-only ADR draft)
return [
  '',
  `## ADR-${adrNumber}: ${dirName} (Draft — Sprint #${sprintNum})`,
  `**Status:** PROPOSED`,
  `**Context:** New module added in Sprint #${sprintNum}`,
  `**Decision:** [To be documented]`,
];
```

ADR-032 expects content variation via the i18n layer.

---

## 4. Migration Triage

| File | Class | Reason |
|------|-------|--------|
| `src/orchestra/sprint-utils.ts` | **KEEP-PRIVATE** | Internal pure utils for orchestra/. Several functions already marked `@internal`. Consumed only by `sprint-controller`, `sprint-phases`, `sprint-lifecycle`, `sprint-spawner`, `sprint-planner`. Not part of plugin/CLI surface. |
| `src/orchestra/sprint-docs-updater.ts` | **KEEP-PRIVATE** | Sprint-finalize internal logic; only `cleanTasksArchive` is consumed by `cli/cleanup.ts`. Two surface symbols would migrate via barrel if needed. |
| `src/orchestra/sprint-docs-helpers.ts` | **KEEP-PRIVATE** | Pure builders, internal to sprint-docs-updater. |
| `src/orchestra/index.ts` | **MIGRATE-PUBLIC** | This **is** the public barrel. Header drift (F-05, F-06, F-20) must be reconciled before public release. |
| `src/orchestra/doc-updaters/index.ts` | **MIGRATE-PUBLIC** | Plugin author entry point: re-exports `registerUpdater`, types. External users of `runManagedDocUpdates` will reach into this barrel. |
| `src/orchestra/doc-updaters/registry.ts` | **KEEP-PRIVATE** | Registration plumbing; surface is exposed via barrel only. |
| `src/orchestra/doc-updaters/types.ts` | **MIGRATE-PUBLIC** | `DocUpdater`, `DocUpdateContext`, `DocUpdateResult` interfaces are the plugin contract. Strip `internal: boolean` (F-07) before publishing. |
| `src/orchestra/doc-updaters/changelog.ts` | **KEEP-PRIVATE** | Built-in implementation; not a contract. |
| `src/orchestra/doc-updaters/metrics-updater.ts` | **DELETE-CANDIDATE** | Unregistered, unreferenced anywhere outside its own file (F-01). Safe to delete in Sprint 162+. Verify with `git log --diff-filter=A -- src/orchestra/doc-updaters/metrics-updater.ts` for its origin sprint before deletion. |

Other orchestra/ files NOT in this audit (informational, for Sprint 162+ scope):

| File class | Examples | Likely triage |
|-----------|----------|---------------|
| Decision/Routing internals | decision-engine.ts, decision-logger.ts, decision-replay.ts, decision-steps/ | KEEP-PRIVATE |
| Multi-agent/handoff | multi-agent.ts, handoff-protocol.ts, parallel-pipeline.ts | UNCERTAIN — need separate audit |
| Backend infra | spawn-backend-mock.ts, sprint-pid-manager.ts, sprint-runner-entry.ts | KEEP-PRIVATE |
| Managed-docs subdir (9 files) | managed-docs/* | UNCERTAIN — ADR-029/030 says public extension surface; needs an audit pass |

---

## 5. Recommendation (Sprint 162+ work)

> All recommendations are **NOT** code changes for this sprint — Lane 1 is READ-ONLY. Items are sized as Sprint 162+ planning seeds.

### High priority (P1 findings)

1. **Delete `metrics-updater.ts` (F-01).** One-task. Verify zero external imports (already done), remove file + commit. Tiny PR.
2. **Consolidate `isDocTask` / `isSourceCodeDir` (F-02).** Remove the private re-implementation in `result-evaluator.ts:23-61`; import from `sprint-utils.ts`. Watch for `result-evaluator.ts` being stricter than `sprint-utils.ts` — diff the two implementations before merging.
3. **Consolidate `readFileSafe` (F-03).** Six copies → one. Strategy: keep `core/utils.ts:64` as canonical. Delete the orchestra/ copies. Update imports. Likely a 10-file diff. Run full test suite after.
4. **Convert `execSync` to `spawnSync` (F-04).** One-line fix at `sprint-docs-updater.ts:387`. Match the existing `spawnSync('npx', ['vitest', …])` pattern. Add an ADR-006 conformance test that greps `src/` for `execSync\(` to prevent regression.

### Medium priority (P2)

5. **Reconcile `index.ts` header doc with actual exports (F-05, F-06, F-20).** Either delete the consumer-list comment block (cheap) or generate it from `git grep -l` (overkill). Pre-release task before MIGRATE-PUBLIC.
6. **Strip `DocUpdater.internal` field (F-07).** One interface change + 5 updater literals. Type-safe deletion.
7. **Unify usageData on SprintResult (F-08).** Add `usageData?: { totalCalls: number; totalTokens: number; … }` to `core/types.ts:SprintResult`. Eliminates the `as unknown as Record` antipattern. (Only relevant if `metrics-updater.ts` is kept — combine with F-01 decision first.)
8. **Recursive cleanup in `cleanTasksArchive` (F-09).** Replace the `unlinkSync` loop + `rmdirSync` block with `rmSync(dirPath, { recursive: true, force: true })` (Node 14.14+; project requires Node 20+). One-line fix.
9. **Surface registry errors (F-10).** Add `debugLog('docUpdaters:run', e)` and embed the message into `reason`. Two-line change in `registry.ts:24`.
10. **Fix synthetic ResolvedConfig drift (F-11).** Two options: (a) call `loadConfig(projectRoot)` lazily when `config` is undefined; (b) require `config` (drop the `?:`). Option (b) is cleaner — only one caller (sprint-finalizer.ts:709) ever omits it.

### Lower priority (P3)

11. Disambiguate the two archive directories (F-12) — rename `cleanTasksArchive` → `cleanPromptArchive` and `archiveOrphanTasks` already names its dir clearly; update jsdoc.
12. Apply consistent `@internal` JSDoc tags across `sprint-utils.ts` (F-13).
13. Tighten `autoResolveDebt` evaluation type (F-14).
14. CRLF guard in `parseAddedSrcFiles` (F-15) — `.replace(/\r$/, '')` after the regex match.
15. Consolidate doc-updaters imports in `sprint-docs-updater.ts` (F-16).
16. ADR-032 i18n compliance for auto-drafted ADRs and DIRECTIVES placeholders (F-17). Plug into the i18n layer when Sprint 162+ revisits managed-docs.
17. Surface `runManagedDocUpdates` errors to the sprint summary (F-18).
18. Async I/O migration completion in `sprint-docs-updater.ts` (F-19) — pair with the same task already noted for `sprint-finalizer.ts` in T-018 F-14.

### Cross-task consolidations (with peer audits)

- **`@internal` discipline campaign:** Many orchestra/ files have inconsistent `@internal` usage. Sprint 162 could run a sweep — automated check: for every exported function, grep external callers; if zero, mandate `@internal` JSDoc.
- **Async I/O migration:** Sprint 139 work is incomplete. T-018, T-023, and likely others are flagging the same pattern. Single follow-up task to convert orchestra/ to async fs.
- **`readFileSafe` / `now` / `readJsonSafe` consolidation:** Combine with F-03. Move all of these into `core/utils.ts` and ban orchestra/ private duplicates via lint.

### Lead-question outcomes

- **archiveOrphanTasks pattern** — Functionally OK (writes correctly to `.brain/archive/sprint-NNN-tasks/`). Three issues: (a) T-018 F-04 noted preserved-list is logged but not consumed; (b) name overlaps with the unrelated `cleanTasksArchive` (F-12); (c) jsdoc claims reflect implementation accurately (no drift inside this file). Verdict: ⚠️ low risk + naming hygiene work.
- **ADR governance integration** — In-scope contribution is `autoDraftDecisions` (sprint-docs-updater.ts:381). It auto-creates **PROPOSED** ADR stubs into `.brain/DECISIONS.md` when new `src/` directories appear. Findings: i18n bypass (F-17), uses `execSync` (F-04). The full ADR injection / ADR mandatory-read pipeline (ADR-036) lives in `task-builder.ts:753, 830` and `core/rule-generator.ts` — those are out-of-scope for T-023 and were audited in T-014.

---

## 6. Audit Metadata

- **Files read:** 9 (all read fully)
- **LoC reviewed:** 1854 (within 2000 LoC budget)
- **Cross-file greps:** 12 (deduplicate detection, call-graph confirmation)
- **ADRs cross-referenced:** ADR-004 (config merge), ADR-005 (sync I/O — deprecated), ADR-006 (spawnSync security), ADR-008 (one-way deps), ADR-029/030/031/032 (managed-docs i18n), ADR-036 (ADR governance), ADR-037 (RBAC), ADR-039 (self-modifying)
- **Boundary violations during audit:** 0 (all writes confined to `docs/audits/sprint-161/T-161-023-orch-utils-docs.md`)
- **Self-modifying status:** YES (audit examines orchestra/ which is Deckent's own source) — all read-only, ADR-039 detector should not flag.
