# Changelog
<!-- Dil: TR | Teknik terimler EN -->

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir.

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına dayanır
ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kurallarına uyar.

## [1.0.0-beta.1-sprint159] - 2026-05-07

### Added

- Sprint metrics CLI — `deckent metrics summary <sprintId>` [CLAUDE]

### Changed

- Auth Surface Checklist 7→9 surface güncelle [CLAUDE] (completed with tech debt)
- docs/CHANGELOG.md TR/EN normalize [GEMINI] (completed with tech debt)

### Fixed

- README.md ve README-TR.md drift fix uygulaması [GEMINI]


_Tasks: 5 total, 4 done, 2 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint158] - 2026-05-07


### Changed

- README.md vs README-TR.md Drift Fix Proposal (completed with tech debt)
- CHANGELOG Language Consistency Audit (completed with tech debt)


_Tasks: 3 total, 2 done, 2 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint158-provider-label-hotfix] - 2026-05-07

### Fixed

- **Metadata katmanında sağlayıcı etiketleme** (`src/orchestra/prompt-god-template.ts`, `src/orchestra/result-collector.ts`) — Sprint 158 Gemini dogfood testleri, yönlendirme zincirinin (Sprint 154-157) doğru CLI'ı çağırdığını doğruladı: log kanıtları, 3 sprint worker'ı için `cloudcode-pa.googleapis.com` (Gemini Code Assist OAuth endpoint) adresine 126/98/70 isabet gösteriyor. Ancak sonuç dosyaları `tokenUsage.provider: "claude"` olarak etiketlenmişti çünkü worker prompt şablonu `provider: MUST be "claude"` direktifini enjekte ediyordu (`task.provider ?? 'claude'` ifadesinden okunarak), bu yüzden worker'lar bu etiketi dikkatlice yazmışlardı. `task.provider` yalnızca amaç meta verisidir; çalışma zamanı CLI'ı `spawn-backend` içindeki `getProviderForModel(model)` tarafından seçilir. Hem `prompt-god-template.ts:291` hem de `result-collector.ts:73` artık sağlayıcıyı önce `task.forceModel ?? task.model` üzerinden çıkarıyor, model araması başarısız olursa `task.provider`'a geri dönüyor. Canlı doğrulandı: `task.provider='claude'` + `model='gemini-2.5-flash'` ile prompt artık `provider: MUST be "gemini"` ifadesini yayıyor.
- **Worker betiği aşırı agresif temizleme** (`src/orchestra/spawn-backend-docker.ts`) — Çıkış kancası `for f in .worker-*.sh; if (containers.size === 0) unlink(f)` içeriyordu — döngü, son konteyner çıktığında **tüm** kardeş görevlerin betiklerini siliyordu, ayrıca manuel hata ayıklama `.worker-TEST-MANUAL.sh` artefaktları gibi yetim dosyaları da siliyordu. Sprint 158 sırasında ampirik gözlem: 158-001 + 158-002 `worker.sh` dosyaları sprint ortasında kaybolurken 158-003 hala çalışıyordu ve benim yerleştirdiğim `TEST-MANUAL` dosyaları sağlam kalmıştı — bu, temizlemenin aslında konteyner başına çıkışta tetiklendiğini, sprint sonunda değil. Düzeltme: `on('exit')` temizlemesini tamamen kaldırın; `sprint-lifecycle.ts cleanup()` CLEANUP aşamasında tek sahip olmaya devam ediyor — öngörülebilir zamanlama, konteyner başına yan etki yok.

### Sprint 158 Result Provenance

- task-158-001: DONE (gemini CLI ran, log: 126 OAuth endpoint hits, but result mislabeled `provider: claude` due to prompt directive — pre-fix observation)
- task-158-002: NO_GO (JSON-corrupted result, gemini CLI ran 98 endpoint hits before failure)
- task-158-003: DONE (`tokenUsage.provider: "gemini"` ✓ — first-ever sprint-orchestrated task with correctly-labeled gemini provider; result was written via on_exit heredoc which already used `getProviderForModel(model)`)

### Notes

Sprint 158 in-flight `.result` files are NOT retroactively patched — those reflect pre-fix labeling. Future sprints will produce correct labels at all three exit paths (worker self-write, on_exit heredoc, partial-result fallback).

Investigation continues on two remaining file-lifecycle questions: (a) which code path actually deleted `.prompt-158-*.txt` files mid-sprint despite Sprint 137's "persist until sprint end" intent — direct deletion paths in the codebase don't account for the empirical loss; (b) why Docker-mode workers don't write `.plan` files (worker.ts:325 logs missing-plan warning but Docker spawn flow may not invoke that path). Both are observability/debugging quality issues, not user-facing bugs — deferred to a future sprint.

### Commits

- `e1a47a1` fix(sprint-158): provider labeling + worker file lifecycle 3-bug fix

## [1.0.0-beta.1-sprint157-routing-hotfix] - 2026-05-07

### Fixed

- **Planner provider preservation** (`src/orchestra/sprint-planner.ts`, `src/orchestra/model-selector.ts`) — DIRECTIVES `Model: gemini-2.5-flash` was silently mapped to `sonnet` at the planner→task hop. Two-layer bug: (1) `model-selector.ts:212` defaulted `targetProvider` to `'claude'` when caller didn't pass one, so Layer 0 forceModel branch ran `getEquivalentModel(forceModel, 'claude')` → returned the Claude equivalent; (2) `sprint-planner.ts` createTask call dropped `src.provider` even though `parseStructuredDirectives` extracted it correctly on line 519. Fix: `model-selector.ts` now infers provider from `forceModel` via `PROVIDER_MODEL_MAP` when caller omits it; `sprint-planner.ts` extends `directiveSources` type with `provider?` field and passes `src.provider` through both `resolveTaskModel()` call and `createTask()`. Live verified via dry-run: `Model: gemini-2.5-flash` directive → planner output column `gemini-2.5-flash` (was `sonnet`). Tests 6088/6088 pass.

### Notes

Third in a chain of routing-layer regressions exposed by Sprint 156 dogfood:
1. Sprint 154 added `detectAuthMode()` but `isAvailable()` stayed API-key-only — fixed in `60566eb` (Sprint 156).
2. `resolveTaskModel` provider-default bug — fixed in this commit.
3. `sprint-planner.ts` provider field hop drop — fixed in this commit.

All three originate from the same root cause: Sprint 154's symmetric auth refactor missed cross-cutting touchpoints. See `docs/development/auth-surface-checklist.md` (Sprint 157 deliverable) for the full surface map.

### Commits

- `b4df0e2` fix(sprint-157): preserve DIRECTIVES `Model:` provider through planner chain

## [1.0.0-beta.1-sprint156] - 2026-05-07

### Added

- docs/development/ Staleness Audit
- src/core/provider-fallback.ts JSDoc Genişletme

### Changed

- README + BETA-TRACKER TR/EN Senk Audit (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint155] - 2026-05-07

### Added

- Runtime Fallback Chain — 429/Capacity Auto-Recovery
- Adapter-Side provider_auth.mode Runtime Enforcement
- Sprint 154 Retro + Memory Sync

### Changed

- Codex Live Install + Dogfood (BLOCKED on external) (completed with tech debt)


_Tasks: 5 total, 4 done, 1 tech debt, 1 no-go_

## [1.0.0-beta.1-sprint154-multi-provider] - 2026-05-07

### Added

- **Multi-Provider Docker Backend** (`src/orchestra/spawn-backend-docker.ts`) — Docker spawn-backend was Claude-only despite deckent claiming "3 providers supported"; `spawn-backend-docker.ts:102-111` hardcoded `claude -p - --model X` regardless of model name. New `buildProviderInvocation()` exhaustively branches over `claude`/`gemini`/`codex` with provider-specific cmd grammar (Claude: stdin via `-p -` + `--allowedTools` + `--dangerously-skip-permissions`; Gemini: inline prompt via `-p "$(cat ...)"` + `-m <model>` + `--approval-mode plan` + `--skip-trust`; Codex: `exec --full-auto "<prompt>" --model X`). Result/heartbeat templates' hardcoded `"provider":"claude"` replaced with `${provider}` interpolation. Live verified: `deckent run --model gemini-2.5-flash` → `Result: DONE` via OAuth Code Assist (commit `da7c93f`).
- **Gemini OAuth Subscription Mode** (`src/providers/gemini.ts`) — `detectAuthMode()` reads `~/.gemini/settings.json` for `selectedType` (`oauth-personal` | `gemini-api-key` | `vertex-ai` | `cloud-shell`) + `oauth_creds.json` existence + env vars in priority order. `spawn()` skips env injection in OAuth/Vertex modes (CLI uses cached creds), only injects `GEMINI_API_KEY`/`GOOGLE_API_KEY` in `api_key` mode. Adds `--skip-trust` flag to `buildArgs()` to bypass containerized-cwd trust check that silently overrides `--approval-mode plan` and hangs on stdin. `getApiKey()` now also accepts `GEMINI_API_KEY` (official CLI env name) alongside `GOOGLE_API_KEY` and `DECKENT_GOOGLE_API_KEY`.
- **Container Credential Mounts + Env Passthrough** (`src/orchestra/spawn-backend-docker.ts`) — `~/.gemini/` and `~/.codex/` mounted **rw** into `${containerHome}/.gemini` / `.codex` (rw needed because Gemini CLI refreshes `oauth_creds.json` on token expiry — ro mount triggers `EROFS` hang). `GEMINI_API_KEY` + `DECKENT_OPENAI_API_KEY` + `DECKENT_GOOGLE_API_KEY` added to env passthrough whitelist (Sprint 154 audit F4 closure for Docker tier).
- **Doctor Provider Parity** (`src/cli/commands/doctor-checks.ts`) — `checkGemini()` and `checkCodex()` mirror `checkClaude()`'s shape, surfacing `auth: oauth (Google login (oauth-personal))` / `auth: subscription (codex auth status)` / `not authenticated. Run \`gemini\` to login` and similar messages. `checkProviderAuthConsistency()` compares configured `provider_auth.{name}.mode` vs detected mode and emits explicit `configured=X but detected=Y` failure when they diverge. `checkFallbackProviderGap()` warns when `worker_provider != 'claude'` and `fallback_provider` is unset (Sprint 154 audit A6.F3 advisory).
- **Per-Provider Auth Config Schema** (`src/core/config-types.ts`, `src/core/config-migration.ts`) — `provider_auth.{claude|codex|gemini}.mode: 'auto' | 'api_key' | 'subscription'` per-provider override of adapter auto-detection. `api_key_env` allows custom env-var name. Doctor surfaces mismatches; spawn behavior still uses `detectAuthMode()` (advisory mode, runtime enforcement deferred to Sprint 155).
- **Effort Translator on All Adapters** (`src/core/provider.ts`, `src/providers/{claude,codex,gemini}.ts`) — New `TaskEffort` type + optional `translateEffort(effort, model): string[]` interface method. Claude: `--max-tokens 4096|16384|64000` for low/normal/high. Codex: `--reasoning-effort low|medium|high` only emitted for reasoning models (`gpt-5`/`gpt-5-mini`/`o3`/`o4-mini`); no-op for `gpt-4.1` family. Gemini: returns `[]` (CLI has no effort flag — model handles depth internally). 10 new test cases.
- **Dockerfile.worker Multi-Provider CLI Install** — Uncommented `RUN npm i -g @openai/codex` + `RUN npm i -g @google/gemini-cli` (image size: 940MB → 1.69GB). All three provider CLIs now resolvable inside `deckent-worker:latest` (commit `da7c93f`).
- **Doctor.ts Canonical Dedup** — `runDoctorChecks` and 8 helpers (`checkNode`/`checkGit`/`checkWorkspace`/`checkBrainDir`/`checkDirectives`/`getMemoryEntryCount`/`checkBrainBudget`/`checkDebt`/`checkStaleLocks`) had divergent duplicates in `doctor.ts:873` and `doctor-checks.ts:612` from a stalled refactor — `doctor.ts` copy lacked the new `checkGemini`/`checkCodex`/auth-consistency additions. Removed ~110 LoC dead code, re-exported canonical version from `doctor-checks.ts`. `api/server.ts` import unaffected (transparent re-export delegation).

### Fixed

- **Sprint 154 Audit F8** (gemini-integration test drift) — `tests/providers/gemini-integration.test.ts` `buildArgs`/`buildCommand` assertions were stale: expected `--model` (long flag) when code used `-m`; missing `--approval-mode plan` and now-required `--skip-trust`. Aligned tests with current adapter output (commit `da7c93f`).
- **Container UID Pollution Recovery** — Earlier debug runs without `--user` flag created root-owned `~/.gemini/tmp/<cwd-name>/` directories, blocking subsequent user-mode workers with `EACCES`. Cleanup pattern documented: `docker run --rm -v "$HOME/.gemini:/m" alpine rm -rf /m/tmp/<cwd-name>` (Docker runs as root, bypasses host sudo password prompt).

### Tests

- 1209/1217 passing (8 skipped) across providers, doctor, config, api after both commits
- 10 new effort translator tests (Claude × 3, Codex × 4, Gemini × 3)
- 4 new provider-auth consistency tests
- Pre-existing gemini-integration drift fixed (2 tests)

### Live Verification

- `deckent doctor` surfaces 17 checks including Gemini OAuth (`v0.41.2 — auth: oauth (Google login (oauth-personal))`), Codex install hint, fallback-gap warning when `worker_provider=gemini` without fallback set
- `deckent run "Output exactly: KRAKEN_OK" --model gemini-2.5-flash --timeout 60000` → `Result: DONE` via OAuth subscription, no API key required
- `Provider Auth (gemini)` doctor check: `configured=subscription, detected=subscription ✓`

### Backlog (deferred to Sprint 155)

- Runtime fallback chain on 429/capacity errors (worker output parser + sprint-controller hook)
- Adapter-side enforcement of `provider_auth.{name}.mode` (currently advisory via doctor only)
- Codex live install + dogfood (user awaiting CLI access)
- Model registry remote refresh (lazy fetch from provider /v1/models with stale-while-revalidate cache)

### Commits

- `da7c93f` feat(sprint-154): Gemini OAuth subscription + multi-provider Docker backend
- `fe5c3a4` feat(sprint-154): Faz B + Faz C — provider auth schema, effort translator, doctor consolidation

## [1.0.0-beta.1-sprint153] - 2026-05-07

### Added

- No completed tasks


_Tasks: 6 total, 0 done, 0 tech debt, 6 no-go_

## [1.0.0-beta.1-sprint153b] - 2026-05-06

### Added

- **B3 — NervousObserver wire end-to-end test** (`tests/nervous/integration/observer-wire-end-to-end.test.ts`, 5 tests). Constructs a real `NervousObserver` with the 11-detector default config, registers `'observe'` + `'detection'` listeners, publishes synthetic `DeckentEvent`s through `eventBus`, and asserts the wire path: `eventBus.emit('event') → observer.onEventBusEvent → buildEvent → emit('observe')` fires with correct `source: 'event-bus'`, the deckent payload nested under `ObserverEvent.payload`, ISO timestamp, UUID. Also asserts `start()` is idempotent and `stop()` removes the bus listener cleanly. Live trigger evidence for the wire I added in `runSprint`.
- **Nervous System Observer wire** (B1) — `NervousObserver` class was implemented in Sprint 147 (`src/nervous/observer.ts`) but never instantiated; ~1,300 LoC of detector + dispatcher code stayed dormant for 6 sprints. `runSprint()` (`src/orchestra/sprint-controller.ts`) now constructs the observer when `config.nervous_system?.enabled`, calls `observer.start()` after `setActiveSprint()`, and `observer.stop()` on every cleanup path (happy + checkpoint-aborted + `beforeExit` handler). All 11 detector files (`src/nervous/detectors/`) now receive runtime events.
- **Detector config sync** (B2) — replaced 5 placeholder `reserve_for: sprint-148` entries (`dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner`) — none of which had implementation files — with the 6 detectors that DO exist on disk: `task_mode_idle`, `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly`, `scope_collision_rate`, `notification_delivery_health`. Updated `NervousSystemConfig.detectors` type, `createDefaultConfig()` defaults, `.deckent/config.json`, and the schema test (`tests/core/config-nervous-schema.test.ts`) to assert 11 entries. `NervousDetectorConfig` gained the per-detector option fields (`idle_threshold_ms`, `recurrence_threshold`, `cost_threshold`, `collision_threshold`, `deckent_style`).
- **Ed25519 hub signing pipeline** (E — Beta GA Gate #15) — `scripts/sign-seed-skills.mjs` signs all 20 seed skills under `deckent-hub/skills/` with the local hub keypair (`~/.deckent/keys/`), replacing every `ed25519:placeholder:awaiting-t149016-keygen:0000…` stub with a real 128-hex-char signature. Sign payload matches `skill publish` (`SKILL.md` content + `JSON.stringify(manifest)`) so signatures verify symmetrically across publish/install. `src/core/signature.ts` exports `verifySkillSignature(skillDir, publicKey)` and `buildSkillSignPayload(skillContent, manifest)` helpers.
- **`skill install` verify wire** (E) — `src/cli/commands/skill.ts` now runs Ed25519 verification on both git and local install paths BEFORE copying to `.deckent/skills/`. Default policy: unsigned skills are rejected; `--allow-unsigned` flag overrides for trusted local development. Bad signatures are always a hard fail (no override). Lazy keypair load: `loadOrGenerateKeypair()` is only called when `signature.ed25519` actually exists, keeping fs-mock test flow simple.
- **`deckent_run` MCP — effort + timeoutSeconds parameters** (P1 from Sprint 153 dogfood finding) — the previous run hardcoded `effort: 'normal'` and inherited `cfg.docker_timeout`, hitting the `docker_min_timeout=1200s` cap on broad-scope audit prompts. New input schema fields: `effort: 'low'|'normal'|'high'` (drives `brainEstimateTimeout` via `effort_base`) and `timeoutSeconds` (hard override, range 60-7200). The effective timeout is plumbed through `SpawnBackendOptions.taskTimeoutSeconds` to all backends. Response payload now echoes `effort` + `timeoutSeconds` for caller debugging.

### Fixed

- **CI greening** — first fully-green run in weeks. Root cause: `.npmrc:ignore-scripts=true` (Sprint 133 hardening) blocked `prebuild-install` for `better-sqlite3`, leaving Memory V2 native binding missing on every Node version. Workaround: explicit `npx node-gyp rebuild --release` step after `npm ci` in 9 CI jobs (`.github/workflows/ci.yml`). Security policy preserved — only one trusted dep is compiled, all transitive postinstalls remain blocked.
- **Vitepress build** — `docs/launch/blog-devto-launch.md` had unquoted YAML frontmatter with an inner colon (`description: ... insight: multi-agent ...`) that the parser interpreted as a new mapping key. Quoted the value. Also extended `docs/.vitepress/config.ts:srcExclude` to cover `audits/`, `superpowers/`, `design/`, `governance/`, `sprint-log/`, `vision/`, `KNOWN_ISSUES.md`, `ROADMAP-GOD-LEVEL.md` so internal docs (with Vue-conflicting markdown) don't trip the Vue compiler.
- **`orphan-cleaner-ipc` negative ageMs** — `now - stat.mtimeMs` could go negative on CI ext4/tmpfs filesystems (mtime precision rounds up past wall clock), making `if (ageMs < minAgeMs)` skip orphans even with `minAgeMs=0`. Both call sites now wrap with `Math.max(0, …)`.
- **`archive-debt` test relied on local DB state** — mock returned `existsSync(memory.db) === true`, command opened real `.brain/memory.db` (96 resolved entries on dev machine, 0 on CI checkout) → diverged paths → mkdirSync spy fired locally but not in CI. Mock now returns `false` for `memory.db`, forcing the file-fallback path that uses the mocked DEBT.md content.
- **D1 — ADR-008 violation:** `src/core/notify.ts` imported `'../orchestra/event-bus.js'` (reverse-layer dep). Moved file to `src/orchestra/notify.ts`; updated 5 caller imports + 2 test imports. Layer 4 enforcement pilot now sees clean core→orchestra one-way edges.
- **D2 — ADR-038 dead code:** Removed `src/orchestra/batch-stats.ts` (140 LoC) + tests (194 LoC), 0 consumers since Sprint 139. Pruned the entry from `scripts/dead-code-audit.mjs` so future audits don't re-flag it.
- **D3 — Promotion pipeline `temp-temp-` double-prefix:** `src/orchestra/promotion-pipeline.ts:117` now normalizes `entityId` (strips one `temp-` prefix) before composing the persistent temp dir + permanent dir paths. Fixes "Temp agent not found" errors at sprint finalization for already-prefixed ids.
- **D4 — Commander unknown subcommand exit 0:** `deckent nervous <unknown>` (e.g. `nervous subscribe`) silently fell through to the default action; now inspects `cmd.args.length > 0` and exits 1 with a descriptive message.
- **Coverage Report continue-on-error** — same vitest worker-timeout flakiness already documented for `test-docs-scripts`. Coverage runs all tests, was failing the workflow with exit 1 even though 716/716 test files reported pass + the artifact uploaded.
- **`spawn-backend-docker` timeout result clarity** — `on_exit()` bash trap now detects the `${taskId}.timeout` marker file and appends a "HIT WORKER_TIMEOUT — increase --timeout or split scope" hint to both `TIMEOUT_WITH_WORK` and `NO_GO` notes. Previously "exited without writing result (exitCode=0)" was misleading because the `timeout … || echo > marker` chain masks the real exit code as 0. Surfaced by Sprint 153 dogfood audit (3 audit tasks all hit `docker_min_timeout=1200s` while reading & reporting on src/+tests/+scripts/+.github/).

### Changed

- **Node 18 EOL — minimum bumped to >=20.** Critical deps (`better-sqlite3` 20.x+, `vite` 20.19+, `@noble/ed25519` v2 needing globalThis.crypto) had already dropped Node 18. Side note: Node 20 is also EOL as of 2026-03-24; matrix kept at `[20.x, 22.x, 24.x]` since Node 20 is still widely deployed in user environments and prod images.
- 36 files purged of textual Node 18 references (CI matrix, engines, README, IDENTITY, docs/guide, scripts, error messages, i18n strings, mock test data) to prevent accidental re-introduction in future work.
- `src/cli/entry.ts` runtime guard: `if (major < 18)` → `if (major < 20)` (was inconsistent with the >=20 error message after 391b97c). Same fix in `doctor.ts` + `doctor-checks.ts`.

## [1.0.0-beta.1-sprint152] - 2026-04-24

### Added

- Post-Migration Environment Delta Audit
- tsc + vitest Baseline Drift Analysis
- Auto-Memory 78 Dosya Kayıp Impact Analysis
- Skills 21 AST Sandbox + Registry Integrity
- Agents 16 Built-in Manifest + Routing V2 Rules
- Debt 96 Item Envanter + Closeable Count + Top-10 Priority
- Git State Hijyen + SYSTEM-MIGRATION Yaşam Döngüsü
- Sprint 151 Learnings → Sprint 152 Actionable Distilling + Meta-Dogfood Sayacı


_Tasks: 36 total, 8 done, 0 tech debt, 28 no-go_

## [1.0.0-beta.1-sprint151] - 2026-04-22

### Added

- npm publish HAZIRLIK + Alperen Handoff (PUBLISH WORKER TARAFINDAN ÇALIŞTIRILMAZ)
- Dashboard ChatPage.tsx (7. page)
- Telegram Bot Deploy + Smoke Test
- Show HN + Reddit + Twitter Announce Hazırlığı
- Discord Server Launch + Initial Channel Structure
- Dev.to + Hashnode Long-Form Post
- DECKENT→USER:NOTIFY Runtime Smoke Test + Nervous Bridge E2E
- CLI buildProgram Smoke Test Harness
- 49 CLI Komut Tam Envanter + Smoke

### Changed

- Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent (completed with tech debt)
- Discord Bot Deploy + Smoke Test (completed with tech debt)
- Nervous System 6-10 Detector Activation (Sprint 147 Plan) (completed with tech debt)

### Fixed

- Brain Evaluator 5-in-1 Fix
- Vitest 9 Residual Fail Fix
- Docker HB + Vitest Timeout Nihai Fix (3-Sprint Debt Final)


_Tasks: 17 total, 17 done, 3 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint150] - 2026-04-21

### Added

- `deckent_style` Config Key — 3-Layer Integration
- `deckent mode` CLI Command
- Sprint Controller Mode-Aware Routing
- Nervous System Mode-Aware Detectors
- Dockerfile USER Non-Root
- `.deck` Config Interpolation (`$DECK:KEY` Syntax)
- `src/connectors/` Base + IMessageConnector Interface
- Discord Connector
- Telegram Connector
- WhatsApp Scaffold (Post-Launch Activation Ready)

### Changed

- Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt) (completed with tech debt)
- Auditor Stale Alert Race Condition Fix (Sprint 148 Debt) (completed with tech debt)
- VerhexIO/deckent-hub Repo Create + Templates (completed with tech debt)
- npm pack --dry-run + Version Bump 1.0.0-beta.1 (completed with tech debt)
- Feature Manifest Canlılaştırma (Tam Scope) (completed with tech debt)
- `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi (completed with tech debt)

### Fixed

- Sprint-Prefixed Dosya Retention (FINAL — Alperen 5 soru 2026-04-21 onaylı)
- Managed-Docs Cache Git Tracking Fix + Metadata Annotation


_Tasks: 41 total, 37 done, 6 tech debt, 4 no-go_

## [1.0.0-beta.1-sprint149] - 2026-04-20

### Added

- `deckent_style` Config Key — 3-Layer Integration
- Sprint Controller Mode-Aware Routing
- Nervous System Mode-Aware Detectors

### Changed

- `deckent mode` CLI Command (completed with tech debt)


_Tasks: 4 total, 4 done, 1 tech debt, 0 no-go_

## [0.4.0-beta.4-sprint148] - 2026-04-20

### Added

- test-writer Agent Archive + Removal Justification
- testing-expert Skill Auto-Activation Heuristic
- Intent Classifier "testing" Intent Refactor — test-coverage Tag
- Router V2 Agent Fallback — test-writer Yok, architect/refactorer Chain
- 16 Agent PROMPT.md Rubric Spec Batch Cleanup
- Nervous System enabled=true Pivot — BALANCED Preset
- 🚨 Notification Delivery Scope Enforcement (Ana PID Constraint)
- StaleWorkerDetector Canlı Activation + DetectorRegistry
- ScopeCollisionMonitor + DebtTrendAnalyzer Live Activation
- AgentRoutingHealth Canlı Pozitif Doğrulama

### Changed

- Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix (completed with tech debt)


_Tasks: 28 total, 27 done, 1 tech debt, 1 no-go_

## [0.4.0-beta.1-sprint147] - 2026-04-20

### Added

- Nervous Types Genişletme — Runtime Types
- Action Registry — 30 Eylem + Risk Matrix
- Authority Matrix — 4 Preset + Safety Floor + Override
- Observer — Event Bus + Filesystem Watcher + Cron
- Decision Engine — Detector → Policy → Decision
- Proposer — Notification Builder + Throttle + Grouping
- Executor — 3 Mod Handler (Autonomous / Suggest / Approve)
- History — JSONL Append + Undo + Retention
- StaleWorkerDetector
- ScopeCollisionMonitor


_Tasks: 23 total, 23 done, 0 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint146] - 2026-04-20

### Added

- Agent Routing V2 Retrain + Intent Classifier Refresh
- Task-Type ADR Preset Matrix + Filler Cleanup
- Prompt Quality Linter
- SDL Decision Log Rehabilitation
- Nervous System Preflight — ADR-040 + Types
- Sprint 146 Retro Template + Docs Update
- Agent Exclusion Dynamic (Task 2 tamamlayıcı)
- Chain Safety Gate Script
- Sprint 146 Living Record Update (FINAL-EXECUTIVE-REPORT.md)
- ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 Append

### Changed

- Agent Truncation Bug Fix (completed with tech debt)
- ADR Relevance Scoring Engine (completed with tech debt)
- Scope Sanitizer (completed with tech debt)
- Generative Useful God Template — buildTaskPrompt Single Entry (completed with tech debt)
- DIRECTIVES.md Mid-Sprint Silme Bug Fix (completed with tech debt)
- Rubric System Consolidation (completed with tech debt)


_Tasks: 17 total, 16 done, 6 tech debt, 1 no-go_

## [0.4.0-beta.2] - 2026-04-20

### Added

- `src/orchestra/adr-selector.ts` — ADR Relevance Scoring Engine: `selectRelevantAdrs()`, `buildAdrPromptSection()`, `AdrRelevance` interface; scope path match +0.4, keyword match +0.3, intent preference +0.2, age penalty; topN=3 default
- `src/orchestra/scope-sanitizer.ts` — Scope Sanitizer: dist/ filter, extension-only remove, global protected file reject, path traversal reject, duplicate dedupe, "(yeni)" strip
- `src/orchestra/prompt-god-template.ts` — Unified Prompt Builder `buildTaskPrompt()` single entry point; `PromptArtifact` interface with char/token count metadata; char count %40 azalma (~45K → ≤27K)
- `src/core/nervous-types.ts` — Sprint 147 Nervous System type placeholders: `AuthorityMode`, `RiskLevel`, `ApprovalPolicy`, `NervousNotification`, `AuthorityMatrix`
- `scripts/prompt-linter.mjs` — Prompt Quality Linter: 6 kalite kontrolü, avg ≥ 75/100 exit 0
- `scripts/chain-gate-check.mjs` — Sprint Chain Safety Gate: tsc + vitest + doctor + cost + NO_GO + prompt_linter
- ADR-040 draft (`status: proposed`) — Sprint 147 Nervous System foundation
- `TASK_TYPE_ADR_PRESETS` matrix — 7 task type × ADR preset mapping
- `docs/sprint-log/Sprint-146.md` — Sprint 146 sprint log

### Changed

- `src/core/intent-classifier.ts` — Agent Routing V2 Retrain: intent keyword mapping yenilendi (documentation/core-dev/evaluation/testing/bug-fix); test-writer routing %52 → ≤%22
- `src/core/activation-engine.ts` — Dynamic exclusion kuralları: context-aware, hard-coded global exclude kaldırıldı
- `src/orchestra/task-builder.ts` — `buildWorkerPrompt()` artık `buildTaskPrompt()` çağırır; inline render kaldırıldı
- `src/orchestra/quality-assessor.ts` — `assessQuality()` her evaluate sonrası zorunlu; kanonik dimensions: coverage, scopeAdherence, completeness
- `src/orchestra/result-evaluator.ts` — rubric konsolidasyon: Quality Assessor kanonik kaynak
- `src/orchestra/sprint-retro-writer.ts` — `formatRubricScoresSection()` Quality Assessor dimensions kullanır
- `src/core/task-types.ts` — `TaskResult.rubricScores` `@deprecated`

### Fixed

- **DIRECTIVES.md Mid-Sprint Silme Bug** — `archiveDirectives()` phase guard eklendi: yalnızca CLEANUP fazında tetiklenir; emergency restore task JSON'dan reconstruct
- **SDL Decision Log Dead Write** — `writeDecisionLog()` yalnızca v2 routing + meaningful events; `input`/`output` dolu; `deckent explain` komutunda okunur
- **Agent Exclusion Hard-Code** — `getDynamicExclusions()` implementasyonu: intent + scope'a göre dinamik exclusion; global hard-code kaldırıldı
- **Agent Truncation Bug** — `agent-pool.ts` agent PROMPT.md substring truncation kaldırıldı (limit: 50000+)
- **Sprint 145 vitest 3 Regression** — event-bus.ts + timeout-estimator.ts test fail'leri fix


_Tasks: 17 total — Prompt God Template Reform + 3 canlı bug fix + rubric consolidation_

---

## [0.4.0-beta.1-sprint145] - 2026-04-20

### Added

- Timeout Config Schema + Validation
- DECKENT-ANA-PLAN-TR.md Tam Güncelleme — Sprint 23 → 145

### Changed

- EventBus Abstraction + Subscribe API (completed with tech debt)
- ADR-037 RBAC Runtime Wire — checkWorkerAuthority (completed with tech debt)
- CHANNELS.NOTIFY writeEvent Emit Wire (completed with tech debt)
- NotifyDispatcher Wire + 3 Adapter (completed with tech debt)
- ADR-038 Self-Modifying Detector Runtime Wire (completed with tech debt)
- registerResume CLI Wire + CLI Registration Test Harness (completed with tech debt)
- T-144-002 Helper Migration — countDebtItems → store.getByType (completed with tech debt)
- worker.sh Template Update — TASK_TIMEOUT Env Var (completed with tech debt)
- Result Atomicity Guarantee — TIMEOUT_WITH_WORK Partial Result (completed with tech debt)
- deckent status --follow CLI + Backend-Aware Renderer (completed with tech debt)


_Tasks: 28 total, 27 done, 24 tech debt, 1 no-go_

## [0.4.0-beta.1-sprint144] - 2026-04-17

### Added

- init.ts Split (1566 → 4 dosya)
- doctor.ts Split (1102 → 3 dosya)
- retro.ts Split (453 → 3 dosya)
- Auditor Async Scan Loop (52 Sync I/O Elimine)
- file-lock + deck-file + credentials (Security + Perf)
- Dockerfile Hardening
- i18n Temel CLI (5 komut TR/EN)
- redactSensitive CLI → core taşı (ADR-008)
- Sprint-State Lifecycle (pid manager)
- Orphan Cleanup (.tasks + locks) + Pre-flight

### Changed

- Event Stream Emit Wire (completed with tech debt)
- Retro sprint-id Normalize (completed with tech debt)

### Fixed

- ADR-008 Cycle 2 Fix — core/session-interface.ts
- Türkçe Locale Fix (.toLowerCase → .toLocaleLowerCase('tr-TR'))
- Docker HB Deploy Wire (Sprint 139 Fix Canlı)
- sprint2-debt.test.ts Memory Leak Fix (Sprint 143 Debt #7 — CI Blocker)


_Tasks: 27 total, 24 done, 2 tech debt, 3 no-go_

## [0.4.0-beta.1-sprint143] - 2026-04-17

### Added

- API Auth Default Secure
- Relations Hibrit — Backfill + Write-time (Karar 3-C)
- DECISIONS.md Archive + init.ts DB Preload
- Sprint-Finalizer Hook (Karar 4-A)
- Rule Generator (Karar 4-B, 3 Provider)
- Auto-Archive Guard (Task 3 Regression Koruması)
- Layer 4 Runtime Wire Deploy (ADR-006 Canlı Enforcement)
- Task Restoration on Crash
- Panic Kill Guard
- E2E Harness (Chain Safety Foundation)

### Changed

- MCP Disconnect Fix (Background Sprint Runner) (completed with tech debt)

### Fixed

- Shell Injection Fix (tmux.ts)
- Path Traversal Fix (checkpoint/docs/decision-logger)
- .brain/memory.db Git Takip Fix
- health-check.ts Dosya Yolu Uyuşmazlığı Fix
- FTS5 Query Builder Fix (Karar 2-A)


_Tasks: 20 total, 19 done, 1 tech debt, 1 no-go_

## [0.4.0-beta.1-sprint142] - 2026-04-16

### Added

- src/core/ batch 3 — Agent + Skill pools
- .claude/rules/ + .contracts/ + .deckent/config

### Changed

- src/core/ batch 1 — Memory V2 modulleri (completed with tech debt)
- src/core/ batch 2 — Types + Routing (completed with tech debt)
- src/core/ batch 4 — Provider + Model + Notification (completed with tech debt)
- src/core/ batch 5 — Utils + Security + Remaining (completed with tech debt)
- src/core/ batch 6 — Remaining core files (completed with tech debt)
- src/core/ batch 7 — Final core files (completed with tech debt)
- src/orchestra/ batch 1 — Brain + Sprint lifecycle (completed with tech debt)
- src/orchestra/ batch 2 — Debt + Result + Retro (completed with tech debt)
- src/orchestra/ batch 3 — Task + Routing + Spawn (completed with tech debt)
- src/orchestra/ batch 4 — Event stream + Pattern + Decision (completed with tech debt)


_Tasks: 49 total, 44 done, 42 tech debt, 5 no-go_

## [0.4.0-beta.1-sprint141] - 2026-04-16

### Added

- src/core/ Analysis (78 dosya)
- src/mcp/ Analysis (37 dosya)
- src/dashboard/ Batch Analysis (44 dosya, batch)
- .brain/ + .brain/exports/ + config Analysis
- Root files + scripts/ Analysis
- FINAL — Aggregation Report

### Changed

- src/cli/ Analysis (75 dosya) (completed with tech debt)
- tests/ Category Analysis (28 kategori) (completed with tech debt)
- docs/ Analysis (260 markdown) (completed with tech debt)
- META — Architecture Graph + Circular Dependency (completed with tech debt)
- META — Dead Code + Type Safety + Security (completed with tech debt)
- META — ADR Compliance + CLI/MCP Parity + i18n (completed with tech debt)
- META — Test Coverage Map + Performance + Error Handling + TODO inventory (completed with tech debt)
- META — Memory V2 Integrity Verification (completed with tech debt)


_Tasks: 18 total, 15 done, 8 tech debt, 3 no-go_

## [0.4.0-beta.1-sprint139] - 2026-04-15

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint138] - 2026-04-14

### Added

- ADR Governance Integration
- Auditor Authority Extension (3-Pipeline Verification + ADR Compliance)
- Structured Event Stream + Plan-Time Scope Collision Detection
- Test Restoration Tam Tamamlama
- Long-Running Sprint Resume Capability MVP
- MCP/CLI Parity Audit (OPSİYONEL)

### Changed

- ADR-035 Verification Protocol Standard (completed with tech debt)
- Worker Honest Assessment Calibration v2 (completed with tech debt)

### Fixed

- Layer 4 Runtime Wire Forensic Fix
- Auto-Archive Partial Regression Fix


_Tasks: 11 total, 11 done, 2 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint137] - 2026-04-14

### Added

- Brain Test Suite Post-Refactor Restoration
- tryCodeVerifiedDone Wire + In-Sprint Dogfood
- gate.json + load-report.md Runtime Wire Restore
- ErrorRegistry Lint Script Wire
- BETA-TRACKER + BLUEPRINT Sprint 134-136 Sync

### Changed

- Brain Budget Decay No-Op Bug Fix (completed with tech debt)


_Tasks: 6 total, 6 done, 1 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint136] - 2026-04-13


### Changed

- 5 Test Regression Fix (Sprint 136 Opener) (completed with tech debt)
- Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9) (completed with tech debt)
- `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5) (completed with tech debt)
- `load-test-report.md` Auto-Generation (Sprint 135 N6) (completed with tech debt)
- Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7) (completed with tech debt)
- sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt) (completed with tech debt)


_Tasks: 10 total, 6 done, 6 tech debt, 4 no-go_

## [0.4.0-beta.1-sprint135] - 2026-04-12

### Added

- Sprint Coordinator Resilience — PID + State Snapshot + Orphan Detection
- Self-Audit Gate Dedicated Tests
- Rubric Detail Positive-Path Tests
- Worker Verify Loop Enforcement
- sprint-docs-updater.ts Refactor 864 → 600 LoC
- Secondary Observability Instrument Points

### Changed

- Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix) (completed with tech debt)
- Structured Planner Priority + Dependencies Parsing (completed with tech debt)
- GO_WITH_GATE_FAILURE Status Propagation Wire (completed with tech debt)
- Brain Memory Budget Enforcement + Config Sync (completed with tech debt)

### Fixed

- Auditor HB+Result Reconciliation (Docker Bug Defensive Fix)


_Tasks: 17 total, 14 done, 4 tech debt, 3 no-go_

## [0.4.0-beta.1-sprint133] - 2026-04-10

### Added

- Plugin Hook Sandbox Sertleştirme
- npm --ignore-scripts Varsayılan
- results → Map Index (O(n²)→O(n))
- Kritik Modül Unit Testleri (5 Modül, ≥15 Test)
- Yük Testi — P50/P95/P99 Mikrobenchmark
- finalizeSprint() DIRECTIVES Auto-Archive
- Credential Encryption (OS Keychain Minimal Wrapper)
- Marketplace [EXPERIMENTAL] Işaretleme

### Changed

- HTTP API Bearer Token Auth (completed with tech debt)
- loadConfig() Module-Level Cache (completed with tech debt)
- Sprint 131 ADR'leri Yazımı (ADR-029..032) (completed with tech debt)
- Competitive Analysis Güncelleme (completed with tech debt)


_Tasks: 12 total, 12 done, 4 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint132] - 2026-04-10

### Added

- W1 — Security & Multi-Tenancy Audit
- W2 — Performance & Scalability Audit
- W4 — Customization & Extensibility Audit
- W5 — Architecture & Consistency Audit
- W6 — Competitive Positioning Audit
- W7 — Reducer (Self-Polling Executive Report Synthesizer)

### Fixed

- W3 — Reliability (Bugsuz) Audit


_Tasks: 7 total, 7 done, 0 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint129] - 2026-04-09

### Added

- Decision-Engine Arşivleme + .brain/ Temizlik + ADR Yazımı
- Coverage Altyapısı Doğrulama + Gerçek Ölçüm

### Fixed

- MCP Instructions Fix + Dokümantasyon Kapsamlı Güncelleme


_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint128] - 2026-04-09

### Added

- DEBT.md Parse Hatası Düzeltmesi + Sprint Reporter Robustness
- Evaluator Tutarlılık Reformu — evaluateResult/evaluateWithRubric Birleştirme

### Changed

- Fix debt: Tech debt from 125-003-fix: Fixed NO_GO task 125-003 — deckent_explain MCP tool (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 125-001-fix: Rubric-Based Grading sistemi sıfırdan implemente edi
- FIX Fazı Map Mutation Doğrulaması + Tech Debt Kapatma


_Tasks: 8 total, 5 done, 1 tech debt, 3 no-go_

## [0.4.0-beta.1-sprint127] - 2026-04-09

### Added

- Worker Verify Loop Smoke Test
- Sprint Controller İkili Spawn Prevention Testi

### Changed

- Promotion Pipeline Guard Doğrulaması (completed with tech debt)


_Tasks: 3 total, 3 done, 1 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint126] - 2026-04-09

### Added

- No completed tasks


_Tasks: 5 total, 0 done, 0 tech debt, 5 no-go_

## [0.4.0-beta.1-sprint125] - 2026-04-09

### Added

- No completed tasks


_Tasks: 5 total, 0 done, 0 tech debt, 5 no-go_

## [0.4.0-beta.1-sprint124] - 2026-04-09


### Changed

- Context Estimator — Task Scope Token Tahmini (completed with tech debt)
- Context-Aware Router — Model Seçimine Budget Faktörü Ekle (completed with tech debt)
- Token Usage — Worker Result'a Token Verisi Ekle (completed with tech debt)
- Sprint Reporter Token Summary — RETRO.md Token Tablosu (completed with tech debt)


_Tasks: 4 total, 4 done, 4 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint123] - 2026-04-09

### Added

- ADR-027: Hybrid Spawn Backend — DEFERRED kararı (auditor zaten backend-agnostic)
- `Heartbeat.backend` alanı: `'docker' | 'tmux' | 'subprocess'` (monitoring-types.ts)
- Dashboard WorkerCard backend badge: Docker→mavi, tmux→yeşil, subprocess→turuncu
- `docker_timeout` config alanı (DeckentConfig + ResolvedConfig, varsayılan 1200s)
- `spawnWorkerMultiProvider` config-aware: `spawn_backend` tüm spawn yollarında okunuyor
- CI coverage Docker e2e `skipIf(!dockerAvailable)` guard

### Changed

- SpawnBackendFactory `dockerTimeoutSeconds` parametresi eklendi
- sprint-controller, MCP run, CLI run/spawn config'den docker_image + docker_timeout aktarıyor
- CONFIG_FIELDS'a docker_timeout + spawn_backend docker seçeneği eklendi
- docs/guide/docker-backend.md timeout konfigürasyon bölümü güncellendi

_Tasks: 3 total, 3 done, 3 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint122] - 2026-04-08

### Added

- MCP reconnect Docker doğrulama: docs/docker-smoke/mcp-ok.md

_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint121] - 2026-04-08


### Changed

- CLI Docker Test Dosyasi (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint120] - 2026-04-08

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 1 no-go_

## [0.4.0-beta.1-sprint119] - 2026-04-08

### Added

- No completed tasks


_Tasks: 1 total, 0 done, 0 tech debt, 1 no-go_

## [0.4.0-beta.1-sprint108] - 2026-04-08


### Changed

- Tmux Smoke Dosyalari (completed with tech debt)
- Tmux Smoke Test Dosyasi (completed with tech debt)


_Tasks: 2 total, 2 done, 2 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint107] - 2026-04-08


### Changed

- CLI Smoke Dosyalari (completed with tech debt)
- Vitest Kontrolu (completed with tech debt)


_Tasks: 2 total, 2 done, 2 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint106] - 2026-04-08

### Added

- Dosya Olusturma Smoke Test

### Changed

- Auditor Edge Test Fix (completed with tech debt)
- Pattern Reader Test Fix (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint105] - 2026-04-08

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [0.4.0-beta.1-sprint104] - 2026-04-08

### Added

- No completed tasks


_Tasks: 4 total, 0 done, 0 tech debt, 4 no-go_

## [0.4.0-beta.1-sprint103] - 2026-04-07

### Added

- Docker Spawn Backend — container-based worker isolation with read-only project mount and result persistence
- Doctor Docker health check — container status validation and docker build availability
- Init Docker auto-detection — spawn_backend auto-select when docker available
- MCP run tool worker spawn fix — SpawnBackendFactory config-aware routing
- Docker backend kullanım rehberi (docs/guide/docker-backend.md) — setup, arch, troubleshooting

### Changed

- Worker EXIT trap — .result file guarantee (tmux + docker + subprocess backends)
- Config revert protection — updateLastSprintId() null guard
- MCP autoApprove — default(true) with --dangerously-skip-permissions flag

### Fixed

- Docker integration tests (7 tests covering container lifecycle, auth, result persistence)


### Changed

- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp (completed with tech debt)
- Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen (completed with tech debt)
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa (completed with tech debt)
- Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5 (completed with tech debt)
- Docker Backend Integration Test (completed with tech debt)
- Docker Backend Kullanım Rehberi (completed with tech debt)


_Tasks: 7 total, 6 done, 6 tech debt, 1 no-go_

## [0.3.0-beta.3-sprint102] - 2026-04-07

### Added

- No completed tasks


_Tasks: 6 total, 0 done, 0 tech debt, 6 no-go_

## [0.3.0-beta.3-sprint101] - 2026-04-07


### Changed

- Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp (completed with tech debt)
- Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen
- Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5


_Tasks: 10 total, 4 done, 2 tech debt, 6 no-go_

## [0.3.0-beta.3-sprint100] - 2026-04-07

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint100] - 2026-04-07

### Added

- No completed tasks


_Tasks: 6 total, 0 done, 0 tech debt, 6 no-go_

## [0.3.0-beta.3-sprint99] - 2026-04-06


### Changed

- RETRO Done Sayacı — Evaluations Map Debug + Fix (completed with tech debt)
- Job Output Reform — Detaylı Gerekçe + Metrik (completed with tech debt)
- VISION.md + health-check.md + roadmap.md Sayı Güncellemeleri (completed with tech debt)
- README Badge + ANALYSIS Sprint 098 Güncelleme (completed with tech debt)
- PROJECT-IDENTITY Test Count Fix + CLAUDE.md Module Count (completed with tech debt)


_Tasks: 5 total, 5 done, 5 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint98] - 2026-04-06


### Changed

- RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı (completed with tech debt)
- Sprint History — Son 5 Sprint Döndürmeli (completed with tech debt)
- ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi (completed with tech debt)
- README + DECKENT.md ModelRegistry Özelliği Dokümante (completed with tech debt)
- PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri (completed with tech debt)


_Tasks: 5 total, 5 done, 5 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint98] - 2026-04-06


### Changed

- RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı (completed with tech debt)
- Sprint History — Son 5 Sprint Döndürmeli (completed with tech debt)
- ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi (completed with tech debt)
- README + DECKENT.md ModelRegistry Özelliği Dokümante (completed with tech debt)
- PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri (completed with tech debt)


_Tasks: 5 total, 5 done, 5 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint97] - 2026-04-06

### Added

- model-selector.ts Tier-Based Refactor
- Config Migration v1→v2 + config.json Güncelleme

### Changed

- ModelRegistry Class + BUILTIN_MODELS Kataloğu (completed with tech debt)
- task-types.ts Delegasyonu — Registry'den Re-export (completed with tech debt)
- Provider Adapter Tier Duplicate Kaldırma (completed with tech debt)
- mode-presets.ts + model_strategy Config Yapısı (completed with tech debt)
- MCP + CLI Model Enum Genişletme (completed with tech debt)
- Codex Adapter CLI Uyumluluk Güncellemesi (completed with tech debt)
- Gemini Adapter CLI Uyumluluk + gemini-3.1-pro-preview (completed with tech debt)
- Init Wizard Provider-Agnostic Tier Seçimi (completed with tech debt)
- token-counter.ts + sprint-reporter.ts Hard-Code Temizliği (completed with tech debt)
- Dashboard Test Fix + Integration Test (completed with tech debt)


_Tasks: 12 total, 12 done, 10 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint96] - 2026-04-06

### Added

- src/cli/commands/init.ts — Skill İsimleri Düzeltme

### Changed

- README.md + README-TR.md Sayı ve Tablo Düzeltmeleri (completed with tech debt)
- DECKENT.md Skill İsimleri + MCP Tablo + Checkpoint (completed with tech debt)
- CLAUDE.md + IDENTITY.md + PROJECT-IDENTITY.md Sayı Düzeltmeleri (completed with tech debt)
- docs/reference/cli.md — Usage Komutu Kaldır + Sayılar (completed with tech debt)
- docs/reference/api.md — Usage + Eski Mod İsimleri Temizliği (completed with tech debt)
- docs/reference/config-reference.md — Mod İsimleri Canonical Güncelleme (completed with tech debt)
- docs/architecture/architecture.md — Tam Güncelleme (completed with tech debt)
- docs/reference/ Kalan Dosyalar — Mod İsimleri + Usage Temizliği (completed with tech debt)
- docs/guide/ + docs/development/ + docs/architecture/ Kalan — Sayı ve Referans Düzeltmeleri (completed with tech debt)


_Tasks: 10 total, 10 done, 9 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint95] - 2026-04-06


### Changed

- Skill İsim Uyumsuzluğu Düzeltme (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint94] - 2026-04-06


### Changed

- Fix debt: Tech debt from 091-006-fix: Quality Score Routing Bonus entegrasyonu zaten tam o (completed with tech debt)
- Usage Son Kalıntı Temizliği — README CLI Tablosu (completed with tech debt)
- Stats Sync Doğrulama Notu (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 091-007-fix: Integration test file created with 26 tests across 7


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint93] - 2026-04-06

### Added

- V2 Stats → Agent.json / Manifest.json Sync

### Changed

- RETRO.md Skill Performance Tablosu Düzeltme (completed with tech debt)
- avgQualityScore Persist Düzeltme + Agent Done Sayacı (completed with tech debt)
- Sprint Bitişinde Otomatik Output (Job Completion Notification) (completed with tech debt)


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint92] - 2026-04-06


### Changed

- Config.json Agresif Temizlik + Tip Güvenliği (completed with tech debt)
- Dashboard i18n — StatusPage + SprintSummary (~34 key) (completed with tech debt)
- Dashboard i18n — TaskCard (~30 key) (completed with tech debt)
- Dashboard i18n — DebtTable + SprintChart + Layout + Kalan (~25 key) (completed with tech debt)
- i18n Doğrulama — Hardcoded String Tarama + Key Eşitliği (completed with tech debt)


_Tasks: 5 total, 5 done, 5 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint91] - 2026-04-06


### Changed

- Agent Tiebreaker — learnings.json'dan Oku (completed with tech debt)
- Promotion/Demotion Execute Et (completed with tech debt)
- Evolved Rules Activation'a Inject Et (completed with tech debt)
- updateSkillStats V1 + SkillMap RETRO İçin (completed with tech debt)


_Tasks: 7 total, 4 done, 4 tech debt, 3 no-go_

## [0.3.0-beta.3-sprint90] - 2026-04-06


### Changed

- src/ Artık Temizliği — MCP Help, Server, Dashboard, Sprint Types (completed with tech debt)
- Dokümantasyon + README Artık Temizliği (completed with tech debt)


_Tasks: 3 total, 2 done, 2 tech debt, 1 no-go_

## [0.3.0-beta.3-sprint89] - 2026-04-06


### Changed

- Usage Core Modülleri Kaldır — Tipler, Config, Tracker (completed with tech debt)
- Usage Orchestra + Provider Modülleri Kaldır (completed with tech debt)
- Usage CLI + MCP + API + Dashboard Kaldır (completed with tech debt)
- Usage Test Dosyaları + Dokümantasyon Temizliği (completed with tech debt)


_Tasks: 4 total, 4 done, 4 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint88] - 2026-04-06

### Added

- Adaptive Thresholds — NO_GO Rate Bazlı Otomatik Ayar

### Changed

- Mid-Sprint Reroute Güçlendirme — Max 3 + Config (completed with tech debt)
- Checkpoint CLI/MCP Entegrasyonu — Approve/Reject Komutları (completed with tech debt)
- Kalan Sessiz Catch Blokları — Son Dalga (completed with tech debt)


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint88] - 2026-04-02

### Added

- Sprint Timeout Reformu — `sprint_timeout_minutes: 0` ile sınırsız süre desteği, config-types + result-collector + sprint-controller güncellemeleri
- Heartbeat Daemon — `.deckent/HEARTBEAT.md` task'larını periyodik çalıştıran arka plan servisi, `deckent heartbeat` CLI komutu
- Human Checkpoints — plan/evaluate/fix fazlarında dosya bazlı onay noktaları, `waitForHumanApproval()` mekanizması
- SprintStatus.ABORTED enum değeri — checkpoint reddedildiğinde sprint durumu

### Changed

- README.md ve README-TR.md: yeni özellik badge'ları, comparison table güncellemeleri
- IDENTITY.md ve PROJECT-IDENTITY.md: sprint 088 metrikleri

_Tasks: 4 total, 4 done, 4 tech debt, 0 no-go_

## [0.3.0-beta.3-sprint87] - 2026-04-02

### Added

- No completed tasks


_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_

## [0.3.0-beta.2-sprint86] - 2026-04-02

### Added

- Intent Classifier Feedback Loop
- Coverage Threshold Config + Adaptive Thresholds

### Changed

- Tech Debt Kapatma — routeTaskV2 Cagri Yerleri + Kalan Catch Bloklari (completed with tech debt)
- Planner'a Gecmis Bilgisi Enjeksiyonu (completed with tech debt)


_Tasks: 4 total, 4 done, 2 tech debt, 0 no-go_

## [0.3.0-beta.1-sprint84] - 2026-04-02

### Fixed

- AgentDetail penceresi genişletildi (400→600px), font boyutları artırıldı, ScrollArea→overflow-auto
- Log bölümü yüksekliği 220→350px, break-words eklendi (Türkçe karakter desteği)

### Added

- ConfigPage i18n tam kapsam: 79 yeni çeviri key'i (38 label + 38 description + 3 dropdown)
- fieldT() helper ile runtime çeviri (fallback: İngilizce)
- Dashboard canlı veri akışı test suite: 41 yeni test (SSE hook, WorkerCard, ActivityFeed, SprintPhaseTimeline)
- build:dashboard, build:all, postbuild npm script'leri

_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go — %100 GO_

## [0.3.0-beta.1-sprint83] - 2026-04-02

### Added

- PROJECT-IDENTITY + VISION Sayı Güncelleme

### Changed

- CHANGELOG + SPRINT-LOG Sprint 078-082 Toplu Güncelleme (completed with tech debt)
- Dashboard Vite Build + dist/ Güncelleme (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [0.3.0-beta.1-sprint82] - 2026-04-02


### Changed

- Skeleton Loading Bileşenleri (completed with tech debt)
- AgentDetail Zenginleştirme (completed with tech debt)
- Empty State Bileşenleri (completed with tech debt)
- Dashboard Genel Polish (completed with tech debt)


_Tasks: 4 total, 4 done, 4 tech debt, 0 no-go_

## [0.3.0-beta.1-sprint81] - 2026-04-02

### Added

- Package Version Bump + CHANGELOG
- AGENTS.md + Kalan Docs Tutarlılık

### Changed

- Usage Manager — Gerçekçi Tahmin + Dashboard Düzeltme (completed with tech debt)
- Init Test Mock Düzeltme (completed with tech debt)


_Tasks: 4 total, 4 done, 2 tech debt, 0 no-go_

## [0.3.0-beta.1] - 2026-04-02

### Added

- **Dashboard UX Overhaul — Faz A** (sprint-078): WorkerCard bileşeni ile canlı agent kart grid, SprintPhaseTimeline ile faz görsel akışı, ActivityFeed ile canlı aktivite izleme, WelcomeScreen
- **Dashboard UX Overhaul — Faz B** (sprint-082): Skeleton loading bileşenleri (SkeletonCard, SkeletonTable, SkeletonText), EmptyState bileşeni (icon+action), AgentDetail zenginleştirme (collapsible description, badges, skills section), WorkerCard durum renkleri polish
- **i18n Tam Kapsam** (sprint-079): 44+ yeni çeviri anahtarı, dashboard'da tam TR/EN desteği
- **MCP/CLI Parity** (sprint-080): 13 yeni parametre (force, auto, env, dryRun, verbose, json, watch, sandbox, timeout, autoApprove, includeProfile, mode, config-key), 2 yeni tool (agent_list, skill_list)
- **Config Yazma Doğrulama** (sprint-079): Round-trip test suite (10 test) ile config okuma-yazma tutarlılığı
- **Usage Manager Düzeltme** (sprint-081): Gerçekçi tahmin sistemi, dashboard'da "Tahmini Kullanım" gösterimi, SAFE_DEFAULT sıfıra düşürüldü
- **CI Baseline Entegrasyonu**: GitHub Actions CI health monitoring, baseline comparison
- **Health-Check Test Dinamikleştirme**: Tarih hardcode yerine dinamik yıl-ay
- **HistoryPage Success Rate Trend** (sprint-076): BarChart ile son 10 sprint başarı oranı görselleştirmesi

### Changed

- **Dashboard Settings & Config Birleştirme** (sprint-079): Ayrı iki sayfa yerine tutarlı interface
- **Terminal Operasyon Logları** (sprint-079): Dashboard işlemleri terminal'de izlenebilir
- **CLI set-directives Komutu** (sprint-080): 3 giriş modu (--content, --file, stdin)
- **Usage Tracking** (sprint-081): Claude CLI programatik API yerine sprint-bazlı tahmin sistemi
- **README Version Badge**: v0.2.0-beta.3 → v0.3.0-beta.1
- **Init Wizard Dil Seçimi** (sprint-077): Dil seçimi init akışında ilk adım yapıldı

### Fixed

- **ConfigPage Mode Seçenekleri**: performance/balanced/economic isimlendirmesi
- **ConfigPage memory_budget**: 600 → 900 varsayılan değer
- **ConfigPage language Alanı**: text input → select dropdown
- **SSE Bağlantı Durumu Göstergesi**: connected/connecting/disconnected states
- **Blueprint Testi**: MCP 19 tools, 9 resources, memory budget 900
- **Stale Heartbeat Pattern** (sprint-076): finalizeHeartbeat() ile worker DONE state'i
- **Init Test Mock Düzeltme** (sprint-081): it.skip kaldırıldı, language-first akış

### Documentation

- **CHANGELOG.md**: sprint-076 — sprint-082 tüm değişiklikler belgelendi
- **VISION.md**: Proje vizyonu, rakip analizi, yol haritası
- **ADR-022**: CLI/MCP feature parity belgelendirmesi
- **ADR-024**: Config validation ve round-trip test estratejisi
- **docs/ Link Audit**: 4 broken link tespit ve düzeltme
- **README-TR.md**: Tam Türkçe çeviri (466 satır)
- **VISION-EN.md**: Tam İngilizce VISION çevirisi (110 satır)
- **AGENTS.md** (sprint-081): Built-in agent havuzu dokümantasyonu

### Technical Debt Resolved

- God object split Faz 3 (sprint-076): result-collector.ts extract
- TempAgent mechanism fully verified (Sprint 072)
- Graceful shutdown SIGINT handler (sprint-076)
- README-TR.md UTF-8 Türkçe karakter doğrulaması (sprint-080)
- POST /api/cleanup endpoint doğrulaması (sprint-080)
- Security: timingSafeEqual, redactSensitive (Sprint 037)

_Sprints: sprint-076 — sprint-082, Tasks: 35 total, 34 done, 32 tech debt, 1 no-go_

## [0.2.0-beta.3-sprint80] - 2026-04-02

### Added

- ADR-022 Parity Dokümantasyonu

### Changed

- Fix debt: Tech debt from 077-001-fix: README-TR.md already contains correct UTF-8 Turkish (completed with tech debt)
- Fix debt: Tech debt from 077-004-fix: POST /api/cleanup endpoint was already fully impleme (completed with tech debt)
- MCP Tool Parametre Zenginleştirme — init, start, status, doctor (completed with tech debt)
- CLI set-directives Komutu (completed with tech debt)
- MCP agent_list + skill_list Tool'ları (completed with tech debt)


_Tasks: 6 total, 6 done, 5 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint79] - 2026-04-01

### Added

- Settings + Config Sayfa Birleştirme
- Dashboard İşlemlerinin Terminal Çıktısı

### Changed

- i18n Tam Kapsam — Kalan Hardcoded String'ler (completed with tech debt)
- Config Yazma Doğrulama + Geri Okuma (completed with tech debt)


_Tasks: 4 total, 4 done, 2 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint78] - 2026-04-01

### Added

- SprintPhaseTimeline Bileşeni — Faz Görsel Akışı

### Changed

- WorkerCard Bileşeni — Canlı Agent Kart Grid (completed with tech debt)
- ActivityFeed Bileşeni — Canlı Aktivite Akışı (completed with tech debt)
- DashboardPage Layout Yeniden Düzenleme (completed with tech debt)


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint77] - 2026-04-01

### Added

- Init Dil Seçimi İlk Adım

### Changed

- DashboardPage Sprint Kontrol Butonları (completed with tech debt)


_Tasks: 4 total, 2 done, 1 tech debt, 2 no-go_

## [0.2.0-beta.3-sprint76] - 2026-04-01

### Added

- SPRINT-LOG Sprint 078-080 Entry

### Changed

- CHANGELOG Sprint 078-080 Entry (completed with tech debt)
- PROJECT-IDENTITY Güncelleme (completed with tech debt)
- HistoryPage Success Rate Trend Bileşeni (completed with tech debt)


_Tasks: 4 total, 4 done, 3 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint75] - 2026-03-30

### Added

- CLAUDE.md + DECKENT.md Modül Sayısı Güncelleme

### Changed

- CHANGELOG + SPRINT-LOG Güncelleme (completed with tech debt)
- .brain/ Güncelleme — PROJECT-IDENTITY + DECISIONS (completed with tech debt)


_Tasks: 3 total, 3 done, 2 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint80] - 2026-04-01

### Added

- **SSE Bağlantı Durumu Göstergesi**: Dashboard'a `connected` / `connecting` / `disconnected` durumlarını gösteren SSE indicator eklendi

### Changed

- **ConfigPage Mode Seçenekleri**: `performance` / `balanced` / `economic` isimlendirmesine güncellendi
- **SettingsPage Mode Seçenekleri**: ConfigPage ile tutarlı hale getirildi

### Fixed

- **ConfigPage memory_budget Varsayılanı**: Hatalı varsayılan değer 600 → 900 düzeltildi
- **ConfigPage language Alanı**: `text` input → `select` dropdown olarak değiştirildi

_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

---

## [0.2.0-beta.3-sprint79] - 2026-04-01

### Added

- **Dashboard i18n**: `LanguageProvider`, 90+ TR/EN anahtar ve sidebar dil switcher eklendi
- **README-TR.md**: README.md'nin tam Türkçe çevirisi (466 satır)
- **VISION-EN.md**: VISION.md'nin tam İngilizce çevirisi (110 satır)
- **GET /api/tasks endpoint**: `.tasks/` dizininden aktif görev listesini döndüren yeni API endpoint

### Fixed

- **Blueprint Testleri**: MCP tool sayısı 10→17, resource sayısı 5→9 olarak güncellendi

_Tasks: 3 total, 3 done, 0 tech debt, 0 no-go_

---

## [0.2.0-beta.3-sprint78] - 2026-04-01

### Changed

- **Blueprint Senkronizasyonu**: MCP 10→17 tools, 5→9 resources, memory budget 600→900 belgelerine yansıtıldı
- **ANA-PLAN-TR.md**: CLI 21→32, MCP sayıları ve sprint tablosu tam güncellendi
- **BETA-ROADMAP**: Sprint 076-077 DONE, Sprint 078 AKTİF olarak işaretlendi

### Fixed

- **brain.md Bellek Bütçesi**: MEMORY 200→300, RETRO 100→120, genel budget 600→900 düzeltildi
- **Dokümantasyon Bellek Bütçesi**: `docs/architecture`, `docs/security`, `docs/release-notes` dosyalarında budget 600→900 olarak güncellendi

_Tasks: 4 total, 4 done, 0 tech debt, 0 no-go_

---

## [0.2.0-beta.3-sprint76] - 2026-03-30

### Fixed

- **Stale Heartbeat Root Cause**: `finalizeHeartbeat()` worker.ts'e eklendi — writeResult() artık DONE state heartbeat yazıyor; auditor DONE durumundaki worker'ları stale olarak işaretlemiyor (410x pattern giderildi)

### Added

- **Dashboard API Entegrasyon Testleri**: 6 describe block'ta 10 yeni entegrasyon testi — GET /api/status, /api/tasks, /api/alerts, /api/agents, /api/history, /api/metrics endpoint alanları doğrulandı
- **Graceful Shutdown**: SIGINT → `interruptActiveSprint()` + `killAllSessions()` zinciri; entry.ts genişletildi, sprint state tutarlılığı sağlandı

### Changed

- **God Object Split Faz 3**: `result-collector.ts` extract edildi — `waitForResults()` (IPC+fs.watch loop, processQueue, collectResults) sprint-controller.ts'ten ayrıştırıldı
- **BETA-ROADMAP**: Sprint tablosu ve yol haritası güncellendi

_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint74] - 2026-03-30

### Added

- BETA-ROADMAP Güncelleme + Sprint Tablosu

### Changed

- Stale Heartbeat Root Cause Fix (410x pattern) (completed with tech debt)
- Dashboard API Entegrasyon Testi (P3-20,22) (completed with tech debt)
- Worker Graceful Shutdown — Sprint State Tutarlılığı (P6-40) (completed with tech debt)
- God Object Split Faz 3 — Result Collector Extract (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint73] - 2026-03-30

### Added

- God Object Split Faz 2 — sprint-controller Utility Extract

### Changed

- Dokümantasyon Dil Stratejisi — TR/EN Tutarlılık (completed with tech debt)
- VISION.md — Proje Vizyonu ve Yol Haritası (completed with tech debt)
- docs/ Link Audit — Kırık Link Kontrolü (completed with tech debt)
- .detect-secrets Kurulumu — Pre-commit Güvenlik (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.3-sprint72] - 2026-03-30

### Added

- README.md Güncellemesi — Test Sayıları + Sprint Bilgisi
- CHANGELOG.md + docs/CHANGELOG.md Güncelleme

### Changed

- Fix debt: 069-005-fix teknik borcu — TempAgent mekanizması zaten tamamen uygulanmıştı (teknik borçla tamamlandı)
- .brain/ Dokümantasyon Tutarlılığı — RETRO, MEMORY, PROJECT-IDENTITY (teknik borçla tamamlandı)
- DECKENT.md + CLAUDE.md Tutarlılık Kontrolü (teknik borçla tamamlandı)
- docs/SPRINT-LOG.md Güncelleme (teknik borçla tamamlandı)

### Fixed

- Fix debt: 069-006-fix teknik borcu — extractScopeFromDirective hatası düzeltildi: docFileMatch


_Görevler: 7 toplam, 7 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.3-sprint73] - 2026-03-30

### Fixed

- **Test Regresyon Düzeltmesi**: 100 test regresyonu düzeltildi — 0 fail, 12,161 passed
  - 43 fs mock düzeltmesi (worker-feedback, verify-lang testleri)
  - 16 brain mock düzeltmesi (`statSync` mock, `isStackStale()` çağrı zinciri)
  - 9 doctor logic düzeltmesi (`c.ok` → `c.passed` field mismatch)
  - 23 stack/CI/analyzer detection düzeltmesi
  - 3 integration test düzeltmesi (start.test.ts, analyzer-overhaul.test.ts)

### Changed

- Brain Test — statSync Mock düzeltmesi (16 fail) (teknik borçla tamamlandı)
- Kalan Mock/Integration düzeltmesi (3 fail) (teknik borçla tamamlandı)

_Sprint 073: 5 görev, 5 tamamlanan, 2 teknik borç, 0 no-go_

---

## [0.2.0-beta.3-sprint72] - 2026-03-28

### Added

- Model API ID güncellemesi: `claude-opus-4-6`, `claude-sonnet-4-6` resmi API ID'leri

### Changed

- **Plan Tier Generalizasyonu**: Claude-specific plan adları provider-agnostic hale getirildi
  - `max_plan` → `performance`, `max5x_plan` → `balanced`, `pro_plan` → `economic`
  - Tüm provider'lar (Claude, Codex, Gemini) aynı tier sistemini kullanıyor
- **Init Wizard**: "Select your Claude plan" → "Select your plan" — provider-agnostic
  - Yeni tier isimleri: performance/balanced/economic/unlimited
- **sprint-controller.ts God Object Split**: 7 sprint faz fonksiyonu `sprint-phases.ts`'e taşındı
  - `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase` ve diğerleri extract edildi
  - `sprint-controller.ts` slim hale geldi, maintainability artırıldı
- **README.md**: Test sayısı, sprint sayısı, Windows destek bilgisi güncellendi

_Sprint 072: 5 görev, 5 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.3] - 2026-03-27

### Added

- `deckent upgrade --local <path.tgz>` — closed beta development workflow
- `.deckent/workspace/IDENTITY.md` — stack detection sonuçlarıyla proje kimliği
- `.deckent/docs/` — quick-start.md, directives-guide.md, config-reference.md (TR/EN)
- TempSkill + TempAgent init sırasında otomatik oluşturma
- DECKENT.md Workflow Guide + DIRECTIVES Format + Providers bölümleri
- Subprocess heartbeat periodic update (setInterval 15s)
- Fallback .result file on worker exit
- Review archive/ fallback — cleanup sonrası task'lar hala erişilebilir
- Scope parser explicit `Files:` / `Scope:` label parsing

### Fixed

- **BUG-3**: Claude CLI spawn ENOENT on Windows — `shell: true` 7 dosyada
- **BUG-4,12**: Worker rules hardcoded tsc/vitest → stack-aware komutlar
- **BUG-6**: Stack detection sadece --auto'da çalışıyordu → her zaman çalışır
- **BUG-7**: Doctor FAIL+OK çelişkisi → optional provider'lar SKIP olarak gösterilir
- **BUG-8**: Python projede framework `next` algılanıyordu → dil guard eklendi
- **BUG-9**: IDENTITY.md dangling reference → workspace IDENTITY.md oluşturuluyor
- **BUG-10**: DECKENT.md `Build: tsc` Python projede → empty string falsy fix
- **BUG-11**: DIRECTIVES.md boş placeholder → stack-aware örnek task şablonu
- **BUG-13**: Brain rules yanlış limitler → 200→300, 600→900
- **BUG-14**: TempAgent "mixed" dilde oluşturulmuyor → detectedLanguages eşleşme
- **BUG-15**: BOOT.md kullanıcı ipucu yok → TR/EN kullanıcı-dostu
- **BUG-16**: `ps -o` Windows'ta hata → platform guard
- **BUG-19**: UTF-8 encoding Windows → LANG + PYTHONIOENCODING env vars
- **BUG-21**: Doctor healthScore=0 tüm check passed → `c.ok` → `c.passed`
- **BUG-22**: Review "No tasks found" → archive/ fallback
- **BUG-23**: Heartbeat 28x stale → periodic update
- **BUG-24**: Worker .result yazmıyor → fallback on exit
- **BUG-25**: Scope parser Files/Scope ignorluyor → explicit parsing
- **BUG-26**: Task log boş Windows → closeSync child exit handler

### Changed

- Version bump: 0.2.0-beta.1 → 0.2.0-beta.3
- Worker prompt: hardcoded `tsc --noEmit`/`npx vitest run` kaldırıldı → DECKENT.md referansı
- allowedTools: `Edit`, `Glob`, `Grep` worker tool'larına eklendi
- FullStackResult: `detectedLanguages` field eklendi

_Sprint 070: 8 görev, 8 tamamlanan, 15 hata düzeltme. Sprint 071: 8 görev, 8 tamamlanan, 7 hata düzeltme. 0 regresyon._

---

## [0.2.0-beta.1-sprint69] - 2026-03-27

### Added

- Skill İstatistik Takibi — uses/successRate/avgCoverage
- Sonuç Tabanlı Öğrenme Güçlendirme — Agent/Skill Bonus

### Changed

- Agent Seçim Hassasiyeti — test-writer Exclude + Intent Weights (teknik borçla tamamlandı)
- Skill Seçim Bütçesi — Dinamik maxTokens + Priority (teknik borçla tamamlandı)


_Görevler: 6 toplam, 4 tamamlanan, 2 teknik borç, 2 no-go_

## [0.2.0-beta.1-sprint68] - 2026-03-26

### Added

- DECKENT.md AI-Native Rehber Genişletme
- deckent init Multi-Ortam Adaptörü
- V2 Routing E2E Doğrulama Testi

### Changed

- MCP Sunucu Talimatları — AI Sistem Prompt Enjeksiyonu (teknik borçla tamamlandı)
- Tool Açıklamaları + Annotations Zenginleştirme (teknik borçla tamamlandı)
- deckent_help Aracı — Çalışma Zamanı Yetenekleri + Durum (teknik borçla tamamlandı)


_Görevler: 6 toplam, 6 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint67] - 2026-03-26

### Added

- Job State Sprint Sonuçları — finalizeSprint → iş dosyası

### Changed

- Fix debt: 064-004-fix teknik borcu — tests/cli/helpers/output'a 11 hedefli test eklendi (teknik borçla tamamlandı)
- Retro Detay Zenginleştirme — Worker Notes Aktarımı (teknik borçla tamamlandı)
- any Kullanımı Temizliği — 10 Adet, 7 Dosya (teknik borçla tamamlandı)
- V2 Routing Doğrulama — Audit + IDENTITY Güncelleme (teknik borçla tamamlandı)


_Görevler: 6 toplam, 5 tamamlanan, 4 teknik borç, 1 no-go_

## [0.2.0-beta.1-sprint66] - 2026-03-26

### Added

- Phantom Modüller — prompt-token-optimizer + ecosystem-intelligence
- PlannerTask Arayüzü + enrichScope + api-surface Sözleşmesi
- Stale Heartbeat Kök Neden + Config routing_engine Doğrulama
- V1+V2 Paralel Doğrulama + decision-engine Analizi

### Changed

- Manifest v2 Toplu Güncelleme — 20 Dosya (teknik borçla tamamlandı)
- MCP Dokümantasyon Tutarlılık — 16 Tool + 9 Resource (teknik borçla tamamlandı)
- Housekeeping — gitignore + IDENTITY Sayıları (teknik borçla tamamlandı)


_Görevler: 7 toplam, 7 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint65] - 2026-03-26

### Added

- history Trend + retro Arşivleme

### Changed

- plan — AI Planner Timeout Yapılandırılabilir (teknik borçla tamamlandı)
- config — autoMigrateOnLoad + Modes İç İçe Geçme (teknik borçla tamamlandı)
- cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore (teknik borçla tamamlandı)
- spawn — Kapsam Zorlama + Multi-Provider (teknik borçla tamamlandı)
- analyze — Wrapper Birleştirme + Monorepo (teknik borçla tamamlandı)
- Dokümantasyon — CHANGELOG/SPRINT-LOG Geri Yükleme + cli-deep-analysis Final (teknik borçla tamamlandı)


_Görevler: 7 toplam, 7 tamamlanan, 6 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint64] - 2026-03-26

### Added

- Tamamlanan görev yok


_Görevler: 14 toplam, 0 tamamlanan, 0 teknik borç, 14 no-go_

## [0.2.0-beta.1-sprint62] - 2026-03-26

### Added

- ci-guardian Agent Tanımı + PROMPT.md
- beforeSprint Hook — Sprint Öncesi CI Doğrulama
- afterTask Hook — Görev Düzeyinde Regresyon Tespiti
- afterSprint Hook — Sprint CI Raporu
- CI Öğrenme — Sprintler Arası Öğrenme

### Changed

- ci-testing Skill Tanımı + SKILL.md (teknik borçla tamamlandı)
- CI Dashboard Entegrasyonu (teknik borçla tamamlandı)
- GitHub Actions Workflow İyileştirme (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 3 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint61] - 2026-03-26

### Added

- Plan Bağımsız Provider Başlatma (P0)

### Changed

- Agent Listesi Görüntü Düzeltmesi + History Agent Sütunu (P1) (teknik borçla tamamlandı)
- Brain Bütçe Decay + Memory Temizliği (P0) (teknik borçla tamamlandı)
- Açık Borç Temizliği (debt-059-008-fix) (P1) (teknik borçla tamamlandı)
- Framework Tespiti + Analyzer Düzeltmesi (P2) (teknik borçla tamamlandı)
- Kalan CLI İyileştirmeleri (teknik borçla tamamlandı)

### Fixed

- Agent Atama Kalıcılık Düzeltmesi (P0 KRİTİK)
- Agent İstatistik Güncelleme Düzeltmesi (P0 KRİTİK)


_Görevler: 8 toplam, 8 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint60] - 2026-03-26


### Changed

- CLI Komut + Flag Doğrulama (teknik borçla tamamlandı)
- Agent Pool + Skill Pool Doğrulama (teknik borçla tamamlandı)
- MCP Tool + Resource Doğrulama (teknik borçla tamamlandı)
- Sprint Yaşam Döngüsü + Format Tutarlılık Doğrulama (teknik borçla tamamlandı)
- Doctor + Config + Provider Doğrulama (teknik borçla tamamlandı)

### Fixed

- Fix debt: 057-012-fix teknik borcu — tüm agent/skill/plugin/marketplace/archive-debt iyileştirmeleri


_Görevler: 6 toplam, 6 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint59] - 2026-03-25


### Changed

- cli-deep-analysis.md Tam [DONE] İşaretleme + Doğrulama (teknik borçla tamamlandı)
- Prompt Boilerplate Azaltma + Worker Rehberi (teknik borçla tamamlandı)
- spawn+kill+run Multi-Provider Desteği (teknik borçla tamamlandı)
- doctor+watch Provider-Duyarlı Düzeltme (teknik borçla tamamlandı)
- MCP Kaynakları Genişleme (+4 kaynak) (teknik borçla tamamlandı)
- MCP Tool Kalitesi — Zenginleştirme + Hata Yönetimi (teknik borçla tamamlandı)
- Format Tutarlılığı + Ölü Kod Temizliği (teknik borçla tamamlandı)
- Sync Genişleme (Gemini/Cursor/Codex Adaptörleri) (teknik borçla tamamlandı)
- Doküman Güncelleyici Düzeltme + CHANGELOG Konsolidasyonu (teknik borçla tamamlandı)

### Fixed

- Agent Aktivasyon Düzeltmesi — forceModel Agent Bypass Kaldırıldı
- Skill Seçim Düzeltmesi — Görev-Bazlı Seçim + Truncation
- Scope & GO/NO-GO Düzeltmesi — filesWrite + Kriter Zenginleştirme


_Görevler: 13 toplam, 12 tamamlanan, 9 teknik borç, 1 no-go_

## [0.2.0-beta.1-sprint58] - 2026-03-25

### Added

- agent+skill+plugin+marketplace+archive-debt Tamlık Kontrolü
- dashboard+attach+watch+cross-cutting Bütünleştirme


_Görevler: 2 toplam, 2 tamamlanan, 0 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint57] - 2026-03-25

### Added

- status Yenileme — Bağımsız, ETA, NO_COLOR, fs.watch, Verbose
- retro+explain Kalitesi — Dil, Trend, Agent/Skill Performansı, Öğrenmeler
- usage Yenileme — Gerçek Token'lar, Race Condition, Canlı Kullanım, Filtreler
- history Yenileme — --json, --last, Agent/Skill, Ölü Kod, Format
- config Kalitesi — list/keys, autoMigrate, Doğrulama, Yorum, Env Var
- review+finalize Yenileme — Etkileşimli, Yeniden Deneme, Guard, Çoklama
- serve Güvenliği — Rate Limit, Body Size, DeepMerge, Auth, Versiyonlama

### Changed

- doctor İyileştirmeleri — tmux Koşullu, .deck Kontrol, Auth, İpuçları (teknik borçla tamamlandı)
- cleanup+decay Yenileme — Otomatik Decay, Combo, Lock Guard, Arşiv (teknik borçla tamamlandı)
- run+test+web Flag'leri — Timeout, Keep, Sandbox, CI, MIME (teknik borçla tamamlandı)
- sync+onboard+upgrade İyileştirme (teknik borçla tamamlandı)


_Görevler: 13 toplam, 11 tamamlanan, 4 teknik borç, 2 no-go_

## [0.2.0-beta.1-sprint56] - 2026-03-25

### Added

- init UX — Otomatik Dil, Öneri, Yeniden Başlatma, Hata Kurtarma

### Changed

- Doküman Güncelleyici Referans Düzeltmesi + CHANGELOG Konsolidasyonu (teknik borçla tamamlandı)
- init Hata Düzeltmesi — deepMerge + .deck Güvenlik + Provider Sihirbazı (teknik borçla tamamlandı)
- plan Çekirdek — Async Kullanım, Dry-Run, Idempotency, Koruma (teknik borçla tamamlandı)
- plan Kalitesi — Parser, i18n, Bağlam Önceliği, Hata Loglama (teknik borçla tamamlandı)
- start Çekirdek — Bekleme Timeout, Spawn Yeniden Deneme, Sıfır-Yapılandırma, Faz Kalıcılığı (teknik borçla tamamlandı)
- start Kalitesi — Provider Cache, Dashboard Kullanımı, Cleanup Finally, --watch Alternatif (teknik borçla tamamlandı)


_Görevler: 20 toplam, 7 tamamlanan, 7 teknik borç, 13 no-go_

## [0.2.0-beta.1-sprint55] - 2026-03-25

### Fixed

- Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK)
- Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK)

### Changed

- readLanguage + readJsonSafe Tam DRY Temizliği (teknik borçla tamamlandı)
- Config Set İç İçe Anahtar + Import DeepMerge + Config Get (teknik borçla tamamlandı)
- Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (teknik borçla tamamlandı)
- Doctor --json + Retro --json Flag'leri (teknik borçla tamamlandı)
- Cleanup --dry-run Flag'i (teknik borçla tamamlandı)
- Agent Delete + Edit Komutları (teknik borçla tamamlandı)
- Skill Enable/Disable + Delete Komutları (teknik borçla tamamlandı)
- Explain --sprint Flag + Goal Bilgisi + Dil Desteği (teknik borçla tamamlandı)


_Görevler: 10 toplam, 10 tamamlanan, 10 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint54] - 2026-03-25

### Changed

- Agent Aktivasyonu — systemPrompt + Worker Enjeksiyonu (teknik borçla tamamlandı)
- Brain Kendi Kendine Öğrenme — Config Önerileri + Desen Tespiti (teknik borçla tamamlandı)
- Zengin Sprint Çıktısı + README Güncelleme (teknik borçla tamamlandı)
- docs/ Yeniden Düzenleme + .claude/rules/ Güncelleme (teknik borçla tamamlandı)

_Görevler: 4 toplam, 4 tamamlanan, 4 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint53] - 2026-03-25

### Added

- Skill Enjeksiyonu — 10 Skill'i Worker'lara Enjekte Et

### Changed

- Kendini İyileştiren Bootstrap — Başlangıçta Otomatik Migration (teknik borçla tamamlandı)


_Görevler: 8 toplam, 2 tamamlanan, 1 teknik borç, 6 no-go_

## [0.2.0-beta.1-sprint52] - 2026-03-25


### Changed

- Dashboard Tam Genişleme (teknik borçla tamamlandı)


_Görevler: 1 toplam, 1 tamamlanan, 1 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint51] - 2026-03-25

### Added

- Başlangıç Rehberi

### Changed

- Tam Config Genişleme (teknik borçla tamamlandı)
- Config Dokümantasyonu (Satır İçi Yorumlar) (teknik borçla tamamlandı)
- Dashboard Config Editörü (teknik borçla tamamlandı)
- VitePress Kurulumu (teknik borçla tamamlandı)
- CLI Referansı (Otomatik Oluşturulan) (teknik borçla tamamlandı)
- Config Migration Yardımcısı (teknik borçla tamamlandı)
- Dağıtım Yapılandırması (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 7 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint50] - 2026-03-25


### Changed

- npm Publish Dry Run & Düzeltme (teknik borçla tamamlandı)
- README.md Yenileme (teknik borçla tamamlandı)
- bin Giriş Doğrulama (teknik borçla tamamlandı)
- CHANGELOG.md Güncelleme (teknik borçla tamamlandı)
- npm Publish Pipeline Doğrulama (teknik borçla tamamlandı)


_Görevler: 5 toplam, 5 tamamlanan, 5 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint48] - 2026-03-24

### Added

- Sadece Doküman Görevleri Doğrulama Atla

### Changed

- Claude MCP Backend Stub Tamamlama (teknik borçla tamamlandı)
- Sandbox Modu Zarif İşleme (teknik borçla tamamlandı)
- API Modu Kullanım Entegrasyonu (teknik borçla tamamlandı)
- Subprocess Worker Log İyileştirme (teknik borçla tamamlandı)
- Coverage Metrik Koruma (teknik borçla tamamlandı)
- Blueprint Bölüm Numaraları Güncelleme (teknik borçla tamamlandı)
- RELEASE-NOTES-BETA.md Son Güncelleme (teknik borçla tamamlandı)


_Görevler: 8 toplam, 8 tamamlanan, 7 teknik borç, 0 no-go_

## [0.2.0-beta.1-sprint47] - 2026-03-24

### Added

- Tamamlanan görev yok


_Görevler: 10 toplam, 0 tamamlanan, 0 teknik borç, 10 no-go_

## [0.2.0-beta.1-sprint46] - 2026-03-24

### Added

- Zengin Çıktı finalizeSprint'e Entegrasyonu

### Changed

- Router Sprint Yaşam Döngüsüne Entegrasyon (teknik borçla tamamlandı)
- Codex Adaptörü — Gerçek CLI Entegrasyonu (teknik borçla tamamlandı)
- Claude Adaptörü — MCP Sunucu Modu Seçeneği (teknik borçla tamamlandı)
- .deck Secret Yükleme Provider Auth'da (teknik borçla tamamlandı)
- deckent doctor'da Provider Sağlığı (teknik borçla tamamlandı)
- Ortam-Duyarlı deckent init (teknik borçla tamamlandı)
- Sprint 044 Modül Smoke Test'leri (teknik borçla tamamlandı)


_Görevler: 10 toplam, 8 tamamlanan, 7 teknik borç, 2 no-go_

## [0.1.0-sprint42] - 2026-03-23


### Changed

- npm Publish Doğrulama (teknik borçla tamamlandı)
- Global Kurulum E2E Testi (teknik borçla tamamlandı)
- Provider Adaptör Smoke Test'leri (teknik borçla tamamlandı)


_Görevler: 8 toplam, 3 tamamlanan, 3 teknik borç, 5 no-go_

## [0.2.0-beta.1] — 2026-03-23 (Stabilizasyon — Beta Hazır)

### Added
- **CHANGELOG**: Sprint 035-042 girdileri semver formatında
- **RELEASE-NOTES-BETA.md**: Özellikler, metrikler, başlangıç rehberi, bilinen sınırlamalar ve yol haritası ile beta sürüm notları
- **npm Publish Doğrulama**: `scripts/validate-publish.ts` ve `npm run validate:publish` ile otomatik yayın kontrolleri
- **E2E Test'ler**: Global kurulum akışı ve ilk sprint yolculuğu testleri (`tests/e2e/`)
- **Provider Smoke Test'leri**: Claude, Codex ve Gemini için gerçek API çağrısı olmadan adaptör smoke testleri

### Changed
- Sürüm 0.1.0'dan 0.2.0-beta.1'e yükseltildi
- Tüm açık teknik borç maddeleri kapatıldı veya DECISIONS.md'de belgelendi
- Dokümantasyon son inceleme geçişi (README, QUICKSTART, CONFIG-REFERENCE, CONTRIBUTING)

### Fixed
- Test paketi stabilize edildi: Linux/WSL'de 0 hata
- Tüm kararsız testler çözüldü (zamanlama, eşzamanlılık, platform-özel)

_Sprint 042: Stabilizasyon — Beta Hazır_

## [0.1.0-sprint041] — 2026-03-23 (İnsan-Dostu Çıktı Tamamlandı)

### Added
- **Dashboard SprintSummary**: Web dashboard için insan-dostu SprintSummary bileşeni
- **CLI Doctor İyileştirme**: Kategorize edilmiş sonuçlarla insan-dostu sağlık kontrolü çıktısı
- **RETRO İyileştirme**: Karşılaştırma metrikleri ile insan-okunabilir retrospektif formatı
- **Hata Mesajları**: Öneriler ve düzeltme ipuçları ile bağlam-duyarlı hata mesajları
- **Worker Log'ları**: Worker çalışma log'ları için insan-okunabilir ilerleme çıktısı

### Changed
- MCP tool yanıtları insan-dostu formata yeniden düzenlendi (teknik borçla)

### Fixed
- Sprint 033'ten kalan debugLog() yardımcı fonksiyonu teknik borcu çözüldü

_Görevler: 7 toplam, 7 tamamlanan, 1 teknik borç, 0 no-go | Coverage: %94.3_

## [0.1.0-sprint040] — 2026-03-23 (Worker Geri Bildirim Döngüsü + İnsan-Dostu Çıktı)

### Added
- **Worker Doğrulama Döngüsü**: Worker çalışması içinde dahili tsc ve test doğrulaması
- **Worker Geri Bildirim Metrikleri**: Worker öz-değerlendirme metrik toplama
- **İnsan-Dostu Sprint Tamamlanma**: Renkli, kategorize edilmiş sprint tamamlanma çıktısı
- **İnsan-Dostu Init Sihirbazı**: Rehberli kurulum ile etkileşimli init sihirbazı

### Changed
- CLI status çıktısı insan-dostu formata yeniden düzenlendi (teknik borçla)

### Fixed
- Worker prompt yenileme: insan-okunabilir talimatlar ve agent/skill enjeksiyon düzeltmesi

_Görevler: 13 toplam, 7 tamamlanan, 1 teknik borç, 6 no-go | Coverage: %92.1_

## [0.1.0-sprint039] — 2026-03-22 (Provider Düzeltmeleri)

### Fixed
- **Codex Adaptörü**: Codex provider adaptörü için gerçek CLI entegrasyon düzeltmesi

_Görevler: 19 toplam, 1 tamamlanan, 0 teknik borç, 18 no-go | Coverage: %95.0_

## [0.1.0-sprint038] — 2026-03-22 (Multi-Provider Altyapısı)

### Added
- **ModelType Genişletme**: 3 provider'da 8 model varyantı (Claude, Codex, Gemini)
- **Codex Adaptörü**: Kullanım takibi ile OpenAI Codex provider adaptörü
- **Gemini Adaptörü**: Kullanım takibi ile Google Gemini provider adaptörü
- **Provider-Duyarlı Model Seçimi**: model-selector.ts 3 provider'da yönlendirme
- **spawnWorkers Yönlendirme**: Provider/model atamasına göre Worker spawn yönlendirme
- **Planner Bağımsızlaştırma**: planner.ts tmux/subprocess'ten bağımsızlaştırıldı
- **tmux Bağımsızlaştırma**: tmux.ts platform soyutlama katmanı
- **Subprocess Bağımsızlaştırma**: subprocess backend soyutlama iyileştirmeleri
- **CLI Giriş Noktası Düzeltmesi**: buildProgram() + entry.ts ile yan etkisiz giriş noktası
- **Platform Destek Matrisi**: macOS/Linux/WSL2 destek matrisi belgelendi
- **bootstrapProviders()**: Provider tespiti ve kayıt için tek başlangıç noktası

### Changed
- ModelType enum'u Codex ve Gemini model varyantlarıyla genişletildi
- ProviderRegistry dinamik provider kaydını destekliyor
- Config provider başına API anahtarı ve endpoint yapılandırmasını destekliyor

_Görevler: 20 toplam, 20 tamamlanan, 0 teknik borç, 0 no-go — +476 test (8073 → 8555)_

## [0.1.0-sprint037] — 2026-03-22 (Güvenlik, Performans, Plugin Sistemi)

### Added
- **Zamanlama-Güvenli Auth**: Kimlik doğrulama token'ları için sabit zamanlı karşılaştırma (SHA-256 hash)
- **Kimlik Bilgisi Maskeleme**: Log'lardan API anahtarları, Bearer token'ları ve URL parolalarının otomatik maskelenmesi
- **Skill Sandbox AST**: eval/Function/child_process tespiti için TypeScript compiler API ikinci geçiş
- **DIRECTIVES Doğrulama**: Görev oluşturmadan önce Zod şema doğrulaması (DirectiveSchema + DirectiveTaskSchema)
- **Plugin Sistemi**: Tam kurulum yaşam döngüsü (npm/git/local + geri alma), çalışma zamanı hook'ları (beforeSprint/afterTask/afterSprint)
- **PROJECT-IDENTITY.md**: Kalıcı proje kimlik dosyası, asla decay edilmez, her sprint güncellenir
- **finalizeSprint()**: Ayrılmış sprint sonlandırma fonksiyonu + `deckent finalize` CLI komutu
- **Config Mod Takma Adları**: performance/balanced/economic/unlimited kanonik mod adlarına eşlendi

### Changed
- Bellek bütçesi 300'den 600 satıra artırıldı
- Decay eşiği 3'ten 5 sprint'e uzatıldı
- RETRO maksimum satır 60'tan 100'e artırıldı
- Sprint log maksimum satır 50'den 80'e artırıldı
- Agent havuzu LRU eviction kullanıyor (maks 50 geçici, 5 sprint yaşı) toplu okuma ile

_Görevler: 16 toplam, 16 tamamlanan, 0 teknik borç, 0 no-go — +258 test (7815 → 8073)_

## [0.1.0-sprint036] — 2026-03-22 (Mimari Temizlik)

### Added
- **sprint-controller.ts**: brain.ts'den çıkarılan sprint yaşam döngüsü yönetimi
- **result-evaluator.ts**: brain.ts'den çıkarılan görev sonuç değerlendirme mantığı
- **Kullanım yöneticisi modülü**: brain.ts'den çıkarılan kullanım takibi ve bütçe yönetimi *(Sprint 089'da kaldırıldı)*
- **Tip Modülleri**: types.ts → task-types, config-types, monitoring-types, sprint-types + barrel olarak bölündü

### Changed
- **brain.ts God Object Split**: 1312 → 58 satır, artık geriye uyumlu saf re-export katmanı
- **spawn-backend.ts**: core/'dan orchestra/'ya taşındı (katman ihlali düzeltmesi)
- **Non-null Assertions**: 29 dosyada 48 `!` operatörü guard clause, `.at()` ve `?? fallback` ile değiştirildi
- **Type Cast'ler**: Enum literal'leri (`TaskStatus.DONE`) ve type guard'lar ile değiştirildi
- **Barrel Temizlik**: orchestra/index.ts 30+ export'tan 22 public API export'a indirildi, @internal JSDoc ile
- **Auditor Kuyruk**: shift() O(n) → azalan sıralama + pop() O(1) ile değiştirildi
- **PromptAnalytics**: prompt-metrics + prompt-ab-test tek sınıfta birleştirildi

_Görevler: 11 toplam, 11 tamamlanan, 0 teknik borç, 0 no-go — +315 test_

## [0.1.0-sprint035] — 2026-03-22 (Beta Temizlik Dalgası 1+2)

### Added
- **readJsonSafeAsync()**: Bloklamayan JSON dosya okumaları için readJsonSafe'in asenkron varyantı
- **Yardımcı Fonksiyon Çıkarma**: readFileIfExists, listFilesWithExtension, safeMapGet → utils.ts'ye taşındı
- **Hata Kayıt Defteri Genişleme**: Düzeltme önerileri ile E039-E053 hata kodları

### Changed
- **readJsonSafe Göçü**: 13 satır içi JSON.parse çağrısı readJsonSafe() ile değiştirildi
- **Hata Yönetimi Birleştirme**: 11 genel throw ifadesi DeckentError + ErrorRegistry ile değiştirildi
- **Sessiz Catch Loglama**: 8 catch bloğunda DECKENT_DEBUG env kapısı ile debugLog() yardımcısı
- **parseBody Tip Güvenliği**: 5 Zod şeması (Start/Plan/Directives/Config/Kill) + parseBodyWithSchema()
- **EventEmitter Düzeltme**: setMaxListeners(0) ile ayrılmış _ipcEmitter, process EventEmitter kullanımı kaldırıldı

### Fixed
- **tmux Worker Çökme Kurtarma**: Çöken tmux worker'ları için agent tabanlı subprocess fallback

_Sprint 035: Beta Temizlik Dalgası 1+2_

## [0.1.0-sprint33] - 2026-03-22

### Added

- CHANGELOG Sürüm Formatı
- SECURITY.md Konumu
- PR Şablonu Deckent-Özel
- FUNDING.yml Güncelleme
- Yardımcı Fonksiyon Çıkarma

### Changed

- EventEmitter MaxListeners Düzeltmesi (teknik borçla tamamlandı)
- Onboard Test Timeout Düzeltmesi (teknik borçla tamamlandı)
- README Badge Güncelleme (teknik borçla tamamlandı)
- Dosya Uzantısı Sabit Kullanımı (teknik borçla tamamlandı)
- Sprint Gözlem Dokümanları Arşivleme (teknik borçla tamamlandı)
- CI Coverage Kapısı (teknik borçla tamamlandı)
- parseBody Tip Güvenliği (teknik borçla tamamlandı)

### Fixed

- CI Workflow Test Düzeltmesi — publish
- CI Workflow Test Düzeltmesi — release


_Görevler: 17 toplam, 14 tamamlanan, 7 teknik borç, 3 no-go_

## [0.1.0-sprint33] — 2026-03-22 (Entegrasyon + Marketplace + Analitik)

### Added
- **Entegrasyon Testleri**: Tam agent+skill E2E, TypeScript/React projesi, Python/FastAPI projesi, monorepo, hata kurtarma
- **Skill Marketplace**: Kayıt istemcisi (arama/detay/yayın), CLI arama+yayın, derecelendirme sistemi, bağımlılık çözücü, marketplace auth
- **Gelişmiş Adaptif Agent**: Sprint arası analizci, uzmanlık sapma tespiti, agent emeklilik, prompt evrim logu, agent soy ağacı
- **Analitik Verisi**: Sprint analitikleri, kullanım grafikleri, başarı çizelgeleri, agent karşılaştırması, skill ısı haritası verisi
- **Performans**: Agent seçim cache'i (LRU 100), skill yükleme cache'i (500KB), token sayacı, tembel yükleyici, toplu istatistikler
- **Güvenlik**: Skill sandbox (şüpheli skill'leri karantinaya al), izin koruması (agent kendini değiştirmeyi engelle)
- **Dokümantasyon**: AGENT-GUIDE.md, MARKETPLACE-GUIDE.md

### Changed
- package.json: +4 anahtar kelime (agents, skills, marketplace, analytics)

## [0.1.0-sprint32] — 2026-03-22 (UX İyileştirme)

### Added
- **İlerleme Sistemi**: Canlı ilerleme çubuğu, ETA hesaplayıcı (ağırlıklı ortalama), worker durum takipçisi, kuyruk görüntüleme, terminal genişlik adaptasyonu
- **Zengin Sprint Özeti**: Kategorize dosya değişiklikleri, agent performans tablosu, öneri motoru (maks 5), delta ile sprint karşılaştırması
- **Bildirim Sistemi**: Terminal zili, webhook (POST+yeniden deneme), Discord embed'leri (renk-kodlu), Slack Block Kit
- **Etkileşimli İnceleme**: `deckent review` komutu — görev başına onayla/reddet/yeniden dene, --auto modu, inceleme raporları
- **Seçici Yeniden Deneme**: Başarısız görevleri sonraki sprint'e kuyruğa al, yeniden deneme direktifleri oluştur
- **Tema Sistemi**: Tutarlı renkler (success/error/warning/info/muted/accent), NO_COLOR/FORCE_COLOR desteği
- **Çıktı Modları**: --quiet (sadece hatalar), --verbose (debug), --normal (varsayılan)
- **İlerleme Kalıcılığı**: Yeniden bağlantı için ilerleme durumunu kaydet/yükle

### Changed
- Dashboard: skills sütunu eklendi, agent görünürlüğü iyileştirildi
- Status komutu: agent/skill atama bölümleri, --verbose flag'i
- Retro komutu: zengin format varsayılan, --raw orijinal için, --compare delta için
- History komutu: --agent ve --skill filtreleri
- MCP status: yanıtta agentAssignments + skillAssignments
- types.ts: DeckentConfig üzerinde bildirimler yapılandırması

## [0.1.0-sprint31] — 2026-03-22 (Brain Karar Motoru)

### Added
- **Karar Motoru**: 6 adımlı pipeline (analiz → agent → skill → model → effort → scope)
- **Görev Analizci**: Görev tipi çıkarımı (code/test/doc/security/refactor/devops/config), karmaşıklık puanlama
- **Karar Kaydedici**: Hata ayıklama ve tekrar için kararları .tasks/decisions/'a kaydet
- **Karar Tekrarı**: Aynı girdilerle kararları yeniden çalıştır, fark karşılaştırması
- **Öğrenme Döngüsü**: PatternRecorder/PatternReader — sprint başına agent+skill+model değerlendirmelerini kaydet
- **Kombinasyon Puanlayıcı**: Tarihsel kombinasyonları puanla (başarı*2 - başarısız*3 - güncellik cezası)
- **Öğrenme Decay**: Eski öğrenme verisini kaldır, özete sıkıştır
- **Öğrenme Göçü**: PATTERNS.md'yi öğrenme formatına dönüştür, dışa/içe aktar
- **Paralel Pipeline**: Bağımlılık-duyarlı çalıştırma dalgalarına topolojik sıralama
- **Paylaşımlı Bellek**: TTL ile worker'lar arası anahtar-değer iletişimi
- **Çakışma Çözücü**: Aynı dosyaya yazma/kapsam çakışması tespiti, çözüm stratejileri
- **Sonuç Birleştirici**: Worker sonuçlarını birleştir (tekrar kaldırma, ağırlıklı coverage)
- **Devir Protokolü**: Bağımlı görevler arasında artifact devri
- **Adaptif Agent**: Prompt etkinlik analizi, iyileştirme önerileri
- **Prompt A/B Testi**: Prompt varyantlarını karşılaştır (min 4 örnek, 50/50 bölme)
- **Prompt Versiyonlama**: Etkinleştir/budama ile maks 10 versiyon
- **Prompt Geri Alma**: Kötü prompt'ları otomatik geri al (3 kullanım sonrası <%50 başarı)
- **Prompt Metrikleri**: Performans dashboard'u (trend, en iyi/kötü versiyon)
- **Brain Bağlamı**: Planlama için stack/agent/skill/history zenginleştirmesi
- **Karar Yapılandırması**: DecisionEngineConfig, LearningConfig, CollaborationConfig

### Changed
- types.ts: DeckentConfig üzerinde decision_engine, learning, collaboration yapılandırma alanları
## [0.1.0-sprint30] - 2026-03-21

### Added

- **Fix debt: 027-003 teknik borcu**: Doğrulama raporu tmp-test/rollback-verify'a yazıldı: DONE
- **Fix debt: 027-004 teknik borcu**: Kapsamlı doğrulama raporu tmp-test/ip'ye yazıldı: DONE
- **Subprocess Backend Doğrulama**: GO_WITH_TECH_DEBT
- **tmux'suz Doğrulama**: GO_WITH_TECH_DEBT
- **Provider Soyutlama Analizi**: GO_WITH_TECH_DEBT
- **Sprint 27 Özellik Özeti**: GO_WITH_TECH_DEBT
- **Görevler**: 6 toplam, 6 tamamlanan, 4 teknik borç, 0 no-go
## [0.1.0-sprint30] — 2026-03-22 (Skill Sistemi)

### Added
- **Skill Tip Sistemi**: SkillDefinition, ProjectStack, SkillSelectionResult, SkillCategory tipleri
- **Skill Havuz Yöneticisi**: .deckent/skills/'dan yükleme, kaydetme, doğrulama, istatistik takibi
- **Stack Dedektör**: Cache ile proje teknolojisi otomatik tespiti (TypeScript/React/Python/Rust/Go/Docker)
- **Skill Seçici**: Çok faktörlü puanlama (stack+anahtar kelime+agent), kompozisyon çözücü, maks 3 skill
- **Skill Kayıt Defteri**: Gelecekteki marketplace için yerel skill indeksi temeli
- **10 Yerleşik Skill**: typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- **CLI Komutları**: `deckent skill list`, `deckent skill create`, `deckent skill install`
- **Skill Dokümantasyonu**: docs/SKILLS.md

### Changed
- brain.ts planSprint (artık async): proje stack'ini otomatik tespit, görev başına skill seçimi
- task-builder.ts buildWorkerPrompt: SKILL.md içeriğini enjekte eder (1500 karakter/skill, 4000 toplam limit)
- model-selector.ts: Katman 4d skill model tercihi (skill'ler arasında en yüksek kazanır)
- sprint-reporter.ts: RETRO.md'de skill performans tablosu
- config.ts: skills yapılandırması (enabled, maxPerTask, autoDetectStack, preferredSkills)
- types.ts: Task üzerinde assignedSkills, TaskResult üzerinde skillIds, DeckentConfig üzerinde SkillConfig

## [0.1.0-sprint29] — 2026-03-22 (Agent Havuzu Çekirdeği)

### Added
- **Agent Tip Sistemi**: AgentDefinition arayüzü, AgentPool, AgentSelectionResult tipleri
- **Agent Havuz Yöneticisi**: Yükleme, kaydetme, doğrulama, istatistik takibi, geçici agent yaşam döngüsü
- **Agent Seçici**: Anahtar kelime+kapsam puanlama algoritması, eşik filtreleme, başarı oranına göre beraberlik çözme
- **8 Yerleşik Agent**: security-auditor (opus), test-writer (sonnet), doc-writer (sonnet), code-reviewer (opus, salt okunur), refactorer (sonnet), bug-fixer (opus, 1.5x effort), api-builder (sonnet), performance-analyzer (opus)
- **Paylaşımlı Bağlam**: .tasks/shared-context.json ile agent'lar arası iletişim (atomik yazma)
- **Çoklu Agent Pipeline**: Paylaşımlı bağlam yayılımı ile sıralı agent çalıştırma
- **CLI Komutları**: `deckent agent list`, `deckent agent create`, `deckent agent enable/disable`
- **Agent Dokümantasyonu**: 8 bölümlü docs/AGENTS.md

### Changed
- brain.ts planSprint: anahtar kelimeler ve kapsama göre görev başına uzman agent otomatik seçimi
- task-builder.ts buildWorkerPrompt: görev içeriğinden önce agent PROMPT.md'yi enjekte eder (2000 karakter limiti)
- worker.ts: heartbeat ve sonuç dosyalarında agent ID dahil
- sprint-reporter.ts: RETRO.md'de agent performans tablosu
- Dashboard: renk kodlu agent sütunu (cyan=uzman, dim=genel)
- types.ts: Task üzerinde assignedAgent, TaskResult/Heartbeat/AgentInfo üzerinde agentId
## [0.1.0-sprint28] — 2026-03-21 (npm Yayın Hazırlığı)

### Added
- **Hata Kayıt Defteri**: 10 hata kodu ve düzeltme önerileri ile DeckentError sınıfı + ErrorRegistry
- **Telemetri Altyapısı**: TelemetryCollector (isteğe bağlı, PII temizleme, GDPR-uyumlu)
- **TUI Sihirbaz Çatısı**: Etkileşimli CLI için WizardStep arayüzü (select/input/confirm)
- **Hata İşleyici**: Renkli çıktı ve önerilerle merkezi CLI hata yönetimi
- **Sürüm Bilgisi**: Node.js, OS, tmux, claude durumu ile geliştirilmiş `--version` + `--version-json`
- **Yayın Betikleri**: prepublish.ts, build-verify.ts, pack-test.ts, publish.ts
- **.npmignore**: npm paketinden .brain/, .tasks/, .locks/, tests/, src/ hariç tutar
- **SECURITY.md**: Güvenlik açığı raporlama süreci ile güvenlik politikası
- **RELEASE-CHECKLIST.md**: 11 adımlı yayın kontrol listesi
- **Açılış Sayfası İçeriği**: deckent.agency için pazarlama içeriği

### Changed
- **onboard komutu**: Stub yerine etkileşimli sihirbaz (Claude tespiti, sistem profili, yapılandırma önerisi)
- **upgrade komutu**: Stub yerine gerçek npm güncelleme (sürüm kontrolü, --check flag'i)
- **README.md**: Badge'ler, karşılaştırma tablosu, mimari diyagramı ile tam yeniden yazım
- **CONTRIBUTING.md**: Geliştirici rehberleri ile güncelleme (CLI komutu ekle, MCP tool ekle)
- **docs/QUICKSTART.md, API.md, CONFIG-REFERENCE.md**: curl örnekleri ile iyileştirme
- **doctor.ts**: Platform-özel kurulum önerileri ile geliştirilmiş hata mesajları
- **Changelog güncelleyici**: Keep a Changelog formatı (Added/Changed/Fixed kategorileri)
- **Doctor çıktısı**: Renklerle trafik ışığı formatı [PASS]/[FAIL]/[WARN]

### Fixed
- brain.test.ts changelog format beklentileri Keep a Changelog için güncellendi
- Doctor test beklentileri [PASS]/[FAIL] formatı için güncellendi
- Onboard testi gerçek uygulama çıktısı için güncellendi

## [0.1.0-sprint27] — 2026-03-21 (Teknik Boşluk Kapama)

### Added
- **Provider Soyutlama**: ProviderAdapter arayüzü, ProviderRegistry singleton, ClaudeAdapter
- **SpawnBackend Soyutlama**: TmuxBackend, SubprocessBackend, SpawnBackendFactory (yapılandırma-güdümlü)
- **Subprocess Backend**: child_process.spawn ile worker'lar — tmux artık gerekli değil
- **Kullanım Takibi**: Sprint tabanlı JSON depolama ile kullanım takip sınıfı *(Sprint 089'da kaldırıldı)*
- **Coverage Doğrulama**: %5 eşik ile parseCoverageFromVitest, validateCoverage
- **Geri Alma Mekanizması**: Git güvenlik noktaları (deckent-backup-{sprintId}), tüm NO_GO'larda otomatik geri alma
- **Worker IPC**: process.send tabanlı iletişim için WorkerChannel + ChannelRegistry
- **Sıfır-Yapılandırma Modu**: `deckent start "açıklama"` — tek satır doğal dil sprint'i
- **Sandbox Temeli**: Bellek limitleri ve kapsam zorlama ile SandboxSpawnBackend
- **Global Config**: Proje birleştirmesi ile ~/.deckent/config.json (proje öncelikli)
- **Kimlik Bilgisi Yönetimi**: ~/.deckent/credentials/'da güvenli anahtar depolama (0600 izinleri)
- 13 yeni kaynak modül, 167 yeni test (3442 → 3609)

### Changed
- brain.ts config.spawn_backend'i okur ve SpawnBackendFactory.create() kullanır
- evaluateResult coverage doğrulamasını entegre eder (doküman görevleri atlar)
- spawnWorkers SpawnBackend soyutlamasını destekler (geriye uyumlu)
- tmux artık isteğe bağlı — tmux olmayan ortamlar için subprocess backend mevcut

### Fixed
- brain-ipc.test.ts kanal kaydında görev ID uyumsuzluğu
- brain-usage.test.ts OOM — ağır runSprint entegrasyonu kaldırıldı, birim testleri korundu
- spawn-backend.ts'de ESM require() → doğrudan import (TmuxBackend + SubprocessBackend)
## [0.1.0-sprint26] - 2026-03-20

### Added

- **readJsonSafe Import Göçü Tamamlama**: GO_WITH_TECH_DEBT
- **package.json files + keywords Tamamlama**: GO_WITH_TECH_DEBT
- **CODEOWNERS İyileştirme**: DONE
- **dependabot.yml İyileştirme**: DONE
- **Release Workflow İyileştirme**: DONE
- **Security Template + FUNDING.yml İyileştirme**: DONE
- **debt-manager.test.ts Test Tamamlama**: DONE
- **task-builder.test.ts Test Tamamlama**: GO_WITH_TECH_DEBT
- **CLI init.test.ts Test Tamamlama**: DONE
- **CLI archive-debt.test.ts Test Tamamlama**: DONE
- **Görevler**: 35 toplam, 35 tamamlanan, 16 teknik borç, 0 no-go
## [0.1.0-sprint25] - 2026-03-20

### Added

- **readJsonSafe/readFileSafe Paylaşımlı Yardımcı**: DONE
- **result-watcher pendingResolve Zamanlayıcı Düzeltmesi**: DONE
- **package.json files Alanı Düzeltme**: GO_WITH_TECH_DEBT
- **CODEOWNERS Dosyası**: GO_WITH_TECH_DEBT
- **dependabot.yml**: GO_WITH_TECH_DEBT
- **GitHub Actions Release Workflow**: GO_WITH_TECH_DEBT
- **Security Issue Şablonu**: GO_WITH_TECH_DEBT
- **FUNDING.yml**: GO_WITH_TECH_DEBT
- **brain.ts readJsonSafe Import Göçü**: GO_WITH_TECH_DEBT
- **debt-manager.ts readJsonSafe Import Göçü**: GO_WITH_TECH_DEBT
- **Görevler**: 97 toplam, 62 tamamlanan, 32 teknik borç, 35 no-go
## [0.1.0-sprint23] - 2026-03-18

### Fixed

- **AI planner post-validation fallback**: AI planner eksik görev döndürürse (`plannerResult.tasks.length < directiveTaskCount`) structured fallback'e düşüyor — ilk kez 12/12 görev planlandı
- **CI hardcoded path fix**: `tools-enrichment-batch2.test.ts` absolute path → `__dirname` bazlı relative path

### Added

- 12 task (12 tamamlanan, 4 teknik borç, 0 no-go) — ilk 12-görevli sprint, task queue wave mekanizması doğrulandı
- 11 doğrulama dokümanı (`tmp-test/`): Sprint 22 özelliklerinin kapsamlı validasyonu
- +30 test (1392→1422), 55 test dosyası
- Planning mode: `fallback` (AI yetersiz → structured fallback)

## [0.1.0-sprint22] - 2026-03-18

### Fixed

- **runDecay DEBT.md resolved retention**: `shouldRemoveResolvedDebt()` + `parseSprintNumber()` — resolved entry'ler 3 sprint boyunca korunuyor (DEBT-002 artık decay'de silinmiyor)

### Added

- **Auto Setup Wizard** (`src/cli/auto-setup.ts`): `generateSetupRecommendation()` — subscription, sistem profili ve proje boyutuna göre otomatik yapılandırma önerisi
- **MCP Enrichment** (10/10 tool): `enrichResponse()` altyapısı (`src/mcp/helpers/enrich.ts`) — tüm tool response'larına `_enriched: { summary, hints, timestamp }` ekleniyor
- **CLI Hints System** (`src/cli/helpers/hints.ts`, `messages.ts`): `getContextualHints()` faz bazlı öneriler, `getMessage()` lokalize mesajlar (tr/en)
- **doctor --profile**: Sistem profili gösterimi (CPU, RAM, recommended workers, subscription)
- `SetupRecommendation` interface (`types.ts`)
- +132 test (1260→1392), 0 regresyon

## [0.1.0-sprint21] - 2026-03-18

### Added

- **System Profile** (`src/core/system-profile.ts`): `getSystemProfile()` — CPU, RAM, recommended workers tespiti
- **Subscription Detection** (`src/core/subscription.ts`): `detectSubscription()` — Claude plan tespiti (max_20x/max_5x/pro/api/unknown)
- **Layered Model Selection** (`src/orchestra/brain.ts`): `resolveTaskModel()` — scope, complexity, plan, usage'a göre katmanlı model seçimi (opus/sonnet/haiku)
- **Auto Workers**: `resolveEffectiveWorkers()` — config "auto" ise sistem profiline göre worker sayısı
- **deckent test** CLI: `npx vitest run` wrapper
- **deckent run** CLI: Arbitrary komut çalıştırma
- **Planner task queue fix**: `planSprint` artık max_workers'dan bağımsız tüm görevleri planlıyor (spawnWorkers parallelism sınırını uygular)
- +137 test (1123→1260), 28 CLI komut, 0 regresyon

## [0.1.0-sprint20] - 2026-03-18

### Added

- **Fix validation sprint**: Sprint 18'de keşfedilen 6 bug'ın 3'ü doğrulandı
  - Heartbeat timestamp: PASSED (0 stale alert)
  - Dashboard progress: PASSED (done counter doğru)
  - Alert dedup: PASSED (0 duplicate alert)
  - Task queue: FAILED (planner hala max_workers ile sınırlı — Sprint 21'de düzeltildi)
  - Doc task criteria: PARTIAL
  - Model inference: doğrulanamadı
- 6 analiz dokümanı (`tmp-test/`): sistematik fix doğrulama
- 8/14 görev planlandı ve çalıştırıldı (113s)
- 1027 test (doğrulama sprint'i — yeni test yok), 0 regresyon

## [0.1.0-sprint19] - 2026-03-18

### Fixed

- **Heartbeat timestamp**: Worker heartbeat'te doğru UTC zaman damgası — stale agent false positive düzeltildi
- **Dashboard progress**: Done counter `.result` dosyaları oluşunca güncelleniyor (EVALUATE fazını beklemiyor)
- **Alert deduplication**: Aynı alert aynı scan döngüsünde tekrarlanmıyor
- **inferModelFromDirective**: Opus aşırı atama düzeltildi
- **Doc task criteria**: `isDocTask()` — doc scope'ları için coverage check atlanıyor
- **Auto doc update**: `updateProjectDocs()` — sprint sonrası doc dosyaları otomatik güncelleniyor

### Added

- Sprint 18'de keşfedilen 6 bug'ın tamamı ele alındı (6 DONE + 2 GO_WITH_TECH_DEBT)
- +96 test (1027→1123), +1555 satır kaynak kodu, 0 regresyon

## [0.1.0-sprint18] - 2026-03-18

### Added

- **Orkestrasyon smoke testi**: Sprint 10'dan bu yana ilk gerçek `runSprint` çalıştırma — 10 paralel doküman görevi planlandı, 8 çalıştırıldı
- **8 dokümantasyon dosyası** (~135 KB toplam): GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- **Sprint gözlem raporu**: `docs/SPRINT-18-OBSERVATION.md` — detaylı faz-faz orkestrasyon analizi
- **6 hata keşfedildi**: planner max_workers görev limiti, heartbeat zaman damgası kayması, dashboard ilerleme gecikmesi, alert tekrar kaldırma eksik, doküman görevi coverage kriteri, DEBT.md boş tablo testi
- **Uçtan uca doğrulama**: PLAN → SPAWN → EXECUTE → EVALUATE → RETRO → CLEANUP 8 paralel sonnet worker ile 260 saniyede tamamlandı
- **Test paketi**: 1027 test (0 yeni — sadece doküman sprint'i), %97.5 coverage, 0 regresyon

## [0.1.0-sprint17] - 2026-03-18

### Added

- **MCP arka plan işleri**: `deckent_start` `jobId` ile hemen döner, sprint `child_process.fork()` ile arka planda çalışır — MCP timeout yok
- **`.deckent/jobs/{jobId}.json`**: İş durumu takibi (RUNNING/COMPLETE/FAILED)
- **`deckent_status`** artık aktif iş durumunu içerir
- **cleanup() düzeltme**: Tüm görev dosya uzantılarını kapsar (.json, .plan, .hb, .result, .paused, .log), sprint ön ek koruması, eski dosya tespiti (24s)
- **Sprint ID güvenliği**: `.deckent/config.json`'da `last_sprint_id`, config vs dosya tarama maksimumu — asla gerilemez
- **Dashboard sıfırlama**: PLAN fazında taze `DashboardState`, sprint ID uyumsuzluğu auditor'da sıfırlama tetikler
- **React test altyapısı**: `src/dashboard/vitest.config.ts` (happy-dom), AgentDetail + DashboardPage testleri
- **`test:dashboard`** npm betiği: `vitest run --config src/dashboard/vitest.config.ts`
- **Test paketi**: 1027 test (+40 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint16] - 2026-03-18

### Added

- **`deckent watch`** CLI komutu: Dashboard ve worker panelleri ile canlı tmux bölünmüş görünüm, `--follow <taskId>` flag'i
- **Worker log yakalama**: tmux pipe-pane worker stdout'unu `.tasks/task-{id}.log`'a yakalar
- **`deckent start --watch`**: Sprint çalışmadan önce izleme penceresi oluşturur (bloklamayan)
- **`readWorkerLog()`** (`src/agents/worker.ts`): Worker log dosyalarını okuma yardımcısı
- **GET `/api/worker/:taskId/log`**: Görev JSON + worker log içeriği döndüren API endpoint
- **`AgentDetail`** bileşeni: 3 saniye yoklama ile React bileşeni, Sheet panelinde gösterilir
- **`inferModelFromDirective()`** (`src/orchestra/brain.ts`): Yapısal planlayıcı modu için sezgisel model seçimi
- **`setupWatchWindow()`** (`src/orchestra/tmux.ts`): Bloklamayan izleme düzeni oluşturma
- **.brain/ dogfooding**: sprint-015.md log, ADR-013, MEMORY.md Sprint 15 öğrenmeleri
- **Test paketi**: 987 test (+20 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint15] - 2026-03-18

### Added

- **DECKENT.md** — Agent yapılandırması için tek doğruluk kaynağı (AGENTS.md+CLAUDE.md symlink kalıbını değiştirir)
- **`ensureDeckentImport()`** (`src/core/utils.ts`): Eklemeli @DECKENT.md enjeksiyonu için paylaşımlı yardımcı — mevcut içeriği asla üzerine yazmaz
- **`DECKENT_FILE` sabiti** (`src/core/constants.ts`)
- **Init eklemeli enjeksiyon**: `deckent init` artık CLAUDE.md'yi üzerine yazmaz — bunun yerine `ensureDeckentImport()` kullanır
- **Config birleştirme**: Yeniden başlatma sırasında mevcut `.deckent/config.json` alanları korunur
- **Blueprint-kalitesinde kural şablonları**: brain.md (13 kural + frontmatter), auditor.md (9 kural), worker-default.md (9 kural)
- **`deckent sync`** CLI komutu: Adaptör dosyalarını (CLAUDE.md, AGENTS.md) DECKENT.md referansı ile senkronize et
- **`deckent_sync`** MCP aracı (10. araç): MCP üzerinden aynı işlevsellik
- **`deckent://config`** MCP kaynağı (5. kaynak): MCP üzerinden proje yapılandırmasını oku
- **Kendi kendini barındırma**: deckent-dev artık kendi `.deckent/` yapısını çalıştırıyor (config, workspace, i18n, plugins)
- **DEBT-002 kapatıldı**: Kullanım kontrolü sprint-003'te çözüldü, Sprint 089'da kaldırıldı
- **Test paketi**: 967 test (+29 yeni), %97.5 coverage, 0 regresyon

## [0.1.0-sprint12-13] - 2026-03-18

### Added

- **Brain AI Planlama** (`src/orchestra/planner.ts`): Zod şema doğrulaması ile AI görev planlaması, 3 planlama modu (ai/structured/auto)
- **BrainPlanningMode**: PlanModeConfig'de `'ai' | 'structured' | 'auto'` yapılandırma alanı
- **DRAFT görev durumu**: `confirmDraftTasks()` spawn'dan önce DRAFT → PENDING geçişi yapar
- **Süreç-içi Auditor**: `startScanLoop()` Brain'in `runSprint` içinde çalışır (Faz 2.5), ayrı tmux penceresi değil
- **`writeScanToDashboard()`**: Tarama sonuçlarını dashboard durumuna birleştirir (alertler, agent durumları)
- **Worker heartbeat prompt'u**: `buildWorkerPrompt` .hb dosya oluşturma/güncelleme talimatlarını içerir
- **.deckent/ yapısı**: TOOLS.md, BOOT.md, plugins/, i18n/ init tarafından oluşturulur
- **Test paketi**: 938 test, %97.5 coverage

## [0.1.0-sprint11] - 2026-03-18

### Added

- **Web Dashboard** (`src/dashboard/`): React+Vite+Tailwind, shadcn/ui bileşenleri
- **4 sayfa**: DashboardPage, SettingsPage, HistoryPage, MemoryPage
- **14 UI bileşeni**: button, card, tabs, select, input, label, separator, sheet, scroll-area, badge, table, textarea, dialog, progress
- **6 ana bileşen**: Layout, DebtTable, ThemeProvider, NewSprintModal, SprintChart, SimpleMarkdown
- **SSE entegrasyonu**: `useSSE` hook, gerçek zamanlı dashboard güncellemeleri
- **`deckent web`**: localhost:3100'de HTTP API + web dashboard başlatır
- **Koyu/açık tema**, hamburger menü ile mobil uyumlu
- **Test paketi**: 852 test, %97 coverage

## [0.1.0-sprint10] - 2026-03-17

### Added

- **HTTP API** (`src/api/server.ts`): 15 endpoint + SSE akışı
- **Route'lar**: GET status/sprint/history/config/doctor/memory/debt/job/events, POST start/plan/kill/set-directives/config
- **Dashboard gözlemcisi** (`src/api/watcher.ts`): SSE için debounce ile dosya gözlemcisi
- **Terminal dashboard** (`deckent dashboard`): Unicode kutu çizimi ile zengin TUI
- **`deckent serve`**: Bağımsız HTTP API sunucusu
- **Sprint ID yeniden düzenleme**: Kod tabanı genelinde tutarlı format
- **Test paketi**: 799 test, %95 coverage

## [0.1.0-sprint9] - 2026-03-17

### Added

- **Analizci** (`src/core/analyzer.ts`): Proje stack, boyut, metodoloji tespiti
- **9. MCP aracı**: `deckent_analyze_project` — projeyi analiz eder ve öneriler döndürür
- **CI pipeline**: GitHub Actions workflow
- **Dinamik sürüm**: Çalışma zamanında package.json'dan okur
- **`deckent archive-debt`**: Çözülmüş teknik borçları arşivle
- **Zenginleştirilmiş sprint geçmişi**: Sprint log görüntülemede metrikler
- **Test paketi**: 720 test, %95 coverage

## [0.1.0-sprint8] - 2026-03-17

### Added

- **CONTRIBUTING.md**: Tam katkı rehberi (kurulum, standartlar, test, PR süreci)
- **docs/API.md**: Kapsamlı programatik API referansı (1491 satır)
- **docs/ARCHITECTURE.md**: Yoğunlaştırılmış mimari genel bakış
- **docs/ROADMAP.md**: Faz tabanlı yol haritası
- **MCP dogfooding**: Geliştirme sırasında Deckent'in kendi MCP araçları kullanıldı
- **Test paketi**: 669 test, %95 coverage

## [0.1.0-sprint7] - 2026-03-17

### Added

- **MCP Sunucusu** (`src/mcp/`): 8 araç + 4 kaynak, stdio taşıma
- **Sürtünmesiz entegrasyon**: .claude/settings.json'da otomatik kayıt
- **Test paketi**: 669 test, %95 coverage, 24 yeni MCP testi

## [0.1.0-sprint6] - 2026-03-16

### Added

- **İlk dogfooding**: Deckent kendi üzerinde `deckent start` çalıştırdı
- 1 worker ile 86 saniyede README.md oluşturuldu
- Uçtan uca orkestrasyon döngüsü kanıtlandı
- **Test paketi**: 645 test, %95 coverage

## [0.1.0-sprint5] - 2026-03-16

### Added

- **Bellek decay**: >300 satır olduğunda .brain/ otomatik sıkıştır
- **Doctor kontrolleri**: Ön uçuş doğrulaması için `runDoctorChecks()`
- **`deckent start --dry-run`**: Worker spawn etmeden görevleri planla
- **`deckent status --watch`**: Her 2 saniyede otomatik yenileme
- **Barrel hariç tutma**: index.ts dosyaları coverage'dan hariç
- **Test paketi**: 644 test, %94.83 coverage

## [0.1.0-sprint4] - 2026-03-16

### Added

- **Borç çözüm yaşam döngüsü**: `resolveDebt()`, eski borç temizliği
- **Test paketi**: 617 test, %93 coverage

## [0.1.0-sprint3] - 2026-03-16

### Fixed

- **haiku_allowed**: Semantik düzeltme (true = haiku düşürme seçeneği olarak izinli)
- **Kullanım yüzdesi regex**: Kullanım yüzdesi ayrıştırma düzeltildi *(Sprint 089'da kaldırıldı)*

### Added

- **Test paketi**: 540 test, %92 coverage

## [0.1.0-sprint2] - 2026-03-16

### Changed

- **Async göçü**: `sleepSync(Atomics.wait)` → `async sleep(setTimeout)`
- Brain artık sprint yaşam döngüsü boyunca tamamen async

### Added

- **Test paketi**: 480 test, %91 coverage

## [0.1.0-wave4] - 2026-03-16

### Added

- **CLI Module** (`src/cli/`): 17 komut, 16 komut dosyası, 3 helper — `deckent` CLI arayüzü
- **Entry point** (`src/cli/index.ts`): Shebang + Commander program, 16 register fonksiyonu
- **Init wizard** (`src/cli/commands/init.ts`): Interactive setup — plan seçimi, dil, proje adı, dizin yapısı oluşturma, .gitignore duplicate kontrolü
- **Doctor** (`src/cli/commands/doctor.ts`): Node.js, git, tmux, Claude CLI sağlık kontrolü
- **Terminal dashboard** (`src/cli/commands/status.ts`): Unicode box-drawing ile ASCII dashboard render
- **Sprint commands**: `start` (runSprint + --auto-approve + --sandbox stub), `plan` (plan-only mode), `cleanup`, `retro`
- **Agent commands**: `attach` (tmux), `spawn` (manual worker), `kill` (worker kill)
- **Config commands**: `config` (show), `config set` (validate + write)
- **Info commands**: `usage`, `history` (sprint log table)
- **Stub commands**: `plugin install/list`, `upgrade`, `onboard` — "not yet implemented"
- **Helpers**: `output.ts` (formatDashboard, formatDoctorResult, formatTable, formatProgressBar, formatSprintSummary), `process.ts` (EXIT_CODES, handleCliError, resolveProjectRoot), `prompt.ts` (promptText, promptSelect, promptConfirm)
- **Çalışma zamanı bağımlılığı**: `commander@^13.0.0` (tek runtime bağımlılık)
- **Test paketi**: 86 yeni test, toplam 297 (tümü geçiyor)
- **Coverage**: genel %92.91; CLI komutları %98.33, CLI giriş %95.23, CLI yardımcılar %89.47

### Changed

- `vitest.config.ts`: Removed `src/cli/**` from coverage exclude
- `package.json`: Added `commander` as runtime dependency

## [0.1.0-wave3] - 2026-03-16

### Added

- **Brain Module** (`src/orchestra/brain.ts`): 17 exported fonksiyon + 7 internal helper — tam sprint yaşam döngüsü (8 phase), GO/NO-GO değerlendirme, çapraz bağımlılık çözümü, debt escalation (2→HIGH, 3+→CRITICAL), decay mekanizması (300 satır budget), usage-aware sprint planning. `BrainError` error class. `BrainContext`, `ProjectState`, `SprintSizeRecommendation`, `CreateTaskParams` interfaces.
- **Sprint Lifecycle**: `runSprint` master orchestrator — PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP. Her phase try/catch ile korunur, sprint asla yarım kalmaz.
- **DEBT.md Programatic I/O**: `parseDebtTable`/`generateDebtTable` ile markdown tablo formatı korunarak okuma/yazma.
- **Barrel export'ları**: `src/orchestra/index.ts` 17 brain fonksiyon export'u + 4 tip export'u ile güncellendi
- **Sabitler**: `DEBT_TABLE_HEADER` `src/core/constants.ts`'ye eklendi
- **Test paketi**: 83 yeni test, toplam 211 (tümü geçiyor)
- **Coverage**: brain.ts %93.61 statement, %96.42 fonksiyon; genel %91.51

## [0.1.0-wave2] - 2026-03-16

### Added

- **tmux Manager** (`src/orchestra/tmux.ts`): 10 fonksiyon — session management, worker spawn/kill, auditor start, attach, send-keys. `SpawnOptions` interface (allowedTools + autoApprove). `TmuxError` error class.
- **Auditor** (`src/monitor/auditor.ts`): 10 fonksiyon — heartbeat scanning, boundary violation detection (git diff), stale lock detection, Kahn's algorithm deadlock detection, dashboard update, pattern detection. Resilient `readJsonSafe` pattern.
- **Worker** (`src/agents/worker.ts`): 12 fonksiyon — task read/claim, plan write, file locking (acquire/release/check/releaseAll), heartbeat create/write, result write with status update, scope validation. `TaskClaimError`, `LockError`, `ScopeViolationError` error classes.
- **Barrel export'ları**: `src/orchestra/index.ts`, `src/monitor/index.ts`, `src/agents/index.ts`
- **Root yeniden export'lar**: `src/index.ts` 3 yeni modül export'u ile güncellendi
- **Test paketi**: 80 yeni test (19 tmux + 24 auditor + 37 worker), toplam 128
- **Coverage**: genel %90.89 (tmux %100, auditor %95.58, worker %95.81)

## [0.1.0-wave1] - 2026-03-16

### Added

- **Constants** (`src/core/constants.ts`): 50+ constants — paths, timing, memory limits, tmux names, task extensions, tech debt escalation, defaults
- **Type system** (`src/core/types.ts`): 8 enums (`TaskStatus`, `TaskEvaluation`, `AgentStatus`, `AlertLevel`, `SprintPhase`, `SprintStatus`, `DebtPriority`), 25+ interfaces covering Task, Sprint, Agent, Config, Dashboard, Memory, Lock, Usage, Plugin, and CLI domains
- **Config loader** (`src/core/config.ts`): 3-layer merge (defaults → global → project), `ConfigValidationError` with detailed error arrays, `deepMerge`, `loadConfig`, `validatePartialConfig`
- **Barrel export'ları**: `src/core/index.ts`, `src/index.ts`
- **Test paketi**: 3 dosyada 48 test — constants, types (enum üyeliği), config (yükleme/birleştirme/doğrulama)
- **Coverage**: genel %91.87 (constants %100, types %100, config %92.39)
- **Proje iskeleti**: `package.json`, `tsconfig.json` (strict, Node16, ES2022), `vitest.config.ts`, `.gitignore`
