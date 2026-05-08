# Sprint 161 — Migration Triage Matrix

**Generated:** 2026-05-08
**Sources:** D5b deep-dive triage + Lane 1 worker triage flags (T-161-001..028)
**Total triaged paths:** ~2,222 files (D5b corpus, after filtering nested
`node_modules`/`dist`)
**Aggregation strategy:** Bucket-level classification where uniform; per-file
overrides where workers flagged divergent (Lane 1 detail) or the file is
high-stakes (orchestrator runtime artifacts, scripts, root MD).

**Class definitions:**
- **MIGRATE-PUBLIC** — copy to `VerhexIO/deckent` public repo / npm-published
- **KEEP-PRIVATE** — never leaves `deckent-dev`; `.gitignore`d in public repo
- **DELETE-CANDIDATE** — remove from working tree before next sprint cycle
- **UNCERTAIN** — needs human decision OR sample-content check before flip

---

## A. Source code (`src/**`) — uniform MIGRATE-PUBLIC except marked

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `src/core/` (177 files) | MIGRATE-PUBLIC | Core types, config, agent/skill pool, model registry, memory store. T-161-001..012 confirm internal-only API surface (KEEP-PRIVATE-as-internal but ships with package). | D5b, T-161-001..012 |
| `src/orchestra/` (92 files) | MIGRATE-PUBLIC | Sprint lifecycle. T-161-013..023 confirm. | D5b, T-161-013..023 |
| `src/cli/` (95 files) | MIGRATE-PUBLIC | 46+ commands. T-161-024..028 confirm. | D5b, T-161-024..028 |
| `src/dashboard/` (64 files) | MIGRATE-PUBLIC | React + Vite source. | D5b |
| `src/mcp/` (42 files) | MIGRATE-PUBLIC | MCP server. | D5b |
| `src/nervous/` (21 files) | MIGRATE-PUBLIC | ADR-040 nervous system. | D5b |
| `src/agents/` (20 files) | MIGRATE-PUBLIC | worker, adaptive-agent. | D5b |
| `src/connectors/` (8 files) | MIGRATE-PUBLIC | Discord/Telegram/WhatsApp connectors. | D5b |
| `src/providers/` (5 files) | MIGRATE-PUBLIC | Claude/Codex/Gemini adapters. | D5b |
| `src/monitor/` (4 files) | MIGRATE-PUBLIC | Auditor scan loop, dashboard manager. | D5b |
| `src/api/` (4 files) | MIGRATE-PUBLIC | HTTP API server. | D5b |
| `src/extensions/vscode/` (2 files) | MIGRATE-PUBLIC | VS Code host bridge. | D5b |
| **`src/test-sprint-154-marker.ts`** | **DELETE-CANDIDATE** | Sprint 154 dogfood marker artifact. Ships in `dist/` and would leak to npm consumers. D2-F5 also flags. | D5b, D2 |
| **`src/orchestra/handoff-protocol.ts`** | **UNCERTAIN → DELETE-CANDIDATE** | 0 importers, 22+ sprints dormant, ADR-038 Kademe 2 mandate not honored (no `@deprecated` marker). Sprint 162 P0 decision: delete OR mark deprecated per ADR amendment. | D3-P0-1 |
| **`src/orchestra/brain-context.ts`** | **UNCERTAIN → DELETE-CANDIDATE** | Same as handoff-protocol.ts (0 importers, 22+ sprints dormant). | D3-P0-1 |
| **`src/orchestra/decision-engine.ts`** + `decision-replay.ts` + `decision-steps/*` | KEEP-PRIVATE (intentionally dormant per ADR-038 Kademe 3) | Reference V1 routing engine retained for Sprint 142+ reassessment (19 sprints overdue). | D3-P2-1 |

## B. Scripts (`scripts/**`)

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `scripts/copy-assets.mjs` | MIGRATE-PUBLIC | Build pipeline (referenced by `npm run build`). | D5b |
| `scripts/bundle-builtins.mjs` | MIGRATE-PUBLIC | Build pipeline. | D5b |
| `scripts/sync-manifest.mjs` | MIGRATE-PUBLIC | Build/sync pipeline. | D5b |
| `scripts/build-verify.ts` | MIGRATE-PUBLIC | Build verifier. | D5b |
| `scripts/prepublish.ts` | MIGRATE-PUBLIC | npm prepublish hook. | D5b |
| `scripts/publish.ts` | MIGRATE-PUBLIC | npm publish helper. | D5b |
| `scripts/validate-publish.ts` | MIGRATE-PUBLIC | `npm run validate:publish`. | D5b |
| `scripts/pack-test.ts` | MIGRATE-PUBLIC | Pack validation. | D5b |
| `scripts/generate-cli-docs.ts` | MIGRATE-PUBLIC | Generates `docs/reference/cli.md`. | D5b |
| `scripts/i18n-parity.mjs` | MIGRATE-PUBLIC | i18n linter. | D5b |
| `scripts/link-checker.mjs` | MIGRATE-PUBLIC | Doc link checker. | D5b |
| `scripts/doc-consistency-check.mjs` | MIGRATE-PUBLIC | Doc consistency. | D5b |
| `scripts/doc-review.mjs` | MIGRATE-PUBLIC | Doc reviewer. | D5b |
| `scripts/prompt-linter.mjs` | MIGRATE-PUBLIC (after D6 fix) | Prompt linter. **Note D6:** filter pattern `.prompt-${sprintId}-` only matches Docker backend; tmux silently bypassed. Ship after Sprint 162 D6 generator-naming alignment. | D5b, D6 |
| `scripts/changelog.sh` | MIGRATE-PUBLIC | CHANGELOG helper. | D5b |
| `scripts/bump-version.sh` | MIGRATE-PUBLIC | Version bump. | D5b |
| `scripts/chain-gate-check.mjs` | MIGRATE-PUBLIC | Chain-gate validator. | D5b |
| `scripts/pre-flight-health-check.mjs` | MIGRATE-PUBLIC | Pre-flight health check. | D5b |
| `scripts/verify-gitignore.mjs` | MIGRATE-PUBLIC | gitignore verifier. | D5b |
| `scripts/nervous-tui-smoke.sh` | MIGRATE-PUBLIC | Nervous TUI smoke test. | D5b |
| `scripts/cli-smoke-test.sh` | MIGRATE-PUBLIC | Public smoke test. | D5b |
| `scripts/fresh-env-test.sh` | MIGRATE-PUBLIC | Public fresh-env validation. | D5b |
| `scripts/run-e2e-harness.mjs` | MIGRATE-PUBLIC | Public E2E harness. | D5b |
| `scripts/mcp-nervous-e2e.mjs` | MIGRATE-PUBLIC | MCP E2E test. | D5b |
| `scripts/sign-seed-skills.mjs` | MIGRATE-PUBLIC | Skill manifest signing (likely required for public). | D5b |
| `scripts/hub-validate.mjs` | MIGRATE-PUBLIC | deckent-hub validator. | D5b |
| `scripts/adr-validator.mjs` | MIGRATE-PUBLIC | ADR linter (`npm run lint:adr`). | D5b |
| `scripts/agent-prompt-validator.mjs` | MIGRATE-PUBLIC | Public agent validator. | D5b |
| `scripts/check-error-handling.mjs` | MIGRATE-PUBLIC | `npm run lint:errors`. | D5b |
| `scripts/deploy-discord.sh` | MIGRATE-PUBLIC | Connector deploy (connectors are public). | D5b |
| `scripts/deploy-telegram.sh` | MIGRATE-PUBLIC | Connector deploy. | D5b |
| **`scripts/public-repo-sync.sh`** | **KEEP-PRIVATE** | Tooling for dev→public sync workflow itself. | D5b |
| **`scripts/verify-publish.sh`** | **KEEP-PRIVATE** | Internal publish verification. | D5b |
| **`scripts/npm-publish-dry.sh`** | **KEEP-PRIVATE** | Internal dry-run script. | D5b |
| **`scripts/npm-publish-dry-final.sh`** | **KEEP-PRIVATE** | Internal dry-run script. | D5b |
| **`scripts/directives-stress-simulator.mjs`** | **KEEP-PRIVATE** | Internal stress test. | D5b |
| **`scripts/dead-code-audit.mjs`** | **KEEP-PRIVATE** | Internal audit script. | D5b |
| **`scripts/insert-sprint-154-adrs.mjs`** | **DELETE-CANDIDATE** | One-shot historical migration. | D5b |
| **`scripts/migrate-brain-v2.mjs`** | **UNCERTAIN → KEEP-PRIVATE** | Memory V1→V2 migration. KEEP unless v1→v2 upgrade is publicly supported. | D5b |
| **`scripts/archive-decisions-md.mjs`** | **UNCERTAIN → KEEP-PRIVATE** | One-shot DECISIONS.md → DB migration. | D5b |
| **`scripts/backfill-relations.mjs`** | **UNCERTAIN → KEEP-PRIVATE** | One-shot DB backfill. T-161-002 F-8: re-implements `extractAdrReferences` (DRY violation). | D5b, T-161-002 |
| `scripts/regen-claim-counts.mjs` | NOT-YET-EXISTS → MIGRATE-PUBLIC (Sprint 162 to create) | Recommended D5a fix; auto-regen claim counts in CLAUDE.md/IDENTITY.md/etc. | D5a recommendation |

## C. Root-level files

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `package.json`, `package-lock.json` | MIGRATE-PUBLIC | npm publish. | D5b |
| `tsconfig.json`, `vitest.config.ts`, `vitest.dashboard.config.ts` | MIGRATE-PUBLIC | Build/test config. | D5b |
| `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml` | MIGRATE-PUBLIC | Public Docker support. **Note D9-F2:** `Dockerfile.worker` separate USER audit pending Sprint 162. | D5b, D9 |
| `LICENSE`, `README.md`, `README-TR.md`, `CHANGELOG.md`, `CONTRIBUTING.md` | MIGRATE-PUBLIC | Standard public surface. | D5b |
| `CODE_OF_CONDUCT.md`, `SECURITY.md` | MIGRATE-PUBLIC | Standard. **Note D5a-P0-7:** root CoC vs `docs/launch/CONDUCT.md` drift; reconcile before flip. | D5b, D5a |
| `VISION.md`, `VISION-TR.md`, `BETA-TRACKER.md`, `BETA-TRACKER-TR.md` | MIGRATE-PUBLIC | Public marketing/positioning. **Note D5a-P1-11:** TR is 201 lines longer than EN — content drift, not just translation. | D5b, D5a |
| `COMPETITIVE-ANALYSIS.md` | MIGRATE-PUBLIC | Public marketing. | D5b |
| `AGENTS.md` | MIGRATE-PUBLIC | Public agent activation matrix (canonical). | D5b |
| `CLAUDE.md`, `DECKENT.md` | MIGRATE-PUBLIC | Public Claude Code project instructions + adapter (ADR-013). **Note D5a-P0-1..3:** stale claim counts (CLI=46/55+, MCP=31/27, sprint=155). Regenerate after Sprint 162 fix. | D5b, D5a |
| `.gitignore`, `.npmignore`, `.npmrc`, `.dockerignore`, `.editorconfig` | MIGRATE-PUBLIC | Build/ignore configs. | D5b |
| `.pre-commit-config.yaml`, `.secrets.baseline` | MIGRATE-PUBLIC | Pre-commit + detect-secrets. | D5b |
| **`DECKENT-MASTER-BLUEPRINT.md`** | **KEEP-PRIVATE** | Internal blueprint with sprint metrics. | D5b |
| **`DECKENT-ANA-PLAN-TR.md`** | **KEEP-PRIVATE** | Internal master plan TR. | D5b |
| **`DECKENT-TEST-REPORT.md`** | **KEEP-PRIVATE** | Sprint 060 dummy test validation report. **Already flagged by Sprint 154 T-010** as ARCHIVABLE — never executed. | D5b, D5a-P2-3 |
| **`NEXT-SESSION-PROMPT.md`** | **KEEP-PRIVATE** | Sprint 153 handoff prompt. **Already flagged by Sprint 154 T-010** as ARCHIVABLE — never executed. | D5b, D5a-P2-1 |
| **`SYSTEM-MIGRATION-2026-04-22.md`** | **KEEP-PRIVATE** | Internal system-migration playbook. **Already flagged by Sprint 154 T-010** as ARCHIVABLE — never executed. | D5b, D5a-P2-2 |
| **`DIRECTIVES.md`** | **UNCERTAIN → KEEP-PRIVATE (live), MIGRATE empty seed at init** | Current sprint scratchpad. Public repo gets empty template via `deckent init`. | D5b |
| **`.dashboard`** | **DELETE-CANDIDATE** | Live dashboard JSON snapshot (runtime). Add to `.gitignore`. | D5b |

## D. `.deckent/` directory

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `.deckent/agents/` (15 built-in dirs + manifests) | MIGRATE-PUBLIC | Built-in agent infrastructure. | D5b, D8 |
| **`.deckent/agents/temp-react-specialist/`** | **DELETE-CANDIDATE** | Zombie temp agent (0 uses, LRU eviction broken). | D8-P1, D5b |
| **`.deckent/agents/temp-react-ts-specialist/`** | **DELETE-CANDIDATE** | Same. | D8-P1 |
| **`.deckent/agents/archive/temp-react-specialist/`** | **DELETE-CANDIDATE** | Duplicate of active temp- (drift). | D8 |
| **`.deckent/agents/archive/temp-react-ts-specialist/`** | **DELETE-CANDIDATE** | Same. | D8 |
| `.deckent/agents/archive/test-writer-removed-sprint-148/` | KEEP-PRIVATE | Properly archived (Sprint 148 ADR-041 reform). | D8 |
| `.deckent/agents/react-ts-specialist/` | UNCERTAIN | Built-in or temp-promoted? Verify against `core/agent-pool.ts`. **Recommend KEEP** (38 uses suggests promoted-permanent). | D5b, D8 |
| `.deckent/skills/` (21 manifests) | MIGRATE-PUBLIC | Built-in skill infrastructure. All V2-valid. | D5b, D8 |
| `.deckent/plugins/` (7 files) | MIGRATE-PUBLIC | Plugin scaffold examples. | D5b |
| `.deckent/workspace/` (`BOOT.md`, `IDENTITY.md`, `TOOLS.md`, `WORKER-GUIDE.md`) | MIGRATE-PUBLIC | Templates. **Note D8 P0:** IDENTITY.md disagrees with CLAUDE.md/DECKENT.md/PROJECT-IDENTITY.md on every metric. Auto-regen before flip. | D5b, D8 |
| `.deckent/i18n/` (`en.json`, `tr.json`) | MIGRATE-PUBLIC | UI strings. | D5b |
| `.deckent/cost-config.json` | MIGRATE-PUBLIC | Static reference. | D5b |
| `.deckent/docs.json` | MIGRATE-PUBLIC | Static reference. | D5b |
| `.deckent/features-manifest.json` | MIGRATE-PUBLIC | 2026-05-08 regenerated; sprintId sprint-160 (1 sprint behind). | D5b, D8 |
| `.deckent/ci-baseline.json` | MIGRATE-PUBLIC (as seed) | **WARNING D8 P0:** baseline shows `testFailed=24, coverage=0` — invalid for ship; regen at init. | D5b, D8 |
| `.deckent/project-stack.json` | MIGRATE-PUBLIC (as seed) | Per-instance, ship template, regen at init. | D5b |
| **`.deckent/config.json`** | **KEEP-PRIVATE** | Current dev tunables. Public repo ships `.deckent/config.template.json` (does not yet exist — Sprint 162 to create). | D5b |
| **`.deckent/config.json.bak*` (4 files)** | **DELETE-CANDIDATE** | Config backup rotation artifacts (2026-04-21..24). Add `.deckent/config.json.bak*` to `.gitignore`. | D5b, D8 |
| **`.deckent/decisions/` (56 files, all `decision-161-NNN`)** | **KEEP-PRIVATE** | Sprint Decision Log per ADR-035. Per D8 finding: no SDL persistence between sprints — all `.deckent/decisions/*.json` are sprint-161 only. Public repo ships empty dir. | D5b, D8 |
| **`.deckent/routing/` (79 files, outcomes/learnings/rules)** | **KEEP-PRIVATE** | Per-instance routing outcome learning DB. | D5b |
| **`.deckent/archive/` (63 files)** | **KEEP-PRIVATE** | Historical sprint metrics + manifests. | D5b |
| **`.deckent/jobs/` (161 files: sprint-095..160 + run-*)** | **DELETE-CANDIDATE** | Per-instance runtime state. Verify `.gitignore` covers `.deckent/jobs/sprint-*.json` and `.deckent/jobs/run-*.json`. | D5b, D8 |
| **`.deckent/sprint-NNN-*.{json,jsonl,tar.gz,sha256,seq}` (~75 files for sprint-150..161)** | **DELETE-CANDIDATE / `.gitignore`** | Per-sprint runtime/audit state + binary archives. Add `.deckent/sprint-*-*.{json,jsonl,tar.gz,sha256,seq}` to `.gitignore`. | D5b |
| **`.deckent/sprint-141-analysis-archive/` (341 files)** | **KEEP-PRIVATE** | Internal Sprint 141 self-analysis dump (2.0 MB). D5a recommends move to `docs/archive/sprint-snapshots/sprint-141/`. | D5b, D5a |
| **`.deckent/sprint-god-analysis/` (321 files)** | **KEEP-PRIVATE** | Internal Sprint 139 self-analysis dump (3.1 MB). | D5b, D5a |
| **`.deckent/pids/sprint-*.{pid,snapshot.json}`** | **DELETE-CANDIDATE / `.gitignore`** | Live PID/snapshot. | D5b |
| **`.deckent/cache/managed-docs-cache.json`** | **DELETE-CANDIDATE / `.gitignore`** | Runtime cache. | D5b |
| **`.deckent/sprint.lock`, `sprint-state.json`** | **DELETE-CANDIDATE / `.gitignore`** | Live runtime state. | D5b |
| **`.deckent/provider-cache.json`** | **KEEP-PRIVATE** | Runtime cache. | D5b |
| **`.deckent/model-registry-refresh.json`** | **KEEP-PRIVATE** | Runtime cache. | D5b |
| **`.deckent/run-gate.json`** | **KEEP-PRIVATE / DELETE-CANDIDATE** | Stale Apr 24, unused since. | D5b, D8 |
| **`.deckent/safety-point.json`** | **KEEP-PRIVATE** | Per-instance state. | D5b |
| **`.deckent/metrics.jsonl`** | **KEEP-PRIVATE** | Per-instance metrics. | D5b |

## E. `.brain/` directory

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| **`.brain/MEMORY.md`, `RETRO.md`, `DEBT.md`, `ERRORS.md`, `PATTERNS.md`, `PROJECT-IDENTITY.md`** | **KEEP-PRIVATE** | Per-instance brain state. **Note D8 P0:** `PROJECT-IDENTITY.md` 14 days stale (claims Sprint 160, MCP=22, Node>=18); ERRORS.md 600 lines (67% of total budget). | D5b, D8 |
| **`.brain/memory.db` + `memory.db-shm` + `memory.db-wal`** | **KEEP-PRIVATE** | SQLite. Public repo gets fresh DB at `deckent init`. | D5b |
| **`.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md`** | **KEEP-PRIVATE** (auto-gen at init) | Auto-regenerated from memory.db. **Note D7 P1-B:** `decisions.md` export 67min stale vs other exports — non-atomic export pipeline. | D5b, D7 |
| **`.brain/exports/cli-mcp-parity-gap.md`, `sprint-144-cli-mcp-audit.md`, `sprint-145-adaptive-timeout-spec.md`, `sprint-145-unified-observability-spec.md`** | **KEEP-PRIVATE / DELETE-CANDIDATE** | Static one-shot exports from Sprint 144/145, 14 days stale. | D5b, D8 |
| **`.brain/sprints/sprint-NNN.md` (22 files)** | **KEEP-PRIVATE** | Sprint logs. **Note D8:** coverage gap — sprint-140, 154, 157 missing; sprint-161 not yet created. | D5b, D8 |
| **`.brain/reviews/` (3 files)** | **KEEP-PRIVATE** | Review JSONs. | D5b |
| **`.brain/archive/` (271 files, DIRECTIVES-sprint-{135..160}.md + DEBT-ARCHIVE.md + ...)** | **KEEP-PRIVATE** | Historical archives. **Note D8:** retention not pruned (14 months). Recommend `keep_last_n=20`. | D5b, D8 |
| **`.brain/archive/pre-v2/DECISIONS.md`** + **`.brain/archive/decisions-root-pre-sprint143/DECISIONS.md`** | **DELETE-CANDIDATE** | Byte-identical legacy ADR backups (96 KB × 2). Pick one, delete other. | D5a |

## F. `docs/` directory

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `docs/index.md` | MIGRATE-PUBLIC | VitePress landing. | D5b |
| `docs/CHANGELOG.md` | MIGRATE-PUBLIC | Public changelog (active, 2,612 lines). | D5b |
| `docs/SPRINT-LOG.md` | UNCERTAIN → KEEP-PRIVATE | 145 KB monolith. Likely internal. | D5b |
| `docs/KNOWN_ISSUES.md` | UNCERTAIN | Sprint 152 backlog. **Sanitize** before public migration (strip internal sprint IDs). | D5b |
| `docs/ROADMAP-GOD-LEVEL.md` | UNCERTAIN → KEEP-PRIVATE | Internal roadmap. Public version is `docs/vision/roadmap.md`. | D5b |
| `docs/worker-guide.md` | MIGRATE-PUBLIC | Public worker guide. **Duplicate of `docs/development/worker-guide.md`** (D5a P1-1) — pick canonical. | D5b, D5a |
| `docs/.vitepress/` (5 config files only — dist excluded) | MIGRATE-PUBLIC | VitePress site config + theme. | D5b |
| `docs/guide/` (7 files) | MIGRATE-PUBLIC | Public user guides. **Note D6:** `docs/guide/docker-backend.md:186` claims `.prompt-<id>.txt` (tmux pattern); needs update post-Sprint 162 generator-naming alignment. | D5b, D6 |
| `docs/reference/` (17 files) | MIGRATE-PUBLIC | CLI/MCP/config reference. **Note D5a P1-3:** 6 CLI-ref files exist, no canonical signpost. | D5b, D5a |
| `docs/architecture/` (6 files) | MIGRATE-PUBLIC | Public architecture. **Note D5a P1-5:** `agents.md` duplicates `AGENTS.md` content. | D5b, D5a |
| `docs/development/` (7 files) | MIGRATE-PUBLIC | Agent/worker/brain/dashboard/plugin guides. | D5b |
| `docs/governance/INDEX.md` | MIGRATE-PUBLIC | Public governance. | D5b |
| `docs/vision/roadmap.md` | UNCERTAIN → MIGRATE-PUBLIC (after sample) | Sanitized public version. | D5b |
| **`docs/launch/` (9 files)** | **KEEP-PRIVATE** | Internal launch playbook (HN/Reddit/Twitter announce, Discord/Telegram setup). | D5b |
| **`docs/release/` (6 files)** | **KEEP-PRIVATE** | Internal release ops. | D5b |
| **`docs/directives/` (32 files)** | **KEEP-PRIVATE** (frozen at sprint-145; per D5a "dead dir"; consider archive or delete) | Historical directives. | D5b, D5a |
| **`docs/audits/` (101+6 = 107 files across 26 sprint dirs)** | **KEEP-PRIVATE** | Internal sprint forensics. **Note D5a P3:** 17 stamp-pad load-test files; 27-file Sprint-152 cluster; 256 KB Sprint-132 monolith. | D5b, D5a |
| **`docs/superpowers/` (26 files in specs/ + plans/)** | **KEEP-PRIVATE** | Live brainstorm + plan artifacts. | D5b |
| **`docs/sprint-log/` (2 files: Sprint-146.md, Sprint-148.md)** | **KEEP-PRIVATE / DELETE-CANDIDATE** | 2 of 161 sprints — abandoned dir per D5a. | D5b, D5a |
| **`docs/analysis/` (5 files)** | **KEEP-PRIVATE** | Internal analysis. | D5b |
| **`docs/archive/` (8 files)** | **KEEP-PRIVATE** | Internal archive. | D5b |
| **`docs/design/multi-project-isolation.md`** | **KEEP-PRIVATE** | Internal design doc. | D5b |

## G. `.github/`, `.claude/`, `.codex/`, `.gemini/`

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `.github/workflows/` (5 workflows) | MIGRATE-PUBLIC | CI/publish/release/cross-platform-e2e/docs. **Note D9-F12:** `release.yml:48-59` quoting hygiene. | D5b, D9 |
| `.github/ISSUE_TEMPLATE/` (3 files) | MIGRATE-PUBLIC | Standard issue templates. | D5b |
| `.github/CODEOWNERS`, `FUNDING.yml`, `dependabot.yml`, `pull_request_template.md` | MIGRATE-PUBLIC | Standard public infra. | D5b |
| `.claude/rules/{brain,auditor,worker-default}.md` | MIGRATE-PUBLIC | Agent runtime rules. **Note D5a P0-5:** rules-files inject 42 ADRs; DB has 45. Regenerate before flip. | D5b, D5a |
| **`.claude/settings.local.json`** | **KEEP-PRIVATE** | Per-user dev config. | D5b |
| `.codex/rules/` (3 files) | MIGRATE-PUBLIC | Codex agent runtime rules. | D5b |
| `.gemini/rules/` (3 files) | MIGRATE-PUBLIC | Gemini agent runtime rules. | D5b |

## H. `.contracts/`, `examples/`, misc

| Path | Class | Rationale | Source(s) |
|------|-------|-----------|-----------|
| `.contracts/api-surface.md` | MIGRATE-PUBLIC | Public inter-agent contract. **Note D8 P2:** still shows V1 task schema; manifests on disk are V2 — sync. | D5b, D8 |
| `examples/quickstart/` (3 files) | MIGRATE-PUBLIC | Public quickstart examples. | D5b |
| **`deckent-hub/` (65 files)** | **DELETE-CANDIDATE** | Misplaced sub-repo (looks like accidental clone of separate hub repo). Verify with `git submodule status`; if not, remove. | D5b P0-1 |
| **`.test-e2e-sprint-21914/.tasks/` (18 files)** | **DELETE-CANDIDATE** | Orphan e2e test sandbox. | D5b P0-2 |
| **`.test-e2e-sprint-33991/.tasks/` (3 files)** | **DELETE-CANDIDATE** | Orphan e2e test sandbox. | D5b P0-2 |

---

## Class summary (final aggregated counts)

| Class | Count |
|-------|------:|
| **MIGRATE-PUBLIC** | ~735 |
| **KEEP-PRIVATE** | ~1,265 |
| **DELETE-CANDIDATE** | ~205 |
| **UNCERTAIN** | ~17 |
| **Total triaged paths** | **~2,222** |

The dominant message: **DELETE-CANDIDATE bucket is concentrated in 5 areas** —
`deckent-hub/`, `.test-e2e-sprint-*`, `.deckent/jobs/`, `.deckent/sprint-NNN-*`
binary archives, `.deckent/agents/temp-*` zombies. Cleaning these 5 buckets
before the public flip removes >205 files and 5+ MB of bloat with zero
functional impact.

---

*End MIGRATION-TRIAGE-MATRIX.md — 2026-05-08*
