// tests/nervous/integration/full-pipeline.test.ts
//
// Sprint 154 T8 — Full pipeline live wire test.
//
// Sprint 153 wired NervousObserver into runSprint, but production code never
// instantiated Dispatcher or HistoryStore — observer.on('detection') had 0
// subscribers. 11 sprint runs produced 0 nervous-history.jsonl files.
//
// Sprint 154 T8 wires the missing subscribers:
//   - NervousDispatcher → channel routing (file/cli/mcp)
//   - NervousHistory   → audit trail jsonl
//
// This test simulates a detection event, manually invokes the same wiring
// as sprint-controller.ts (since runSprint() spins a full sprint we can't
// run in unit context), and verifies:
//   1. NervousHistory.append writes a record to nervous-history.jsonl
//   2. NervousDispatcher.dispatch fires when shouldNotify=true
//   3. The bridge records sprintId from event context

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NervousObserver } from '../../../src/nervous/observer.js';
import { NervousDispatcher } from '../../../src/nervous/dispatcher.js';
import { NervousHistory } from '../../../src/nervous/history.js';
import type {
  DetectorResult,
  ObserverEvent,
  ExecutionRecord,
  NervousNotification,
  NervousSystemConfig,
} from '../../../src/core/nervous-types.js';
import type { DetectorConfig } from '../../../src/nervous/detector-registry.js';

// ─── Test fixtures ────────────────────────────────────────────────

function makeNervousConfig(): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
  } as NervousSystemConfig;
}

const SINGLE_DETECTOR: DetectorConfig = {
  stale_worker: { enabled: true, threshold_ms: 180_000 },
};

function makeDetectorResult(): DetectorResult {
  return {
    risk: 'medium',
    shouldNotify: true,
    severity: 'warning',
    groupKey: 'sprint-154-test:full-pipeline',
    suggestedActions: [
      {
        id: 'TEST_ACTION',
        label: 'Test Action',
        risk: 'low',
        payload: { source: 'unit-test' },
      },
    ],
    metadata: { type: 'test-detection', detectorId: 'test-detector' },
  };
}

function makeObserverEvent(): ObserverEvent {
  return {
    id: randomUUID(),
    source: 'cron',
    type: 'TICK',
    timestamp: new Date().toISOString(),
    payload: { intervalMs: 15_000 },
    sprintId: 'sprint-154-test',
  };
}

/**
 * Helper that mirrors the wire logic in sprint-controller.ts runSprint().
 * Keeps the test independent of the full sprint lifecycle.
 */
function wireDetectionPipeline(
  observer: NervousObserver,
  dispatcher: NervousDispatcher,
  history: NervousHistory,
  fallbackSprintId: string,
): { historyAppendCalls: ExecutionRecord[]; dispatchedNotifications: NervousNotification[] } {
  const historyAppendCalls: ExecutionRecord[] = [];
  const dispatchedNotifications: NervousNotification[] = [];

  observer.on('detection', (result: DetectorResult, event: ObserverEvent) => {
    const record: ExecutionRecord = {
      id: randomUUID(),
      notificationId: event.id,
      actionId: result.suggestedActions[0]?.id ?? 'detection-only',
      decision: 'autonomous',
      decidedBy: 'system',
      executedAt: new Date().toISOString(),
      outcome: 'success',
      reversible: false,
      payload: {
        detectorRisk: result.risk,
        shouldNotify: result.shouldNotify,
        severity: result.severity,
        groupKey: result.groupKey,
        eventSource: event.source,
        eventType: event.type,
        sprintId: event.sprintId ?? fallbackSprintId,
        taskId: event.taskId,
      },
    };
    historyAppendCalls.push(record);
    void history.append(record);

    if (!result.shouldNotify) return;
    const notification: NervousNotification = {
      id: randomUUID(),
      type: (result.metadata?.type as string) ?? 'detection',
      title: `Detection: ${event.type}`,
      message: `Detector flagged event ${event.id} (risk=${result.risk}, source=${event.source})`,
      severity: result.severity ?? 'info',
      createdAt: new Date().toISOString(),
      detectorId: (result.metadata?.detectorId as string) ?? 'unknown',
      actions: result.suggestedActions.map(a => ({
        id: a.id,
        label: a.label,
        policy: 'suggest-5m' as const,
        risk: a.risk,
        isSafetyFloor: false,
        payload: a.payload,
      })),
      timeoutMs: null,
      sprintId: event.sprintId ?? fallbackSprintId,
      taskId: event.taskId,
      groupKey: result.groupKey,
    };
    dispatchedNotifications.push(notification);
    void dispatcher.dispatch(notification);
  });

  return { historyAppendCalls, dispatchedNotifications };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Nervous System full pipeline (Sprint 154 T8 — observer → dispatcher + history)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-nervous-t8-'));
  });

  afterEach(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('detection event triggers history.append → nervous-history.jsonl is written', async () => {
    const observer = new NervousObserver(tmpRoot, 60_000, SINGLE_DETECTOR);
    const dispatcher = new NervousDispatcher(makeNervousConfig(), tmpRoot);
    const history = new NervousHistory(tmpRoot);

    const { historyAppendCalls } = wireDetectionPipeline(observer, dispatcher, history, 'sprint-154-test');

    // Manually emit a detection event (bypasses real detector preconditions)
    const result = makeDetectorResult();
    const event = makeObserverEvent();
    observer.emit('detection', result, event);

    // Allow async appendFile to flush
    await new Promise(r => setTimeout(r, 50));

    expect(historyAppendCalls).toHaveLength(1);
    expect(historyAppendCalls[0].decision).toBe('autonomous');
    expect(historyAppendCalls[0].decidedBy).toBe('system');
    expect(historyAppendCalls[0].actionId).toBe('TEST_ACTION');

    const historyPath = join(tmpRoot, '.deckent', 'nervous-history.jsonl');
    expect(existsSync(historyPath)).toBe(true);

    const content = readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(lines[0]) as ExecutionRecord;
    expect(parsed.decision).toBe('autonomous');
    expect((parsed.payload as { sprintId?: string }).sprintId).toBe('sprint-154-test');
    expect((parsed.payload as { eventType?: string }).eventType).toBe('TICK');
  });

  it('shouldNotify=true triggers dispatcher (writes nervous-log.jsonl); shouldNotify=false skips dispatch', async () => {
    const observer = new NervousObserver(tmpRoot, 60_000, SINGLE_DETECTOR);
    const dispatcher = new NervousDispatcher(makeNervousConfig(), tmpRoot);
    const history = new NervousHistory(tmpRoot);

    const { dispatchedNotifications } = wireDetectionPipeline(observer, dispatcher, history, 'sprint-154-test');

    // 1) shouldNotify=true → dispatched
    observer.emit('detection', makeDetectorResult(), makeObserverEvent());

    // 2) shouldNotify=false → only history, no dispatch
    const silentResult: DetectorResult = { ...makeDetectorResult(), shouldNotify: false };
    observer.emit('detection', silentResult, makeObserverEvent());

    await new Promise(r => setTimeout(r, 100));

    // Only the first triggers a notification dispatch
    expect(dispatchedNotifications).toHaveLength(1);
    expect(dispatchedNotifications[0].severity).toBe('warning');

    // History file logs both detections (audit trail captures all detections)
    const historyPath = join(tmpRoot, '.deckent', 'nervous-history.jsonl');
    expect(existsSync(historyPath)).toBe(true);
    const lines = readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    // Dispatcher's file adapter writes nervous-log.jsonl for the dispatched one
    const dispatchLogPath = join(tmpRoot, '.deckent', 'nervous-log.jsonl');
    expect(existsSync(dispatchLogPath)).toBe(true);
    const dispatchLines = readFileSync(dispatchLogPath, 'utf-8').split('\n').filter(Boolean);
    expect(dispatchLines.length).toBe(1);
  });
});
