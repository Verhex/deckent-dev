import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelType, GeminiModel } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions, TaskEffort } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import type { ModelTier } from '../core/model-equivalence.js';
import { getModelForProviderTier } from '../core/model-equivalence.js';
import { modelRegistry } from '../core/model-registry.js';

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_MODELS: readonly GeminiModel[] = modelRegistry
  .getByProvider('gemini')
  .map(m => m.id as GeminiModel);

/**
 * Tier-based model mapping for Gemini CLI.
 * @deprecated Derived from model-equivalence.ts — use adapter.getModelForTier() instead.
 * Kept for backward compatibility with existing imports.
 */
export const GEMINI_TIER_MODELS = {
  get premium_plus() { return (modelRegistry.getByProviderAndTier('gemini', 'premium_plus')?.id ?? getModelForProviderTier('gemini', 'premium') ?? 'gemini-2.5-pro') as GeminiModel; },
  get premium() { return (getModelForProviderTier('gemini', 'premium') ?? 'gemini-2.5-pro') as GeminiModel; },
  get standard() { return (getModelForProviderTier('gemini', 'standard') ?? 'gemini-2.5-flash') as GeminiModel; },
  get economy() { return (getModelForProviderTier('gemini', 'economy') ?? 'gemini-2.0-flash') as GeminiModel; },
};

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Auth header name per official Google AI docs (used by REST API fallback) */
export const GEMINI_AUTH_HEADER = 'x-goog-api-key';

/** Auth modes supported by Gemini CLI */
export type GeminiAuthMode = 'api_key' | 'oauth' | 'vertex' | 'cloud_shell' | 'none';

/** Structured auth detection result for doctor and observability surfaces */
export interface GeminiAuthDetails {
  mode: GeminiAuthMode;
  source: string;
  ready: boolean;
  hint?: string;
}

// ─── Gemini CLI Output Parser ────────────────────────────────────────

/**
 * Parse stdout from `gemini -p ... --output-format json` or `--output-format stream-json`.
 * The Gemini CLI returns structured JSON with the response text and optional usage stats.
 *
 * For `stream-json` format, output is newline-delimited JSON (NDJSON) where each line
 * is a separate JSON object with partial response chunks. This function concatenates
 * all chunks into a single response.
 */
export function parseGeminiOutput(stdout: string): {
  response: string;
  stats?: { inputTokens: number; outputTokens: number };
} {
  if (!stdout.trim()) {
    return { response: '' };
  }

  // Try stream-json (NDJSON) format first: multiple JSON lines
  const lines = stdout.trim().split('\n').filter(l => l.trim());
  if (lines.length > 1) {
    const streamResult = tryParseStreamJson(lines);
    if (streamResult) return streamResult;
  }

  try {
    const parsed = JSON.parse(stdout);

    // Gemini CLI --output-format json typically returns { response, candidates, usageMetadata }
    const response =
      parsed?.response ??
      parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
      (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));

    let stats: { inputTokens: number; outputTokens: number } | undefined;
    const usage = parsed?.usageMetadata;
    if (usage && typeof usage.promptTokenCount === 'number' && typeof usage.candidatesTokenCount === 'number') {
      stats = {
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
      };
    }

    return { response, stats };
  } catch {
    // If not valid JSON, treat the entire stdout as plain text response
    return { response: stdout.trim() };
  }
}

/**
 * Try to parse NDJSON (stream-json) output from Gemini CLI.
 * Each line is a JSON chunk with partial text and optional usage metadata.
 * Returns null if the lines are not valid NDJSON.
 */
function tryParseStreamJson(
  lines: string[],
): { response: string; stats?: { inputTokens: number; outputTokens: number } } | null {
  const chunks: string[] = [];
  let lastUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Extract text from each chunk
      const text =
        parsed?.response ??
        parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
        (typeof parsed === 'string' ? parsed : undefined);
      if (text) chunks.push(text);

      // Keep last usage metadata (final chunk typically has totals)
      if (parsed?.usageMetadata) {
        lastUsage = parsed.usageMetadata;
      }
    } catch {
      // Not valid JSON line — this is not NDJSON format
      return null;
    }
  }

  let stats: { inputTokens: number; outputTokens: number } | undefined;
  if (
    lastUsage &&
    typeof lastUsage.promptTokenCount === 'number' &&
    typeof lastUsage.candidatesTokenCount === 'number'
  ) {
    stats = {
      inputTokens: lastUsage.promptTokenCount,
      outputTokens: lastUsage.candidatesTokenCount,
    };
  }

  return { response: chunks.join(''), stats };
}

// ─── Worker Entry ────────────────────────────────────────────────────

interface GeminiWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  model: GeminiModel;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── GeminiAdapter ───────────────────────────────────────────────────

/**
 * GeminiAdapter — ProviderAdapter implementation for Google Gemini CLI.
 *
 * Uses the `gemini` CLI binary with `-p` flag for headless/non-interactive mode
 * and `--output-format json` for structured output parsing.
 *
 * Requires: `gemini` CLI installed + GOOGLE_API_KEY or DECKENT_GOOGLE_API_KEY env variable.
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini';
  readonly supportedModels: readonly ModelType[] = GEMINI_MODELS;

  private readonly projectDir: string;
  private readonly workers = new Map<string, GeminiWorkerEntry>();

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout) */
  protected defaultTimeoutMs: number;

  constructor(projectDir: string, opts?: { defaultTimeoutMs?: number }) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
  }

  // ─── spawn() ───────────────────────────────────────────────────────

  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(
        `Worker for task "${taskId}" is already running`,
        this.name,
      );
    }

    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for Gemini provider. Supported: ${GEMINI_MODELS.join(', ')}`,
        this.name,
      );
    }

    const auth = this.getAuthDetails();
    if (!auth.ready) {
      throw new ProviderError(
        `Gemini auth not configured: ${auth.hint ?? 'no credentials found'}`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    // Build args for the Gemini CLI
    const args = this.buildArgs(model, prompt);

    // Build env per auth mode:
    //   api_key → inject GEMINI_API_KEY + GOOGLE_API_KEY (CLI accepts both)
    //   oauth/vertex/cloud_shell → leave env clean, CLI reads cached creds
    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (auth.mode === 'api_key') {
      const apiKey = this.getApiKey();
      if (apiKey) {
        if (!spawnEnv.GEMINI_API_KEY) spawnEnv.GEMINI_API_KEY = apiKey;
        if (!spawnEnv.GOOGLE_API_KEY) spawnEnv.GOOGLE_API_KEY = apiKey;
      }
    }

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['pipe', logFd, logFd],
      env: spawnEnv,
    };

    const child = spawn('gemini', args, spawnOpts);
    closeSync(logFd);

    // Write heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: GeminiWorkerEntry = {
      taskId,
      process: child,
      logPath,
      model: model as GeminiModel,
      spawnedAt: new Date().toISOString(),
    };

    // Set up timeout if configured
    const timeout = this.defaultTimeoutMs;
    if (timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
    }

    this.workers.set(taskId, entry);

    // Cleanup on exit
    child.once('exit', () => {
      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  // ─── kill() ────────────────────────────────────────────────────────

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  // ─── listWorkers() ─────────────────────────────────────────────────

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    // Check 1: gemini CLI must be installed
    if (!this.isCliInstalled()) {
      return false;
    }
    // Check 2: API key must be set
    return this.getApiKey() !== undefined;
  }

  // ─── buildArgs() ───────────────────────────────────────────────────

  /**
   * Build CLI arguments for `gemini` binary invocation.
   * Uses `-p` flag for headless/non-interactive mode.
   * Uses `-m` short flag (Gemini CLI docs: `-m gemini-2.5-flash`).
   * Adds `--approval-mode plan` for read-only execution.
   * Adds `--skip-trust` so the worker's containerized cwd (e.g. /workspace)
   * doesn't trip Gemini's trusted-folders check, which silently overrides
   * approval-mode → 'default' and then hangs waiting for interactive approval.
   */
  buildArgs(model: ModelType, prompt: string): string[] {
    return ['-p', prompt, '--output-format', 'json', '-m', model, '--approval-mode', 'plan', '--skip-trust'];
  }

  // ─── buildCommand() ────────────────────────────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    _opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    return `gemini -p "$(cat ${promptPath})" --output-format json -m ${model} --approval-mode plan --skip-trust`;
  }

  /**
   * Build a curl command for the streaming endpoint (REST API fallback).
   */
  buildStreamCommand(
    model: ModelType,
    promptPath: string,
  ): string {
    const apiKey = this.getApiKey() ?? '<GOOGLE_API_KEY>';
    const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
    return `curl -s --no-buffer -X POST "${url}" -H "Content-Type: application/json" -H "${GEMINI_AUTH_HEADER}: ${apiKey}" -d @${promptPath}`;
  }

  // ─── buildPlannerCommand() ─────────────────────────────────────────

  /**
   * Build CLI command + args for planner invocations.
   * Uses the Gemini CLI binary with -p flag.
   */
  buildPlannerCommand(prompt: string, model: ModelType): { command: string; args: string[] } {
    return {
      command: 'gemini',
      args: this.buildArgs(model, prompt),
    };
  }

  // ─── validateApiKey() ───────────────────────────────────────────────

  /**
   * Basic validation of GOOGLE_API_KEY format.
   * Google AI API keys are typically 39 characters starting with "AIza".
   */
  validateApiKey(): { valid: boolean; reason: string } {
    const key = this.getApiKey();
    if (!key) {
      return { valid: false, reason: 'GOOGLE_API_KEY is not set' };
    }
    if (key.length < 10) {
      return { valid: false, reason: 'API key is too short' };
    }
    if (!key.startsWith('AIza') && key.length < 30) {
      return { valid: false, reason: 'API key does not match expected Google AI format (AIza...)' };
    }
    return { valid: true, reason: 'API key format looks valid' };
  }

  // ─── getModelForTier() ─────────────────────────────────────────────

  /**
   * Get the recommended Gemini model for a given capability tier.
   * Delegates to model-equivalence.ts as the single source of truth.
   */
  getModelForTier(tier: ModelTier): GeminiModel {
    return (getModelForProviderTier('gemini', tier) ?? 'gemini-2.5-flash') as GeminiModel;
  }

  // ─── getCliVersion() ──────────────────────────────────────────────

  /**
   * Get the installed Gemini CLI version string.
   * Returns undefined if the CLI is not installed or version cannot be determined.
   */
  getCliVersion(): string | undefined {
    try {
      const result = spawnSync('gemini', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (result.status === 0 && result.stdout) {
        return result.stdout.trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  /**
   * Build inline Node.js script that calls the Gemini REST API via fetch.
   * Auth is sent via x-goog-api-key header per official Google AI docs.
   * @deprecated Use buildArgs() + Gemini CLI instead. Kept for REST API fallback.
   */
  buildApiScript(apiUrl: string, apiKey: string, prompt: string): string {
    // Escape prompt for embedding in a JS string literal
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');

    return [
      `const body = JSON.stringify({`,
      `  contents: [{ parts: [{ text: '${escapedPrompt}' }] }],`,
      `  generationConfig: { maxOutputTokens: 65536 }`,
      `});`,
      `fetch('${apiUrl}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Content-Type': 'application/json',`,
      `    '${GEMINI_AUTH_HEADER}': '${apiKey}'`,
      `  },`,
      `  body`,
      `}).then(r => r.json()).then(d => {`,
      `  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(d);`,
      `  process.stdout.write(text);`,
      `}).catch(e => { process.stderr.write(e.message); process.exit(1); });`,
    ].join('\n');
  }

  /**
   * Build inline Node.js script that calls the Gemini streaming API via SSE.
   * Uses streamGenerateContent?alt=sse endpoint per official docs.
   * @deprecated Use Gemini CLI instead. Kept for REST API fallback.
   */
  buildStreamingApiScript(model: string, apiKey: string, prompt: string): string {
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');

    const streamUrl = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;

    return [
      `const body = JSON.stringify({`,
      `  contents: [{ parts: [{ text: '${escapedPrompt}' }] }],`,
      `  generationConfig: { maxOutputTokens: 65536 }`,
      `});`,
      `fetch('${streamUrl}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Content-Type': 'application/json',`,
      `    '${GEMINI_AUTH_HEADER}': '${apiKey}'`,
      `  },`,
      `  body`,
      `}).then(async r => {`,
      `  const reader = r.body.getReader();`,
      `  const decoder = new TextDecoder();`,
      `  let buf = '';`,
      `  while (true) {`,
      `    const { done, value } = await reader.read();`,
      `    if (done) break;`,
      `    buf += decoder.decode(value, { stream: true });`,
      `    const lines = buf.split('\\n');`,
      `    buf = lines.pop();`,
      `    for (const line of lines) {`,
      `      if (line.startsWith('data: ')) {`,
      `        try {`,
      `          const d = JSON.parse(line.slice(6));`,
      `          const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;`,
      `          if (text) process.stdout.write(text);`,
      `        } catch {}`,
      `      }`,
      `    }`,
      `  }`,
      `}).catch(e => { process.stderr.write(e.message); process.exit(1); });`,
    ].join('\n');
  }

  /**
   * Check if the `gemini` CLI binary is installed and accessible.
   */
  isCliInstalled(): boolean {
    try {
      const result = spawnSync('gemini', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private isSupportedModel(model: ModelType): model is GeminiModel {
    return (GEMINI_MODELS as readonly string[]).includes(model);
  }

  getApiKey(): string | undefined {
    return (
      process.env.DECKENT_GOOGLE_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      process.env.GEMINI_API_KEY
    );
  }

  /**
   * Detect the active auth mode for Gemini CLI.
   *
   * Resolution order:
   *   1. ~/.gemini/settings.json → security.auth.selectedType (explicit user choice)
   *   2. ~/.gemini/oauth_creds.json present → cached OAuth login
   *   3. Env var (DECKENT_GOOGLE_API_KEY | GOOGLE_API_KEY | GEMINI_API_KEY)
   *   4. 'none'
   *
   * `oauth-personal` covers both free Code Assist license and AI Pro/Ultra subs;
   * Google routes quota by Google account, not by selectedType.
   */
  detectAuthMode(): GeminiAuthMode {
    try {
      const settingsPath = join(homedir(), '.gemini', 'settings.json');
      if (existsSync(settingsPath)) {
        const raw = readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(raw) as { security?: { auth?: { selectedType?: string } } };
        const sel = settings.security?.auth?.selectedType;
        if (sel === 'oauth-personal') return 'oauth';
        if (sel === 'gemini-api-key') return 'api_key';
        if (sel === 'vertex-ai') return 'vertex';
        if (sel === 'cloud-shell') return 'cloud_shell';
      }
    } catch {
      // settings.json unreadable or malformed → fall through to file/env probes
    }

    if (existsSync(join(homedir(), '.gemini', 'oauth_creds.json'))) {
      return 'oauth';
    }

    if (this.getApiKey()) return 'api_key';

    return 'none';
  }

  /**
   * Translate effort — Gemini CLI has no equivalent flag (model handles internally).
   * Sprint 154 Faz C: returns [] so callers can concat without conditional branching.
   * Effort hints get encoded into the prompt by upstream code if the user wants
   * influence over reasoning depth.
   */
  translateEffort(_effort: TaskEffort, _model: ModelType): string[] {
    return [];
  }

  /** Structured auth detail for `deckent doctor` and observability surfaces. */
  getAuthDetails(): GeminiAuthDetails {
    const mode = this.detectAuthMode();
    switch (mode) {
      case 'oauth':
        return { mode, source: '~/.gemini/oauth_creds.json (Google login)', ready: true };
      case 'api_key': {
        const src = process.env.DECKENT_GOOGLE_API_KEY
          ? 'DECKENT_GOOGLE_API_KEY'
          : process.env.GOOGLE_API_KEY
            ? 'GOOGLE_API_KEY'
            : 'GEMINI_API_KEY';
        return { mode, source: `env: ${src}`, ready: true };
      }
      case 'vertex':
        return { mode, source: 'Vertex AI (settings.json)', ready: true };
      case 'cloud_shell':
        return { mode, source: 'Google Cloud Shell', ready: true };
      case 'none':
      default:
        return {
          mode: 'none',
          source: 'unconfigured',
          ready: false,
          hint: 'Run `gemini` to login OR set GEMINI_API_KEY / GOOGLE_API_KEY',
        };
    }
  }

  /**
   * Get the streaming endpoint URL for a given model.
   */
  getStreamingEndpoint(model: string): string {
    return `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
  }

  /**
   * Get the standard (non-streaming) endpoint URL for a given model.
   */
  getEndpoint(model: string): string {
    return `${GEMINI_API_BASE}/${model}:generateContent`;
  }

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) {
      throw new ProviderError(
        `No running worker for task "${taskId}"`,
        this.name,
      );
    }
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    entry.process.kill(signal);
    this.workers.delete(taskId);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────

  protected writeHeartbeat(taskId: string, dir: string, status: string): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `gemini-${taskId}`,
      taskId,
      status,
      currentAction: 'Gemini CLI worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }

  // ─── Accessors (for testing/subclassing) ───────────────────────────

  getWorkerEntry(taskId: string): GeminiWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create a GeminiAdapter instance for the given project directory.
 */
export function createGeminiAdapter(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number },
): GeminiAdapter {
  return new GeminiAdapter(projectDir, opts);
}
