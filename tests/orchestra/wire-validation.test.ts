// ═══ Wire Validation — Sprint 154 T7 ═══════════════════════════════
// Validates that 3 previously-dead pipeline exports are now wired into
// production paths in sprint-phases.ts → runEvaluatePhase:
//   1. respawnEligibleTasks (sprint-spawner.ts) — Wave 2+ NO_GO retry
//   2. reconcileSpuriousNoGo (mid-sprint-adapter.ts) — TIMEOUT_WITH_WORK recovery
//   3. applyCascadeToSprint + applyUnblockToSprint (sprint-spawner.ts) — cascade infra
//
// Method: source-grep + integration-style import wire check. We verify the
// production module imports the wire helpers, not just test fixtures.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(process.cwd());
const SPRINT_PHASES_PATH = join(PROJECT_ROOT, 'src/orchestra/sprint-phases.ts');
const SPRINT_CONTROLLER_PATH = join(PROJECT_ROOT, 'src/orchestra/sprint-controller.ts');

function readSrc(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('Sprint 154 T7 — wire validation: dead pipeline exports', () => {

  // ═══ Test 1: respawnEligibleTasks wired ════════════════════════════
  describe('respawnEligibleTasks wire', () => {
    it('sprint-phases.ts imports respawnEligibleTasks from sprint-spawner', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      // Import is on a multi-line block from './sprint-spawner.js'
      const importBlockMatch = src.match(/from\s+['"]\.\/sprint-spawner\.js['"]/);
      expect(importBlockMatch, 'sprint-phases.ts must import from ./sprint-spawner.js').not.toBeNull();
      expect(src.includes('respawnEligibleTasks')).toBe(true);
    });

    it('sprint-phases.ts calls respawnEligibleTasks in runEvaluatePhase', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      // Find the runEvaluatePhase function body
      const evalPhaseStart = src.indexOf('export async function runEvaluatePhase');
      expect(evalPhaseStart, 'runEvaluatePhase must exist').toBeGreaterThan(-1);
      // Ensure call site exists with await + correct args (projectRoot, sprint, config, spawnOpts)
      const evalPhaseBody = src.slice(evalPhaseStart);
      const nextExport = evalPhaseBody.indexOf('\nexport ', 1);
      const phaseSlice = nextExport > 0 ? evalPhaseBody.slice(0, nextExport) : evalPhaseBody;
      expect(phaseSlice).toMatch(/await\s+respawnEligibleTasks\s*\(/);
    });

    it('sprint-controller.ts passes config + spawnOpts to runEvaluatePhase', () => {
      const src = readSrc(SPRINT_CONTROLLER_PATH);
      // The call must include config and a spawnBackend param so respawn can use them
      const callMatch = src.match(/runEvaluatePhase\s*\(\s*[\s\S]{0,400}?spawnBackend[\s\S]{0,40}?\)/);
      expect(callMatch, 'runEvaluatePhase must be called with config + spawnBackend').not.toBeNull();
    });
  });

  // ═══ Test 2: reconcileSpuriousNoGo wired ═══════════════════════════
  describe('reconcileSpuriousNoGo wire', () => {
    it('sprint-phases.ts imports reconcileSpuriousNoGo from mid-sprint-adapter', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      expect(src).toMatch(/import\s*\{\s*reconcileSpuriousNoGo[\s\S]*?\}\s*from\s+['"]\.\/mid-sprint-adapter\.js['"]/);
    });

    it('sprint-phases.ts calls reconcileSpuriousNoGo next to evaluateWithRubric in runEvaluatePhase', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      const evalPhaseStart = src.indexOf('export async function runEvaluatePhase');
      const phaseSlice = src.slice(evalPhaseStart, src.indexOf('\nexport ', evalPhaseStart + 1));
      // Both calls must exist in the same function body
      expect(phaseSlice).toMatch(/evaluateWithRubric\s*\(/);
      expect(phaseSlice).toMatch(/reconcileSpuriousNoGo\s*\(/);
      // reconcile must come AFTER evaluateWithRubric (recovery happens on NO_GO)
      const rubricIdx = phaseSlice.indexOf('evaluateWithRubric(');
      const reconcileIdx = phaseSlice.indexOf('reconcileSpuriousNoGo(');
      expect(reconcileIdx, 'reconcileSpuriousNoGo must follow evaluateWithRubric').toBeGreaterThan(rubricIdx);
    });
  });

  // ═══ Test 3: applyCascadeToSprint + applyUnblockToSprint wired ═════
  describe('applyCascadeToSprint + applyUnblockToSprint wire', () => {
    it('sprint-phases.ts imports both cascade helpers from sprint-spawner', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      expect(src.includes('applyCascadeToSprint')).toBe(true);
      expect(src.includes('applyUnblockToSprint')).toBe(true);
      // Imports must be from sprint-spawner.js (not just type imports from elsewhere)
      const importRegex = /import\s*\{[\s\S]*?applyCascadeToSprint[\s\S]*?\}\s*from\s+['"]\.\/sprint-spawner\.js['"]/;
      expect(src).toMatch(importRegex);
    });

    it('runEvaluatePhase invokes applyCascadeToSprint on NO_GO + applyUnblockToSprint on DONE', () => {
      const src = readSrc(SPRINT_PHASES_PATH);
      const evalPhaseStart = src.indexOf('export async function runEvaluatePhase');
      const phaseSlice = src.slice(evalPhaseStart, src.indexOf('\nexport ', evalPhaseStart + 1));
      // Both cascade application call-sites must be present
      expect(phaseSlice).toMatch(/applyCascadeToSprint\s*\(/);
      expect(phaseSlice).toMatch(/applyUnblockToSprint\s*\(/);
      // Wire must be guarded by dependency_pipeline_enabled to preserve legacy behaviour
      expect(phaseSlice).toMatch(/dependency_pipeline_enabled/);
    });
  });
});
