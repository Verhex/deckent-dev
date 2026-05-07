import { ProviderError } from './provider.js';
import type { ProviderAuthMode } from './config-migration.js';

// Re-export the config type so callers only need one import
export type { ProviderAuthMode };

/** Normalized subset used internally: raw provider modes collapsed to these three. */
export type NormalizedAuthMode = 'api_key' | 'subscription' | 'none';

/** The two satisfiable modes (excludes 'none'). */
export type ResolvedAuthMode = 'api_key' | 'subscription';

/**
 * Resolve effective auth mode by combining configured preference with runtime-detected state.
 *
 * Rules:
 * - 'auto' or undefined → delegate to detectedMode (throw if 'none')
 * - 'api_key' → enforce: throw if detected != 'api_key'
 * - 'subscription' → enforce: throw if detected != 'subscription'
 *
 * Conflict = ProviderError fail-fast. Doctor surfaces config warnings before this point.
 *
 * @param configuredMode - Explicit mode from provider_auth config, or undefined/'auto' for auto
 * @param detectedMode   - Runtime-detected normalized auth mode
 * @param providerName   - Provider name for error messages
 */
export function resolveAuthMode(
  configuredMode: ProviderAuthMode | undefined,
  detectedMode: NormalizedAuthMode,
  providerName: string,
): ResolvedAuthMode {
  if (!configuredMode || configuredMode === 'auto') {
    if (detectedMode === 'none') {
      throw new ProviderError(
        `Provider "${providerName}" has no auth configured. ` +
          'Set an API key env var or run provider login, then retry. ' +
          'Run "deckent doctor" for guidance.',
        providerName,
      );
    }
    return detectedMode;
  }

  if (configuredMode === 'api_key') {
    if (detectedMode !== 'api_key') {
      const reason =
        detectedMode === 'subscription'
          ? 'subscription auth is active but no API key env var was found'
          : 'no API key env var was found';
      throw new ProviderError(
        `Provider "${providerName}" is configured for api_key mode but ${reason}. ` +
          'Set the API key env var or change provider_auth.mode to "subscription" in config. ' +
          'Run "deckent doctor" for guidance.',
        providerName,
      );
    }
    return 'api_key';
  }

  // configuredMode === 'subscription'
  if (detectedMode !== 'subscription') {
    const reason =
      detectedMode === 'api_key'
        ? 'only API key auth is available — no OAuth or subscription session was found'
        : 'no OAuth or subscription session was found';
    throw new ProviderError(
      `Provider "${providerName}" is configured for subscription mode but ${reason}. ` +
        'Run provider login or change provider_auth.mode to "api_key" in config. ' +
        'Run "deckent doctor" for guidance.',
      providerName,
    );
  }

  return 'subscription';
}
