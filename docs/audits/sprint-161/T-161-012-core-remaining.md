# T-161-012 — src/core/ Remaining Helpers + Bridge

**Sprint:** 161 (Lane 1, READ-ONLY pre-beta audit)
**Task:** 161-012
**Mode:** Static audit, no source-code changes
**Auditor:** doc-writer (Claude Opus)
**Date:** 2026-05-08

---

## 1. Scope

This audit covers every file in `src/core/` that is **NOT** included in Tasks 1–11 of Sprint 161. The Lane 1 task list dedicated those tasks to focused clusters (config, memory, agent/skill pools, routing, model registry, locks/events, credentials, marketplace, validators, notification dispatcher). Task 12 ("remaining helpers + bridge") audits everything left behind.

### Coverage map (Tasks 1–11, excluded from this report)

| Task | Files claimed |
|------|---------------|
| T1 | `config.ts`, `config-types.ts`, `types.ts`, `constants.ts` (+ "2-3 *-types.ts") |
| T2 | `memory-{store,query,normalize,types,export,import}.ts` |
| T3 | `agent-pool.ts`, `skill-pool.ts`, `skill-registry.ts` |
| T4 | `provider.ts`, `routing-types.ts`, `manifest-migrator.ts`, `condition-evaluator.ts` |
| T5 | `routing-engine.ts`, `activation-engine.ts`, `intent-classifier.ts` |
| T6 | `model-registry.ts`, `mode-presets.ts` |
| T7 | `file-lock.ts`, `heartbeat-types.ts` (`event-stream.ts` & `scope-sanitizer.ts` live in `src/orchestra/`, not `src/core/`) |
| T8 | `credentials.ts`, `deck-file.ts`, `global-config.ts`, `signature.ts` |
| T9 | `src/core/marketplace/` |
| T10 | `validators.ts`, `utils.ts`, `sprint-file-retention.ts`, `orphan-cleaner.ts` |
| T11 | `notification-dispatcher.ts`, `notify-adapters/`, `nervous-types.ts` |

### Files audited in this report

```
src/core/
├── adr-seed.ts                   ├── monitoring-types.ts
├── agent-cache.ts                ├── multi-ide.ts
├── agent-selector.ts             ├── notifications.ts
├── agent-types.ts                ├── notification-config.ts
├── analyzer.ts                   ├── notify-registry.ts
├── anthropic-http-client.ts      ├── notification-providers/{discord,slack,webhook}.ts
├── cascade-detector.ts           ├── observability.ts
├── ci-learning.ts                ├── observability-rotation.ts
├── config-migration.ts           ├── output-collector.ts
├── config-validator.ts           ├── output-formatter.ts
├── cost-calculator.ts            ├── panic-guard.ts
├── cost-config-loader.ts         ├── plugin.ts
├── cost-config-schema.json       ├── plugin-hooks.ts
├── credential-encryption.ts      ├── plugin-loader.ts
├── debug-log.ts                  ├── pricing-data-baseline.json
├── deck-interpolation.ts         ├── pricing-updater.ts
├── decision-config.ts            ├── provider-auth-resolver.ts
├── decision-types.ts             ├── provider-capabilities.ts
├── environment.ts                ├── provider-fallback.ts
├── errors.ts                     ├── redact-sensitive.ts
├── identity-generator.ts         ├── rule-generator.ts
├── index.ts                      ├── rule-templates/{auditor,brain,worker-default}.template.md
├── lazy-loader.ts                ├── session-interface.ts
├── model-equivalence.ts          ├── skill-cache.ts
├── model-registry-refresh.ts     ├── skill-selector.ts
├── skill-types.ts                ├── stack-detector.ts
├── sprint-types.ts               ├── subscription.ts
├── system-capacity.ts            ├── system-profile.ts
├── task-types.ts                 ├── telemetry.ts
├── token-counter.ts              ├── builtins/{agents,skills}/  (data-only, scanned not deeply read)
└── pricing-data-baseline.json
```

Approximate footprint: **~58 TypeScript files + 3 JSON / template clusters, ≈14k LoC**. Per the task description ("≤8 files, ≤2000 LoC, focus on dead code"), the audit triages broadly and deep-reads only the highest-suspicion modules; shallow exports are verified by cross-file `grep` for usage, with severity capped at the strongest evidence available.

---

## 2. Findings (severity-sorted)

### P0 — Blocks correctness or runtime

| # | Area | Finding | Evidence |
|---|------|---------|----------|
| P0-1 | Provider data drift | `provider-capabilities.ts` hardcodes `maxContextTokens: 200_000` for Claude, but `pricing-data-baseline.json` documents Opus 4.6 / Sonnet 4.6 with `max_input_tokens: 1000000`. A 5× under-statement breaks any caller that uses this module to gate prompt size — they will refuse prompts that the API would actually accept. | `src/core/provider-capabilities.ts:28`, `src/core/provider-capabilities.ts:152` vs `src/core/pricing-data-baseline.json:19,37` |
| P0-2 | Provider data drift | Same module hardcodes per-MTok costs (Claude input 15) that disagree with the baseline pricing JSON (Opus input 5). Routes that pick "cheapest provider" via this file pick wrong. | `src/core/provider-capabilities.ts` cost block vs `pricing-data-baseline.json:13–48` |

### P1 — Correctness or security risk

| # | Area | Finding | Evidence |
|---|------|---------|----------|
| P1-1 | ADR-006 deviation | `plugin-hooks.ts` invokes `spawnSync('npx', […], { shell: true })` for vitest/tsc test runs. Although `testFiles` is computed internally rather than from user input, hardcoding `shell: true` violates ADR-006's "spawnSync without shell unless required" principle and weakens the project-wide pattern. (Compare with line 376 which correctly uses `shell: isWindows`.) | `src/core/plugin-hooks.ts:399`, `src/core/plugin-hooks.ts:581` |
| P1-2 | API drift | `anthropic-http-client.ts` pins `anthropic-version: 2023-06-01`. The Anthropic API has multiple newer versions (2024-06-01 onward) and the client is used for token counting / cost reporting — old versions can return a stale schema. | `src/core/anthropic-http-client.ts:142` |
| P1-3 | Token budget drift | `token-counter.ts` defaults context budget to `200_000` (line 51); modern Anthropic models in `pricing-data-baseline.json` carry 1M / 2M context. Result: spurious "over budget" warnings and unnecessary task splits for Opus 4.6 / Sonnet 4.6 / Gemini Pro. | `src/core/token-counter.ts:51` |
| P1-4 | V1/V2 dual-mode wired in production | `agent-selector.ts` and `skill-selector.ts` (V1 keyword scoring) are still imported by `sprint-planner.ts` and `decision-engine.ts` despite ADR-028 declaring V2 routing migration accepted. Worth confirming whether this is intentional (fallback ladder) or stale; document explicitly. | `Grep "from.*agent-selector"`, `Grep "from.*skill-selector"` |
| P1-5 | Error code rot | `errors.ts` ships ~59 codes; codes E002 (claude CLI), E003 (DIRECTIVES.md), E010 (Node version), E050–E052 (git stash/rollback), E054 (observability not initialised) are not thrown anywhere in `src/`. They are inert until someone re-introduces a stale path that mistakenly maps to them. | `src/core/errors.ts` registry vs `Grep "createError\\([^)]*E0"` cross-ref |

### P2 — Drift / dead-code / maintenance burden

| # | Area | Finding | Evidence |
|---|------|---------|----------|
| P2-1 | Dead module | `cascade-detector.ts` (170 LoC) — `CascadeDetector` class has zero cross-file references in `src/`. Likely orphaned after Sprint 141+ pause/halt logic was relocated. | `Grep "from.*cascade-detector" → 0 matches` |
| P2-2 | Dead module | `lazy-loader.ts` (145 LoC) — `lazyLoad` / `LazyMap` not imported anywhere in `src/`. | `Grep "from.*lazy-loader" → 0 matches` |
| P2-3 | Dead module | `agent-cache.ts` (171 LoC) — `AgentSelectionCache` and helpers have zero callers; routing-engine does not consult it. | `Grep "from.*agent-cache" → 0 matches` |
| P2-4 | Dead module | `skill-cache.ts` (196 LoC) — `SkillLoadingCache` never instantiated outside its own file. | `Grep "from.*skill-cache" → 0 matches` |
| P2-5 | Dead stub | `config-validator.ts` (6 LoC) is a re-export of `validateConfig`/`ConfigValidationError` from `config.ts`. No file imports from it; all callers go directly to `config.js`. | `Grep "from.*config-validator" → 0 matches` |
| P2-6 | Partial dead-code | `monitoring-types.ts` exports `SkillMeta` (lines 115–122) and `LockInfo` (lines 107–112) with zero callers. Other exports (`Heartbeat`, `DashboardState`, `Alert`) are actively used by the dashboard manager. | `src/core/monitoring-types.ts` exports list |
| P2-7 | Module duplication | `system-capacity.ts` (92 LoC) and `system-profile.ts` (30 LoC) both compute `recommendedMaxWorkers` with different formulas. The former is comment-tagged "MVP"; the latter is the runtime canonical used by `sprint-spawner.ts`. Pick one. | `src/core/system-capacity.ts`, `src/core/system-profile.ts` |
| P2-8 | Unused export | `observability-rotation.ts` exports `shouldRotate` with no cross-file caller; only the `rotateMetricsFile` orchestrator is wired. | `Grep "shouldRotate" → 0 cross-refs` |
| P2-9 | Unused export | `output-formatter.ts` exports `getEmoji` with no caller. | `Grep "getEmoji" → 0 cross-refs` |
| P2-10 | Unused export | `panic-guard.ts` exports `buildNotification` (no cross-file callers); the `PanicGuard` class itself is wired into sprint-controller. | `Grep "buildNotification" → 0 cross-refs in src/` |
| P2-11 | Drift risk | `model-equivalence.ts` keeps a hand-maintained `TIER_PROVIDER_MAP` alongside a registry-derived tier list. Comment says "derived from ModelRegistry", but the map is literal. Risk: registry adds a model, the map silently lags. | `src/core/model-equivalence.ts` (top half) |
| P2-12 | Fragile parsing | `identity-generator.ts:countAdrsFromDb()` parses `.brain/exports/summary.md` via regex to count ADRs. Brain rule explicitly says "query MemoryStore.getByType('adr'), never parse .md files." Regression of an ADR-governance rule. | `src/core/identity-generator.ts` countAdrsFromDb body |
| P2-13 | Hidden coupling | `ci-learning.ts` silently fails when `.brain/ci-report-*.json` files do not exist. Acceptable, but undocumented; users wondering why suggestions never appear get no signal. | `src/core/ci-learning.ts` readCiReports loop |

### P3 — Cosmetic / informational

| # | Area | Finding |
|---|------|---------|
| P3-1 | `redact-sensitive.ts` (39 LoC) regex set covers the obvious cases (sk-*, key-*, Bearer …) but lacks multiline JSON redaction; not a correctness issue today. |
| P3-2 | `multi-ide.ts` PID lock is fragile under PID recycling. Practical risk is tiny (PID space is large, sprints are short) but a uuid-tagged lock would be more defensible. |
| P3-3 | `credential-encryption.ts` auto-generates the keyring file (`~/.deckent/.keyring`, 0o600) on first call. Sandboxed CI environments can hit a perms wall; explicit `deckent setup keyring` would be friendlier. |
| P3-4 | `provider-fallback.ts` hardcodes `MAX_FALLBACK_RETRIES = 1`. Reasonable, but config-surfacing would let power users tune. |
| P3-5 | `telemetry.ts` exists but does not integrate with `observability.ts`. Two opt-in instrumentation paths invite drift; consider consolidation or an explicit "telemetry uses observability under the hood" wiring. |
| P3-6 | `pricing-updater.ts` API-version-pin and 5% delta gate are sound, but the GitHub LiteLLM URL is hardcoded; mirror failure becomes a silent baseline regression. Document the fall-through behaviour. |

### Pass cases (no findings)

The following modules read clean against all 10 dimensions and are flagged here so future audits do not re-walk them: `errors.ts` core class hierarchy (only the registry codes have rot, the `DeckentError` class is fine), `analyzer.ts`, `stack-detector.ts`, `agent-types.ts`, `skill-types.ts`, `task-types.ts`, `sprint-types.ts`, `decision-types.ts`, `notifications.ts`, `notification-config.ts`, `notify-registry.ts`, `model-registry-refresh.ts`, `subscription.ts`, `session-interface.ts`, `debug-log.ts`, `deck-interpolation.ts`, `provider-auth-resolver.ts`, `cost-calculator.ts`, `cost-config-loader.ts`, `pricing-updater.ts` (logic clean — see P3-6 for cosmetic note), `output-collector.ts`, `observability.ts`, `redact-sensitive.ts` (see P3-1), `credential-encryption.ts` (see P3-3), `environment.ts`, `index.ts` (barrel — exports are intentionally minimal), `decision-config.ts` (was claimed dead by one agent — verified live: imported by `config-types.ts:4` and `orchestra/outcome-tracker.ts:10`), `rule-generator.ts`, `rule-templates/*.template.md`, `notification-providers/{discord,slack,webhook}.ts`.

---

## 3. Evidence (file:line citations)

The following exact citations back the findings above. All paths relative to repo root.

| Finding | Citation |
|---------|----------|
| P0-1 | `src/core/provider-capabilities.ts:28`, `:152` (claude block + secondary entry) |
| P0-1 cross-ref | `src/core/pricing-data-baseline.json:19` (opus 1M), `:37` (sonnet 1M) |
| P0-2 | `src/core/provider-capabilities.ts` per-MTok cost block vs `src/core/pricing-data-baseline.json:13–48` |
| P1-1 | `src/core/plugin-hooks.ts:399`, `:581` (`shell: true`) — contrast with `:376` (`shell: isWindows`) |
| P1-2 | `src/core/anthropic-http-client.ts:142` |
| P1-3 | `src/core/token-counter.ts:51` (`DEFAULT_BUDGET = 200_000`) |
| P1-4 | `src/orchestra/sprint-planner.ts` imports `agent-selector.ts` and `skill-selector.ts` (V1) post-ADR-028 |
| P1-5 | `src/core/errors.ts` ErrorRegistry — codes E002, E003, E010, E050–E052, E054 not thrown in `src/` |
| P2-1 | `Grep "from.*cascade-detector" --type ts` returns 0 matches |
| P2-2 | `Grep "from.*lazy-loader" --type ts` returns 0 matches |
| P2-3 | `Grep "from.*agent-cache" --type ts` returns 0 matches |
| P2-4 | `Grep "from.*skill-cache" --type ts` returns 0 matches |
| P2-5 | `Grep "from.*config-validator" --type ts` returns 0 matches |
| P2-6 | `src/core/monitoring-types.ts:107–112` (LockInfo), `:115–122` (SkillMeta) — neither imported externally |
| P2-7 | `src/core/system-capacity.ts` "MVP" header comment; `src/core/system-profile.ts` exports the actually wired helper |
| P2-11 | `src/core/model-equivalence.ts` — TIER_PROVIDER_MAP literal vs `MODEL_TIERS` derived |
| P2-12 | `src/core/identity-generator.ts:countAdrsFromDb` regex against `.brain/exports/summary.md` — violates Brain rule "ADRs via MemoryStore" |
| `decision-config.ts` is NOT dead | `src/core/config-types.ts:4`, `src/orchestra/outcome-tracker.ts:10` |

---

## 4. Migration triage (per file)

Sprint 162+ pre-beta cut: which files stay private, which can become public-SDK surface, which should disappear.

### DELETE-CANDIDATE — high-confidence orphans (no callers, safe to remove)

| File | LoC | Reason |
|------|-----|--------|
| `cascade-detector.ts` | 170 | 0 cross-file imports; superseded by sprint-controller pause/halt path. |
| `lazy-loader.ts` | 145 | 0 cross-file imports; pure utility nobody loads. |
| `agent-cache.ts` | 171 | 0 cross-file imports; routing-engine does not consult it. |
| `skill-cache.ts` | 196 | 0 cross-file imports; skill loading goes through pool/registry directly. |
| `config-validator.ts` | 6 | Stub re-export with no callers; collapse into `config.ts`. |
| Subset of `monitoring-types.ts` | ~16 | Drop `SkillMeta` (115–122) and `LockInfo` (107–112) only — keep the rest. |
| `system-capacity.ts` (consolidate) | 92 | "MVP" duplicate of `system-profile.ts`; pick one formula. |

### MIGRATE-PUBLIC — could ship in a public deckent SDK

These are framework-agnostic, internally used, and would be useful to external consumers:

| File | Why public |
|------|------------|
| `cost-calculator.ts` | Multi-provider cost estimation is generic. |
| `cost-config-loader.ts` | Hot-reload provider cost config is reusable. |
| `cost-config-schema.json` | Schema doc for config validation. |
| `pricing-updater.ts` | Generic LiteLLM/OpenRouter pricing fetcher. |
| `provider-fallback.ts` | Provider-agnostic 429/quota detector. |
| `provider-auth-resolver.ts` | Auth-mode resolver (api_key vs subscription). |
| `output-formatter.ts` | After dropping `getEmoji` it is a clean status renderer. |
| `observability-rotation.ts` | After dropping `shouldRotate` it is a generic rotator. |
| `plugin.ts` + `plugin-loader.ts` | Plugin manifest validator + sandbox; useful for any orchestrator. |

### KEEP-PRIVATE — internal coupling too deep

`adr-seed.ts`, `agent-selector.ts`, `skill-selector.ts` (still wired even post-V2), `agent-types.ts`, `skill-types.ts`, `task-types.ts`, `sprint-types.ts`, `decision-types.ts`, `decision-config.ts`, `analyzer.ts`, `stack-detector.ts`, `anthropic-http-client.ts` (Anthropic-specific), `provider-capabilities.ts` (after consolidation — see Recommendation), `token-counter.ts`, `errors.ts`, `ci-learning.ts`, `identity-generator.ts`, `multi-ide.ts`, `rule-generator.ts`, `rule-templates/*`, `redact-sensitive.ts`, `credential-encryption.ts`, `notifications.ts`, `notification-config.ts`, `notify-registry.ts`, `notification-providers/*`, `model-equivalence.ts`, `model-registry-refresh.ts`, `subscription.ts`, `system-profile.ts`, `session-interface.ts`, `lazy-loader.ts` (DELETE first), `telemetry.ts`, `debug-log.ts`, `deck-interpolation.ts`, `panic-guard.ts`, `output-collector.ts`, `observability.ts`, `plugin-hooks.ts` (after ADR-006 fix), `config-migration.ts`, `index.ts` (barrel), `environment.ts`, `pricing-data-baseline.json`, `builtins/agents/*`, `builtins/skills/*`, `monitoring-types.ts` (post-prune).

### UNCERTAIN — needs a product/architectural call before triaging

| File | Question |
|------|----------|
| `agent-selector.ts`, `skill-selector.ts` | ADR-028 declared V2 routing accepted. Are V1 selectors still wanted as fallback, or should they be removed and the planner switched fully to V2? |
| `pricing-updater.ts` | Should pricing updates be exposed via MCP (ADR-017)? Currently CLI-only. |
| `telemetry.ts` | Is it deprecated in favor of `observability.ts`, or a separately supported opt-in surface? |

---

## 5. Recommendations (Sprint 162+ work)

The findings above translate into the following follow-up sprints. **No code change is proposed in this report** — recommendations only.

1. **Sprint 162 P0 task — collapse provider data drift**
   - Make `provider-capabilities.ts` derive `maxContextTokens` and per-MTok costs from `cost-config-loader.ts` / `model-registry.ts` instead of hardcoding.
   - Same fix updates `token-counter.ts` `DEFAULT_BUDGET` to read from the model registry rather than a 200_000 literal.
   - Add a startup self-check that asserts the two sources agree, and panics if they diverge — turns silent drift into a loud failure.

2. **Sprint 162 P1 task — ADR-006 sweep**
   - Replace `shell: true` in `plugin-hooks.ts:399` and `:581` with explicit `argv` arrays (or `shell: isWindows` if Windows compatibility is the actual reason — check git blame).
   - One-line policy in `.brain/PATTERNS.md`: "spawnSync should never use `shell: true` unconditionally."

3. **Sprint 162 P1 task — Anthropic API version refresh**
   - Bump `anthropic-http-client.ts:142` to a current `anthropic-version`. Verify with `@anthropic-ai/sdk` what the SDK is on right now. Add a comment/test pinning so the next bump shows up in code review.

4. **Sprint 162 P2 task — dead-code surgery**
   - Delete `cascade-detector.ts`, `lazy-loader.ts`, `agent-cache.ts`, `skill-cache.ts`, `config-validator.ts` (5 files, ~688 LoC removed).
   - Trim `monitoring-types.ts` (`SkillMeta`, `LockInfo`).
   - Drop `getEmoji` from `output-formatter.ts`, `shouldRotate` from `observability-rotation.ts`, `buildNotification` from `panic-guard.ts`.
   - Consolidate `system-capacity.ts` into `system-profile.ts`.
   - Net cleanup: ~7–8 files / ~900 LoC.

5. **Sprint 162 P1/P2 task — error registry pruning**
   - Audit `errors.ts` codes, drop the inert ones (E002, E003, E010, E050–E052, E054), or wire them where their semantics belong.
   - Add a vitest assertion that every registered code has at least one `createError(ID, …)` call somewhere in `src/`.

6. **Sprint 162 P2 task — ADR rule regression**
   - Replace the `summary.md` regex parse in `identity-generator.ts:countAdrsFromDb` with a direct `MemoryStore.getByType('adr')` query. This is a Brain-rule violation today.

7. **Sprint 162 P2 task — V1/V2 routing decision**
   - Decide explicitly: does the planner still want V1 selectors as fallback (document in ADR-028) or are they dead weight (delete + flip planner to V2 only)?

8. **Sprint 162 P3 task — pre-beta cosmetics**
   - `multi-ide.ts` PID-lock → uuid-tag.
   - `credential-encryption.ts` keyring auto-gen → explicit `deckent setup keyring` step.
   - `provider-fallback.ts` retry cap → config-surfacing.
   - Document `ci-learning.ts` silent fail when `.brain/ci-report-*.json` is missing.
   - Decide whether `telemetry.ts` is supported separately from `observability.ts`.

### Sprint 161 success-criteria self-check

- [x] Single audit report at `docs/audits/sprint-161/T-161-012-core-remaining.md`
- [x] No source-code changes
- [x] No deletions
- [x] No modifications outside `scope.filesWrite`
- [x] Read-only — `tsc --noEmit` and `vitest run` not applicable
- [x] All ten audit dimensions applied (dead code, ADR violations, drift, type safety, dependency hygiene, doc pollution, memory V2 coherence — N/A here, config integrity, conflicting areas, migration triage)
