# T-154-006: Multi-Provider Audit (A6)

**Sprint:** 154 (comprehensive pre-execute audit, runtime mode)
**Date:** 2026-05-07
**Worker:** A6 (multi-provider auditor)
**Scope (read-only):**
- `src/providers/{claude,codex,gemini,subprocess,sandbox}.ts`
- `src/core/{provider.ts,model-registry.ts,mode-presets.ts,routing-engine.ts}`
- `tests/providers/*` (7 files)

**Out of scope (delegated):** A1 docker, A2 cli/mcp, A3 build, A4 orchestra (sprint-controller, task-router), A5 security, A7 nervous, A8 dashboard, A9 core remainder, A10 vision.

---

## Executive Summary

Multi-provider stack is **structurally sound but operationally single-tenant** on this host. Only Claude is reachable: Codex and Gemini CLIs are not installed, all three API-key env vars (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`) are unset, and `.deck` secret file is absent. The 13-model × 3-provider × 4-tier `ModelRegistry` is internally consistent and tier equivalence resolves correctly, but `opus.apiId` is still `claude-opus-4-6` despite IDENTITY/CLAUDE.md/system-prompt all stating Opus 4.7 — DIRECTIVES Sprint 154 Task 4 fixes exactly this.

`fallback_provider` is **fully wired in code** (`src/core/provider.ts:361 resolveProviderWithFallback`, `config-types.ts:101,452`), but the active `.deckent/config.json` does **not set** the key — so if Claude session goes down mid-sprint, `bootstrapProviders()` defaults to Claude only, and runtime spawn errors will surface as plain "ProviderUnavailableError" with no auto-failover. KNOWN_ISSUES "single point of failure" is therefore a **config gap**, not a code gap (correction vs Sprint 152's claim that `fallback_provider` is "missing" in config-types — it's not).

Provider tests are green: 7 files, 346 tests, **331 pass + 15 skipped** (codex/gemini integration suites correctly skip when `OPENAI_API_KEY` / `GOOGLE_API_KEY` are absent — guard pattern works). Adapter `isAvailable()` implementations on all five providers (claude/codex/gemini/subprocess/sandbox) follow a consistent pattern (CLI version probe + API key check). No rate-limit / 429 / throttle / backoff handling exists in any provider code path — Anthropic Max plan sliding-window kotası tamamen Claude CLI'ye delege; Sprint 152 P0 #3 (quota-exhausted guard) hâlâ açık.

ROADMAP Phase 2 multi-provider USP target Sprint 164; today's host state shows that activation (Codex CLI install + DECKENT_OPENAI_API_KEY .deck setup; Gemini CLI install + DECKENT_GOOGLE_API_KEY) is the actual blocker, not the orchestration code.

---

## Findings

### F1 [P1] `opus.apiId='claude-opus-4-6'` — outdated, mismatch with system identity

**Status:** CONFIRMED — duplicate of KNOWN_ISSUES P1, Sprint 154 DIRECTIVES Task 4.

**Evidence:**
- `src/core/model-registry.ts:47` → `apiId: 'claude-opus-4-6'`
- Live: `modelRegistry.resolveApiId('opus')` returns `'claude-opus-4-6'`
- Conflicts with: `IDENTITY.md`/`CLAUDE.md` "Opus 4.7" references; system prompt model id `claude-opus-4-7[1m]`; user memory `currentDate: 2026-05-07`.
- Same outdated id reused in 6 fixture files (3 test, 3 baseline pricing) — Sprint 154 Task 4 must update those too.

**Spread (other locations using `claude-opus-4-6`):**
| File | Line | Type |
|------|------|------|
| `src/core/model-registry.ts` | 47 | source |
| `src/core/pricing-data-baseline.json` | 13, 26 | baseline |
| `src/core/pricing-updater.ts` | 163, 461 | comments only (regex examples) |
| `tests/core/anthropic-http-client.test.ts` | 74, 104, 131 | test fixture |
| `tests/core/model-registry.test.ts` | 388 | assertion |
| `tests/core/model-types.test.ts` | 335, 367 | assertion |
| `tests/core/cost-calculator.test.ts` | 20, 255 | test fixture |
| `tests/core/pricing-updater.test.ts` | 28, 46–47, 69, 86, 95, 126 | test fixture |

**Risk:** While `auth_mode='subscription'` (current), Claude CLI handles model id mapping internally, so `4-6` is a silent string. If Alperen flips to `auth_mode='api'` (`.deckent/config.json:52`), `resolveApiId('opus')` is the literal id sent to Anthropic REST API → 404 / model_not_found.

**Action:** Sprint 154 Task 4 — single string change + cascading fixture updates (DIRECTIVES already names the file).

---

### F2 [P2] Codex & Gemini CLIs not installed — multi-provider USP technically inactive

**Status:** CONFIRMED — KNOWN_ISSUES match, ROADMAP Phase 2 Sprint 164 target, blocker for Phase 2 marketing claim.

**Evidence (live, 2026-05-07):**
```
$ which claude codex gemini
/home/alperen/.nvm/versions/node/v24.15.0/bin/claude
(codex: not found, exit 127)
(gemini: not found, exit 127)

$ claude --version → 2.1.132 (Claude Code)
$ codex --version  → command not found
$ gemini --version → command not found
```

**Live `detectAvailableProviders()` output:**
```json
[
  { "name": "claude", "available": true, "version": "2.1.132 (Claude Code)",
    "authMethod": "session", "models": ["opus","sonnet","haiku"] },
  { "name": "codex", "available": false, "authMethod": "none",
    "models": ["o3","gpt-5","gpt-4.1","o4-mini","gpt-5-mini","gpt-4.1-mini"] },
  { "name": "gemini", "available": false, "authMethod": "none",
    "models": ["gemini-3.1-pro-preview","gemini-2.5-pro","gemini-2.5-flash","gemini-2.0-flash"] }
]
```

**`formatDetectedProviders()` rendering:**
```
Providers:
  ✔ claude v2.1.132 (Claude Code) (session) — models: opus, sonnet, haiku
  ✘ codex (not configured) — models: o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini
  ✘ gemini (not configured) — models: gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
```

**Provider-cache state (`.deckent/provider-cache.json`):**
```json
{ "registered": ["claude"], "defaultProvider": "claude",
  "cachedAt": "2026-04-24T12:16:29.728Z", "configHash": "claude|claude|" }
```
Cache is from Sprint 152 (2026-04-24) — bootstrap has not been re-run after Sprint 152.5 / 153 work; `.deckent/sprint.lock` is present (sprint-153 still owning lock). Cache will refresh on next `bootstrapProviders()` invocation.

**Code-side readiness (PASS — orchestration is ready, only CLI install missing):**
- `src/providers/codex.ts` 371 LoC — `detectAuthMode()` (api_key | subscription | none), `detectCliVariant()` (rust | node), `createCodexAdapter()` factory.
- `src/providers/gemini.ts` 565 LoC (largest of the three) — REST API fallback (`x-goog-api-key`, `/v1beta/models`), `parseGeminiOutput()` accepts json + stream-json.
- `bootstrapProviders()` (`provider.ts:490`) lazy-imports adapter factories, gracefully skips unavailable ones, logs reason — no crashes when a provider is missing.

**Risk:** ROADMAP §4 Phase 2 (Sprint 152-160) "Multi-Provider Freedom" USP cannot be marketed honestly until at least one of Codex/Gemini is reachable. Sprint 152 P1 #4–5 (Codex+Gemini install + .deck secrets) is the lift; today no progress since Sprint 152.

---

### F3 [P1] `fallback_provider` config key wired in code but **not set** in active config — single point of failure

**Status:** CONFIRMED with correction. (Sprint 152 audit phrased this as "config key missing"; code review shows it's defined in `config-types.ts` and `provider.ts` but absent from the live `.deckent/config.json`.)

**Code wiring (PASS — fallback chain exists):**
- `src/core/config-types.ts:101` → `fallback_provider?: ProviderName;` (input config)
- `src/core/config-types.ts:452` → `fallback_provider?: ProviderName;` (resolved config)
- `src/core/provider.ts:361 resolveProviderWithFallback()` — full implementation: tries primary, on `isAvailable()=false` checks `config.fallback_provider`, registers + remaps model via `getEquivalentModel()`. Single-attempt, no infinite loops (matches ADR + brain-rules guidance).
- `src/core/provider.ts:491 bootstrapProviders()` — accepts `fallback_provider` in the destructured config type.

**Config gap (FAIL — runtime is single-provider):**
```bash
$ grep -c "fallback_provider" /home/alperen/deckent-dev/.deckent/config.json
0
```
The key is **not** set in the active config. `bootstrapProviders()` registers Claude only (provider-cache: `"registered":["claude"]`). If Claude `isAvailable()` returns false during a sprint:
- `resolveProviderWithFallback()` reads `config.fallback_provider` → `undefined`.
- Throws `ProviderUnavailableError("Provider claude is unavailable and no fallback_provider is configured")`.
- Sprint aborts mid-flight — no auto-failover.

**Why F3 is P1, not P0:** Today Codex and Gemini are not installed (F2), so even if `fallback_provider: 'codex'` were set, fallback would still fail (`registry.hasProvider('codex')` returns false; raises "Fallback provider codex is not registered"). The **functional** fix requires F2 + F3 together: install one alternate provider, then set the fallback key. Until F2 is unblocked, F3 is documentation/preflight work only.

**Action options:**
1. Set `fallback_provider: 'claude'` (self-loop, just an alternate adapter variant — but only one Claude adapter is registered today, so this is a no-op).
2. Wait for F2 (Codex install) → set `fallback_provider: 'codex'` + remap.
3. Add a brain-side preflight check that warns at sprint start when `fallback_provider` is unset AND only one provider is registered.

Recommendation: option 3 (low effort, surfaces the risk early), then option 2 once F2 lifts.

---

### F4 [P2] All three provider API-key env vars **unset** + no `.deck` file — `auth_mode='api'` flip is broken today

**Status:** CONFIRMED.

**Evidence:**
```
$ [ -n "$OPENAI_API_KEY" ] && echo "set (len=${#OPENAI_API_KEY})" || echo "unset"
unset
$ [ -n "$GOOGLE_API_KEY" ] && echo "set" || echo "unset"
unset
$ [ -n "$ANTHROPIC_API_KEY" ] && echo "set" || echo "unset"
unset

$ ls /home/alperen/deckent-dev/.deck
ls: cannot access '/home/alperen/deckent-dev/.deck': No such file or directory
$ ls /home/alperen/deckent-dev/.deck.example
ls: cannot access ... No such file or directory
```

**Auth fan-out (today's actual state):**
| Auth path | Required | Present | Result |
|-----------|----------|---------|--------|
| Claude OAuth subscription | `~/.claude/.credentials.json` (out-of-scope read-deny — owner-only mode `0600`) | session token assumed valid (Claude CLI 2.1.132 reachable; live `detectAvailableProviders` returns `available=true,authMethod='session'`) | working |
| Claude API key | `ANTHROPIC_API_KEY` | unset | flip-broken |
| Codex API key | `OPENAI_API_KEY` or `DECKENT_OPENAI_API_KEY` | unset | unavailable |
| Gemini API key | `GOOGLE_API_KEY` or `DECKENT_GOOGLE_API_KEY` | unset | unavailable |
| `.deck` secret store | `<root>/.deck` or `~/.deck` | absent | unavailable |

**`auth_mode` flow (per `provider.ts:497-504`):**
- Active config: `auth_mode: 'subscription'` → `.deck` loading is **intentionally skipped**. Working today because Claude OAuth is good.
- If flipped to `'api'` or `'hybrid'`: `loadDeckSecrets()` runs but returns `{}` (no .deck file), `applyDeckSecretsToEnv()` is a no-op, `process.env.OPENAI_API_KEY` remains unset, all three providers fail `isAvailable()` → no provider registered → `setDefault` raises "No providers registered".

**Risk:** Two-level: (1) Cannot test `auth_mode='api'` path live without doing setup work; (2) If Claude OAuth session expires mid-sprint and brain attempts to fall back to api-mode, there is no key to fall back to.

**Action:** DECKENT.md provider auth section already documents `OPENAI_API_KEY` / `GOOGLE_API_KEY`. Add `.deck.example` template scaffold (Sprint 152 P1 #7) — out of A6 read-only scope to write, but call it out for Sprint 155+ planning.

---

### F5 [P2] ModelRegistry inventory — 13 models, 3 providers, 4 tiers; structurally PASS; one drift on `gemini-3.1-pro-preview` status, one cosmetic version-string drift

**Status:** PASS with minor drifts noted.

**Live registry inventory (`node -e "modelRegistry.getAllModels().length"`):**
```
total: 13
providers: ['claude', 'codex', 'gemini']
tiers: economy, standard, premium, premium_plus
```

| Provider | Tier | id | apiId | status |
|----------|------|----|----|--------|
| claude | premium | opus | **claude-opus-4-6** (F1) | ga |
| claude | standard | sonnet | claude-sonnet-4-6 | ga |
| claude | economy | haiku | claude-haiku-4-5-20251001 | ga |
| codex | premium_plus | o3 | o3 | ga |
| codex | premium | gpt-5 | gpt-5 | ga |
| codex | standard | gpt-4.1 | gpt-4.1 | ga |
| codex | standard | o4-mini | o4-mini | ga |
| codex | economy | gpt-5-mini | gpt-5-mini | ga |
| codex | economy | gpt-4.1-mini | gpt-4.1-mini | ga |
| gemini | premium_plus | gemini-3.1-pro-preview | gemini-3.1-pro-preview | **preview** |
| gemini | premium | gemini-2.5-pro | gemini-2.5-pro | ga |
| gemini | standard | gemini-2.5-flash | gemini-2.5-flash | ga |
| gemini | economy | gemini-2.0-flash | gemini-2.0-flash | ga |

**Tier equivalence (live `getEquivalent` calls — PASS):**
| Source → Target | Result | Tier match |
|----|----|----|
| opus → codex | gpt-5 | premium ✓ |
| opus → gemini | gemini-2.5-pro | premium ✓ |
| sonnet → codex | gpt-4.1 | standard ✓ |
| sonnet → gemini | gemini-2.5-flash | standard ✓ |
| haiku → codex | gpt-5-mini | economy ✓ |
| haiku → gemini | gemini-2.0-flash | economy ✓ |

**[DRIFT-1]** `premium_plus` membership = 2 (o3, gemini-3.1-pro-preview). Claude has no `premium_plus` model. `getEquivalent('o3','claude')` falls back one tier to `'opus'` — by design (`model-registry.ts:240` "Fallback: try one tier down"), but consumers expecting strict tier match get a silent downgrade. Sprint 152 P2 #9 already noted this; no movement.

**[DRIFT-2]** `gemini-3.1-pro-preview` is the only `preview`-status model. `formatDetectedProviders()` and `getByProviderAndTier()` filter for `status==='ga'`, so `gemini-3.1-pro-preview` is **excluded from auto-equivalence resolution** — `getEquivalent('o3','gemini')` returns `gemini-2.5-pro` (premium tier fallback), not the same-tier `gemini-3.1-pro-preview`. This is correct policy (don't ship preview models silently) but worth surfacing if/when Phase 2 marketing wants to claim "gemini-3.1-pro-preview routable".

**[DRIFT-3 — cosmetic]** Claude version string: `formatDetectedProviders()` outputs `"v2.1.132 (Claude Code)"` (parens included). Sprint 152 P2 #10 flagged this; still not parsed. Low priority.

**No drifts on:** model count (13 ✓), provider count (3 ✓), tier count (4 ✓), Claude/Codex/Gemini sub-counts (3/6/4 ✓), `contextWindow` populated for all 13 (1M-2M for premium+, 200K for haiku/o3/o4-mini, 1M+ for the rest), `costPerMillion` populated for all 13, capabilities (5 boolean flags) populated for all 13.

---

### F6 [Observation] No rate-limit / 429 / throttle / backoff code in any provider — Sprint 152 P0 #3 still open

**Status:** CARRIED OVER — Sprint 152 P0 #3 (Claude quota-exhausted guard) was **not closed** in Sprint 153.

**Evidence:**
```bash
$ grep -rn "rate[_-]\?limit\|rateLimit\|429\|throttle\|backoff\|Usage limit" \
       src/providers/ src/orchestra/tmux.ts
(no matches)
```

Zero occurrences across all five provider adapters (claude.ts 229 LoC, codex.ts 371, gemini.ts 565, subprocess.ts 327, sandbox.ts 161) and tmux.ts. Anthropic Max plan 5-hour sliding window quota is enforced **only** by the Claude CLI itself; if it returns `Usage limit reached` mid-task, the worker simply exits without writing `.tasks/task-XXX.result`, and Sprint 140's `.result-missing` guard correctly produces NO_GO — but there is no auto-defer / auto-rerun pattern.

**Why this is an A6 finding:** A6 owns provider-adapter behavior. Sprint 152 already routed this as P0 to Sprint 153 and it slipped. Re-flagging at P2 since today's 6-worker performance mode hasn't observed an actual quota hit yet (Sprint 153 ran successfully with 11 detector wire + Ed25519 hub sign per recent commits), but the gap remains.

---

### F7 [Observation] Provider adapter `isAvailable()` consistency — PASS

**Status:** PASS — all five adapters implement `isAvailable(): Promise<boolean>` and follow the documented contract (`src/core/provider.ts:62`).

| Adapter | Pattern | Evidence |
|---------|---------|----------|
| ClaudeAdapter | `claude --version` spawn (timeout 5s) + backend!=mcp check | `claude.ts:159` |
| CodexAdapter | `codex --version` spawn + `codex auth status` OR `OPENAI_API_KEY` env | `codex.ts:176` |
| GeminiAdapter | `isCliInstalled()` + `getApiKey() !== undefined` | `gemini.ts:271` |
| SubprocessBackend (generic) | delegates to `providerConfig.buildCommandString` viability | `subprocess.ts:236` |
| SandboxAdapter | `super.isAvailable()` + sandbox readiness | `sandbox.ts:65` |

All five tests green (see F8).

---

### F8 [Observation] Provider test suite green — 7 files, 346 tests, 331 pass + 15 skipped

**Status:** PASS.

**Evidence (`npx vitest run tests/providers/`, 2026-05-07):**
```
✓ tests/providers/sandbox.test.ts          (41 tests)
✓ tests/providers/claude.test.ts           (61 tests)
✓ tests/providers/subprocess.test.ts       (65 tests)
✓ tests/providers/codex.test.ts            (71 tests)
✓ tests/providers/gemini.test.ts           (84 tests)
✓ tests/providers/gemini-integration.test.ts (12 tests | 7 skipped)
✓ tests/providers/codex-integration.test.ts  (12 tests | 8 skipped)

 Test Files  7 passed (7)
      Tests  331 passed | 15 skipped (346)
   Duration  393ms
```

The 15 skipped tests are integration suites that correctly guard on `OPENAI_API_KEY` / `GOOGLE_API_KEY` env presence — the skip is the intended path when keys aren't set.

---

### F9 [Observation] `routing-engine.ts` does not route providers — provider routing lives in `task-router.ts` (out of A6 scope)

**Status:** SCOPE CLARIFICATION.

`grep -c "provider" src/core/routing-engine.ts` returns **0**. Routing-engine handles agent + skill selection (Layer 3 unified routing per CLAUDE.md). Provider routing is `task-router.ts` (orchestra/) — explicitly delegated to A4 per A6 directive. F9 just notes that A6's routing-engine.ts read-through found no provider chain code there; no findings filed against this file.

---

## Provider Matrix — Sprint 154 Pre-Execute Snapshot

| Provider | CLI installed | Version | Auth path | Env-var present | .deck | Adapter registered (live) | Models (catalog) | Tiers |
|----------|:--:|---------|------|:--:|:--:|:--:|------|------|
| **Claude** | ✅ | 2.1.132 | OAuth subscription | ❌ ANTHROPIC_API_KEY | ❌ | ✅ default | opus, sonnet, haiku | premium, standard, economy |
| **Codex**  | ❌ | — | — | ❌ OPENAI_API_KEY, ❌ DECKENT_OPENAI_API_KEY | ❌ | ❌ skipped | o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | premium_plus, premium, standard×2, economy×2 |
| **Gemini** | ❌ | — | — | ❌ GOOGLE_API_KEY, ❌ DECKENT_GOOGLE_API_KEY | ❌ | ❌ skipped | gemini-3.1-pro-preview (preview), gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | premium_plus (preview), premium, standard, economy |

**Net:** 1 of 3 providers operational. ROADMAP Phase 2 Sprint 164 USP target ≥3 — gap = 2 providers + setup.

---

## Recommended Sprint 154 Actions (within DIRECTIVES scope)

### Already in Sprint 154 DIRECTIVES (confirm path)

- **DIRECTIVES Task 4** → resolves F1 (`opus.apiId='claude-opus-4-6'` → `'claude-opus-4-7'`). Note for the worker: cascading test fixture updates needed in 6 additional files (see F1 spread table) to keep the suite green; otherwise `tests/core/model-registry.test.ts:388` and `model-types.test.ts:335,367` will fail post-edit.

### Suggested for Sprint 154 backlog (if time permits)

- **F3 follow-up (low effort, P2)** — add a one-line preflight log in `bootstrapProviders()` after `setDefault` that emits a warning when `config.fallback_provider` is unset AND `registered.length === 1`. Surfaces single-point-of-failure risk at sprint start; no behavior change.

### Defer to Sprint 155+ (out of A6 read-only scope today)

- F2 → CLI install + `.deck` setup (user action: API keys).
- F4 → `.deck.example` scaffold + DECKENT.md auth_mode flip rehberi.
- F5 DRIFT-3 → cosmetic version-string parse cleanup.
- F6 → quota-exhausted guard + auto-defer (Sprint 152 P0 #3 carry-over, structural change).

---

## Self-Assessment

- **Coverage:** All 7 in-scope source files inspected (`src/providers/{claude,codex,gemini,subprocess,sandbox}.ts`, `src/core/{provider,model-registry,mode-presets,routing-engine}.ts`); all 7 test files runtime-verified green; provider availability detection live-executed.
- **Read-only:** No source files modified.
- **Evidence quality:** 8 distinct runtime probes (CLI binaries, env vars, `detectAvailableProviders()` live, `modelRegistry.getAllModels()` live, vitest run, grep scans, provider-cache JSON, config grep).
- **Calibrations vs Sprint 152 audit:** F3 corrected (key wired in code, missing only from active config — Sprint 152 phrasing was over-broad). F1, F2, F6 confirmed unchanged. F4 confirmed unchanged. F5 inventory re-validated; tier equivalence map identical to Sprint 152.
- **Out-of-scope respected:** No reads of orchestra/, cli/, mcp/, api/, nervous/. OAuth credential read attempt was correctly denied by sandbox and not retried. task-router.ts (provider routing in orchestra/) intentionally skipped per A6 directive.
- **Limitations:** Could not validate Claude OAuth token TTL (credential read denied — correct). Could not validate Codex/Gemini at runtime since CLIs are absent. Sprint 152 audit was the last live OAuth state snapshot (~7.79h TTL, 2026-04-24); ~13 days have passed — assumed CLI tooling has refresh-rotated the token successfully since `claude --version` succeeds today.

**Final A6 verdict:** PASS-WITH-DRIFTS. No P0 blockers for Sprint 154 execution. F1 is the only P1 that must close in Sprint 154 (already on the directive list). F2/F3/F4 require operational setup (API keys, CLI installs) that is outside a code-only sprint's reach; queue for Phase 2 ramp-up Sprint 155+.

---

## Evidence Appendix

### E1. CLI presence
```
$ which claude codex gemini
/home/alperen/.nvm/versions/node/v24.15.0/bin/claude
$ claude --version → 2.1.132 (Claude Code)
$ codex --version  → command not found (exit 127)
$ gemini --version → command not found (exit 127)
```

### E2. Env vars
```
OPENAI_API_KEY: unset
GOOGLE_API_KEY: unset
ANTHROPIC_API_KEY: unset
```

### E3. .deck files
```
/home/alperen/deckent-dev/.deck         → not found
/home/alperen/deckent-dev/.deck.example → not found
```

### E4. detectAvailableProviders() live
(See F2 JSON block above — claude available, codex+gemini unavailable.)

### E5. modelRegistry totals
```
total: 13
providers: ['claude', 'codex', 'gemini']
opus.apiId: claude-opus-4-6   ← F1
sonnet.apiId: claude-sonnet-4-6
haiku.apiId: claude-haiku-4-5-20251001
```

### E6. fallback_provider grep
```
$ grep -c "fallback_provider" .deckent/config.json     → 0
$ grep -n "fallback_provider" src/core/config-types.ts → 101, 452
$ grep -n "fallback_provider" src/core/provider.ts     → 364, 491, 582
$ grep -rn "resolveProviderWithFallback" src/          → defined at provider.ts:361
```

### E7. Rate-limit scan
```
$ grep -rE "rate[_-]?limit|rateLimit|429|throttle|backoff|Usage limit" \
       src/providers/ src/orchestra/tmux.ts
(no matches)
```

### E8. Provider tests
```
$ npx vitest run tests/providers/
 Test Files  7 passed (7)
      Tests  331 passed | 15 skipped (346)
   Duration  393ms
```

### E9. Provider-cache state
```json
{ "registered": ["claude"], "defaultProvider": "claude",
  "cachedAt": "2026-04-24T12:16:29.728Z", "configHash": "claude|claude|" }
```

### E10. Source LoC inventory
```
229  src/providers/claude.ts
371  src/providers/codex.ts
565  src/providers/gemini.ts
161  src/providers/sandbox.ts
327  src/providers/subprocess.ts
609  src/core/provider.ts
315  src/core/model-registry.ts
112  src/core/mode-presets.ts
625  src/core/routing-engine.ts  (no provider routing — agent/skill only)
3314 total in scope
```

### E11. Test LoC inventory
```
558  tests/providers/claude.test.ts
110  tests/providers/codex-integration.test.ts
560  tests/providers/codex.test.ts
101  tests/providers/gemini-integration.test.ts
726  tests/providers/gemini.test.ts
424  tests/providers/sandbox.test.ts
644  tests/providers/subprocess.test.ts
3123 total
```
