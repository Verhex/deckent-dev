# T-161-006 — Core Model Registry + Mode Presets Audit

**Sprint:** 161 (Lane 1, READ-ONLY pre-beta audit)
**Task:** Audit `src/core/model-registry.ts` and `src/core/mode-presets.ts`
**Date:** 2026-05-08
**Mode:** READ-ONLY — no source changes; report only.
**Lead questions (DIRECTIVES.md):**
1. Is the "13 models / 3 providers / 4 tiers" claim accurate?
2. What is the current status of the Sprint 150 H3 `MODE_PRESETS` duplicate debt?
3. Is tier equivalence (premium ↔ opus / gpt-5 / gemini-2.5-pro …) consistent across files?

---

## 1. Scope

| File | LoC | Role |
|------|-----|------|
| `src/core/model-registry.ts` | 335 | Canonical model catalog + `ModelRegistry` class (singleton) |
| `src/core/mode-presets.ts` | 112 | `MODE_PRESETS` (4 plan modes) + `ModelStrategy` interface + tier helpers |

**Read-only cross-reference files (not in audit scope, consulted only to verify behaviour):**
- `src/core/model-equivalence.ts:1-148` — depends on registry; structurally couples to mode-presets via `ModelTier`.
- `src/core/config.ts:75-120` — consumes `MODE_PRESETS` (single-source for `max_workers`).
- `src/core/task-types.ts:5,43,62,110` — consumes `modelRegistry` for ALL_MODELS/apiId/tier.
- `src/core/model-registry-refresh.ts:242` — uses `setLastRefresh()`.
- `src/cli/commands/doctor.ts`, `src/cli/auto-setup.ts`, `src/cli/helpers/selective-retry.ts`, `src/orchestra/sprint-utils.ts`, `src/orchestra/sprint-docs-updater.ts`, `src/orchestra/managed-docs/{template-renderer,content-generators}.ts`, `src/providers/gemini.ts` — registry consumers.
- `tests/core/model-registry.test.ts`, `tests/core/model-registry-refresh.test.ts`, `tests/core/config-corrupted-recovery.test.ts`, `tests/e2e/provider-matrix/claude-codex-mixed.test.ts` — test consumers.

**Out-of-scope (explicit):** `tests/`, `.brain/`, `.deckent/`, `.github/`, root configs.

---

## 2. Findings

Severity scale: **P0** (blocker for beta) > **P1** (must-fix soon) > **P2** (debt) > **P3** (cleanup).

### 2.1 Numerical claims verification (Lead Q1) — PASS

The "13 models / 3 providers / 4 tiers" claim repeated in `IDENTITY.md`, `DECKENT.md`, `BETA-TRACKER.md`, and `PROJECT-IDENTITY.md` is **accurate** as of HEAD.

| Dimension | Claim | Found | Evidence |
|-----------|-------|-------|----------|
| Model count | 13 | **13** ✓ | `model-registry.ts:43-177` — Claude (3) + Codex (6) + Gemini (4) |
| Provider count | 3 | **3** ✓ | `model-registry.ts:10` — `RegistryProviderName = 'claude' \| 'codex' \| 'gemini'` |
| Tier count | 4 | **4** ✓ | `model-registry.ts:12` — `'economy' \| 'standard' \| 'premium' \| 'premium_plus'` |

Per-tier breakdown:
- `premium_plus` (2): `o3` (codex), `gemini-3.1-pro-preview` (gemini, status: preview)
- `premium` (3): `opus`, `gpt-5`, `gemini-2.5-pro`
- `standard` (4): `sonnet`, `gpt-4.1`, `o4-mini`, `gemini-2.5-flash`
- `economy` (4): `haiku`, `gpt-5-mini`, `gpt-4.1-mini`, `gemini-2.0-flash`

→ **Dimension 4 (Drift):** Documentation matches code.

### 2.2 [P1] MODE_PRESETS / DEFAULT_MODES partial duplication still open (Lead Q2)

**Status:** Sprint 150 consolidated `max_workers`; remaining v1 fields are still hard-coded.
**Reference:** `docs/audits/sprint-152/T-152-024-config-duplicate.md` and `docs/ROADMAP-GOD-LEVEL.md:65,449` (ticket `T-151-NEW-H`, marked optional).

**Evidence (`src/core/config.ts:89-120`):**
```
performance: { max_workers: MODE_PRESETS['performance']!.max_workers,  // ✓ derived
               brain_model: 'opus',          // ✗ hard-coded (should derive from MODE_PRESETS.performance.model_strategy.brain_tier)
               default_model: 'opus',        // ✗ hard-coded
               haiku_allowed: true,          // ✗ hard-coded (could derive from min_tier)
               brain_planning: 'auto' }      // ✗ hard-coded
balanced:   { …, brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true, … }
economic:   { …, brain_model: 'sonnet', default_model: 'sonnet', haiku_allowed: false, … }
api:        { …, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true, budget_per_sprint: 5.0, requires: 'ANTHROPIC_API_KEY', … }
```

The Sprint 152 audit observed the same partial state ("max_workers ✅ duplication kapalı; brain_model/default_model/haiku_allowed/brain_planning ❌ hâlâ hard-coded").
Comparing `MODE_PRESETS` (`mode-presets.ts:35-80`) against `DEFAULT_MODES` (`config.ts:89-120`):

| Mode | brain_tier (preset) | brain_model (default) | Aligned? |
|------|--------------------|------------------------|----------|
| performance | premium | opus | ✓ |
| balanced | standard | sonnet | ✓ |
| economic | standard | sonnet | ✓ |
| api | premium | opus | ✓ |

| Mode | worker_tier (preset) | default_model (default) | Aligned? |
|------|---------------------|--------------------------|----------|
| performance | premium | opus | ✓ |
| balanced | premium | opus | ✓ |
| economic | standard | sonnet | ✓ |
| api | standard | sonnet | ✓ |

→ Currently consistent **by construction** (both edited together), but the duplication is the bug surface — silent drift becomes possible the moment one is changed without the other. `tests/core/config-corrupted-recovery.test.ts:175-200` only enforces `max_workers` parity; no test guards `brain_model`/`default_model` parity.

**Risk:** P1. A future sprint that touches `MODE_PRESETS.balanced.brain_tier = 'premium'` will not automatically update `DEFAULT_MODES.balanced.brain_model = 'sonnet'`, producing config drift detectable only at runtime via wrong worker provisioning.

**Lead Q2 conclusion:** The duplicate MODE_PRESETS debt is **partially resolved (Sprint 150) and still open (Sprint 161)**. Audit confirms `T-151-NEW-H` should remain on the roadmap.

→ Dimension 3 (Conflicting areas), Dimension 9 (Config integrity).

### 2.3 [P1] `TIER_ORDER` defined twice with identical values

**Two definitions:**
- `src/core/model-registry.ts:181-186` — `const TIER_ORDER` (file-private)
- `src/core/mode-presets.ts:85-90` — `export const TIER_ORDER`

Both are `Record<ModelTier, number>` mapping `economy=0, standard=1, premium=2, premium_plus=3`. The exported version in `mode-presets.ts` has **no callers in `src/`** (verified via `grep -r "TIER_ORDER" src/`).

**Risk:** P1. If a fifth tier is added (e.g., `enterprise`), one constant must be updated in two files. Compile passes, but `compareTiers` / `isAtLeastTier` could disagree silently.

**Mitigation candidate (Sprint 162+):** Delete `TIER_ORDER` from `mode-presets.ts`; consumers use `modelRegistry.compareTiers()` / `isAtLeastTier()` (instance methods on the singleton).

→ Dimension 3 (Conflicting areas), Dimension 1 (Dead code on `mode-presets`-side).

### 2.4 [P1] `compareTiers` and `isAtLeastTier` defined twice

| Location | Form | Callers in `src/` |
|----------|------|---------------------|
| `model-registry.ts:262-264` | instance method `compareTiers(a, b)` | none in `src/` (only `tests/core/model-registry.test.ts:281-298`) |
| `model-registry.ts:266-269` | instance method `isAtLeastTier(modelId, minTier)` | none in `src/` (only `tests/core/model-registry.test.ts:301-329`) |
| `mode-presets.ts:95-97` | free function `compareTiers(a, b)` | **none anywhere** (no test or src usage) |
| `mode-presets.ts:102-104` | free function `isAtLeastTier(tier, minTier)` | **none anywhere** |

**Both `mode-presets.ts` free functions are dead code.** They are exported but never imported. `getModePreset` (also in mode-presets.ts) is consumed by `cli/commands/init-steps.ts:40` and `cli/auto-setup.ts:12`, so the file itself is alive — these helper functions are not.

**Note:** `model-registry.ts` instance methods `compareTiers`, `isAtLeastTier`, `estimateCost`, `unregister`, `getEquivalent` are also test-only. They form an intentional public API on the class but are not exercised in production paths today. Treat as **API surface to keep** (it is the canonical home), but flag the duplicates in `mode-presets.ts` for removal.

→ Dimension 1 (Dead code), Dimension 3 (Conflicting areas).

### 2.5 [P2] `ModelTier` type defined three times

| Location | Definition |
|----------|------------|
| `model-registry.ts:12` | `export type ModelTier = 'economy' \| 'standard' \| 'premium' \| 'premium_plus'` |
| `model-equivalence.ts:11` | identical literal-union (independent declaration) |
| `mode-presets.ts:5` | `import type { ModelTier } from './model-equivalence.js'` (re-uses equivalence's definition) |

TypeScript treats them as structurally compatible because they share an identical literal union, but each file resolves to a different declaration. `model-equivalence.ts:62` even has to bridge them: `return modelRegistry.getTier(model) as ModelTier;` — a cast that exists solely to translate "registry's `ModelTier`" into "equivalence's `ModelTier`".

The canonical home should be `model-registry.ts` (declared first, imported by `model-equivalence.ts`). `mode-presets.ts` should likewise import from `model-registry.ts` directly.

**Risk:** P2 (compile-safe today; smell + future divergence risk).

→ Dimension 5 (Type safety), Dimension 3 (Conflicting areas).

### 2.6 [P2] `TIER_PROVIDER_MAP` couples to declaration order

`model-equivalence.ts:35-54` `TIER_PROVIDER_MAP` hard-codes one canonical model per `(tier, provider)` pair, but the registry has multiple models in those buckets:

| `(provider, tier)` | Models in `BUILTIN_MODELS` | TIER_PROVIDER_MAP entry |
|--------------------|----------------------------|-------------------------|
| (codex, standard) | `gpt-4.1`, `o4-mini` | `gpt-4.1` |
| (codex, economy) | `gpt-5-mini`, `gpt-4.1-mini` | `gpt-5-mini` |
| (codex, premium_plus) | `o3` | (empty — falls back to premium = `gpt-5`) |
| (gemini, premium_plus) | `gemini-3.1-pro-preview` | (empty — falls back to premium = `gemini-2.5-pro`) |

`ModelRegistry.getByProviderAndTier(provider, tier)` (`model-registry.ts:225-229`) returns the first `.find()` match filtered by `status === 'ga'`. With current declaration order this happens to match `TIER_PROVIDER_MAP`, but the map and the registry method **share no programmatic link** — they happen to agree because of authorial discipline.

**Risk:** P2. Re-ordering `BUILTIN_MODELS` (e.g., to put `o4-mini` before `gpt-4.1`) silently changes `getByProviderAndTier('codex', 'standard')` while leaving `TIER_PROVIDER_MAP.standard.codex` unchanged → cross-provider equivalence drift.

→ Dimension 3 (Conflicting areas), Dimension 4 (Drift).

### 2.7 [P2] `premium_plus` tier preview models hidden from cross-provider equivalence

For the `premium_plus` tier, both reachable models (`o3`, `gemini-3.1-pro-preview`) are silently bypassed by `getEquivalentModel()`:

- `model-equivalence.ts:51-54` — `TIER_PROVIDER_MAP.premium_plus = {}` (empty object)
- `model-equivalence.ts:91-94` — falls back to `premium` for any premium_plus query

So `getEquivalentModel('opus', 'codex')` returns `gpt-5`, even though `o3` is the same-tier-or-better Codex model. The fallback is intentional ("preview status not auto-promoted") but hard-codes a policy that should arguably live as data on `BUILTIN_MODELS` (status-based eligibility) rather than in a separate map.

`ModelRegistry.getEquivalent()` (`model-registry.ts:231-251`) implements better behaviour: it tries `getByProviderAndTier` first, which would find the preview model but is filtered by `status === 'ga'` — so `o3` (ga) is reachable but `gemini-3.1-pro-preview` (preview) is filtered out. This logic is **unused**: the production path uses `model-equivalence.getEquivalentModel`, not `ModelRegistry.getEquivalent`.

**Risk:** P2. Two equivalence implementations (`getEquivalentModel` in equivalence.ts vs `getEquivalent` on registry) with subtly different rules; only one is wired.

→ Dimension 1 (Dead code on registry side), Dimension 3 (Conflicting areas).

### 2.8 [P2] `mode-presets.ts` lacks a dedicated test file

Despite exporting `MODE_PRESETS`, `ModelStrategy`, `TIER_ORDER`, `compareTiers`, `isAtLeastTier`, `getModePreset` — `find tests/ -name "mode-presets*"` returns no results. The only indirect coverage is `tests/core/config-corrupted-recovery.test.ts:175-200`, which checks `DEFAULT_MODES[mode].max_workers === MODE_PRESETS[mode].max_workers` for the four modes.

Untested:
- All 4 mode preset values (brain_tier, worker_tier, min_tier, max_tier, auto_upgrade, auto_downgrade)
- `getModePreset(mode)` for valid + invalid modes
- `mode-presets.ts` `TIER_ORDER` ordering is correct (so far it is, but no guard)

`.deckent/sprint-141-analysis-archive/meta/coverage-perf-errors-todo.md:53` already flagged this as "no dedicated test"; it has not been added since.

**Risk:** P2 (low blast radius — values are simple data, but a regression here cascades into all mode resolution logic).

→ Dimension 4 (Drift), Dimension 1 (Dead-ish code without coverage).

### 2.9 [P2] `BUILTIN_MODELS[opus].apiId` is `claude-opus-4-6` while runtime metadata advertises `claude-opus-4-7`

**Evidence:**
- `model-registry.ts:47` — `apiId: 'claude-opus-4-6'`
- Environment metadata (this audit's runtime context) — "Opus 4.7: 'claude-opus-4-7' is the most recent". `claude-sonnet-4-6` (sonnet) and `claude-haiku-4-5-20251001` (haiku) both already match the latest.

This may be **intentional** (Deckent pins to opus 4.6 for stability) or **stale** (Sprint 159 changed Anthropic CLI auth detection but did not bump opus). The audit cannot decide policy; it can flag the divergence so Brain can rule.

`tests/core/model-registry.test.ts` does not assert any `apiId` value, so a bump will not break tests.

**Risk:** P2 / UNCERTAIN — recommend Brain decision in Sprint 162 (bump or document the pin).

→ Dimension 4 (Drift between docs/runtime expectations and code).

### 2.10 [P3] `getByProviderAndTier` returns first match silently (status-filtered)

`model-registry.ts:225-229` uses `.find()` with `m.status === 'ga'`. When two ga models share a `(provider, tier)`, declaration order decides. As of HEAD this happens to match `TIER_PROVIDER_MAP`, but there is no comment, test, or invariant pinning the choice.

→ Dimension 7 (Documentation pollution / under-specification).

### 2.11 [P3] Header comment of `model-registry.ts` claims "Single source of truth"

`model-registry.ts:1-3`:
```
// ─── Model Registry ─────────────────────────────────────────────────────────
// Single source of truth for all model definitions across providers.
// All other modules (task-types, model-equivalence, providers) delegate here.
```

The first sentence is accurate for `BUILTIN_MODELS` and `apiId` lookups. The second is **partially false**: `mode-presets.ts` re-defines `TIER_ORDER`, `compareTiers`, `isAtLeastTier`; `model-equivalence.ts` re-defines `ModelTier` and the `TIER_PROVIDER_MAP`. The "Single source of truth" claim should be tightened (or those duplicates deleted).

→ Dimension 4 (Drift comments vs reality), Dimension 7 (Documentation pollution).

### 2.12 [P3] `staleAfterMs` public field on singleton

`model-registry.ts:193` — `readonly staleAfterMs: number = 7 * 24 * 60 * 60 * 1000;`

Public field with hard-coded 7-day value. Adjusting requires either a new instance or the optional override on each `isStale()` call (`model-registry.ts:283-287`). Used by `model-registry-refresh.ts` per `tests/core/model-registry-refresh.test.ts:83-109`. Acceptable as-is; document the rationale or move to a config key.

→ Dimension 7 (Documentation), Dimension 9 (Config integrity).

### 2.13 ADR cross-check (Dimension 2)

| ADR | Constraint | Status in scope |
|-----|------------|-----------------|
| ADR-001 | TypeScript + ESM | ✓ both files use `.js` extensions in imports |
| ADR-002 | Node16 module resolution | ✓ explicit `.js` (e.g., `mode-presets.ts:5`, `model-registry.ts:5`) |
| ADR-008 | Brain merkezi import — tek yönlü | ✓ neither file imports from `orchestra/`, `agents/`, `connectors/` |
| ADR-015 | TaskRouter — 6-level routing | ✓ these modules are upstream data sources for TaskRouter (consumed via `model-equivalence` + `task-types`); no inline router logic here |

No ADR violations detected. Both files respect the ADR-008 dependency direction (core → no orchestra).

### 2.14 Type safety review (Dimension 5)

- `model-registry.ts`: zero `any`, zero `as unknown as`, zero `// @ts-ignore`. Uses `as const`, `Record`, `Map<string, ModelDefinition>`. Clean.
- `mode-presets.ts`: zero `any`, zero `as unknown as`. Uses `Readonly<Record<…>>`, `as const`. Clean.
- The only smell is the cross-file `as ModelTier` in `model-equivalence.ts:62` (out of audit scope but caused by §2.5).

### 2.15 Dependency hygiene (Dimension 6)

- All imports use `.js` extensions ✓
- No circular import: `mode-presets.ts → model-equivalence.ts → model-registry.ts` (linear chain).
- `mode-presets.ts` could shorten this chain by importing `ModelTier` directly from `model-registry.js` — current indirection through `model-equivalence` is gratuitous.

### 2.16 Memory V2 coherence (Dimension 8)

Not applicable — neither file touches the SQLite DB or `.brain/`.

---

## 3. Migration triage (Lane 1 / Beta-readiness classification)

| File | Class | Rationale |
|------|-------|-----------|
| `src/core/model-registry.ts` | **KEEP-PRIVATE** | Internal singleton consumed only via `core/` and `orchestra/`. Not part of `.contracts/api-surface.md`. Should remain a private surface. The `ModelDefinition` interface is suitable for documentation but not as a publicly exported contract. |
| `src/core/mode-presets.ts` | **KEEP-PRIVATE** | `MODE_PRESETS` and `ModelStrategy` are configuration internals — exposing them publicly would lock the 4-mode taxonomy as API. Recommend documenting `MODE_PRESETS` in `docs/reference/config.md` (already exists per grep) but not re-exporting from a public entry point. |

No DELETE-CANDIDATE files in scope; identified DELETE-CANDIDATE *symbols* (within KEEP-PRIVATE files):
- `mode-presets.ts:85-104` — `TIER_ORDER`, `compareTiers`, `isAtLeastTier` (zero callers).
- `model-registry.ts:289-295` — `register()` / `unregister()` instance methods (test-only; consider gating behind dev-only export or removing if Sprint 155 model-registry-refresh does not need them).

---

## 4. Recommendation (Sprint 162+ work; NOT a code change here)

Suggested follow-up tasks for a future sprint, ordered by ROI:

### R1 [P1] — Close `T-151-NEW-H`: derive remaining `DEFAULT_MODES` fields from `MODE_PRESETS`
Refactor `src/core/config.ts:89-120` so `brain_model`, `default_model`, `haiku_allowed`, `brain_planning` are computed from `MODE_PRESETS[mode].model_strategy` (e.g., `brain_model = modelRegistry.getByProviderAndTier(provider, preset.brain_tier)?.id`). Add a parity test extending `tests/core/config-corrupted-recovery.test.ts:175-200` to cover all four fields. Effort: 2-3h. Closes Sprint 150 H3 / Sprint 152 §2 partial-resolution.

### R2 [P1] — Consolidate tier helpers in `model-registry.ts`
Delete `TIER_ORDER`, `compareTiers`, `isAtLeastTier` from `mode-presets.ts` (zero callers). Update documentation to point at `modelRegistry.compareTiers()` / `.isAtLeastTier()`. Effort: 30 min. Closes §2.3 + §2.4.

### R3 [P2] — Single-declaration `ModelTier`
Delete `model-equivalence.ts:11` `ModelTier` re-declaration; have it `export type { ModelTier } from './model-registry.js'`. Update `mode-presets.ts:5` to import from `model-registry.js`. Removes the `as ModelTier` cast at `model-equivalence.ts:62`. Effort: 30 min. Closes §2.5.

### R4 [P2] — Wire `ModelRegistry.getEquivalent()` or remove it
Decide: either replace `model-equivalence.getEquivalentModel()` with `modelRegistry.getEquivalent()` (single implementation) or drop the unused method to honour the file's "Single source of truth" claim. Either way the duplicate equivalence logic in §2.7 disappears. Effort: 1-2h. Closes §2.7 + §2.11.

### R5 [P2] — Add a focused test file `tests/core/mode-presets.test.ts`
Cover all four mode presets, `getModePreset(mode)`, and (post-R2) the singleton `compareTiers/isAtLeastTier`. Effort: 1h. Closes §2.8.

### R6 [P2] — Brain decision on `opus` apiId
Either bump `model-registry.ts:47` from `'claude-opus-4-6'` to `'claude-opus-4-7'` if the project follows latest, or add a one-line comment pinning the version with a justification. Effort: 5 min + decision.

### R7 [P3] — Document `getByProviderAndTier` ordering invariant
Add a one-line comment to `model-registry.ts:225` explaining that declaration order in `BUILTIN_MODELS` defines canonical-model selection when multiple ga models share a `(provider, tier)`. Or: stabilize the choice with an explicit `canonical: true` flag on `ModelDefinition`. Effort: 5 min (comment) / 1h (flag).

### R8 [P3] — Tighten `model-registry.ts` header comment
After R2-R3-R4, restore the literal accuracy of "Single source of truth for all model definitions" by ensuring no other file re-implements tier ordering, equivalence logic, or `ModelTier`.

---

## 5. Audit summary

| Dimension | Hits | Severity range |
|-----------|------|----------------|
| 1. Dead code | 4 (mode-presets duplicate helpers; some registry test-only methods) | P1 / P3 |
| 2. ADR violations | 0 | — |
| 3. Conflicting areas | 4 (TIER_ORDER × 2, compareTiers × 2, isAtLeastTier × 2, ModelTier × 3, equivalence-fn × 2) | P1 / P2 |
| 4. Drift | 3 (DEFAULT_MODES partial sync, opus apiId vs runtime metadata, header comment vs reality) | P1 / P2 / P3 |
| 5. Type safety | 0 in scope (1 cross-file `as ModelTier` in equivalence.ts) | — |
| 6. Dependency hygiene | 1 (gratuitous `mode-presets → equivalence → registry` chain for a type) | P3 |
| 7. Documentation pollution | 2 | P3 |
| 8. Memory V2 coherence | n/a | — |
| 9. Config integrity | 1 (Sprint 150 H3 partial) | P1 |
| 10. Migration triage | 2 KEEP-PRIVATE files; symbol-level DELETE-CANDIDATEs identified | — |

**Verdict:** No P0 issues. The audit confirms the 13/3/4 numbers in `IDENTITY.md` and `BETA-TRACKER.md` are correct. The Sprint 150 H3 `MODE_PRESETS` consolidation is **partially resolved**; remaining cleanup (R1-R3 above) is well-defined and low-risk. Beta-readiness is not blocked by anything in this audit scope, but the duplicate symbols (R2-R3) and config drift surface (R1) should be cleared in Sprint 162-163 before any external API stabilization.

---

## 6. Provenance & verification

- **HEAD reviewed:** see `docs/audits/sprint-161/PRE-AUDIT-HEAD-SHA.txt` (sprint-161 baseline).
- **Cross-references:** `docs/audits/sprint-152/T-152-024-config-duplicate.md`, `docs/ROADMAP-GOD-LEVEL.md:65,449`, `BETA-TRACKER.md:829`, `BETA-TRACKER-TR.md:721`, `CLAUDE.md:43`, `.brain/PROJECT-IDENTITY.md:22`.
- **Tests consulted (out of scope but referenced):** `tests/core/model-registry.test.ts` (~30 tests), `tests/core/model-registry-refresh.test.ts`, `tests/core/config-corrupted-recovery.test.ts:175-200`.
- **Boundary check:** This audit produced exactly one file change — `docs/audits/sprint-161/T-161-006-core-model-mode.md`. No source code was modified (READ-ONLY mandate, ADR-039).

— end of T-161-006 —
