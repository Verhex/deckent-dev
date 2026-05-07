// ─── Model Registry Remote Refresh ─────────────────────────────────────────
// Stale-while-revalidate cache pattern for provider model lists.
// Persists refresh timestamps to .deckent/model-registry-refresh.json.
// API key required for remote refresh; graceful skip when absent.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ModelRegistry, RegistryProviderName } from './model-registry.js';
import { DeckentError } from './errors.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RefreshResult {
  provider: RegistryProviderName;
  success: boolean;
  modelsFound: number;
  modelsAdded: number;
  timestamp: number;
  skippedReason?: string;
  error?: string;
}

export interface RefreshState {
  lastRefresh: Partial<Record<RegistryProviderName, number>>;
  updatedAt: string;
}

export interface RefreshOptions {
  root?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  timeoutMs?: number;
}

// ─── State I/O ──────────────────────────────────────────────────────────────

const REFRESH_STATE_FILENAME = 'model-registry-refresh.json';
const DEFAULT_TIMEOUT_MS = 10_000;

function getRefreshStatePath(root = '.'): string {
  return join(root, '.deckent', REFRESH_STATE_FILENAME);
}

export function loadRefreshState(root = '.'): RefreshState {
  const path = getRefreshStatePath(root);
  if (!existsSync(path)) {
    return { lastRefresh: {}, updatedAt: new Date(0).toISOString() };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RefreshState>;
    return {
      lastRefresh: raw.lastRefresh ?? {},
      updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return { lastRefresh: {}, updatedAt: new Date(0).toISOString() };
  }
}

export function saveRefreshState(state: RefreshState, root = '.'): void {
  const path = getRefreshStatePath(root);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Anthropic API ──────────────────────────────────────────────────────────

interface AnthropicModel {
  id: string;
  display_name?: string;
}

interface AnthropicModelsResponse {
  data?: AnthropicModel[];
}

async function fetchAnthropicModels(
  apiKey: string,
  registry: ModelRegistry,
  timeoutMs: number,
): Promise<{ found: number; added: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new DeckentError('E_PROVIDER_HTTP_ERROR', `HTTP ${res.status}`);
    const json = await res.json() as AnthropicModelsResponse;
    const models = Array.isArray(json.data) ? json.data : [];
    let added = 0;
    for (const m of models) {
      if (!m.id) continue;
      // Skip if already tracked (by id or by apiId match)
      if (registry.has(m.id)) continue;
      if (registry.getAllModels().some(r => r.apiId === m.id)) continue;
      registry.register({
        id: m.id,
        apiId: m.id,
        provider: 'claude',
        tier: 'standard',
        contextWindow: 200_000,
        costPerMillion: { input: 3, output: 15 },
        capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
        status: 'preview',
      });
      added++;
    }
    return { found: models.length, added };
  } finally {
    clearTimeout(timer);
  }
}

// ─── OpenAI API ─────────────────────────────────────────────────────────────

interface OpenAIModel {
  id: string;
  object?: string;
}

interface OpenAIModelsResponse {
  data?: OpenAIModel[];
}

async function fetchOpenAIModels(
  apiKey: string,
  registry: ModelRegistry,
  timeoutMs: number,
): Promise<{ found: number; added: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new DeckentError('E_PROVIDER_HTTP_ERROR', `HTTP ${res.status}`);
    const json = await res.json() as OpenAIModelsResponse;
    const models = Array.isArray(json.data) ? json.data : [];
    let added = 0;
    for (const m of models) {
      if (!m.id) continue;
      if (registry.has(m.id)) continue;
      if (registry.getAllModels().some(r => r.apiId === m.id)) continue;
      registry.register({
        id: m.id,
        apiId: m.id,
        provider: 'codex',
        tier: 'standard',
        contextWindow: 128_000,
        costPerMillion: { input: 2, output: 8 },
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
        status: 'preview',
      });
      added++;
    }
    return { found: models.length, added };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini API ─────────────────────────────────────────────────────────────

interface GeminiModel {
  name?: string;
}

interface GeminiModelsResponse {
  models?: GeminiModel[];
}

async function fetchGeminiModels(
  apiKey: string,
  registry: ModelRegistry,
  timeoutMs: number,
): Promise<{ found: number; added: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new DeckentError('E_PROVIDER_HTTP_ERROR', `HTTP ${res.status}`);
    const json = await res.json() as GeminiModelsResponse;
    const models = Array.isArray(json.models) ? json.models : [];
    let added = 0;
    for (const m of models) {
      // "models/gemini-2.5-flash" → "gemini-2.5-flash"
      const apiId = m.name?.replace('models/', '') ?? '';
      if (!apiId) continue;
      if (registry.has(apiId)) continue;
      if (registry.getAllModels().some(r => r.apiId === apiId)) continue;
      registry.register({
        id: apiId,
        apiId,
        provider: 'gemini',
        tier: 'standard',
        contextWindow: 1_000_000,
        costPerMillion: { input: 0.15, output: 0.6 },
        capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
        status: 'preview',
      });
      added++;
    }
    return { found: models.length, added };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function refreshProvider(
  provider: RegistryProviderName,
  registry: ModelRegistry,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timestamp = Date.now();

  try {
    if (provider === 'claude') {
      const apiKey = options.anthropicApiKey
        ?? process.env['DECKENT_ANTHROPIC_API_KEY']
        ?? process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        return {
          provider, success: false, modelsFound: 0, modelsAdded: 0, timestamp,
          skippedReason: 'No ANTHROPIC_API_KEY — subscription-only users: set API key for remote model refresh',
        };
      }
      const { found, added } = await fetchAnthropicModels(apiKey, registry, timeoutMs);
      registry.setLastRefresh(provider, timestamp);
      return { provider, success: true, modelsFound: found, modelsAdded: added, timestamp };
    }

    if (provider === 'codex') {
      const apiKey = options.openaiApiKey
        ?? process.env['DECKENT_OPENAI_API_KEY']
        ?? process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        return {
          provider, success: false, modelsFound: 0, modelsAdded: 0, timestamp,
          skippedReason: 'No OPENAI_API_KEY — set API key for remote model refresh',
        };
      }
      const { found, added } = await fetchOpenAIModels(apiKey, registry, timeoutMs);
      registry.setLastRefresh(provider, timestamp);
      return { provider, success: true, modelsFound: found, modelsAdded: added, timestamp };
    }

    if (provider === 'gemini') {
      const apiKey = options.geminiApiKey
        ?? process.env['DECKENT_GOOGLE_API_KEY']
        ?? process.env['GOOGLE_API_KEY']
        ?? process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        return {
          provider, success: false, modelsFound: 0, modelsAdded: 0, timestamp,
          skippedReason: 'No GEMINI_API_KEY/GOOGLE_API_KEY — set API key for remote model refresh',
        };
      }
      const { found, added } = await fetchGeminiModels(apiKey, registry, timeoutMs);
      registry.setLastRefresh(provider, timestamp);
      return { provider, success: true, modelsFound: found, modelsAdded: added, timestamp };
    }

    return { provider, success: false, modelsFound: 0, modelsAdded: 0, timestamp, skippedReason: 'Unknown provider' };
  } catch (err) {
    return {
      provider, success: false, modelsFound: 0, modelsAdded: 0, timestamp,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function refreshAllProviders(
  registry: ModelRegistry,
  options: RefreshOptions = {},
): Promise<Record<RegistryProviderName, RefreshResult>> {
  const [claude, codex, gemini] = await Promise.all([
    refreshProvider('claude', registry, options),
    refreshProvider('codex', registry, options),
    refreshProvider('gemini', registry, options),
  ]);
  return { claude, codex, gemini };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function formatRefreshAge(timestamp: number): string {
  if (!timestamp) return 'never';
  const ageMs = Date.now() - timestamp;
  if (ageMs < 60_000) return 'Just now';
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 1) return `${Math.floor(ageMs / 60_000)} minutes ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
