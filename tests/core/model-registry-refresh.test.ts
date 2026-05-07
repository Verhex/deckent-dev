import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import {
  loadRefreshState,
  saveRefreshState,
  refreshProvider,
  refreshAllProviders,
  formatRefreshAge,
  type RefreshState,
} from '../../src/core/model-registry-refresh.js';
import { ModelRegistry } from '../../src/core/model-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const dir = join(tmpdir(), `deckent-test-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── State I/O ───────────────────────────────────────────────────────────────

describe('loadRefreshState', () => {
  it('returns zero state when file does not exist', () => {
    const root = makeTmpRoot();
    try {
      const state = loadRefreshState(root);
      expect(state.lastRefresh).toEqual({});
      expect(state.updatedAt).toBeDefined();
    } finally {
      cleanupDir(root);
    }
  });

  it('returns zero state when file is malformed JSON', () => {
    const root = makeTmpRoot();
    try {
      writeFileSync(join(root, '.deckent', 'model-registry-refresh.json'), '{bad json}', 'utf-8');
      const state = loadRefreshState(root);
      expect(state.lastRefresh).toEqual({});
    } finally {
      cleanupDir(root);
    }
  });

  it('round-trips with saveRefreshState', () => {
    const root = makeTmpRoot();
    try {
      const ts = Date.now() - 1_000;
      const state: RefreshState = {
        lastRefresh: { claude: ts, codex: ts - 5_000, gemini: ts - 10_000 },
        updatedAt: new Date().toISOString(),
      };
      saveRefreshState(state, root);
      const loaded = loadRefreshState(root);
      expect(loaded.lastRefresh['claude']).toBe(ts);
      expect(loaded.lastRefresh['codex']).toBe(ts - 5_000);
      expect(loaded.lastRefresh['gemini']).toBe(ts - 10_000);
    } finally {
      cleanupDir(root);
    }
  });
});

// ─── ModelRegistry lastRefresh state ─────────────────────────────────────────

describe('ModelRegistry refresh state', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  it('isStale returns true when lastRefresh is unset', () => {
    expect(registry.isStale('claude')).toBe(true);
    expect(registry.isStale('codex')).toBe(true);
    expect(registry.isStale('gemini')).toBe(true);
  });

  it('isStale returns false when lastRefresh is recent', () => {
    registry.setLastRefresh('claude', Date.now() - 1_000);
    expect(registry.isStale('claude')).toBe(false);
  });

  it('isStale returns true when lastRefresh exceeds staleAfterMs', () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    registry.setLastRefresh('claude', tenDaysAgo);
    expect(registry.isStale('claude')).toBe(true);
  });

  it('isStale respects custom staleAfterMs override', () => {
    registry.setLastRefresh('codex', Date.now() - 5_000);
    // With 1s staleness: should be stale
    expect(registry.isStale('codex', 1_000)).toBe(true);
    // With 1h staleness: should not be stale
    expect(registry.isStale('codex', 60 * 60 * 1000)).toBe(false);
  });

  it('getLastRefreshAll returns all set providers', () => {
    registry.setLastRefresh('claude', 100);
    registry.setLastRefresh('gemini', 200);
    const all = registry.getLastRefreshAll();
    expect(all['claude']).toBe(100);
    expect(all['gemini']).toBe(200);
    expect(all['codex']).toBeUndefined();
  });
});

// ─── refreshProvider — graceful skip without API key ─────────────────────────

describe('refreshProvider — no API key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('claude: returns skippedReason when ANTHROPIC_API_KEY is absent', async () => {
    const registry = new ModelRegistry();
    // Clear any env keys that might be set in CI
    const result = await refreshProvider('claude', registry, {
      anthropicApiKey: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.provider).toBe('claude');
    expect(result.modelsFound).toBe(0);
    expect(result.skippedReason).toContain('ANTHROPIC_API_KEY');
  });

  it('codex: returns skippedReason when OPENAI_API_KEY is absent', async () => {
    const registry = new ModelRegistry();
    const result = await refreshProvider('codex', registry, {
      openaiApiKey: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain('OPENAI_API_KEY');
  });

  it('gemini: returns skippedReason when no Gemini key is set', async () => {
    const registry = new ModelRegistry();
    const result = await refreshProvider('gemini', registry, {
      geminiApiKey: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain('GEMINI_API_KEY');
  });
});

// ─── refreshProvider — malformed API response ────────────────────────────────

describe('refreshProvider — malformed API response', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not crash when Anthropic returns non-array data field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'not-an-array' }),
    }));
    const registry = new ModelRegistry();
    const result = await refreshProvider('claude', registry, { anthropicApiKey: 'test-key-123' });
    // Should succeed with 0 found (graceful empty)
    expect(result.success).toBe(true);
    expect(result.modelsFound).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('does not crash when OpenAI returns HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate_limit_exceeded' }),
    }));
    const registry = new ModelRegistry();
    const result = await refreshProvider('codex', registry, { openaiApiKey: 'test-key-123' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');
  });

  it('does not crash when Gemini returns null models field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: null }),
    }));
    const registry = new ModelRegistry();
    const result = await refreshProvider('gemini', registry, { geminiApiKey: 'test-key-123' });
    expect(result.success).toBe(true);
    expect(result.modelsFound).toBe(0);
  });
});

// ─── refreshProvider — successful discovery ──────────────────────────────────

describe('refreshProvider — successful model discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds newly discovered Anthropic models to registry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'claude-opus-4-6' }, // already in registry by apiId — should skip
          { id: 'claude-new-model-9999' }, // new discovery
        ],
      }),
    }));
    const registry = new ModelRegistry();
    const countBefore = registry.getAllModels().length;
    const result = await refreshProvider('claude', registry, { anthropicApiKey: 'test-key' });
    expect(result.success).toBe(true);
    expect(result.modelsFound).toBe(2);
    expect(result.modelsAdded).toBe(1);
    expect(registry.getAllModels().length).toBe(countBefore + 1);
    expect(registry.has('claude-new-model-9999')).toBe(true);
  });

  it('updates registry lastRefresh on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    const registry = new ModelRegistry();
    const before = Date.now();
    await refreshProvider('claude', registry, { anthropicApiKey: 'test-key' });
    const last = registry.getLastRefresh('claude');
    expect(last).toBeGreaterThanOrEqual(before);
  });

  it('does NOT update registry lastRefresh when skipped (no key)', async () => {
    const registry = new ModelRegistry();
    await refreshProvider('claude', registry, { anthropicApiKey: undefined });
    expect(registry.getLastRefresh('claude')).toBeUndefined();
  });
});

// ─── refreshAllProviders — parallel execution ─────────────────────────────────

describe('refreshAllProviders', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all 3 providers in parallel and returns all results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], models: [] }),
    }));
    const registry = new ModelRegistry();
    const results = await refreshAllProviders(registry, {
      anthropicApiKey: 'key1',
      openaiApiKey: 'key2',
      geminiApiKey: 'key3',
    });
    expect(results['claude']).toBeDefined();
    expect(results['codex']).toBeDefined();
    expect(results['gemini']).toBeDefined();
    expect(results['claude'].provider).toBe('claude');
    expect(results['codex'].provider).toBe('codex');
    expect(results['gemini'].provider).toBe('gemini');
  });

  it('gracefully handles mixed success/skip results', async () => {
    const registry = new ModelRegistry();
    // Only claude key present
    const results = await refreshAllProviders(registry, {
      anthropicApiKey: undefined,
      openaiApiKey: undefined,
      geminiApiKey: undefined,
    });
    // All should be skipped (no keys) but result objects still present
    expect(results['claude'].success).toBe(false);
    expect(results['codex'].success).toBe(false);
    expect(results['gemini'].success).toBe(false);
    // None should throw
    for (const r of Object.values(results)) {
      expect(r.error).toBeUndefined();
      expect(r.skippedReason).toBeDefined();
    }
  });
});

// ─── formatRefreshAge ────────────────────────────────────────────────────────

describe('formatRefreshAge', () => {
  it('returns "never" for timestamp 0', () => {
    expect(formatRefreshAge(0)).toBe('never');
  });

  it('returns "Just now" for recent timestamp', () => {
    expect(formatRefreshAge(Date.now() - 10_000)).toBe('Just now');
  });

  it('returns minutes for sub-hour timestamp', () => {
    const result = formatRefreshAge(Date.now() - 30 * 60_000);
    expect(result).toContain('minutes');
  });

  it('returns days for old timestamp', () => {
    const result = formatRefreshAge(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(result).toContain('days');
  });
});
