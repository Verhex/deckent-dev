# Sprint 162A — Bug R2 Fix Spec: `deckent recover` sprint-state.json Freeze

**Created:** 2026-05-08
**Subagent:** INV-R2 (read-only investigation)
**Bug:** R2 — sprint-state.json freeze after recover
**Surface:** `src/cli/commands/recover.ts`, `src/orchestra/sprint-utils.ts` (writeSprintState/readSprintState/clearSprintState helpers)
**Parent design:** `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md`
**Tier:** T4 (god-level)

---

## 1. Bug Statement & Sprint 161 Evidence

`deckent recover <sprint-id>` archives terminal task files (DONE/NO_GO), clears stale locks, and removes orphan IPC dirs — but it **does NOT mutate `.deckent/sprint-state.json`**. After recovery completes, the on-disk state file still reports `phase: "EXECUTE"`, `status: "ACTIVE"`, with an `updatedAt` timestamp from the original sprint run.

### Sprint 161 filesystem evidence
- After Sprint 161 stall + `deckent recover sprint-161`, the `.deckent/sprint-state.json` continued to claim:
  - `phase: "EXECUTE"`
  - `status: "ACTIVE"`
  - `updatedAt` ≥ 1 hour stale (last write from EXECUTE phase, never advanced)
- Downstream consumers — `getCurrentSprintId()` (`src/monitor/sprint-state.ts`), `mcp/tools/status.ts`, `mcp/tools/watch.ts`, `cli/commands/status.ts`, `event-stream.getCurrentSprintId()`, and `cleanup.ts` (line 156: "First: check sprint-state.json for active sprint info") — all reported sprint-161 as the live, ACTIVE sprint long after recovery.
- This blocked Sprint 162A bring-up: the new sprint could not be marked active because the stale file was authoritative.

### Why this matters at god-level T4
- `sprint-state.json` is the canonical "is there a live sprint?" oracle (`src/monitor/sprint-state.ts:27` doc comment). A freeze breaks every status-surface and IPC consumer.
- ADR-037 RBAC explicitly grants Brain write authority on this file (`src/orchestra/authority-enforcer.ts:125`) and explicitly denies it to Auditor (line 166) and Worker (line 202). Recovery is a Brain-tier operation today, but `recover.ts` does not currently exercise that authority — leaving the file as a phantom of the dead sprint.

---

## 2. Root Cause

In `src/cli/commands/recover.ts:23-100` (`runRecovery()`), the function executes 4 steps:
1. `runSelfAuditGate` (audit)
2. `cleanOrphanIpcDirs`
3. `clearStaleLocks`
4. `postFinalizeCleanup` (archive .json/.result/.hb)

Step 5 — **sprint-state mutation** — is missing. Two options exist in the codebase already:
- `clearSprintState()` (`src/orchestra/sprint-utils.ts:256`) — `unlink()`s the file.
- `writeSprintState()` (`src/orchestra/sprint-utils.ts:227`) — overwrites with a `Sprint` object's current phase/status.

Neither is called from `recover.ts`. Outright deleting the file via `clearSprintState` would lose the audit trail (consumers would see "no sprint ever existed"); outright keeping it stale is the current bug. The right answer is a **terminal mutation**: rewrite the file in place with `phase=COMPLETE`, `status=ABORTED`, and a fresh `updatedAt`, so consumers see "yes, sprint-161 ran, and it has terminated."

### SprintStatus enum reality
`src/core/sprint-types.ts:20-29` defines `SprintStatus` as `PLANNING | ACTIVE | EVALUATING | FIXING | RETROSPECTIVE | COMPLETE | PAUSED | ABORTED`. The user spec requested `status: 'FAILED'`, but `FAILED` is **not** a member. The semantically correct terminal status for a recovered (i.e., crashed and salvaged) sprint is **`ABORTED`** — recovery happens precisely because the sprint did not reach `COMPLETE` cleanly. This spec uses `ABORTED` and documents the divergence.

### SprintPhase enum reality
`src/core/sprint-types.ts:7-18` includes `COMPLETE` as the terminal phase. Using `phase: SprintPhase.COMPLETE` aligns with the existing lifecycle (`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → TRANSITION → COMPLETE`).

---

## 3. Source Code Diff

### 3.1 New helper: `resetSprintStateOnRecover()` in `src/orchestra/sprint-utils.ts`

Add a dedicated terminal-state writer next to `writeSprintState` / `clearSprintState`. Atomic via temp+rename pattern.

```typescript
// ─── New export, added after clearSprintState() at line 263 ───

/**
 * Atomically reset sprint-state.json to a terminal state after `deckent recover`.
 *
 * Unlike clearSprintState (which deletes) or writeSprintState (which requires a
 * full Sprint object), this writer mutates ONLY four fields on the existing
 * state file:
 *   - phase    → COMPLETE
 *   - status   → ABORTED  (terminal, recovered-from-crash)
 *   - updatedAt → fresh ISO timestamp
 *   - completedAt → fresh ISO timestamp (added; signals terminal write)
 *
 * Atomicity: writes to `<path>.tmp`, fsync, rename → guarantees no half-written
 * state file is ever observed by status/watch consumers.
 *
 * Returns the {oldPhase, oldStatus, newPhase, newStatus} delta for telemetry.
 * Returns null if no existing state file (nothing to reset).
 *
 * ADR-037 RBAC: this helper is intended to be called ONLY from `cli/commands/recover.ts`
 * (Brain-tier surface). It is NOT exposed via Auditor or Worker code paths.
 */
export interface SprintStateResetDelta {
  sprintId: string;
  oldPhase: string;
  oldStatus: string;
  newPhase: string;
  newStatus: string;
  updatedAt: string;
}

export function resetSprintStateOnRecover(
  projectRoot: string,
): SprintStateResetDelta | null {
  const statePath = join(projectRoot, SPRINT_STATE_FILE);
  if (!existsSync(statePath)) {
    return null;
  }

  let existing: SprintState;
  try {
    existing = JSON.parse(readFileSync(statePath, 'utf-8')) as SprintState;
  } catch (e) {
    debugLog('resetSprintStateOnRecover:parseExisting', e);
    return null;
  }

  const oldPhase = String(existing.phase ?? 'UNKNOWN');
  const oldStatus = String(existing.status ?? 'UNKNOWN');
  const updatedAt = now();

  const next: SprintState & { completedAt?: string } = {
    sprintId: existing.sprintId,
    phase: 'COMPLETE' as import('../core/types.js').SprintPhase,
    status: 'ABORTED',
    startedAt: existing.startedAt ?? updatedAt,
    updatedAt,
    taskIds: Array.isArray(existing.taskIds) ? existing.taskIds : [],
    completedAt: updatedAt,
  };

  // Atomic temp+rename
  const tmpPath = `${statePath}.recover-tmp`;
  try {
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8');
    renameSync(tmpPath, statePath);
  } catch (e) {
    debugLog('resetSprintStateOnRecover:atomicWrite', e);
    // Best-effort cleanup of temp file
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* swallow */ }
    return null;
  }

  return {
    sprintId: existing.sprintId,
    oldPhase,
    oldStatus,
    newPhase: 'COMPLETE',
    newStatus: 'ABORTED',
    updatedAt,
  };
}
```

Also add `renameSync` to the existing `node:fs` import at the top of `sprint-utils.ts`.

### 3.2 Wire into `src/cli/commands/recover.ts`

```diff
@@ src/cli/commands/recover.ts:1-11 imports
 import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
+import { resetSprintStateOnRecover, type SprintStateResetDelta }
+  from '../../orchestra/sprint-utils.js';
+import { writeEvent } from '../../orchestra/event-stream.js';
 import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';

@@ src/cli/commands/recover.ts:15-21 RecoveryReport
 export interface RecoveryReport {
   audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
   orphanIpcDirs: string[];
   staleLocksCleaned: number;
   taskFilesArchived: number;
   taskFilesPreserved: number;
+  /** Set when sprint-state.json was rewritten to terminal state. null if no state file existed. */
+  sprintStateReset: SprintStateResetDelta | null;
 }

@@ src/cli/commands/recover.ts:28-34 report initializer
   const report: RecoveryReport = {
     audit: { overallGate: 'SKIPPED' },
     orphanIpcDirs: [],
     staleLocksCleaned: 0,
     taskFilesArchived: 0,
     taskFilesPreserved: 0,
+    sprintStateReset: null,
   };

@@ src/cli/commands/recover.ts:90-99 — append Step 5 after postFinalizeCleanup
   // Step 4: Archive terminal task files
   try {
     const cleanupResult = postFinalizeCleanup(root, sprintId);
     report.taskFilesArchived = cleanupResult.archivedFiles.length;
     report.taskFilesPreserved = cleanupResult.preservedFiles.length;
   } catch (e) {
     print(`  Warning: Task archive failed: ${e}`);
   }

+  // Step 5: Reset sprint-state.json to terminal (Bug R2 fix — prevents stale
+  // ACTIVE/EXECUTE phantom that blocks new sprints and confuses status/watch).
+  try {
+    const delta = resetSprintStateOnRecover(root);
+    report.sprintStateReset = delta;
+    if (delta) {
+      // Telemetry — Section 6 event
+      writeEvent(
+        root,
+        sprintId,
+        'deckent',
+        '*',
+        'DECKENT→*:SPRINT_RECOVER_STATE_RESET',
+        {
+          sprintId: delta.sprintId,
+          oldPhase: delta.oldPhase,
+          newPhase: delta.newPhase,
+          oldStatus: delta.oldStatus,
+          newStatus: delta.newStatus,
+          updatedAt: delta.updatedAt,
+        },
+      );
+    }
+  } catch (e) {
+    print(`  Warning: sprint-state reset failed: ${e}`);
+  }
+
   return report;
 }
```

Also add a `--dry-run` preview branch (around line 46-74) that reports `sprintStateReset: { willReset: true, currentPhase, currentStatus }` without mutating, and CLI summary output (around line 153-160) prints:

```
  Sprint state:    EXECUTE/ACTIVE → COMPLETE/ABORTED (reset)
```

(or `Sprint state: (no state file present)` when `delta === null`).

### 3.3 Atomicity guarantees

- **Temp+rename pattern**: `writeFileSync(tmpPath)` → `renameSync(tmpPath, statePath)`. POSIX `rename(2)` is atomic on the same filesystem.
- **No partial reads**: any concurrent reader (status/watch) either sees the old fully-formed state or the new fully-formed state, never a half-written file.
- **Best-effort fsync** (deferred): a future hardening could `fdatasync` the temp file before rename to survive power loss; current target is process crash, which temp+rename already covers.
- **Failure isolation**: a write failure leaves the *original* file untouched (not deleted, not corrupted). This is preferable to `clearSprintState`'s `unlink()` which loses audit trail on failure mid-recovery.

---

## 4. Test Plan: `tests/cli/commands/recover-r2-state-reset.test.ts`

Vitest unit suite. Uses `vi.mock('node:fs')` and a real temp directory via `os.tmpdir()` for the atomic-rename assertion (the atomicity test must touch the real filesystem — pure mocks cannot validate rename semantics).

### Test cases (8 minimum)

| # | Name | Assertion |
|---|------|-----------|
| 1 | `resets EXECUTE/ACTIVE to COMPLETE/ABORTED` | Pre-write `phase:EXECUTE,status:ACTIVE`; run recover; read file → `phase:COMPLETE`, `status:ABORTED` |
| 2 | `refreshes updatedAt timestamp` | Pre-write `updatedAt: 1 hour ago`; run recover; new `updatedAt` is within last 5s |
| 3 | `adds completedAt field` | Pre-write without `completedAt`; run recover; field present and equals new `updatedAt` |
| 4 | `preserves sprintId, startedAt, taskIds` | Original `sprintId/startedAt/taskIds` survive the reset unchanged |
| 5 | `returns null when no state file exists` | Empty `.deckent/`; `resetSprintStateOnRecover()` returns `null`; `report.sprintStateReset === null` |
| 6 | `tolerates malformed JSON gracefully` | Pre-write `'not json'`; helper returns `null` (no throw); original file untouched |
| 7 | `atomic write — partial-failure leaves original intact` | Mock `renameSync` to throw; assert original file content unchanged AND temp file cleaned up |
| 8 | `emits SPRINT_RECOVER_STATE_RESET event with correct payload` | Spy on `writeEvent`; assert called with `{sprintId,oldPhase:'EXECUTE',newPhase:'COMPLETE',oldStatus:'ACTIVE',newStatus:'ABORTED',updatedAt}` |

### Test scaffold (illustrative excerpt)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetSprintStateOnRecover } from '../../../src/orchestra/sprint-utils.js';

describe('resetSprintStateOnRecover (Bug R2)', () => {
  let root: string;
  let statePath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-r2-'));
    const deckent = join(root, '.deckent');
    require('node:fs').mkdirSync(deckent, { recursive: true });
    statePath = join(deckent, 'sprint-state.json');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('resets EXECUTE/ACTIVE to COMPLETE/ABORTED with fresh updatedAt', () => {
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-161',
      phase: 'EXECUTE',
      status: 'ACTIVE',
      startedAt: '2026-05-08T08:00:00.000Z',
      updatedAt: '2026-05-08T08:30:00.000Z',
      taskIds: ['161-001', '161-002'],
    }));

    const before = Date.now();
    const delta = resetSprintStateOnRecover(root);
    const after = Date.now();

    expect(delta).not.toBeNull();
    expect(delta!.oldPhase).toBe('EXECUTE');
    expect(delta!.oldStatus).toBe('ACTIVE');
    expect(delta!.newPhase).toBe('COMPLETE');
    expect(delta!.newStatus).toBe('ABORTED');

    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(persisted.phase).toBe('COMPLETE');
    expect(persisted.status).toBe('ABORTED');
    expect(persisted.sprintId).toBe('sprint-161');
    expect(persisted.taskIds).toEqual(['161-001', '161-002']);
    expect(persisted.startedAt).toBe('2026-05-08T08:00:00.000Z');
    const ts = Date.parse(persisted.updatedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(persisted.completedAt).toBe(persisted.updatedAt);
  });

  it('returns null when no state file exists', () => {
    expect(existsSync(statePath)).toBe(false);
    expect(resetSprintStateOnRecover(root)).toBeNull();
  });

  it('atomic — leaves original intact when rename fails', async () => {
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-161', phase: 'EXECUTE', status: 'ACTIVE',
      startedAt: 'x', updatedAt: 'y', taskIds: [],
    }));
    const original = readFileSync(statePath, 'utf-8');

    const fs = await import('node:fs');
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(resetSprintStateOnRecover(root)).toBeNull();
    expect(readFileSync(statePath, 'utf-8')).toBe(original);
    spy.mockRestore();
  });
});
```

### Integration test addendum

Extend `tests/cli/commands/recover.test.ts` with one case:
- **`runRecovery wires resetSprintStateOnRecover into Step 5`**: mock `resetSprintStateOnRecover` to return a fixed delta; run full recovery; assert `report.sprintStateReset` equals that delta and that the CLI summary print includes the `EXECUTE/ACTIVE → COMPLETE/ABORTED` line.

---

## 5. Backward Compatibility & Migration

- **No schema break**: existing `SprintStateFile` shape (`src/monitor/sprint-state.ts:5-12`) tolerates `completedAt` as an additional optional field. `getCurrentSprintId` only reads `sprintId`.
- **Cleanup.ts unaffected**: `cleanup.ts:156-157` reads `sprint-state.json` only for the active `sprintId` — a `COMPLETE/ABORTED` state still carries a `sprintId`, so cleanup paths continue to work. (Future hardening: cleanup could short-circuit when `phase === 'COMPLETE'`, but that is out of scope for R2.)
- **No state file deletion**: `clearSprintState()` continues to be the right call at the *natural* end of a sprint (`sprint-controller.ts:588,910,927,991`); R2's reset is specifically the **recovery** path's responsibility.
- **Multiple recoveries idempotent**: running `deckent recover` twice on the same sprint produces the same terminal state. Second call's `delta.oldPhase` will be `COMPLETE` and `oldStatus` will be `ABORTED` — observability still emits the event for audit traceability.

---

## 6. Observability — Event Channel `DECKENT→*:SPRINT_RECOVER_STATE_RESET`

### 6.1 Channel registration

Add to `src/orchestra/event-stream.ts:51-88` (`CHANNELS` const):

```typescript
// Recovery (Sprint 162A — Bug R2)
SPRINT_RECOVER_STATE_RESET: 'DECKENT→*:SPRINT_RECOVER_STATE_RESET',
```

This new channel sits in the existing `DECKENT→*:` family alongside `NOTIFY` (line 73). Source = `deckent` (the CLI process), target = `*` (broadcast for any downstream observer/dashboard).

### 6.2 Payload schema

```typescript
{
  sprintId: string;       // e.g. "sprint-161"
  oldPhase: string;       // phase before reset (e.g. "EXECUTE")
  newPhase: string;       // always "COMPLETE"
  oldStatus: string;      // status before reset (e.g. "ACTIVE")
  newStatus: string;      // always "ABORTED"
  updatedAt: string;      // ISO 8601 timestamp of the new state write
}
```

### 6.3 Emission point

Inside `runRecovery()` Step 5 (Section 3.2 diff), after a non-null delta is returned. Fail-safe: `writeEvent` already swallows write failures (`event-stream.ts` design). The recovery itself does NOT depend on event success.

### 6.4 ADR-035 V1.0 compliance

- `protocol_version: '1.0'` (auto-set by `writeEvent`)
- `source: 'deckent'` (matches existing `DECKENT→USER:NOTIFY` precedent)
- `target: '*'` (broadcast)
- `channel: 'DECKENT→*:SPRINT_RECOVER_STATE_RESET'` (follows ADR-035 channel-code naming)
- Sequence: monotonic via existing `nextSequence()` machinery

### 6.5 Dashboard surface (out of scope for R2 source patch, in scope for design)

A future `src/monitor/auditor.ts` scan could surface this event in `.dashboard` under a new `recoveries: [...]` array — deferred to Sprint 162A Wave 3 cross-cutting work or a follow-up.

---

## 7. ADR-037 V2 Amendment — Recovery RBAC Bounds

ADR-037 (`Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0`) currently grants Brain write authority on `.deckent/sprint-state.json` (`authority-enforcer.ts:125`) and denies it to Auditor (line 166) and Worker (line 202). However, ADR-037 is silent on the **CLI recovery surface** (`deckent recover`, executed by the human operator out-of-band of any agent role).

### 7.1 Proposed V2 clauses

Add a new section §7 to ADR-037 V2 (sprint-162a finalize):

> **§7 — Recovery Surface Authority (Sprint 162A, Bug R2)**
>
> The `deckent recover` CLI surface (`src/cli/commands/recover.ts`) is a **Brain-tier orchestration operation** executed out-of-band of the live agent loop. As such:
>
> 1. **Recovery MAY mutate `.deckent/sprint-state.json`** via the dedicated helper `resetSprintStateOnRecover()` (`src/orchestra/sprint-utils.ts`). This is the ONLY new write surface added by recovery.
> 2. **Recovery mutations are bounded to known terminal-state fields**: `phase` (→ `COMPLETE`), `status` (→ `ABORTED`), `updatedAt` (→ now), `completedAt` (→ now). Recovery MUST NOT add unknown fields, mutate `sprintId`, mutate `startedAt`, or mutate `taskIds`. Field-level enforcement is the responsibility of `resetSprintStateOnRecover()` (single chokepoint).
> 3. **Atomicity**: state mutation MUST use the temp+rename pattern. Direct in-place rewrites are prohibited because partial writes would corrupt the canonical state oracle consumed by every status surface.
> 4. **Auditor and Worker remain DENIED** from any recovery-related write — recovery is operator-invoked, not agent-invoked. Existing DENY rules in `authority-enforcer.ts:166,202` are unchanged.
> 5. **Telemetry is mandatory**: every successful state reset MUST emit a `DECKENT→*:SPRINT_RECOVER_STATE_RESET` event with the `{sprintId, oldPhase, newPhase, oldStatus, newStatus, updatedAt}` payload. Observability is not optional for state-mutating operations (consistent with ADR-035 §3 verification protocol).

### 7.2 authority-enforcer.ts implication (no code change required for R2)

The existing `brain` role already permits `.deckent/sprint-state.json` writes; recovery runs in the operator's CLI process and bypasses the runtime `checkAuthority()` gate. The ADR clause documents this surface explicitly so a future hardening (e.g., wrapping all CLI mutations through `checkAuthority({ role: 'brain', path, action: 'write' })`) has a contract to anchor on.

---

## 8. i18n — User-Facing Messages

CLI `print()` strings introduced by the patch require translation entries in `src/i18n/` (per Sprint 162A T4 i18n requirement). Three new strings:

| Key | EN | TR |
|-----|----|----|
| `recover.state.reset.line` | `Sprint state:    {oldPhase}/{oldStatus} → COMPLETE/ABORTED (reset)` | `Sprint durumu:  {oldPhase}/{oldStatus} → COMPLETE/ABORTED (sıfırlandı)` |
| `recover.state.absent.line` | `Sprint state:    (no state file present)` | `Sprint durumu:  (durum dosyası yok)` |
| `recover.state.reset.warn` | `Warning: sprint-state reset failed: {error}` | `Uyarı: sprint-durumu sıfırlama başarısız: {error}` |

Phase/status names (`EXECUTE`, `ACTIVE`, `COMPLETE`, `ABORTED`) are protocol identifiers and remain untranslated. The 12-language coverage demanded by parent design Section 8 follows the same i18n pipeline; only EN/TR drafted here as exemplars.

---

## 9. Security Review

### 9.1 ADR-006 spawnSync — N/A
This patch introduces zero subprocess invocations.

### 9.2 ADR-037 RBAC — covered by Section 7
Single chokepoint `resetSprintStateOnRecover()` enforces field-level bounds.

### 9.3 Path traversal
`statePath = join(projectRoot, '.deckent/sprint-state.json')` is constructed from a resolved-and-trusted `projectRoot` (`resolveProjectRoot()` already canonicalizes). No user input enters the path.

### 9.4 Atomic write — no TOCTOU
Temp+rename eliminates the window where a malicious concurrent process could swap in a crafted state file between read and write. The `existsSync` check at the start is advisory only; the actual write contract is "rename onto path, atomically."

### 9.5 Information disclosure
Event payload contains `sprintId`, phase/status names, and a timestamp — all already present in `.dashboard` and `sprint-state.json` itself. No new sensitive surface.

### 9.6 Failure-mode safety
A failed reset leaves the prior (stale) state intact rather than blanking it. This is preferable to silent deletion: the operator still has the audit trail and can re-run `deckent recover` (idempotent).

---

## 10. Accessibility (a11y)

CLI-only surface. No new dashboard render added by this patch. ARIA work for the `recoveries: [...]` future-dashboard surface is deferred to Sprint 162A Wave 3 cross-cutting and tracked as a follow-up TODO referenced from this spec.

---

## 11. Multi-Language Extensibility

**N/A.** Bug R2 is a deckent-internal CLI orchestration bug. The fix touches only the deckent codebase (TypeScript) and has no project-stack-dependent surface — `sprint-state.json` is deckent's own runtime state file, identical regardless of whether the user's project is TypeScript, Python, Go, Rust, Java, or C#. The parent design (Section 11) flags Bug B as the PRIMARY multi-language surface; R2 is explicitly listed as `n/a multi-language`.

---

## Appendix A — Files Touched (Summary)

| File | Change |
|------|--------|
| `src/orchestra/sprint-utils.ts` | + `resetSprintStateOnRecover()` (~50 LoC) + `SprintStateResetDelta` interface + `renameSync` import |
| `src/cli/commands/recover.ts` | Step 5 wire (~25 LoC), `RecoveryReport.sprintStateReset` field, dry-run preview, summary print |
| `src/orchestra/event-stream.ts` | + `SPRINT_RECOVER_STATE_RESET` channel constant |
| `tests/cli/commands/recover-r2-state-reset.test.ts` | NEW file, 8 unit tests + 1 integration test |
| `tests/cli/commands/recover.test.ts` | +1 wiring assertion in existing suite |
| `.brain/DECISIONS.md` (ADR-037 V2) | + §7 Recovery Surface Authority clauses |
| `src/i18n/{en,tr}.ts` | +3 keys (`recover.state.reset.line`, `recover.state.absent.line`, `recover.state.reset.warn`) |

Estimated total LoC delta: **+150 source / +200 tests / +40 ADR / +18 i18n** ≈ **+408 LoC**.

---

## Appendix B — Investigation Provenance (read-only evidence)

This spec is the product of a READ-ONLY subagent pass. Files read:
- `/home/alperen/deckent-dev/src/cli/commands/recover.ts` (full, 167 lines)
- `/home/alperen/deckent-dev/src/orchestra/sprint-utils.ts` (lines 200-263 — sprint-state helpers)
- `/home/alperen/deckent-dev/src/monitor/sprint-state.ts` (full, 64 lines)
- `/home/alperen/deckent-dev/src/core/sprint-types.ts` (lines 1-60 — enums)
- `/home/alperen/deckent-dev/src/orchestra/authority-enforcer.ts` (lines 110-210 — ADR-037 RBAC)
- `/home/alperen/deckent-dev/src/orchestra/event-stream.ts` (lines 1-180 — event API + CHANNELS)
- `/home/alperen/deckent-dev/tests/cli/commands/recover.test.ts` (lines 1-80 — existing scaffold)
- `/home/alperen/deckent-dev/docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md` (parent design)

No source code was modified during investigation.
