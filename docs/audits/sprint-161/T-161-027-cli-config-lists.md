# T-161-027 — CLI: config + introspection lists Audit

**Sprint:** 161 — God-Level READ-ONLY Self-Audit (Lane 1)
**Date:** 2026-05-08
**Auditor:** Worker w-161-027 (doc-writer + typescript-expert)
**Mode:** READ-ONLY — no source modifications, no deletes

---

## 1. Scope

| File | LoC | Purpose |
|------|----:|---------|
| `src/cli/commands/config.ts` | 269 | `deckent config` parent + `set/get/export/import/list/keys/migrate` subs |
| `src/cli/commands/sync.ts` | 534 | `deckent sync` — adapter file sync + git out-of-band detection |
| `src/cli/commands/agent.ts` | 534 | `deckent agent` parent + `list/create/stats/enable/disable/delete/edit/info` subs (DIRECTIVES referenced this as `agent-list.ts` — drift) |
| `src/cli/commands/skill.ts` | 706 | `deckent skill` parent + `list/create/install/update/enable/disable/delete/info` + marketplace re-export (DIRECTIVES referenced this as `skill-list.ts` — drift) |
| `src/cli/commands/mode.ts` | 125 | `deckent mode show/sprint/task/auto/global` — `deckent_style` toggle (Sprint 149) |

**Total audited:** ~2,168 LoC across 5 files. (Slightly exceeds the 2,000 LoC soft cap — accepted because skill.ts alone is 706 LoC and cannot be split without violating the single-report mandate.)

**Naming drift noted up front:** `DIRECTIVES.md` and `DECKENT.md` consistently say `agent-list.ts` / `skill-list.ts`, but the on-disk filenames are `agent.ts` / `skill.ts` (each one defines a parent command with a `list` subcommand, not a dedicated list-only file). This is documentation drift, not a bug — but the audit task description should be normalised in subsequent sprints.

---

## 2. Findings (organised by severity)

### P0 (Boundary / Security)

#### P0-1 — `skill update` skips Ed25519 signature verification
- **File:** `src/cli/commands/skill.ts:508-579`
- **Evidence:**
  - `skill install` (lines 290-506) requires `signature.ed25519` and rejects unsigned skills unless `--allow-unsigned` (added Sprint 153, see lines 354-372 for git path, 447-464 for local path).
  - `skill update` (lines 508-579) re-clones / re-copies the source and overwrites `skillDir` (lines 554-555 git, 562-563 local) **without ever calling `verifySkillSignature`**.
- **Impact:** A user who installed a signed skill, and later runs `deckent skill update <name>`, can have it silently replaced with an unsigned or differently-signed payload. This bypasses the supply-chain control that ADR-035 verification protocol implicitly relies on for skill registry trust.
- **Triage:** Recommend Sprint 162 fix — share the verification block via a private helper (`verifyClonedSkill(tmpDir, skillId, allowUnsigned)`) and call it from both `install` and `update`. Symmetric refactor discipline (see ADR-046 in summary.md).
- **Note (non-fatal but related):** `skill update` git clone timeout is `30_000` ms (line 540), while `skill install` uses `60_000` ms (line 318). Drift introduced when Sprint 150-153 increased install timeout but did not propagate to update.

### P1 (Architecture / Drift / Data-loss)

#### P1-1 — `mode.ts` writes config without schema validation (data-loss risk)
- **File:** `src/cli/commands/mode.ts:20-36`, `mode.ts:62-103`
- **Evidence:**
  - `readProjectConfig(configPath)` at line 20-27 silently catches malformed JSON and returns `{}`. Then `setProjectConfigValue` (line 32-36) writes the in-memory `{}` plus the new key — **destroying any previously-saved keys** if the on-disk file had a comment or a transient parse error.
  - Compare with `config.ts:115-145` (`config set`) which uses `validatePartialConfig(existing)` (line 135) before writing.
- **Impact:** `deckent mode sprint|task|auto` can clobber `.deckent/config.json` if the file contains JSON-with-comments (which `config.ts:exportConfig` happily produces via `stripJsonComments`) or any transient corruption. No backup is taken, unlike `migrateConfig` which writes `.bak`.
- **Triage:** Sprint 162 — `mode.ts` should reuse `config.ts` helpers (`validatePartialConfig`, `migrateConfig` flow) or refuse to write when the existing file fails to parse. ADR-004 (3-layer config merge) is implicitly violated because the project layer can be silently destroyed.

#### P1-2 — `sync.ts:writeSyncToMemory` writes directly to MEMORY.md, bypassing DB-first Memory V2
- **File:** `src/cli/commands/sync.ts:233-263`
- **Evidence:**
  - `DECKENT.md` and `summary.md` both state Memory V2 is **DB-first**: SQLite is "single source of truth, .md files are generated exports".
  - `writeSyncToMemory` reads `.brain/MEMORY.md`, mutates the `## Out-of-band Changes` section, and writes the file back (line 262: `writeFileSync(memoryPath, updated, 'utf-8')`).
  - There is no corresponding `store.insert({ type: 'memory', ... })` against the SQLite DB.
- **Impact:** Memory V2 coherence break — the next `deckent memory rebuild` (DB ← exports) may pick up the synthetic section, or the next `deckent memory export` (DB → exports) will overwrite it. Either direction creates flapping. This is a `Memory V2 coherence` finding from the 10-dimension matrix.
- **Triage:** Sprint 162 — `sync.ts` should write to the DB via `MemoryStore.insert` and rely on the export pipeline to refresh `MEMORY.md`. Or, if file-write must remain for legacy reasons, mark the section as `decay_exempt` in the export contract. KEEP-PRIVATE until reconciled.

#### P1-3 — `CONFIG_METADATA` describes only 42 keys; `DeckentConfig` has ~75 top-level fields
- **File:** `src/core/config.ts:959-1249` (CONFIG_METADATA, 42 entries) vs `src/core/config-types.ts` (DeckentConfig, ~75 fields)
- **Evidence:**
  - `awk '/CONFIG_METADATA: Readonly/,/^} as const;/' src/core/config.ts | grep -E "^  [a-z_]+:" | wc -l` → `42`.
  - `awk '/^export interface DeckentConfig/,/^}/' src/core/config-types.ts | grep -E "^  [a-z_]+\??:" | wc -l` → `75`.
  - Missing from CONFIG_METADATA (sample): `learning`, `collaboration`, `decision_engine`, `notifications`, `human_checkpoints`, `lock_stale_threshold`, `routing_engine`, `cleanup_delay_ms`, `nervous_system`, `timeout`, `sprint_file_retention`, `observability`, `evaluation_rubric`, `adaptive_thresholds`, `provider_overrides`, `model_strategy`, `providers`, `provider_auth`, etc.
- **Impact:** `deckent config keys` (config.ts:222-230) and `deckent config list` (config.ts:204-220) silently omit ~33 valid configuration keys. `deckent config set <missing-key> <value>` will succeed (validatePartialConfig only rejects *invalid* values, not unknown keys) but the user has no discoverability path. Documentation pollution dimension.
- **Triage:** Sprint 162 — generator script that diffs `DeckentConfig` keys against `CONFIG_METADATA` and fails CI on drift. Or treat `CONFIG_METADATA` as authoritative and lift it into config-types.ts via codegen.

#### P1-4 — `agent list` / `skill list` MCP↔CLI parity drift (ADR-022-V2 violation)
- **Files:** `src/cli/commands/agent.ts:218-252`, `src/mcp/tools/agent-list.ts:33-100`; `src/cli/commands/skill.ts:206-243`, `src/mcp/tools/skill-list.ts:20-100`.
- **Evidence:**
  - CLI `agent list` columns: `Name | Type | Status (enabled/disabled) | Uses | Success | Model` (agent.ts:238-247).
  - MCP `deckent_agent_list` returns: `id, name, type, uses, successRate` (mcp/tools/agent-list.ts:50-56). **Missing:** `enabled`, `model`.
  - CLI `skill list` columns: `Name | Category | Status (enabled/disabled) | Triggers | Priority` (skill.ts:230-237).
  - MCP `deckent_skill_list` returns: `id, name, category, triggers, byCategory` (mcp/tools/skill-list.ts:37-42). **Missing:** `enabled`, `priority`.
- **Impact:** ADR-022-V2 mandates feature parity — "MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır". MCP clients (Claude Code, VS Code, Cursor) cannot determine if an agent/skill is enabled or which model an agent uses. This is *output schema parity*, not just parameter parity, so this counts as an ADR-022-V2 incomplete-implementation finding.
- **Triage:** Sprint 162 — extend MCP `AgentEntry` / `SkillEntry` types to include `enabled`, and for agents `model`, for skills `priority`. Symmetric to the CLI `formatTable` columns.

#### P1-5 — `mode` CLI has no MCP equivalent
- **Files:** `src/cli/commands/mode.ts` (entire file) vs `src/mcp/tools/` (no `mode.ts`)
- **Evidence:** `grep -rn "deckent_mode|registerMode" src/mcp/` → no matches.
- **Impact:** `deckent_style` is a runtime-changing setting (Sprint 149) wired into `sprint-controller.ts:531` and `task-mode-runner.ts:56`. ADR-022-V2 explicitly enumerates "infrastructure-only" CLI commands (attach, web, plugin, etc.) that may stay CLI-only — `mode` is not one of them. It is an **operating-mode toggle**, which is functionally equivalent to `deckent_config set deckent_style task`.
- **Triage:** Two acceptable fixes: (a) add `deckent_mode` MCP tool with show/sprint/task/auto/global subcommands; or (b) deprecate `mode.ts` and document `deckent_config set deckent_style …` as the canonical path. Either is consistent with ADR-022-V2; current state is not.

#### P1-6 — `runSync` is exported but only used by tests (live wire is a duplicate copy)
- **File:** `src/cli/commands/sync.ts:300-318` vs `sync.ts:476-512` (registerSync action body)
- **Evidence:**
  - `runSync(root)` (line 300) does: `isGitRepo` → `getLastSprintTimestamp` → `getCommitsSince` → `getChangedFiles`.
  - `registerSync` action (lines 476-512) inlines the *exact* same sequence with the exact same control flow, plus warning messages and JSON formatting.
  - `grep -rn "runSync" src/` → only the export site; only `tests/cli/commands/sync.test.ts:35,366,382` consume it.
- **Impact:** Two parallel implementations of the "git out-of-band detection" path. A bug-fix to one will silently miss the other. Conflicting-areas dimension. Tests pass against `runSync`, while real users hit the inline copy.
- **Triage:** Sprint 162 — refactor `registerSync` action to call `runSync(root)` and then handle warnings + output formatting from the result. Keeps one source of truth.

### P2 (Type-safety / Validation gaps / Drift)

#### P2-1 — `validateManifestWithZod` is weaker than the `SkillDefinition` type guard it replaces
- **File:** `src/cli/commands/skill.ts:73-94`
- **Evidence:**
  - The Zod schema (lines 73-79) requires only `id`, `name`, `version`; `description` and `category` are optional. **No** validation of `enabled`, `triggers`, `priority`, `stats`.
  - `SkillDefinition` (in `src/core/skill-types.ts`) requires `enabled: boolean`, `priority: number`, `triggers: string[]`, `category: string`, etc. — see line 230-237 where `skill list` reads `s.enabled`, `s.priority`, `s.category` unguarded.
- **Impact:** A maliciously crafted manifest with `{id, name, version}` and nothing else passes installation, then crashes downstream `skill list` (`s.triggers.slice(0, 3)` → TypeError on undefined) or `skill info` (`manifest.priority` → undefined printed). Type-safety dimension.
- **Triage:** Sprint 162 — extend `SkillManifestSchema` to mirror `SkillDefinition` required fields, or reject installation if downstream-required fields are missing.

#### P2-2 — Mixed validateManifest paths in skill.ts (drift between git and local install)
- **File:** `src/cli/commands/skill.ts:337-340` (git path) vs `skill.ts:436-438` (local path)
- **Evidence:**
  - Git path uses `validateManifestWithZod(manifestData)` and constructs an error from `result.errors.join(', ')`.
  - Local path uses the boolean `validateManifest(manifestData)` (lines 91-94) which throws a generic `DECKENT_E028` with no error detail.
- **Impact:** Local-install error messages are markedly less actionable than git-install errors. UX drift; minor security blast.
- **Triage:** Sprint 162 — local path should also call `validateManifestWithZod` and surface field-level errors.

#### P2-3 — `mode show` reads merged config but setters write project-only (asymmetric I/O)
- **File:** `src/cli/commands/mode.ts:46-56` (show) vs `mode.ts:58-104` (sprint/task/auto)
- **Evidence:**
  - `mode show` calls `await loadConfig(root)` (line 49) which is the 3-layer merge (defaults → global → project — ADR-004).
  - `mode sprint|task|auto` writes ONLY to `PROJECT_CONFIG_PATH` (lines 65, 80, 98) with no awareness of the global layer.
  - `mode global <style>` writes ONLY to `GLOBAL_CONFIG_PATH` (line 118).
- **Impact:** A user who set `deckent_style: task` globally, then runs `deckent mode show` in a project that has no override, sees `Current: task`. Then runs `deckent mode sprint`. Then `deckent mode show` reports `Current: sprint`. So far consistent. But: if global is `task` and project is `sprint`, then `deckent mode global sprint` does NOT change what `deckent mode show` reports. The user has no UI signal that the project layer is masking the global change. UX drift.
- **Triage:** Sprint 162 — `mode show` should enumerate which layer set the active value (e.g., `Current: sprint (project override; global=task)`).

#### P2-4 — `mode` description claims `auto` is a value, but it's a sub-command
- **File:** `src/cli/commands/mode.ts:39-41`
- **Evidence:** `description('Get/set deckent_style (sprint|task|auto)')` — but `VALID_STYLES = ['sprint', 'task'] as const` (line 10) and `auto` is a sub-command that *infers* one of those two, not a stored value.
- **Impact:** Documentation pollution — `deckent mode --help` falsely advertises a third value. A user typing `deckent config set deckent_style auto` would be rejected by `validateConfig`.
- **Triage:** Trivial doc fix in Sprint 162.

#### P2-5 — `agent.ts` exports `createHash` solely for tests (dead re-export)
- **File:** `src/cli/commands/agent.ts:1`, `agent.ts:534`
- **Evidence:**
  - `import { createHash } from 'node:crypto';` (line 1).
  - `export { createHash };` (line 534).
  - `grep -n "createHash" src/cli/commands/agent.ts` → only those two lines. No internal use.
- **Impact:** Dead re-export of a Node built-in. Suggests an old test mock that no longer applies. Dead-code dimension.
- **Triage:** Sprint 162 — drop both lines if no test depends on the re-export. KEEP-PRIVATE until verified. (Verification: `grep -rn "from.*agent.js'.*createHash" tests/` is the gate.)

#### P2-6 — `agent.ts:loadAgentSprintStats` regex parsing is brittle (Sprint 134 T-009 drift candidate)
- **File:** `src/cli/commands/agent.ts:166-211`
- **Evidence:**
  - Sprint reporter was 4-way split in Sprint 134 T-009 (per IDENTITY.md). The output format `.brain/sprints/sprint-NNN.md` may have shifted.
  - The regex at line 187 `/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(GO|NO_GO|GO_WITH_TECH_DEBT)\s*\|/g` assumes a specific column layout: `| col1 | col2 | <verdict> |`.
  - Line 184 builds `new RegExp(agentName, 'gi')` **without escaping** — built-in agent names happen to be regex-safe (validated at line 60), but a `.` or `*` in a third-party agent name would break this.
  - Line 196-200: when no table rows match, falls back to "agent name mention count" as a proxy for both `tasks` and `success`, yielding 100% success on every sprint. Misleading metric.
- **Impact:** `deckent agent stats <name>` returns implausible 100% success rates whenever the table format drifts. Drift dimension. Tied to Sprint 152 verification-blind-bug-class issues (per ADR-044).
- **Triage:** Sprint 162 — read agent stats from MemoryStore (`store.getByType('memory')` filtered by sprint_id + agent metadata) instead of regex-scraping markdown. Aligns with DECKENT.md "All brain knowledge lives in `.brain/memory.db`" rule.

#### P2-7 — `config.ts` does dynamic import of `config-migration` despite static import on line 7
- **File:** `src/cli/commands/config.ts:91`
- **Evidence:**
  - Line 7: `import { migrateConfig, setNestedValue, getNestedValue } from '../../core/config-migration.js';`
  - Line 91: `const { needsMigration: checkNeeds, migrateConfig: runMigrate } = await import('../../core/config-migration.js');`
- **Impact:** Two import paths to the same module. The dynamic import is presumably defensive (auto-migration must not fail noisily), but `migrateConfig` is already statically imported — so only `needsMigration` actually needs the dynamic import. Could be flattened by adding `needsMigration` to the static import.
- **Triage:** Trivial cleanup in Sprint 162.

### P3 (Hygiene / Minor)

#### P3-1 — `config-migration.ts:661` re-exports `collectKeys` but only test mock consumes it
- **File:** `src/core/config-migration.ts:661`
- **Evidence:** `grep -rn "collectKeys" src/` → only definition + internal use; only `tests/cli/commands/config-overhaul.test.ts:58` references it externally (as a mock placeholder).
- **Triage:** P3 dead export — drop `collectKeys` from the public re-export list.

#### P3-2 — `sync.ts` constants block hand-defines `GEMINI_FILE`, `CURSOR_RULES_DIR`, `CODEX_DIR`
- **File:** `src/cli/commands/sync.ts:12-16`
- **Evidence:** `core/constants.ts` already centralises `DECKENT_DIR`, `CLAUDE_FILE`, `AGENTS_FILE`, etc. Sync defines its own `GEMINI_FILE = 'GEMINI.md'`, `CURSOR_RULES_DIR = '.cursor'`, `CODEX_DIR = '.codex'`. Drift; future Cursor/Codex path changes need to be made in two places.
- **Triage:** Sprint 162 — promote these three string literals to `core/constants.ts`. ADR-018 (multi-environment config generation) is the natural home.

#### P3-3 — `sync.ts:formatSyncOutput` returns string with hard-coded "→ Added to MEMORY.md for next sprint context"
- **File:** `src/cli/commands/sync.ts:291`
- **Evidence:** This message is printed even when `--dry-run` is set (the dry-run gate is in registerSync action body at line 522-524, but the helper itself does not know about dry-run).
- **Impact:** Minor — the action body does branch on dry-run before calling formatSyncOutput, so users see correct output. But the helper has hidden coupling to a side effect that may or may not have happened. UX/maintenance smell.
- **Triage:** Sprint 162 — make the "Added to MEMORY.md" line opt-in via parameter.

#### P3-4 — `agent.ts:loadAgentSprintStats` numeric sort bug on multi-digit sprint numbers
- **File:** `src/cli/commands/agent.ts:172-176`
- **Evidence:** `parseInt(a.replace(/\D/g, ''), 10) || 0` — for `sprint-100.md` and `sprint-99.md`, this yields `100` and `99`. OK. But for `sprint-10.md.bak` and `sprint-1.md`, `\D` strip yields `10` and `1`. Still fine. The `|| 0` fallback collapses unparseable filenames to 0, sorting them first. Acceptable; documenting because audit task asks for drift surveillance.
- **Triage:** No action; document as P3 acceptable.

#### P3-5 — `skill.ts:706` — file size approaches god-module threshold
- **File:** `src/cli/commands/skill.ts` (entire file)
- **Evidence:** 706 LoC with 9 sub-commands plus marketplace re-export plus install/update lifecycle. Comparable to pre-split sprint-controller.ts (1890 → 209 LoC, Sprint 136 T-008).
- **Triage:** Sprint 162+ — split candidates: `skill-install.ts` (lines 290-506 + 508-579), `skill-list-info.ts` (lines 206-243 + 644-698), `skill-mutators.ts` (enable/disable/delete). ADR-026 (god-object split phase 1-3) provides precedent. UNCERTAIN — only worth doing if an active feature requires the split.

---

## 3. ADR Compliance Matrix

| ADR | Constraint | Status | Evidence |
|-----|------------|--------|----------|
| ADR-004 | 3-layer config merge (defaults→global→project) | **PARTIAL** | `mode.ts` writes project layer with no global awareness; `mode show` reads merged, setters don't. See P2-3. |
| ADR-006 | spawnSync security pattern (no `shell:true`, array args) | **PASS** | All `spawnSync` calls in sync.ts (lines 38,75,113,126,147) and skill.ts (lines 316, 540) use array args; no shell expansion. |
| ADR-007 | SpawnOptions interface | **PASS** | Options are all literal `{cwd, encoding, timeout}` — no rogue `shell` flag. |
| ADR-008 | Brain centralised import direction | **PASS (cli layer)** | These commands sit in CLI layer; they import core helpers, not orchestra/brain. No reverse imports. |
| ADR-009 | DEBT.md markdown table format | **N/A** | Not relevant to this scope (sync writes MEMORY.md, not DEBT.md). |
| ADR-010 | Single runtime dependency commander | **PASS** | All 5 files use `import type { Command } from 'commander'`. No new deps. (skill.ts adds `zod` import — but `zod` was added pre-existing in package.json and is used widely; not a new runtime dep introduced by this scope.) |
| ADR-012 | `register<Name>(program)` pattern | **PASS** | `registerConfig`, `registerSync`, `registerAgent`, `registerSkill`, `registerMode` all conform. |
| ADR-022-V2 | CLI/MCP feature parity | **VIOLATION (multi)** | See P1-4 (output schema drift) and P1-5 (no `deckent_mode` MCP tool). |
| ADR-027 | Hybrid spawn backend | **N/A** | This scope does not interact with spawn backend. |
| ADR-035 | Verification protocol standard | **PARTIAL** | `skill update` skips signature verify — see P0-1. |
| ADR-037 | Brain-Auditor-Worker authority matrix RBAC | **N/A** | CLI surface; no runtime worker scope assertions in these files. |
| Memory V2 (DB-first) | SQLite single source of truth, MD = exports | **VIOLATION** | `sync.ts:writeSyncToMemory` writes MEMORY.md directly. See P1-2. |

---

## 4. Migration triage (per file)

| File | Disposition | Reasoning |
|------|-------------|-----------|
| `config.ts` | **KEEP-PRIVATE** | Pure CLI-layer config orchestration; not a public API. Internals reference private migration helpers (`config-migration.ts`). Should remain in `src/cli/commands/`. |
| `sync.ts` | **KEEP-PRIVATE (with refactor)** | CLI-internal but contains memory-bypass (P1-2) that must be reconciled before any public API exposure. `runSync` export already serves tests, so the export surface is partially leaked. |
| `agent.ts` | **KEEP-PRIVATE** | CLI-only; helper exports (`loadAllAgents`, `getAgentUses`, `getAgentSuccessRate`) are reused by introspection commands but not by public API. |
| `skill.ts` | **KEEP-PRIVATE** | CLI-only with marketplace re-export; signature/sandbox surface is sensitive. P0-1 must be fixed before any public-facing automation depends on `skill update`. |
| `mode.ts` | **DELETE-CANDIDATE** | The five subcommands collapse to 3 calls of `setProjectConfigValue` and 1 call of `saveGlobalConfig`. Equivalent to `deckent config set deckent_style …` plus `--global` flag (which `config.ts:set` does NOT currently expose, but could). If `config set` gains `--global`, `mode.ts` becomes redundant. UNCERTAIN until that decision is made — Sprint 162 should resolve. |

---

## 5. Recommendations for Sprint 162+

Ordered by severity. None of these are code changes performed in this sprint — the audit is read-only.

1. **[P0] Sprint 162 / security hot-fix** — Add Ed25519 verification to `skill update` symmetric to `skill install`. Extract a private `verifyClonedSkill(dir, id, allowUnsigned)` helper.
2. **[P1] Sprint 162** — Replace `mode.ts:readProjectConfig`'s silent JSON-error-swallow with a hard fail (or auto-backup) before write. Wire `validatePartialConfig` into the setter path.
3. **[P1] Sprint 162** — Reconcile `sync.ts:writeSyncToMemory` with Memory V2 DB-first contract: write via `MemoryStore.insert({ type: 'memory', sprint_id, ... })`, then re-export.
4. **[P1] Sprint 162** — Generate `CONFIG_METADATA` from `DeckentConfig` via codegen, or add a CI gate that fails on key drift.
5. **[P1] Sprint 163** — Extend MCP `deckent_agent_list` and `deckent_skill_list` response schemas to include `enabled` (and `model` / `priority`). Decide between `deckent_mode` tool or deprecation.
6. **[P1] Sprint 162** — Refactor `registerSync` action body to call `runSync` (eliminate duplicate path).
7. **[P2] Sprint 162** — Tighten `SkillManifestSchema` (skill.ts) to match `SkillDefinition` required fields. Use Zod-validated path on the local install branch as well.
8. **[P2] Sprint 163** — Replace `agent.ts:loadAgentSprintStats` markdown regex scraping with `MemoryStore` queries.
9. **[P3] Sprint 162** — Centralise `GEMINI_FILE`, `CURSOR_RULES_DIR`, `CODEX_DIR` constants. Drop `createHash` dead re-export in `agent.ts`. Drop `collectKeys` re-export in `config-migration.ts`.

---

## 6. Audit summary

| Severity | Count |
|----------|------:|
| P0 | 1 |
| P1 | 6 |
| P2 | 7 |
| P3 | 5 |
| **Total findings** | **19** |

**Headline:** The five files hang together as the *config & introspection* surface of the CLI. The biggest risk is **P0-1** — `skill update` sidestepping the Sprint 153 signature-verification regimen that `skill install` enforces. The largest *systemic* drift is **P1-3** — `CONFIG_METADATA` lagging `DeckentConfig` by 33 keys, undermining `deckent config keys/list` as a discoverability tool. The Sprint 149 `mode` CLI is functional but introduces a *parallel* config-write path that lacks the validation discipline of `config.ts:set` (P1-1) and has no MCP equivalent (P1-5).

No source-code changes were made. No files were deleted. Single audit report written to `docs/audits/sprint-161/T-161-027-cli-config-lists.md`.
