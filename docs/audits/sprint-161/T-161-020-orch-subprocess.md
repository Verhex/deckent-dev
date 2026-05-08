# T-161-020 — src/orchestra/ subprocess + spawn helpers (READ-ONLY audit)

**Sprint:** 161 (God-Level READ-ONLY Self-Audit, Lane 1)
**Auditor:** w-161-020 (claude · opus · doc-writer agent + typescript-expert skill)
**Date:** 2026-05-08
**Mandate:** Lead question — ADR-027 hybrid spawn backend correctness, parity with docker backend.

---

## 1. Scope

| File | LoC | Role |
|------|-----|------|
| `src/orchestra/spawn-backend.ts` | 297 | Backend abstraction + Tmux/Subprocess wrappers + `SpawnBackendFactory` |
| `src/orchestra/spawn-backend-mock.ts` | 107 | E2E test mock (`MockSpawnBackend`, scenarios DONE / GO_WITH_TECH_DEBT / NO_GO / TIMEOUT) |
| `src/orchestra/sprint-spawner.ts` | 799 | `spawnWorkers` / `respawnEligibleTasks` / `validateTaskDependencies` / `routeSprintTasks` + cascade/unblock helpers |
| `src/orchestra/heartbeat-daemon.ts` | 307 | Project-level proactive heartbeat runner (out-of-scope semantically — see Finding 4.4) |

**Cross-references read for parity comparison (NOT audited here, but cited):**
- `src/orchestra/spawn-backend-docker.ts` (811 LoC, audited in T-161-019)
- `src/orchestra/tmux.ts` (349 LoC, audited in T-161-019)
- `src/providers/subprocess.ts` (327 LoC, the actual `SubprocessSpawnBackend` that `SubprocessBackend` wraps)
- `src/orchestra/sprint-utils.ts` (`isTmuxProvider`, `resolveTaskProvider`, `getProviderAdapterForTask`)
- `src/orchestra/sprint-controller.ts` (factory call site at line 541-549)
- `src/core/config-types.ts` (`spawn_backend`, `docker_image`, `docker_timeout`)

**Total in-scope source:** 1 510 LoC across 4 files.

---

## 2. Executive Summary

| Severity | Count | Headline |
|----------|-------|----------|
| **P0** | 0 | (none — but P1.1 below is one heartbeat-write away from being P0) |
| **P1** | 4 | Adaptive-timeout-instance leak; docker-only fix paths missing in subprocess; factory JSDoc drift; subprocess timeout default == 0 (no protection) |
| **P2** | 4 | Backend selection logic divergence; ADR-027 doc/code mismatch; unnecessary `as string[]` cast; `MockSpawnBackend` in production source tree |
| **P3** | 5 | Comment/JSDoc drift, deprecated `DEFAULT_TIMEOUT_SECONDS` constant retained, EXTENSION_ONLY_RE comment mislabel, `signalInfo` typo carried, dead branch in `respawnEligibleTasks` |

**Verdict:** ADR-027 hybrid spawn backend wire is **architecturally correct** (interface + factory + 4 implementations including mock) but **operationally divergent** between docker and subprocess paths. Several Sprint 151/158 robustness fixes (`.partial-result` OOM safety net, `.plan` stub for observability, host-side fsync on stop) live exclusively in `spawn-backend-docker.ts` and were never propagated to `subprocess.ts`. The wrapper around `SubprocessSpawnBackend` in `spawn-backend.ts` carries a stateful bug that surfaces only when adaptive timeouts are in use (Finding 4.1).

ADR-039 (self-modifying task detection) protections are wired in `sprint-spawner.ts:262-285` (TASK_ASSIGN event emission) ahead of any backend dispatch — this is correct.

---

## 3. Findings (P0 / P1 / P2 / P3)

### 4.1 [P1 · TYPE-SAFETY · DRIFT · CONFLICTING-LOGIC] `SubprocessBackend.spawn()` orphans worker handles when adaptive timeouts are used

**Evidence:** `src/orchestra/spawn-backend.ts:149-184`

```typescript
private getBackend(timeoutOverrideMs?: number): SubprocessSpawnBackend {
  if (timeoutOverrideMs != null) {
    return new SubprocessSpawnBackend(this.projectDir, {
      defaultTimeoutMs: timeoutOverrideMs,
    });            // ← fresh instance, NOT cached
  }
  if (!this._backend) {
    this._backend = new SubprocessSpawnBackend(this.projectDir, {
      defaultTimeoutMs: this.timeoutMs,
    });
  }
  return this._backend;
}

spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
  const timeoutOverrideMs = opts?.taskTimeoutSeconds != null
    ? opts.taskTimeoutSeconds * 1000
    : undefined;
  this.getBackend(timeoutOverrideMs).spawn(taskId, model, prompt, opts);
}

kill(taskId: string): void {
  this.getBackend().kill(taskId);     // ← always cached _backend, never the override one
}

list(): string[] {
  return this.getBackend().listWorkers() as string[];
}
```

**Why it matters.** `SubprocessSpawnBackend` keeps an in-memory `workers: Map<string, SubprocessWorkerEntry>` (see `src/providers/subprocess.ts:101`). When a task is spawned with `taskTimeoutSeconds` (every Brain-routed task post-Sprint 138 adaptive-timeout reform passes this), the worker is registered in a *transient* `SubprocessSpawnBackend` that is referenced only by the `child.once('exit', …)` closure at `subprocess.ts:189`.

Effects:
1. `SubprocessBackend.kill(taskId)` calls `getBackend()` with **no override** → returns the cached `_backend` (or creates a brand-new empty one) — neither knows about the task. `killWithSignal` then throws `ProviderError("No running worker for task '${taskId}'")` (`subprocess.ts:262-266`).
2. `SubprocessBackend.list()` returns the cached backend's worker list — empty when every spawn used overrides. Sprint observability via `backend.list()` is silently broken.
3. `SubprocessSpawnBackend.spawn()` itself has a duplicate-spawn guard (`subprocess.ts:123-128`) that becomes useless across spawns because each transient instance's map starts empty.

**Why it isn't P0 today:** `stopWorkerIfStoppable` in `sprint-spawner.ts:540-575` swallows exceptions implicitly (the throw turns into an unhandled rejection in fire-and-forget `kill()` paths) and `result-collector.ts` is `.result`-file-driven, so the broken kill rarely blocks sprint completion. But `deckent kill --worker w-...` and `deckent_kill` MCP tool will fail loudly for every adaptive-timeout subprocess task.

**Migration triage:** KEEP-PRIVATE — this file is internal orchestration, not part of the public/marketplace surface; the bug must be fixed before the file becomes part of any contract.

**Fix recommendation (Sprint 162+):** Either (a) eliminate the transient-instance pattern by adding an `overrideTimeoutMs` parameter to `SubprocessSpawnBackend.spawn()` and mutating `defaultTimeoutMs` for that call only, or (b) make `getBackend()` always cache and let the caller register a `setTimeout(kill, …)` per-task externally. Option (a) is more local; option (b) makes adaptive timeouts the responsibility of the orchestration layer (sprint-spawner) rather than the backend.

---

### 4.2 [P1 · CONFLICTING-AREAS · DRIFT] Sprint 151 `.partial-result` OOM safety net + Sprint 158 `.plan` stub are docker-only — subprocess and tmux paths are missing them

**Evidence (docker has them):**
- `.plan` stub: `src/orchestra/spawn-backend-docker.ts:270-301` (Sprint 158 Bug 5 fix)
- `.partial-result` OOM net: `src/orchestra/spawn-backend-docker.ts:262-301` written at script start; promoted host-side at `spawn-backend-docker.ts:644-668`

**Evidence (subprocess does NOT have them):**
- `src/providers/subprocess.ts:117-220` — the entire `SubprocessSpawnBackend.spawn()` method writes only the heartbeat (`subprocess.ts:155-156`) and a fallback result on exit (`subprocess.ts:197-211`). No `.plan` stub, no `.partial-result` checkpoint.

**Evidence (tmux does NOT have them):**
- `src/orchestra/tmux.ts` (349 LoC) — referenced for read-only parity; same gap.

**Why it matters.** ADR-027 (Hybrid Spawn Backend, accepted Sprint 123, revisited Sprint 139) commits to backend parity. Sprint 154 audit `T-154-001-docker-runtime.md` and Sprint 158 finalize commit `8d521a1` claim "Docker workers now emit .plan stub for observability (Bug 5)" — but the parallel commits don't touch tmux or subprocess. The Sprint 161 ABSOLUTE RULES list "drift (claims vs reality)" as audit dimension 4.

Practical impact:
- `tmux` and `subprocess` workers that crash before they emit a `.result` file will leave the sprint hanging on `result-collector` polling, then time out as NO_GO. Docker has a host-side fallback (`spawn-backend-docker.ts:675-705`) and a `.partial-result` promotion path. Subprocess has the lighter `child.once('exit', …)` fallback writer (`subprocess.ts:197-211`) which always writes selfAssessment based on exit code alone — no git-diff awareness, no `TIMEOUT_WITH_WORK` reconciliation.
- The `.plan` stub appears in `.tasks/task-*.plan` for docker workers and in nothing else. Brain self-audit gate (Sprint 134 T-014) and observability dashboards relying on `.plan` presence have a silent docker-only blind spot for the other two backends.

**Migration triage:** KEEP-PRIVATE — internal robustness mechanism; needs parity work before any backend is deprecated.

**Fix recommendation (Sprint 162+):** Extract a small helper (`src/orchestra/spawn-prelude.ts`?) that writes the `.plan` stub and `.partial-result` checkpoint, callable from all three real backends. Alternative: define a `BackendPrelude` interface in `spawn-backend.ts` that all `SpawnBackend` implementations are required to call before invoking the underlying CLI.

---

### 4.3 [P1 · DRIFT] Factory JSDoc describes the legacy 2-step `tmux → subprocess` selection but the code is now a 3-step `docker → tmux → subprocess` chain

**Evidence:** `src/orchestra/spawn-backend.ts:217-269`

```typescript
/**
 * SpawnBackendFactory — selects and creates the appropriate SpawnBackend.
 *
 * Selection logic:
 * 1. If `backend` is explicitly set to 'tmux' or 'subprocess', use that.
 * 2. In 'auto' mode: check if tmux is available → use TmuxBackend.
 *    If tmux is not available → fall back to SubprocessBackend.
 */
export class SpawnBackendFactory {
  static create(opts: SpawnBackendFactoryOptions): SpawnBackend {
    const backendType = opts.backend ?? 'auto';

    if (backendType === 'docker') { /* … docker … */ }
    if (backendType === 'subprocess') { /* … subprocess … */ }
    if (backendType === 'tmux') { /* … tmux … */ }

    // 'auto': prefer docker if available, then tmux, then subprocess
    if (isDockerAvailable()) { /* … docker … */ }
    if (SpawnBackendFactory.isTmuxAvailable()) { /* … tmux … */ }
    return new SubprocessBackend(/* … */);
  }
}
```

The class JSDoc enumerates only `tmux` and `subprocess`. The `BackendType` union type (`spawn-backend.ts:188`) lists 4 values: `'tmux' | 'subprocess' | 'docker' | 'auto'`. The interface JSDoc on lines 11-15 also still mentions only TmuxBackend and SubprocessBackend implementations — DockerBackend and MockBackend are missing.

**Why it matters.** Sprint 161 audit dimension 4 explicitly calls out doc/behavior drift. New contributors reading the factory class doc will believe Docker is not a factory option. The inline comment on line 253 (`// 'auto': prefer docker if available, then tmux, then subprocess`) reflects current behavior but is contradicted by the class-level JSDoc.

**Migration triage:** KEEP-PRIVATE; doc-only fix.

**Fix recommendation:** Update the JSDoc on the class (lines 217-223) and the interface comment (lines 10-18) to describe the 3-step `docker → tmux → subprocess` chain and list all four implementations including `MockSpawnBackend` (or label `MockSpawnBackend` as test-only and exclude it from the implementation list).

---

### 4.4 [P1 · CONFIG-INTEGRITY · CONFLICTING-AREAS] Subprocess default timeout is 0 (no protection); Docker default is 1200s

**Evidence:**
- `src/orchestra/spawn-backend.ts:144-147` — `SubprocessBackend` constructor: `this.timeoutMs = opts?.timeoutMs ?? 0;`
- `src/orchestra/spawn-backend.ts:266-268` — factory passes `timeoutMs: opts.defaultTimeoutMs`, which is itself optional in `SpawnBackendFactoryOptions` (line 204).
- `src/providers/subprocess.ts:108` — `SubprocessSpawnBackend` constructor: `this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;`
- `src/providers/subprocess.ts:173-177` — `if (timeout > 0) { entry.timeoutHandle = setTimeout(… SIGKILL …); }` — **no timeout guard when `defaultTimeoutMs === 0`**.
- Compare: `src/orchestra/spawn-backend-docker.ts:91, 115` — Docker defaults to 1200s.

**Why it matters.** A subprocess worker can hang forever (Claude CLI timeout, network stall, infinite retry) and there is no host-side rescue. The sprint-controller call site (`sprint-controller.ts:541-549`) does NOT pass `defaultTimeoutMs` to the factory:

```typescript
const spawnBackend: SpawnBackend | undefined = opts?.spawnBackend
  ?? (config.spawn_backend
    ? SpawnBackendFactory.create({
        backend: config.spawn_backend,
        projectDir: projectRoot,
        dockerImage: config.docker_image,
        dockerTimeoutSeconds: config.docker_timeout,
      })
    : undefined);
```

Result: subprocess tasks rely entirely on adaptive `taskTimeoutSeconds` per spawn (which Brain sets), but if `brainEstimateTimeout()` ever returns `undefined` or falls through, the subprocess worker has zero protection.

There is also no `subprocess_timeout` config key in `core/config-types.ts` (only `docker_timeout`). The subprocess backend cannot be tuned via config at all.

**Migration triage:** KEEP-PRIVATE.

**Fix recommendation:** Add `subprocess_timeout` to `config-types.ts`, plumb it through the factory call in `sprint-controller.ts`, and default to a sane value (e.g., the same 1200s as docker — they have the same provider CLI underneath).

---

### 4.5 [P2 · CONFLICTING-LOGIC] `sprint-spawner.ts` triple-branch dispatch repeats logic between `spawnWorkers` and `respawnEligibleTasks`

**Evidence:** `src/orchestra/sprint-spawner.ts:287-308` and `:421-441` are nearly identical:

```typescript
// Branch 1 (preferred): factory-supplied backend
if (backend) {
  backend.spawn(task.id, model, prompt, { allowedTools, autoApprove, projectDir });
}
// Branch 2: provider adapter (Codex/Gemini) when no backend + non-tmux provider
else if (!isTmuxProvider(taskProvider)) {
  const adapter = getProviderAdapterForTask(taskProvider);
  if (adapter) { adapter.spawn(task.id, model, prompt, { … }); }
}
// Branch 3: legacy tmux call
else {
  spawnWorker(task.id, model, prompt, projectRoot, { … });
}
```

Two identical 22-line dispatches in the same file = drift hazard. A future fix to one branch (e.g., Sprint 158's `.plan` stub) might be applied here but forgotten in `respawnEligibleTasks`. This already happened with token-usage tracking (Sprint 159).

`isTmuxProvider` itself (`sprint-utils.ts:95-97`) is a 1-line function returning `providerName === 'claude'` — it conflates "provider == claude" with "uses tmux", but Claude can also run via `subprocess` or `docker` backends. The branch logic is correct only because of the outer `if (backend)` guard, but it's confusing.

**Migration triage:** KEEP-PRIVATE.

**Fix recommendation (Sprint 162+):** Extract `dispatchTaskSpawn(task, prompt, opts, backend) → void` helper at the top of `sprint-spawner.ts`. Both `spawnWorkers` and `respawnEligibleTasks` call it. Remove `isTmuxProvider` once docker/subprocess become the default — the legacy tmux path can be reached only via `config.spawn_backend === 'tmux'` explicitly.

---

### 4.6 [P2 · TYPE-SAFETY] Unnecessary `as string[]` assertion in `SubprocessBackend.list()`

**Evidence:** `src/orchestra/spawn-backend.ts:177`

```typescript
list(): string[] {
  return this.getBackend().listWorkers() as string[];
}
```

`SubprocessSpawnBackend.listWorkers()` already returns `string[]` (`src/providers/subprocess.ts:230-232`). The cast is dead.

**Migration triage:** DELETE-CANDIDATE (the cast, not the method).

**Fix recommendation:** Remove the `as string[]` suffix.

---

### 4.7 [P2 · DOC-DRIFT] ADR-027 status is "accepted" but spawn-backend.ts has no ADR back-reference

**Evidence:**
- `.brain/exports/summary.md` lists ADR-027: "Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139) — accepted".
- `src/orchestra/spawn-backend.ts` references no ADR by ID. Comments mention Sprint numbers (138, 139, 145, 149, 151, 154, 158) for docker-specific changes, but the *interface* file establishing the abstraction has zero ADR-027 citations.
- Compare: `src/orchestra/spawn-backend-docker.ts:91-92` references `@deprecated` tag and Sprint numbers but also no ADR-027 anchor.

**Why it matters.** ADR-036 (ADR Governance Integration) requires architectural anchor citations. New maintainers reading `spawn-backend.ts` cannot trace the `BackendType` union back to the decision that introduced it.

**Migration triage:** KEEP-PRIVATE; doc-only fix.

**Fix recommendation:** Add a top-of-file comment block: "`SpawnBackend` interface — the hybrid backend abstraction defined by ADR-027. See `.brain/memory.db` (type='adr', id='adr-027')."

---

### 4.8 [P2 · DEPENDENCY-HYGIENE] `MockSpawnBackend` lives next to production source

**Evidence:** `src/orchestra/spawn-backend-mock.ts` is in the production `src/` tree; usages are exclusively in `tests/e2e/sprint-lifecycle.test.ts` and `tests/e2e/chain-safety.e2e.test.ts`.

**Why it matters.** The file is small (107 LoC) and shippable, but its placement in `src/orchestra/` means it is included in the build artifact (`dist/orchestra/spawn-backend-mock.js`) and is theoretically importable by downstream consumers of the `deckent` npm package. There is no public-API gate to prevent test-only utilities from leaking.

**Migration triage:** UNCERTAIN — could move to `src/testing/` or `tests/helpers/`, but doing so requires updating two e2e test imports. A lighter-weight fix is to add `export const __TEST_ONLY__ = true` and document the boundary.

**Fix recommendation (Sprint 162+):** Move to `tests/helpers/spawn-backend-mock.ts` or rename to `src/orchestra/__test__/spawn-backend-mock.ts` with a tsconfig exclude. Keep current import paths working via a re-export shim during the migration.

---

### 4.9 [P3 · DEAD-CODE] Deprecated `DEFAULT_TIMEOUT_SECONDS` constant retained in docker backend (cited for parity scope only — fix lives in T-161-019 audit)

**Evidence:** `src/orchestra/spawn-backend-docker.ts:90-91` — `@deprecated` tag retained for backward-compat fallback. Out of scope for this audit; flagged here because the same pattern (`@deprecated` constant kept "for backward compat") would smell in the subprocess path if introduced. Currently subprocess has no such constant — clean.

**Migration triage:** N/A for this audit (T-161-019 owns docker findings).

---

### 4.10 [P3 · DRIFT · COMMENT-ONLY] `EXTENSION_ONLY_RE` comment lists `.mjs` as a 4-char extension

**Evidence:** `src/orchestra/sprint-spawner.ts:104-109`

```typescript
/**
 * File extension pattern — matches bare extension entries like `.json`, `.ts`, `.md`.
 * Must have NO path separators (so `.tasks/` is not matched), and the dot must be followed
 * by only short word characters typical of file extensions (max 5 chars).
 * Examples that match (invalid scope entries): `.json`, `.ts`, `.md`, `.mjs`
 * Examples that do NOT match (valid): `.tasks/`, `.deckent/`, `.tasks`, `src/core/`
 */
const EXTENSION_ONLY_RE = /^\.[a-z]{1,5}$/i;
```

The example `.mjs` is correctly matched (3 chars), but the comment "max 5 chars" is technically the extension's body length, not including the dot. Minor — clarify that the bound is on the `[a-z]{1,5}` group only (so `.json` matches with 4 chars).

Also: the example "Examples that do NOT match" lists `.tasks` (no slash, 5-char body of word chars) — but `^\.[a-z]{1,5}$/i` would actually MATCH `.tasks` (6 chars total, but `[a-z]{1,5}` body of `tasks` is 5 chars). Wait — `tasks` is 5 chars, so the regex matches. **The comment claim is wrong.** `.tasks` (without trailing slash) IS rejected by `normalizeScopePath` — which is unintended for users who write `.tasks` (without slash) as a scope entry.

**Why it matters (slightly).** A user writing `Files: .tasks` in DIRECTIVES.md (no trailing slash) gets silently dropped from the allowed-write target list, falling back to the implicit `.tasks/` prepend. Currently invisible because `buildAllowedWriteTargets` already prepends `.tasks/` (`sprint-spawner.ts:160`), so the failure mode is benign. But the comment lies.

**Migration triage:** KEEP-PRIVATE; comment-only correction.

**Fix recommendation:** Update the example list — either include `.tasks` as a match (and verify it's harmless) or refine the regex to `/^\.[a-z]{1,4}$/i` to allow 5-char names like `.tasks` and `.eslint` to pass through.

---

### 4.11 [P3 · DEAD-CODE] `validateTaskDependencies` is exported but rarely called

**Evidence:** `src/orchestra/sprint-spawner.ts:500-505`

```typescript
export function validateTaskDependencies(tasks: Task[]): import('./parallel-pipeline.js').ExecutionWave[] {
  const pipeline = new ParallelPipelineManager();
  return pipeline.createPipeline(
    tasks.map(t => ({ id: t.id, dependencies: t.dependencies ?? [] })),
  );
}
```

`grep "validateTaskDependencies" src/` returns matches only in this file and a re-export. The callers were removed in Sprint 138-139 (replaced by `dependency-scheduler.buildDependencyGraph` + `enforceWaveDependency`). The function still calls `ParallelPipelineManager` which now overlaps with `dependency-scheduler.ts`.

**Why it matters.** `ParallelPipelineManager` (`parallel-pipeline.ts`) and `dependency-scheduler.ts` are partially redundant; this function is a vestige of the older API.

**Migration triage:** DELETE-CANDIDATE (after confirming `tests/orchestra/dependency-pipeline.test.ts` doesn't test this exact function path).

**Fix recommendation (Sprint 162+):** Delete `validateTaskDependencies` and its `ParallelPipelineManager` import; let `dependency-scheduler.buildDependencyGraph` be the sole topological-sort entry point.

---

### 4.12 [P3 · DRIFT] `MockSpawnBackend.spawn` writes a hardcoded `selfAssessment` casing — JSON spec mismatch

**Evidence:** `src/orchestra/spawn-backend-mock.ts:71-79`

```typescript
const result = {
  taskId,
  filesChanged: scenario === 'NO_GO' ? [] : [`src/mock-${taskId}.ts`],
  …
  selfAssessment: scenario,
  notes: `Mock worker: ${scenario} for task ${taskId} (model: ${model})`,
};
```

`scenario` is `'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'TIMEOUT'`. The contract `.contracts/api-surface.md` only allows `'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'` for `selfAssessment`. `'TIMEOUT'` should never reach the result file — the code branches at line 64 (`if (scenario === 'TIMEOUT')`) and writes a `.timeout` marker instead. Behavior is correct, but the type allows the impossible state.

**Migration triage:** KEEP-PRIVATE; type narrowing.

**Fix recommendation:** Narrow the `result.selfAssessment` type to `Exclude<MockScenario, 'TIMEOUT'>` to reflect the runtime invariant, or split `MockScenario` into `ResultScenario | 'TIMEOUT'`.

---

### 4.13 [P3 · DOC-DRIFT] `heartbeat-daemon.ts` is misfiled in `src/orchestra/`

**Evidence:** `src/orchestra/heartbeat-daemon.ts` is invoked **only** from `src/cli/commands/heartbeat.ts:9-10` (CLI command) and has no relationship to worker spawning, sprint orchestration, or the `SpawnBackend` interface. It reads `.deckent/HEARTBEAT.md` and runs whitelisted shell commands periodically — a project-level proactive task runner.

The architecture description in `CLAUDE.md` states: "**orchestra/** — Sprint lifecycle, planning, evaluation, routing (76 modules)". Heartbeat-daemon is not a sprint-lifecycle component.

**Why it matters.** New contributors looking under `src/orchestra/` to understand sprint orchestration will trip over this file and assume it relates to worker heartbeats (which are written by `SubprocessSpawnBackend.writeHeartbeat`, `MockSpawnBackend.spawn`, and the docker container's inline `sh` loop). Cognitive load + grep noise on "heartbeat".

**Migration triage:** UNCERTAIN — moving the file changes import paths in `cli/commands/heartbeat.ts`. Could move to `src/cli/heartbeat-daemon.ts` or `src/maintenance/heartbeat-daemon.ts`.

**Fix recommendation (Sprint 162+):** Move to `src/maintenance/heartbeat-daemon.ts` or `src/cli/internal/heartbeat-daemon.ts`. Update the one CLI import.

---

### 4.14 [P3 · DRIFT] `signalInfo` variable carried verbatim from docker backend; no equivalent in subprocess

**Evidence:**
- `spawn-backend-docker.ts:241, 249, 650, 677` — `signalInfo` for exit codes > 128 (POSIX signal-killed containers)
- `providers/subprocess.ts:197-211` — fallback writer uses only `code === 0 ? … : 'NO_GO'` with no signal awareness

**Why it matters.** Subprocess workers can also be SIGKILL'd by the OS (OOM killer on Linux, hard timeouts on Windows). The fallback `notes` field will say `Subprocess worker exited with code null` (from Node's `code` arg being `null` on signal kill) without ever hinting which signal terminated the process. Docker has signal_info; subprocess has none.

**Migration triage:** KEEP-PRIVATE; small enrichment.

**Fix recommendation (Sprint 162+):** Update `subprocess.ts:189` exit handler to capture `(code, signal)` and embed signal info in the fallback notes.

---

## 4. ADR Compliance Summary

| ADR | Compliance | Notes |
|-----|------------|-------|
| **ADR-006** spawnSync security pattern | ✅ pass | All `spawnSync` calls use array form (`['-V']`, `['info']`, `['stop', '--time=15']`); no shell concatenation in audited files. Heartbeat-daemon `validateCommand` (`heartbeat-daemon.ts:110-138`) enforces ADR-006 explicitly. |
| **ADR-007** SpawnOptions interface | ✅ pass | `SpawnBackendOptions extends ProviderSpawnOptions` (line 53). Type stack is well-layered. |
| **ADR-008** Brain-only import | ✅ pass | `spawn-backend.ts` imports tmux + subprocess providers + docker — but `spawn-backend.ts` is a peer of brain in the orchestra layer, not a downstream consumer. `sprint-spawner.ts` imports tmux/auditor/result-collector but is itself the sprint orchestration boundary (a sub-module of brain). No reverse imports detected. |
| **ADR-009** DEBT.md format | N/A | No DEBT writes from this layer. |
| **ADR-024** sprint-controller god-object split | ✅ pass | `sprint-spawner.ts` is itself an extract from sprint-controller (header comment lines 1-4 confirm). The split is honored. |
| **ADR-027** Hybrid Spawn Backend | ⚠️ partial | Interface + factory + 4 implementations exist (correct shape). But parity is asymmetric — see Findings 4.2, 4.4. **Not a violation per se, but a parity debt.** |
| **ADR-035** Verification Protocol Standard | ✅ pass | TASK_ASSIGN event written via `event-stream.writeEvent` at `sprint-spawner.ts:273-285` before backend dispatch — fail-safe pre-condition state recording. |
| **ADR-037** Authority Matrix RBAC | ✅ pass | Scope is explicitly narrowed via `buildAllowedWriteTargets` (`sprint-spawner.ts:159-173`); the result is passed to backend.spawn as `allowedTools`. ADR-013 protected paths (CLAUDE.md, DECKENT.md) are filtered. |
| **ADR-039** Self-Modifying Detection | ✅ pass | Discrimination logic is upstream in `self-modifying-detector.ts`; sprint-spawner emits TASK_ASSIGN with the full scope payload, which downstream detectors consume. |

---

## 5. Migration Triage (per file)

| File | Verdict | Reasoning |
|------|---------|-----------|
| `spawn-backend.ts` | **KEEP-PRIVATE** | Internal orchestration interface. Fix the JSDoc drift (Finding 4.3), the orphaned-handle bug (Finding 4.1), and the `as string[]` cast (Finding 4.6) before any public surface contract is offered. |
| `spawn-backend-mock.ts` | **UNCERTAIN** (lean MIGRATE-OUT) | Test-only file in production source tree. Move to `tests/helpers/` or namespace it under `src/orchestra/__test__/` with a tsconfig exclude. |
| `sprint-spawner.ts` | **KEEP-PRIVATE** | Sprint orchestration internals. The triple-branch dispatch (Finding 4.5) and dead `validateTaskDependencies` (Finding 4.11) need cleanup. |
| `heartbeat-daemon.ts` | **MIGRATE-OUT** | Misfiled — does not belong under `src/orchestra/`. Move to `src/maintenance/` or `src/cli/internal/`. |

---

## 6. Recommendations (Sprint 162+ Work, NOT Code Changes)

Each item below is a discrete proposal. None of them are code changes from this audit.

1. **(P1, Effort: small)** Fix `SubprocessBackend` orphaned-handle bug. Either pass timeout overrides through `SubprocessSpawnBackend.spawn(opts.timeoutMs)` or move per-task timeout responsibility to the orchestration layer. Add a regression test in `tests/core/spawn-backend.test.ts` that calls `kill()` after `spawn()` with `taskTimeoutSeconds`.

2. **(P1, Effort: medium)** Extract a `BackendPrelude` helper that writes the `.plan` stub + `.partial-result` checkpoint, callable from all three real backends (docker, tmux, subprocess). Required to honor ADR-027 parity claim.

3. **(P1, Effort: small)** Update `SpawnBackendFactory` JSDoc + `SpawnBackend` interface comment to reflect the actual 3-step `docker → tmux → subprocess` selection chain and the `MockSpawnBackend` implementation. Cite ADR-027.

4. **(P1, Effort: small)** Add `subprocess_timeout` config key. Plumb it from `sprint-controller.ts:541-549` into `SpawnBackendFactoryOptions.defaultTimeoutMs`. Default to 1200s for parity with docker.

5. **(P2, Effort: small)** DRY the `spawnWorkers` / `respawnEligibleTasks` triple-branch dispatch into `dispatchTaskSpawn(task, prompt, opts, backend)`.

6. **(P2, Effort: trivial)** Plumb `dockerGracefulTimeoutSeconds` from `config-types.ts → SpawnBackendFactoryOptions`. Add `docker_graceful_timeout` config key (currently exists in `SpawnBackendFactoryOptions` but never wired from config).

7. **(P3, Effort: trivial)** Delete `as string[]` cast at `spawn-backend.ts:177`.

8. **(P3, Effort: trivial)** Delete `validateTaskDependencies` after confirming no test path depends on it; let `dependency-scheduler` own topology validation.

9. **(P3, Effort: trivial)** Move `heartbeat-daemon.ts` out of `src/orchestra/`.

10. **(P3, Effort: trivial)** Narrow `MockSpawnBackend.result.selfAssessment` type to exclude `'TIMEOUT'`; correct the `EXTENSION_ONLY_RE` JSDoc example list.

---

## 7. Audit Conclusion

ADR-027 (Hybrid Spawn Backend) is **structurally honored** — the interface, factory, and four backends exist and the selection chain is correct. The audit's lead question, "ADR-027 hybrid spawn backend correctness, parity with docker backend," resolves as: **interface-level parity is correct; runtime-feature parity is incomplete**.

The most consequential single finding is 4.1 (orphaned subprocess worker handles when adaptive timeouts are used) — currently masked by the result-collector's file-driven design but breaking `deckent kill --worker` in adaptive-timeout sprints. Closing 4.1 is a 10-line fix with a regression test; closing the broader parity gaps (4.2, 4.4) is one to two sprints of refactoring.

No code changes are made by this audit. All 13 findings are documented for triage in Sprint 162+.

---

**End of T-161-020 audit report.**
