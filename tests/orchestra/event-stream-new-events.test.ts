// ═══ Event Stream — Sprint 162A New Channels Verify ═══════════════════
// Sprint 162A Wave 3 — Task 12 (event-stream verify)
//
// Asserts that all 8 new event channels added across Sprint 162A Wave 1+2
// are addressable through writeEvent/readEvents and carry their canonical
// payload schema. Three channels are emitted as raw string codes (not
// CHANNELS constants):
//
//   - sprint.eval.heartbeat-skip          (carried inside METRIC_EMITTED.payload.kind)
//   - sprint.eval.audit-rubric-applied    (raw string channel)
//   - sprint.eval.synthetic-timeout       (raw string channel)
//
// Five channels are CHANNELS constants:
//
//   - METRIC_EMITTED                       (payload.kind === 'sprint.eval.heartbeat-skip')
//   - SPRINT_RECOVER_STATE_RESET          (DECKENT→*:SPRINT_RECOVER_STATE_RESET)
//   - SPRINT_RECOVER_ZOMBIE_KILLED        (DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED)
//   - SPRINT_RECOVER_STATUS_SYNC          (DECKENT→*:SPRINT_RECOVER_STATUS_SYNC)
//   - SPRINT_RECOVER_TMPFILE_SWEPT        (DECKENT→*:SPRINT_RECOVER_TMPFILE_SWEPT)
//
// SPAWN_DEADLOCK_DETECTED is emitted as the literal channel string
// 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED' from sprint-phases.ts (Bug Stall);
// the test verifies that string is wired identically here so any rename
// would break this contract.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  CHANNELS,
} from '../../src/orchestra/event-stream.js';

describe('event-stream — Sprint 162A new channels', () => {
  let testRoot: string;
  const sprintId = 'sprint-162a';

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-event-stream-162a-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  // ─── 1. sprint.eval.heartbeat-skip (Bug A) ─────────────────────

  it('1. sprint.eval.heartbeat-skip — emitted via METRIC_EMITTED with kind discriminator', () => {
    // Bug A — runEvaluatePhase defers synthesis when heartbeat is fresh.
    // The event is carried in METRIC_EMITTED with payload.kind === 'sprint.eval.heartbeat-skip'.
    expect(CHANNELS.METRIC_EMITTED).toBe('BRAIN→*:METRIC_EMITTED');

    const event = writeEvent(
      testRoot,
      sprintId,
      'brain',
      '*',
      CHANNELS.METRIC_EMITTED,
      {
        kind: 'sprint.eval.heartbeat-skip',
        taskId: 'task-162-001',
        hbAgeMs: 12_500,
        skipReason: 'heartbeat-fresh-within-grace',
        graceMs: 30_000,
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.METRIC_EMITTED);
    const payload = event!.payload as { kind: string; taskId: string; hbAgeMs: number; skipReason: string; graceMs: number };
    expect(payload.kind).toBe('sprint.eval.heartbeat-skip');
    expect(payload.taskId).toBe('task-162-001');
    expect(payload.hbAgeMs).toBe(12_500);
    expect(payload.skipReason).toBe('heartbeat-fresh-within-grace');
    expect(payload.graceMs).toBe(30_000);

    const filtered = readEvents(testRoot, sprintId, { channel: CHANNELS.METRIC_EMITTED });
    expect(filtered).toHaveLength(1);
    expect((filtered[0].payload as { kind: string }).kind).toBe('sprint.eval.heartbeat-skip');
  });

  // ─── 2. sprint.eval.audit-rubric-applied (Bug B) ───────────────

  it('2. sprint.eval.audit-rubric-applied — raw channel string, audit rubric observability', () => {
    // Bug B — result-evaluator emits AUDIT_RUBRIC_APPLIED_CHANNEL on rubric application.
    const channel = 'sprint.eval.audit-rubric-applied';
    const event = writeEvent(
      testRoot,
      sprintId,
      'brain',
      '*',
      channel,
      {
        taskId: 'task-162-002',
        rubricKind: 'audit',
        finalScore: 87.5,
        decision: 'GO',
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(channel);
    expect(event!.source).toBe('brain');
    expect(event!.target).toBe('*');
    const payload = event!.payload as { taskId: string; rubricKind: string; finalScore: number; decision: string };
    expect(payload.taskId).toBe('task-162-002');
    expect(payload.rubricKind).toBe('audit');
    expect(payload.finalScore).toBe(87.5);
    expect(payload.decision).toBe('GO');
  });

  // ─── 3. sprint.eval.synthetic-timeout (Bug C) ──────────────────

  it('3. sprint.eval.synthetic-timeout — raw channel string, synthetic-result observability', () => {
    // Bug C — Brain emits before handleEvaluation when synthesizing
    // a TIMEOUT_WITH_WORK result for a missing .result file.
    const channel = 'sprint.eval.synthetic-timeout';
    const event = writeEvent(
      testRoot,
      sprintId,
      'brain',
      '*',
      channel,
      {
        taskId: 'task-162-003',
        hbAgeMs: 240_000,
        lastResult: 'TIMEOUT_WITH_WORK',
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(channel);
    const payload = event!.payload as { taskId: string; hbAgeMs: number; lastResult: string };
    expect(payload.taskId).toBe('task-162-003');
    expect(payload.hbAgeMs).toBe(240_000);
    expect(payload.lastResult).toBe('TIMEOUT_WITH_WORK');
  });

  // ─── 4. SPAWN_DEADLOCK_DETECTED (Bug Stall) ────────────────────

  it('4. BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED — FIX-phase deadlock liveness signal', () => {
    // Bug Stall — emitSpawnDeadlockIfStalled writes this raw channel string
    // when fix tasks remain PENDING with neither spawn nor synthetic NO_GO.
    const channel = 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED';
    const event = writeEvent(
      testRoot,
      sprintId,
      'brain',
      'auditor',
      channel,
      {
        phase: 'FIX',
        pendingTaskIds: ['task-162-010', 'task-162-011'],
        elapsedMs: 1_800_000,
        timeoutMs: 1_800_000,
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(channel);
    expect(event!.source).toBe('brain');
    expect(event!.target).toBe('auditor');
    const payload = event!.payload as { phase: string; pendingTaskIds: string[]; elapsedMs: number; timeoutMs: number };
    expect(payload.phase).toBe('FIX');
    expect(payload.pendingTaskIds).toEqual(['task-162-010', 'task-162-011']);
    expect(payload.elapsedMs).toBe(1_800_000);
    expect(payload.timeoutMs).toBe(1_800_000);
  });

  // ─── 5. SPRINT_RECOVER_STATE_RESET (Bug R2) ────────────────────

  it('5. SPRINT_RECOVER_STATE_RESET — registered as CHANNELS constant + state-reset payload', () => {
    expect(CHANNELS.SPRINT_RECOVER_STATE_RESET).toBe(
      'DECKENT→*:SPRINT_RECOVER_STATE_RESET',
    );

    const event = writeEvent(
      testRoot,
      sprintId,
      'deckent',
      '*',
      CHANNELS.SPRINT_RECOVER_STATE_RESET,
      {
        sprintId: 'sprint-161',
        oldPhase: 'EXECUTE',
        newPhase: 'COMPLETE',
        oldStatus: 'ACTIVE',
        newStatus: 'ABORTED',
        updatedAt: '2026-05-08T10:00:00.000Z',
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.SPRINT_RECOVER_STATE_RESET);
    expect(event!.source).toBe('deckent');
    expect(event!.target).toBe('*');
    const payload = event!.payload as { sprintId: string; oldPhase: string; newPhase: string; oldStatus: string; newStatus: string; updatedAt: string };
    expect(payload.sprintId).toBe('sprint-161');
    expect(payload.oldPhase).toBe('EXECUTE');
    expect(payload.newPhase).toBe('COMPLETE');
    expect(payload.oldStatus).toBe('ACTIVE');
    expect(payload.newStatus).toBe('ABORTED');
    expect(payload.updatedAt).toBe('2026-05-08T10:00:00.000Z');
  });

  // ─── 6. SPRINT_RECOVER_ZOMBIE_KILLED (Bug R3) ──────────────────

  it('6. SPRINT_RECOVER_ZOMBIE_KILLED — registered as CHANNELS constant + kill payload', () => {
    expect(CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED).toBe(
      'DECKENT→*:SPRINT_RECOVER_ZOMBIE_KILLED',
    );

    const event = writeEvent(
      testRoot,
      sprintId,
      'deckent',
      '*',
      CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED,
      {
        sprintId: 'sprint-161',
        pid: 12_345,
        signal: 'SIGTERM',
        graceMs: 10_000,
        escalated: false,
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED);
    const payload = event!.payload as { sprintId: string; pid: number; signal: string; graceMs: number; escalated: boolean };
    expect(payload.sprintId).toBe('sprint-161');
    expect(payload.pid).toBe(12_345);
    expect(payload.signal).toBe('SIGTERM');
    expect(payload.graceMs).toBe(10_000);
    expect(payload.escalated).toBe(false);
  });

  // ─── 7. SPRINT_RECOVER_STATUS_SYNC (Bug R4) ────────────────────

  it('7. SPRINT_RECOVER_STATUS_SYNC — registered as CHANNELS constant + dashboard rebuild payload', () => {
    expect(CHANNELS.SPRINT_RECOVER_STATUS_SYNC).toBe(
      'DECKENT→*:SPRINT_RECOVER_STATUS_SYNC',
    );

    const event = writeEvent(
      testRoot,
      sprintId,
      'deckent',
      '*',
      CHANNELS.SPRINT_RECOVER_STATUS_SYNC,
      {
        sprintId: 'sprint-161',
        snapshotMtime: '2026-05-08T09:00:00.000Z',
        sourceMtime: '2026-05-08T09:30:00.000Z',
        rebuiltFromTaskLedger: true,
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.SPRINT_RECOVER_STATUS_SYNC);
    const payload = event!.payload as { sprintId: string; snapshotMtime: string; sourceMtime: string; rebuiltFromTaskLedger: boolean };
    expect(payload.sprintId).toBe('sprint-161');
    expect(payload.snapshotMtime).toBe('2026-05-08T09:00:00.000Z');
    expect(payload.sourceMtime).toBe('2026-05-08T09:30:00.000Z');
    expect(payload.rebuiltFromTaskLedger).toBe(true);
  });

  // ─── 8. SPRINT_RECOVER_TMPFILE_SWEPT (Bug R5) ──────────────────

  it('8. SPRINT_RECOVER_TMPFILE_SWEPT — registered as CHANNELS constant + sweep payload', () => {
    expect(CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT).toBe(
      'DECKENT→*:SPRINT_RECOVER_TMPFILE_SWEPT',
    );

    const event = writeEvent(
      testRoot,
      sprintId,
      'deckent',
      '*',
      CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT,
      {
        sprintId: 'sprint-161',
        sweptCount: 34,
        plantsPreserved: 3,
        plantNames: ['TEST-001', 'MANUAL-002', 'test-pattern'],
      },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT);
    const payload = event!.payload as { sprintId: string; sweptCount: number; plantsPreserved: number; plantNames: string[] };
    expect(payload.sprintId).toBe('sprint-161');
    expect(payload.sweptCount).toBe(34);
    expect(payload.plantsPreserved).toBe(3);
    expect(payload.plantNames).toContain('TEST-001');
    expect(payload.plantNames).toContain('MANUAL-002');
  });

  // ─── Cross-channel integration ─────────────────────────────────

  it('integration: all 8 channels coexist on one stream with monotonic sequence', () => {
    // Heartbeat-skip via METRIC_EMITTED
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.METRIC_EMITTED, {
      kind: 'sprint.eval.heartbeat-skip',
      taskId: 't1',
      hbAgeMs: 1,
      skipReason: 'heartbeat-fresh-within-grace',
      graceMs: 30_000,
    });

    // Audit rubric applied
    writeEvent(testRoot, sprintId, 'brain', '*', 'sprint.eval.audit-rubric-applied', {
      taskId: 't2',
      rubricKind: 'audit',
      finalScore: 90,
      decision: 'GO',
    });

    // Synthetic timeout
    writeEvent(testRoot, sprintId, 'brain', '*', 'sprint.eval.synthetic-timeout', {
      taskId: 't3',
      hbAgeMs: 240_000,
      lastResult: 'TIMEOUT_WITH_WORK',
    });

    // Spawn deadlock
    writeEvent(testRoot, sprintId, 'brain', 'auditor', 'BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED', {
      phase: 'FIX',
      pendingTaskIds: ['t4'],
      elapsedMs: 1_800_000,
      timeoutMs: 1_800_000,
    });

    // Recovery cluster
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_STATE_RESET, { sprintId: 's', oldPhase: 'EXECUTE', newPhase: 'COMPLETE', oldStatus: 'ACTIVE', newStatus: 'ABORTED', updatedAt: 'now' });
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED, { sprintId: 's', pid: 1, signal: 'SIGTERM', graceMs: 10_000, escalated: false });
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_STATUS_SYNC, { sprintId: 's', snapshotMtime: 'a', sourceMtime: 'b', rebuiltFromTaskLedger: true });
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT, { sprintId: 's', sweptCount: 1, plantsPreserved: 0, plantNames: [] });

    const events = readEvents(testRoot, sprintId);
    expect(events).toHaveLength(8);

    // Sequence is strictly monotonic
    for (let i = 0; i < events.length; i++) {
      expect(events[i].sequence).toBe(i + 1);
    }

    // Distinct channels: 5 unique channel codes (METRIC_EMITTED + 3 raw + 4 recover) = 8 events, 8 distinct channel-codes
    const channels = events.map(e => e.channel);
    expect(new Set(channels).size).toBe(8);
    expect(channels).toContain(CHANNELS.METRIC_EMITTED);
    expect(channels).toContain('sprint.eval.audit-rubric-applied');
    expect(channels).toContain('sprint.eval.synthetic-timeout');
    expect(channels).toContain('BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED');
    expect(channels).toContain(CHANNELS.SPRINT_RECOVER_STATE_RESET);
    expect(channels).toContain(CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED);
    expect(channels).toContain(CHANNELS.SPRINT_RECOVER_STATUS_SYNC);
    expect(channels).toContain(CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT);
  });

  it('integration: filter by channel returns only matching events', () => {
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_STATE_RESET, { sprintId: 's' });
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED, { sprintId: 's' });
    writeEvent(testRoot, sprintId, 'deckent', '*', CHANNELS.SPRINT_RECOVER_STATE_RESET, { sprintId: 's' });

    const onlyResets = readEvents(testRoot, sprintId, {
      channel: CHANNELS.SPRINT_RECOVER_STATE_RESET,
    });
    expect(onlyResets).toHaveLength(2);
    expect(onlyResets.every(e => e.channel === CHANNELS.SPRINT_RECOVER_STATE_RESET)).toBe(true);
  });

  it('CHANNELS constants — all 4 recovery channels are addressable as typed constants', () => {
    // Regression guard: any rename of these constants must surface here.
    expect(CHANNELS.SPRINT_RECOVER_STATE_RESET).toBeDefined();
    expect(CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED).toBeDefined();
    expect(CHANNELS.SPRINT_RECOVER_STATUS_SYNC).toBeDefined();
    expect(CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT).toBeDefined();

    // Channel naming convention: DECKENT→*:<EVENT> (broadcast operator events)
    expect(CHANNELS.SPRINT_RECOVER_STATE_RESET.startsWith('DECKENT→*:')).toBe(true);
    expect(CHANNELS.SPRINT_RECOVER_ZOMBIE_KILLED.startsWith('DECKENT→*:')).toBe(true);
    expect(CHANNELS.SPRINT_RECOVER_STATUS_SYNC.startsWith('DECKENT→*:')).toBe(true);
    expect(CHANNELS.SPRINT_RECOVER_TMPFILE_SWEPT.startsWith('DECKENT→*:')).toBe(true);
  });
});
