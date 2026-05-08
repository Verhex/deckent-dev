# T-161-024 — CLI Lifecycle Commands Audit (READ-ONLY)

**Sprint:** sprint-161 (God-Level READ-ONLY Self-Audit, Lane 1)
**Generated:** 2026-05-08
**Auditor agent:** doc-writer (model: opus)
**Audit dimensions:** 10 (per Sprint 161 DIRECTIVES)
**Lead questions:** ADR-022-V2 CLI/MCP parity • `--dry-run` consistency • kill confirmation flow

---

## 1. Scope

| File | LoC | Role |
|---|---|---|
| `src/cli/commands/start.ts` | 463 | `deckent start [description]` — full sprint lifecycle |
| `src/cli/commands/status.ts` | 451 | `deckent status` — dashboard read, watch, follow |
| `src/cli/commands/kill.ts` | 225 | `deckent kill [taskId]` — single/all worker termination |
| `src/cli/commands/cleanup.ts` | 254 | `deckent cleanup` — sprint artifact cleanup + decay |
| `src/cli/commands/checkpoint.ts` | 153 | `deckent checkpoint {list, approve, reject}` |
| `src/cli/commands/run.ts` | 332 | `deckent run <description>` — one-shot task |
| **Total** | **1,878 LoC** | — |

Cross-referenced for parity (read-only):
- `src/mcp/tools/start.ts` (237 LoC)
- `src/mcp/tools/status.ts` (487 LoC)
- `src/mcp/tools/kill.ts` (124 LoC)
- `src/mcp/tools/cleanup.ts` (138 LoC)
- `src/mcp/tools/checkpoint.ts` (148 LoC)
- `src/mcp/tools/run.ts` (127 LoC)

All 6 CLI commands are registered through the standard `register<Name>(program)` pattern (ADR-012) — verified via `src/cli/index.ts:5-104`.

---

## 2. Findings

### P1 — High Severity

#### F-1.1 [Drift] `kill.ts --force / --user-explicit` flags are dead — no panic guard wired
**Dimension:** Drift (claims vs reality), Dead code, ADR-035 verification claims

`src/cli/commands/kill.ts:187-189` registers two flags:
```ts
.option('--force', 'Force kill (bypass panic guard)')
.option('--user-explicit', 'Explicit user confirmation for panic kill override')
```
…and parses them into `opts: { all?: boolean; force?: boolean; userExplicit?: boolean }` (line 189). **However** neither `force` nor `userExplicit` is referenced anywhere in the rest of `kill.ts` (lines 190-224). `PanicGuard` (`src/core/panic-guard.ts:41`) is never imported or invoked from this file — `grep panic-guard src/cli/commands/` returns no hits.

`PanicGuard.evaluate()` is wired only in the runtime path inside `src/orchestra/sprint-controller.ts:812-834` for stale-heartbeat / grace-period kills. The user-facing CLI flags create the impression that an operator must pass `--force --user-explicit` to override a guard that the CLI command itself never enforces.

**Severity:** P1 — operator confusion + audit-trail gap. A user who sees `kill task-X` succeed without flags may incorrectly conclude "panic guard didn't trigger" when in fact it was never consulted. Conversely the docstring `kill.task_status_updated` and friends fire even when the guard would have blocked.

**Evidence:**
- `src/cli/commands/kill.ts:187-189` — flags declared
- `src/cli/commands/kill.ts:189` — `userExplicit` destructured but never referenced again
- `src/cli/commands/kill.ts:108-160` — `killSingle()` no guard call
- `src/cli/commands/kill.ts:194-215` — `--all` branch no guard call
- `src/core/panic-guard.ts:1-141` — full PanicGuard exists, `force && userExplicit` already encoded in `evaluate()`
- `src/orchestra/sprint-controller.ts:812-834` — only call site

**Recommendation (Sprint 162+):** Either (a) wire `PanicGuard.evaluate()` into the CLI `kill` flow and gate kill on `BLOCK`, or (b) remove the misleading `--force` description and `--user-explicit` flag entirely. ADR-037 (RBAC) should document the authority surface. Probably (a) — interactive CLI is exactly the right place for human confirmation.

**Triage:** MIGRATE-PUBLIC (file is essential), but **must fix before public-readiness gate** because ADR-035 verification protocol claims a guard exists.

---

#### F-1.2 [Conflicting] `kill --all` skips subprocess fallback; non-Claude workers leak
**Dimension:** Conflicting areas (duplicated logic, inconsistent paths)

`killSingle()` at `src/cli/commands/kill.ts:108-160` is **provider-aware**:
- detects task provider (line 109)
- non-Claude → tries subprocess kill first (line 112-127)
- falls back to tmux kill (line 130-159)
- last-ditch subprocess attempt for Claude on TmuxError (line 140-153)

`--all` branch at `src/cli/commands/kill.ts:194-215` only does **`killWorker(id)` (tmux)** in a `try/catch`:
```ts
for (const id of activeIds) {
  try {
    killWorker(id);  // tmux only — no provider detection, no subprocess fallback
    print(getMessage('kill.worker_killed', lang, { taskId: id }));
    killed++;
  } catch {
    // Worker may have already exited
  }
  updateTaskStatus(root, id, lang);  // sets PAUSED regardless of kill success
  releaseLocks(root, id, lang);
  cleanPromptFiles(root, id, lang);
}
```
The empty `catch` swallows the TmuxError that would have triggered `killSingle`'s subprocess fallback. Result: a Codex/Gemini subprocess worker survives `kill --all` while its task JSON is set to `PAUSED` and locks are released — perfect recipe for orphan workers writing into freshly-released file paths.

**Severity:** P1 — silent data divergence. `--all` is the canonical "panic stop" UX.

**Evidence:**
- `src/cli/commands/kill.ts:108-160` — `killSingle()` provider-aware path
- `src/cli/commands/kill.ts:200-214` — `--all` tmux-only loop
- `src/cli/commands/kill.ts:209` — `updateTaskStatus` runs unconditionally after silent failure

**Recommendation:** Replace the `--all` inner body with `killSingle(root, id, lang)` to share the single, correct provider-aware code path.

**Triage:** MIGRATE-PUBLIC, fix priority HIGH.

---

#### F-1.3 [ADR-022-V2 parity] `deckent_kill` MCP does not actually kill the OS process
**Dimension:** ADR violation (ADR-022-V2 parity is parameter parity AND behavioral parity)

CLI `kill` (`src/cli/commands/kill.ts:131`) calls `killWorker(taskId)` → `src/orchestra/tmux.ts` which terminates the tmux pane / process.

MCP `deckent_kill` (`src/mcp/tools/kill.ts:14-55`) only:
1. mutates the task JSON: `data.status = 'PAUSED'` (line 27)
2. unlinks the heartbeat file (line 36-38)
3. removes locks owned by the task (line 41-52)

It **never invokes any process kill** — neither tmux, nor subprocess, nor Docker stop. The tmux pane / Docker container / subprocess child stays alive; only the marker files are mutated. The next worker iteration will see `status: PAUSED` and exit gracefully *if* it re-reads the task file, but a worker mid-spawn or in a long verify loop continues until it terminates on its own.

ADR-022-V2 (`*as written in CLAUDE.md*`) says "Parametre parity: tüm MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır." Parameter schema parity is met (taskId, all). Behavioral parity is **broken** — same call, different effect.

**Severity:** P1 — surfaces the gap noted in `kill.ts:84` MCP docstring ("Stop one or all running workers… releases any file locks") which overstates the action.

**Evidence:**
- `src/cli/commands/kill.ts:131,146` — `killWorker()` actually terminates
- `src/mcp/tools/kill.ts:14-55` — `killTaskById()` only file mutations
- `src/mcp/tools/kill.ts:84` — docstring claim that disagrees with implementation

**Recommendation:** MCP must wrap the same SpawnBackend-aware kill logic the CLI uses, OR ADR-022-V2 must be amended to define "behavioral parity" as out-of-scope and the docstring weakened to "marks task PAUSED — does not terminate the OS process."

**Triage:** MIGRATE-PUBLIC. ADR-022-V2 amendment recommended.

---

### P2 — Medium Severity

#### F-2.1 [Dead code / Performance] `start.ts` provider cache is a no-op
**Dimension:** Dead code, drift

`src/cli/commands/start.ts:42-68` defines `readProviderCache`, `writeProviderCache`, `isProviderCacheFresh`, plus `PROVIDER_CACHE_TTL_MS`. The check at `start.ts:194-202`:
```ts
if (existingCache && isProviderCacheFresh(existingCache, configHash)) {
  bootstrap = await bootstrapProviders(config);    // same call
} else {
  bootstrap = await bootstrapProviders(config);    // same call
  writeProviderCache(root, bootstrap, configHash);
}
```
Both branches call `bootstrapProviders`. The "fresh" branch only skips `writeProviderCache`. Net savings: one ~1-2ms file write per sprint start. The cache file is read every start but its content never alters control flow.

**Severity:** P2 — wasted code surface, future maintainer trap.

**Evidence:** `start.ts:28-68, 192-202`

**Recommendation:** Either (a) actually short-circuit `bootstrapProviders` when the cache is fresh, or (b) delete the entire cache module.

**Triage:** MIGRATE-PUBLIC after cleanup. Exported helpers (`readProviderCache`, `writeProviderCache`, `isProviderCacheFresh`) should also be checked for test coverage before deletion.

---

#### F-2.2 [Performance / Drift] `start.ts` calls `planSprint` twice in the normal path
**Dimension:** Performance, conflicting logic

In the normal start path (no `--dry-run`, no `--force`):
1. Cost gate at `start.ts:349-398` calls `planSprint(root, config, context, recommendation)` (line 360) just to count tokens.
2. `runSprint` at `start.ts:416-421` then calls `planSprint` again internally during PLAN phase.

That doubles the AI planner cost (and doubles model API calls in `ai` planning mode). Sprint 141 introduced the cost gate to *prevent* runaway spend; ironically the gate itself spends extra to estimate.

**Severity:** P2 — meaningful wasted spend per sprint when `brain_planning='ai'`. With `structured` mode it is cheap but still duplicate work.

**Evidence:** `start.ts:349-398` (cost-gate planSprint) vs runSprint internal plan phase.

**Recommendation:** Cache the plan result between the cost gate and `runSprint`, e.g. extend `runSprint` options to accept `prebuiltPlan?: Sprint`. Sprint 152 H4 fix (MCP bootstrapProviders inside dry-run, `mcp/tools/start.ts:90`) shows the pattern is known but the de-dup is missing.

**Triage:** MIGRATE-PUBLIC after refactor.

---

#### F-2.3 [Drift / ADR-022-V2 parity] `--dry-run` is inconsistent across lifecycle commands
**Dimension:** Drift, ADR violation

| Command | CLI `--dry-run` | MCP `dryRun` | Consistent? |
|---|---|---|---|
| `start` | yes (`start.ts:157,294`) | yes (`mcp start.ts:32,85`) | ✅ |
| `cleanup` | yes (`cleanup.ts:67,73`) | yes (`mcp cleanup.ts:63,82`) | ✅ |
| `kill` | **no** | **no** | partial — neither has it |
| `run` | **no** | **no** | partial — neither has it |
| `checkpoint` | **no** | **no** | by design (no destructive action) |
| `status` | N/A (read-only) | N/A | ✅ |

`kill --dry-run` would be valuable: list workers that would be killed and locks that would be released. Sprint 138 ADR-035 verification protocol calls for "preview before destructive action" but `kill` is the only destructive lifecycle operation without a preview surface.

**Severity:** P2.

**Evidence:** see table above.

**Recommendation:** Add `--dry-run` to `kill` and `run` (and matching MCP). Update ADR-022-V2 to require `--dry-run` on every command annotated `destructiveHint: true`.

**Triage:** MIGRATE-PUBLIC after additive change.

---

#### F-2.4 [Drift] `run.ts` CLI vs MCP `--scope` defaults diverge
**Dimension:** ADR-022-V2 parity (parameter parity)

- CLI: `src/cli/commands/run.ts:239` — `const scopeDir = opts.scope ?? './';` (root of repo)
- MCP: `src/mcp/tools/run.ts:45` — `const directories = scope ? scope.split(',').map((s) => s.trim()) : ['src/'];` (only `src/`)

Same parameter name, **different default**. CLI default lets the worker touch *anything*; MCP default restricts to `src/`. ADR-037 (RBAC) cares about `scope.directories` precisely because it bounds runtime authority.

**Severity:** P2 — invisible until a security audit notices the gap. CLI default is broader than MCP default.

**Evidence:** `run.ts:239` vs `mcp/tools/run.ts:45`

**Recommendation:** Pick one. The safer default is `['src/']` (MCP). The CLI should match.

**Triage:** MIGRATE-PUBLIC after default normalization.

---

#### F-2.5 [Drift] `cleanup.ts` passes synthetic `'sprint-cleanup'` sprint ID into runDecay
**Dimension:** Drift, memory hygiene

`src/cli/commands/cleanup.ts:111`:
```ts
const result = runDecay(root, 'sprint-cleanup', { force: true, ... });
```
The literal string `'sprint-cleanup'` is passed where `runDecay`'s second parameter is the *current sprint id* (used for record-keeping). Memory V2 may persist `'sprint-cleanup'` as a fake sprint marker. The MCP equivalent at `src/mcp/tools/cleanup.ts:111-113` correctly derives `currentSprintId` from `getNextSprintId(root)`.

**Severity:** P2 — pollutes memory DB / decay history with a non-sprint marker.

**Evidence:** `cleanup.ts:111` vs `mcp/tools/cleanup.ts:111-113`

**Recommendation:** Mirror MCP behavior and derive the live sprint ID. Add unit test for `runDecay` invariant: "sprintId argument must match `^sprint-\d+$`".

**Triage:** MIGRATE-PUBLIC after fix.

---

#### F-2.6 [Conflicting] `status.ts` has three rendering paths with duplicated dashboard read
**Dimension:** Conflicting areas, drift

Three paths in `src/cli/commands/status.ts:230-450` each load the dashboard separately:
1. `--follow` (line 248-289) → uses `StatusRenderer.snapshot()` + `eventBus.subscribe()` + `setInterval(render, 5000)` fallback
2. `--watch` (line 334-385) → `readDashboard(dashPath)` + `fs.watch` (or `setInterval(render, 2000)` fallback)
3. default (line 388-449) → one-shot `readFileSync(dashPath)` + `JSON.parse`

Each path has independent CI baseline / sprint meta loading code. `formatHumanStatus` is invoked from two of three paths but with slightly different wrappers. Drift between `--watch` and `--follow` polling frequencies (2s vs 5s) is undocumented.

**Severity:** P2 — maintenance fragility, but works.

**Evidence:** `status.ts:248-289, 334-385, 388-449`

**Recommendation:** Extract a `renderStatus(state, opts)` helper called from all three paths. The MCP variant in `src/mcp/tools/status.ts:444-485` also duplicates `formatStatus(formatterData, resolvedMode)` logic — same hoist would help.

**Triage:** MIGRATE-PUBLIC after refactor.

---

#### F-2.7 [Type safety] `start.ts` casts config through `unknown` to read fields
**Dimension:** Type safety

`src/cli/commands/start.ts:228, 267`:
```ts
const lastSprintId = (config as unknown as Record<string, unknown>).last_sprint_id as string | undefined;
const cfg = config as unknown as Record<string, unknown>;
const spawnBackend = cfg.spawn_backend as string | undefined;
```
The double cast through `unknown` is the TypeScript "I can't be bothered to extend the type" anti-pattern. The fields (`last_sprint_id`, `spawn_backend`, `providers`, `brain_provider`, `worker_provider`, `fallback_provider`) all exist in real config schemas — the runtime type is just incomplete.

ADR-001 (TypeScript + ESM) and the typescript-expert skill prompt (`Always enable strict: true`, `Prefer unknown over any`, `Never use @ts-ignore`) imply the cast pattern is a code smell that should be addressed by extending the `Config` interface.

**Severity:** P2.

**Evidence:** `start.ts:228, 267-279, 301, 356`

**Recommendation:** Extend `Config` interface (or `ResolvedConfig`) in `src/core/config-types.ts` to include the optional fields, then drop the cast.

**Triage:** MIGRATE-PUBLIC.

---

#### F-2.8 [Type safety] `kill.ts` JSON.parse without type assertion
**Dimension:** Type safety

`src/cli/commands/kill.ts:35, 53, 96, 171`:
```ts
const data = JSON.parse(readFileSync(taskFile, 'utf-8'));     // any
const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));     // any
const data = JSON.parse(readFileSync(taskFile, 'utf-8'));     // any
const data = JSON.parse(readFileSync(...))                    // any
```
No `as Task`, no `as { ownerWorkerId?: string; taskId?: string }`. By comparison `src/mcp/tools/kill.ts:26-46` uses `as TaskFileData` with a `TaskFileData` interface defined at line 8-12.

**Severity:** P2 — silent regression risk.

**Evidence:** `kill.ts:35, 53, 96, 171`

**Recommendation:** Mirror the MCP `TaskFileData` interface (line 8-12 of `mcp/tools/kill.ts`) and use it in the CLI.

**Triage:** MIGRATE-PUBLIC.

---

#### F-2.9 [Drift / Type safety] `checkpoint.ts` CLI lacks input validation present in MCP
**Dimension:** Type safety, ADR-022-V2 parity

MCP `src/mcp/tools/checkpoint.ts:51-56` calls:
```ts
validateSprintId(sprintId);
validatePhase(phase);
validatePath(dir, `checkpoint-${sprintId}-${phase}.json`);
```
CLI `src/cli/commands/checkpoint.ts:117-152` does not import or use any of these validators. A CLI invocation `deckent checkpoint approve "../etc/passwd" hax0r` will not be filtered by `validatePath` and falls back to `existsSync` returning false — which is benign here, but the asymmetric hardening between transports is exactly the kind of drift Sprint 158 ADR-035 verification was designed to surface.

**Severity:** P2 — defense-in-depth gap.

**Evidence:** `checkpoint.ts:117-152` (no validator imports) vs `mcp/tools/checkpoint.ts:6, 51-56, 115-116`

**Recommendation:** Import `validateSprintId`/`validatePhase`/`validatePath` from `src/core/validators.ts` in the CLI.

**Triage:** MIGRATE-PUBLIC.

---

### P3 — Low Severity

#### F-3.1 [Drift] `run.ts` magic-number cost defaults
**Dimension:** Drift, dead code

`run.ts:240` parses `--timeout <ms>` with default `'300000'` (5 min). `run.ts:267` only logs the timeout when it differs from `300_000`. The literal appears 3× in the file with no shared constant. (`mcp/tools/run.ts:32-34` instead uses `effort` + `timeoutSeconds` + `brainEstimateTimeout` — much richer.)

CLI `run` is materially less capable than MCP `run` (no effort, no timeout estimator, no Docker timeout). ADR-022-V2 is technically met (CLI flag exists) but practically violated (functionality differs).

**Severity:** P3.

**Evidence:** `run.ts:232, 240, 267` vs `mcp/tools/run.ts:32-33, 86-96`

**Recommendation:** Add `--effort` / `--timeout-seconds` to CLI `run` and route through `brainEstimateTimeout`. (Sprint 153 already added Docker timeout escape hatch on MCP side.)

**Triage:** MIGRATE-PUBLIC after enhancement.

---

#### F-3.2 [Performance] `kill.ts` walks tasks dir 4× per single-kill
**Dimension:** Performance

A single `kill <taskId>` invokes:
1. `findTaskFile()` — readdirSync (line 18)
2. `detectTaskProvider()` → `findTaskFile()` again (line 92-94)
3. `updateTaskStatus()` → `findTaskFile()` again (line 28-30)
4. `cleanPromptFiles()` — readdirSync (line 71)
5. `releaseLocks()` — readdirSync of `.locks/` (line 47)

That's 4 readdirs of `.tasks/` for one kill. Negligible in absolute terms (<5ms on local disk) but each step duplicates path-resolution work. `--all` multiplies the cost by N.

**Severity:** P3.

**Evidence:** `kill.ts:18, 28-30, 71, 92-94`

**Recommendation:** Resolve the task file path once and pass it down.

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.3 [Documentation pollution] `cleanup.ts` inline comments tag work as "A) … G)"
**Dimension:** Documentation

`cleanup.ts:76, 152, 169, 190, 201, 207, 230, 236` use `// A)`, `// B)`, … `// G)` lettered comments referring to ad-hoc sprint-time refactor steps. These are useful in PR review but create noise in the source tree because the letters are not anchored to any external doc and lose meaning over time. Same pattern in `status.ts:312, 363, 365, 392`.

**Severity:** P3.

**Evidence:** see above.

**Recommendation:** Drop the letter tags or replace with a one-line meaningful summary.

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.4 [Drift] `status.ts` `_verbose` underscore-prefixed property
**Dimension:** Drift

`status.ts:341, 395` stuff verbose data into `{ ...state, _verbose: { agents: ... } }`. Underscore-prefix is a JavaScript-tribal convention for "private" but on a serialised JSON payload it's just an awkward field name. MCP equivalent uses `verboseFields` spread (`mcp/tools/status.ts:410-415`).

**Severity:** P3.

**Recommendation:** Rename to `verbose`/`details`.

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.5 [Documentation drift] `kill.ts` MCP docstring overstates effect
**Dimension:** Drift

`src/mcp/tools/kill.ts:84` claims:
> "Stop one or all running workers. Sets task status to PAUSED, removes heartbeat files, and releases any file locks owned by the task."

"Stop … running workers" is misleading — see F-1.3. The truthful summary is "Mark task PAUSED, remove heartbeat marker, release locks."

**Severity:** P3.

**Evidence:** `mcp/tools/kill.ts:84`

**Recommendation:** Tighten the description.

**Triage:** MIGRATE-PUBLIC after F-1.3 fix or docstring rewrite.

---

#### F-3.6 [Type safety] `cleanup.ts` runtime cast for retention config
**Dimension:** Type safety

`cleanup.ts:209-216`:
```ts
let retentionConfig: Record<string, unknown> = {};
const raw = JSON.parse(...) as { sprint_file_retention?: Record<string, unknown> };
if (raw?.sprint_file_retention) retentionConfig = raw.sprint_file_retention;
const retResult = runRetention(root, sprintId ?? null, retentionConfig);
```
The contract for `runRetention` should either declare a typed `RetentionConfig` interface in core, or accept `Record<string, unknown>` honestly throughout. Mixing the two leaks the unsafe shape.

**Severity:** P3.

**Evidence:** `cleanup.ts:209-218`

**Recommendation:** Define `RetentionConfig` in `src/core/sprint-file-retention.ts`. (May already exist — out of scope here.)

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.7 [Dependency hygiene] All scoped files use correct `.js` ESM extensions
**Dimension:** Dependency hygiene (ADR-001/ADR-002)

All `import` paths verified to end in `.js` (Node16 resolution requirement). No circular-dep candidates within the 6-file scope. `status.ts:30, 174` even has a comment ("File-system based to avoid ADR-008 import cycle") confirming awareness.

**Severity:** none — this is a positive note.

**Evidence:** all import lines.

---

#### F-3.8 [Dead code candidate] `run.ts` `_runTaskCounter` is local + module-scoped
**Dimension:** Dead code

`run.ts:45`:
```ts
let _runTaskCounter = 0;
export function createRunTaskId(): string {
  return `run-${Date.now()}-${_runTaskCounter++}`;
}
```
The counter is per-process. For CLI's one-shot lifetime this is effectively always `0`, so the suffix is useless. The MCP version (`mcp/tools/run.ts:16-18`) uses `Date.now().toString(36)` alone, which is fine for the same reason.

**Severity:** P3.

**Evidence:** `run.ts:45-48`

**Recommendation:** Drop the counter or make it persist (`.deckent/run-counter`). For CLI one-shot, drop.

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.9 [Memory V2 coherence] `cleanup.ts:22-30 getMemoryEntryCount` consistent with DECKENT.md DB-first
**Dimension:** Memory V2 coherence

Both CLI (`cleanup.ts:22-30`) and MCP (`mcp/tools/cleanup.ts:11-20`) define identical `getMemoryEntryCount` helpers using `MemoryStore`. **Duplicate implementation across files**. Should live in `src/core/memory-store.ts` or a dedicated helper.

**Severity:** P3 — code duplication.

**Evidence:** `cleanup.ts:22-30` vs `mcp/tools/cleanup.ts:11-20` (byte-for-byte identical)

**Recommendation:** Move to `src/core/memory-store.ts` as a static method or named export.

**Triage:** MIGRATE-PUBLIC.

---

#### F-3.10 [Config integrity] decay budget defaults duplicated
**Dimension:** Config integrity

| File | Memory budget default | Decay sprints default |
|---|---|---|
| `cleanup.ts:98-99` | 900 | 8 |
| `mcp/tools/cleanup.ts:70-71` | 900 | 8 |

The `900` and `8` literals are repeated in three known places (counting `core/constants.ts` if defined there) without a shared source. CLAUDE.md gotcha "Memory budget: 900 lines max" implies an ADR-009-adjacent constant.

**Severity:** P3.

**Evidence:** `cleanup.ts:98-99` vs `mcp/tools/cleanup.ts:70-71`

**Recommendation:** Define `DEFAULT_MEMORY_BUDGET = 900` and `DEFAULT_DECAY_AFTER_SPRINTS = 8` in `src/core/constants.ts`.

**Triage:** MIGRATE-PUBLIC.

---

## 3. ADR-022-V2 Parity Matrix

| CLI flag | MCP param | Schema parity | Behavioral parity | Note |
|---|---|---|---|---|
| `start --auto-approve` | `autoApprove` | ✅ | ✅ both hardcode `true` | docstring discrepancy: CLI says "Auto-approve worker actions" / MCP says "IMMUTABLE true" |
| `start --sandbox-mode` | `sandbox` | ⚠ name mismatch | ✅ | rename one for full parity |
| `start --dry-run` | `dryRun` | ✅ | ✅ | OK |
| `start --force` | `force` | ✅ | ⚠ CLI skips doctor + lock; MCP only skips lock (documented in `mcp/tools/start.ts:42-50`) | known divergence |
| `start --watch` | _absent_ | ❌ | N/A | terminal UX, acceptable per ADR-022-V2 ("infrastructure commands stay CLI-only") |
| `start --timeout` | `timeout` | ✅ | ✅ | CLI parses string→int; MCP accepts number — equivalent |
| `start --force-directives` | _absent_ | ❌ | N/A | zero-config UX, acceptable |
| `start [description]` (positional) | _absent_ | ❌ | N/A | zero-config UX, acceptable |
| `kill [taskId]` | `taskId` | ✅ | ❌ see F-1.3 | MCP doesn't terminate process |
| `kill --all` | `all` | ✅ | ❌ see F-1.2 + F-1.3 | both have provider asymmetry |
| `kill --force` | _absent_ | ❌ | dead in CLI (F-1.1) | both broken in different ways |
| `kill --user-explicit` | _absent_ | ❌ | dead in CLI (F-1.1) | |
| `cleanup --decay` | `decay` | ✅ | ✅ | OK |
| `cleanup --dry-run` | `dryRun` | ✅ | ✅ | OK |
| `checkpoint list/approve/reject` | `action: list/approve/reject` | ⚠ subcommand vs param | ✅ | functional parity |
| `run <description>` | `description` | ✅ | ⚠ scope default differs (F-2.4) | |
| `run --model` | `model` | ✅ | ✅ | |
| `run --scope <dir>` | `scope` (comma-sep) | ⚠ string vs CSV | ❌ defaults differ (F-2.4) | |
| `run --timeout <ms>` | `timeoutSeconds` | ⚠ ms vs s | ⚠ MCP also has `effort`-based estimation | |
| `run --keep` | _absent_ | ❌ | N/A | one-shot UX |
| `run --auto-approve` | `autoApprove` | ✅ | ✅ both hardcode true | |
| `run --verbose` | _absent_ | ❌ | N/A | terminal-only stream |
| `status --watch` | _absent_ | ❌ | N/A | terminal UX |
| `status --follow` | _absent_ | ❌ | N/A | terminal UX |
| `status --json` | `json` | ✅ | ✅ | |
| `status --verbose` | `verbose` | ✅ | ✅ | |
| `status --raw` | _absent_ | ❌ | N/A | legacy box format |
| `status --graph` | _absent_ | ❌ | N/A | terminal UX |
| `status --no-color` | _absent_ | ❌ | N/A | TTY only |
| `status --mode <m>` | `outputMode` | ⚠ name mismatch | ✅ | rename one |

**Summary:** Surface parity is mostly met for the "destructive / behavioral" flags (start, cleanup, checkpoint) but **broken for kill** (F-1.3, F-1.1, F-1.2) and **partially divergent for run** (F-2.4, F-3.1). Naming inconsistency: `sandbox` ↔ `--sandbox-mode`, `outputMode` ↔ `--mode`, `timeout` (ms) ↔ `timeoutSeconds`.

---

## 4. Migration Triage

| File | Verdict | Reason |
|---|---|---|
| `start.ts` | **MIGRATE-PUBLIC** | Core lifecycle, Sprint 141 cost gate already in place. Fix F-2.1, F-2.2, F-2.3, F-2.7 first. |
| `status.ts` | **MIGRATE-PUBLIC** | Core lifecycle. F-2.6 refactor recommended but not blocking. |
| `kill.ts` | **MIGRATE-PUBLIC** with PRECONDITIONS | F-1.1, F-1.2, F-1.3 must land before public-readiness. Ad-hoc P0 risk. |
| `cleanup.ts` | **MIGRATE-PUBLIC** | F-2.5 (synthetic sprint id) is a real concern — fix before public. F-3.10 cosmetic. |
| `checkpoint.ts` | **MIGRATE-PUBLIC** | F-2.9 (validator parity) before public. Logic itself is solid. |
| `run.ts` | **MIGRATE-PUBLIC** | F-2.4 (scope default) and F-3.1 (timeout heuristic) before public. F-3.8 cosmetic. |

No KEEP-PRIVATE candidates. No DELETE-CANDIDATEs.

---

## 5. Recommendations for Sprint 162+

Roughly ordered by impact-per-effort:

1. **[P1] Wire PanicGuard into `kill.ts` CLI flow OR remove the `--force/--user-explicit` flags** (F-1.1). 1 file, ~30 LoC change. Plus a unit test confirming `BLOCK` outcome when guard activates.
2. **[P1] Replace `--all` inner loop with `killSingle()` calls** (F-1.2). 1 file, ~10 LoC. Closes the Codex/Gemini orphan window.
3. **[P1] Wire SpawnBackend-aware kill into `mcp/tools/kill.ts`** (F-1.3). New imports + ~30 LoC change. Plus update docstring.
4. **[P2] Fix `cleanup.ts` synthetic sprint ID** (F-2.5). Mirror MCP derivation pattern. ~5 LoC. Plus invariant test on `runDecay`.
5. **[P2] Normalize `run` scope defaults** (F-2.4). Pick `['src/']`. Update both CLI and MCP. ~3 LoC + test.
6. **[P2] De-duplicate `planSprint` in `start.ts`** (F-2.2). Cache plan between cost gate and runSprint. ~30 LoC + integration test.
7. **[P2] Decide on `start.ts` provider cache** (F-2.1) — wire it up properly or delete it.
8. **[P2] Unify CLI/MCP `run` features** (F-3.1) — port `effort` + `timeoutSeconds` + `brainEstimateTimeout` from MCP to CLI.
9. **[P2] Tighten `start.ts` Config typing** (F-2.7) — extend `Config` interface, drop `unknown` casts.
10. **[P2] CLI `kill` task-data interface + JSON.parse typing** (F-2.8). Lift `TaskFileData` from MCP.
11. **[P2] CLI `checkpoint` validator parity** (F-2.9). Import from `src/core/validators.ts`.
12. **[P2] Add `--dry-run` to `kill` and `run`** (F-2.3). Update ADR-022-V2 to make `--dry-run` mandatory on destructive commands.
13. **[P3] Hoist `getMemoryEntryCount` to core** (F-3.9). 1 import each.
14. **[P3] Hoist memory budget defaults to constants.ts** (F-3.10).
15. **[P3] Refactor `status.ts` 3-path render** (F-2.6). Optional polish.
16. **[P3] Tighten MCP `kill` docstring** (F-3.5). One-line edit.
17. **[P3] Drop letter-tagged comments** (F-3.3) and underscore-prefixed property (F-3.4).

---

## 6. 10-Dimension Summary Table

| # | Dimension | Findings | Severity |
|---|---|---|---|
| 1 | Dead code (unused exports) | F-2.1 (provider cache), F-3.8 (run counter) | P2, P3 |
| 2 | ADR violations | F-1.3 (ADR-022-V2 behavioral parity), F-2.3 (parity), F-2.4 (parity), F-2.9 (validators) | P1, P2 |
| 3 | Conflicting areas (duplicated logic) | F-1.2 (kill paths), F-2.6 (status renders), F-3.9 (memory entry count duplicated) | P1, P2, P3 |
| 4 | Drift (claims vs reality) | F-1.1 (panic guard flags), F-1.3 (MCP kill docstring), F-2.5 (synthetic sprint id), F-3.1 (run features), F-3.4 (verbose naming), F-3.5 (kill docstring) | P1, P2, P3 |
| 5 | Type safety (any, ts-ignore, casts) | F-2.7 (config casts), F-2.8 (kill JSON.parse), F-3.6 (retention config) | P2, P3 |
| 6 | Dependency hygiene (.js ext, cycles) | F-3.7 (positive — clean) | none |
| 7 | Documentation pollution | F-3.3 (letter tags) | P3 |
| 8 | Memory V2 coherence | F-2.5 (sprint id synth), F-3.9 (entry count helper duplication) | P2, P3 |
| 9 | Config integrity | F-3.10 (default duplication), F-3.6 (retention typing) | P3 |
| 10 | Migration triage | All 6 files MIGRATE-PUBLIC, with preconditions on kill.ts | — |

---

## 7. Conclusion

The 6 lifecycle commands are functionally complete and battle-tested across 160 sprints. Critical gaps are:
- **kill semantics**: cosmetic flags (F-1.1), provider asymmetry within `--all` (F-1.2), and MCP no-op behavior (F-1.3) together represent the only **P1** issues in this 1,878-LoC scope.
- **ADR-022-V2 parity**: surface mostly OK but `kill` and `run` need normalization, and "behavioral parity" needs explicit scoping in the ADR.
- **`--dry-run` discipline**: should be mandatory on destructive commands; currently absent on `kill` and `run`.
- **DB-first / Memory V2 coherence**: `cleanup.ts` synthetic sprint ID (F-2.5) is the only memory-DB hygiene concern.

No P0 issues. No security findings. No file recommended for deletion. All 6 files are essential and migrate-ready *after* the F-1.x fixes.

**End of audit.**
