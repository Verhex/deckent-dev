<!-- Dil: TR | Teknik terimler EN -->
@DECKENT.md

# Project: deckent

## Rules
@DIRECTIVES.md
@.brain/exports/summary.md

## Architecture
- **orchestra/** — Sprint lifecycle, planning, evaluation, routing (76 modules)
  - brain.ts: orchestrator (re-export layer, imports from sprint-controller)
  - sprint-controller.ts: full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
  - planner.ts: AI task planning (imports only from core/)
  - task-builder.ts: task creation, directive parsing, worker prompt building, Agent:/Skills: override parsing
  - result-evaluator.ts: GO/NO-GO/TECH_DEBT evaluation
  - task-router.ts: provider + agent + skill routing per task
  - debt-manager.ts: DEBT.md I/O, decay, pattern management
  - sprint-reporter.ts: retro, learnings, agent/skill performance
  - tmux.ts: tmux session management, worker spawn/kill
  - spawn-backend.ts: subprocess worker backend (non-tmux)
  - outcome-tracker.ts: routing outcome recording, learning bonuses, synergy matrix
  - quality-assessor.ts: multi-dimensional quality scoring (correctness, coverage, scope, completeness)
  - mid-sprint-adapter.ts: real-time rerouting on task failure (FIX phase)
  - rule-evolver.ts: auto-generate activation rules from outcome data
  - temp-skill-generator.ts: template-based project-conventions skill generation
  - promotion-pipeline.ts: temp→permanent agent/skill promotion, demotion
  - sprint-utils.ts: shared utilities for sprint phases, task analysis, timing helpers
  - result-collector.ts: waitForResults, processQueue, collectResults, result aggregation + IPC
- **core/** — Types, config, utilities, agent/skill pools (94 modules)
  - types.ts + *-types.ts: all type definitions (task, config, sprint, monitoring, routing)
  - config.ts: 3-layer config merge (defaults → global → project)
  - agent-pool.ts: AgentPoolManager, 15 built-in agents (Sprint 148 reform — test-writer removed), LRU eviction
  - skill-pool.ts + skill-registry.ts: 21 built-in skills, sandbox AST validation
  - provider.ts: ProviderAdapter interface, multi-provider registry
  - routing-types.ts: TaskDNA, ActivationConfig, RoutingDecision, SkillBudget types
  - intent-classifier.ts: Layer 1 — task intent classification from scope/description
  - activation-engine.ts: Layer 2 — structured activation rules with exclude support
  - routing-engine.ts: Layer 3 — unified routing (routeTaskV2), confidence scoring, override resolution
  - condition-evaluator.ts: path-based condition engine ($gt, $contains, $and, $or)
  - manifest-migrator.ts: V1→V2 manifest migration for agents/skills
  - model-registry.ts: ModelRegistry class, 13 models, 3 providers, tier-based routing
  - mode-presets.ts: ModelStrategy, MODE_PRESETS (performance/balanced/economic/api)
  - memory-store.ts: MemoryStore class — SQLite DB-first memory (CRUD, FTS5, tags, relations, decay, history)
  - memory-query.ts: searchMemory() — dual-layer FTS5 search (original + turkishNormalize), buildAutoQuery()
  - memory-normalize.ts: turkishNormalize() — i18n text normalization for FTS5 (TR/EN/DE %100)
  - memory-types.ts: MemoryEntryV2, CreateEntryInput, MemoryQueryParams, MemorySearchResult interfaces
  - memory-export.ts: DB → .md snapshot generation (summary, decisions, memory, debt)
  - memory-import.ts: .md → DB migration parser (parseDecisionsMd, parseMemoryMd, parseDebtMd)
- **agents/** — Worker execution, prompt engineering (20 modules)
  - worker.ts: task claim, file locking, heartbeat, result write
  - adaptive-agent.ts: runtime agent adaptation
- **nervous/** — Proactive meta-orchestrator (ADR-040): observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history
- **monitor/** — Auditor scan loop, dashboard manager, sprint-state tracking
- **connectors/** — External messaging adapters: Discord, Telegram, WhatsApp, incoming-router
- **providers/** — Claude, Codex, Gemini adapters (5 modules)
- **api/** — HTTP API server, SSE, rate limiting (3 modules)
- **mcp/** — MCP server: 31 tools + 8 resources, stdio transport
- **cli/** — 46 top-level commands, helpers, entry point
- **dashboard/** — React + Vite + Tailwind web dashboard
- **extensions/vscode/** — VS Code extension host integration

## Commands
Build: `npm run build` (tsc + copy-assets) | Full: `npm run build:all` (+ dashboard vite build)
Test: `npm test` (vitest run) | Watch: `npm run test:watch` | Coverage: `npm run test:coverage`
Test Dashboard: `npm run test:dashboard` (vitest.dashboard.config.ts)
Lint: `npm run lint` (tsc --noEmit) | ADR: `npm run lint:adr` | Errors: `npm run lint:errors`
Dev: `npm run dev` (tsc --watch)
Publish gate: `npm run validate:publish` — Alperen runs `npm publish` manually (see memory: npm publish approval)

## Agent Instructions
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Contracts
@.contracts/api-surface.md

## Identity
@.deckent/workspace/IDENTITY.md

## Gotchas
- **ESM imports**: `.js` uzantısı zorunlu (Node16 resolution). `import { foo } from './bar'` çalışmaz, `'./bar.js'` gerekir.
- **MCP server restart**: `dist/` rebuild sonrası long-lived MCP process eski kodu cache'ler. `/mcp restart` veya Claude Code yeniden başlat.
- **`deckent_start` fire-and-forget**: MCP stdio aynı process'te runSprint Promise event loop'u bloke edebilir. Long sprint için CLI `deckent start` tercih edilir.
- **Scope enforcement**: Worker `scope.filesWrite` dışına yazamaz — `git diff --stat` Auditor tarafından izlenir, ADR-037 RBAC runtime enforcement.
- **Sprint kill/cleanup**: Alperen onayı olmadan `deckent_kill`, `deckent_cleanup` (canlı sprint), `rm .tasks/*` YASAK (memory: feedback_deckent_kill_approval_required).
- **Node minimum >=20** (Sprint 153, 2026-05-06): Node 18 EOL 2025-03-27, drop edildi. CI matrix `[20.x, 22.x, 24.x]`. `better-sqlite3` 12.9.0 zaten Node 18'de çalışmaz. `signature.ts` `globalThis.crypto` polyfill kaldırıldı (Node 19+ default).
- **CI `npm ci` + native binding**: `.npmrc:ignore-scripts=true` (Sprint 133) `prebuild-install` çalıştırmaz → `better-sqlite3` binding eksik. Çözüm: her CI test job'ında `npm ci` sonrası `npx node-gyp rebuild --release` step'i (`.github/workflows/ci.yml`).
- **Lokal `node_modules/.bin/tsc/vitest` 0-byte zombie**: `npm install` bin link bozulduğunda `npx tsc` ve `npx vitest` sessizce exit 0 verir, hiçbir iş yapmaz. `npm run lint/test/build` çalışır (npm internal resolution `node_modules/typescript/bin/tsc`'yi bulur). CI fresh install'da yok, sadece dev makine artifact'i.
- **`deckent run` timeout cap**: `docker_min_timeout=1200s` (20 dk) audit/analiz task'ları için yetersiz olabilir. Geniş scope (src/+tests/+scripts/) + markdown rapor yazımı 20dk'yı aşar — task'ı parçala VEYA `--timeout-seconds` override (Sprint 153 P1 backlog).

## Live Status
Canlı sprint, debt, agent performance ve ADR durumu için: `@.brain/exports/summary.md` (auto-generated her sprint sonu).
Komutlar: `deckent status`, `deckent history`, `deckent retro`, `deckent recall "<sorgu>"`.

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-155 |
| Total Tasks | 5 |
| Completed | 4 |
| Tech Debt | 1 |
| No-Go | 1 |
| Duration | 23dk 12sn |
| Coverage | 40.0% |

## Active Debt
_No tech debt record._

## Agent Performance
| Agent | Tasks | Done | Success |
|-------|-------|------|--------|
| architect | 2 | 1 | 50% |
| security-auditor | 1 | 1 | 100% |
| doc-writer | 2 | 2 | 100% |
