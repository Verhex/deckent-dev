# Auth Surface Checklist

> **Purpose:** When adding a new auth mode to a provider adapter (or refactoring an existing one), this checklist names every cross-cutting touchpoint that must stay synchronized. Sprint 154–157 created three hidden regressions because a symmetric `detectAuthMode()` was added without updating five other files that consumed the auth signal — this document exists to prevent that.

**Created:** Sprint 157 (commit `b4df0e2`).
**Status:** Living document — extend whenever a new auth path is added.

---

## The 7 surfaces

Adding an auth path to a provider (e.g., OAuth, subscription, API key, Vertex, Cloud Shell) means **all seven** of the following must be updated together. Each was a Sprint 154-era miss that took 3 sprints to discover and fix.

### 1. Adapter `detectAuthMode()`

**File:** `src/providers/{claude,gemini,codex}.ts`

Returns the active auth mode by inspecting env vars + cached creds + settings files. Ground truth for everything below.

```typescript
detectAuthMode(): AuthMode {
  // 1. settings.json selectedType
  // 2. cached creds presence
  // 3. env var fallback
  // 4. 'none'
}
```

### 2. Adapter `isAvailable()` — **Sprint 156 fix `60566eb`**

**File:** same adapter file.

`isAvailable()` decides whether the pre-spawn task-router considers the provider usable. It must accept **any** auth mode reported by `detectAuthMode()`, not just API-key.

❌ Pre-fix:
```typescript
return this.getApiKey() !== undefined; // OAuth-only users get rerouted to fallback
```

✅ Post-fix:
```typescript
return this.detectAuthMode() !== 'none';
```

### 3. Adapter `getAuthDetails()` (observability)

**File:** same adapter file.

Returns a structured `{ mode, source, ready, hint? }` for `deckent doctor` and observability surfaces. Must enumerate every mode `detectAuthMode()` can return.

### 4. Adapter `spawn()` — env injection branch

**File:** same adapter file.

When `mode === 'api_key'`, inject API key env vars. When `mode === 'subscription'`/`oauth`/etc., **strip** them so the CLI uses cached creds (Codex specifically: cached subscription tokens get masked if `OPENAI_API_KEY` is also set in env). The `authConfig` enforcement path (Sprint 155) wraps this with hard mode enforcement when explicitly configured.

### 5. Doctor `checkX()` + `checkProviderAuthConsistency()`

**File:** `src/cli/commands/doctor-checks.ts`

Two checks that mirror `detectAuthMode()`:

- `checkClaude` / `checkGemini` / `checkCodex`: surface auth mode in human-readable form.
- `checkProviderAuthConsistency(authMap)`: compare configured `provider_auth.{name}.mode` (Sprint 154 Faz B) against detected mode, emit `configured=X but detected=Y` failure when they diverge.

If you add a new mode, both functions must recognize it and stop falling through to `'none'`.

### 6. `model-selector.ts` `resolveTaskModel()` provider default — **Sprint 157 fix `b4df0e2`**

**File:** `src/orchestra/model-selector.ts`

When `forceModel` is set but `provider` is not, the function previously defaulted `targetProvider = 'claude'`, then ran `getEquivalentModel(forceModel, 'claude')`, silently mapping `gemini-2.5-flash` → `sonnet`.

✅ Fix: infer `provider` from `forceModel` via `PROVIDER_MODEL_MAP` when not passed. New `inferProviderFromModelLocal()` helper in the same file.

### 7. `sprint-planner.ts` provider hop — **Sprint 157 fix `b4df0e2`**

**File:** `src/orchestra/sprint-planner.ts`

`parseStructuredDirectives()` correctly extracts `parsedProvider` and returns it on each task source (line 519). But the planner's structured loop dropped `src.provider` at the `createTask()` and `resolveTaskModel()` calls.

✅ Fix: `directiveSources` type extended with `provider?`, and both calls now pass `src.provider` through.

---

## Bonus surface: spawn-backend-docker.ts cred mounts

**File:** `src/orchestra/spawn-backend-docker.ts`

Each provider's cached cred dir must be mounted into the container HOME — and **rw**, not ro (Gemini CLI refreshes `oauth_creds.json` on token expiry; ro mount triggers `EROFS` hang).

```typescript
...(existsSync(join(home, '.gemini'))
  ? ['-v', `${join(home, '.gemini')}:${containerHome}/.gemini`]
  : []),
```

If you add a new provider with subscription auth, mirror this block.

---

## Validation playbook

After modifying any adapter's auth surface:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Adapter unit tests
npx vitest run tests/providers

# 3. Doctor live check
npx deckent doctor --json | jq '.checks[] | select(.name | contains("CLI") or contains("Auth"))'

# 4. Pre-spawn routing dry-run
echo "## Task X: smoke
- Model: <new-provider-model>
- Effort: low
" > /tmp/dr.md
cp DIRECTIVES.md /tmp/dr.bak && cp /tmp/dr.md DIRECTIVES.md
npx deckent plan --no-confirm --dry-run | grep "Model"  # Expected: <new-provider-model>, NOT silently mapped
cp /tmp/dr.bak DIRECTIVES.md

# 5. End-to-end smoke
npx deckent run "smoke" --model <new-provider-model> --timeout 60000 --verbose 2>&1 | grep -i "provider\|endpoint"
# Verify: tokenUsage.provider in .result matches expected provider
```

---

## Historical context — why this exists

**Sprint 148** claimed gate #8 (Multi-provider 3/3) PASS based on adapter-level unit tests. Sprint 154 went to validate this at Docker-backend live E2E and found `spawn-backend-docker.ts` was hardcoded to `claude` regardless of model — gate #8 reopened.

Sprint 154 fixed the Docker command builder + added Gemini OAuth detection. **But it missed five other surfaces that consumed the auth signal.** Sprint 156 dogfood (intended to validate Gemini at sprint scale) silently ran on Claude because `isAvailable()` returned false for OAuth-only users — discovered only by inspecting `tokenUsage.provider` in result files. Sprint 157 traced the *next* surface inward and found the same pattern at `model-selector.ts` and `sprint-planner.ts`.

**Lesson:** auth refactors are inherently cross-cutting. A `detectAuthMode()` change alters the trust boundary and every consumer must be updated atomically.

This checklist is the canonical map. Update it when a new surface is added.
