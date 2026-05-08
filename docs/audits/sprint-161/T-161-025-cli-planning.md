# T-161-025 — src/cli/commands/ planning + init audit

**Sprint:** 161 (Lane 1, Pre-beta READ-ONLY god-level audit)
**Task:** 161-025
**Agent:** doc-writer
**Skills:** typescript-expert
**Date (UTC):** 2026-05-08
**Mode:** READ-ONLY — no source edits, no test runs
**Lead questions:**
1. ADR-018 multi-environment config generation — wire correctness
2. structured / ai / auto planning mode wire across CLI ↔ planner ↔ config

---

## 1. Scope

Files audited (`src/cli/commands/`):

| # | File | LoC | Bytes | Role |
|---|------|----:|------:|------|
| 1 | `init.ts` | 345 | 12,887 | Thin router for `deckent init` (post Sprint 144 split) |
| 2 | `plan.ts` | 112 | 4,114 | `deckent plan` — sprint planning command |
| 3 | `set-directives.ts` | 84 | 2,990 | `deckent set-directives` — DIRECTIVES.md writer |
| 4 | `init-templates.ts` | 634 | 20,676 | Pure content/template generators (DECKENT.md, DIRECTIVES.md, docs, BOOT.md, IDE adapters) |
| **TOTAL** | | **1,175** | **40,667** | within ≤8 files / ≤2,000 LoC budget |

Cross-referenced (out of scope, citation-only):
- `src/cli/commands/init-steps.ts` — 702 LoC sibling of init.ts (filesystem write helpers)
- `src/cli/commands/init-wizard.ts` — 171 LoC sibling (format helpers, wizard types)
- `src/orchestra/sprint-planner.ts` — `planSprint` mode dispatch
- `src/orchestra/brain.ts` — re-export layer
- `src/core/config.ts` + `config-types.ts` — `BrainPlanningMode` type, `brain_planning` validator
- `src/mcp/tools/plan.ts` + `src/mcp/server.ts` — MCP plan tool surface (parity counterpart)
- `.brain/exports/decisions.md` — ADR-018 canonical text

---

## 2. Findings

### Severity legend

- **P0** — blocker / security / data loss / runtime crash on golden path
- **P1** — architectural drift, ADR violation, dead code with user impact
- **P2** — doc drift, dev-experience gotcha, minor type laxity
- **P3** — cosmetic, micro-optimization, future improvement opportunity

### Summary table

| ID | Severity | Dimension | File | Topic |
|----|----------|-----------|------|-------|
| F-1 | **P1** | ADR-022-V2 violation | `plan.ts:14-20` | CLI missing `--mode` flag while MCP exposes `mode: ai\|structured\|auto` |
| F-2 | **P1** | Dead/incomplete code | `init.ts:127, 325-339` | `failedSteps` never populated → `--repair` and catch-block step list non-functional |
| F-3 | **P2** | Doc drift (claims vs reality) | `init-templates.ts:50, 111, 258-260, 304-307, 605` | Generated docs claim CLI flag `--mode ai/structured/auto` that does not exist |
| F-4 | **P2** | Drift (silent fallback) | `init.ts:204-207, 209-213, 296-302` | Three independent silent `try/catch` blocks swallow stack-detect, analyze, doctor errors with no telemetry |
| F-5 | **P2** | Type safety / readability | `init.ts:125, 227` | Long inline option type; `as typeof ALL_ENV_NAMES[number][]` cast through `filter` |
| F-6 | **P2** | UX inconsistency | `init.ts:118-119, 305-307` | `--cursor` / `--claude-code` flags affect MCP guidance display only — they do **not** trigger per-IDE config write (must combine with `--env` or `--all-envs`) |
| F-7 | **P3** | Conflicting heuristic | `init-templates.ts:16-31` | `getExampleSkill` returns `'testing-expert'` for go/rust/python — only typescript/javascript get `'typescript-expert'` |
| F-8 | **P3** | Documentation pollution | `init-templates.ts:35-155` (TR) vs (EN) | DECKENT.md TR/EN templates duplicate workflow + provider strings (drift risk) |
| F-9 | **P3** | Limited regex literal coverage | `set-directives.ts:14-16` | `countTaskBlocks` matches only `Task` / `Görev` (TR/EN). Display-only counter, low risk |
| F-10 | **P3** | Test pre-existence | `set-directives.ts:5` | Imports `DIRECTIVES_FILE` from `core/constants.js` — single-point-of-truth ✓ but no validation that DIRECTIVES.md is well-formed before write |

---

### F-1 (P1) — CLI/MCP plan mode parity violation (ADR-022-V2)

**Dimension:** ADR violation (ADR-022-V2 "CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar"), drift, conflicting areas.

**Evidence:**

```typescript
// src/cli/commands/plan.ts:14-21
program
  .command('plan')
  .description('Plan a sprint without executing it')
  .option('--no-confirm', 'Skip confirmation, auto-approve plan')
  .option('--structured', 'Force structured parsing (skip AI)')
  .option('--dry-run', 'Show plan without writing task files to disk')
  .action(async (opts: { confirm?: boolean; structured?: boolean; dryRun?: boolean }) => {
```

```typescript
// src/mcp/tools/plan.ts:46
mode: z.enum(['ai', 'structured', 'auto']).optional().describe(
  'Planning mode: "ai" uses Claude to interpret directives creatively (requires API access), '
  + '"structured" parses DIRECTIVES.md task blocks directly (deterministic, no AI call), '
  + '"auto" picks ai if available else falls back to structured'
),
```

```typescript
// src/cli/commands/plan.ts:31
let planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
```

```typescript
// src/orchestra/sprint-planner.ts:188 — accepts all three modes
const planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto';
```

**Analysis:**

The downstream planner (`sprint-planner.ts:188, 217, 297`) accepts all three modes
(`'ai' | 'structured' | 'auto'`). MCP exposes the full enum
(`src/mcp/tools/plan.ts:46`). The CLI exposes **only** a boolean `--structured`
flag. Consequence:

| Mode  | CLI access | MCP access | Config access |
|-------|:----------:|:----------:|:-------------:|
| structured | ✓ `--structured` | ✓ `mode: 'structured'` | ✓ `brain_planning` |
| ai    | ✗ (only via config) | ✓ | ✓ |
| auto  | ✗ (only via config — default) | ✓ | ✓ |

A user wishing to force `ai` mode from CLI must
`deckent config set brain_planning ai` then `deckent plan` — a two-step workaround
where MCP users get a one-shot. This violates the spirit of ADR-022-V2.

The drift is doubly visible because `init-templates.ts` documents the **MCP-style**
mode flag in the freshly-init'd DECKENT.md (see F-3).

**Migration triage:** `plan.ts` → **KEEP-PRIVATE** (small, in-scope command file).
Remediation belongs in Sprint 162 — add `--mode <ai|structured|auto>` option, keep
`--structured` as a documented alias for backward compatibility.

---

### F-2 (P1) — `failedSteps` array never populated → `--repair` dead

**Dimension:** Dead code, drift (claims vs behavior).

**Evidence:**

```typescript
// src/cli/commands/init.ts:127
const failedSteps: Array<{ step: string; error: string }> = [];

// src/cli/commands/init.ts:325-331  (success path)
if (options.repair && failedSteps.length > 0) {
  print('\n  Failed steps:');
  for (const step of failedSteps) {
    print(`  ✗ ${step.step}: ${step.error}`);
  }
  print('\n  To retry: deckent init --upgrade');
}

// src/cli/commands/init.ts:335-340  (catch block)
if (failedSteps.length > 0) {
  print('  Previously failed steps:');
  for (const step of failedSteps) {
    print(`  ✗ ${step.step}: ${step.error}`);
  }
}
```

`grep -n 'failedSteps\.push' src/cli/commands/init.ts` returns **zero matches**.
None of the helper functions called from `init.ts` (`createDirectories`,
`writeConfig`, `writeStackAndDeckentFile`, `writeAgentFiles`,
`writeMultiEnvConfig`, `writeDeckSecurityFiles`, `writeClaudeRules`,
`writeDirectivesFile`, `writeBrainFiles`, `writeI18nFiles`, `updateGitignore`,
`writeProviderConfig`) accept `failedSteps` as a parameter (cf. init.ts:215, 221,
229-232, 235, 238, 241, 244, 247, 250, 293).

The three silent `try/catch` blocks at lines 144-147 (splash), 204-207 (stack
detect), 209-213 (analyze), and 296-302 (doctor) swallow errors **without**
appending to `failedSteps`. Even `printError(error)` in the outer catch (line
333) does not push.

**Consequence:** the `--repair` flag (line 124) is documented but functionally
inert. Both branches that check `failedSteps.length > 0` are unreachable on the
golden code path.

**Migration triage:** `init.ts` → **KEEP-PRIVATE**, but Sprint 162 either:
(a) wire each silent catch / step helper to `failedSteps.push({step, error})` — making
    `--repair` actually useful; or
(b) delete `failedSteps`, `--repair`, and the unreachable branches.
Option (a) preferred — the design intent is sound and aligns with init's usability goals.

---

### F-3 (P2) — generated docs misrepresent CLI plan mode flag

**Dimension:** Drift, documentation pollution.

**Evidence (5 occurrences across init-templates.ts):**

```typescript
// init-templates.ts:50  (DECKENT.md TR)
3. \`deckent plan\` — Task'ları planla (mode: ai/structured/auto)

// init-templates.ts:111 (DECKENT.md EN)
3. \`deckent plan\` — Plan tasks (mode: ai/structured/auto)

// init-templates.ts:258-260 (quickStartDoc TR)
- \`--mode ai\` — AI ile akıllı planlama
- \`--mode structured\` — Kural tabanlı, hızlı

// init-templates.ts:304-307 (quickStartDoc EN)
- \`--mode ai\` — AI-powered smart planning
- \`--mode structured\` — Rule-based, fast

// init-templates.ts:605 (Cursor IDE adapter)
3. \`deckent plan\` — Plan sprint tasks (mode: ai/structured/auto)
```

**Analysis:** The generators emit docs into the user's project at init time. As
`plan.ts:18` only exposes `--structured`, every user attempting
`deckent plan --mode ai` will hit `commander` "unknown option `--mode`" and lose
trust. `--mode ai` is valid only in MCP (`deckent_plan` tool, F-1).

**Migration triage:** `init-templates.ts` → **KEEP-PRIVATE**. Fix becomes trivial
once F-1 is resolved — once CLI exposes `--mode`, the doc claims become true.
If F-1 is deferred, rephrase to: `deckent config set brain_planning ai` ; then
`deckent plan` runs in ai mode.

---

### F-4 (P2) — silent failures lose telemetry

**Dimension:** Drift (comments vs behavior).

**Evidence:**

```typescript
// init.ts:144-147
try {
  const splash = showSplash(DECKENT_VERSION);
  if (splash) print(splash);
} catch { /* splash failure is non-fatal */ }

// init.ts:204-207
try {
  stackResult = detectFullStack(root);
  stackDetected = true;
} catch { /* fallback to defaults */ }

// init.ts:209-213
if (!detectedAnalysis) {
  try {
    detectedAnalysis = analyzeProject(root);
  } catch { /* non-fatal */ }
}

// init.ts:296-302
try {
  const doctorResult = runDoctorChecks(root);
  if (!doctorResult.ok) { ... }
} catch { /* doctor failure is non-fatal */ }
```

Four silent catches that ignore `error` entirely. None feeds `failedSteps`
(see F-2). These are ideal candidates to make `--repair` non-trivial.

**Migration triage:** **KEEP-PRIVATE**. Sprint 162 — push `{step:'splash'|'stack-detect'|'analyze'|'doctor', error: String(err)}`
into `failedSteps`.

---

### F-5 (P2) — long inline option type, redundant cast

**Dimension:** Type safety, readability.

**Evidence:**

```typescript
// init.ts:125 (action handler signature)
.action(async (options: {
  auto?: boolean; manual?: boolean; cursor?: boolean; claudeCode?: boolean;
  env?: string; allEnvs?: boolean; upgrade?: boolean; force?: boolean; repair?: boolean
}) => { ... });

// init.ts:224-228
const requestedEnvs = options.allEnvs
  ? [...ALL_ENV_NAMES]
  : options.env
    ? options.env.split(',').map(e => e.trim())
        .filter(e => ALL_ENV_NAMES.includes(e as typeof ALL_ENV_NAMES[number]))
        as typeof ALL_ENV_NAMES[number][]
    : [];
```

The `as typeof ALL_ENV_NAMES[number]` happens twice — once inside `filter` (a
type-guard candidate via predicate) and once outside as a cast on the result.
Consider:

```typescript
function isEnvName(s: string): s is EnvName {
  return (ALL_ENV_NAMES as readonly string[]).includes(s);
}
const requestedEnvs: EnvName[] = options.allEnvs
  ? [...ALL_ENV_NAMES]
  : options.env?.split(',').map(s => s.trim()).filter(isEnvName) ?? [];
```

**Migration triage:** **KEEP-PRIVATE**, P2 cleanup candidate.

---

### F-6 (P2) — `--cursor` / `--claude-code` flags do not trigger config writes

**Dimension:** UX gotcha, drift.

**Evidence:**

```typescript
// init.ts:118-119
.option('--cursor', 'Configure for Cursor IDE environment')
.option('--claude-code', 'Configure for Claude Code environment (default)')

// init.ts:223-232 — multi-env decision uses --env / --all-envs ONLY
const requestedEnvs = options.allEnvs
  ? [...ALL_ENV_NAMES]
  : options.env
    ? options.env.split(',').map(e => e.trim()).filter(...) as ...[]
    : [];
writeMultiEnvConfig(root, projectName, requestedEnvs, stackResult, ...);

// init.ts:305-307 — --cursor / --claude-code only switch IDE display branch
const ideEnv = options.cursor ? 'cursor' as const
  : options.claudeCode ? 'claude-code' as const
  : detectIDEEnvironment(root);
const mcpGuidance = getMCPGuidance(ideEnv);
```

The flag descriptions say "Configure for Cursor IDE environment" implying that
running `deckent init --cursor` would write Cursor's IDE config files. In
practice, the user must run `deckent init --cursor --env cursor` to actually get
`.cursor/rules/deckent.mdc` written. The flag impacts only the post-init MCP
guidance text.

**Migration triage:** **KEEP-PRIVATE**. Either:
(a) Auto-include `'cursor' | 'codex' | 'gemini'` in `requestedEnvs` when their
    flag is set; or
(b) reword the flag description to reflect actual behavior:
    `--cursor` "Show Cursor MCP setup guidance after init".

---

### F-7 (P3) — `getExampleSkill` heuristic loses precision for go/rust/python

**Dimension:** Conflicting areas (heuristic).

**Evidence:**

```typescript
// init-templates.ts:16-22
function getExampleSkill(stack: FullStackResult): string {
  const lang = stack.language?.toLowerCase() ?? '';
  if (lang.includes('typescript') || lang.includes('javascript')) return 'typescript-expert';
  if (lang.includes('python')) return 'testing-expert';
  if (lang.includes('go') || lang.includes('rust')) return 'testing-expert';
  return 'testing-expert';
}
```

`python-expert` is a real skill in the registry per DECKENT.md skills list (line
referencing 21 built-in skills, including `python-expert`). The fallback for
go/rust to `testing-expert` is OK (no go-expert / rust-expert skills exist yet).
For python the more accurate skill is `python-expert`.

**Migration triage:** **KEEP-PRIVATE**, trivial Sprint 162 fix.

---

### F-8 (P3) — DECKENT.md TR/EN duplication risk

**Dimension:** Documentation pollution.

`generateDeckentContentTR` (lines 35-94) and `generateDeckentContentEN` (lines
96-155) hand-mirror an identical 8-step workflow, identical providers list,
identical context block, identical Boot section. Total duplication is ~120
LoC. The TR/EN parity is the explicit goal (ADR-032 i18n Pattern System) but
right now any drift between the two has to be caught manually.

The Cursor IDE adapter at lines 595-618 also hand-rolls a 3rd workflow listing.

**Migration triage:** **KEEP-PRIVATE**. Consider Sprint 162+ extraction of
canonical workflow → single source rendered through templates (aligns with
ADR-032 i18n Pattern System and ADR-029 Managed-Docs Universalization).

---

### F-9 (P3) — `countTaskBlocks` regex narrow

**Dimension:** Drift, accuracy.

**Evidence:**

```typescript
// set-directives.ts:14-16
function countTaskBlocks(content: string): number {
  return (content.match(/^##\s+(Görev|Task)\s+\d+/gm) ?? []).length;
}
```

Regex matches only literal `Task` / `Görev` followed by digits. Will not match
`## task 1` (lowercase), `## Task: 1`, `## Görev N` (no digit). Counter is
display-only — feeds `set_directives.updated` message — so a wrong count is
cosmetic, not load-bearing. Aligns with the grammar enforced by
`task-builder.ts` `parseStructuredDirectives`, so the narrow match is
intentional.

**Migration triage:** **KEEP-PRIVATE**, no action needed unless `task-builder`
relaxes its grammar.

---

### F-10 (P3) — set-directives writes without format validation

**Dimension:** Drift, robustness.

`set-directives.ts:75` calls `writeFileSync(directivesPath, content, 'utf-8')`
unconditionally after only `content.trim().length > 0` and (optionally) file-
existence check. There is **no** validation that `content` actually parses as a
DIRECTIVES.md (no `# DIRECTIVES`, no `## Goal:`, no `## Task N`). Brain
`planSprint` will produce zero tasks if the content is malformed, which is the
existing behavior — but a user-friendly preflight ("warning: 0 task blocks
detected — proceed?") would tighten the loop.

`countTaskBlocks` already runs after the write — could be hoisted to before, with
a confirmation prompt. Aligns with the `--no-confirm` style used by `plan.ts`.

**Migration triage:** **KEEP-PRIVATE**, optional Sprint 162 enhancement.

---

## 3. ADR / dimension cross-check

| ADR | Status in this scope | Citations |
|-----|----------------------|-----------|
| **ADR-001** TypeScript + ESM | ✓ all 4 files TS, no JS shim | n/a |
| **ADR-002** Node16 module resolution (`.js` ext mandatory) | ✓ every relative import uses `.js` | init.ts:13-39, plan.ts:1-12, set-directives.ts:1-8, init-templates.ts:10-12 |
| **ADR-008** Brain merkezi import — tek yönlü bağımlılık | ✓ plan.ts imports from `orchestra/brain.js`; init.ts imports core utilities; no circular lookup | plan.ts:4-7 |
| **ADR-010** Single runtime dep — commander.js | ✓ only `commander` + `node:fs/path/readline` used | all 4 files |
| **ADR-012** `register<Name>(program)` pattern | ✓ all 3 commands use `registerInit`, `registerPlan`, `registerSetDirectives` and are wired in `cli/index.ts:73,75,102` | init.ts:112, plan.ts:14, set-directives.ts:31 |
| **ADR-018** Multi-environment config generation | ✓ `ALL_ENV_NAMES = ['codex','cursor','gemini','vscode','shell']`; `--all-envs` and `--env <comma-list>` exposed; `writeIfNotExists` principle preserved via `writeFile` closure (line 129-133) and `--upgrade` opt-in | init.ts:120-121, 224-232; init-steps.ts:95-96 |
| **ADR-022-V2** CLI/MCP feature parity | ✗ **violated** — F-1 above (CLI plan missing `--mode`) | plan.ts:18, mcp/tools/plan.ts:46 |
| **ADR-029/030/031/032** Managed-docs / templates / hash cache / i18n | △ partial — `init-templates.ts` is hand-rolled, not yet routed through Managed-Docs templates | init-templates.ts entire file |
| **ADR-036** ADR governance integration — Mandatory architecture decision enforcement | ✓ This audit itself is an ADR-036 artifact. ADR list cited above is fresh. | n/a |
| **ADR-037** RBAC — Brain-Auditor-Worker authority matrix | ✓ scope discipline observed; no source modifications | task-161-025.json scope=docs/audits/sprint-161/, src/cli/commands/ |
| **ADR-038** Dead-code disposition | △ F-2 (failedSteps) is fresh dead-code candidate to add to ADR-038 dispositions list | init.ts:127, 325-339 |
| **ADR-039** Self-modifying task detection | ✓ this is an audit task on Deckent's own source; remained READ-ONLY | n/a |

---

## 4. Type-safety scan

| File | `any` | `unknown` | `as` casts | `@ts-ignore` | `@ts-expect-error` |
|------|:-----:|:---------:|:---------:|:------------:|:------------------:|
| init.ts | 0 | 0 | 4 (`'cursor' as const`, `'claude-code' as const`, two `as typeof ALL_ENV_NAMES[number][]`-flavored) | 0 | 0 |
| plan.ts | 0 | 0 | 0 | 0 | 0 |
| set-directives.ts | 0 | 0 | 0 | 0 | 0 |
| init-templates.ts | 0 | 0 | 1 (`pkg.scripts as Record<string, string> \| undefined`) | 0 | 0 |
| **TOTAL** | **0** | **0** | **5** | **0** | **0** |

Strong type discipline — no `any`, no suppressions. The handful of `as` casts
are all narrow, justifiable shapes. `pkg.scripts as Record<string,string>`
(init-templates.ts:581) shapes a `JSON.parse` output from `package.json` —
acceptable boundary cast.

---

## 5. Memory V2 / Config integrity / Marketplace

Out of scope per file selection — none of the 4 audited files touches
`MemoryStore`, `.brain/memory.db`, marketplace sandbox, or the `.deck` secret
system. Cross-referenced via `init-steps.ts:writeBrainFiles` and
`writeDeckSecurityFiles` (lines 244 and 235 of init.ts) — those modules are
audited under T-161-002 (Memory V2) and T-161-008 (credentials/.deck/global-config).

---

## 6. Migration triage classification

| File | Disposition | Rationale |
|------|-------------|-----------|
| `src/cli/commands/init.ts` | **KEEP-PRIVATE** | Top-level CLI surface; thin router post Sprint 144 split. F-2 (`--repair` dead code) and F-4 (silent fallbacks) demand wiring fix in Sprint 162, not deletion. |
| `src/cli/commands/plan.ts` | **KEEP-PRIVATE** | Tight, well-typed, ADR-012-compliant. Sprint 162 add `--mode` to close ADR-022-V2 gap (F-1). |
| `src/cli/commands/set-directives.ts` | **KEEP-PRIVATE** | Minimal, correct, three input modes (`--content`, `--file`, stdin). Robust enough; optional Sprint 162 preflight (F-10). |
| `src/cli/commands/init-templates.ts` | **KEEP-PRIVATE** (today) → **MIGRATE** to managed-docs (Sprint 162+) | Pure content generators; shipping docs into user projects. Fix doc drift (F-3) immediately; longer-term route through ADR-029 managed-docs pipeline + ADR-032 i18n templates to eliminate TR/EN duplication (F-8). |

No file in this scope is a **DELETE-CANDIDATE** or **UNCERTAIN** today.

---

## 7. Recommendations (Sprint 162+ work, not code changes)

### 7.1 — Single P1 fix (atomic, ~1-day task)

> **Task:** Wire `deckent plan --mode <ai|structured|auto>` to close ADR-022-V2 parity gap.
> **Files:** `src/cli/commands/plan.ts` (~10 LoC), `tests/cli/plan.test.ts` (3 cases).
> **Effort:** low.
> **Skills:** typescript-expert.
> **Why:** Aligns CLI surface with MCP tool surface (line 46 of `mcp/tools/plan.ts`),
> closes F-1, also unsticks F-3 (generated docs become true).

### 7.2 — Single P1 fix (separable)

> **Task:** Wire `init.ts:failedSteps.push(...)` from each of the four silent catches and from each helper that can fail.
> **Files:** `src/cli/commands/init.ts`, helpers in `init-steps.ts` (signature-only changes possible via try/catch wrappers).
> **Effort:** normal.
> **Skills:** typescript-expert.
> **Why:** Closes F-2 + F-4 atomically. Makes `--repair` actually useful.

### 7.3 — P2 cleanup batch

> **Task:** Per-IDE flag wiring, type-guard refactor, regex docs, Python skill mapping.
> **Files:** `src/cli/commands/init.ts`, `src/cli/commands/init-templates.ts`.
> **Effort:** normal.
> **Skills:** typescript-expert.
> **Why:** Closes F-5, F-6, F-7. Improves UX consistency.

### 7.4 — P3 strategic refactor (longer horizon)

> **Task:** Migrate `init-templates.ts` content from hand-rolled TR/EN literals to managed-docs template engine (ADR-029, ADR-030, ADR-032).
> **Files:** `src/cli/commands/init-templates.ts`, new `.deckent/templates/init/*.md.tpl`.
> **Effort:** high.
> **Skills:** typescript-expert, documentation-writer.
> **Why:** Closes F-8. Eliminates 120+ LoC of TR/EN duplication, future-proofs new IDE adapters, single source of truth for workflow narratives.

### 7.5 — Optional polish

> **Task:** `set-directives` preflight format validation (F-10).
> **Effort:** low.
> **Skills:** typescript-expert.

---

## 8. Verdict

| Dimension | Rating |
|-----------|:------:|
| Dead code | 1 instance (P1, `failedSteps`) |
| ADR violations | 1 instance (P1, ADR-022-V2 plan-mode parity) |
| Conflicting areas | 1 (P3, skill heuristic) |
| Drift (claims vs reality) | 2 (P2, doc drift; P2, silent fallback) |
| Type safety | Excellent — 0 `any`, 0 suppressions, 5 narrow `as` casts |
| Dependency hygiene | ✓ all `.js` ext, only `commander` + node builtins |
| Documentation pollution | 1 (P3, TR/EN duplication) |
| Memory V2 coherence | n/a (out of scope) |
| Config integrity | ✓ ADR-018 honored; `BrainPlanningMode` enum properly threaded |
| Migration triage | 4 KEEP-PRIVATE today; 1 MIGRATE candidate (init-templates Sprint 162+) |

**Net assessment:** healthy module set, recently refactored (Sprint 144 init split). Two real P1 issues — both small, both fixable in a single Sprint 162 task each. No P0. No security findings within this scope.

---

## 9. Audit metadata

- **Files written:** `docs/audits/sprint-161/T-161-025-cli-planning.md` (this report) — single audit report per directive
- **Source modifications:** none (READ-ONLY)
- **Tests run:** none (no source changed; `Test: N/A` per directive)
- **ADR amendments proposed:** none (findings inform Sprint 162 backlog, not new ADRs; F-1 implementation will retire the parity-gap reference in ADR-022-V2)
- **Worker authority assertions:** ADR-037 RBAC scope discipline preserved
  (only `docs/audits/sprint-161/T-161-025-cli-planning.md` written); ADR-039
  self-modifying detector should not flag (no Deckent source touched).

— **End of T-161-025 report**
