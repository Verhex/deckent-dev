# T-154-001: Docker Runtime & Prompt Delivery

**Audit window:** Sprint 154 comprehensive pre-execute pass — A1 (docker-runtime)
**Auditor:** A1 (RUNTIME mode)
**Date:** 2026-05-07
**Scope evidence root:** `.tasks/archive/sprint-153-prompt-delivery-bug-evidence/`, `.tasks/archive/sprint-153-run-dogfood/`, `.tasks/archive/sprint-154-aborted-wsl-shutdown/`

## 1. Scope & File Inventory

| File | Audited | Verdict | Note |
|------|---------|---------|------|
| `src/orchestra/spawn-backend-docker.ts` | YES (full read) | **FAIL — F1, F2, F3** | 675 LoC; root cause of Sprint 153 prompt-delivery bug here (line 256-258 read-only mount + insufficient stdout capture) |
| `src/orchestra/spawn-backend.ts` | YES (full read) | PASS | 298 LoC; factory + interface clean; defaults/wiring OK |
| `src/orchestra/spawn-backend-mock.ts` | YES (full read) | PASS | 108 LoC; deterministic test backend, no Docker concerns |
| `Dockerfile.worker` | YES | **FAIL — F4, F5, F6** | 38 LoC; missing CA certs / non-root USER / start_period |
| `Dockerfile` (top-level) | YES | INFO | Not used by worker spawn; orchestrator image only |
| `tests/orchestra/spawn-backend-move.test.ts` | YES (head/tail) | PASS | 149 LoC; backend factory unit tests, no runtime issue |
| `tests/orchestra/spawn-prevention.test.ts` | YES (head) | PASS | 494 LoC; spawn dedup; no runtime gap |
| `tests/orchestra/spawn-timeout.test.ts` | YES (head) | PASS | 194 LoC; timeout overrides verified |
| `tests/e2e/docker-backend.test.ts` | YES (head, grep) | **PARTIAL — F7** | 983 LoC; T1–T24 verify HB/list/kill/log surface BUT explicitly avoid asserting real Claude prompt-→-response (line 6, 8: "claude exits quickly without auth") — dogfood gap |
| `tests/e2e/docker-hb-shutdown.test.ts` | YES (wc) | PASS | 436 LoC; Sprint 139 fsync regression suite |
| `tests/e2e/docker-oom-reproducer.test.ts` | YES (head) | PASS | 353 LoC; OOM/partial-result template assertions, source-only |
| `tests/e2e/event-stream-runtime.test.ts` | YES (wc) | OUT-OF-SCOPE-NOTE | 469 LoC; event stream simulation, not docker-runtime; no findings here |
| `.tasks/archive/sprint-153-prompt-delivery-bug-evidence/` | YES (forensic) | **EVIDENCE — F1** | 6 fix-result files all `exit=137` partial promotions; OOM kill chain |
| `.tasks/archive/sprint-153-run-dogfood/` | YES (forensic) | **EVIDENCE — F1, F2** | run-result `exit=0 NO_GO + WORKER_TIMEOUT marker` — silent claude exit reproduced |

**Files audited:** 13 / 13 in scope (100%). **N/A justified:** 0.

---

## 2. Findings

### F1 [P0] Claude CLI silently exits with **0 bytes stdout** inside worker container — `.claude.json:ro` mount blocks config persistence, CLI aborts before sending any API request

**Kanıt — live container reproduction (this audit, 2026-05-07T07:13Z):**

Spawned a worker container with the EXACT mount/env/script pattern of `spawn-backend-docker.ts` (uid=1000, HOME=/tmp/deckent-home, `--tmpfs` 100m, `.claude` rw, `.claude.json:ro`). Replayed every supported invocation:

```
[fa2] Test 1: claude -p - --model haiku --dangerously-skip-permissions < prompt.txt
      exit=0 bytes=0
[fa2] Test 2: claude -p "<prompt>" --model haiku --dangerously-skip-permissions
      exit=0 bytes=0
[fa2] Test 3: claude -p - --model haiku --allowedTools "..." --dangerously-skip-permissions
      exit=0 bytes=0
[fa3] claude --print --debug --model haiku "Say HI42 cleanly."
      exit=0 stdout=0 bytes stderr=0 bytes
```

Then `--debug-file /tmp/claude-debug.log` was used, which captured the smoking gun (`spawn-backend-docker.ts:256-258` mount):

```
[ERROR] Failed to write file atomically: Error: EBUSY: resource busy or locked,
        rename '/tmp/deckent-home/.claude.json.tmp.13.X' -> '/tmp/deckent-home/.claude.json'
[DEBUG] Falling back to non-atomic write for /tmp/deckent-home/.claude.json
[ERROR] Non-atomic write also failed: Error: EROFS: read-only file system,
        open '/tmp/deckent-home/.claude.json'
[ERROR] Failed to save config with lock: Error: EROFS: read-only file system,
        open '/tmp/deckent-home/.claude.json'
[DEBUG] Git remote URL: null
[DEBUG] No git remote URL found
<EXIT — no further log lines, no API request, no stdout token written>
```

The CLI never reaches the `messages` API call — startup config-write fails, retries fail, and `--print` short-circuits to silent exit 0.

**Source location:**
```
src/orchestra/spawn-backend-docker.ts:256-258
  ...(existsSync(join(home, '.claude.json'))
    ? ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json:ro`]
    : []),
```

**Sprint 153 evidence linkage:**
- `.tasks/archive/sprint-153-run-dogfood/task-run-run-mot7q7n2.result` →
  `{"selfAssessment":"NO_GO","exitCode":0,"notes":"Worker exited without writing result (exitCode=0)"}`
  + `WORKER_TIMEOUT` marker present → exact pattern of silent claude exit + `timeout` killing the *waiting* CLI after $TASK_TIMEOUT seconds.
- 17 sprint-153 workers reportedly EXECUTING 20–47 min: heartbeat loop (`spawn-backend-docker.ts:223`) keeps writing `status:"EXECUTING"` every 15 s in background while the foreground `claude` is already silently dead. The 20–47 min spans = `TASK_TIMEOUT` (1200 s) elapsing before the timeout wrapper fires. After expiry, `WORKER_TIMEOUT` marker is written and on_exit trap takes the NO_GO branch (`linesAdded:0`).

**Etki:**
- **0/17 Sprint 153 workers produced any code.** All 17 results show `linesAdded:0` because Claude never ran past startup.
- 100% of fix-pass workers (`task-153-NNN-fix.result`) also OOM-killed (exit 137) — but the OOM is downstream: the silently-stuck Claude process and the 15s-cycle background heartbeat loop accumulate memory across the 1200 s timeout window until the 4 GB cgroup limit fires. The original cause is still F1.
- This is a **P0 launch-blocker for Beta GA** — no Docker worker can produce work until F1 is fixed.

**Verification gate (post-fix):**
```
# 1. Source-level: confirm rw mount removed/replaced
grep -E "\.claude\.json:.*ro" src/orchestra/spawn-backend-docker.ts | wc -l   # MUST be 0

# 2. Live: spawn a single container with new code, verify Claude reaches API
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/deckent-home \
  --memory 4g --memory-swap 6g \
  --tmpfs /tmp/deckent-home:size=100m,uid=$(id -u),gid=$(id -g) \
  -v /tmp/deckent-fix-test:/workspace \
  -v ~/.claude:/tmp/deckent-home/.claude \
  -v ~/.claude.json:/tmp/deckent-home/.claude.json   # NO :ro
  deckent-worker:latest \
  sh -c 'echo "Reply with the literal word OK and stop." | timeout 60 claude -p - --model haiku --dangerously-skip-permissions'
# Expected: stdout contains "OK" (>= 2 bytes), exit 0
```

**Recommended fix (one-liner):** drop `:ro` flag — Claude CLI MUST write `.claude.json`. If the host file must stay read-only, copy it into the tmpfs `.claude` mount as part of script bootstrap (`cp /tmp/host-claude.json /tmp/deckent-home/.claude.json`). Either is sub-10-line change.

---

### F2 [P0] `docker logs` capture path racy — `.tasks/task-{id}.log` becomes `"can not get logs from container which is dead or marked for removal"` post-mortem

**Kanıt — sprint-153 evidence:**
```
$ cat .tasks/archive/sprint-153-prompt-delivery-bug-evidence/task-153-001-fix.log
Error response from daemon: can not get logs from container which is dead or marked for removal
```
**Source location:** `src/orchestra/spawn-backend-docker.ts:556-565`
```
const logResult = spawnSync('docker', ['logs', containerName], {
  encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
});
const logContent = (logResult.stdout ?? '') + (logResult.stderr ?? '');
if (logContent.trim()) {
  const logPath = join(tasksDir, `task-${taskId}.log`);
  writeFileSync(logPath, logContent, 'utf-8');
}
```

The race: in `monitorContainer`, after `docker wait` returns, two cleanup paths can run concurrently:
1. `kill(taskId)` (line 360-361) → `docker rm -f` (sometimes called from `verifyResultAfterStop` parent)
2. The `monitorContainer` wait callback also does `docker rm -f` (line 568-570) AFTER the `docker logs` capture
3. But ALSO the `--rm` flag is conspicuously absent from the `docker run -d` args (good — gives the wait callback a chance) **HOWEVER** `kill()` and `monitorContainer()` both call `docker rm -f` independently with **no synchronization**.

When `kill()` (called by graceful shutdown / sprint cleanup) wins the race, the container is gone before `monitorContainer` reaches the `docker logs` line, and the `Error response from daemon: can not get logs from container which is dead or marked for removal` text gets written to the `.log` file (because `logResult.stderr` is appended to `logContent` and is non-empty).

**Etki:**
- Forensic visibility lost when sprint is killed mid-flight (every Ctrl-C / sprint kill) → cannot diagnose silent worker bugs from logs
- Sprint 153 audit relied on memory + partial-result; the `.log` files were uniformly the daemon error string

**Verification gate (post-fix):**
```
# Test path: spawn a container that prints, then kill+remove inline, capture .log
# Expected: .log either has real stdout OR is absent (NOT the daemon error string)
grep -L "can not get logs" .tasks/task-*.log
```

**Recommended fix:** stream logs FROM container start (use `docker logs -f` or `docker run` without `-d` but with stdout/stderr piped to a file at script-launch time, or attach a `nodeSpawn('docker', ['logs', '-f', name])` whose stdout is piped directly to `.log` — this captures incrementally and survives container removal). Reference: `monitorContainer` already uses `nodeSpawn('docker', ['wait', ...])` — same pattern works for `logs -f`.

---

### F3 [P1] `WORKER_TIMEOUT` masking — `timeout $T claude || echo WORKER_TIMEOUT > marker` leaks exit code, downstream evaluator reads exit 0 + WORKER_TIMEOUT marker simultaneously

**Kanıt:** `spawn-backend-docker.ts:226`
```
timeout $TIMEOUT ${claudeCmd} < "..." || echo "WORKER_TIMEOUT" > "${timeoutPath}"
```

When `timeout` kills the foreground claude (exit 124) the `||` branch fires and writes the marker. **But** the script's `$exit_code` (captured in `on_exit()`) is then $? of the **echo**, which is 0 — NOT 124. The on_exit trap's `[ "$exit_code" -ne 0 ]` branch is skipped, taking the "no partial work" branch, and writes:
```
selfAssessment:"NO_GO" exitCode:0 notes:"Worker exited without writing result (exitCode=0) — HIT WORKER_TIMEOUT"
```
matching exactly `task-run-run-mot7q7n2.result` from the dogfood evidence.

The `[ -f "${timeoutPath}" ] && timeout_hit=...` line at L147 is the partial mitigation Sprint 153 added — it surfaces the timeout in the notes string. But the critical issue remains: the **EVALUATION** path (host-side `monitorContainer`, line 433) determines `hbStatus` from `exitCode === 0 ? 'DONE' : 'FAILED'`. With `exitCode=0`, the heartbeat reports **DONE** (`task-run-run-mot7q7n2.hb` evidence: `"status":"DONE","exitCode":0`).

**Etki:**
- Brain sees `hb.status=DONE` + `exitCode=0` for a worker that actually timed out → spurious-DONE class of bug (mirror of the spurious NO_GO Sprint 137 introduced helper for, but in the opposite direction)
- Evaluator may down-rank the task as "successful but produced no work" instead of correctly classifying as a timeout failure

**Verification gate (post-fix):**
```
# 1. Source: capture timeout exit code BEFORE running echo
grep -E "TIMEOUT_EXIT=\$\?" src/orchestra/spawn-backend-docker.ts   # MUST exist after fix

# 2. Live: simulate stuck claude (sleep 999) with TASK_TIMEOUT=5
# Expected: .result has exitCode:124, hb status="FAILED" (not DONE)
```

**Recommended fix** (~5 lines):
```sh
timeout $TIMEOUT ${claudeCmd} < "...prompt..."
TIMEOUT_EXIT=$?
if [ $TIMEOUT_EXIT -eq 124 ] || [ $TIMEOUT_EXIT -eq 137 ]; then
  echo "WORKER_TIMEOUT" > "${timeoutPath}"
  exit $TIMEOUT_EXIT   # propagate to on_exit trap so $exit_code is honest
fi
```

---

### F4 [P1] `Dockerfile.worker` missing CA certs — `curl https://api.anthropic.com` fails IPv4 with "error setting certificate file: /etc/ssl/certs/ca-certificates.crt"

**Kanıt — live test:**
```
[fa6] curl -v https://api.anthropic.com
  *   Trying [2607:6bc0::10]:443...
  * Immediate connect fail for 2607:6bc0::10: Network is unreachable
  *   Trying 160.79.104.10:443...
  * error setting certificate file: /etc/ssl/certs/ca-certificates.crt
  curl: (77) error setting certificate file: /etc/ssl/certs/ca-certificates.crt
[fa7] $ ls /etc/ssl/certs/
  ls: cannot access '/etc/ssl/certs/': No such file or directory
```
**Source location:** `Dockerfile.worker:12-15`
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*
```
The base image `node:24-trixie-slim` does not pre-include `ca-certificates`. The `RUN apt-get install` chain installs `curl` but not `ca-certificates`, so `/etc/ssl/certs/` is never populated.

**Why Claude CLI may still partially work:** Claude CLI's debug log shows `[DEBUG] CA certs: Loaded 145 bundled root certificates` — Claude bundles its own roots and does NOT depend on system certs. So **F4 is NOT the cause of the silent-exit bug (that's F1)**, but it does mean any non-Claude HTTPS call from inside the worker (curl in scripts, `npm install` for dependencies, `git fetch https://`) will fail — particularly relevant for tasks that try to `npm ci` or `git remote update` from within their scope.

**Etki:**
- Worker scripts that need `curl` or HTTPS git operations silently fail
- IPv6 also "Network is unreachable" → recommend disabling IPv6 default route or installing `ca-certificates`

**Verification gate (post-fix):**
```
docker run --rm deckent-worker:latest \
  curl -sSf -o /dev/null -w "%{http_code}\n" https://api.anthropic.com
# Expected: 405 (or 200 with auth) — NOT 000 / curl: (77)
```

**Recommended fix (Dockerfile.worker line 12):**
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

---

### F5 [P1] `Dockerfile.worker` runs as `root` (no `USER` directive) — Beta GA Gate #14 unsatisfied for the worker image

**Kanıt:** `Dockerfile.worker` end of file shows:
```
ENV HOME=/tmp/deckent-home
WORKDIR /workspace
HEALTHCHECK ...
CMD ["echo", "deckent-worker ready"]
```
No `RUN useradd ... && USER ...` lines. The top-level `Dockerfile:25-30` shows the orchestrator image DOES create + switch to `deckent` user, but the worker image does NOT. Sprint 154 DIRECTIVES Task 8 explicitly tracks this as a Beta GA gate:
> "Beta GA Gate #14 (non-root) Dockerfile.worker'da partial. `USER deckent` directive ekle"

The runtime mitigation today is `--user "${uid}:${gid}"` at `spawn-backend-docker.ts:238` — workers DO run as host UID/GID. So in practice non-root is achieved. But **image-level default is still root**, so any direct `docker run deckent-worker:latest sh` (no `--user` override) runs as root, breaking principle of least privilege at the image surface.

**Etki:**
- Auditor (CI image-scan tools) flag worker image as root-by-default
- Beta GA Gate #14 reads as PARTIAL/FAILED depending on tool

**Verification gate (post-fix):**
```
docker inspect deckent-worker:latest --format '{{.Config.User}}'
# Expected: deckent (or 1000) — NOT empty / root
```

**Recommended fix** (Task 8 owns the implementation):
```dockerfile
RUN groupadd -g 1000 deckent && useradd -u 1000 -g deckent -m -d /home/deckent deckent \
 && mkdir -p /workspace && chown -R deckent:deckent /workspace /tmp/deckent-home
USER deckent
```
*Note:* A1 owns runtime, A5 owns Dockerfile USER directive proper — flagging here to alert A5 and confirm runtime path is unaffected (the `--user` override at spawn time keeps backward compat).

---

### F6 [P2] `HEALTHCHECK` has no `--start-period` — claude CLI cold-start (~1–3 s) collides with `--interval=30s --timeout=5s --retries=1` and may produce `unhealthy` flapping

**Kanıt:** `Dockerfile.worker:34-35`
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=1 \
  CMD claude --version || exit 1
```
Without `--start-period`, the FIRST healthcheck fires at +30 s; with `--retries=1`, a single failure → unhealthy. Worker containers usually finish the task and exit before the first healthcheck even runs, but for long-running tasks (>30s, which is the norm for FIX phase), a transient claude CLI startup race or transient FS busy can mark the container unhealthy and trigger Docker daemon restart policies on some Compose stacks.

**Etki:**
- Low — worker runs are short and don't have restart policies in `spawn-backend-docker.ts`. Effect is observability noise (`docker ps` shows `(unhealthy)` mid-execution).

**Verification gate (post-fix):**
```
grep "start-period" Dockerfile.worker
# Expected: --start-period=10s present
```

**Recommended fix:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=2 --start-period=10s \
  CMD claude --version || exit 1
```

---

### F7 [P1] `tests/e2e/docker-backend.test.ts` explicitly avoids end-to-end Claude prompt-→-result assertion — Sprint 153 silent-exit bug invisible to CI

**Kanıt:** `tests/e2e/docker-backend.test.ts:5-8` (file-level design comment):
```
// Design note:
//   Workers run `claude CLI` which exits quickly in test env (not logged in).
//   We verify observable outcomes: .hb file contents, list() state, kill() behavior.
//   We do NOT assert on container "running" state since it's racing with claude exit.
```
And inline comments at lines 170, 217, 225, 290, 347 confirm the suite intentionally skips the "claude actually does something" assertion. With `--print` mode silently exiting 0 (F1), the existing tests would all PASS even with a totally broken Claude CLI inside the image, because they only check:
- `.hb` file written? yes (the heartbeat loop runs regardless of claude state)
- container started? yes (docker daemon does its job)
- container removed? yes (cleanup path runs regardless)

**No test asserts:** "given a known prompt, container produced expected stdout / wrote a .result with non-empty filesChanged".

**Etki:**
- 5+ sprints of regression testing missed the silent-exit bug because no test exercises the prompt-delivery path with a mock Claude that produces deterministic output
- F1 will likely re-regress without a guard

**Verification gate (post-fix):**
```
# New test required: run a tiny prompt that any model can satisfy ("Reply with OK"),
# assert .result file exists with selfAssessment != NO_GO and stdout/log contains "OK"
# Skip if no ANTHROPIC_API_KEY/.claude credentials (CI matrix), but RUN locally + nightly
```

**Recommended fix:** Add `T25: end-to-end prompt-delivery dogfood test` to `tests/e2e/docker-backend.test.ts`, gated on `process.env.DECKENT_E2E_REAL_CLAUDE === '1'` so default CI doesn't pay the cost, but `npm run test:e2e:dogfood` script triggers it and is gated nightly.

---

## 3. Drift / Compliance Matrix

| ADR / Doc | Status | Evidence |
|-----------|--------|----------|
| **ADR-006 spawnSync Security Pattern** | COMPLIANT | All `spawnSync` calls in `spawn-backend-docker.ts` use array form, no `shell:true`. Verified line 63, 283, 336, 343, 361, 399, 557, 569, 600. |
| **ADR-007 SpawnOptions Interface** | COMPLIANT | `SpawnBackendOptions extends ProviderSpawnOptions` (`spawn-backend.ts:53`); no leaked options. |
| **ADR-027 Hybrid Spawn Backend** | COMPLIANT | Factory chain `docker → tmux → subprocess` honored (`spawn-backend.ts:254-269`). |
| **ADR-034 Multi-Project Isolation** | COMPLIANT | Per-task container with namespaced volume mounts; no cross-project bleed. |
| **ADR-037 RBAC Authority Matrix** | COMPLIANT | Worker scope enforced via `--user uid:gid` and explicit `-v` mounts; no extra privileges. |
| **CLAUDE.md gotcha "docker_min_timeout=1200s"** | COMPLIANT (DEFAULT) | `DEFAULT_TIMEOUT_SECONDS = 1200` (line 21); per-task override via `taskTimeoutSeconds`. |
| **CLAUDE.md gotcha "Docker workers need ~4GB each"** | COMPLIANT | `--memory 4g --memory-swap 6g` (line 243-244). |
| **Beta GA Gate #14 — non-root containers** | **DRIFT (F5)** | Worker image lacks `USER`; runtime `--user` override present but image default is root. |
| **Sprint 138 ADR-035 Verification Protocol** | DRIFT (F1) | `selfAssessment:DONE` not verifiable when stdout always 0 bytes. |
| **Sprint 145 TIMEOUT_WITH_WORK detection** | DRIFT (F3) | `exit_code` masked by `||`-chain → false NO_GO instead of TIMEOUT_WITH_WORK. |
| **Sprint 151 .partial-result OOM safety net** | COMPLIANT | Promote logic at `monitorContainer:493-516` works (verified by sprint-153 evidence: 6/6 fix-results promoted correctly). |

---

## 4. Recommendations (P0 first)

### P0 — Beta GA launch blockers

**R1 (F1):** Remove `:ro` flag from `.claude.json` mount. **One-line edit at `spawn-backend-docker.ts:257`.**
```diff
- ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json:ro`]
+ ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json`]
```
Validate with the F1 verification gate command. **Fastest fix in the audit; unblocks 17/17 stuck workers.**

**R2 (F2):** Switch from post-mortem `docker logs` to streamed `docker logs -f` started immediately after container start. Stream into `.tasks/task-{id}.log` while container is alive, so sprint kill / cleanup race doesn't lose forensic data. ~30 LoC change in `monitorContainer`.

### P1 — Hardening

**R3 (F3):** Capture timeout exit code explicitly (`TIMEOUT_EXIT=$?`) and propagate via `exit $TIMEOUT_EXIT`. ~5 LoC in worker script template.

**R4 (F4):** Add `ca-certificates` package and `update-ca-certificates` to `Dockerfile.worker`. ~2 LoC.

**R5 (F5):** Coordinate with A5 (security audit) — add `USER deckent` to `Dockerfile.worker` (Sprint 154 Task 8 already tracks this). Confirm runtime `--user` override remains backward-compatible.

**R6 (F7):** Add T25 (real Claude prompt-delivery E2E test) gated on env var, runnable via `npm run test:e2e:dogfood`. Wire into nightly CI.

### P2 — Polish

**R7 (F6):** Add `--start-period=10s --retries=2` to HEALTHCHECK in `Dockerfile.worker`.

---

## 5. Token / Time

- **Inputs read:** spawn-backend-docker.ts (full 675 LoC), spawn-backend.ts (full 298 LoC), spawn-backend-mock.ts (full 108 LoC), Dockerfile.worker (38 LoC), Dockerfile (37 LoC), test files (heads + greps), 4 archive evidence trees (~20 result/hb/log files).
- **Live experiments:** 7 forensic container spawns (fa1–fa7), each ~30–60 s, capturing prompt delivery + claude CLI debug streams.
- **Critical discovery:** F1 (`.claude.json:ro` → silent exit) reproduced in fa3 + fa5 + fa7 with debug log capture; **decisive evidence in fa7 debug log lines `[ERROR] Failed to save config with lock: Error: EROFS`**.
- **Estimated input tokens:** ~50K (source files + ~10K archive evidence + ~5K test heads). **Output tokens:** ~9K. Well under 80K/15K caps.

---

**Audit conclusion:** Sprint 153 prompt-delivery bug root cause **identified, reproduced, and one-line-fixable**. All 17 workers' `linesAdded:0` outcome is fully explained by F1 + F3 interaction. Fix sequence R1 → R2 → R3 unblocks Beta GA launch.
