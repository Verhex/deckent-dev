# T-161-019 — src/orchestra/ tmux + spawn-backend-docker (READ-ONLY Audit)

**Sprint:** 161 — Lane 1 God-Level READ-ONLY Self-Audit
**Task:** T-161-019
**Auditor:** doc-writer / w-161-019 (resume after Docker OOM kill of prior attempt)
**Date:** 2026-05-08
**Mode:** READ-ONLY — no source modification
**Scope:** `src/orchestra/tmux.ts` (349 LoC), `src/orchestra/spawn-backend-docker.ts` (811 LoC) — total 1160 LoC

## Lead Questions (from DIRECTIVES)

1. Sprint 154 `.claude.json:rw` fix preserved? → **YES** (verified)
2. Docker HB atomic write? → **NO** — atomic write helper exists in `src/agents/worker-lifecycle.ts` but the Docker backend's three HB write paths use plain `writeFileSync` / `echo >`
3. Generator-side asymmetry (Sprint 160)? → **CONFIRMED + EXTENDED** — both backends emit fixture file names that the cleanup sweep filter never matches; tmux is a more severe case than Docker

---

## 1. Scope (exact files)

| File | LoC | Responsibility |
|------|-----|---------------|
| `src/orchestra/tmux.ts` | 349 | tmux session lifecycle, worker window spawn, command builder |
| `src/orchestra/spawn-backend-docker.ts` | 811 | Docker backend impl (`DockerSpawnBackend`), provider-aware CLI invocation, HB monitor, prompt archive |

Cross-referenced (read but not modified):
- `src/orchestra/spawn-backend.ts` (parent interface, factory)
- `src/orchestra/sprint-lifecycle.ts` (sweep filter consumer)
- `src/orchestra/sprint-docs-updater.ts` + `src/cli/commands/cleanup.ts` (sweep filter consumers)
- `src/agents/worker-lifecycle.ts` (`atomicWriteFileSync` helper)
- git log for `9b91405` (Sprint 154 Wave A) and `2aaeae7` (Wave C)

---

## 2. Findings

### Severity legend
- **P0** — correctness break, mandate violation, or runtime asymmetry between backends
- **P1** — durability/observability gap, ADR drift, or load-bearing hidden behaviour
- **P2** — duplication, dead code, deprecated-but-live constructs
- **P3** — style, portability, comment churn

### P0 — `tokenUsage` field missing in tmux fallback result (cross-backend asymmetry)

**File:** `src/orchestra/tmux.ts:121-125`

```ts
const fallbackJson = JSON.stringify({
  taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0,
  linesRemoved: 0, testsPassed: false, coverage: 0,
  selfAssessment: 'NO_GO', notes: 'Worker exited without writing result file',
});
```

The EXIT trap fallback JSON omits `tokenUsage`. The Sprint 140 mandate (DECKENT.md / DIRECTIVES task brief) is that **results without `tokenUsage` are rejected as NO_GO**. By contrast, the Docker generator ships `tokenUsage` in three result branches (`spawn-backend-docker.ts:243, 251, 690`) — including the `provider`/`model` fields. Tmux fallback also skips `provider`/`model` entirely.

Consequence: a tmux worker that exits before writing its own `.result` will be double-flagged — once because the trap detected the early exit, once because Brain rejects the trap-written `.result` for missing `tokenUsage`. This contradicts the trap's stated purpose ("guarantees `.result` file is ALWAYS written").

### P0 — Generator-side fixture name asymmetry (extends Sprint 160 finding)

**Generators (file emitters):**
- `tmux.ts:60` — `writePromptFile` emits `.prompt-${id}.txt` where `id = randomBytes(8).toString('hex')` — **does not include taskId at all**
- `spawn-backend-docker.ts:167` — emits `.prompt-${taskId}-${promptId}${fixSuffix}.txt`
- `spawn-backend-docker.ts:187` — emits `.worker-${taskId}.sh`

**Consumers (sweep filters expecting different names):**
- `sprint-lifecycle.ts:269` — `file.startsWith('.prompt-task-')` AND `file.startsWith('.worker-task-')`
- `sprint-docs-updater.ts:706` — `f.startsWith('.prompt-task-')`
- `cli/commands/cleanup.ts:78` — `f.startsWith('.prompt-task-')`

**Practical effect:**
- Tmux prompt files (`.prompt-{hex}.txt`) are **never matched** — they have no taskId at all. They are leaked indefinitely until manual cleanup. Only `cleanupPromptFile()` deletes them, and it is called by `claude.ts:156` for a narrow case during provider lifecycle.
- Docker prompt files (`.prompt-{taskId}-{hex}.txt`) start with `.prompt-` but **not** `.prompt-task-`, so the consumer filter misses them. The Docker backend's own `archivePromptFiles()` (line 758-811) uses the broader prefix `.prompt-` with `.txt` suffix and works correctly — but only inside Docker, not from cleanup.ts.
- Docker worker scripts (`.worker-${taskId}.sh`) similarly miss `.worker-task-` filter.

This confirms the Sprint 160 finding (referenced in `docs/superpowers/plans/2026-05-08-sprint-161-god-audit-execution.md:1175`) and adds a more severe variant (tmux has no taskId in filename at all).

### P1 — Docker HB writes are NOT atomic (claim drift vs identity)

**Identity claim** (`.deckent/workspace/IDENTITY.md`): *"Docker HB Core Fix 5-sprint P0 (Sprint 139 Task 13 — atomicWriteFileSync + SIGTERM fsync handler + 15s grace period, +382 LoC)"*

**Reality in `spawn-backend-docker.ts`:**

| Site | Line | API used | Atomic? |
|------|------|----------|---------|
| Initial HB write (host-side, after `docker run`) | 431-440 | `writeFileSync(hbPath, JSON.stringify(...), 'utf-8')` | **No** |
| HB update on container exit (host-side, in `monitorContainer`) | 612-621 | `writeFileSync(hbPath, ...)` | **No** |
| Periodic HB update inside container (heredoc-injected shell loop) | 308 | `echo "{...}" > "$HBFILE"` | **No** (truncate-then-write race) |

The atomic helper exists at `src/agents/worker-lifecycle.ts:43-53` (`atomicWriteFileSync` — temp file + fsync + rename) but is **only used by the Node-side `worker.ts`**, which the Docker backend never invokes (the Docker container runs the provider CLI directly). A SIGKILL between the in-container `> "$HBFILE"` truncate and the echo's data write leaves a 0-byte HB file → auditor sees stale-state.

The SIGTERM handler at `spawn-backend-docker.ts:306` does call `fsync_file "$HBFILE"`, which mitigates the durability side, but the truncate-write race remains during normal heartbeat cadence.

This is not strictly a regression — it has been this way since Sprint 139 — but the identity-document framing implies host/container HB writes are atomic. They are not.

### P1 — `WORKER_TIMEOUT_SECONDS` deprecation marker masks live fallback (drift)

**File:** `tmux.ts:70-71` and `spawn-backend-docker.ts:90-91`

Both files declare a `1200` constant with `@deprecated Use adaptive timeout via brainEstimateTimeout() ...` — but both are **still the load-bearing fallback** when `taskTimeoutSeconds` is undefined:

- `tmux.ts:116`: `const tSec = timeoutSeconds ?? WORKER_TIMEOUT_SECONDS;`
- `spawn-backend-docker.ts:115`: `this.timeoutSeconds = opts?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;`

A reader following the deprecation hint would expect the constant to be unreachable. Recommendation: either drop `@deprecated` or rename to `*_FALLBACK_TIMEOUT_SECONDS` to reflect actual role.

### P1 — Tmux fallback `.timeout` marker writer doesn't include `signal=` info (cross-backend drift)

**File:** `tmux.ts:129`

```ts
cmd = `${trap}; timeout ${tSec} sh -c '...' || echo "WORKER_TIMEOUT" > ${timeoutMarker}`;
```

Docker analog (line 314 / 244 / 251) embeds `exitCode` and `signal_info` (`signal=$((exit_code - 128))`) into both the result JSON and the timeout-related notes. Tmux only writes the literal string `WORKER_TIMEOUT` to the marker. Result-collector reading these will see different schemas across backends.

### P2 — Dead exports in `tmux.ts`

| Export | Line | Status |
|--------|------|--------|
| `buildClaudeCommand` (deprecated alias of `buildWorkerCommand`) | 135 | No live callers; the only `buildClaudeCommand` reference in `src/` is a doc comment in `core/provider.ts:69`. **DEAD-CODE-CANDIDATE** |
| `sendKeys` | 275 | No callers anywhere in `src/`. Marked `@internal` but unused. **DEAD-CODE-CANDIDATE** |

(Tests in `tests/` are excluded from this sprint per DIRECTIVES — fixture-side may still reference these.)

### P2 — Conflicting/duplicate Docker-availability checks

**Files:**
- `spawn-backend-docker.ts:550-557` — `DockerSpawnBackend.isAvailable(): Promise<boolean>` (instance method, async)
- `spawn-backend-docker.ts:737-744` — `isDockerAvailable(): boolean` (free function, sync)

Both run identical `spawnSync('docker', ['info'], {timeout: 5_000, stdio: ['pipe','pipe','pipe']})` and check `result.status === 0`. The free function is consumed at `spawn-backend.ts:254` (factory pre-check); the instance method is consumed at `spawn-backend.ts:288` (post-construction probe).

Two near-identical checks for the same condition is a small duplication; consolidating into a single helper would shrink ~15 LoC and remove the sync/async asymmetry.

### P2 — Circular import inside orchestra/

- `spawn-backend.ts:6` imports from `spawn-backend-docker.ts`
- `spawn-backend-docker.ts:16-17` imports `SpawnBackend, SpawnBackendOptions, SpawnBackendError` from `spawn-backend.ts`

ESM tolerates this (no top-level side effects), but it is a code smell. ADR-008 (Brain merkezi import) is **not** technically violated — that ADR is about brain-vs-leaf, not intra-orchestra. Still, lifting `SpawnBackend` interface + `SpawnBackendError` + `SpawnBackendOptions` into `spawn-backend-types.ts` would break the cycle and mirror the rest of the `core/*-types.ts` convention.

### P2 — Constant duplication between tmux + docker

- `tmux.ts:71` `WORKER_TIMEOUT_SECONDS = 1200`
- `spawn-backend-docker.ts:91` `DEFAULT_TIMEOUT_SECONDS = 1200`

Same value, both deprecated, both still load-bearing. `core/constants.ts` already exists and is imported by tmux.ts (`TASKS_DIR`, `TMUX_*`). The two timeouts could share a single export there.

### P2 — `spawnSync('sleep', ['0.5'])` busy-wait (efficiency)

**File:** `spawn-backend-docker.ts:482`

```ts
for (let i = 0; i < 10; i++) {
  spawnSync('sleep', ['0.5'], { timeout: 2_000 });
  if (existsSync(resultPath)) break;
}
```

Spawning an external `sleep` process per iteration costs ~5–10 ms each on Linux and depends on `/bin/sleep` existing on PATH. A `setTimeout`-based async poll (or `Atomics.wait` on a buffer) would be cheaper and remove the external dependency. Functionally correct; just wasteful.

### P3 — `local` keyword in POSIX-shebanged worker script

**File:** `spawn-backend-docker.ts:212-258` (heredoc-emitted script with `#!/bin/sh`)

Lines 212, 220, 222, 233, 240, 248, 258 use `local`. The `local` builtin is **not** POSIX — it is a bash/dash/busybox-sh extension. Worker images run Alpine (busybox sh), so this works in practice. If the runtime image ever moves to a strictly POSIX shell (`pdksh`, `mksh` certain configs), the script breaks.

Recommendation: drop `local` and rely on subshell scoping, or change shebang to `#!/bin/bash` and require bash in the worker image. The latter matches reality.

### P3 — Sprint-tagged comments (history-as-code)

`spawn-backend-docker.ts` carries dense narrative comments tagged by sprint number (`Sprint 145`, `Sprint 148`, `Sprint 149`, `Sprint 150`, `Sprint 151`, `Sprint 153`, `Sprint 154`, `Sprint 158`). Some explain *why* (Sprint 154 audit A1.F2 explanation at line 405-410 is genuinely valuable — links to forensic evidence). Others narrate *when* without adding constraint (e.g. "Sprint 158: pre-execution .plan stub for observability" at line 285).

The narrative is currently the only durable record of the 5-sprint Docker HB hardening journey, so wholesale removal would lose archaeology. Recommend a cleanup pass that keeps "why" notes and removes pure "when" markers, OR moves the journey into a single block comment at the top of the file.

### P3 — Doc claim accuracy spot-checks

- Line 105 comment: *"taskId → container info"* — accurate (Map<string, …>).
- Line 449 comment: *"Sprint 139 fix: increased grace period from 10s to 15s"* — accurate (constructor default at line 93 = `15`; constructor opts.gracefulTimeoutSeconds overrides; ALL-callers test showed 15s default in factory).
- Line 723 comment: *"Sprint 158 audit found that the previous \"size === 0 + delete ALL .worker-*.sh\" logic over-aggressively wiped sibling tasks' scripts"* — accurate per `git log -S '.worker-*'`. **Worth keeping** — this is a non-obvious constraint a future refactor would otherwise re-break.

### Sprint 154 `.claude.json:rw` fix — verified preserved

**Source:** Sprint 154 Wave A (commit `9b91405`, T1 [A1.F1 ROOT CAUSE]).

```ts
// spawn-backend-docker.ts:343
'-v', `${join(home, '.claude')}:${containerHome}/.claude`,
// spawn-backend-docker.ts:345-347
...(existsSync(join(home, '.claude.json'))
  ? ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json`]
  : []),
```

Both `-v` arguments are emitted **without** the `:ro` suffix → Docker default mode (rw) applies. The accompanying comment at line 343 ("rw: session-env must be writable") and at line 348-352 ("Gemini auth — … mounted rw: gemini CLI refreshes oauth_creds.json") document the rationale. **The Sprint 154 ROOT CAUSE fix is preserved.**

---

## 3. Evidence (file:line citations)

| ID | File | Lines | Evidence |
|----|------|-------|----------|
| P0-1 | `tmux.ts` | 121-125 | `tokenUsage` absent in fallback JSON |
| P0-1 | `spawn-backend-docker.ts` | 243, 251, 690 | `tokenUsage` present in all three Docker fallback branches |
| P0-2 | `tmux.ts` | 60 | `.prompt-${id}.txt` (no taskId) |
| P0-2 | `spawn-backend-docker.ts` | 167, 187 | `.prompt-${taskId}-…`, `.worker-${taskId}.sh` |
| P0-2 | `sprint-lifecycle.ts` | 269 | filter expects `.prompt-task-` and `.worker-task-` |
| P0-2 | `sprint-docs-updater.ts` | 706 | filter expects `.prompt-task-` |
| P0-2 | `cleanup.ts` | 78 | filter expects `.prompt-task-` |
| P1-1 | `spawn-backend-docker.ts` | 308, 431-440, 612-621 | non-atomic HB writes |
| P1-1 | `worker-lifecycle.ts` | 43-53 | unused-by-Docker `atomicWriteFileSync` helper |
| P1-2 | `tmux.ts` | 70-71, 116 | `WORKER_TIMEOUT_SECONDS` deprecated but live |
| P1-2 | `spawn-backend-docker.ts` | 90-91, 115 | `DEFAULT_TIMEOUT_SECONDS` deprecated but live |
| P1-3 | `tmux.ts` | 129 | timeout marker has no signal/exitCode info |
| P2-1 | `tmux.ts` | 135, 275 | dead `buildClaudeCommand`, `sendKeys` |
| P2-2 | `spawn-backend-docker.ts` | 550, 737 | duplicated docker-info checks |
| P2-3 | `spawn-backend.ts` ↔ `spawn-backend-docker.ts` | 6 ↔ 16-17 | mutual import cycle |
| P2-4 | `tmux.ts:71` ↔ `spawn-backend-docker.ts:91` | const dup | both = 1200 |
| P2-5 | `spawn-backend-docker.ts` | 482 | `spawnSync('sleep', …)` busy-wait |
| P3-1 | `spawn-backend-docker.ts` | 212-258 | `local` keyword under `#!/bin/sh` |

---

## 4. ADR / 10-dimension checklist

| Dim | Verdict | Notes |
|-----|---------|-------|
| 1. Dead code | 2 dead exports in `tmux.ts` (P2-1) | `buildClaudeCommand`, `sendKeys` |
| 2. ADR violations | None confirmed | ADR-006 (spawnSync security): both files use `spawnSync(cmd, [args])` with array, no shell=true. ADR-007 (SpawnOptions interface): tmux exports `SpawnOptions`, conformant. ADR-008 (Brain merkezi): orchestra-internal cycle exists but ADR-008 governs brain-leaf direction, not intra-orchestra. ADR-027 (Hybrid Spawn Backend): both files implement parts of the hybrid; preserved. |
| 3. Conflicting areas | duplicate docker-availability (P2-2); duplicated TIMEOUT constant (P2-4); generator-vs-consumer fixture asymmetry (P0-2) |
| 4. Drift | Identity claim "atomicWriteFileSync" not propagated to Docker backend (P1-1); `@deprecated` marker masks live fallback (P1-2); cross-backend timeout marker schemas differ (P1-3) |
| 5. Type safety | **Clean.** No `any`, no `ts-ignore`, no `as unknown as` chain. JSON parses use safe casts (`as { selfAssessment?: string }`, `as Record<string, unknown>`). |
| 6. Dependency hygiene | All `.js` ESM extensions present. **Circular import** (P2-3) inside orchestra/. |
| 7. Documentation pollution | Sprint-tagged comments dense in docker file (P3-2). Some valuable (Sprint 158 over-delete history at line 723), some pure WHEN markers. |
| 8. Memory V2 coherence | N/A — neither file touches `memory.db`. |
| 9. Config integrity | Deprecated-but-live constants (P1-2). Hardcoded image name (`deckent-worker:latest`) — overridable via constructor opts.image; documented. |
| 10. Migration triage | See below. |

---

## 5. Migration triage (per file)

| File | Disposition | Rationale |
|------|------------|-----------|
| `src/orchestra/tmux.ts` | **MIGRATE-PUBLIC** with cleanups | Core orchestration, ADR-006/007/027 compliant. Pre-public TODO: drop `buildClaudeCommand` + `sendKeys` (P2-1), close fixture-name asymmetry (P0-2), add `tokenUsage` to fallback JSON (P0-1), align timeout-marker schema with Docker (P1-3). |
| `src/orchestra/spawn-backend-docker.ts` | **MIGRATE-PUBLIC** with hardening | Sprint 154 fix preserved; load-bearing for multi-provider docker. Pre-public TODO: route HB writes through `atomicWriteFileSync` (P1-1), unify docker-info checks (P2-2), break the import cycle by extracting `spawn-backend-types.ts` (P2-3), promote sprint-narrative comments to a single header block (P3-2). |

---

## 6. Recommendation for Sprint 162+

A focused follow-up sprint **"Backend Generator/Consumer Symmetry + HB Atomicity"** would address the highest-impact findings without a refactor sprint:

1. **(P0-2 fix)** Either rename generator output to `.prompt-task-${taskId}-${hex}.txt` and `.worker-task-${taskId}.sh` (smaller change) **or** broaden consumer filters to `.prompt-` / `.worker-` prefix (broader but higher blast radius). Either choice; document tradeoff in ADR-amendment.
2. **(P0-1 fix)** Make tmux fallback JSON identical-shape to Docker fallback. Hoist the fallback shape constructor to `core/result-builder.ts` and have both backends call it.
3. **(P1-1 fix)** Replace plain `writeFileSync` HB writers in `spawn-backend-docker.ts:431, 612` with `atomicWriteFileSync` from `worker-lifecycle.ts` (re-export to break import direction). For the in-container heartbeat loop (line 308), use `mv tmpfile $HBFILE` so the truncate-then-write race disappears.
4. **(P2-3 fix)** Extract `spawn-backend-types.ts` containing `SpawnBackend`, `SpawnBackendOptions`, `SpawnBackendError`. Re-import from both `spawn-backend.ts` and `spawn-backend-docker.ts`. Removes ESM cycle and aligns with `core/*-types.ts` convention.
5. **(P2-1 fix)** Delete `buildClaudeCommand` alias + `sendKeys` export.
6. **(P3-1 fix)** Either drop `local` (use `var=$(…)`-style without scoping) or change shebang to `#!/bin/bash`.

These are six narrowly-scoped, well-tested edits — each ≤ 50 LoC of source change. None require behavioural changes beyond the symmetry/atomicity contract; all are reversible.

**This audit recommends NO source code changes in Sprint 161 itself** — output is the report you are reading. Implementation belongs in Sprint 162+.

---

## 7. Sprint 161 task constraint check

- Output: ONE markdown file at `docs/audits/sprint-161/T-161-019-orch-tmux-docker.md` ✓
- No source modification in this task ✓
- READ-ONLY mandate ✓
- Scope.filesWrite single-path ✓
- ADR-039 self-modifying detector: this task IS audit of Deckent's own source, so the warning fired (acknowledged); the audit produces only a markdown report and breaches no scope boundary.
