import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Mock node:child_process ──────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '0.1.0\n' }),
}));

// ─── Mock node:fs ─────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(5),
  closeSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

import { resolveAuthMode } from '../../src/core/provider-auth-resolver.js';
import { ProviderError } from '../../src/core/provider.js';
import { GeminiAdapter } from '../../src/providers/gemini.js';
import { CodexAdapter } from '../../src/providers/codex.js';
import { ClaudeAdapter } from '../../src/providers/claude.js';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const mockSpawn = spawn as unknown as MockInstance;
const mockSpawnSync = spawnSync as unknown as MockInstance;
const mockExistsSync = existsSync as unknown as MockInstance;

function makeMockChild() {
  return {
    once: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    pid: 99999,
  };
}

// ─── resolveAuthMode pure function ───────────────────────────────────

describe('resolveAuthMode', () => {
  // Scenario 1: config api_key + detected api_key → returns 'api_key'
  it('config api_key + detected api_key → returns api_key', () => {
    expect(resolveAuthMode('api_key', 'api_key', 'gemini')).toBe('api_key');
  });

  // Scenario 2: config api_key + no env (detected none) → throws
  it('config api_key + detected none → throws ProviderError', () => {
    expect(() => resolveAuthMode('api_key', 'none', 'gemini')).toThrow(ProviderError);
  });

  // Scenario 3: config subscription + oauth present (detected subscription) → returns 'subscription'
  it('config subscription + detected subscription → returns subscription', () => {
    expect(resolveAuthMode('subscription', 'subscription', 'gemini')).toBe('subscription');
  });

  // Scenario 4: config subscription + no oauth + env present (detected api_key) → throws
  it('config subscription + detected api_key → throws ProviderError', () => {
    expect(() => resolveAuthMode('subscription', 'api_key', 'gemini')).toThrow(ProviderError);
  });

  // Scenario 5: config auto → fallback to detectAuthMode behavior
  it('config auto + detected api_key → returns api_key', () => {
    expect(resolveAuthMode('auto', 'api_key', 'gemini')).toBe('api_key');
  });

  it('config auto + detected subscription → returns subscription', () => {
    expect(resolveAuthMode('auto', 'subscription', 'gemini')).toBe('subscription');
  });

  it('config undefined + detected api_key → returns api_key (same as auto)', () => {
    expect(resolveAuthMode(undefined, 'api_key', 'codex')).toBe('api_key');
  });

  it('config undefined + detected subscription → returns subscription (same as auto)', () => {
    expect(resolveAuthMode(undefined, 'subscription', 'codex')).toBe('subscription');
  });

  // Scenario 6: explicit mode mismatch → ProviderError with helpful message
  it('api_key mode mismatch → error mentions api_key and deckent doctor', () => {
    try {
      resolveAuthMode('api_key', 'none', 'gemini');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      const msg = (e as ProviderError).message;
      expect(msg).toContain('api_key');
      expect(msg).toContain('deckent doctor');
      expect((e as ProviderError).providerName).toBe('gemini');
    }
  });

  it('subscription mode mismatch → error mentions subscription and deckent doctor', () => {
    try {
      resolveAuthMode('subscription', 'api_key', 'codex');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      const msg = (e as ProviderError).message;
      expect(msg).toContain('subscription');
      expect(msg).toContain('deckent doctor');
      expect((e as ProviderError).providerName).toBe('codex');
    }
  });

  it('config auto + detected none → throws (no auth at all)', () => {
    expect(() => resolveAuthMode('auto', 'none', 'gemini')).toThrow(ProviderError);
  });

  it('config api_key + detected subscription → throws (api_key configured but subscription active)', () => {
    expect(() => resolveAuthMode('api_key', 'subscription', 'codex')).toThrow(ProviderError);
  });

  it('config subscription + detected none → throws', () => {
    expect(() => resolveAuthMode('subscription', 'none', 'gemini')).toThrow(ProviderError);
  });
});

// ─── GeminiAdapter auth enforcement integration ───────────────────────

describe('GeminiAdapter auth enforcement', () => {
  const projectDir = '/tmp/test-enforce-gemini';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // No OAuth, no API key by default — each test sets its own env
    process.env = { ...originalEnv };
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['DECKENT_GOOGLE_API_KEY'];
    mockSpawn.mockReturnValue(makeMockChild());
    // existsSync returns false by default (no OAuth creds file, no settings.json)
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Scenario 1: config api_key + env present → spawn succeeds, env has GOOGLE_API_KEY
  it('authConfig api_key + GOOGLE_API_KEY present → spawn injects API key', () => {
    process.env['GOOGLE_API_KEY'] = 'my-api-key-123';
    const adapter = new GeminiAdapter(projectDir, { authConfig: { mode: 'api_key' } });

    adapter.spawn('task-e1', 'gemini-2.5-flash', 'hello');

    const spawnOpts = mockSpawn.mock.calls[0][2];
    expect(spawnOpts.env['GOOGLE_API_KEY']).toBe('my-api-key-123');
  });

  // Scenario 2: config api_key + no env → throw ProviderError
  it('authConfig api_key + no GOOGLE_API_KEY → throws ProviderError', () => {
    const adapter = new GeminiAdapter(projectDir, { authConfig: { mode: 'api_key' } });

    expect(() => adapter.spawn('task-e2', 'gemini-2.5-flash', 'hello')).toThrow(ProviderError);
  });

  // Scenario 3: config subscription + OAuth creds present → spawn succeeds, API key vars stripped
  it('authConfig subscription + oauth_creds present → spawn strips API key env vars', () => {
    process.env['GOOGLE_API_KEY'] = 'should-be-stripped';
    // Mock existsSync to return true for the oauth_creds path
    mockExistsSync.mockImplementation((p: string) =>
      typeof p === 'string' && p.includes('oauth_creds'),
    );
    const adapter = new GeminiAdapter(projectDir, { authConfig: { mode: 'subscription' } });

    adapter.spawn('task-e3', 'gemini-2.5-flash', 'hello');

    const spawnOpts = mockSpawn.mock.calls[0][2];
    expect(spawnOpts.env['GOOGLE_API_KEY']).toBeUndefined();
    expect(spawnOpts.env['GEMINI_API_KEY']).toBeUndefined();
  });

  // Scenario 4: config subscription + no OAuth + env present → throw ProviderError
  it('authConfig subscription + no oauth + GOOGLE_API_KEY set → throws ProviderError', () => {
    process.env['GOOGLE_API_KEY'] = 'my-api-key-123';
    // No oauth_creds — existsSync returns false (default)
    const adapter = new GeminiAdapter(projectDir, { authConfig: { mode: 'subscription' } });

    expect(() => adapter.spawn('task-e4', 'gemini-2.5-flash', 'hello')).toThrow(ProviderError);
  });

  // Scenario 5: authConfig auto → delegates to detectAuthMode
  it('authConfig auto + GOOGLE_API_KEY present → spawn succeeds with api_key mode', () => {
    process.env['GOOGLE_API_KEY'] = 'auto-key-456';
    const adapter = new GeminiAdapter(projectDir, { authConfig: { mode: 'auto' } });

    adapter.spawn('task-e5', 'gemini-2.5-flash', 'hello');

    const spawnOpts = mockSpawn.mock.calls[0][2];
    expect(spawnOpts.env['GOOGLE_API_KEY']).toBe('auto-key-456');
  });

  // No authConfig → legacy behavior (unchanged)
  it('no authConfig → legacy path used, no enforcement', () => {
    process.env['GOOGLE_API_KEY'] = 'legacy-key';
    // existsSync returns false for oauth_creds → legacy path: api_key detected → inject
    const adapter = new GeminiAdapter(projectDir);

    adapter.spawn('task-e6', 'gemini-2.5-flash', 'hello');

    expect(mockSpawn).toHaveBeenCalledOnce();
  });
});

// ─── CodexAdapter auth enforcement integration ────────────────────────

describe('CodexAdapter auth enforcement', () => {
  const projectDir = '/tmp/test-enforce-codex';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DECKENT_OPENAI_API_KEY'];
    mockSpawn.mockReturnValue(makeMockChild());
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('authConfig api_key + OPENAI_API_KEY present → spawn succeeds', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-123';
    const adapter = new CodexAdapter(projectDir, { authConfig: { mode: 'api_key' } });

    adapter.spawn('task-c1', 'gpt-4.1', 'hello');
    expect(mockSpawn).toHaveBeenCalledOnce();
  });

  it('authConfig api_key + no OPENAI_API_KEY → throws ProviderError', () => {
    const adapter = new CodexAdapter(projectDir, { authConfig: { mode: 'api_key' } });

    // detectAuthMode() returns 'none' (no api key, no subscription session in test env)
    // spawnSync for 'codex auth status' will fail → 'none'
    expect(() => adapter.spawn('task-c2', 'gpt-4.1', 'hello')).toThrow(ProviderError);
  });

  it('authConfig subscription + codex auth logged in (no API key) → spawn succeeds without OPENAI_API_KEY', () => {
    // No OPENAI_API_KEY → detectAuthMode() falls through to 'codex auth status'
    // 'codex auth status' returns 'logged in' → detectAuthMode = 'subscription'
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'logged in\n' });

    const adapter = new CodexAdapter(projectDir, { authConfig: { mode: 'subscription' } });

    adapter.spawn('task-c3', 'gpt-4.1', 'hello');

    const spawnOpts = mockSpawn.mock.calls[0][2];
    // OPENAI_API_KEY was never set, and subscription enforcement deletes it (no-op but safe)
    expect(spawnOpts.env['OPENAI_API_KEY']).toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledOnce();
  });
});

// ─── ClaudeAdapter auth enforcement integration ───────────────────────

describe('ClaudeAdapter auth enforcement', () => {
  const projectDir = '/tmp/test-enforce-claude';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['ANTHROPIC_API_KEY'];
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('authConfig api_key + ANTHROPIC_API_KEY present → spawn proceeds (subprocess backend)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    const adapter = new ClaudeAdapter(projectDir, {
      claude_backend: 'subprocess',
      authConfig: { mode: 'api_key' },
    });

    // subprocess spawns via SubprocessSpawnBackend — mock spawn
    mockSpawn.mockReturnValue(makeMockChild());

    expect(() => adapter.spawn('task-cl1', 'sonnet', 'hello')).not.toThrow();
  });

  it('authConfig api_key + no ANTHROPIC_API_KEY → throws ProviderError', () => {
    const adapter = new ClaudeAdapter(projectDir, {
      claude_backend: 'tmux',
      authConfig: { mode: 'api_key' },
    });

    expect(() => adapter.spawn('task-cl2', 'sonnet', 'hello')).toThrow(ProviderError);
  });

  it('authConfig subscription + no ANTHROPIC_API_KEY → subscription detected → spawn proceeds (tmux)', () => {
    // No ANTHROPIC_API_KEY → detectAuthMode() = 'subscription'
    const adapter = new ClaudeAdapter(projectDir, {
      claude_backend: 'tmux',
      authConfig: { mode: 'subscription' },
    });

    // tmux backend calls ensureSession() + spawnWorker() — these will call spawnSync
    // With vi.mock, spawnSync returns status:0 so ensureSession succeeds
    // We just verify no ProviderError is thrown for auth
    // (tmux session setup may call spawnSync, which is mocked)
    expect(() => adapter.spawn('task-cl3', 'sonnet', 'hello')).not.toThrow(ProviderError);
  });

  it('detectAuthMode returns api_key when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-123';
    const adapter = new ClaudeAdapter(projectDir);
    expect(adapter.detectAuthMode()).toBe('api_key');
  });

  it('detectAuthMode returns subscription when ANTHROPIC_API_KEY is absent', () => {
    const adapter = new ClaudeAdapter(projectDir);
    expect(adapter.detectAuthMode()).toBe('subscription');
  });
});
