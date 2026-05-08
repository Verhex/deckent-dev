// Sprint 162A — Bug R5 Fix Test Suite
// Verifies isTaskTmpfile() classifier and the recover-time tmpfile sweep.
// The classifier is the canonical source of truth for D6 Plan B
// digit-prefix plant guard: real generator emissions (.worker-NNN-MMM.sh,
// .prompt-NNN-…txt) are swept while forensic plants (TEST-/MANUAL-,
// lowercase test-/manual-) are preserved.

import { describe, it, expect } from 'vitest';
import {
  isTaskTmpfile,
  selectTaskTmpfiles,
  selectPreservedPlants,
} from '../../../src/core/task-tmpfile-pattern.js';

describe('isTaskTmpfile (Bug R5 — Sprint 162A)', () => {
  it('matches real .worker-${taskId}.sh emissions', () => {
    expect(isTaskTmpfile('.worker-161-001.sh')).toBe(true);
    expect(isTaskTmpfile('.worker-161-034.sh')).toBe(true);
    expect(isTaskTmpfile('.worker-1-001.sh')).toBe(true);
  });

  it('matches real .prompt-${taskId}-${hash}.txt emissions', () => {
    expect(isTaskTmpfile('.prompt-161-001-abc123.txt')).toBe(true);
    expect(isTaskTmpfile('.prompt-161-002-def456-fix.txt')).toBe(true);
    expect(isTaskTmpfile('.prompt-99-001-deadbeef.txt')).toBe(true);
  });

  it('PRESERVES forensic TEST-* plants (uppercase)', () => {
    expect(isTaskTmpfile('.worker-TEST-PLANT.sh')).toBe(false);
    expect(isTaskTmpfile('.prompt-TEST-PLANT-abc.txt')).toBe(false);
    expect(isTaskTmpfile('.worker-TEST-DOCKER-1234.sh')).toBe(false);
  });

  it('PRESERVES forensic MANUAL-* plants', () => {
    expect(isTaskTmpfile('.worker-MANUAL-FORENSIC.sh')).toBe(false);
    expect(isTaskTmpfile('.prompt-MANUAL-FORENSIC-x.txt')).toBe(false);
  });

  it('PRESERVES lowercase test-* plants (e.g. .prompt-test-docker-…)', () => {
    expect(
      isTaskTmpfile('.prompt-test-docker-317411-64210aee9bf7a00c.txt'),
    ).toBe(false);
    expect(isTaskTmpfile('.worker-test-docker-317411.sh')).toBe(false);
  });

  it('PRESERVES lowercase manual-/plant-/debug- prefixes', () => {
    expect(isTaskTmpfile('.worker-manual-trace.sh')).toBe(false);
    expect(isTaskTmpfile('.worker-plant-debug.sh')).toBe(false);
    expect(isTaskTmpfile('.prompt-debug-flow-abc.txt')).toBe(false);
  });

  it('rejects unrelated filenames', () => {
    expect(isTaskTmpfile('task-161-001.json')).toBe(false);
    expect(isTaskTmpfile('something.txt')).toBe(false);
    expect(isTaskTmpfile('')).toBe(false);
    expect(isTaskTmpfile('.dashboard')).toBe(false);
    expect(isTaskTmpfile('.gitkeep')).toBe(false);
  });

  it('rejects path-traversal-like names (defense-in-depth)', () => {
    expect(isTaskTmpfile('..')).toBe(false);
    expect(isTaskTmpfile('.')).toBe(false);
    expect(isTaskTmpfile('.worker-../etc/passwd.sh')).toBe(false);
    expect(isTaskTmpfile('.prompt-..\\evil.txt')).toBe(false);
    expect(isTaskTmpfile('a/b')).toBe(false);
    expect(isTaskTmpfile('a\\b')).toBe(false);
  });

  it('rejects wrong extensions', () => {
    expect(isTaskTmpfile('.worker-161-001.txt')).toBe(false);
    expect(isTaskTmpfile('.prompt-161-001.sh')).toBe(false);
    expect(isTaskTmpfile('.worker-161-001.sh.bak')).toBe(false);
  });

  it('selectTaskTmpfiles correctly partitions a mixed listing', () => {
    const entries = [
      '.worker-161-001.sh',
      '.worker-161-002.sh',
      '.worker-TEST-PIN.sh',
      '.prompt-161-001-abc.txt',
      '.prompt-MANUAL-X.txt',
      '.prompt-test-docker-317411.txt',
      'task-161-001.json',
      '.gitkeep',
    ];
    expect(selectTaskTmpfiles(entries)).toEqual([
      '.worker-161-001.sh',
      '.worker-161-002.sh',
      '.prompt-161-001-abc.txt',
    ]);
  });

  it('selectPreservedPlants returns only plant-prefixed files (not unrelated names)', () => {
    const entries = [
      '.worker-161-001.sh',          // real → not a plant
      '.worker-TEST-PIN.sh',         // plant
      '.prompt-MANUAL-X.txt',        // plant
      '.prompt-test-docker-1.txt',   // plant (lowercase)
      'task-161-001.json',           // not tmpfile-shaped
      '.dashboard',                  // not tmpfile-shaped
    ];
    const plants = selectPreservedPlants(entries);
    expect(plants).toEqual([
      '.worker-TEST-PIN.sh',
      '.prompt-MANUAL-X.txt',
      '.prompt-test-docker-1.txt',
    ]);
  });
});

describe('Sprint 161 wash-up scenario (Bug R5 acceptance criteria)', () => {
  it('classifies all 34 .worker-161-NNN.sh files as sweepable (R5-AC1)', () => {
    const realEmissions: string[] = [];
    for (let i = 1; i <= 34; i++) {
      realEmissions.push(`.worker-161-${String(i).padStart(3, '0')}.sh`);
    }
    realEmissions.push('.worker-TEST-PIN.sh', '.worker-MANUAL-PIN.sh');
    const swept = selectTaskTmpfiles(realEmissions);
    const plants = selectPreservedPlants(realEmissions);
    expect(swept).toHaveLength(34);
    expect(plants).toHaveLength(2);
    expect(plants).toContain('.worker-TEST-PIN.sh');
    expect(plants).toContain('.worker-MANUAL-PIN.sh');
  });
});
