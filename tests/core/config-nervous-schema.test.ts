// tests/core/config-nervous-schema.test.ts
// Sprint 147 Task 17 — nervous_system config schema extension tests
// Validates 3-layer merge, defaults, validation, and detector count

import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  validateConfig,
  ConfigValidationError,
  deepMerge,
} from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/types.js';

describe('nervous_system config schema', () => {
  // ─── Test 1: Default config has enabled=false ────────────────────────────
  it('default config has nervous_system.enabled=false', () => {
    const config = createDefaultConfig();
    expect(config.nervous_system).toBeDefined();
    expect(config.nervous_system!.enabled).toBe(false);
  });

  // ─── Test 2: 3-layer merge — project config mode override applied ─────────
  it('project config mode override is applied via 3-layer merge', () => {
    const defaultConfig = createDefaultConfig();
    const projectConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...defaultConfig.nervous_system!,
        mode: 'autopilot',
      },
    };
    const merged = deepMerge(defaultConfig, projectConfig);
    expect(merged.nervous_system!.mode).toBe('autopilot');
    // other defaults preserved
    expect(merged.nervous_system!.enabled).toBe(false);
    expect(merged.nervous_system!.history_retention_days).toBe(30);
  });

  // ─── Test 3: Global overrides defaults, project overrides global ──────────
  it('global config overrides defaults, project overrides global', () => {
    const defaults = createDefaultConfig();

    // Simulate global config override
    const globalConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...defaults.nervous_system!,
        mode: 'strict',
        history_retention_days: 60,
      },
    };
    const afterGlobal = deepMerge(defaults, globalConfig);
    expect(afterGlobal.nervous_system!.mode).toBe('strict');
    expect(afterGlobal.nervous_system!.history_retention_days).toBe(60);

    // Simulate project config further override
    const projectConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...afterGlobal.nervous_system!,
        mode: 'balanced',
      },
    };
    const afterProject = deepMerge(afterGlobal, projectConfig);
    expect(afterProject.nervous_system!.mode).toBe('balanced');
    // global's history_retention_days should still be present
    expect(afterProject.nervous_system!.history_retention_days).toBe(60);
  });

  // ─── Test 4: Invalid mode → validation error ──────────────────────────────
  it('throws ConfigValidationError for invalid nervous_system.mode', () => {
    const config = createDefaultConfig();
    // Force invalid mode — use type cast to simulate bad config
    config.nervous_system = {
      ...config.nervous_system!,
      mode: 'turbo-auto' as 'strict',
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors.some(msg => msg.includes('nervous_system.mode'))).toBe(true);
      expect(err.errors.some(msg => msg.includes('turbo-auto'))).toBe(true);
    }
  });

  // ─── Test 5: Invalid threshold_ms (negative) → validation error ──────────
  it('throws ConfigValidationError for negative stale_worker.threshold_ms', () => {
    const config = createDefaultConfig();
    config.nervous_system = {
      ...config.nervous_system!,
      detectors: {
        ...config.nervous_system!.detectors,
        stale_worker: { enabled: true, threshold_ms: -1 },
      },
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors.some(msg => msg.includes('threshold_ms'))).toBe(true);
    }
  });

  // ─── Test 6: detectors has exactly 11 entries (Sprint 153 — 5 original + 6 added since Sprint 147)
  it('nervous_system.detectors has 11 entries (5 original + 6 implemented post-Sprint-147)', () => {
    const config = createDefaultConfig();
    const detectors = config.nervous_system!.detectors;
    const detectorKeys = Object.keys(detectors);
    expect(detectorKeys.length).toBe(11);

    // 5 original active detectors (Sprint 145-147 wave)
    expect(detectorKeys).toContain('stale_worker');
    expect(detectorKeys).toContain('scope_collision');
    expect(detectorKeys).toContain('debt_trend');
    expect(detectorKeys).toContain('agent_routing');
    expect(detectorKeys).toContain('directives_protection');

    // 6 detectors added Sprint 147+ (T-152-012 audit confirmed implementations exist)
    expect(detectorKeys).toContain('task_mode_idle');
    expect(detectorKeys).toContain('build_failure_recurrence');
    expect(detectorKeys).toContain('token_spike');
    expect(detectorKeys).toContain('agent_routing_anomaly');
    expect(detectorKeys).toContain('scope_collision_rate');
    expect(detectorKeys).toContain('notification_delivery_health');

    // task_mode_idle is the only one disabled by default (it only fires
    // when deckent_style='task' which is not the default sprint mode).
    const disabled = detectorKeys.filter(
      k => !detectors[k as keyof typeof detectors].enabled,
    );
    expect(disabled).toEqual(['task_mode_idle']);
  });
});
