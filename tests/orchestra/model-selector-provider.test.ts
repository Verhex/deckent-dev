import { describe, it, expect } from 'vitest';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';
import type { ResolvedConfig, TaskScope, ModelType, ProviderName } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeScope(dirs: string[], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

// ─── Backward Compatibility (no provider = claude) ──────────────────────────

describe('resolveTaskModel — provider parameter backward compat', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('no provider parameter returns Claude model (haiku)', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel('Simple fix', 'A tiny change', scope, config);
    expect(result).toBe('haiku');
  });

  it('no provider parameter returns Claude model (sonnet)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel('Normal task', 'Some description', scope, config);
    expect(result).toBe('sonnet');
  });

  it('no provider parameter returns Claude model (opus)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
    );
    expect(result).toBe('opus');
  });

  it('explicit provider=claude returns same as no provider', () => {
    const scope = makeScope(['src/cli/']);
    const withoutProvider = resolveTaskModel('Simple fix', 'A tiny change', scope, config);
    const withProvider = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'claude',
    );
    expect(withProvider).toBe(withoutProvider);
  });
});

// ─── Codex Provider ──────────────────────────────────────────────────────────

describe('resolveTaskModel — codex provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('simple task resolves to gpt-5-mini (economy tier)', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5-mini');
  });

  it('medium task resolves to gpt-4.1 (standard tier)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel(
      'Normal task', 'Some description', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-4.1');
  });

  it('complex task resolves to gpt-5 (premium tier)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5');
  });

});

// ─── Gemini Provider ─────────────────────────────────────────────────────────

describe('resolveTaskModel — gemini provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('simple task resolves to gemini-2.0-flash (economy tier)', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    // haiku -> economy tier -> gemini-2.0-flash (economy on gemini)
    expect(result).toBe('gemini-2.0-flash');
  });

  it('medium task resolves to gemini-2.5-flash (standard tier)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel(
      'Normal task', 'Some description', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-flash');
  });

  it('complex task resolves to gemini-2.5-pro (premium tier)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-pro');
  });
});

// ─── forceModel with provider ────────────────────────────────────────────────

describe('resolveTaskModel — forceModel + provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('forceModel=opus on codex maps to gpt-5', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'opus', undefined, 'codex',
    );
    expect(result).toBe('gpt-5');
  });

  it('forceModel=sonnet on gemini maps to gemini-2.5-flash', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'sonnet', undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-flash');
  });

  it('forceModel=gpt-4.1 on codex returns gpt-4.1 directly (same provider)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'gpt-4.1', undefined, 'codex',
    );
    expect(result).toBe('gpt-4.1');
  });

  it('forceModel=opus on claude returns opus directly', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'opus', undefined, 'claude',
    );
    expect(result).toBe('opus');
  });

  it('forceModel=haiku on gemini maps to gemini-2.0-flash (economy tier)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'haiku', undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.0-flash');
  });
});

// ─── Layer 1b min_tier clamp on forceModel (Sprint 154 T5 fix) ───────────────

describe('resolveTaskModel — forceModel + haiku_allowed clamp (Sprint 154 T5)', () => {
  const patterns: never[] = [];

  it('forceModel=haiku + haiku_allowed=false → clamps to sonnet (standard tier)', () => {
    const config = makeConfig({
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
      },
    });
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced haiku', 'DIRECTIVES says haiku but config disallows', scope, config, patterns,
      'haiku', undefined, 'claude',
    );
    // forceModel=haiku (economy) is below min_tier=standard → clamp to sonnet
    expect(result).toBe('sonnet');
  });

  it('forceModel=opus + haiku_allowed=false → opus (already above min_tier, no change)', () => {
    const config = makeConfig({
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
      },
    });
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced opus', 'Premium task', scope, config, patterns,
      'opus', undefined, 'claude',
    );
    // forceModel=opus (premium) is above min_tier=standard → no clamp
    expect(result).toBe('opus');
  });

  it('forceModel=haiku + haiku_allowed=false + codex provider → clamps to gpt-4.1', () => {
    const config = makeConfig({
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
      },
    });
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced haiku codex', 'Cross-provider clamp check', scope, config, patterns,
      'haiku', undefined, 'codex',
    );
    // haiku → clamp to sonnet → codex equivalent gpt-4.1
    expect(result).toBe('gpt-4.1');
  });

  it('forceModel=haiku + haiku_allowed=true → haiku (no clamp, default behavior)', () => {
    const config = makeConfig(); // haiku_allowed: true (default)
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced haiku allowed', 'Should remain haiku', scope, config, patterns,
      'haiku', undefined, 'claude',
    );
    expect(result).toBe('haiku');
  });
});

// ─── Layer interactions with provider ────────────────────────────────────────

describe('resolveTaskModel — layer interactions with provider', () => {
  it('pro_plan + codex: opus->sonnet(plan filter)->gpt-4.1(codex mapping)', () => {
    const proConfig = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, proConfig,
      undefined, undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-4.1');
  });

  it('haiku_allowed=false + gemini: haiku->sonnet(filter)->gemini-2.5-flash', () => {
    const config = makeConfig({
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
      },
    });
    const patterns: never[] = [];
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    // haiku (score-based) -> sonnet (haiku not allowed) -> gemini-2.5-flash
    expect(result).toBe('gemini-2.5-flash');
  });

  it('doc scope + codex: opus->sonnet(doc cap)->gpt-4.1(codex)', () => {
    const config = makeConfig();
    const patterns: never[] = [];
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel(
      'Write docs', 'Documentation', scope, config, patterns,
      undefined, ['opus'], 'codex',
    );
    // skill upgrades to opus, Layer 3 caps to sonnet, then codex mapping -> gpt-4.1
    expect(result).toBe('gpt-4.1');
  });

  it('skillModels + provider maps correctly', () => {
    const config = makeConfig();
    const patterns: never[] = [];
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, ['opus'], 'codex',
    );
    // skill upgrades to opus, no caps apply, codex mapping -> gpt-5
    expect(result).toBe('gpt-5');
  });
});
