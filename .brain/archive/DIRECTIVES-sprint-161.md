# DIRECTIVES — Sprint 161: God-Level READ-ONLY Self-Audit (Lane 1)

## Referanslar
- Spec: docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md
- Plan: docs/superpowers/plans/2026-05-08-sprint-161-god-audit-execution.md
- Önceki sprint arşiv: .brain/archive/DIRECTIVES-sprint-160.md

## Goal
Pre-beta comprehensive READ-ONLY static audit (excluding tests/). 40+ tasks across
10 macro areas. Each task ≤8 files, ≤2000 LoC, opus model, single audit report
output to docs/audits/sprint-161/T-161-NNN-{focus}.md.

## ABSOLUTE RULES — Workers MUST OBEY

- DO NOT write source code anywhere
- DO NOT delete any file
- DO NOT refactor anything
- DO NOT modify .deckent/, .brain/, .github/, root config files
- DO NOT touch tests/ (out of scope this sprint)
- ONLY write to your assigned audit report at docs/audits/sprint-161/T-161-NNN-*.md
- scope.filesWrite contains EXACTLY ONE PATH (the audit report)
- ADR-037 RBAC + ADR-039 self-modifying detector flag any deviation as P0 boundary violation

## Per-task report format (mandatory)

1. **Scope** — exact file list audited
2. **Findings** — severity P0/P1/P2/P3, dimension category, summary
3. **Evidence** — file:line citations
4. **Migration triage** — per file: KEEP-PRIVATE | MIGRATE-PUBLIC | DELETE-CANDIDATE | UNCERTAIN
5. **Recommendation** — Sprint 162+ work description (NOT a code change)

## 10 Audit Dimensions (apply all per task)

1. Dead code (unused exports)
2. ADR violations (44 active ADRs)
3. Conflicting areas (duplicated logic)
4. Drift (comments vs behavior, claims vs reality)
5. Type safety (any, ts-ignore, as unknown as)
6. Dependency hygiene (.js extensions, circular deps)
7. Documentation pollution (duplicate, orphan, outdated)
8. Memory V2 coherence (where applicable)
9. Config integrity (where applicable)
10. Migration triage classification

---

## Task 1: src/core/ — config + types
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-001-core-config-types.md
- Scope: src/core/

### Description
READ-ONLY audit of `src/core/config.ts`, `src/core/config-types.ts`, `src/core/types.ts`,
`src/core/constants.ts` and 2-3 related `*-types.ts` modules (≤8 files, ≤2000 LoC).
Apply 10 dimensions. Lead questions: ADR-004 3-layer config merge correctness?

**Kanıt:** Single audit report.
**Test:** N/A (read-only).

---

## Task 2: src/core/ — Memory V2
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-002-core-memory-v2.md
- Scope: src/core/

### Description
READ-ONLY audit of `memory-store.ts`, `memory-query.ts`, `memory-normalize.ts`,
`memory-types.ts`, `memory-export.ts`, `memory-import.ts`. Lead: DB schema migration
version, FTS5 dual-layer turkishNormalize alignment, exports vs DB drift,
decay-exempt correctness. Apply 10 dimensions.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 3: src/core/ — agent-pool + skill-pool
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-003-core-agent-skill-pool.md
- Scope: src/core/

### Description
READ-ONLY audit of `agent-pool.ts`, `skill-pool.ts`, `skill-registry.ts`. Lead:
15 built-in agents + 21 skills claim verification, LRU eviction, AST sandbox.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 4: src/core/ — provider + routing core
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-004-core-provider-routing.md
- Scope: src/core/

### Description
READ-ONLY audit of `provider.ts`, `routing-types.ts`, `manifest-migrator.ts`,
`condition-evaluator.ts`. Lead: ProviderAdapter interface contract, V1→V2 manifest
migration completeness.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 5: src/core/ — routing engine + activation
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-005-core-routing-engine.md
- Scope: src/core/

### Description
READ-ONLY audit of `routing-engine.ts`, `activation-engine.ts`, `intent-classifier.ts`.
Lead: 3-layer routing (intent → activation → routing) correctness, ADR-028 V1→V2
migration finished.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 6: src/core/ — model-registry + mode-presets
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-006-core-model-mode.md
- Scope: src/core/

### Description
READ-ONLY audit of `model-registry.ts`, `mode-presets.ts`. Lead: 13 models / 3 providers /
4 tiers, MODE_PRESETS duplicate (Sprint 150 H3 debt), tier equivalence.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 7: src/core/ — file-lock + event-stream + heartbeat
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-007-core-locks-events.md
- Scope: src/core/

### Description
READ-ONLY audit of `file-lock.ts`, `event-stream.ts`, heartbeat-related files,
`scope-sanitizer.ts`. Lead: ADR-006 spawnSync security pattern, lock orphan detection.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 8: src/core/ — credentials + deck-file + global-config
- Model: opus
- Effort: normal
- Skills: typescript-expert,security-specialist
- Files: docs/audits/sprint-161/T-161-008-core-credentials-deck.md
- Scope: src/core/

### Description
READ-ONLY audit of `credentials.ts`, `deck-file.ts`, `global-config.ts`,
`signature.ts`. Lead: ADR-014 .deck secret system, AES-256-GCM correctness,
Ed25519 signature verification.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 9: src/core/ — marketplace (sandbox + registry)
- Model: opus
- Effort: normal
- Skills: typescript-expert,security-specialist
- Files: docs/audits/sprint-161/T-161-009-core-marketplace.md
- Scope: src/core/marketplace/

### Description
READ-ONLY audit of `skill-sandbox.ts`, `registry-client.ts` and related.
Lead: AST sandbox bypass surface, eval/Function/child_process/fs/process.env blocks.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 10: src/core/ — validators + utilities
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-010-core-validators-utils.md
- Scope: src/core/

### Description
READ-ONLY audit of `validators.ts`, `utils.ts`, `sprint-file-retention.ts`,
`orphan-cleaner.ts`. Lead: path traversal protection, retention config correctness.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 11: src/core/ — notification + nervous types
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-011-core-notify-nervous.md
- Scope: src/core/

### Description
READ-ONLY audit of `notification-dispatcher.ts`, notify-adapters/, nervous-types.ts.
Lead: ADR-040 nervous architecture types, dispatcher channel adapter contract.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 12: src/core/ — remaining helpers + bridge
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-012-core-remaining.md
- Scope: src/core/

### Description
READ-ONLY audit of remaining src/core/ files not covered by Tasks 1-11
(promotion-types, prompt-template, monitoring-types, etc.). Find dead code.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 13: src/orchestra/ — brain + sprint-controller
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-013-orch-brain-controller.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `brain.ts`, `sprint-controller.ts`. Lead: ADR-008 dependency
direction, sprint lifecycle phase transitions, error handling.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 14: src/orchestra/ — planner + task-builder
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-014-orch-planner.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `planner.ts`, `task-builder.ts`. Lead: structured vs ai mode
parity, directive parser correctness, override resolution (forceModel/Agent/Skills).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 15: src/orchestra/ — result-evaluator + quality-assessor
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-015-orch-evaluator.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `result-evaluator.ts`, `quality-assessor.ts`. Lead: rubric
multi-dimensional scoring (Sprint 152.5 verification-blind fix), retro counter
bug (Sprint 160 finding).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 16: src/orchestra/ — task-router + rule-evolver + outcome-tracker
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-016-orch-router-evolve.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `task-router.ts`, `rule-evolver.ts`, `outcome-tracker.ts`.
Lead: 6-level routing priority, learning bonus correctness, synergy matrix.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 17: src/orchestra/ — debt + sprint-reporter
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-017-orch-debt-reporter.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `debt-manager.ts`, `sprint-reporter.ts`. Lead: ADR-009 DEBT.md
format, sprint-reporter 4-way split (Sprint 134 T-009), counter accuracy.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 18: src/orchestra/ — sprint-finalizer + lifecycle + phases
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-018-orch-finalize-lifecycle.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `sprint-finalizer.ts`, `sprint-lifecycle.ts`, `sprint-phases.ts`.
Lead: cleanup_delay_ms wire, archiveOrphanTasks pattern, phase transitions.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 19: src/orchestra/ — tmux + spawn-backend-docker
- Model: opus
- Effort: normal
- Skills: typescript-expert,docker-expert
- Files: docs/audits/sprint-161/T-161-019-orch-tmux-docker.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `tmux.ts`, `spawn-backend-docker.ts`. Lead: Sprint 154 .claude.json:rw
fix preserved, Docker HB atomic write, generator-side asymmetry (Sprint 160 finding).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 20: src/orchestra/ — spawn-backend-subprocess + spawn helpers
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-020-orch-subprocess.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `spawn-backend.ts`, subprocess-related modules. Lead: ADR-027
hybrid spawn backend correctness, parity with docker backend.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 21: src/orchestra/ — mid-sprint-adapter + result-collector
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-021-orch-adapt-collect.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `mid-sprint-adapter.ts`, `result-collector.ts`. Lead: rerouting
on failure, IPC registry (Sprint 135 T-004), result aggregation.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 22: src/orchestra/ — promotion-pipeline + temp-skill-generator
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-022-orch-promote-temp.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `promotion-pipeline.ts`, `temp-skill-generator.ts`. Lead:
temp-temp- double prefix bug fix (Sprint 153 D3), demotion path.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 23: src/orchestra/ — sprint-utils + sprint-docs-updater + remaining
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-023-orch-utils-docs.md
- Scope: src/orchestra/

### Description
READ-ONLY audit of `sprint-utils.ts`, `sprint-docs-updater.ts`, remaining
orchestra/ files not covered. Lead: archiveOrphanTasks, ADR governance integration.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 24: src/cli/commands/ — lifecycle commands
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-024-cli-lifecycle.md
- Scope: src/cli/commands/

### Description
READ-ONLY audit of `start.ts`, `status.ts`, `kill.ts`, `cleanup.ts`, `checkpoint.ts`,
`run.ts`. Lead: ADR-022-V2 CLI/MCP parity, --dry-run consistency, kill confirmation.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 25: src/cli/commands/ — planning + init commands
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-025-cli-planning.md
- Scope: src/cli/commands/

### Description
READ-ONLY audit of `init.ts`, `plan.ts`, `set-directives.ts`, `init-templates.ts`.
Lead: ADR-018 multi-environment config generation, structured/ai/auto mode wire.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 26: src/cli/commands/ — introspection commands
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-026-cli-introspection.md
- Scope: src/cli/commands/

### Description
READ-ONLY audit of `history.ts`, `retro.ts`, `explain.ts`, `help.ts`, `doctor.ts`,
`watch.ts`. Lead: doctor Sprint 160 DECISIONS.md FAIL bug, retro counter accuracy,
metrics output format.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 27: src/cli/commands/ — config + introspection lists
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-027-cli-config-lists.md
- Scope: src/cli/commands/

### Description
READ-ONLY audit of `config.ts`, `sync.ts`, `agent-list.ts`, `skill-list.ts`,
`mode.ts`. Lead: config schema validation, sync manifest correctness, mode CLI
(Sprint 149 finding).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 28: src/cli/commands/ — advanced commands
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-028-cli-advanced.md
- Scope: src/cli/commands/

### Description
READ-ONLY audit of `audit.ts`, `feature-query.ts`, `recover.ts`, `docs.ts`,
`memory-query.ts` (recall/remember), `notify.ts`, `metrics.ts`. Lead: Sprint 150
new commands wire, Sprint 159 deckent metrics summary, recall/remember UX.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 29: src/cli/ — entry + helpers + register*
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-029-cli-entry-register.md
- Scope: src/cli/

### Description
READ-ONLY audit of `entry.ts`, `index.ts`, helpers/, command registration pattern
(ADR-012). Lead: 46+ commands all registered, ADR-010 single runtime dep
(commander.js).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 30: src/mcp/ — lifecycle + planning tools
- Model: opus
- Effort: normal
- Skills: typescript-expert,api-builder
- Files: docs/audits/sprint-161/T-161-030-mcp-lifecycle-plan.md
- Scope: src/mcp/

### Description
READ-ONLY audit of MCP tools: init, set_directives, plan, start, status, kill,
cleanup, run, checkpoint. Lead: parameter schema parity with CLI (ADR-022-V2),
error propagation.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 31: src/mcp/ — introspection tools
- Model: opus
- Effort: normal
- Skills: typescript-expert,api-builder
- Files: docs/audits/sprint-161/T-161-031-mcp-introspection.md
- Scope: src/mcp/

### Description
READ-ONLY audit of MCP tools: status, history, retro, explain, help, doctor,
analyze_project, agent_list, skill_list, watch, audit. Lead: read-only flag
correctness, output format consistency.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 32: src/mcp/ — advanced + nervous tools
- Model: opus
- Effort: normal
- Skills: typescript-expert,api-builder
- Files: docs/audits/sprint-161/T-161-032-mcp-advanced-nervous.md
- Scope: src/mcp/

### Description
READ-ONLY audit of MCP tools: feature_query, recover, docs, memory_query, sync,
config, nervous_subscribe/accept/reject/status/config (5 tools). Lead: ADR-040
nervous accept/reject wire, MCP feature query manifest.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 33: src/mcp/ — resources + server
- Model: opus
- Effort: normal
- Skills: typescript-expert,api-builder
- Files: docs/audits/sprint-161/T-161-033-mcp-resources-server.md
- Scope: src/mcp/

### Description
READ-ONLY audit of MCP server, 8 resources (dashboard/directives/memory/debt/
config/retro/tasks/agents). Lead: stdio transport correctness, resource URI
schema, server startup.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 34: src/agents/ — worker + adaptive
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-034-agents-worker.md
- Scope: src/agents/

### Description
READ-ONLY audit of `worker.ts`, `adaptive-agent.ts`, agents helpers. Lead: scope
enforcement (ADR-037 RBAC), heartbeat write atomicity (Sprint 139 fix), self-modifying
detection wire (ADR-039).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 35: src/nervous/ — observer + detector + decision-engine
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-035-nervous-observer.md
- Scope: src/nervous/

### Description
READ-ONLY audit of `observer.ts`, `detector-registry.ts`, `decision-engine.ts`,
`proposer.ts`. Lead: ADR-040 wire after Sprint 154 fix, 11 detector registration,
decision authority matrix.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 36: src/nervous/ — dispatcher + executor + scope-check + history
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-036-nervous-dispatch.md
- Scope: src/nervous/

### Description
READ-ONLY audit of `dispatcher.ts`, `executor.ts`, `authority-matrix.ts`,
`runtime-scope-check.ts`, `history.ts`. Lead: nervous-history.jsonl produce,
scope check enforcement.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 37: src/api/ + src/connectors/ — server + auth + bots
- Model: opus
- Effort: normal
- Skills: typescript-expert,api-builder
- Files: docs/audits/sprint-161/T-161-037-api-connectors.md
- Scope: src/api/, src/connectors/

### Description
READ-ONLY audit of `api/server.ts`, `api/auth.ts`, SSE, rate limiter, connectors
(discord, telegram, whatsapp, incoming-router). Lead: messaging trio (Gate #13)
code readiness, auth security.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 38: src/providers/ — claude + codex + gemini adapters
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-161/T-161-038-providers.md
- Scope: src/providers/

### Description
READ-ONLY audit of all 3 provider adapters. Lead: isAvailable() consistency
(Sprint 156 finding), tokenUsage labeling (Sprint 158 fix), Sprint 157
detectGemini/detectCodex OAuth, fallback chain.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 39: src/dashboard/ — pages + routing
- Model: opus
- Effort: normal
- Skills: react-specialist,typescript-expert
- Files: docs/audits/sprint-161/T-161-039-dashboard-pages.md
- Scope: src/dashboard/

### Description
READ-ONLY audit of dashboard pages (7 claimed). Lead: 7-page count verification,
React 19+/Vite 7+, route definitions, page-level hooks.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 40: src/dashboard/ — components + hooks + state
- Model: opus
- Effort: normal
- Skills: react-specialist,typescript-expert
- Files: docs/audits/sprint-161/T-161-040-dashboard-components.md
- Scope: src/dashboard/

### Description
READ-ONLY audit of dashboard shared components, hooks, state management. Lead:
component reuse, useEffect cleanup, state lift correctness.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 41: src/dashboard/ — vite/tailwind config + assets
- Model: opus
- Effort: low
- Skills: react-specialist
- Files: docs/audits/sprint-161/T-161-041-dashboard-config.md
- Scope: src/dashboard/

### Description
READ-ONLY audit of dashboard build config (vite.config, tailwind.config, tsconfig,
assets/). Lead: Sprint 153 vitepress-fix relevance, build artifact integrity.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 42: docs/ root .md — README + LICENSE + PRINCIPAL
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-042-docs-readme.md
- Scope: ./

### Description
READ-ONLY audit of README.md, README-TR.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md
if present. Lead: claim accuracy (CLI 49, MCP 31, agents 15, skills 21), TR/EN parity,
public-readiness.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 43: docs/ root .md — CLAUDE + DECKENT + DIRECTIVES
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-043-docs-claude-deckent.md
- Scope: ./

### Description
READ-ONLY audit of CLAUDE.md, DECKENT.md (current + DIRECTIVES.md self-aware).
Lead: agent role separation (Brain/Auditor/Worker), gotchas accuracy, ADR list match.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 44: docs/ root .md — BETA-TRACKER + CHANGELOG
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-044-docs-beta-changelog.md
- Scope: ./

### Description
READ-ONLY audit of BETA-TRACKER.md, BETA-TRACKER-TR.md, CHANGELOG-TR.md (and
docs/CHANGELOG.md). Lead: 20 gate status accuracy, version increments,
TR/EN parity (Sprint 159 normalize).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 45: docs/ root .md — VISION + COMPETITIVE-ANALYSIS + BLUEPRINT
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-045-docs-vision-comp.md
- Scope: ./

### Description
READ-ONLY audit of VISION.md, VISION-TR.md, COMPETITIVE-ANALYSIS.md,
DECKENT-MASTER-BLUEPRINT.md, DECKENT-ANA-PLAN-TR.md. Lead: ADR-033 product vision,
OpenClaw competitive position freshness.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 46: docs/ROADMAP-GOD-LEVEL + KNOWN_ISSUES
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-046-docs-roadmap.md
- Scope: docs/

### Description
READ-ONLY audit of docs/ROADMAP-GOD-LEVEL.md (this audit informs its update),
docs/KNOWN_ISSUES.md if present. Lead: Sprint 154-159 entries accuracy, decay
of stale roadmap items.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 47: docs/audits/ accumulation review
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-047-docs-audits-accumulation.md
- Scope: docs/audits/

### Description
READ-ONLY audit of docs/audits/sprint-NNN/ accumulation. Lead: how many sprint
audits exist, total file count, retention policy candidates, prune recommendations
(NO actual deletes).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 48: docs/superpowers/ + docs/development/
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-048-docs-superpowers-dev.md
- Scope: docs/

### Description
READ-ONLY audit of docs/superpowers/specs/, docs/superpowers/plans/,
docs/development/. Lead: spec/plan organization, auth-surface-checklist
freshness (Sprint 159).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 49: docs/architecture/ + docs/analysis/
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-049-docs-architecture.md
- Scope: docs/

### Description
READ-ONLY audit of docs/architecture/, docs/analysis/, docs/governance/, other
docs subdirs. Lead: orphan docs, duplicates, outdated diagrams.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 50: .deckent/agents/ — all 18 agent JSONs
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-050-deckent-agents.md
- Scope: .deckent/agents/

### Description
READ-ONLY audit of all .deckent/agents/*/agent.json (15 built-in + 3 custom).
Lead: schema validity, required fields, ADR-041 horizontal vs vertical taxonomy,
stats correctness post-sprint.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 51: .deckent/skills/ — all 21 skill manifests
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-051-deckent-skills.md
- Scope: .deckent/skills/

### Description
READ-ONLY audit of all .deckent/skills/*/manifest.json (21). Lead: schema
validity, AST sandbox status, version consistency.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 52: .deckent/ root files (config, manifests, archives)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-052-deckent-root.md
- Scope: .deckent/

### Description
READ-ONLY audit of .deckent/config.json, project-stack.json, provider-cache.json,
features-manifest.json, ci-baseline.json, decisions/, archive/. Lead: schema
validation, staleness, retention compliance.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 53: .brain/ memory files (ERRORS/MEMORY/PATTERNS/RETRO/IDENTITY)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-053-brain-memory-files.md
- Scope: .brain/

### Description
READ-ONLY audit of .brain/ERRORS.md, MEMORY.md, PATTERNS.md, RETRO.md,
PROJECT-IDENTITY.md, DEBT.md, ROADMAP.md if present. Lead: memory budget
compliance (CLAUDE.md gotcha 900 lines), drift from DB.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 54: .brain/sprints/ + .brain/exports/ + .brain/archive/
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-054-brain-sprints-exports.md
- Scope: .brain/

### Description
READ-ONLY audit of .brain/sprints/sprint-NNN.md (per-sprint budget 100 lines/file),
.brain/exports/*.md (DB export drift), .brain/archive/ (retention).

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 55: Hidden config — root configs
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-055-config-root.md
- Scope: ./

### Description
READ-ONLY audit of .gitignore, .dockerignore, .npmrc, .editorconfig,
tsconfig*.json, vitest.config*.ts, package.json, Dockerfile,
docker-compose*.yml. Lead: gitignore covers memory.db/.tasks/.locks/dist/
node_modules/coverage/, package.json engines >=20.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Task 56: Hidden config — .github/ + IDE configs
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-161/T-161-056-config-github-ide.md
- Scope: ./

### Description
READ-ONLY audit of .github/ (workflows, ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE,
dependabot.yml, CODEOWNERS, SECURITY.md if any), .vscode/, .gemini/, .cursor/,
.claude/. Lead: workflow Node 20+ matrix, dependabot config, IDE configs leaked
secrets check.

**Kanıt:** Single audit report.
**Test:** N/A.

---

## Sprint 161 Lane 1 Success Criteria

- 56 tasks generated by Brain structured planner (matches explicit Task blocks)
- Each task produces ONE audit report markdown under docs/audits/sprint-161/
- `git diff --stat` shows ONLY docs/audits/sprint-161/ additions across the whole sprint
- 0 boundary violations
- 0 self-modifying detector flags (ADR-039)
- Sprint completion ≥85% DONE or GO_WITH_TECH_DEBT

## Brain Planning Mode

Use `--structured` for deterministic task generation matching the 56 explicit
Task blocks above. Brain reads the explicit blocks and emits 56 task JSONs.

## Notes for Brain

- Each task is independent — no inter-task dependencies for waves
- Workers can run in parallel waves (max_workers from config)
- All audit reports under docs/audits/sprint-161/ — Brain creates dir if missing
- READ-ONLY mandate enforced via scope.filesWrite single-path constraint
