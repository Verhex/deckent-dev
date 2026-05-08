# T-161-014 — `src/orchestra/` planner + task-builder Audit

**Sprint:** 161 (God-Level READ-ONLY Self-Audit, Lane 1)
**Task:** 161-014
**Mode:** READ-ONLY
**Date:** 2026-05-08
**Auditor:** doc-writer + typescript-expert (worker w-161-014)

---

## 1. Scope

Audited modules (≤8 files, ≤2000 LoC mandate respected):

| File | LoC | Role |
|---|---|---|
| `src/orchestra/planner.ts` | 522 | AI planner prompt construction, response parsing, subprocess invocation, zero-config flow |
| `src/orchestra/task-builder.ts` | 888 | Task creation, directive parsing (structured + bullet), scope extraction, override resolution, worker prompt assembly |

Cross-referenced (read-only) for context:
- `src/core/task-types.ts:338-361` (`PlannerTask`, `PlannerResult` shapes)
- `src/orchestra/sprint-planner.ts` (consumer of both modules)
- `src/orchestra/prompt-god-template.ts` (worker-prompt delegate)
- `src/orchestra/brain.ts` (barrel re-exports)

Lead audit questions answered:

1. **Structured vs AI mode parity?** — Partial drift; AI mode silently strips override fields (see Finding F1).
2. **Directive parser correctness?** — Two parsers (`parseStructuredDirectives`, `parseBulletOrNumberedTasks`) share the override-extraction surface but skip `excludeAgent` (Finding F4).
3. **Override resolution (forceModel/Agent/Skills)?** — Type-safe at the static level; runtime path through Zod is incomplete for AI-mode tasks.

---

## 2. Findings (severity × 10 dimensions)

### F1 — `PlannerTaskSchema` Zod drift drops AI-mode overrides — **P1 (Drift / Type Safety)**

`PlannerTask` (`src/core/task-types.ts:338-356`) declares `forceAgent`, `forceSkills`, `excludeAgent`, `excludeSkills` as optional override fields. The Zod runtime schema `PlannerTaskSchema` (`src/orchestra/planner.ts:19-37`) does **not** list any of those keys. Because `z.object()` defaults to *strip* unknown keys (neither `.passthrough()` nor `.strict()` is applied), any AI-planner output containing `forceAgent` etc. is **silently discarded** during `parsePlannerResponse` (`planner.ts:255-275`).

Consequence: `plannerTaskToParams` (`task-builder.ts:663-686`) reads `pt.forceAgent` / `pt.forceSkills` / `pt.excludeAgent` / `pt.excludeSkills` from the *typed* `PlannerTask`, but at runtime they will always be `undefined` after Zod parsing — no matter what the AI emits.

This makes the AI-planner override path **non-functional** while the structured-directive path (which extracts `Agent:`/`Skills:` lines into `ParsedDirectiveTask`) works as expected. Net: structured vs AI mode parity is **broken** for overrides.

**Dimension:** Drift (comments vs behavior), Type safety, Conflicting areas (structured ≠ AI parity).

### F2 — Circular import between `task-builder.ts` and `prompt-god-template.ts` — **P2 (Dependency hygiene)**

- `task-builder.ts:21-22` imports `buildTaskPrompt` (value) and `SprintContext` (type) from `./prompt-god-template.js`.
- `prompt-god-template.ts:13` imports `truncateAtParagraph` from `./task-builder.js`.

This forms a runtime cycle (value↔value via `buildTaskPrompt` ↔ `truncateAtParagraph`). `.contracts/api-surface.md` Module Import Rules (ADR-008 derived): "Circular dependencies are FORBIDDEN."

ESM Node16 resolution generally tolerates value cycles when first-load order keeps top-level execution stateless, and the tests pass — so the practical breakage risk is low *today*. It is, however, a latent fragility (any newly-added top-level state in either module can cause `undefined` at first reference) and is explicitly disallowed by the contract.

**Dimension:** Dependency hygiene, ADR-008 spirit (no circular deps).

### F3 — `queryRelevantADRs` exported but unused in production — **P2 (Dead code)**

`task-builder.ts:741-796` defines and exports `queryRelevantADRs(taskDescription, taskScope, projectRoot?, task?)`. A `grep -r` across `src/` and `tests/` shows **zero call sites** (only two stale doc comments in `tests/orchestra/task-builder.test.ts:12,2117` reference the symbol by name).

ADR injection at runtime is now performed inside `buildWorkerPrompt` (`task-builder.ts:822-837`) by loading `MemoryStore` directly and passing `allAdrs` to `buildTaskPrompt`. `queryRelevantADRs` therefore appears to be a leftover from the pre-`prompt-god-template` refactor.

**Dimension:** Dead code (unused exports). KEEP-vs-DELETE decision deferred to Sprint 162+ (see triage §4).

### F4 — Directive parsers omit `excludeAgent` extraction — **P2 (Drift / Conflicting areas)**

The interface `ParsedDirectiveTask` (`task-builder.ts:120-136`) declares `excludeAgent?: string[]`. `CreateTaskParams` (line 117), `createTask` (line 261), and `plannerTaskToParams` (line 683) all propagate it. But the two directive parsers — `parseStructuredDirectives` (lines 416-522) and `parseBulletOrNumberedTasks` (lines 535-652) — never extract or populate `excludeAgent`. They pull `forceAgent`, `forceSkills`, `excludeSkills` (note the asymmetry with the second-to-last) but skip `excludeAgent` entirely.

Effect: directive authors cannot exclude a single agent via DIRECTIVES.md; the field is reachable only by callers constructing `ParsedDirectiveTask` programmatically (and there are none). This is the structured-directive twin of Finding F1: both override pipelines have asymmetric coverage of the four override fields.

**Dimension:** Drift (interface vs implementation), Conflicting areas (parser pair asymmetry).

### F5 — Hardcoded `language='tr'` in AI planner entry points — **P3 (Drift / Config integrity)**

- `callBrainPlanner` (`planner.ts:331-351`) hardcodes `'tr'` at line 340 when calling `buildPlanPrompt`. It accepts no `language` argument.
- `callZeroConfigPlanner` (`planner.ts:475-494`) calls `buildZeroConfigPlanPrompt(description, projectName, fileTree)` at line 483 with no language argument, so it defaults to `'tr'`.

Both prompt builders (`buildPlanPrompt` line 124; `buildZeroConfigPlanPrompt` line 366) accept a `language: string = 'tr'` parameter and emit fully-translated EN/TR variants. The English variant of either prompt is therefore **unreachable through public planner functions**, despite the i18n branch existing in source. ADR-032 (i18n Pattern System) suggests TR/EN parity should be honored.

**Dimension:** Drift, Config integrity.

### F6 — Zero-config functions exported but not wired into any sprint entry — **P3 (Dead code candidate)**

`buildZeroConfigPlanPrompt` (line 362), `callZeroConfigPlanner` (line 475), and `buildZeroConfigFallbackPlan` (line 501) are exported from `planner.ts` but consumed only by `tests/orchestra/planner-zeroconfig.test.ts` and self-references inside `planner.ts`. No `src/cli/`, `src/mcp/`, or `src/orchestra/` module references them.

The functions look intentional — they implement the "Zero-Config Mode" feature described in `buildPlanPrompt` lines 140-144 — but the wiring (a CLI command or `set-directives` shortcut that calls `callZeroConfigPlanner`) is absent. UNCERTAIN: this may be staged work waiting for a Sprint 162+ wire, or it may be abandoned. (Sprint 134/135 lineage suggests staged.)

**Dimension:** Dead code (uncertain), Drift (feature description vs wired behavior).

### F7 — Duplicated `as unknown as [string, ...string[]]` pattern — **P3 (Type safety)**

Identical idiom appears in:
- `planner.ts:16`: `const MODEL_ENUM_VALUES = ALL_MODELS as unknown as [string, ...string[]];`
- `task-builder.ts:27`: `const MODEL_ENUM_VALUES = ALL_MODELS as unknown as [string, ...string[]];`

The cast is necessary because Zod's `z.enum()` requires a non-empty tuple type but `ALL_MODELS` is typed as `readonly ModelType[]` (`task-types.ts:43`). The duplication is harmless but suggests a shared helper (e.g. `asEnumTuple<T>()`) is warranted, or that `ALL_MODELS` should be exported with a stricter tuple type at source. typescript-expert skill flags `as unknown as` chains as worth surfacing.

**Dimension:** Type safety, Conflicting areas (DRY).

### F8 — `extractScopeFromDirective` overlapping regex blocks — **P3 (Brittleness)**

`task-builder.ts:274-368` uses six independent regex passes plus two label-based passes against the same line, deduping into `filesWrite` via `Array.includes`. Specifically, lines 349 (`\b[\w/.-]+\.(?:ts|js)\b`), 358 (`\b([\w.-]+\.(?:md|json|ts|js|yaml|yml))\b`), and 341 (root-level dotfiles via negative lookbehind) overlap on `.ts`/`.js` matches. The runtime is correct — `includes` guards prevent dupes — but the order-dependent regex stack is fragile: any new file-pattern need would force the author to reason about whether to insert before or after the existing blocks.

`maskCodeBlocks` (line 400) is a sound defense against fenced-code false positives; tests pass. P3 because the function works, but it is a maintenance hot-spot.

**Dimension:** Type safety (implicit string regex contract), Brittleness.

### F9 — Direct `spawnSync` call without ADR-006 SpawnOptions interface — **P3 (ADR-006/007 alignment)**

`planner.ts:344-348` and `planner.ts:487-490` call `spawnSync(command, args, { encoding: 'utf-8', timeout: ... })` directly. ADR-006 (spawnSync security pattern) and ADR-007 (SpawnOptions Interface) are both *accepted*. Inspecting the calls:

- No `shell: true` (good).
- `command` is the first whitespace-split token from `adapter.buildCommand()` (`planner.ts:296-297`) — could in theory contain a path with metacharacters from a malicious provider adapter, but no shell interpretation occurs, so injection surface is minimal.
- No `cwd` constraint, no `env` filtering. The provider CLI inherits the parent's environment — acceptable for trusted CLIs.
- `timeout` is honored via the `timeout?` parameter or `BRAIN_PLAN_TIMEOUT_MS`. Good.

This is **not** a violation; it is an alignment note. If the codebase has a `SpawnOptions` helper (per ADR-007), `planner.ts` does not use it. P3 because behavior is correct.

**Dimension:** ADR-006/007 alignment.

### F10 — Documentation pollution: `BUG-25` reference orphan — **P3 (Doc pollution)**

`task-builder.ts:278` carries the comment `// BUG-25: Explicit Files:/Dosya: and Scope:/Kapsam: label parsing (highest priority)`. There is no `BUG-25` in the current `.brain/DEBT.md`, `docs/CHANGELOG.md`, or `docs/SPRINT-LOG.md`. This is either a stale tracker reference (the bug was resolved and the comment forgotten) or a personal note. Future readers cannot resolve "BUG-25" → context.

**Dimension:** Documentation pollution.

### F11 — `validateDirective` duplicates Zod's own error formatting — **P3 (Code quality)**

`task-builder.ts:60-93` reimplements Zod error formatting via `result.error.format()` and a manual nested-object walk. Zod ships `result.error.flatten()` and `result.error.issues` which provide structured paths out of the box. The hand-rolled walker (lines 70-91) is fragile to Zod minor-version changes (the inner `_errors` shape is a Zod internal). P3 because tests pass and the output is human-readable.

**Dimension:** Code quality, Brittleness.

### F12 — `resolveWorkerEffort` widens TaskEffort to a four-value union — **P3 (Type safety)**

`task-builder.ts:695-703` returns `'max' | 'high' | 'medium' | 'low'`, but `task.forceEffort` is typed as `TaskEffort` (`'low' | 'normal' | 'high'`). The cast `task.forceEffort as 'max' | 'high' | 'medium' | 'low'` (line 697) is narrowed by the return type, **but the input value `'normal'` does not appear in the output union** — so calling with `forceEffort='normal'` will return `'normal'` even though the return type forbids it. The type lies.

A consumer reading this return value and switching on `'max'|'high'|'medium'|'low'` will fall into the default branch on `'normal'` without warning. Verify via `typescript-expert` skill: the cast should be replaced with an explicit map (`normal → medium`) or the return type widened to include `'normal'`.

**Dimension:** Type safety (`as` cast hides invalid case).

---

## 3. Evidence (file:line citations)

| Finding | Citations |
|---|---|
| F1 | `src/orchestra/planner.ts:19-37` (Zod schema), `src/core/task-types.ts:338-356` (interface), `src/orchestra/planner.ts:255-275` (parser), `src/orchestra/task-builder.ts:663-686` (consumer) |
| F2 | `src/orchestra/task-builder.ts:21-22`, `src/orchestra/prompt-god-template.ts:13` |
| F3 | `src/orchestra/task-builder.ts:741-796` definition; zero `src/` callers; `src/orchestra/task-builder.ts:822-837` is the live ADR-injection path |
| F4 | `src/orchestra/task-builder.ts:120-136` (interface), `:497-519` (structured parser, Agent/Skills extracted, no excludeAgent), `:609-642` (bullet parser, Agent/Skills extracted, no excludeAgent) |
| F5 | `src/orchestra/planner.ts:340` (`'tr'` hardcoded), `:483` (no language passed); EN branches at `:172`, `:374` |
| F6 | `src/orchestra/planner.ts:362,475,501`; tests: `tests/orchestra/planner-zeroconfig.test.ts` |
| F7 | `src/orchestra/planner.ts:16`, `src/orchestra/task-builder.ts:27` |
| F8 | `src/orchestra/task-builder.ts:274-368`, label passes at `:279,291`, regex passes at `:302,310,323,331,341,349,358` |
| F9 | `src/orchestra/planner.ts:344-348,487-490` |
| F10 | `src/orchestra/task-builder.ts:278` |
| F11 | `src/orchestra/task-builder.ts:60-93` |
| F12 | `src/orchestra/task-builder.ts:695-703`; consumer `src/orchestra/prompt-god-template.ts` (`effort: 'max'|'high'|...`) |

---

## 4. Migration triage

Per Sprint 161 mandate, classify each audited file:

| File | Classification | Rationale |
|---|---|---|
| `src/orchestra/planner.ts` | **KEEP-PRIVATE** | `@internal` JSDoc on every export (lines 51, 113, 251, 280, 308, 321). Used only by `sprint-planner.ts`. Re-export through `brain.ts` is consumer-internal. The Zero-Config functions (F6) are UNCERTAIN — keep private until wired or removed. |
| `src/orchestra/task-builder.ts` | **KEEP-PRIVATE** | Re-exported via `brain.ts:46-47` (the orchestra barrel). External consumers (`cli/spawn.ts`, etc.) import `buildWorkerPrompt` directly, but this is internal CLI plumbing — not a public API surface. ADR-008 designates `brain.ts` as the orchestrator's import-aggregation point. |

Sub-classifications (function-level):

| Symbol | Disposition | Note |
|---|---|---|
| `planner.ts::buildZeroConfigPlanPrompt`/`callZeroConfigPlanner`/`buildZeroConfigFallbackPlan` | **UNCERTAIN** | Either DELETE-CANDIDATE or wire-pending; needs Brain decision (Sprint 162) |
| `task-builder.ts::queryRelevantADRs` | **DELETE-CANDIDATE** | Superseded by inline `MemoryStore` logic in `buildWorkerPrompt` (lines 822-837). No production call sites. |
| `task-builder.ts::DirectiveSchema`/`DirectiveTaskSchema` | **KEEP-PRIVATE** | Used only by `validateDirective`; `validateDirective` itself is exported but only tests call it. Re-evaluate alongside F11. |

---

## 5. Recommendation (Sprint 162+ work)

Severity-ordered backlog. **None of these are code changes for Sprint 161** — they are recommendations for follow-on sprints.

### Priority 1 — Fix AI-mode override silent drop (F1)

Add the four override fields to `PlannerTaskSchema`:

```ts
const PlannerTaskSchema = z.object({
  // ...existing fields...
  forceAgent: z.string().optional(),
  forceSkills: z.array(z.string()).optional(),
  excludeAgent: z.array(z.string()).optional(),
  excludeSkills: z.array(z.string()).optional(),
});
```

Add an integration test that emits `forceAgent` from a mock provider and asserts `Task.forceAgent` survives `parsePlannerResponse → plannerTaskToParams → createTask`. Estimated effort: low (single sprint task). Eliminates structured/AI mode override parity drift.

### Priority 2 — Break circular dependency (F2)

Move `truncateAtParagraph` (`task-builder.ts:709-734`) into a leaf utility module (`src/core/text-utils.ts` or `src/orchestra/text-utils.ts`). Both `task-builder.ts` and `prompt-god-template.ts` would import from the leaf, breaking the cycle. Estimated effort: low.

### Priority 3 — Add `excludeAgent` to directive parsers (F4)

Mirror the existing `forceAgent` extraction (`task-builder.ts:498-505`, `:610-614`) with an `excludeAgent` extractor and propagate through `ParsedDirectiveTask → CreateTaskParams → createTask`. Closes the structured/AI override parity gap from the structured side.

### Priority 4 — Zero-Config wiring decision (F6)

Brain governance call: either land the CLI/MCP entry that consumes `callZeroConfigPlanner` (e.g. `deckent start "Add login page"`) OR remove the three exported functions plus their tests. Either path closes the dead-code uncertainty. Cross-reference Sprint 134 ADR-033/034 (Product Vision: zero-config UX is on roadmap).

### Priority 5 — DRY the Zod tuple coercion (F7)

Either:
1. Re-export `ALL_MODELS` from `task-types.ts` with a tuple-typed signature (use a `const` literal), or
2. Add a `core/zod-helpers.ts` with `asEnumTuple<T extends readonly string[]>(t: T)`.

Both call sites (`planner.ts:16`, `task-builder.ts:27`) would consume the helper. Eliminates duplicate `as unknown as` cast.

### Priority 6 — Type-correct `resolveWorkerEffort` (F12)

Replace the cast at `task-builder.ts:697` with an explicit map: `{ low: 'low', normal: 'medium', high: 'high' }[task.forceEffort]`. Or widen the return union to include `'normal'`. Sprint 162 cleanup task.

### Priority 7 — Surface remaining items

- F3: schedule `queryRelevantADRs` removal (low risk; follow F1 precedent of deleting after a sprint of validation).
- F5: thread `language` through `callBrainPlanner`/`callZeroConfigPlanner` from sprint config (`brain_planning_language`?).
- F8: extract scope regex passes into a single configurable table (`SCOPE_PATTERN_TABLE`) to localize future additions.
- F9: adopt the ADR-007 `SpawnOptions` interface inside `planner.ts` for consistency with the rest of the codebase.
- F10: resolve `BUG-25` — either link to the actual debt entry, restate as an inline rationale, or delete the comment.
- F11: replace hand-rolled Zod error walker with `result.error.flatten()`-based formatting.

---

## 6. ADR Compliance Summary

| ADR | Compliance | Note |
|---|---|---|
| ADR-001 (TS+ESM) | ✅ | All imports use `.js` suffix; TS strict elsewhere applies. |
| ADR-002 (Node16 resolution) | ✅ | `.js` extensions present on every `import` line. |
| ADR-006/007 (spawnSync security) | ⚠ Aligned | F9 — direct `spawnSync` use without `SpawnOptions` helper, but no `shell:true` and timeouts honored. |
| ADR-008 (one-way deps, no circular) | ❌ | F2 — `task-builder.ts ↔ prompt-god-template.ts` cycle. |
| ADR-024 (sprint-controller god split) | n/a | Not in scope. |
| ADR-032 (i18n pattern) | ⚠ Drift | F5 — TR-only entry path closes off EN. |
| ADR-035 (verification protocol) | ✅ | Schemas exist for parse boundaries. |
| ADR-036 (ADR governance) | ✅ | This audit itself complies. |
| ADR-037 (RBAC) | ✅ (read-only) | No source modification. |
| ADR-039 (self-modifying detection) | ✅ | Wired in `task-builder.ts:855-868`; confirmed live. |

---

## 7. Sprint-161 Lane 1 Compliance

- **scope.filesWrite single path:** `docs/audits/sprint-161/T-161-014-orch-planner.md` only. Confirmed.
- **No source-code modification:** Confirmed (read-only).
- **No tests/ touched:** Confirmed.
- **Single audit report output:** This file.

---

*End of audit T-161-014.*
