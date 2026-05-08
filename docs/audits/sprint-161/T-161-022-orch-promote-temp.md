# T-161-022 — Audit: src/orchestra/ — promotion-pipeline + temp-skill-generator

- **Sprint:** 161 (Lane 1, READ-ONLY)
- **Task:** T-161-022
- **Mode:** READ-ONLY static audit (no code changes)
- **Auditor model:** opus
- **Date:** 2026-05-08

---

## 1. Scope

| File | LoC | Purpose |
|---|---:|---|
| `src/orchestra/promotion-pipeline.ts` | 291 | Evaluate + execute temp→permanent agent/skill promotion and underperformer demotion |
| `src/orchestra/temp-skill-generator.ts` | 391 | Template-based, zero-AI generation of `project-conventions` skill, data-driven domain skills, and per-stack temp agents |

Cross-referenced (read-only):

- `src/orchestra/sprint-finalizer.ts:838-860` — only call site for `PromotionPipeline`
- `src/orchestra/sprint-planner.ts:391-413` — call sites for `generateProjectConventionsSkill` + `generateTempAgents`
- `src/cli/commands/init-steps.ts:43,551` — call sites for `getGeneratedContent`
- `tests/unit/promotion-pipeline.test.ts` (213 LoC)
- `tests/orchestra/promotion-guard.test.ts` (104 LoC)
- `tests/orchestra/temp-skill-generator.test.ts` (243 LoC)
- Live filesystem: `.deckent/agents/`, `.deckent/skills/`
- `tsconfig.json` (module: Node16), `package.json` (type: module)

---

## 2. Lead Question Answers

### Q1 — Is the Sprint 153 D3 "temp-temp-" double-prefix bug actually fixed?

**Partially.** The normalization fix is present and correct:

```ts
// promotion-pipeline.ts:121-123
const baseId = entityId.startsWith('temp-') ? entityId.slice('temp-'.length) : entityId;
const persistentTempDir = join(this.projectRoot, '.deckent', 'agents', `temp-${baseId}`);
const permDir = join(this.projectRoot, '.deckent', 'agents', baseId);
```

The fix correctly handles both `promote('react-ts-specialist', 'agent')` and `promote('temp-react-ts-specialist', 'agent')` — both produce source `temp-react-ts-specialist/` and destination `react-ts-specialist/`.

**However**, the repair is incomplete (see Findings F-1, F-2, F-4, F-5 below).

### Q2 — Demotion path correctness?

**Asymmetric and partially broken.** `promote()` normalizes the `temp-` prefix; `demote()` does NOT. See Finding F-2 below.

---

## 3. Findings (severity-ordered)

### F-1 — P1 — Legacy fallback is dead under ESM (drift, dead code, ADR-001/002 violation)

**Where:** `src/orchestra/promotion-pipeline.ts:277-291`

```ts
function findTempEntityDir(tempBaseDir: string, entityId: string): string | null {
  if (!existsSync(tempBaseDir)) return null;
  try {
    const { readdirSync } = require('fs');   // ← ESM: require is undefined
    const entries = readdirSync(tempBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(entityId)) {
        return join(tempBaseDir, entry.name);
      }
    }
  } catch (e) {
    debugLog('findTempDir:readdirSync', e);
  }
  return null;
}
```

**Why it's broken:**

- `package.json:type=module`, `tsconfig.json:module=Node16` → output is ESM (ADR-001, ADR-002).
- ESM has no global `require`. `tsc` does not rewrite literal `require()` calls; the emitted JS contains `require('fs')` which throws `ReferenceError: require is not defined` under Node ≥20.
- The `try/catch` swallows the ReferenceError → `findTempEntityDir` **always returns `null`** for the legacy `.tasks/agents/` and `.tasks/skills/` codepath.
- `readdirSync` is not in the top-level `import { ... } from 'fs'` at `promotion-pipeline.ts:5`, so the function has no working alternative.

**Why no test catches this:**

- `tests/unit/promotion-pipeline.test.ts:5-12` mocks `fs` via `vi.mock('fs', ...)`. That mock only applies to ESM-style `import` calls. A literal `require('fs')` bypasses the Vitest module mock entirely; under the test harness it still throws `ReferenceError`, the catch swallows it, and the legacy path silently returns null. The test suite never exercises the legacy `.tasks/agents/` codepath, so the regression is invisible.
- `tests/orchestra/promotion-guard.test.ts` tests the persistent-temp-pool path (the working one) only.

**Impact:** Whenever `promote()` falls through to the legacy path (lines 145-165), it cannot find the temp entity and returns `false`. In production the persistent-temp-pool path (lines 116-143) covers nearly all real cases, so this remained latent. But:

- Skills go through the legacy path exclusively (lines 145-165 — no persistent-temp-pool branch for skills). **Skill promotion is silently broken** when a skill exists only in `.tasks/skills/`.
- Agents fall through to the legacy path only when `.deckent/agents/temp-{baseId}/agent.json` is absent. This is rare but possible during cold-start or on systems where temp agents weren't persisted to the pool yet.

**Evidence:**

- `src/orchestra/promotion-pipeline.ts:5` — `import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'fs';` (no `readdirSync`)
- `src/orchestra/promotion-pipeline.ts:280` — `const { readdirSync } = require('fs');`
- `package.json` → `"type": "module"`
- `tsconfig.json` → `"module": "Node16"`
- ADR-001 (TypeScript + ESM) — violated by `require()` use
- ADR-002 (Node16 Module Resolution) — same

**ADR alignment:** Violates ADR-001 and ADR-002. Recommendation belongs to a future sprint; this audit only reports.

---

### F-2 — P1 — Asymmetric ID handling between `promote()` and `demote()`

**Where:** `promotion-pipeline.ts:108-170` (promote) vs `:175-202` (demote).

`promote()` strips the `temp-` prefix:

```ts
const baseId = entityId.startsWith('temp-') ? entityId.slice('temp-'.length) : entityId;
const persistentTempDir = join(... 'agents', `temp-${baseId}`);
const permDir           = join(... 'agents', baseId);
```

`demote()` does NOT:

```ts
const manifestFile = entityType === 'agent'
  ? join(this.projectRoot, '.deckent', 'agents', entityId, 'agent.json')
  : join(this.projectRoot, '.deckent', 'skills', entityId, 'manifest.json');
```

**Resulting semantics:**

| Caller passes | `promote()` operates on | `demote()` operates on |
|---|---|---|
| `'react-ts-specialist'` | `temp-react-ts-specialist/` → `react-ts-specialist/` | `react-ts-specialist/` (perm) |
| `'temp-react-ts-specialist'` | `temp-react-ts-specialist/` → `react-ts-specialist/` | `temp-react-ts-specialist/` (temp) |

So the **same input string** addresses different filesystem locations depending on which method is called. The caller (`sprint-finalizer.ts:847,855`) passes whichever id `OutcomeTracker` recorded — typically the bare id used in agent-pool registration. Today `evaluateDemotions()` returns `perf` keyed by id-as-recorded, so `demote()` likely targets the right manifest in the dominant flow — but the asymmetry is a latent bug waiting on an upstream id-format change.

**Evidence:**

- `src/orchestra/promotion-pipeline.ts:121` (promote) vs `:182-184` (demote): no normalization on demote side.
- `tests/unit/promotion-pipeline.test.ts:124-143` — demote test asserts manifest write, but only with id `'custom-agent'` (no `temp-` prefix variant tested).
- `tests/orchestra/promotion-guard.test.ts:44-60` — demote test, also bare id only.

---

### F-3 — P1 — Live filesystem evidence: post-promotion temp directory is NOT cleaned up

**Where:** `promotion-pipeline.ts:108-170` (`promote`).

After a successful `promote()` of an agent, the source `temp-{baseId}/` directory remains:

```ts
mkdirSync(permDir, { recursive: true });
cpSync(persistentTempDir, permDir, { recursive: true });
// ... manifest update on dest only ...
return true;        // <- returns without removing persistentTempDir
```

**Live evidence (this repo, 2026-05-08):**

```
.deckent/agents/
├── react-ts-specialist/        ← perm copy, id: "react-ts-specialist"
├── temp-react-ts-specialist/   ← STILL THERE, source: "learned", id: "temp-react-ts-specialist"
└── temp-react-specialist/      ← also still there
```

Both `react-ts-specialist/agent.json` and `temp-react-ts-specialist/agent.json` exist with substantively identical descriptions, expertise, triggerKeywords, and triggerScopes (verified via direct read).

**Impact:**

- AgentPool (per CLAUDE.md) loads ALL `.deckent/agents/*/agent.json`. With both copies registered, the same logical agent appears twice in the pool — once as `react-ts-specialist` (source: 'user', enabled), once as `temp-react-ts-specialist` (source: 'learned', enabled). LRU eviction cap (50 temp + 5 sprint age) wastes a slot on a duplicate.
- Activation engine may match the same intent against both manifests (they share `triggerKeywords` and the activation rule). If `routingMeta.confidence` ties, ordering becomes nondeterministic.
- Subsequent `evaluatePromotions()` may again recommend "promote temp-react-ts-specialist" because OutcomeTracker still has the temp id keyed in `agentPerformance`.

**Why no test catches this:** `tests/orchestra/promotion-guard.test.ts:62-103` tests both promotion-success cases but never asserts that the temp source dir was removed. It only asserts the perm dir exists and has updated source field.

**Note on scope:** This finding describes a current state the audit observed. Cleanup is a remediation question for Sprint 162+; this audit only reports.

---

### F-4 — P2 — Sprint 153 D3 fix is partially tested

**Where:** `tests/orchestra/promotion-guard.test.ts:62-103`, `tests/unit/promotion-pipeline.test.ts:85-103`.

Both tests pass the **bare id** (`'my-agent'`) to `pipeline.promote()`. Neither test passes the already-prefixed form (`'temp-my-agent'`). The fix at line 121 (`if (entityId.startsWith('temp-'))`) explicitly handles both shapes, but the prefixed branch is **untested**.

**Why it matters:** `OutcomeTracker.agentPerformance` is keyed by the agent id used during routing. `temp-skill-generator.ts:373` produces ids of the form `temp-${tpl.idSuffix}`. If `OutcomeTracker` records performance using the temp-prefixed id (which it does — the agent was `temp-react-ts-specialist` during execution), then `evaluateEntityPromotion()` returns a `PromotionResult` with `entityId = 'temp-react-ts-specialist'`. That id is then passed to `promote()` (sprint-finalizer.ts:847). So the prefixed-input branch is the production-dominant path, yet only the bare-id path is tested.

**Evidence:**

- `src/orchestra/temp-skill-generator.ts:373` — `id: \`temp-${tpl.idSuffix}\``
- `src/orchestra/sprint-finalizer.ts:847` — `pipeline.promote(p.entityId, p.entityType)` (no normalization at call site)
- Live `.deckent/agents/temp-react-ts-specialist/agent.json` line 41 → `"id": "temp-react-ts-specialist"`

---

### F-5 — P2 — Dead config fields with documented but unimplemented semantics (drift)

**Where:** `promotion-pipeline.ts:12-22, 32-33`.

```ts
export interface PromotionCriteria {
  minTasks: number;
  minSuccessRate: number;
  minSprints: number;      // default 3 (approximated from task count)
}

export interface DemotionCriteria {
  maxFailRate: number;
  minTasks: number;
  unusedSprints: number;   // default 5 (if not used in N sprints → demote)
}

const DEFAULT_PROMOTION = { minTasks: 8, minSuccessRate: 0.85, minSprints: 3 };
const DEFAULT_DEMOTION  = { maxFailRate: 0.50, minTasks: 5, unusedSprints: 5 };
```

`grep -n` over `src/orchestra/` confirms:

- `minSprints` — declared, defaulted, **never read** in `promotion-pipeline.ts` or anywhere else in `src/orchestra/`.
- `unusedSprints` — declared, defaulted, **never read** anywhere.

The comments document behavior ("if not used in N sprints → demote") that the code does not implement. This is documentation drift — readers and operators may believe the system retires unused agents after 5 sprints; it does not.

A separate parallel system, `src/agents/agent-retirement.ts`, implements `minSprints` semantics correctly (cross-reference: T-161-034). It is not invoked from this pipeline.

---

### F-6 — P2 — Dead `depHint` field in `AgentTemplate` (dead code)

**Where:** `temp-skill-generator.ts:240, 358`.

```ts
interface AgentTemplate {
  // ...
  depHint?: string;  // declared
}

const AGENT_TEMPLATES: AgentTemplate[] = [ /* 7 entries, 0 use depHint */ ];

// later in generateTempAgents():
if (tpl.depHint && !deps.some((d) => d.includes(tpl.depHint!))) continue;  // never triggers
```

None of the 7 templates (`react-ts-specialist`, `react-specialist`, `ts-architect`, `python-api-specialist`, `python-specialist`, `go-specialist`, `rust-specialist`) sets `depHint`. The conditional at line 358 is provably unreachable today. Either remove the field, or wire it into at least one template (e.g., `python-api-specialist` could gate on `depHint: 'fastapi'`).

---

### F-7 — P2 — Type duplication: `ProjectAnalysisInput` vs `ProjectStack`

**Where:** `temp-skill-generator.ts:18-26` vs `src/core/skill-types.ts:59-68`.

```ts
// temp-skill-generator.ts
export interface ProjectAnalysisInput {
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  dependencies: string[];
  detectedLanguages?: string[];
  subProjects?: string[];
}

// skill-types.ts
export interface ProjectStack {
  language: string;
  framework: string;
  dependencies: string[];
  buildTool: string;
  testFramework: string;
  detectedAt: string;            // ← the only delta
  detectedLanguages?: string[];
  subProjects?: string[];
}
```

`ProjectAnalysisInput` is a structural subset of `ProjectStack` minus `detectedAt`. The actual caller `sprint-planner.ts:396` passes a `ProjectStack` (named `projectStackV2`) into a function typed against `ProjectAnalysisInput` — works due to TS structural typing, but it's a parallel type definition that will drift. Either alias one to the other or `Pick<ProjectStack, ...>`.

---

### F-8 — P2 — `_generatedContent` back-channel typing

**Where:** `temp-skill-generator.ts:14, 122, 130, 210`.

```ts
type SkillWithContent = SkillDefinition & { _generatedContent?: string };
// ...
(skill as SkillWithContent)._generatedContent = content;
```

Generated SKILL.md content is attached to the SkillDefinition via a non-public field accessed by type cast. Consumers must use `getGeneratedContent()` to read it. This:

- Is invisible to anyone reading the public `SkillDefinition` type
- Survives `JSON.stringify` (the `_generatedContent` field gets serialized along with the skill manifest), polluting persisted manifests if the skill is ever saved without stripping the field
- Sets a precedent for bypassing typed schemas via cast

A `GeneratedSkillBundle = { definition: SkillDefinition; content: string }` shape would be cleaner.

**Evidence of the serialization risk:** `agent-pool.ts`/`skill-pool.ts` save manifests as JSON. If a future codepath calls `skillPool.saveSkill(generatedSkill)` directly (without stripping `_generatedContent`), the field leaks to disk under `_generatedContent` key.

---

### F-9 — P3 — `findTempEntityDir` directory match by substring (`.includes(entityId)`)

**Where:** `promotion-pipeline.ts:283`.

```ts
if (entry.isDirectory() && entry.name.includes(entityId)) {
  return join(tempBaseDir, entry.name);
}
```

Substring matching is fragile. If `entityId === 'react'` and the directory contains both `react-specialist/` and `react-ts-specialist/`, the first one returned by `readdirSync` wins. Should use exact match against `temp-${entityId}` or `entityId` itself.

(Mooted in practice by F-1 — this codepath is unreachable today — but if F-1 is fixed without also fixing this, the substring matching becomes a real risk.)

---

### F-10 — P3 — Hard-coded `'domain'` SkillCategory for all generated skills

**Where:** `temp-skill-generator.ts:108, 201`.

`SkillCategory` is the union `'language' | 'framework' | 'tool' | 'domain' | 'workflow'`. Both `generateProjectConventionsSkill()` and `generateDataDrivenSkills()` hard-code `category: 'domain' as SkillCategory`. The cast suppresses the "is `'domain'` always right?" question. `project-conventions` is arguably more `'workflow'` (a project-wide convention guide), and per-language data-driven skills could be `'language'`. Routing engines that filter by category will never see these skills under any non-`domain` filter.

---

### F-11 — P3 — Magic-number truncations in template-engine

**Where:** `temp-skill-generator.ts:55, 72, 112, 166, 174, 203`.

`slice(0, 15)`, `slice(0, 10)`, `slice(0, 5)`, `slice(0, 3)` appear without rationale comments. These shape the prompt budget that flows into worker prompts but the limits are not defined relative to a token budget.

---

### F-12 — P3 — No file-lock around promotion writes

**Where:** `promotion-pipeline.ts:130-138, 161-162, 191-194`.

`promote()` and `demote()` perform `mkdirSync + cpSync + writeFileSync` without acquiring a `.locks/` lock as defined in `.contracts/api-surface.md` (lock format documented). Concurrent sprint finalizations targeting the same entity would race. Brain serializes finalization today, so impact is bounded — but the contract says "Workers MUST stay within scope … Workers MAY read any file in scope.filesRead". The Brain itself is not bound by file-lock by contract, so this is more guidance than violation.

---

### F-13 — P3 — Cross-reference: parallel retirement subsystem in `src/agents/`

**Where:** `src/agents/agent-retirement.ts:1-100`.

Defines `RetirementConfig { minSuccessRate, minSprints, minUses }` and `evaluateForRetirement()`. Functionally overlaps with `PromotionPipeline.evaluateDemotions()`. The two systems use different criteria (failRate threshold vs successRate threshold) and different storage (disable-in-place vs move-to-`.retired/`). `grep` finds zero call sites for `evaluateForRetirement` outside the file itself, suggesting this code is presently dormant.

**Out of T-161-022 scope** (full audit belongs to T-161-034 `src/agents/`). Flagged here only because demotion semantics are claimed to live here.

---

## 4. ADR Compliance

| ADR | Status | Notes |
|---|---|---|
| ADR-001 (TS + ESM) | **Violation (F-1)** | `require('fs')` inside ESM file |
| ADR-002 (Node16 Module Resolution) | **Violation (F-1)** | Same root cause |
| ADR-003 (vitest over Jest) | OK | Tests use vitest |
| ADR-007 (SpawnOptions Interface) | N/A | No spawn calls |
| ADR-008 (Brain merkezi import) | OK | Pipeline imports only from `outcome-tracker.js` and `core/utils.js` (no Brain↔worker cycles) |
| ADR-035 (Verification Protocol Standard) | N/A | No worker IPC |
| ADR-037 (Authority Matrix RBAC) | OK | `isBuiltIn()` guard prevents promote/demote of builtin agents |
| ADR-038 (Self-Modifying Detection) | N/A directly | This audit is itself a self-modifying read-only audit |
| ADR-041 (Agent Taxonomy) | **Smell (F-3 adjacent)** | `react-ts-specialist` template combines two horizontal skills (react + typescript-expert) into one vertical agent. Whether this aligns with ADR-041's "horizontal skills, vertical agents" stance is a higher-level question for the T-161-034 (worker) and T-161-016 (router) audits |

---

## 5. 10-Dimension Sweep Summary

| # | Dimension | Findings |
|---:|---|---|
| 1 | Dead code (unused exports) | F-1 (legacy fallback unreachable), F-5 (dead config fields), F-6 (dead `depHint`) |
| 2 | ADR violations | F-1 (ADR-001/002), F-3 adjacent (ADR-041 smell) |
| 3 | Conflicting / duplicated logic | F-13 (`agent-retirement.ts` parallel system), F-7 (parallel types) |
| 4 | Drift (comments vs behavior, claims vs reality) | F-5 (`unusedSprints` comment ≠ behavior), F-3 (Sprint 153 fix description vs incomplete cleanup) |
| 5 | Type safety (`any`, `ts-ignore`, `as unknown as`) | F-8 (cast-based back-channel), F-10 (`as SkillCategory` for hardcoded domain) |
| 6 | Dependency hygiene (`.js` extensions, circular deps) | OK — all internal imports use `.js` |
| 7 | Documentation pollution | F-5 (misleading comments), F-11 (undocumented magic numbers) |
| 8 | Memory V2 coherence | N/A (no DB interaction in either file) |
| 9 | Config integrity | F-5 (default-but-unused config fields) |
| 10 | Migration triage classification | See section 6 |

---

## 6. Migration Triage

| File | Classification | Reasoning |
|---|---|---|
| `src/orchestra/promotion-pipeline.ts` | **KEEP-PRIVATE** | Deckent-internal lifecycle. Operates on `.deckent/agents/`, `.deckent/skills/`, `.tasks/`. Not useful in user projects without the surrounding sprint-controller machinery. F-1, F-2, F-3 must be addressed before this is fit for advertised public-facing behavior. |
| `src/orchestra/temp-skill-generator.ts` | **KEEP-PRIVATE** | Template engine for Deckent's own evolution pipeline. Templates are TypeScript-stack-flavored (`react-ts-specialist`, `python-api-specialist`, etc.) and the generated `project-conventions` skill is a Deckent SKILL.md format that only Deckent consumes. F-7, F-8, F-10 are quality concerns; F-6 is dead code to remove. |

No DELETE-CANDIDATE — both files are wired into active flow paths (`sprint-finalizer.ts`, `sprint-planner.ts`, `init-steps.ts`).

No MIGRATE-PUBLIC — no public-facing API surface here.

---

## 7. Recommendations for Sprint 162+

**Sprint 162 — Lane 2 (remediation):**

1. **F-1 fix (P1):** Add `readdirSync` to the top-level `import { ... } from 'fs'` in `promotion-pipeline.ts:5`, delete the `require('fs')` line in `findTempEntityDir`. Also tighten substring match (F-9).
2. **F-2 fix (P1):** Make `demote()` apply the same `temp-` normalization as `promote()`, OR document that `demote` always operates on the manifest at the literal id. Choose one; remove the asymmetry.
3. **F-3 fix (P1):** After successful `promote()`, `rmSync(persistentTempDir, { recursive: true, force: true })`. Update `tests/orchestra/promotion-guard.test.ts` to assert the source dir is gone post-promotion.
4. **F-4 fix (P2):** Add a `promote('temp-my-agent', 'agent')` test variant to `promotion-guard.test.ts` (the production-dominant input shape).
5. **F-5 fix (P2):** Either (a) implement `unusedSprints` and `minSprints` semantics, or (b) delete the unused fields and update comments.
6. **F-6 fix (P2):** Either remove `depHint` or use it for at least one template (e.g., gate `python-api-specialist` on `depHint: 'fastapi'` to disambiguate from FastAPI-less projects).
7. **F-7 fix (P3):** `type ProjectAnalysisInput = Pick<ProjectStack, 'language' | 'framework' | ...>` or alias.
8. **F-8 fix (P3):** Replace `_generatedContent` back-channel with explicit `{ definition, content }` shape.

**Cleanup task (one-shot, after F-3 fix):**

- Delete the two ghost dirs `.deckent/agents/temp-react-ts-specialist/` and `.deckent/agents/temp-react-specialist/` — they are post-promotion residue from the Sprint 153 D3 era.

**Cross-task hand-offs:**

- T-161-016 (`task-router + rule-evolver + outcome-tracker`): verify what id-shape `OutcomeTracker.agentPerformance` keys use; this is the upstream of F-4.
- T-161-034 (`src/agents/`): full audit of `agent-retirement.ts` per F-13 and reconcile with this pipeline's demotion semantics.
- T-161-018 (`sprint-finalizer + lifecycle + phases`): verify the `await import('./promotion-pipeline.js')` pattern at `sprint-finalizer.ts:840` is intentional (lazy load) — out of scope here.

**Documentation:** The CLAUDE.md gotcha section currently does not flag any of these. After F-1/F-2/F-3 land, add a brief note about temp→permanent lifecycle: "After promotion, the source `.deckent/agents/temp-{id}/` is removed."

---

## 8. Audit Metadata

- **Files written by this task:** 1 (this report only)
- **Source files modified:** 0
- **Tests run:** 0 (read-only audit)
- **Git diff scope expected:** `docs/audits/sprint-161/T-161-022-orch-promote-temp.md` only
- **ADR-037 RBAC:** No boundary violations expected
- **ADR-039 self-modifying detector:** This task modifies Deckent's own source-tree (audit report under `docs/audits/`); strict scope adherence verified
