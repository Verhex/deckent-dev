# T-154-007 — Nervous System Audit

**Sprint:** 154 comprehensive pre-execute audit
**Agent:** A7 (nervous-system auditor)
**Mode:** RUNTIME (live tests + archived event JSONL forensics)
**Date:** 2026-05-07
**Scope:** `src/nervous/*` (10 core + 11 detectors), `tests/nervous/*` (31 files / 229 tests), nervous wire in `src/orchestra/sprint-controller.ts`, `.deckent/config.json#nervous_system`, archived sprint event JSONLs

---

## Executive Summary

The Nervous System is **structurally complete but functionally inert in production**.
- All 10 core modules and all 11 detectors compile and pass unit/integration tests (229/229 pass, 31 files).
- `NervousObserver` IS now instantiated and started in `sprint-controller.ts:342–356` (Sprint 153 B1+B2 wire — confirmed live).
- BUT: the `'detection'` event emitted by the observer has **zero downstream subscribers** in the production code path. No `Dispatcher`, `Proposer`, `DecisionEngine`, `Executor`, or `History` is wired to the observer in `runSprint()`.
- Result: Across **6 historical and 5 recent sprint runs (139–154)** the nervous-history JSONL was never written. `0` `detection`/`nervous_alert`/`DETECTOR` events in any sprint event file.
- The Sprint 153 wire test (`tests/nervous/integration/observer-wire-end-to-end.test.ts`) explicitly notes: *"detection is best-effort: detectors only emit when their context is [matching]"* — it proves the listener slot is hooked, not that production detection fired.

KNOWN_ISSUES claim "11 detectors implemented, 0 wired to production path" is **partially superseded** by Sprint 153 B-wire (observer is now wired) but **substantively still true** because the *output* of detectors (the `'detection'` event) has no consumer. ADR-040 promised "proactive meta-orchestrator"; what shipped is "proactive event observer with no actor pipeline".

---

## Evidence

### E1 — Wire confirmation (observer started)

`src/orchestra/sprint-controller.ts:342–356` (verbatim):
```ts
let nervousObserver: NervousObserver | null = null;
if (config.nervous_system?.enabled) {
  try {
    const detectorConfig = config.nervous_system.detectors as unknown as DetectorConfig;
    nervousObserver = new NervousObserver(projectRoot, 15_000, detectorConfig);
    nervousObserver.start();
    debugLog('runSprint:nervous', `Observer started for sprint=${sprint.id}`);
  } catch (err) { ... nervousObserver = null; }
}
```
- Stop hooks: 4 sites (lines 391, 583, 600, 645) — graceful cleanup confirmed.
- Config check: `config.nervous_system.enabled = true` (`.deckent/config.json:111`) → observer starts on every sprint.
- `nervousObserver?.on('detection', …)` subscriber sites in entire `src/orchestra/`: **zero**. No external instantiation of `Dispatcher`, `Proposer`, `Executor`, `DecisionEngine`, `HistoryStore` in any non-`src/nervous/` file (verified via `grep -rn "new Dispatcher|new Proposer|new Executor|new DecisionEngine|new HistoryStore" src/ | grep -v src/nervous/` → 0 hits).

### E2 — Production detection event drought

| Sprint | event JSONL lines | `detection`/`nervous_alert`/`DETECTOR` matches |
|--------|------------------:|----------------------------------------------:|
| 139    | archived          | 0 |
| 140    | archived          | 0 |
| 141    | archived          | 0 |
| 142    | archived          | 0 |
| 143    | archived          | 0 |
| 144    | archived          | 0 |
| 145–149| live              | 0 each |
| 150    | live              | 0 |
| 151    | live              | 0 |
| 152    | live              | 0 |
| **153 (B-wire live)** | 33 | **0** |
| **154** | 14 | **0** |

Counter-evidence: scope_collision events DO appear in sprint-153 (3) and sprint-154 (2), but the channel is `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` (sprint-153-events.jsonl line 1):
```
{"channel":"AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED","payload":{"taskIds":["153-001","153-003"],"files":["src/cli/index.ts"],"detectedAt":"plan-time"}}
```
This is `src/orchestra/event-stream.ts` plan-time `detectScopeCollisions()` (Sprint 138 T-004), **NOT** the nervous `ScopeCollisionMonitor` detector. The two implementations exist in parallel and produce no cross-talk.

### E3 — History store never produced output

- `src/nervous/history.ts:24` writes to `.deckent/nervous-history.jsonl`.
- `src/nervous/dispatcher.ts:228` writes to `.deckent/nervous-log.jsonl`.
- `ls /home/alperen/deckent-dev/.deckent/nervous-*` → **No such file or directory.**
- Even after sprint-153's full execute → review → retro (33 events written), no nervous-* sidecar exists.

### E4 — Test wire proves emit path, not production trigger

Quote from `tests/nervous/integration/observer-wire-end-to-end.test.ts:13–17`:
```
// 3. subscribe to the 'detection' event (proves observer → detector reach)
// 'detection' is best-effort: detectors only emit when their context is
```
Test 5 (`detection emit path is wired`) only asserts `observer.listenerCount('detection') === 1` — i.e., the EventEmitter slot exists. The test explicitly does NOT assert that any detector fired in production-like context.

### E5 — 11 detectors confirmed instantiable

`DetectorRegistry` constructor (`src/nervous/detector-registry.ts:96–158`) gates each detector by `config.<name>?.enabled`. Live config has 10 enabled (`task_mode_idle.enabled = false` for sprint mode). All 11 unit-test files pass:
```
tests/nervous/detectors/{stale-worker,scope-collision,scope-collision-rate,scope-collision-live,debt-trend,
agent-routing,agent-routing-anomaly,build-failure-recurrence,token-spike,
notification-delivery-health,directives-protection,directives-protection-stress}.test.ts
```
229/229 pass in 586 ms.

### E6 — `notification_delivery_health` detector dead-input

`src/nervous/detectors/notification-delivery-health.ts:39–47` requires:
1. `event.source === 'cron'` AND payload contains `notificationsSent` + `notificationsFailed` numeric fields, OR
2. `event.type === 'NOTIFICATION_DELIVERY'`.

`src/nervous/observer.ts:217–222` cron tick payload is hardcoded `{ intervalMs }` — never enriched with notification counters. No code path emits `'NOTIFICATION_DELIVERY'` event. Therefore this detector **structurally cannot fire** with the current observer build.

### E7 — DECKENT→USER:NOTIFY canal IS live (separate path)

The H6 notify wire (`src/orchestra/notify.ts:67`, channel `'DECKENT→USER:NOTIFY'`) is independently active and consumed by `src/core/notification-dispatcher.ts:188` and Sprint 151 T-151-009 22 E2E regression tests. This canal does NOT route through the nervous system — confirms the dual-pipeline drift cited in F4 below.

---

## Findings

### F1 — [P0] Observer is wired, but the rest of the nervous pipeline is not

**Symptom:** 6 sprint runs, 0 nervous-history JSONL records, 0 `'detection'` events persisted.
**Root cause:** `sprint-controller.ts` instantiates `NervousObserver` only. No subscriber attaches to `observer.on('detection', …)` to forward results into `Dispatcher`/`DecisionEngine`/`Proposer`/`Executor`/`History`. The "proactive meta-orchestrator" loop (ADR-040) terminates at the observer.
**Evidence:** E1, E2, E3.
**Severity:** P0 — Beta GA gate "Nervous System" must demonstrate at least ONE production-emitted detection event before claim of completion. Currently the system is dark.
**Note:** Original audit brief listed this as P1; reclassified P0 because the "Sprint 153 B3 wire end-to-end test 5/5 pass" evidence creates a misleading sense of completion in IDENTITY/CHANGELOG/ROADMAP.

### F2 — [P2] 11 detector trigger conditions documented but several are unreachable in current observer

| Detector | Trigger condition | Reachable in current observer? |
|----------|-------------------|:------------------------------:|
| `stale-worker` | cron tick + heartbeat scan | Yes (cron emits TICK every 15s) |
| `scope-collision` | PLAN/EXECUTE phase + .tasks/ change | Yes (fs watcher on .tasks/) |
| `debt-trend` | cron + DEBT.md content | Yes (cron + fs on .brain/) |
| `agent-routing` | event-bus routing events | Conditional (depends on event-bus emits) |
| `directives-protection` | DIRECTIVES.md fs change mid-sprint | Yes (fs watcher) |
| `task-mode-idle` | cron + `deckent_style==='task'` | Disabled in config (sprint mode) |
| `build-failure-recurrence` | event-bus build events | Conditional |
| `token-spike` | event-bus token events | Conditional |
| `agent-routing-anomaly` | event-bus routing decisions | Conditional |
| `scope-collision-rate` | aggregated cron | Yes |
| `notification-delivery-health` | cron + `notificationsSent`/`notificationsFailed` payload **OR** `NOTIFICATION_DELIVERY` event | **NO — observer never enriches cron payload with these fields; no code emits NOTIFICATION_DELIVERY** |

**Severity:** P2 — Even if F1 wires the downstream pipeline, `notification-delivery-health` (E6) remains structurally inert until observer cron tick is enriched OR a `NOTIFICATION_DELIVERY` event source is added.

### F3 — [P3] ADR-043 Hot Fix with Claude Subagents pattern not yet ADR; nervous integration drift

**Symptom:** Sprint 152 T-152-026 + T-152-019 explicitly identified that "Hot Fix with Claude Subagents" pattern (Sprint 150A canonical execution) is documented in ROADMAP §11.11 and `NEXT-SESSION-PROMPT.md:319` but never elevated to ADR. The pattern bypasses Deckent's sprint pipeline entirely and runs `general-purpose` subagents for cerrahi P0 fixes.
**Drift question:** Should the nervous system surface a "Sprint pipeline broken — propose Hot Fix with Subagents" suggestedAction when build-failure-recurrence threshold is hit? Currently `BuildFailureRecurrenceDetector` only proposes generic "build-failure" alerts.
**Evidence:** `docs/audits/sprint-152/T-152-026-hotfix-pattern.md`, `.brain/archive/DIRECTIVES-sprint-152.md:519`.
**Severity:** P3 — strategic, not blocking. Recommendation: write ADR-043 separately (governance), then thread the Hot Fix recommendation into the action-registry once F1 is closed.

### F4 — [P2] `notification_delivery_health` detector vs. DECKENT→USER:NOTIFY canal — parallel pipelines, no cross-talk

**Symptom:** The DECKENT→USER:NOTIFY H6 canal (Sprint 150 Hot Fix) is live (Sprint 151 T-151-009 22 E2E tests confirm) and runs independently of the nervous system. The nervous detector that exists *to monitor* notification delivery health (`notification-delivery-health.ts`) reads payload fields (`notificationsSent`/`notificationsFailed`) that NO code path ever populates.
**Evidence:** E6, E7. Cross-search: `grep -rn "notificationsSent\|notificationsFailed" src/ --include="*.ts" | grep -v test | grep -v notification-delivery-health` returns the detector itself only.
**Severity:** P2 — the detector is ornamental until observer cron tick is enriched or a feeder is added to `src/orchestra/notify.ts` to emit a `NOTIFICATION_DELIVERY` observer event after each `notify()` call.

### F5 — [P3] Two scope-collision implementations exist in parallel

`src/orchestra/event-stream.ts` plan-time `detectScopeCollisions()` (Sprint 138 T-004) writes the `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` channel to sprint event JSONL — visible in sprint-153 (3 events) and sprint-154 (2 events). The nervous `ScopeCollisionMonitor` (`src/nervous/detectors/scope-collision.ts`) implements the same logic for cron/fs-watch triggers but, due to F1, never produces output in production.
**Risk:** Once F1 is fixed, both pipelines will emit on the same condition → cross-channel dedup logic will need to be tested. Currently `dispatcher.ts` has internal dedup but does not coordinate with `event-stream.ts`.
**Severity:** P3 — design-time dedup planning before F1 fix.

### F6 — [P3] Sprint 153 panic snapshots confirm grace-period exits without nervous trace

5 panic files written 2026-05-07T06:52:28 for tasks 153-001 through 153-007: `reason: "grace_period_timeout"`. Nervous `stale-worker` detector should have fired during these tasks (heartbeat present but result missing > 180_000ms threshold), but no nervous-history.jsonl entry exists. Confirms F1 — even when stale-worker condition was actively true on 5 workers, the nervous pipeline produced zero observable artifact.

---

## Recommendations

### R1 — Close F1 in Sprint 154/155 (P0)
Wire `nervousObserver.on('detection', …)` in `sprint-controller.ts` to a `NervousDispatcher` + `NervousHistory` pair:
```ts
const dispatcher = new NervousDispatcher(config.nervous_system, projectRoot);
const history = new NervousHistory(projectRoot);
nervousObserver.on('detection', async (result, event) => {
  for (const action of result.suggestedActions ?? []) {
    const notif = buildNervousNotification(result, action, event);
    await dispatcher.dispatch(notif);
    await history.append(buildExecutionRecord(notif, 'pending'));
  }
});
```
Acceptance criterion: at least one `nervous-history.jsonl` line written during Sprint 155 execute phase (any detector, any severity).

### R2 — Enrich observer cron tick payload (P2, follows R1)
Add `notificationsSent`/`notificationsFailed` to `observer.ts:218–220` cron tick payload, sourced from a counter on `src/orchestra/notify.ts`. Unblocks F4 / `notification-delivery-health`.

### R3 — Plan-time scope-collision dual-pipeline dedup test (P3)
Once R1 is in place, add an E2E test that creates a plan-time scope collision and verifies (a) auditor channel emits exactly once, (b) nervous channel emits exactly once, (c) no double-notification reaches the user.

### R4 — Promote Hot Fix with Subagents to ADR-043 (P3)
Independent of nervous wire — close the governance gap T-152-019 / T-152-026 raised. Then thread integration into `action-registry.ts`.

---

## Verdict

**Nervous System Beta GA gate: NOT MET.**
- Wire infrastructure exists (B1+B2 from Sprint 153) and tests pass.
- Production output is empty (0 detection events across 11 sprint runs).
- The system is currently **half-loop**: observer → detector → /dev/null. The "proactive meta-orchestrator" of ADR-040 has not yet ticked once in production.

Beta GA can ship "Nervous System wire ready (observer + 11 detectors); end-to-end execution scheduled Sprint 155 (R1)" but cannot truthfully claim "Nervous System live" without F1 closure.

**Files audited (in scope):** 21 (10 nervous core + 11 detectors)
**Tests verified:** 229/229 pass (31 test files)
**Files NA:** 0
**Cross-cuts (read-only, non-A7):** `src/orchestra/sprint-controller.ts:342–356`, `src/orchestra/event-stream.ts:73`, `src/orchestra/notify.ts:67`, `src/mcp/tools/nervous.ts:179–230`
