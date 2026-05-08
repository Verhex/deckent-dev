// Sprint 162A — Bug R2 Fix Test Suite
// Verifies resetSprintStateOnRecover() rewrites sprint-state.json to a
// terminal (COMPLETE/ABORTED) state on `deckent recover`, with atomic
// temp+rename semantics and graceful tolerance of missing/malformed
// state files.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resetSprintStateOnRecover,
} from '../../../src/orchestra/sprint-utils.js';

describe('resetSprintStateOnRecover (Bug R2 — Sprint 162A)', () => {
  let root: string;
  let statePath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-r2-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    statePath = join(root, '.deckent', 'sprint-state.json');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resets EXECUTE/ACTIVE to COMPLETE/ABORTED with fresh updatedAt', () => {
    writeFileSync(
      statePath,
      JSON.stringify({
        sprintId: 'sprint-161',
        phase: 'EXECUTE',
        status: 'ACTIVE',
        startedAt: '2026-05-08T08:00:00.000Z',
        updatedAt: '2026-05-08T08:30:00.000Z',
        taskIds: ['161-001', '161-002'],
      }),
    );

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

  it('refreshes updatedAt timestamp', () => {
    writeFileSync(
      statePath,
      JSON.stringify({
        sprintId: 'sprint-161',
        phase: 'EXECUTE',
        status: 'ACTIVE',
        startedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        taskIds: [],
      }),
    );
    const delta = resetSprintStateOnRecover(root);
    expect(delta).not.toBeNull();
    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'));
    const newTs = Date.parse(persisted.updatedAt);
    const oldTs = Date.parse('2026-01-01T01:00:00.000Z');
    expect(newTs).toBeGreaterThan(oldTs);
  });

  it('adds completedAt field equal to updatedAt', () => {
    writeFileSync(
      statePath,
      JSON.stringify({
        sprintId: 'sprint-161',
        phase: 'EXECUTE',
        status: 'ACTIVE',
        startedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        taskIds: [],
      }),
    );
    resetSprintStateOnRecover(root);
    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(typeof persisted.completedAt).toBe('string');
    expect(persisted.completedAt).toBe(persisted.updatedAt);
  });

  it('preserves sprintId, startedAt, taskIds across reset', () => {
    const original = {
      sprintId: 'sprint-161',
      phase: 'FIX',
      status: 'FIXING',
      startedAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-04-01T13:00:00.000Z',
      taskIds: ['161-A', '161-B', '161-C'],
    };
    writeFileSync(statePath, JSON.stringify(original));
    resetSprintStateOnRecover(root);
    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(persisted.sprintId).toBe(original.sprintId);
    expect(persisted.startedAt).toBe(original.startedAt);
    expect(persisted.taskIds).toEqual(original.taskIds);
  });

  it('returns null when no state file exists', () => {
    expect(existsSync(statePath)).toBe(false);
    expect(resetSprintStateOnRecover(root)).toBeNull();
  });

  it('tolerates malformed JSON gracefully (returns null, original untouched)', () => {
    writeFileSync(statePath, 'not valid json {{{', 'utf-8');
    const before = readFileSync(statePath, 'utf-8');
    const result = resetSprintStateOnRecover(root);
    expect(result).toBeNull();
    expect(readFileSync(statePath, 'utf-8')).toBe(before);
  });

  it('atomic — leaves original intact when write fails (read-only dir)', () => {
    // Skip on platforms where chmod is unreliable (Windows)
    if (process.platform === 'win32') return;

    writeFileSync(
      statePath,
      JSON.stringify({
        sprintId: 'sprint-161',
        phase: 'EXECUTE',
        status: 'ACTIVE',
        startedAt: 'x',
        updatedAt: 'y',
        taskIds: [],
      }),
    );
    const original = readFileSync(statePath, 'utf-8');

    // Make .deckent/ read-only — temp file write will fail, original
    // remains untouched. This exercises the atomic try/catch path.
    const deckentDir = join(root, '.deckent');
    chmodSync(deckentDir, 0o555);
    try {
      expect(resetSprintStateOnRecover(root)).toBeNull();
      expect(readFileSync(statePath, 'utf-8')).toBe(original);
    } finally {
      // restore writability so afterEach can remove the dir
      chmodSync(deckentDir, 0o755);
    }
  });

  it('idempotent — second call from terminal state still returns delta', () => {
    writeFileSync(
      statePath,
      JSON.stringify({
        sprintId: 'sprint-161',
        phase: 'EXECUTE',
        status: 'ACTIVE',
        startedAt: '2026-01-01',
        updatedAt: '2026-01-01',
        taskIds: [],
      }),
    );
    const first = resetSprintStateOnRecover(root);
    expect(first?.oldPhase).toBe('EXECUTE');

    const second = resetSprintStateOnRecover(root);
    expect(second).not.toBeNull();
    expect(second!.oldPhase).toBe('COMPLETE');
    expect(second!.oldStatus).toBe('ABORTED');
    expect(second!.newPhase).toBe('COMPLETE');
    expect(second!.newStatus).toBe('ABORTED');
  });
});
