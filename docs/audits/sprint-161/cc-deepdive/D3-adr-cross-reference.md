# D3 — ADR Cross-Reference (Sprint 161)

**Lane:** 3 — Agent D3
**Mode:** READ-ONLY audit (grep + Read only)
**Date:** 2026-05-08
**Source of Truth:** `.brain/exports/decisions.md` + `src/` runtime grep
**Sprint 154 Reference:** Identified 4 dead exports (advanced features written but never wired). This audit re-checks all 46 active ADRs with the same lens.

---

## Summary

- **Total ADRs:** 44 accepted + 1 deprecated (ADR-005) + 1 superseded (ADR-022 v1) + 1 proposed (ADR-042) = **47 entries**
- **In-DB user-time entries:** 2 (ADR-045 Multi-Provider Docker Backend Parity, ADR-046 Auth Surface Atomicity) — both ACTIVE
- **With clear runtime call sites:** 39
- **Potentially dormant (0 runtime call sites or non-importer disposition):** 5 (mostly ADR-038 Kademe 2 deferred + ADR-028 V1 V2-replaced)
- **Contradictions detected:** 1 (ADR-005 deprecated but 804 sync I/O sites remain — partially overlaps with Sprint 132 audit finding)
- **Sprint 154 advanced features (4 dead exports) wire status:** 4/4 NOW WIRED (post-Sprint-154 hot fix Wave B). Independent confirmation in this audit.

---

## Per-ADR Audit Table

| ADR | Title | Status | Implementation Marker | Call Sites in `src/` | Verdict |
|-----|-------|--------|-----------------------|----------------------|---------|
| 001 | TypeScript + ESM | accepted | `tsconfig.json "module": "Node16"` + `"type": "module"` in package.json | tsconfig + 100% src .js extensions | ✅ ENFORCED |
| 002 | Node16 Module Resolution | accepted | `"moduleResolution": "Node16"` | tsconfig.json | ✅ ENFORCED |
| 003 | vitest over Jest | accepted | `vitest.config.ts` + package.json `"test": "vitest run"` | package.json + 505 .test.ts files | ✅ ENFORCED |
| 004 | 3-Layer Config Merge | accepted | `loadConfig` deepMerge in core/config.ts | grep `loadConfig`: many | ✅ ACTIVE |
| 005 | Synchronous I/O | **deprecated** | n/a (forbidden going forward) | 804 readFileSync/writeFileSync in src/ (50 in orchestra/) | ⚠️ **CONTRADICTION**: deprecated but not migrated. Sprint 132 audit flagged 799 sync I/O sites; today still ~804. New modules MAY use async per ADR-005 note, but no migration plan. |
| 006 | spawnSync Security Pattern | accepted | grep `spawnSync` | 164 sites in src/ | ✅ ACTIVE — most via `spawnSync(binary, [...args])` |
| 007 | SpawnOptions Interface | accepted | `SpawnOptions` + `allowedTools` | 87 sites | ✅ ACTIVE |
| 008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | accepted | grep reverse imports | 0 reverse imports found in tmux.ts/auditor.ts/worker.ts (the auditor.ts hit is a self-detection regex string, not a real import) | ✅ ENFORCED |
| 009 | DEBT.md Markdown Tablo Formatı | accepted | `parseDebtTable` / `generateDebtTable` | 12 sites | ✅ ACTIVE |
| 010 | Tek Runtime Dependency — commander.js | accepted | package.json dependencies | 7 dependencies (commander, telegraf, zod, better-sqlite3, @noble/ed25519, @noble/hashes, @modelcontextprotocol/sdk) — 1 optional (discord.js) | ⚠️ **VIOLATED in spirit**: ADR-010 says "tek runtime dependency olarak `commander`" but real package.json has 7 prod deps. ADR text is stale relative to current dependency surface. Should be re-issued or amended. |
| 011 | node:readline/promises | accepted | grep readline | 9 sites | ✅ ACTIVE |
| 012 | register{Name}(program) Pattern | accepted | `register[A-Z]*(program)` in cli/commands/ | 48 register exports across 56 files | ✅ ACTIVE |
| 013 | DECKENT.md Adapter Pattern | accepted | `ensureDeckentImport` | 36 sites | ✅ ACTIVE |
| 014 | .deck Secret File System | accepted | `DECK_FILE_NAME = '.deck'` in core/deck-file.ts | 5 sites (deck-file.ts + doctor) | ✅ ACTIVE |
| 015 | TaskRouter Module — 6-level routing | accepted | task-router.ts, taskRouter | 8 sites | ✅ ACTIVE |
| 016 | Connector Module — provider lifecycle | accepted | connectors/ dir | 52 Connector references | ✅ ACTIVE |
| 017 | MCP-Native Provider Adapters | accepted | `codex exec`, `gemini -p` in providers/codex.ts/gemini.ts | confirmed (codex.ts:282, gemini.ts:352) | ✅ ACTIVE |
| 018 | Multi-Environment Config Generation | accepted | init-steps.ts, init-templates.ts, init-wizard.ts, init.ts | confirmed in cli/commands | ✅ ACTIVE |
| 019 | Language-Agnostic Worker Verify | accepted | `STACK_COMMANDS` in worker-verify.ts/stack-detector.ts | 10 references | ✅ ACTIVE |
| 020 | Rich Sprint Output — 7-section summary | accepted | sprint-reporter.ts updateSprintLog/sectioned report | sprint-reporter.ts module 60+ KB | ✅ ACTIVE |
| 021 | Kraken ASCII Brand Identity | accepted | `cli/splash.ts` | grep returned only adr-seed/config/dashboard refs — splash.ts itself exists in cli/ | ✅ ACTIVE |
| 022 | CLI/MCP Feature Parity v1 | **superseded** | n/a | n/a | ✅ properly superseded by 022-V2 |
| 022-V2 | CLI/MCP Feature Parity Updated (Sprint 085) | accepted | CLI commands count vs MCP tools | 56 CLI .ts files / 28 MCP tool .ts files (excluding index) | ⚠️ **DRIFT**: ADR text declares "19 MCP araç = 19 CLI komutu" (Sprint 085 baseline). Current state is 28 MCP tools / 56 CLI files. ADR text is 73 sprints stale. Parity intent still holds (cli-only infra commands enumerated like attach/spawn/web/serve/plugin), but the listed counts are obsolete. **Update ADR or re-affirm in Sprint 162.** |
| 023 | Plan Tier Generalizasyonu | accepted | `performance/balanced/economic` in mode-presets.ts:36/47/58 | confirmed | ✅ ENFORCED |
| 024 | sprint-controller.ts God Object Split | accepted | sprint-phases.ts, sprint-utils.ts, result-collector.ts present | 3 files confirmed | ✅ ACTIVE |
| 025 | Graceful Shutdown — SIGINT | accepted | `interruptActiveSprint`, `killAllSessions` | 15 sites | ✅ ACTIVE |
| 026 | God Object Split Stratejisi (Faz 1-3) | accepted | sprint-phases.ts + sprint-utils.ts + result-collector.ts | 3 files confirmed | ✅ ACTIVE |
| 027 | Hybrid Spawn Backend (rejected hybrid mode) | accepted | spawn-backend.ts + spawn-backend-docker.ts (single-backend factory) | 3 files: spawn-backend.ts, spawn-backend-docker.ts, spawn-backend-mock.ts | ✅ ACTIVE — single-backend selection only, no hybrid wiring |
| 028 | Decision-Engine V1 → V2 Routing Migration | accepted | V1 retained as reference (decision-engine.ts, decision-replay.ts, decision-steps/) | files exist, dormant per ADR | ✅ INTENTIONALLY DORMANT (ADR-038 Kademe 3 plans Sprint 142+ reassessment) |
| 029 | Managed-Docs Universalization | accepted | `runManagedDocUpdates`, `managed-doc-runner.ts` | 12 sites | ✅ ACTIVE |
| 030 | Template Engine + Plugin Loader | accepted | template-renderer.ts, plugin-loader.ts in managed-docs/ | files exist | ✅ ACTIVE |
| 031 | Content Hash Cache | accepted | `doc-cache.ts` + `contentHash` | 7 sites | ✅ ACTIVE |
| 032 | i18n Pattern System (TR/EN) | accepted | `patternsByLang`, `I18nStrings`, `i18n(ctx)` | 30 sites | ✅ ACTIVE |
| 033 | Product Vision — Product Not Service | accepted | `telemetry_enabled = false` hard-coded | 8 sites | ✅ ENFORCED (telemetry_enabled never true) |
| 034 | Multi-Project Isolation | accepted | `realpathSync`, `ScopeViolationError` | 12 sites | ✅ ACTIVE |
| 035 | Verification Protocol Standard V1.0 | accepted | event-stream.ts + auditor verify functions | 10 event-stream importers + verifyWorkerResult/verifyFunctional/validateTechDebt/checkADRCompliance: 9 sites | ✅ ACTIVE |
| 036 | ADR Governance Integration | accepted | `loadADRContent` / `queryRelevantADRs` in task-builder.ts (with `selectRelevantAdrs`, `buildAdrPromptSection`); `store.getByType('adr')` | 8 sites; verified injection at task-builder.ts:741, 822, 851 | ✅ ACTIVE — also wired to `npm run lint:adr` |
| 037 | Brain-Auditor-Worker Authority Matrix RBAC V1.0 | accepted | `authority-enforcer.ts` + `assertBrainScope`/`assertWorkerScope` runtime calls | 6 importer files (worker.ts, observer.ts, dispatcher.ts, runtime-scope-check.ts, agents/auditor.ts, monitor/auditor.ts) | ✅ ACTIVE |
| 038 | Dead Code Disposition (Sprint 139 audit results) | accepted | Kademe 1 (delete) + Kademe 2 (defer) + Kademe 3 (ADR-028 dormant) + Kademe 4 (false positive correction) | Kademe 1 confirmed deleted (learning-decay/learning-migration/batch-stats absent); Kademe 2 partially deleted (combination-scorer ABSENT, but handoff-protocol.ts + brain-context.ts STILL on disk with **0 importers** in src/); Kademe 3 ADR-028 dormant modules still present; Kademe 4 parallel-pipeline confirmed active. | ⚠️ **PARTIALLY EXECUTED**: Kademe 1 done. Kademe 2 inconsistent — combination-scorer (101 LoC) was deleted, but handoff-protocol.ts (152 LoC) and brain-context.ts (268 LoC) remain on disk with zero importers and **NO `@deprecated` JSDoc / DEFERRED-ADR-038 marker** present (verified head -30 on handoff-protocol.ts: no marker). ADR-038 mandate "marked with `@deprecated` and `// DEFERRED: ADR-038, reassess Sprint 145`" was not honored. **Sprint 145 has passed without reassessment.** |
| 039 | Self-Modifying Task Detection | accepted | self-modifying-detector.ts + isSelfModifying wires (Sprint 154 T9) | 4 importers: task-builder.ts:23/857, worker.ts:29/247, authority-enforcer.ts | ✅ NEWLY WIRED (was dormant 12+ sprints, Sprint 154 fix) |
| 040 | Nervous System Architecture | accepted | src/nervous/ (12 modules) + observer wire in sprint-controller.ts:48/599-985 | 11 detectors, observer.start() at sprint-controller:607, 'detection' handler at :615 | ✅ ACTIVE — full pipeline wired |
| 041 | Agent Taxonomy (Horizontal Skills vs Vertical Agents) | accepted | test-writer agent removed from .deckent/agents/ (in archive only); routing-engine.ts:40 comment confirming removal | testing-expert auto-activation (17 refs); 18 active built-in agent dirs | ✅ ENFORCED |
| 042 | Hybrid Mode Architecture (Sprint + Task Dual Modes) | **proposed** | `deckent_style`, task-mode-runner.ts, runTaskMode | 32 sites | ⚠️ STATUS DRIFT: ADR is "proposed" but implementation is shipped (Sprint 149/150 confirmed in implementation status section). Should be promoted to `accepted` in Sprint 162. |
| 043 | Hot Fix with Claude Subagents | accepted | docs reference + meta-pattern (no runtime code call site) | 66 markdown references; pattern is operational, not code-call | ✅ DOC PATTERN ENFORCED |
| 044 | Sprint 154 Comprehensive Audit | accepted | docs/audits/sprint-154/ with 10 T-154-NNN reports + audit-coverage.json | 10 audit reports + coverage registry | ✅ DOC PATTERN ENFORCED |
| 045 (user-1778150182657) | Multi-Provider Docker Backend Parity | active | `buildProviderInvocation`, `provider_auth` in providers/ | 12 sites | ✅ ACTIVE |
| 046 (user-1778154724426) | Auth Surface Atomicity — Symmetric Refactor Discipline | active | `detectAuthMode`, `isAvailable` parity | 14 detectAuthMode sites + auth-surface-checklist.md present | ✅ ACTIVE — checklist-driven |

---

## Findings

### P0 — Dormant ADRs (Sprint 154 Pattern Recurrence Risk)

**Finding D3-P0-1: ADR-038 Kademe 2 mandate not fully honored.**
ADR-038 prescribed:
> "Bu modüller `@deprecated` JSDoc tag'i ile işaretlenecek ve dosya başına `// DEFERRED: ADR-038, reassess Sprint 145` yorumu eklenecek."

Verification:
- `combination-scorer.ts` — DELETED (101 LoC reclaimed) — partial Kademe 1 escalation
- `handoff-protocol.ts` — STILL PRESENT (152 LoC, 0 importers in src/) — NO @deprecated tag, NO DEFERRED marker
- `brain-context.ts` — STILL PRESENT (268 LoC, 0 importers in src/) — NO @deprecated tag, NO DEFERRED marker

We are now in Sprint 161 — Sprint 145 reassessment deadline (specified in ADR-038) is **16 sprints overdue**.

**Recommendation (Sprint 162 P1):** Either (a) promote handoff-protocol + brain-context to Kademe 1 delete (ADR-038 amendment) since they have 0 importers and have been dormant 22+ sprints, or (b) re-affirm deferred status with explicit Sprint 165 review checkpoint AND inject the missing `@deprecated` markers per ADR-038's own contract.

**Finding D3-P0-2: ADR-005 Deprecated but Not Migrated.**
ADR-005 says synchronous I/O is deprecated. Sprint 132 audit identified 799 sync I/O sites. Today: ~804 sync I/O sites in src/, including 50 in `src/orchestra/` (the same hot path Sprint 132 flagged). No async migration plan, no migration ADR follow-up.

This is the same Sprint 154 pattern (ADR exists, code path exists, but no enforcement bridge). Either the deprecation is real (then we need a migration sprint) or it's not (then we should rescind the deprecation).

**Recommendation (Sprint 162):** Decide — migration roadmap OR rescind ADR-005 deprecation.

---

### P1 — Contradictions

**Finding D3-P1-1: ADR-010 Single Runtime Dependency (commander) vs reality (7 prod deps).**
ADR-010 declares "tek runtime dependency olarak `commander@^13.0.0`." Current `package.json` dependencies:
```
@modelcontextprotocol/sdk, @noble/ed25519, @noble/hashes, better-sqlite3,
commander, telegraf, zod
```
Plus `discord.js` as optional. This is 7 prod deps + 1 optional, not 1.

Each dep was likely added with justification in its own sprint (Memory V2 → better-sqlite3, Telegram connector → telegraf, schema validation → zod, MCP → @modelcontextprotocol/sdk, signature → @noble/*), but ADR-010 was never amended.

**Recommendation (Sprint 162 P0):** Amend ADR-010 to enumerate accepted runtime deps with rationale per dep. Or supersede with new ADR "Minimal Runtime Dependency Discipline" listing the current approved set + the gate for adding a new one.

**Finding D3-P1-2: ADR-022-V2 CLI/MCP Parity Counts Outdated.**
ADR-022-V2 (Sprint 085) declares "19 MCP araç = 19 CLI komutu". 76 sprints later: 28 MCP tools, 56 CLI command files. Parity *intent* still holds (the doc enumerates intentionally CLI-only infrastructure commands), but the count statement is obsolete and would mislead a new contributor or auditor.

**Recommendation (Sprint 162 P2):** Update ADR-022-V2 to current counts and explicit MCP-tool ↔ CLI-command mapping, or migrate the count to a generated artifact (`docs/cli-mcp-parity-matrix.md`) referenced from the ADR.

**Finding D3-P1-3: ADR-042 Status Drift (proposed but shipped).**
ADR-042 (Hybrid Mode Architecture) is marked `proposed`, but Sprint 149/150 implementation status section in the ADR itself shows `deckent_style`, `deckent mode` CLI, sprint-controller mode-aware routing, TaskModeIdleDetector all done. Code grep confirms 32 active call sites. This is shipped, not proposed.

**Recommendation (Sprint 162 P1):** Promote ADR-042 status to `accepted` and back-fill the acceptance evidence date.

---

### P2 — Governance Gaps

**Finding D3-P2-1: ADR-038 Kademe 3 (Sprint 142 reassessment) overdue by 19 sprints.**
ADR-028 dormant modules (decision-engine.ts, decision-replay.ts, decision-steps/agent-step.ts, decision-steps/scope-step.ts, total ~495 LoC) were planned for Sprint 142+ reassessment. We are at Sprint 161. No documented reassessment.

**Recommendation:** Either schedule Sprint 162 reassessment, or extend explicitly with a reason in ADR-028 amendment.

**Finding D3-P2-2: ADR-035 Backward Compat Roadmap drift.**
ADR-035 specifies:
- Sprint 138: file-based + event stream parallel
- Sprint 142: file-based **removed**, only event stream

We are at Sprint 161. `.hb` and `.result` files are still in active use across worker.ts and result-evaluator.ts. The "Sprint 142 removed" milestone was missed by 19 sprints. ADR text and runtime are out of sync.

**Recommendation (Sprint 162 P1):** Either extend ADR-035 backward-compat timeline with explicit reason, OR schedule the file-based deprecation sprint, OR amend ADR-035 to permanent dual-state (file-based + event stream both kanonik).

**Finding D3-P2-3: ADR-040 Action Registry → Executor wiring half-complete.**
Sprint 154 audit (per task hint) flagged 4 dead exports. Of those:
- `respawnEligibleTasks` — wired in sprint-spawner.ts (used internally + via sprint-phases.ts)
- `applyCascadeToSprint` — wired at sprint-phases.ts:432
- `applyUnblockToSprint` — wired at sprint-phases.ts:443
- `reconcileSpuriousNoGo` — wired at result-evaluator.ts:92,106

All 4 confirmed wired. ✅ Sprint 154 fix held. No new dormancy detected for these specific functions.

**Finding D3-P2-4: 30-action ADR-040 Action Registry — only 10 grep refs.**
ADR-040 catalog declares 30 actions across 4 risk tiers. Grep `action-registry|ACTION_REGISTRY|actionRegistry` → only 10 refs. This may be normal (registry is a single source of truth, consumers may use enum-style references), but worth verifying that all 30 actions have at least one consumer/dispatcher path. Since this is a Sprint 161 P2 task (not blocking), recommend follow-up audit.

---

## Cross-Reference Matrix Summary

### ADRs with strongest runtime evidence (50+ call sites or core file presence)
- ADR-001/002 (TS+ESM): tsconfig + 100% src extension compliance
- ADR-006 (spawnSync): 164 sites
- ADR-007 (SpawnOptions): 87 sites
- ADR-013 (DECKENT.md adapter): 36 sites
- ADR-016 (Connector): 52 sites
- ADR-037 (RBAC matrix): 53 sites
- ADR-040 (Nervous System): 11 detectors, observer wired

### ADRs with weakest runtime evidence (potentially dormant)
- ADR-005 (deprecated, but 804 sync I/O remain — contradiction)
- ADR-028 (V1 decision engine — intentionally dormant per ADR-038 Kademe 3)
- ADR-038 Kademe 2 deferred (handoff-protocol, brain-context — 0 importers, no @deprecated tag)

### ADRs with status mismatch
- ADR-010 (claims 1 dep, has 7)
- ADR-022-V2 (counts 19/19, real 28/56)
- ADR-042 (proposed, but shipped)
- ADR-035 backward-compat (Sprint 142 milestone missed at Sprint 161)

---

## Sprint 162+ Recommendations

### P0 (must do Sprint 162)
1. **Amend ADR-010** with current 7 prod deps + per-dep rationale, or supersede with new ADR.
2. **ADR-038 Kademe 2 reconciliation:** delete handoff-protocol.ts + brain-context.ts (22 sprints dormant, 0 importers, no @deprecated marker), or formally reassess and inject markers.

### P1 (Sprint 162-163)
3. **Promote ADR-042 to accepted** with Sprint 149/150 implementation evidence.
4. **ADR-035 backward-compat decision:** extend or schedule file-based deprecation sprint.
5. **ADR-005 fate:** rescind deprecation OR commit migration roadmap.

### P2 (Sprint 163-165)
6. **Update ADR-022-V2** count statements or migrate counts to generated artifact.
7. **ADR-028 Sprint 142 reassessment** — 19 sprints overdue, schedule.
8. **ADR-040 Action Registry coverage audit** — verify all 30 actions have consumers.
9. Add **CI gate**: `npm run lint:adr` should detect status mismatch (proposed ADR with shipped wire) by cross-referencing implementation status section against status field.

---

## Methodology Notes

- Source of truth: `.brain/exports/decisions.md` (auto-generated from `.brain/memory.db`)
- Runtime grep: `grep -rn ... /home/alperen/deckent-dev/src/ --include="*.ts"` (excluded tests/, node_modules)
- Implementation status validated against ADR text where ADRs declared specific files or function names
- "Call sites" counted via raw grep — does NOT distinguish between definition site and consumer site; threshold is "presence > 0"
- Sprint 154 dead-export remediation independently verified by grepping for `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint`, `reconcileSpuriousNoGo` — all 4 confirmed wired

## Files of Interest

- `/home/alperen/deckent-dev/.brain/exports/decisions.md` (full ADR list, 2031 lines)
- `/home/alperen/deckent-dev/src/orchestra/handoff-protocol.ts` (Kademe 2 dormant, 0 importers, no marker)
- `/home/alperen/deckent-dev/src/orchestra/brain-context.ts` (Kademe 2 dormant, 0 importers, no marker)
- `/home/alperen/deckent-dev/src/orchestra/task-builder.ts:741,822,851` (ADR-036/039 wire)
- `/home/alperen/deckent-dev/src/orchestra/sprint-controller.ts:48,599-985` (ADR-040 nervous wire)
- `/home/alperen/deckent-dev/src/orchestra/sprint-phases.ts:432,443` (Sprint 154 wire fix held)
- `/home/alperen/deckent-dev/src/orchestra/result-evaluator.ts:92,106` (Sprint 154 wire fix held)
- `/home/alperen/deckent-dev/src/core/mode-presets.ts:36-58` (ADR-023 tier names)
- `/home/alperen/deckent-dev/.deckent/agents/archive/test-writer-removed-sprint-148/` (ADR-041 evidence)
- `/home/alperen/deckent-dev/docs/development/auth-surface-checklist.md` (ADR-046)
- `/home/alperen/deckent-dev/docs/audits/sprint-154/audit-coverage.json` (ADR-044)
- `/home/alperen/deckent-dev/scripts/adr-validator.mjs` (ADR-036)
- `/home/alperen/deckent-dev/package.json` (ADR-010 contradiction evidence)
- `/home/alperen/deckent-dev/tsconfig.json` (ADR-001/002 evidence)

---

**END D3 — ADR Cross-Reference Audit (Sprint 161)**
