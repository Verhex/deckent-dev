// ═══ Provider Fallback — Capacity Error Detection ═══════════════════
// Pure utility module for Sprint 155 Task 1 (Runtime Fallback Chain).
//
// Detects 429/capacity/quota error patterns in worker output and proposes
// a fallback provider swap. No side effects — every function is pure and
// can be tested in isolation.
//
// ADR-008 compliance: lives in src/core/, never imports from orchestra/.
// Sprint 154 Faz B left provider_auth advisory; Sprint 155 Task 1 wires
// the runtime side of the fallback chain that doctor's
// `checkFallbackProviderGap()` already warns about at config time.
//
// Live evidence motivating the regex tables:
//   - Sprint 154: `gemini-2.5-flash` returned
//     "No capacity available for model gemini-2.5-flash on the server".
//   - OpenAI: `error: rate_limit_exceeded` and bare `429` HTTP errors.
//   - Anthropic: `overloaded_error` (HTTP 529) under load.

import type { ProviderName } from './task-types.js';

// ─── Constants ─────────────────────────────────────────────────────

/**
 * Maximum number of fallback retries permitted per task.
 *
 * 1 means: original attempt + 1 fallback attempt = 2 total tries. We never
 * chain fallback-of-fallback because the most common cause is provider
 * capacity, and a third attempt against the same chain is unlikely to
 * succeed before timing out the sprint.
 */
export const MAX_FALLBACK_RETRIES = 1;

// ─── Detection ─────────────────────────────────────────────────────

/**
 * Result of scanning a worker's output for capacity error signals.
 *
 * `provider` is the provider whose error was detected (e.g. capacity
 * pattern matched a Gemini-specific phrase). It is `null` when the
 * detection only matched a generic HTTP 429 / quota signal that cannot
 * be attributed to a specific provider.
 */
export interface CapacityErrorDetection {
  /** Whether a capacity/429/quota error pattern was detected */
  hit: boolean;
  /** Human-readable reason describing which pattern matched */
  reason: string;
  /** Provider attributed by the matching pattern, if discriminable */
  provider: ProviderName | null;
}

/**
 * Per-provider capacity-error patterns.
 *
 * The patterns are intentionally narrow — they must match real provider
 * error strings observed in production output, not generic phrases like
 * "error" or "failed". Each entry's `name` is for debugging only.
 */
interface ProviderPatternSet {
  provider: ProviderName;
  patterns: ReadonlyArray<{ name: string; regex: RegExp }>;
}

const PROVIDER_PATTERNS: ReadonlyArray<ProviderPatternSet> = [
  {
    provider: 'gemini',
    patterns: [
      { name: 'no_capacity', regex: /no\s+capacity\s+available\s+for\s+model/i },
      { name: 'resource_exhausted', regex: /RESOURCE_EXHAUSTED/ },
      { name: 'gemini_quota', regex: /gemini.*quota.*exceeded/i },
    ],
  },
  {
    provider: 'codex',
    patterns: [
      { name: 'openai_rate_limit', regex: /rate_limit_exceeded/i },
      { name: 'openai_quota', regex: /insufficient_quota/i },
      { name: 'openai_429_text', regex: /openai.*\b429\b/i },
      { name: 'openai_tpm', regex: /tokens?\s+per\s+minute.*exceeded/i },
    ],
  },
  {
    provider: 'claude',
    patterns: [
      { name: 'overloaded_error', regex: /overloaded_error/i },
      { name: 'anthropic_529', regex: /anthropic.*\b529\b/i },
      { name: 'claude_overloaded', regex: /claude.*overloaded/i },
    ],
  },
];

/**
 * Generic capacity/rate-limit signals that cannot be attributed to a
 * specific provider. When one of these matches but no provider-specific
 * pattern matches, `provider` in the detection is `null` — the caller
 * (sprint-controller) is then expected to look at `task.provider` to
 * pick a fallback that differs from it.
 */
const GENERIC_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'http_429', regex: /\bHTTP\s+429\b/i },
  { name: 'status_429', regex: /\bstatus\s*[:=]?\s*429\b/i },
  { name: 'too_many_requests', regex: /too\s+many\s+requests/i },
  { name: 'quota_exceeded', regex: /quota\s+exceeded/i },
  { name: 'capacity_exceeded', regex: /capacity\s+exceeded/i },
];

/**
 * Detect whether a worker's output contains a 429/capacity/quota error.
 *
 * The function scans the entire string against per-provider regex tables
 * first; if no provider-specific match is found, it falls back to generic
 * HTTP/429 patterns. Returns the first match (provider-specific patterns
 * take precedence over generic ones).
 *
 * Pure function — no I/O, no globals, no allocation outside the return.
 *
 * @param workerOutput Raw worker output string (notes + errorOutput concat).
 *                     Empty/undefined input returns `{ hit: false }` immediately.
 */
export function detectCapacityError(workerOutput: string | undefined | null): CapacityErrorDetection {
  if (!workerOutput || workerOutput.length === 0) {
    return { hit: false, reason: 'empty worker output', provider: null };
  }

  for (const set of PROVIDER_PATTERNS) {
    for (const { name, regex } of set.patterns) {
      if (regex.test(workerOutput)) {
        return {
          hit: true,
          reason: `${set.provider} capacity error detected (pattern: ${name})`,
          provider: set.provider,
        };
      }
    }
  }

  for (const { name, regex } of GENERIC_PATTERNS) {
    if (regex.test(workerOutput)) {
      return {
        hit: true,
        reason: `generic capacity/rate-limit error detected (pattern: ${name})`,
        provider: null,
      };
    }
  }

  return { hit: false, reason: 'no capacity error pattern matched', provider: null };
}

// ─── Fallback Selection ─────────────────────────────────────────────

/**
 * Select a fallback provider given the current provider and the configured
 * fallback. Refuses to return a provider that equals the current one
 * (would cause a self-loop and waste a retry slot).
 *
 * Returns `null` when:
 *   - `fallbackProvider` is unset (config gap — doctor warning already fired)
 *   - `fallbackProvider === currentProvider` (no-op fallback)
 *
 * @param currentProvider Provider used on the original failed attempt.
 * @param fallbackProvider Configured fallback from `config.fallback_provider`.
 */
export function selectFallbackProvider(
  currentProvider: ProviderName | undefined,
  fallbackProvider: ProviderName | undefined,
): ProviderName | null {
  if (!fallbackProvider) return null;
  if (fallbackProvider === currentProvider) return null;
  return fallbackProvider;
}

// ─── High-Level Decision ────────────────────────────────────────────

/**
 * Combined retry decision: scans worker output for capacity errors and
 * resolves the fallback provider in one call. Used by result-evaluator
 * to emit a `RetryWithFallback` signal.
 *
 * Returns `null` when no fallback retry should occur (no capacity error,
 * or no eligible fallback).
 */
export interface FallbackRetryDecision {
  /** Provider to swap the task to for the retry */
  targetProvider: ProviderName;
  /** Reason from detectCapacityError */
  reason: string;
  /** Provider attributed by the detection (may be null for generic 429s) */
  detectedProvider: ProviderName | null;
}

/**
 * Decide whether a failed task should be retried with the fallback provider.
 *
 * @param workerOutput   Concatenated worker notes + error output to scan.
 * @param currentProvider Provider used on the failed attempt.
 * @param fallbackProvider Configured fallback (from config.fallback_provider).
 * @returns FallbackRetryDecision when retry is warranted, null otherwise.
 */
export function decideFallbackRetry(
  workerOutput: string | undefined | null,
  currentProvider: ProviderName | undefined,
  fallbackProvider: ProviderName | undefined,
): FallbackRetryDecision | null {
  const detection = detectCapacityError(workerOutput);
  if (!detection.hit) return null;

  const target = selectFallbackProvider(currentProvider, fallbackProvider);
  if (!target) return null;

  return {
    targetProvider: target,
    reason: detection.reason,
    detectedProvider: detection.provider,
  };
}
