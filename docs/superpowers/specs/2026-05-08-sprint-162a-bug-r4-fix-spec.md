# Sprint 162A — Bug R4 Fix Spec: Status Display Cache Lag

**Created:** 2026-05-08
**Author:** INV-R4 investigation subagent (Sprint 162A Phase 1)
**Status:** DRAFT — ready for Wave 2 implementation
**Tier:** T4 (god-level)
**Parent:** `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md`
**Bug ID:** R4 — `deckent status` shows stale counts after `deckent recover`
**Wave:** 2 — Recovery Repair (Bug R2+R3+R4+R5)

---

## 1. Problem Statement & Evidence

### Symptom
After running `deckent recover <sprint-id>` against a partially-finalized sprint, `deckent status` displays the previous sprint's counts (e.g. `0/49 done`) instead of reflecting the post-recover task ledger (which may show `28/56 done` or `0` total when state was cleared).

### Sprint 161 Live Evidence
- Sprint 161 mid-flight halt → Coordinator ran `deckent recover sprint-161 --force --skip-audit`.
- Recovery archived terminal task files (28 DONE) and cleared stale locks.
- Subsequent `deckent status` invocation displayed `progress.done = 0`, `progress.total = 49` (the *pre-archive* total) for ~30 minutes until next auditor scan rewrote `.dashboard`.
- Per `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md` §"Recovery UX": stale dashboard masked recovery success; user re-ran recover thinking it failed.

### Root Cause
`deckent status` reads `.dashboard` (auditor-written, 30s scan cadence) as its primary truth source. After `deckent recover`:
1. `sprint-state.json` reflects post-recover truth (or is removed via `clearSprintState()`).
2. Task ledger in `.tasks/` reflects post-recover truth (terminal files moved to `.tasks/archive/`).
3. `.dashboard` is **NOT touched by recover** — it retains the last auditor scan snapshot from before the crash.
4. No live auditor process exists in single-shot CLI mode → `.dashboard` stays stale until next `deckent start` boots a new auditor loop.

There is no actual in-process cache today (dashboard-manager.ts has no module-level memo). The "cache" in the bug description refers to the **on-disk `.dashboard` file functioning as a lagged snapshot** of state-of-truth (`sprint-state.json` + `.tasks/`).

### Read-only references
- `src/cli/commands/status.ts:312-332` — standalone-mode branch *already* falls back to `loadTaskFiles()` when `.dashboard` is missing.
- `src/cli/commands/status.ts:388-449` — main branch reads `.dashboard` directly via `readFileSync`, never re-validates against `sprint-state.json` mtime.
- `src/monitor/dashboard-manager.ts:199-258` — `readDashboardSafe()` validates schema but does not check freshness.
- `src/monitor/sprint-state.ts:33-63` — `getCurrentSprintId()` already prefers `sprint-state.json` over `.dashboard` (good precedent).
- `src/cli/commands/recover.ts` — never touches `.dashboard` post-recovery.

---

## 2. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | After `recover` modifies `sprint-state.json` (or removes it), `status` reads fresh task ledger and renders the correct counts on the very next invocation | unit test `recover-r4-status-sync.test.ts` |
| AC-2 | When `sprint-state.json.mtimeMs > .dashboard.mtimeMs`, `readDashboardSafe()` returns `{ stale: true }` and `status.ts` rebuilds counts from `loadTaskFiles()` instead of trusting `.dashboard.progress` | unit test (mtime mismatch path) |
| AC-3 | Event `sprint.recover.status-sync` is emitted with `{sprintId, cacheInvalidated, freshRead}` payload on every stale-detected render | event-stream assertion in test |
| AC-4 | When `sprint-state.json` is absent (post-`clearSprintState`), `status` falls back to standalone task-file scan (existing behavior preserved — no regression) | regression test |
| AC-5 | TOCTOU window between `stat(.dashboard)` and `stat(sprint-state.json)` does not produce false-stale or false-fresh on single-process invariant | static reasoning + §10 review |
| AC-6 | i18n: stale-fallback notice rendered through `getMessage('status.dashboard_stale_fallback', lang)` for TR/EN | i18n test in `messages.test.ts` |
| AC-7 | No write to `.dashboard` from status.ts (read-only invariant preserved — auditor remains sole writer) | test asserts `writeFileSync` not called on `.dashboard` |
| AC-8 | All existing `status.test.ts` cases pass unchanged | regression suite |

---

## 3. Source Diffs (Wave 2 Implementation)

### 3.1 `src/monitor/dashboard-manager.ts`

Add freshness check to `DashboardReadResult` and a new helper `isDashboardStaleVsSprintState()`. `readDashboardSafe()` extends to populate `stale` and `staleReason`.

```diff
@@ src/monitor/dashboard-manager.ts @@
-import { readFileSync, writeFileSync, existsSync } from 'node:fs';
+import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
 import { join } from 'node:path';
 import { DASHBOARD_FILE } from '../core/constants.js';
 import { debugLog } from '../core/utils.js';
 import type { DashboardState } from '../core/monitoring-types.js';
 import { SprintPhase, SprintStatus } from '../core/sprint-types.js';

+const SPRINT_STATE_REL = join('.deckent', 'sprint-state.json');

 export interface DashboardReadResult {
   state: DashboardState;
   valid: boolean;
   repaired: boolean;
+  /**
+   * True if `.dashboard` mtime is older than `sprint-state.json` mtime
+   * (or sprint-state was removed after .dashboard was written).
+   * Caller MUST treat counts in `state.progress` as suspect and rebuild
+   * from `.tasks/` when `stale === true`.
+   */
+  stale?: boolean;
+  staleReason?: 'mtime-lag' | 'sprint-state-removed' | 'dashboard-newer-orphan';
   error?: string;
 }

+/**
+ * Compare `.dashboard` mtime vs `sprint-state.json` mtime.
+ * Returns the staleness verdict so callers can decide to fall back to
+ * a fresh task-file scan rather than trusting `.dashboard.progress`.
+ *
+ * Single-process invariant: `deckent recover` runs to completion before
+ * `deckent status`, so there is no concurrent writer racing the stat()
+ * calls (see §10 TOCTOU review).
+ */
+export function isDashboardStaleVsSprintState(
+  projectRoot: string,
+): { stale: boolean; reason?: 'mtime-lag' | 'sprint-state-removed' | 'dashboard-newer-orphan' } {
+  const dashPath = join(projectRoot, DASHBOARD_FILE);
+  const statePath = join(projectRoot, SPRINT_STATE_REL);
+  if (!existsSync(dashPath)) return { stale: false };
+  const dashStat = (() => { try { return statSync(dashPath); } catch { return null; } })();
+  if (!dashStat) return { stale: false };
+  if (!existsSync(statePath)) {
+    // sprint-state was cleared (e.g. by clearSprintState() after recover finalize)
+    // but .dashboard still references a sprint → orphan dashboard.
+    return { stale: true, reason: 'sprint-state-removed' };
+  }
+  const stateStat = (() => { try { return statSync(statePath); } catch { return null; } })();
+  if (!stateStat) return { stale: false };
+  if (stateStat.mtimeMs > dashStat.mtimeMs + 1) {
+    // +1ms tolerance for FAT/HFS coarse mtime resolution
+    return { stale: true, reason: 'mtime-lag' };
+  }
+  return { stale: false };
+}

 export function readDashboardSafe(projectRoot: string): DashboardReadResult {
   const dashPath = join(projectRoot, DASHBOARD_FILE);
   // ... existing parse/validate body unchanged ...
   const state = mergeDashboardDefaults(data as Record<string, unknown>);
-  return { state, valid: true, repaired: false };
+  const freshness = isDashboardStaleVsSprintState(projectRoot);
+  return {
+    state,
+    valid: true,
+    repaired: false,
+    stale: freshness.stale,
+    staleReason: freshness.reason,
+  };
 }
```

### 3.2 `src/cli/commands/status.ts`

Branch on `dashResult.stale` and rebuild progress counts from `loadTaskFiles()` before format. Emit event for observability.

```diff
@@ src/cli/commands/status.ts @@
-import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
+import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
 import { join } from 'node:path';
 // ... existing imports ...
+import { readDashboardSafe } from '../../monitor/dashboard-manager.js';
+import { writeEvent } from '../../orchestra/event-stream.js';

@@ default render branch (line 388–449) @@
-      try {
-        const rawData = readFileSync(dashPath, 'utf-8');
-        const state = JSON.parse(rawData) as DashboardState;
+      try {
+        const dashResult = readDashboardSafe(root);
+        let state = dashResult.state;
+
+        if (dashResult.stale) {
+          // R4 fix: dashboard is older than sprint-state.json → rebuild
+          // progress counts from authoritative task-file ledger before render.
+          const tasksFresh = loadTaskFiles(root);
+          const done = tasksFresh.filter(t => t.status === 'DONE').length;
+          const blocked = tasksFresh.filter(t => t.status === 'NO_GO').length;
+          const active = tasksFresh.filter(
+            t => t.status === 'EXECUTING' || t.status === 'CLAIMED' || t.status === 'TESTING',
+          ).length;
+          state = {
+            ...state,
+            progress: { done, active, blocked, total: tasksFresh.length },
+            updatedAt: new Date().toISOString(),
+          };
+
+          // Emit event for observability (sprint.recover.status-sync)
+          const sprintId = getCurrentSprintId(root);
+          if (sprintId) {
+            try {
+              writeEvent(root, sprintId, {
+                source: 'deckent',
+                target: '*',
+                channel: 'sprint.recover.status-sync',
+                payload: {
+                  sprintId,
+                  cacheInvalidated: true,
+                  freshRead: { done, active, blocked, total: tasksFresh.length },
+                  reason: dashResult.staleReason,
+                },
+              });
+            } catch { /* event-stream is fail-safe */ }
+          }
+
+          // i18n notice (rendered before formatHumanStatus)
+          if (!opts.json && !opts.raw) {
+            output(getMessage('status.dashboard_stale_fallback', lang));
+          }
+        }
         if (opts.json) {
-          // ... existing ...
+          // ... unchanged: passes through (potentially-rebuilt) `state` ...
         }
```

Apply parallel rebuild in `--watch` render() (line 335–362) and standalone `(A)` branch (line 312–332) for symmetry.

### 3.3 `src/cli/helpers/messages.ts` (new entry)

```diff
+  'status.dashboard_stale_fallback': {
+    en: '  ⚠ Dashboard snapshot is stale (post-recover) — counts rebuilt from task files.',
+    tr: '  ⚠ Dashboard görüntüsü güncel değil (recover sonrası) — sayımlar görev dosyalarından yenilendi.',
+  },
```

### 3.4 `src/orchestra/event-stream.ts` (CHANNELS extension)

```diff
   // Authority enforcement (Sprint 139 — Task 035, ADR-037)
   AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
+
+  // Recovery sync (Sprint 162A — Bug R4)
+  RECOVER_STATUS_SYNC: 'sprint.recover.status-sync',
```

---

## 4. Test Plan

### 4.1 New file: `tests/cli/commands/recover-r4-status-sync.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, utimesSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerStatus } from '../../../src/cli/commands/status.js';

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-r4-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

describe('Bug R4 — recover→status cache invalidation sync', () => {
  let root: string;

  beforeEach(() => { root = setupFixture(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('AC-1+AC-2: stale .dashboard → rebuild counts from task files', () => {
    // 1. Write stale .dashboard claiming 0/49 done (pre-recover snapshot)
    const stalePath = join(root, '.dashboard');
    writeFileSync(stalePath, JSON.stringify({
      sprint: { id: 'sprint-161', number: 161, phase: 'EXECUTE', status: 'RUNNING' },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 49 },
      alerts: [],
      updatedAt: new Date(Date.now() - 60000).toISOString(),
    }));
    const past = new Date(Date.now() - 60000);
    utimesSync(stalePath, past, past);

    // 2. Write sprint-state.json with newer mtime (post-recover)
    const statePath = join(root, '.deckent', 'sprint-state.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-161', phase: 'CLEANUP', status: 'COMPLETE',
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      taskIds: ['161-001', '161-002', '161-003'],
    }));

    // 3. Write 3 task files: 2 DONE + 1 NO_GO (post-recover ledger)
    const baseTask = (id: string, status: string) => ({
      id, title: `t${id}`, description: '', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: '', status,
      scope: { directories: [], filesRead: [], filesWrite: [] },
      sprintId: 'sprint-161', createdAt: new Date().toISOString(),
    });
    writeFileSync(join(root, '.tasks', 'task-161-001.json'), JSON.stringify(baseTask('161-001', 'DONE')));
    writeFileSync(join(root, '.tasks', 'task-161-002.json'), JSON.stringify(baseTask('161-002', 'DONE')));
    writeFileSync(join(root, '.tasks', 'task-161-003.json'), JSON.stringify(baseTask('161-003', 'NO_GO')));

    // 4. Capture stdout
    const captured: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: string | Uint8Array) => { captured.push(c.toString()); return true; }) as typeof process.stdout.write;

    process.chdir(root);
    const program = new Command();
    program.exitOverride();
    registerStatus(program);
    program.parseAsync(['node', 'test', 'status', '--json']).catch(() => {});
    process.stdout.write = origWrite;

    // 5. Assert: rebuilt progress (NOT 0/49)
    const out = captured.join('');
    expect(out).not.toContain('"total": 49');
    expect(out).toMatch(/"done":\s*2/);
    expect(out).toMatch(/"total":\s*3/);
    expect(out).toMatch(/"blocked":\s*1/);
  });

  it('AC-3: emits sprint.recover.status-sync event when stale detected', () => {
    // setup as above ...
    // assert events.jsonl contains channel: 'sprint.recover.status-sync'
    const eventsPath = join(root, '.deckent', 'sprint-161-events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);
    const events = readFileSync(eventsPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const syncEvent = events.find(e => e.channel === 'sprint.recover.status-sync');
    expect(syncEvent).toBeDefined();
    expect(syncEvent.payload.cacheInvalidated).toBe(true);
    expect(syncEvent.payload.freshRead).toEqual({ done: 2, active: 0, blocked: 1, total: 3 });
  });

  it('AC-4: missing sprint-state.json → standalone task-file scan (no regression)', () => {
    // .dashboard exists but sprint-state.json absent → staleReason = 'sprint-state-removed'
    // Verify rebuild happens and no crash
  });

  it('AC-5: fresh .dashboard (newer than sprint-state.json) → no rebuild, trust dashboard', () => {
    // Write sprint-state.json first (older), then .dashboard (newer)
    // Assert progress counts come from .dashboard, not task files
  });

  it('AC-7: status.ts never writes .dashboard', () => {
    const initialMtime = statSync(join(root, '.dashboard')).mtimeMs;
    // ... run status ...
    expect(statSync(join(root, '.dashboard')).mtimeMs).toBe(initialMtime);
  });
});
```

### 4.2 Unit additions to `tests/monitor/dashboard-manager.test.ts`

- `isDashboardStaleVsSprintState()` table-driven cases:
  - both files fresh, dashboard newer → `stale: false`
  - sprint-state newer → `stale: true, reason: 'mtime-lag'`
  - sprint-state absent → `stale: true, reason: 'sprint-state-removed'`
  - dashboard absent → `stale: false` (no orphan)
  - mtime equal (within 1ms tolerance) → `stale: false`

### 4.3 i18n test addition

`tests/cli/helpers/messages.test.ts` — assert `status.dashboard_stale_fallback` exists in EN+TR with non-empty strings.

---

## 5. Smoke Replication (Wave 2 manual gate)

```bash
# 1. Boot a fake sprint, let auditor write .dashboard
mkdir -p /tmp/r4-smoke/.deckent /tmp/r4-smoke/.tasks
cd /tmp/r4-smoke
echo '{"sprint":{"id":"sprint-test","number":999,"phase":"EXECUTE","status":"RUNNING"},"agents":[],"progress":{"done":0,"active":0,"blocked":0,"total":49},"alerts":[],"updatedAt":"2026-01-01T00:00:00Z"}' > .dashboard
touch -d "1 hour ago" .dashboard

# 2. Simulate post-recover state
echo '{"sprintId":"sprint-test","phase":"CLEANUP","status":"COMPLETE","startedAt":"2026-01-01","updatedAt":"2026-05-08","taskIds":["test-001"]}' > .deckent/sprint-state.json
echo '{"id":"test-001","status":"DONE","sprintId":"sprint-test","model":"sonnet","effort":"normal","priority":"NORMAL","scope":{"directories":[],"filesRead":[],"filesWrite":[]},"title":"x","description":"","reason":"","createdAt":"2026-01-01"}' > .tasks/task-test-001.json

# 3. Run status — must show 1/1 done, NOT 0/49
deckent status --json | jq .progress
# Expected: { "done": 1, "active": 0, "blocked": 0, "total": 1 }

# 4. Verify event emitted
cat .deckent/sprint-test-events.jsonl | grep recover.status-sync
# Expected: 1 line with cacheInvalidated:true
```

---

## 6. Observability — Event `sprint.recover.status-sync`

| Field | Type | Description |
|-------|------|-------------|
| `source` | `'deckent'` | CLI status command |
| `target` | `'*'` | broadcast |
| `channel` | `'sprint.recover.status-sync'` | new channel constant `CHANNELS.RECOVER_STATUS_SYNC` |
| `payload.sprintId` | `string` | active sprint id at render time |
| `payload.cacheInvalidated` | `boolean` | always `true` when event fires |
| `payload.freshRead` | `{done, active, blocked, total}` | rebuilt counts |
| `payload.reason` | `'mtime-lag' \| 'sprint-state-removed' \| 'dashboard-newer-orphan'` | why staleness was detected |

Replay protocol: `readEvents(root, sprintId, { channel: 'sprint.recover.status-sync' })` returns all sync events in seq order — useful for post-incident analysis (e.g. "how many user-facing stale renders did Sprint 161 produce before user noticed?").

---

## 7. ADR Amendment — ADR-037 V2

**Add to ADR-037 (Brain-Auditor-Worker Authority Matrix) under "Read-side discipline":**

> **§3.4 Cache Invalidation Discipline (Sprint 162A — Bug R4 closure)**
>
> Any read-side surface that consumes auditor-written display files (`.dashboard`,
> sprint-NNN-status snapshots, etc.) MUST validate freshness against the
> authoritative state source (`sprint-state.json` or task-file ledger) before
> rendering counts/status to the user.
>
> Required pattern:
> 1. `stat()` the display snapshot mtime
> 2. `stat()` the authoritative state-source mtime
> 3. If state-source is newer → rebuild display fields from task ledger, emit
>    `sprint.recover.status-sync` event
> 4. NEVER write back to the auditor-owned snapshot from a read-side surface
>    (preserves auditor-as-sole-writer invariant — RBAC layer 1)
>
> Forbidden patterns:
> - In-process memoization with TTL (would mask stale-on-disk state)
> - "Last successful read" caching across CLI invocations (CLI is single-shot)
> - Auto-repair write-back from `readDashboardSafe()` to refresh mtime
>   (violates separation-of-writer per ADR-037 §2.1)

**Cross-reference:** ADR-035 §"Channel Catalog" — register
`sprint.recover.status-sync` as a deckent→user broadcast channel (Protocol V1.0).

---

## 8. i18n Surface

| Key | EN | TR |
|-----|----|----|
| `status.dashboard_stale_fallback` | `⚠ Dashboard snapshot is stale (post-recover) — counts rebuilt from task files.` | `⚠ Dashboard görüntüsü güncel değil (recover sonrası) — sayımlar görev dosyalarından yenilendi.` |

The event channel name (`sprint.recover.status-sync`) is a stable wire identifier — NOT translated (per ADR-035 §"Channel codes are language-neutral").

---

## 9. Accessibility

The stale-fallback notice is rendered as the **first line** of the status block when present, so screen readers announce it before the counts. Uses `⚠` (U+26A0) which has standardized AT pronunciation ("warning"). NO_COLOR mode (existing `output()` helper) strips ANSI without losing the warning glyph. No new ARIA-equivalent surfaces in CLI; future dashboard UI consumers of the event SHOULD render `aria-live="polite"` notification on `sprint.recover.status-sync` receipt.

---

## 10. Security & TOCTOU Review

### Threat model
Two stat() calls (`.dashboard`, `sprint-state.json`) are not atomic. A concurrent writer between calls could yield a misleading verdict.

### Single-process invariant analysis
- `deckent recover` is a **synchronous, single-shot CLI** — runs to completion before returning to the shell prompt.
- `deckent status` is invoked **after** `deckent recover` exits — sequential, not concurrent.
- During recover execution: only the recover process writes `sprint-state.json` (via `clearSprintState()` indirectly through `postFinalizeCleanup`); no auditor loop runs.
- During status execution: only the status process reads — no writers.
- ⇒ The only way to hit a TOCTOU window is to invoke `deckent status` **while `deckent start`'s auditor loop is concurrently writing `.dashboard`**. In that case:
  - If `.dashboard` is rewritten between our two stat calls, we may briefly see `stale: true` for one render cycle, then `stale: false` next render. No data corruption — only a transient "rebuild" path that produces correct counts (rebuilding from task files yields the same numbers as the auditor would have written).
  - **Failure mode is benign**: false-stale → unnecessary rebuild (cost: O(N) task-file reads, ~10ms for N=50). False-fresh is impossible because `state.mtimeMs > dash.mtimeMs` is monotonic.

### Mitigations applied
- `+1ms` mtime tolerance avoids false-stale on coarse filesystems (FAT32, HFS+).
- Rebuild path uses `loadTaskFiles()` which is itself idempotent and tolerant of missing/malformed task JSON (existing `try/catch` per file).
- No write-back from status.ts → no possibility of corrupting `.dashboard` during a race with auditor writes.

### Verdict
TOCTOU window exists in theory but produces only **benign false-stale** outcomes under the realistic concurrency model. No exploitable race. ADR-037 invariant (auditor sole writer of `.dashboard`) preserved.

### Permission surface
- Read-only on `.dashboard`, `sprint-state.json`, `.tasks/*.json`
- Append-only on `sprint-NNN-events.jsonl` (event-stream is fail-safe per existing design)
- No new file creation, no shell-out, no network — security delta = 0.

---

## 11. Multi-Language Project Extensibility

**N/A for this bug.**

Bug R4 is a **deckent-internal orchestration bug** — it concerns deckent's own
status display reading deckent's own `.dashboard` file. The bug surface is
language-neutral within deckent (TypeScript code reading TypeScript-written
JSON). It does not touch the multi-language adapter layer (TestRunner /
CoverageParser / BuildVerifier per `2026-05-08-sprint-162a-orchestration-repair-design.md` §"Multi-language extensibility"), and the fix does not introduce any
language-specific assumptions.

The `sprint.recover.status-sync` event channel is part of the protocol catalog
and would be observable from any language-specific worker hooked into the
event stream, but no Python/Go/Rust/Java/.NET-specific work is required to
close R4.

---

## Summary Table (parent design §"matrix")

| Dimension | Bug R4 |
|-----------|--------|
| Source files touched | `src/cli/commands/status.ts`, `src/monitor/dashboard-manager.ts`, `src/orchestra/event-stream.ts`, `src/cli/helpers/messages.ts` |
| Tests added | 1 new file (`tests/cli/commands/recover-r4-status-sync.test.ts`) + extensions to `dashboard-manager.test.ts`, `messages.test.ts` |
| Event | `sprint.recover.status-sync` (new channel `CHANNELS.RECOVER_STATUS_SYNC`) |
| ADR amendment | ADR-037 V2 §3.4 + ADR-035 channel catalog registration |
| Smoke replication | yes (§5) |
| i18n | EN + TR (§8) |
| a11y | screen-reader-friendly notice ordering (§9) |
| Security | TOCTOU review — benign false-stale only (§10) |
| Multi-language | n/a (deckent-internal bug, §11) |

---

## Implementation Order (for Wave 2 implementer)

1. Add `isDashboardStaleVsSprintState()` + extend `DashboardReadResult` interface (dashboard-manager.ts).
2. Add `RECOVER_STATUS_SYNC` to `CHANNELS` (event-stream.ts).
3. Add i18n key `status.dashboard_stale_fallback` (messages.ts).
4. Wire stale-detection branch in status.ts default render path; replicate in `--watch` and standalone (A) branches.
5. Write `recover-r4-status-sync.test.ts` (TDD — should fail before step 4 lands fully).
6. Update ADR-037 §3.4 (separate commit, ADR-only diff).
7. Smoke replication per §5; verify event emission.

**Estimated wave 2 effort:** ~30 minutes implementation + 30 minutes test/ADR = 1 hour total within R4 budget.
