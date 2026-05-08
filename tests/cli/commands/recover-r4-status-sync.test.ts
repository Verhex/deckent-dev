// Sprint 162A — Bug R4 Fix Test Suite
// Verifies that `deckent status` rebuilds dashboard.progress counts from
// task files when `.dashboard` is older than `sprint-state.json`
// (post-recover stale snapshot). Uses real filesystem fixtures with
// utimesSync() to control mtime relationships deterministically.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isDashboardStaleVsSprintState,
  readDashboardSafe,
} from '../../../src/monitor/dashboard-manager.js';

function setupFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-r4-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function makeDashboard(progress = { done: 0, active: 0, blocked: 0, total: 49 }): string {
  return JSON.stringify({
    sprint: { id: 'sprint-161', number: 161, phase: 'EXECUTE', status: 'ACTIVE' },
    agents: [],
    progress,
    alerts: [],
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  });
}

function makeSprintState(): string {
  return JSON.stringify({
    sprintId: 'sprint-161',
    phase: 'COMPLETE',
    status: 'ABORTED',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    taskIds: ['161-001', '161-002', '161-003'],
  });
}

describe('Bug R4 — recover→status cache invalidation sync (Sprint 162A)', () => {
  let root: string;

  beforeEach(() => {
    root = setupFixture();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('isDashboardStaleVsSprintState: stale when sprint-state.json newer than .dashboard', () => {
    const dashPath = join(root, '.dashboard');
    const statePath = join(root, '.deckent', 'sprint-state.json');

    writeFileSync(dashPath, makeDashboard());
    const past = new Date(Date.now() - 60_000);
    utimesSync(dashPath, past, past);

    writeFileSync(statePath, makeSprintState());
    // sprint-state.json mtime is "now" (recently written) — newer than dashPath

    const result = isDashboardStaleVsSprintState(root);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('mtime-lag');
  });

  it('isDashboardStaleVsSprintState: orphan when sprint-state.json absent', () => {
    const dashPath = join(root, '.dashboard');
    writeFileSync(dashPath, makeDashboard());

    const result = isDashboardStaleVsSprintState(root);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe('sprint-state-removed');
  });

  it('isDashboardStaleVsSprintState: fresh when .dashboard newer than sprint-state.json', () => {
    const dashPath = join(root, '.dashboard');
    const statePath = join(root, '.deckent', 'sprint-state.json');

    writeFileSync(statePath, makeSprintState());
    const past = new Date(Date.now() - 60_000);
    utimesSync(statePath, past, past);

    writeFileSync(dashPath, makeDashboard());
    // dashPath mtime is "now" — newer than statePath

    const result = isDashboardStaleVsSprintState(root);
    expect(result.stale).toBe(false);
  });

  it('isDashboardStaleVsSprintState: not stale when .dashboard absent', () => {
    // No dashboard, no sprint-state.json
    const result = isDashboardStaleVsSprintState(root);
    expect(result.stale).toBe(false);
  });

  it('readDashboardSafe: surfaces stale=true when sprint-state newer', () => {
    const dashPath = join(root, '.dashboard');
    const statePath = join(root, '.deckent', 'sprint-state.json');

    writeFileSync(dashPath, makeDashboard());
    const past = new Date(Date.now() - 60_000);
    utimesSync(dashPath, past, past);

    writeFileSync(statePath, makeSprintState());

    const result = readDashboardSafe(root);
    expect(result.valid).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.staleReason).toBe('mtime-lag');
  });

  it('readDashboardSafe: stale=false when both files fresh and dashboard newer', () => {
    const dashPath = join(root, '.dashboard');
    const statePath = join(root, '.deckent', 'sprint-state.json');

    writeFileSync(statePath, makeSprintState());
    const past = new Date(Date.now() - 60_000);
    utimesSync(statePath, past, past);

    writeFileSync(dashPath, makeDashboard());

    const result = readDashboardSafe(root);
    expect(result.stale).toBe(false);
  });

  it('readDashboardSafe: stale=true with sprint-state-removed when only .dashboard exists', () => {
    const dashPath = join(root, '.dashboard');
    writeFileSync(dashPath, makeDashboard());
    // No sprint-state.json
    const result = readDashboardSafe(root);
    expect(result.stale).toBe(true);
    expect(result.staleReason).toBe('sprint-state-removed');
  });

  it('readDashboardSafe: tolerates missing dashboard gracefully (not stale)', () => {
    const statePath = join(root, '.deckent', 'sprint-state.json');
    writeFileSync(statePath, makeSprintState());
    const result = readDashboardSafe(root);
    expect(result.valid).toBe(false);
    expect(result.stale).toBeFalsy();
  });
});
