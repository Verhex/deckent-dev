# Known Issues — Deckent v1.0.0-beta.1

**Last updated:** 2026-05-07 (Sprint 154 comprehensive audit — 10-agent parallel pass)
**Scope:** Tracked bugs, drifts, and deferred work. Updated every sprint.

This document is the source of truth for "things we know are imperfect but are not blockers for Beta GA". If you hit an issue not listed here, please open an issue on GitHub.

---

## 🔴 CRITICAL — Sprint 154 audit pass yeni P0 (ROOT CAUSES)

| ID | Issue | Fix |
|----|-------|-----|
| **C1** | **`spawn-backend-docker.ts:257` `~/.claude.json:ro` mount → silent EROFS exit** — Sprint 144→153 boyunca yaşanan tüm worker timeout/0 line yazma pattern'inin TEK kök sebebi. Claude CLI startup'ta config write fail → silent exit 0, prompt API'ye hiç gitmiyor. Sprint 153 17 worker × 0 line kanıt. | mount flag `:ro` → `:rw` (1 satır), DIRECTIVES Task 1 |
| **C2** | **Sprint Pipeline Advanced Features DEAD** (A4 audit) — `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint`, `evaluateWithRubric → reconcileSpuriousNoGo`, `task-retry.ts` — hepsi 0 production caller. Test'lerde isolated pass ama runSprint asla çağırmıyor. | Wire integration ~50 LoC, DIRECTIVES Task 7 |
| **C3** | **NervousObserver wired ama `'detection'` event 0 subscriber** (A7) — Dispatcher/Proposer/Executor/HistoryStore production'da hiç instantiate edilmemiş. 11 sprint'te 0 nervous-history.jsonl. ADR-040 yarım çalışıyor. | observer.on('detection') wire ~10 LoC, DIRECTIVES Task 8 |
| **C4** | **ADR-039 Self-Modifying Detector 12+ sprint dormant** (A9) — `checkWorkerAuthority()`, `isSelfModifyingSprint()`, `detectDeckentRepo()` 0 production call site. Sprint 148 catastrophic-lesson kuralı runtime'da yok. | task-builder + worker.ts wire ~30 LoC, DIRECTIVES Task 9 |
| **C5** | **`scripts/adr-validator.mjs` deleted file referansı** (A9) — `.brain/DECISIONS.md` (Memory V2 migration ile silindi) arıyor → `npm run lint:adr` silently failing | path → memory.db `getByType('adr')`, DIRECTIVES Task 10 |

---

## 🟢 Fixed (Sprint 152.5 + 153 + 154 confirmed)

### Sprint 152.5 Hot Fix Day
| ID | Issue | Fix |
|----|-------|-----|
| HF1 | Docker worker `better-sqlite3` GLIBC 2.38 mismatch | `Dockerfile.worker` → `node:24-trixie-slim` (Debian 13, glibc 2.41) |
| HF2 | Brain NO_GO → FIX cycle never re-evaluated post-FIX | `isVerificationTask` accepts doc-only file changes; audit tasks now DONE |
| HF3 | `.claude/rules/*.md` silently stripped when memory.db load fails | `rule-generator.ts` no-longer-silent catch; loud failure preserves rules |
| HF4 | MCP `deckent_start --dry-run` "No providers registered" | `start.ts` calls `bootstrapProviders(config)` before planSprint |

### Sprint 153 (CI greening + Node 20 + D batch + B Nervous wire + E Ed25519)
| ID | Issue | Fix verified |
|----|-------|-------------|
| S153-A | ADR-008 violation `src/core/notify.ts` orchestra import | ✅ D1 — moved to orchestra/ (5 caller updated) |
| S153-B | ADR-038 violation `batch-stats.ts` 0 consumer | ✅ D2 — deleted (334 LoC) |
| S153-C | 20 seed Ed25519 placeholder signatures (Beta GA Gate #15 partial) | ✅ E — `scripts/sign-seed-skills.mjs` real 128-hex (A5.F3 verified Sprint 154) |
| S153-D | NervousObserver never instantiated in sprint-controller | 🟡 B1+B2 — instantiation wired BUT subscriber missing (yeni P0 C3) |
| S153-E | CI workflows red 14+ days | ✅ `npx node-gyp rebuild --release` step added 9 jobs |
| S153-F | Node 18 EOL drop | ✅ matrix `[20.x, 22.x, 24.x]`, 36 file purge |

---

## 🟡 Known — Backlog (Non-Blocker for Beta GA)

### Documentation Drift
- **MCP tool count doc mismatch** — 4 sources report 22/23/27/31. Live `tools/list` = 31 is source of truth. DECKENT.md, IDENTITY.md, DIRECTIVES.md, `help.ts` need sync. Non-user-facing.
- **"16 built-in agents" claim** — Actually 15 (test-writer removed in Sprint 148 reform). Docs (DECKENT.md, IDENTITY.md, CLAUDE.md) to update.
- **"49 CLI commands" claim** — Actually 46 top-level. Sprint 151 T-151-NEW-C calibration needed.
- **`--version` vs `IDENTITY.md` drift** — package.json says 1.0.0-beta.1, IDENTITY says 0.4.0-beta.1. IDENTITY.md is stale.

### CLI/MCP Parity Gaps (ADR-022-v2)
- **`memory-query` CLI missing** — MCP has `deckent_memory_query` tool, CLI lacks wrapper. Workaround: use MCP, or `deckent recall <query>`.
- **`feature-query` MCP naming vs `features` CLI** — rename pending.
- **`config read` subcommand** — help-info advertises it, not implemented. Workaround: `deckent config` no-args.
- **`nervous config show`** — not available; read `.deckent/config.json:nervous_system` directly.
- **`deckent_run --dry-run`** — spec mentions, not implemented in either MCP or CLI.

### Nervous System
- **11 detectors implemented, 0 wired to production path** — `NervousObserver` never instantiated in `sprint-controller.ts`. Event stream emits sprint lifecycle hooks (working) but detector loop is dormant. Implementation + tests exist. Wire-up planned Sprint 159.
- **Config schema has 6 orphan entries** (`dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner` marked `reserve_for: sprint-148`) — cleanup deferred.

### Memory & Debt
- **96 "open debt" entries** — classification says 59 are ARTIFACT (analysis outputs), 32 are CLOSEABLE, only 5 are truly actionable. `addTechDebt()` heuristic filter planned.
- **Legacy `.brain/DEBT.md`** — pre-V2 artifact, 2 stale lines. Should move to `.brain/archive/`.
- **1 ADR status uppercase drift** — "ACCEPTED" vs all-lowercase elsewhere; filter queries miss 1 entry.

### Security
- **20 seed skills have placeholder Ed25519 signatures** — `ed25519:placeholder:awaiting-t149016-keygen:...`. Real keygen + sign pass planned Sprint 153. Affects Beta GA Gate #15 "20 seed signed". **Skill install path does not yet enforce Ed25519 verify** (publish path does).
- **3 `shell: true` residuals** (`baseline-tracker.ts:90`, `plugin-hooks.ts:399,581`) — sandbox-safe (fixed args, no injection) but violates literal ADR-006.
- **`.deck` interpolation supports 11 known keys** — 3 messaging connector tokens (Discord/Telegram/WhatsApp) not in KNOWN_DECK_KEYS.

### Architecture & ADR Compliance
- **ADR-008 violation:** `src/core/notify.ts:17` imports from `orchestra/event-bus.js` (core→orchestra reverse direction). Planned: move notify.ts OR extract type.
- **ADR-038 violation:** `batch-stats.ts` listed for removal but still present (0 consumers); `combination-scorer.ts` was Kademe 2 "defer" but got deleted.
- **ADR-039 (Self-Modifying Detector) implementation dormant** — code exists at `src/orchestra/self-modifying-detector.ts` with 32 passing tests, but zero source-code integration. P2/P3 wire outstanding 12+ sprints.
- **Hot Fix with Claude Subagents pattern (Sprint 150A + 152.5) not an ADR yet** — ADR-043 draft planned Sprint 153.

### Testing & Coverage
- **Coverage 52% vs 85% Beta GA gate #3** — Phase 2 deferred (Sprint 160+).
- **vitest 9 residual fail** — Sprint 151 gate failure (1 test). Root cause mostly GLIBC cascade (now fixed via HF1); remaining host-side ~10 tests (JSDoc/timeout/Docker E2E mock).
- **CI baseline capture bug** — `plugin-hooks.ts runFullVitest()` stdout capture fails in Docker harness → ci-baseline.json reports `testCount: 0`. Doctor "Baseline tests: 0" = meaningless for 3 sprints.
- **`baseline tests: 16` vs `testPassed: 12485` drift** — sprint-reporter source-of-truth split.

### Sprint Lifecycle
- **FIX phase timeout 600s (10min) too short for opus tasks** — Sprint 152 fix workers could not complete; consider 1200-1800s.
- **Brain Evaluator verification task detection expanded in HF2** — previous versions required `filesChanged=[]` which excluded report-writing audit tasks.

### Dashboard
- **`StatusPage.tsx` orphan** — exists in source but not routed; dead code, to be deleted.
- **`routes.tsx` vs `App.tsx` drift** — 5 vs 6 entries, `/settings` only in App.tsx.
- **SSE lacks keepalive** — 20-30s `:keepalive\n\n` heartbeat missing; proxies (Nginx/Cloudflare) may idle-timeout.

### Build & Image
- **Docker worker image 940 MB** — multi-stage build could reduce to ~250-400 MB. Not blocker.
- **`Dockerfile.worker` USER deckent directive missing** — non-root in base Dockerfile but worker variant lacks it. Beta GA Gate #14 partial.
- **Base image digest not pinned** — `node:24-trixie-slim` floating tag.

### Auto-Memory (Post-Migration)
- **78 `~/.claude/projects/*/memory/` feedback/project/user files lost** during WSL migration (82 → 4 recovered from OneDrive). 7 critical rules preserved via `NEXT-SESSION-PROMPT.md`; remaining ~70 will regenerate organically. DB-first `.brain/memory.db` (176 entries) intact.

### Providers
- **Codex & Gemini CLI not installed** — only Claude available. ROADMAP Phase 2 target Sprint 164. Multi-provider USP marketing messaging premature until then.
- **No `fallback_provider` config key** — if Claude degrades, sprint aborts (single-point-of-failure).
- **`opus.apiId = 'claude-opus-4-6'`** — should be `claude-opus-4-7` for latest model.

### Messaging (Beta GA Gate #13)
- **Discord/Telegram bot deploy scripts present, no live smoke log** — requires Alperen token setup + manual smoke.
- **WhatsApp Business API activation pending** — no approval yet; scaffold-only.

### Repo
- **Remote URL `VerhexIO/deckent-dev`** — Sprint 151 planned flip to `VerhexIO/deckent` not yet executed (Alperen manual).
- **`.gitignore` drift** — `.deckent/decisions/`, `.deckent/sprint-*-metrics.jsonl` untracked unintentionally.

---

## 📊 Issue Triage Legend

- 🟢 **Fixed** — resolved in current release
- 🟡 **Known** — tracked, not a Beta GA blocker; fix scheduled or community-prioritized
- 🔴 **Critical** — if anything moves here, Beta GA re-evaluation required

Currently: 0 🔴 critical issues.

---

## Contributing

Found an issue not listed here? Open at https://github.com/VerhexIO/deckent/issues (once public repo flip completes).

Prefer a pattern like:
```
Title: [short]
Environment: OS, Node version, Docker version
Steps to reproduce:
Expected:
Actual:
Log snippet:
```
