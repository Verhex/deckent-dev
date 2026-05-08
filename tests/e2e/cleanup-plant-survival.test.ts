// ─── Cleanup Plant-Survival E2E Regression ────────────────────────────────
// Sprint 160 T-001 introduced task-prefix discipline in three sweep paths so
// user/forensic plant files (e.g. `.prompt-TEST-*`, `.worker-MANUAL-*.sh`)
// survive sprint-end cleanup. These tests pin that contract:
//
//   1. archiveOrphanTasks (sprint-docs-updater:706) — plants survive, real
//      task artifacts move to .brain/archive/<sprintId>-tasks/.
//   2. cleanup() lifecycle sweep (sprint-lifecycle:269) — plants survive,
//      .prompt-task-* / .worker-task-*.sh tmpfiles are unlinked.
//   3. deckent cleanup CLI (cleanup.ts:81 dry-run path) — preview lists only
//      task-prefix prompt files; plants do not appear.
//
// If T-001's `.prompt-task-` / `.worker-task-` filters are reverted to the
// generic `.prompt-` / `.worker-` form, these tests fail — that is the
// regression evidence the suite is designed to capture.
//
// Note on Test 3 — full CLI execute path runs `archivePromptFiles`
// (spawn-backend-docker.ts:776) which still uses the generic `.prompt-`
// filter. That helper is outside T-001's stated scope. Test 3 therefore
// targets the dry-run path (which IS T-001's cleanup.ts edit) plus a
// lenient `.worker-*` plant-survival check on the execute path. Strict
// `.prompt-*` execute survival would require a follow-up patch to
// archivePromptFiles.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync,
  readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { archiveOrphanTasks } from '../../src/orchestra/sprint-docs-updater.js';
import { cleanup as lifecycleCleanup } from '../../src/orchestra/sprint-lifecycle.js';
import { registerCleanup } from '../../src/cli/commands/cleanup.js';
import { SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

// ─── Plant manifest ────────────────────────────────────────────────────────
// Each plant is keyed by its filename and carries a unique-per-test content
// blob so byte-equality checks catch any in-place tampering.

interface Plant {
  name: string;
  contents: string;
}

const PLANTS: Plant[] = [
  { name: '.prompt-TEST-PLANT.txt',   contents: 'PLANT::prompt-TEST::do-not-touch' },
  { name: '.worker-TEST-PLANT.sh',    contents: '#!/bin/sh\necho PLANT::worker-TEST' },
  { name: '.worker-MANUAL-PLANT.sh',  contents: '#!/bin/sh\necho PLANT::worker-MANUAL' },
];

const TASK_ARTIFACTS: Plant[] = [
  { name: '.prompt-task-160-001.txt', contents: 'task-prefix prompt artifact' },
  { name: '.worker-task-160-001.sh',  contents: '#!/bin/sh\necho task-prefix worker' },
];

const TASK_JSON = {
  id: '160-001',
  title: 'synthetic task',
  description: 'fixture for plant-survival e2e',
  model: 'haiku',
  effort: 'low',
  priority: 'NORMAL',
  reason: 'test fixture',
  scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/x.ts'] },
  dependencies: [],
  goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: 'n/a' },
  status: 'DONE',
  sprintId: 'sprint-160',
  createdAt: new Date().toISOString(),
  assignedAgent: 'generic',
  assignedSkills: [],
};

// ─── Sandbox helpers ───────────────────────────────────────────────────────

let sandbox: string;
let tasksDir: string;

function plantSandbox(): void {
  sandbox = mkdtempSync(join(tmpdir(), 'deckent-plant-survival-'));
  tasksDir = join(sandbox, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(join(sandbox, '.brain'), { recursive: true });

  for (const p of PLANTS) {
    writeFileSync(join(tasksDir, p.name), p.contents, 'utf-8');
  }
  for (const a of TASK_ARTIFACTS) {
    writeFileSync(join(tasksDir, a.name), a.contents, 'utf-8');
  }
  writeFileSync(
    join(tasksDir, `task-${TASK_JSON.id}.json`),
    JSON.stringify(TASK_JSON, null, 2),
    'utf-8',
  );
}

function destroySandbox(): void {
  if (sandbox && existsSync(sandbox)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function assertPlantsIntactInTasksDir(): void {
  for (const p of PLANTS) {
    const path = join(tasksDir, p.name);
    expect(existsSync(path), `plant ${p.name} must remain in .tasks/`).toBe(true);
    expect(readFileSync(path, 'utf-8')).toBe(p.contents);
  }
}

// Stub spawn backend so lifecycleCleanup() does not shell out to tmux.
function stubSpawnBackend(): SpawnBackend {
  return {
    name: 'mock',
    spawn: () => { /* no-op */ },
    kill: () => { /* no-op */ },
    list: () => [],
    isAvailable: async () => true,
  };
}

// ─── Lifecycle hooks ───────────────────────────────────────────────────────

beforeEach(() => {
  plantSandbox();
});

afterEach(() => {
  destroySandbox();
});

// ─── Test 1 — archiveOrphanTasks ───────────────────────────────────────────

describe('cleanup plant-survival regression — Sprint 160 T-001 tag-naming filter', () => {
  it('archiveOrphanTasks preserves user-planted .prompt-TEST-* / .worker-MANUAL-*', () => {
    const moved = archiveOrphanTasks(sandbox, 'sprint-160');

    // Plants must remain untouched in .tasks/.
    assertPlantsIntactInTasksDir();

    // Real task artifacts (task-160-001.json + .prompt-task-160-001.txt) must
    // be moved to .brain/archive/sprint-160-tasks/.
    const archiveDir = join(sandbox, '.brain', 'archive', 'sprint-160-tasks');
    expect(existsSync(archiveDir)).toBe(true);
    expect(existsSync(join(archiveDir, `task-${TASK_JSON.id}.json`))).toBe(true);
    expect(existsSync(join(archiveDir, '.prompt-task-160-001.txt'))).toBe(true);

    // Originals removed from .tasks/.
    expect(existsSync(join(tasksDir, `task-${TASK_JSON.id}.json`))).toBe(false);
    expect(existsSync(join(tasksDir, '.prompt-task-160-001.txt'))).toBe(false);

    // archiveOrphanTasks counts both task-prefix files: the JSON + the .prompt-task-*.txt.
    expect(moved).toBeGreaterThanOrEqual(2);
  });

  // ─── Test 2 — sprint-lifecycle cleanup() ─────────────────────────────────
  it('cleanup() lifecycle sweep preserves user plants but unlinks .prompt-task-*/.worker-task-*', () => {
    const sprint: Sprint = {
      id: 'sprint-160',
      number: 160,
      status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE,
      tasks: [],
      workers: [],
    };

    lifecycleCleanup(sandbox, sprint, stubSpawnBackend());

    // User plants survive.
    assertPlantsIntactInTasksDir();

    // Task-prefix tmpfiles are swept.
    expect(existsSync(join(tasksDir, '.prompt-task-160-001.txt'))).toBe(false);
    expect(existsSync(join(tasksDir, '.worker-task-160-001.sh'))).toBe(false);
  });

  // ─── Test 3a — CLI dry-run preview ───────────────────────────────────────
  it('deckent cleanup --dry-run preview lists only .prompt-task-* (Sprint 160 T-001)', async () => {
    const program = new Command();
    program.exitOverride(); // prevent process.exit in tests
    registerCleanup(program);

    // Capture stdout to inspect dry-run preview.
    const captured: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    const origCwd = process.cwd();
    process.chdir(sandbox);
    try {
      await program.parseAsync(['cleanup', '--dry-run'], { from: 'user' });
    } finally {
      process.chdir(origCwd);
      process.stdout.write = origWrite;
    }

    const output = captured.join('');

    // Plants must NOT appear in dry-run preview.
    for (const p of PLANTS) {
      expect(output, `plant ${p.name} leaked into dry-run preview`).not.toContain(p.name);
    }

    // Task-prefix prompt artifact MUST appear in preview.
    expect(output).toContain('.prompt-task-160-001.txt');

    // Plants on disk untouched (dry-run does nothing — but be explicit).
    assertPlantsIntactInTasksDir();
  });

  // ─── Test 3b — CLI execute preserves .worker-* plants ───────────────────
  // Note: `.prompt-TEST-PLANT.txt` is moved to .tasks/archive/sprint-160/ by
  // archivePromptFiles (spawn-backend-docker.ts:776) — that helper is outside
  // T-001's stated scope. We assert content is preserved (not lost) and
  // .worker-* plants survive in .tasks/ as expected from the lifecycle path.
  it('deckent cleanup execute preserves .worker-MANUAL-* plants in .tasks/', async () => {
    const program = new Command();
    program.exitOverride();
    registerCleanup(program);

    const origCwd = process.cwd();
    process.chdir(sandbox);

    // Suppress chatty CLI output during execute.
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    try {
      await program.parseAsync(['cleanup'], { from: 'user' });
    } finally {
      process.chdir(origCwd);
      process.stdout.write = origWrite;
    }

    // .worker-* plants must remain in .tasks/ — lifecycle cleanup() respects
    // the task-prefix filter introduced by T-001 and archivePromptFiles only
    // touches .prompt-* files.
    expect(existsSync(join(tasksDir, '.worker-TEST-PLANT.sh'))).toBe(true);
    expect(readFileSync(join(tasksDir, '.worker-TEST-PLANT.sh'), 'utf-8'))
      .toBe(PLANTS[1].contents);
    expect(existsSync(join(tasksDir, '.worker-MANUAL-PLANT.sh'))).toBe(true);
    expect(readFileSync(join(tasksDir, '.worker-MANUAL-PLANT.sh'), 'utf-8'))
      .toBe(PLANTS[2].contents);

    // .prompt-TEST plant content is preserved either in .tasks/ or in
    // .tasks/archive/sprint-160/ (archivePromptFiles relocates it).
    const here     = join(tasksDir, '.prompt-TEST-PLANT.txt');
    const archived = join(tasksDir, 'archive', 'sprint-160', '.prompt-TEST-PLANT.txt');
    const survived = existsSync(here) || existsSync(archived);
    expect(survived, 'plant .prompt-TEST-PLANT.txt content must be preserved').toBe(true);
    const finalPath = existsSync(here) ? here : archived;
    expect(readFileSync(finalPath, 'utf-8')).toBe(PLANTS[0].contents);

    // Real task tmpfiles are gone from .tasks/.
    expect(existsSync(join(tasksDir, '.worker-task-160-001.sh'))).toBe(false);
  });
});
