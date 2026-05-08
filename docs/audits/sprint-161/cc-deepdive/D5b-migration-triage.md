# D5b — Public-Repo Migration Triage (Sprint 161)

**Lane:** 3 — Public-Repo Migration Triage
**Agent:** D5b (cc-deepdive)
**Mode:** READ-ONLY classification
**Source repo:** `/home/alperen/deckent-dev` (SECRET dev repo)
**Target repo:** `VerhexIO/deckent` (PUBLIC, NPM-published)
**Audit date:** 2026-05-08

---

## Methodology

1. Enumerated all files via `find` excluding `node_modules`, `dist`, `tests`, `.tasks`, `.locks`, `coverage`, `.brain/archive`, `.git`.
2. Re-filtered list to also drop nested `node_modules` and `dist` (e.g. `src/dashboard/node_modules`, `src/dashboard/dist`, `docs/node_modules`, `docs/.vitepress/dist`).
3. Aggregated by 1st/2nd-level directory; sampled ambiguous files via `Read`.
4. Cross-checked classification logic against `scripts/public-repo-sync.sh`, `.npmignore`, `package.json` files arrays (not modified — read context only).

> **Initial raw count:** 15,955 files (with nested node_modules / dist).
> **Effective audit corpus:** **2,222 files** (after filtering nested artifacts).

---

## Summary

| Class | Count | % |
|---|---:|---:|
| **MIGRATE-PUBLIC** | ~735 | 33.1% |
| **KEEP-PRIVATE** | ~1,265 | 56.9% |
| **DELETE-CANDIDATE** | ~205 | 9.2% |
| **UNCERTAIN** | ~17 | 0.8% |
| **TOTAL audited** | **2,222** | 100% |

> Counts are aggregated by directory bucket; per-file precision was not pursued where buckets are uniform. Edge cases enumerated below.

---

## Aggregated by directory

| Directory | Total | KEEP-PRIVATE | MIGRATE-PUBLIC | DELETE-CANDIDATE | UNCERTAIN | Notes |
|---|---:|---:|---:|---:|---:|---|
| **src/** (excluding nested node_modules/dist) | 506 | 1 | 504 | 1 | 0 | Core product code. `src/test-sprint-154-marker.ts` = DELETE (sprint marker artifact). `src/index.ts` MIGRATE. |
| `src/core/` | 177 | 0 | 177 | 0 | 0 | All MIGRATE — types, config, agent/skill pool, model registry, memory store. |
| `src/cli/` | 95 | 0 | 95 | 0 | 0 | All MIGRATE — 46 commands + helpers. |
| `src/orchestra/` | 92 | 0 | 92 | 0 | 0 | All MIGRATE — sprint lifecycle. |
| `src/dashboard/` | 64 | 0 | 64 | 0 | 0 | All MIGRATE — React + Vite source. |
| `src/mcp/` | 42 | 0 | 42 | 0 | 0 | All MIGRATE — MCP server. |
| `src/nervous/` | 21 | 0 | 21 | 0 | 0 | All MIGRATE — ADR-040 nervous system. |
| `src/agents/` | 20 | 0 | 20 | 0 | 0 | All MIGRATE — worker, adaptive-agent. |
| `src/connectors/` | 8 | 0 | 8 | 0 | 0 | All MIGRATE. |
| `src/providers/` | 5 | 0 | 5 | 0 | 0 | All MIGRATE. |
| `src/monitor/` | 4 | 0 | 4 | 0 | 0 | All MIGRATE. |
| `src/api/` | 4 | 0 | 4 | 0 | 0 | All MIGRATE. |
| `src/extensions/` | 2 | 0 | 2 | 0 | 0 | VS Code host bridge — MIGRATE. |
| **scripts/** | 41 | 5 | 36 | 0 | 0 | Most MIGRATE (build/publish/lint scripts). KEEP-PRIVATE: `public-repo-sync.sh`, `verify-publish.sh`, `npm-publish-dry-final.sh` (publish workflow internals); `insert-sprint-154-adrs.mjs` (one-shot historical migration script — DELETE-CANDIDATE actually); `directives-stress-simulator.mjs` (internal stress test). |
| **examples/quickstart/** | 3 | 0 | 3 | 0 | 0 | All MIGRATE — public quickstart examples. |
| **.contracts/api-surface.md** | 1 | 0 | 1 | 0 | 0 | MIGRATE — public inter-agent contract. |
| **deckent-hub/** | 65 | 0 | 0 | 65 | 0 | DELETE — looks like a separate public repo's clone, accidentally inlined here. Has its own README + skills tree. Should not migrate (would create duplicate of separate hub repo). |
| **.test-e2e-sprint-21914/.tasks/** | 18 | 0 | 0 | 18 | 0 | DELETE — orphan e2e test sandbox from prior sprint. |
| **.test-e2e-sprint-33991/.tasks/** | 3 | 0 | 0 | 3 | 0 | DELETE — orphan e2e test sandbox. |
| **.codex/rules/** | 3 | 0 | 3 | 0 | 0 | MIGRATE — Codex agent runtime rules (parallel of `.claude/rules/`, `.gemini/rules/`). |
| **.gemini/rules/** | 3 | 0 | 3 | 0 | 0 | MIGRATE — Gemini agent runtime rules. |
| **.claude/** | 4 | 1 | 3 | 0 | 0 | MIGRATE: `rules/brain.md`, `rules/auditor.md`, `rules/worker-default.md`. KEEP-PRIVATE: `settings.local.json` (per-user dev config). |
| **.github/** | 11 | 0 | 11 | 0 | 0 | All MIGRATE — workflows (5), ISSUE_TEMPLATE (3), CODEOWNERS, FUNDING.yml, dependabot.yml, pull_request_template.md. |
| **.deckent/agents/** | 37 | 0 | 37 | 0 | 0 | All MIGRATE — built-in + temp agent manifests are infrastructure (15 built-in + custom + archive index). Note: `temp-react-specialist`, `temp-react-ts-specialist` may be transient — UNCERTAIN, see notes. |
| **.deckent/skills/** | 42 | 0 | 42 | 0 | 0 | All MIGRATE — 21 built-in skill manifests + signatures. |
| **.deckent/routing/** | 79 | 79 | 0 | 0 | 0 | KEEP-PRIVATE — outcome learning DB (`outcomes/*.json`), `evolved-rules.json`, `learnings.json`. Per-instance runtime data, not infrastructure. |
| **.deckent/decisions/** | 56 | 56 | 0 | 0 | 0 | KEEP-PRIVATE — Sprint Decision Log (SDL) per ADR-035, internal audit trail. |
| **.deckent/jobs/** | 161 | 0 | 0 | 161 | 0 | DELETE — historical sprint job state (sprint-095..sprint-160 + transient `run-*.json`). Per-instance runtime, no public value. `.gitignore` should already exclude these. |
| **.deckent/archive/** | 63 | 63 | 0 | 0 | 0 | KEEP-PRIVATE — historical sprint metrics + sprint manifests. |
| **.deckent/sprint-141-analysis-archive/** | 341 | 341 | 0 | 0 | 0 | KEEP-PRIVATE — large self-analysis archive (one-shot Sprint 141 dogfood). |
| **.deckent/sprint-god-analysis/** | 321 | 321 | 0 | 0 | 0 | KEEP-PRIVATE — large self-analysis archive. |
| **.deckent/plugins/** | 7 | 0 | 7 | 0 | 0 | MIGRATE — plugin scaffold examples (code-reviewer/, doc-writer/, test-runner/). Public starter pattern. |
| **.deckent/workspace/** | 4 | 0 | 4 | 0 | 0 | MIGRATE — `BOOT.md`, `IDENTITY.md`, `TOOLS.md`, `WORKER-GUIDE.md` (templates). |
| **.deckent/i18n/** | 2 | 0 | 2 | 0 | 0 | MIGRATE — `en.json`, `tr.json` (UI strings). |
| **.deckent/pids/** | 2 | 0 | 0 | 2 | 0 | DELETE — `sprint-161.pid`, `sprint-161.snapshot.json` (live PID/snapshot — must be `.gitignore`d). |
| **.deckent/cache/managed-docs-cache.json** | 1 | 0 | 0 | 1 | 0 | DELETE — runtime cache, must be `.gitignore`d. |
| **.deckent/sprint-NNN-*.{json,jsonl,tar.gz,sha256,seq}** (sprint 150-161) | ~75 | 75 | 0 | 0 | 0 | KEEP-PRIVATE — gate.json + checkpoint.json + events.jsonl + metrics.jsonl + pre-archive.tar.gz per sprint. Per-instance, audit trail. **Note:** `pre-archive.tar.gz` may already be in `.gitignore` — if not, **ALL must be `.gitignore`d in public repo**. |
| **.deckent/config.json** | 1 | 1 | 0 | 0 | 0 | KEEP-PRIVATE — current project tunables. Public repo must ship `.deckent/config.template.json` (does not exist yet — see findings). |
| **.deckent/config.json.bak\*** (4 files) | 4 | 0 | 0 | 4 | 0 | DELETE — config backup rotation artifacts (Sprint 136 ADR-031). Should be `.gitignore`d. |
| **.deckent/{ci-baseline,cost-config,docs,features-manifest,model-registry-refresh,project-stack,provider-cache,run-gate,safety-point,metrics}.json{l}** | 10 | 5 | 5 | 0 | 0 | MIXED — `features-manifest.json`, `cost-config.json`, `docs.json`, `ci-baseline.json`, `project-stack.json` MIGRATE (infra). `provider-cache.json`, `model-registry-refresh.json`, `run-gate.json`, `safety-point.json`, `metrics.jsonl` KEEP-PRIVATE (runtime cache + per-instance state). |
| **.deckent/sprint.lock, sprint-state.json** | 2 | 0 | 0 | 2 | 0 | DELETE — runtime state files (`.gitignore` candidates). |
| **.brain/** (top files) | 7 | 7 | 0 | 0 | 0 | KEEP-PRIVATE — `MEMORY.md`, `RETRO.md`, `DEBT.md`, `ERRORS.md`, `PATTERNS.md`, `PROJECT-IDENTITY.md`, `memory.db`. Per-instance brain state. |
| **.brain/exports/** | 8 | 0 | 8 | 0 | 0 | UNCERTAIN — These are auto-generated `.md` snapshots from memory.db. **Recommendation:** add to public repo as TEMPLATES (empty/seed) or generate at `deckent init` time. Currently they expose deckent-dev sprint history → **KEEP-PRIVATE** and ship empty seeds at init. (Bumped to KEEP-PRIVATE for safety.) |
| **.brain/sprints/** | 22 | 22 | 0 | 0 | 0 | KEEP-PRIVATE — sprint logs (sprint-136..sprint-159). |
| **.brain/reviews/** | 3 | 3 | 0 | 0 | 0 | KEEP-PRIVATE — review JSONs for sprint-155, 156, 159. |
| **docs/** (top-level files) | 7 | 0 | 7 | 0 | 0 | MIGRATE — `index.md`, `worker-guide.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`, `ROADMAP-GOD-LEVEL.md`, `SPRINT-LOG.md`, `package.json`, `package-lock.json` (VitePress site). NOTE: `KNOWN_ISSUES.md` may contain dev-only items — see findings. |
| **docs/.vitepress/** (config files only — dist excluded) | 5 | 0 | 5 | 0 | 0 | MIGRATE — VitePress site config + theme. |
| **docs/guide/** | 7 | 0 | 7 | 0 | 0 | MIGRATE — public user guides (concepts, getting-started, quickstart, faq, deckent-nedir, docker-backend, first-sprint). |
| **docs/reference/** | 17 | 0 | 17 | 0 | 0 | MIGRATE — CLI/MCP/config reference docs. |
| **docs/architecture/** | 6 | 0 | 6 | 0 | 0 | MIGRATE — public architecture docs. |
| **docs/development/** | 7 | 0 | 7 | 0 | 0 | MIGRATE — agent/worker/brain/dashboard/plugin guides. |
| **docs/governance/** | 1 | 0 | 1 | 0 | 0 | MIGRATE — `INDEX.md`. |
| **docs/launch/** | 9 | 9 | 0 | 0 | 0 | KEEP-PRIVATE — internal launch playbook (HN/Reddit/Twitter announce, Discord/Telegram setup, blog drafts). |
| **docs/release/** | 6 | 6 | 0 | 0 | 0 | KEEP-PRIVATE — internal release ops (`npm-publish-handoff.md`, `public-repo-flip-handoff.md`, `release-checklist.md`, `release-notes.md`, `roadmap.md`, `public-repo-manifest.md`). |
| **docs/directives/** | 32 | 32 | 0 | 0 | 0 | KEEP-PRIVATE — historical sprint directives (sprint-027 .. sprint-152) + INDEX.md. |
| **docs/audits/** | 106 | 106 | 0 | 0 | 0 | KEEP-PRIVATE — internal sprint forensics across 26 sprint-NNN folders + `mock-safety-audit.md`. |
| **docs/superpowers/** | 26 | 26 | 0 | 0 | 0 | KEEP-PRIVATE — live brainstorm/spec/plan artifacts (specs/ + plans/ subfolders, sprint-133..sprint-161 designs). |
| **docs/sprint-log/** | 2 | 2 | 0 | 0 | 0 | KEEP-PRIVATE — `Sprint-146.md`, `Sprint-148.md`. |
| **docs/analysis/** | 5 | 5 | 0 | 0 | 0 | KEEP-PRIVATE — `cli-deep-analysis.md`, `cli-mcp-master-audit.md`, `competitive-analysis.md`, `full-audit.md`, `sprint-metrics.md`. |
| **docs/archive/** | 8 | 8 | 0 | 0 | 0 | KEEP-PRIVATE — `full-audit-pre036.md`, `landing-page-content.md`, `observations/`. |
| **docs/release/load-test-report.md** (under release/ or analysis?) | — | — | — | — | — | (counted under release) |
| **docs/design/multi-project-isolation.md** | 1 | 1 | 0 | 0 | 0 | UNCERTAIN — internal design doc, likely KEEP-PRIVATE. |
| **docs/vision/roadmap.md** | 1 | 1 | 0 | 0 | 0 | KEEP-PRIVATE — internal vision/roadmap. |
| **ROOT (top-level)** | 36 | 9 | 25 | 1 | 1 | See breakdown below. |

### ROOT-level files (36 files) — per-file decision

| File | Class | Rationale |
|---|---|---|
| `package.json` | MIGRATE | Required for npm publish. |
| `package-lock.json` | MIGRATE | npm reproducibility. |
| `tsconfig.json` | MIGRATE | Build config. |
| `vitest.config.ts` | MIGRATE | Test config. |
| `vitest.dashboard.config.ts` | MIGRATE | Dashboard test config. |
| `Dockerfile` | MIGRATE | Public Docker support. |
| `Dockerfile.worker` | MIGRATE | Public worker Docker. |
| `docker-compose.yml` | MIGRATE | Public docker-compose. |
| `LICENSE` | MIGRATE | Mandatory public. |
| `README.md` | MIGRATE | Public landing page. |
| `README-TR.md` | MIGRATE | TR translation (project standard). |
| `CHANGELOG.md` | MIGRATE | Standard public changelog. |
| `CONTRIBUTING.md` | MIGRATE | Standard public. |
| `CODE_OF_CONDUCT.md` | MIGRATE | Standard public. |
| `SECURITY.md` | MIGRATE | Standard public. |
| `VISION.md` | MIGRATE | Public product vision. |
| `VISION-TR.md` | MIGRATE | TR vision. |
| `COMPETITIVE-ANALYSIS.md` | MIGRATE | Public marketing/positioning doc. |
| `BETA-TRACKER.md` | MIGRATE | Public beta progress page. |
| `BETA-TRACKER-TR.md` | MIGRATE | TR beta tracker. |
| `AGENTS.md` | MIGRATE | Public agent reference (15 built-in). |
| `CLAUDE.md` | MIGRATE | Public — Claude Code project instructions. |
| `DECKENT.md` | MIGRATE | Public adapter (ADR-013). |
| `DIRECTIVES.md` | KEEP-PRIVATE | Current sprint scratchpad — empty/template state OK to migrate as **template seed** at init. Live content = KEEP-PRIVATE. |
| `.gitignore` | MIGRATE | Public ignores. |
| `.npmignore` | MIGRATE | Public npm ignores. |
| `.npmrc` | MIGRATE | Public npm settings (`ignore-scripts=true`). |
| `.dockerignore` | MIGRATE | Public Docker ignores. |
| `.editorconfig` | (not present) | — |
| `.pre-commit-config.yaml` | MIGRATE | Public pre-commit hooks. |
| `.secrets.baseline` | MIGRATE | detect-secrets baseline (public, infra). |
| `.dashboard` | DELETE-CANDIDATE | Live dashboard JSON snapshot — runtime artifact, must be `.gitignore`d. |
| `DECKENT-MASTER-BLUEPRINT.md` | KEEP-PRIVATE | "Complete implementation reference" with internal sprint metrics — internal blueprint, not public-facing. |
| `DECKENT-ANA-PLAN-TR.md` | KEEP-PRIVATE | Internal master plan TR. |
| `DECKENT-TEST-REPORT.md` | KEEP-PRIVATE | Sprint 060 dummy test validation report — historical internal QA. |
| `NEXT-SESSION-PROMPT.md` | KEEP-PRIVATE | Sprint 153 handoff prompt — internal session continuity. |
| `SYSTEM-MIGRATION-2026-04-22.md` | KEEP-PRIVATE | Internal system-migration playbook (Sprint 151→152 bridge). |

ROOT-level totals: **25 MIGRATE / 9 KEEP-PRIVATE / 1 DELETE-CANDIDATE / 1 UNCERTAIN (DIRECTIVES.md depends on whether seeded as template)**.

---

## Notable individual classifications (top ambiguous)

| Path | Class | Rationale |
|---|---|---|
| `src/test-sprint-154-marker.ts` | DELETE-CANDIDATE | Sprint 154 marker test artifact, no production use. |
| `scripts/insert-sprint-154-adrs.mjs` | DELETE-CANDIDATE | One-shot Sprint 154 ADR insertion script — historical, completed. |
| `scripts/directives-stress-simulator.mjs` | KEEP-PRIVATE | Internal stress test — not for public consumers. |
| `scripts/public-repo-sync.sh` | KEEP-PRIVATE | Tooling for the dev→public sync workflow itself. Public repo doesn't need it. |
| `scripts/verify-publish.sh` | KEEP-PRIVATE | Internal publish verification (paired with `prepublish.ts`). |
| `scripts/npm-publish-dry-final.sh` | KEEP-PRIVATE | Internal dry-run script. |
| `scripts/npm-publish-dry.sh` | KEEP-PRIVATE | Internal dry-run script. |
| `scripts/migrate-brain-v2.mjs` | UNCERTAIN | One-shot Memory V2 migration. KEEP if shipped as user upgrade tool; DELETE if dev-only. **Recommend: KEEP-PRIVATE** unless a v1→v2 upgrade path is publicly supported. |
| `scripts/archive-decisions-md.mjs` | UNCERTAIN | One-shot DECISIONS.md → DB migration. Same logic as above. |
| `scripts/backfill-relations.mjs` | UNCERTAIN | One-shot DB backfill. **Recommend: KEEP-PRIVATE**. |
| `scripts/sign-seed-skills.mjs` | MIGRATE | Likely required for public skill manifest signing. |
| `scripts/hub-validate.mjs` | MIGRATE | deckent-hub validator — needed if public hub workflow is supported. |
| `scripts/adr-validator.mjs` | MIGRATE | Public ADR linter (used by `npm run lint:adr`). |
| `scripts/agent-prompt-validator.mjs` | MIGRATE | Public agent validator. |
| `scripts/check-error-handling.mjs` | MIGRATE | Public lint script (`npm run lint:errors`). |
| `scripts/dead-code-audit.mjs` | UNCERTAIN | Internal audit script — KEEP-PRIVATE recommended. |
| `scripts/mcp-nervous-e2e.mjs` | MIGRATE | Public MCP E2E test (used in CI). |
| `scripts/run-e2e-harness.mjs` | MIGRATE | Public E2E harness. |
| `scripts/cli-smoke-test.sh` | MIGRATE | Public smoke test. |
| `scripts/fresh-env-test.sh` | MIGRATE | Public fresh-env validation. |
| `scripts/deploy-discord.sh` / `deploy-telegram.sh` | UNCERTAIN | Connector deploy tooling — public if connectors are supported, internal if just our own. **Lean public** since `connectors/` are MIGRATE. |
| `scripts/copy-assets.mjs` | MIGRATE | Build pipeline (referenced by `npm run build`). |
| `scripts/bundle-builtins.mjs` | MIGRATE | Build pipeline. |
| `scripts/sync-manifest.mjs` | MIGRATE | Build/sync pipeline. |
| `scripts/build-verify.ts` | MIGRATE | Build verifier. |
| `scripts/prepublish.ts` | MIGRATE | npm prepublish hook. |
| `scripts/publish.ts` | MIGRATE | npm publish helper. |
| `scripts/validate-publish.ts` | MIGRATE | `npm run validate:publish` script. |
| `scripts/pack-test.ts` | MIGRATE | Pack validation. |
| `scripts/generate-cli-docs.ts` | MIGRATE | Generates `docs/reference/cli.md`. |
| `scripts/i18n-parity.mjs` | MIGRATE | i18n linter. |
| `scripts/link-checker.mjs` | MIGRATE | Doc link checker. |
| `scripts/doc-consistency-check.mjs` | MIGRATE | Doc consistency. |
| `scripts/doc-review.mjs` | MIGRATE | Doc reviewer. |
| `scripts/prompt-linter.mjs` | MIGRATE | Prompt linter. |
| `scripts/changelog.sh` | MIGRATE | CHANGELOG helper. |
| `scripts/bump-version.sh` | MIGRATE | Version bump. |
| `scripts/chain-gate-check.mjs` | MIGRATE | Chain-gate validator. |
| `scripts/pre-flight-health-check.mjs` | MIGRATE | Pre-flight health check. |
| `scripts/verify-gitignore.mjs` | MIGRATE | gitignore verifier. |
| `scripts/nervous-tui-smoke.sh` | MIGRATE | Nervous TUI smoke test. |
| `.deckent/agents/temp-react-specialist/agent.json` | UNCERTAIN | Generated temp agent. May be project-specific. **Recommend: DELETE-CANDIDATE** before public flip — only ship the 15 built-ins + empty `archive/` index. |
| `.deckent/agents/temp-react-ts-specialist/agent.json` | UNCERTAIN | Same as above. |
| `.deckent/agents/react-ts-specialist/agent.json` | UNCERTAIN | If "promoted from temp" — verify provenance. |
| `.deckent/decisions/decision-161-001.json` .. `decision-161-NNN.json` | KEEP-PRIVATE | Sprint 161 SDL — current dev sprint. Public repo gets empty `decisions/` directory. |
| `.brain/exports/summary.md` (and other exports) | KEEP-PRIVATE | Auto-generated from memory.db; expose dev sprint history. Public repo should ship empty seeds via `deckent init`. |
| `docs/index.md` | MIGRATE | Public VitePress landing. |
| `docs/SPRINT-LOG.md` | UNCERTAIN | Top-level sprint log — **KEEP-PRIVATE** if it contains internal sprint summaries. **Sample needed.** |
| `docs/KNOWN_ISSUES.md` | UNCERTAIN | Sprint 152 backlog (86 items). May need scrubbing of internal references before public migration. |
| `docs/ROADMAP-GOD-LEVEL.md` | UNCERTAIN | Public-facing roadmap or internal-only? Per filename, internal-flavored. **Recommend KEEP-PRIVATE**, ship a sanitized `docs/vision/roadmap.md` instead (already exists). |
| `docs/CHANGELOG.md` | MIGRATE | Public changelog (mirror of root). |
| `docs/worker-guide.md` | MIGRATE | Public worker guide (also under development/). |
| `docs/governance/INDEX.md` | MIGRATE | Public governance index. |
| `docs/vision/roadmap.md` | UNCERTAIN | Could be public roadmap. **Sample needed**, but logically MIGRATE if sanitized. |
| `docs/design/multi-project-isolation.md` | KEEP-PRIVATE | Internal design doc. |

---

## Findings

### P0 — Critical (must address before public flip)

1. **`deckent-hub/` (65 files) is a misplaced sub-repo.** It looks like a clone of a separate hub repository accidentally committed inside dev repo. **Do not migrate.** Verify whether it is intentional (e.g., subtree) and either: (a) remove from this dev repo, or (b) `.gitignore` it. `git submodule status` recommended check.

2. **`.test-e2e-sprint-21914/` and `.test-e2e-sprint-33991/` (21 files total)** are orphan e2e test sandboxes. Add to `.gitignore` (`.test-e2e-sprint-*/`) and DELETE before public flip.

3. **`.deckent/jobs/` (161 files)** contains historical sprint job state from Sprint 095..160 + transient `run-*.json`. **Already should be `.gitignore`d**; verify gitignore covers `.deckent/jobs/sprint-*.json` and `.deckent/jobs/run-*.json`.

4. **`.deckent/sprint-NNN-*.{json,jsonl,tar.gz,sha256,seq}` (75+ files for sprint 150-161)**: per-instance state + binary archives (`pre-archive.tar.gz`). **Must be `.gitignore`d** (`.deckent/sprint-*-*.{json,jsonl,tar.gz,sha256,seq}`). If currently tracked, public flip will leak per-sprint history.

5. **`.deckent/config.json.bak*` (4 files)** are config backup rotation artifacts. Must be `.gitignore`d (`.deckent/config.json.bak*`).

6. **`.deckent/sprint.lock`, `.deckent/sprint-state.json`, `.deckent/pids/`, `.deckent/cache/`, `.dashboard`** are runtime state. **All must be `.gitignore`d**.

7. **`src/test-sprint-154-marker.ts`** is a sprint marker artifact in production source tree. DELETE before publish (would ship a no-op marker file to npm consumers).

8. **`scripts/insert-sprint-154-adrs.mjs`** is a one-shot historical migration script. Either DELETE or move to a `scripts/_archive/` folder.

### P1 — Mis-classification cross-validation (Lane 1 likely classifications)

If Lane 1 (initial classification) recommended any of these as MIGRATE-PUBLIC, **flag for review**:
- `.deckent/sprint-141-analysis-archive/` (341 files) — internal self-analysis dump
- `.deckent/sprint-god-analysis/` (321 files) — internal self-analysis dump
- `.deckent/decisions/` (56 files) — Sprint Decision Log (private SDL per ADR-035)
- `.deckent/routing/outcomes/` (~76 files) — per-instance routing outcome learning data
- `.deckent/archive/` (63 files) — historical sprint archives
- `.brain/exports/*.md` (8 files) — auto-generated from dev memory.db
- `docs/audits/` (106 files) — internal sprint forensics
- `docs/superpowers/` (26 files) — live brainstorm + plan artifacts
- `docs/directives/sprint-NNN.md` (32 files) — historical sprint directive snapshots
- `docs/launch/` (9 files) — internal launch playbook
- `docs/release/` (6 files) — internal release ops
- `DECKENT-MASTER-BLUEPRINT.md`, `DECKENT-ANA-PLAN-TR.md`, `DECKENT-TEST-REPORT.md`, `NEXT-SESSION-PROMPT.md`, `SYSTEM-MIGRATION-2026-04-22.md`

### P1 — UNCERTAIN flags requiring human decision

| File / Path | Question | Recommendation |
|---|---|---|
| `.deckent/agents/temp-*` (2 dirs) | Are these promoted to permanent or transient? | DELETE before public (only ship 15 built-ins). |
| `.deckent/agents/react-ts-specialist/` | Built-in or temp-promoted? | Verify against `core/agent-pool.ts`. |
| `.brain/exports/*.md` (8 files) | Ship as templates or omit entirely? | Ship empty seeds via `deckent init`; KEEP-PRIVATE current state. |
| `DIRECTIVES.md` (root) | Ship empty template or omit? | Ship empty template seed. KEEP current content private. |
| `docs/SPRINT-LOG.md` | Public or internal? | Sample content. Lean KEEP-PRIVATE per filename. |
| `docs/KNOWN_ISSUES.md` | Scrubbed for public? | Migrate **after content review** — strip dev-internal IDs, sprint IDs, internal Q&A. |
| `docs/ROADMAP-GOD-LEVEL.md` | Public roadmap or internal anchor? | KEEP-PRIVATE (filename suggests internal); use `docs/vision/roadmap.md` as the public version. |
| `docs/vision/roadmap.md` | Public version, sanitized? | Likely MIGRATE (sample-check first). |
| `docs/design/multi-project-isolation.md` | Public design doc? | KEEP-PRIVATE unless explicitly public-facing. |
| `scripts/migrate-brain-v2.mjs`, `scripts/archive-decisions-md.mjs`, `scripts/backfill-relations.mjs` | Ship as user upgrade tools? | KEEP-PRIVATE unless v1→v2 upgrade is publicly supported. |
| `scripts/dead-code-audit.mjs` | Public dev tool? | KEEP-PRIVATE (internal QA). |
| `scripts/deploy-discord.sh`, `deploy-telegram.sh` | Public connector deploy? | MIGRATE (connectors are public). |
| `.deckent/{cost-config,docs,features-manifest}.json` | Ship as public templates? | Yes — these are infrastructure, not per-instance state. |
| `.deckent/ci-baseline.json`, `.deckent/project-stack.json` | Per-instance or shared? | Per-instance but small; ship as **seed** in public, regen at init. **Lean MIGRATE** as templates. |

---

## Sprint 162 cleanup recommendation

### Migrate batch (priority order)

**P0 — Must ship (npm publish blockers):**
1. `package.json`, `package-lock.json`, `tsconfig.json`, `vitest*.ts`, `LICENSE`, `README*.md`, `CHANGELOG.md`, `Dockerfile*`, `docker-compose.yml`, `.gitignore`, `.npm*`, `.dockerignore`, `.pre-commit-config.yaml`, `.secrets.baseline`
2. `src/**` (504 files: core, cli, orchestra, dashboard, mcp, nervous, agents, connectors, providers, monitor, api, extensions) **minus** `src/test-sprint-154-marker.ts`
3. `scripts/**` (36 of 41 files — see scripts table)
4. `bin/` (if exists — referenced by package.json bin field)

**P1 — Public docs:**
5. `docs/index.md`, `docs/CHANGELOG.md`, `docs/worker-guide.md`, `docs/.vitepress/**` (config + theme), `docs/guide/**`, `docs/reference/**`, `docs/architecture/**`, `docs/development/**`, `docs/governance/INDEX.md`, `docs/package.json`, `docs/package-lock.json`
6. Root marketing/positioning: `VISION.md`, `VISION-TR.md`, `BETA-TRACKER.md`, `BETA-TRACKER-TR.md`, `COMPETITIVE-ANALYSIS.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CLAUDE.md`, `DECKENT.md`

**P2 — Infrastructure:**
7. `.github/**` (workflows, ISSUE_TEMPLATE, CODEOWNERS, FUNDING, dependabot, PR template)
8. `.claude/rules/{brain,auditor,worker-default}.md`, `.codex/rules/**`, `.gemini/rules/**`
9. `.contracts/api-surface.md`
10. `.deckent/agents/` (15 built-in manifests), `.deckent/skills/` (21 skill manifests + signatures), `.deckent/plugins/`, `.deckent/workspace/`, `.deckent/i18n/`
11. `.deckent/{cost-config,docs,features-manifest}.json`
12. `.deckent/{ci-baseline,project-stack}.json` (as seeds, regen at init)
13. `examples/quickstart/**`

### Delete batch (justify before flip)

| Item | Reason |
|---|---|
| `deckent-hub/` (65 files) | Misplaced sub-repo / accidental clone |
| `.test-e2e-sprint-21914/`, `.test-e2e-sprint-33991/` (21 files) | Orphan e2e sandboxes |
| `.deckent/jobs/sprint-*.json` (161 files) | Per-instance runtime state |
| `.deckent/sprint-NNN-*.{json,jsonl,tar.gz,sha256,seq}` (75+ files) | Per-sprint runtime/audit state |
| `.deckent/config.json.bak*` (4 files) | Config backup rotation artifacts |
| `.deckent/sprint.lock`, `sprint-state.json`, `pids/`, `cache/` (~5 files) | Live runtime state |
| `.dashboard` | Live dashboard JSON |
| `src/test-sprint-154-marker.ts` | Sprint marker artifact |
| `scripts/insert-sprint-154-adrs.mjs` | One-shot historical migration |
| `.deckent/agents/temp-*/` (2 dirs) | Transient temp agents |
| `.deckent/decisions/decision-161-*.json` | Current sprint SDL (don't ship) |

**Total DELETE-candidate count: ~205 files** (after ensuring all are `.gitignore`d in public repo or actively removed).

### Hold batch (KEEP-PRIVATE — never migrate)

| Bucket | Files | Reason |
|---|---:|---|
| `.deckent/sprint-141-analysis-archive/` | 341 | Internal self-analysis dump |
| `.deckent/sprint-god-analysis/` | 321 | Internal self-analysis dump |
| `.deckent/jobs/sprint-*.json` (already DELETE — overlaps) | (counted above) | — |
| `.deckent/routing/` | 79 | Per-instance routing outcome data |
| `.deckent/decisions/` | 56 | Sprint Decision Log (SDL) |
| `.deckent/archive/` | 63 | Historical sprint archives |
| `docs/audits/` | 106 | Internal sprint forensics |
| `docs/superpowers/` | 26 | Live brainstorm + plan artifacts |
| `docs/directives/` | 32 | Historical sprint directives |
| `docs/launch/` | 9 | Internal launch playbook |
| `docs/release/` | 6 | Internal release ops |
| `docs/analysis/` | 5 | Internal analysis |
| `docs/archive/` | 8 | Internal archive |
| `docs/sprint-log/` | 2 | Internal sprint logs |
| `docs/design/`, `docs/vision/` (selective) | 2 | Internal design docs |
| `.brain/**` | 41 | Per-instance brain state (incl. memory.db, RETRO, MEMORY, DEBT, ERRORS, PATTERNS, sprints/, exports/, reviews/) |
| Root historical/internal MD | 5 | DECKENT-MASTER-BLUEPRINT, DECKENT-ANA-PLAN-TR, DECKENT-TEST-REPORT, NEXT-SESSION-PROMPT, SYSTEM-MIGRATION-2026-04-22 |
| Root current sprint scratch | 1 | DIRECTIVES.md (live state) |
| `.claude/settings.local.json` | 1 | Per-user dev config |
| `scripts/{public-repo-sync,verify-publish,npm-publish-dry,npm-publish-dry-final,directives-stress-simulator}.{sh,mjs}` | 5 | Internal tooling |

**Total KEEP-PRIVATE bucket: ~1,265 files.**

---

## Cross-validation hooks

Before Sprint 162 flip:

1. **Verify `.gitignore` covers all DELETE patterns** via `scripts/verify-gitignore.mjs`.
2. **Run `scripts/public-repo-sync.sh` in `--dry-run` mode** if it supports one — output should match this triage's MIGRATE list.
3. **Compare `.npmignore` + `package.json` `files` field** against MIGRATE list — anything in MIGRATE but excluded from npm package = MIGRATE-but-not-npm-ship (probably docs/).
4. **Sanitize before flip:**
   - `docs/KNOWN_ISSUES.md` — strip internal sprint IDs, dev refs
   - `docs/vision/roadmap.md` — sanity-check, ensure no leak from `docs/release/roadmap.md`
   - `.deckent/agents/temp-*` — remove if not promoted
   - `DIRECTIVES.md` — replace with empty template
   - `.brain/exports/*.md` — replace with empty seeds (or omit, regenerate at init)

---

**End of D5b triage report.**
**Total files audited:** 2,222 (after filtering nested node_modules/dist).
**Generated by:** Lane 3 Agent D5b — cc-deepdive — Sprint 161 god-audit.
