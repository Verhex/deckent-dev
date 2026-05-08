# Sprint 161 — Public-Repo Migration Plan (Sprint 162+ input)

**Generated:** 2026-05-08
**Source repo:** `/home/alperen/deckent-dev` (SECRET dev repo)
**Target repo:** `VerhexIO/deckent` (PUBLIC, NPM-published)
**Source matrix:** `docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md`
**Migration tooling:** `scripts/public-repo-sync.sh` (KEEP-PRIVATE)

> **Status precondition:** This plan is the **manifest of WHAT to migrate**.
> The actual flip should NOT happen until Sprint 162 hot fix wave lands
> (orchestration repair + recover repair + identity-drift cleanup). See
> `EXECUTIVE-SUMMARY.md §9 Beta GA gate impact`.

---

## 1. Migrate to `VerhexIO/deckent` (public repo) — ordered manifest

### Phase A — npm publish blockers (Sprint 162 must-ship)

**Order of operations:** these files MUST be present in the public repo
before `npm publish` succeeds.

1. **Build manifest:** `package.json`, `package-lock.json`, `tsconfig.json`,
   `vitest.config.ts`, `vitest.dashboard.config.ts`
2. **Standard public root:** `LICENSE`, `README.md`, `README-TR.md`,
   `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
3. **Source tree (504 files, MIGRATE-PUBLIC):**
   - `src/core/` (177)
   - `src/cli/` (95)
   - `src/orchestra/` (92, MINUS `handoff-protocol.ts` + `brain-context.ts` if Sprint 162 deletes)
   - `src/dashboard/` (64)
   - `src/mcp/` (42)
   - `src/nervous/` (21)
   - `src/agents/` (20)
   - `src/connectors/` (8)
   - `src/providers/` (5)
   - `src/monitor/` (4)
   - `src/api/` (4)
   - `src/extensions/vscode/` (2)
   - **EXCLUDE:** `src/test-sprint-154-marker.ts` (DELETE)
4. **Build/publish scripts (36 of 41 files, MIGRATE-PUBLIC):**
   - All entries in MIGRATION-TRIAGE-MATRIX.md §B except the 5 KEEP-PRIVATE
     scripts (`public-repo-sync.sh`, `verify-publish.sh`,
     `npm-publish-dry.sh`, `npm-publish-dry-final.sh`,
     `directives-stress-simulator.mjs`) and 1 DELETE-CANDIDATE
     (`insert-sprint-154-adrs.mjs`)
5. **Docker:** `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml`,
   `.dockerignore`
6. **npm metadata:** `.npmignore`, `.npmrc`
7. **`bin/`** (if exists — referenced by `package.json` `bin` field)

### Phase B — Public docs

8. **Marketing/positioning root:** `VISION.md`, `VISION-TR.md`,
   `BETA-TRACKER.md`, `BETA-TRACKER-TR.md`, `COMPETITIVE-ANALYSIS.md`,
   `AGENTS.md`
9. **Agent project instructions:** `CLAUDE.md`, `DECKENT.md`
   - **PRECONDITION:** D5a P0-1..3 fixes applied (CLI/MCP/sprint counts
     regenerated via `scripts/regen-claim-counts.mjs` — Sprint 162 task)
10. **`docs/` public surface:**
    - `docs/index.md`
    - `docs/CHANGELOG.md`
    - `docs/worker-guide.md` (after D5a P1-1 dedup with
      `docs/development/worker-guide.md`)
    - `docs/.vitepress/` (5 config files)
    - `docs/guide/` (7 files — after D6 fix updates docker-backend.md:186)
    - `docs/reference/` (17 files — after D5a P1-3 reduction of 6 CLI-ref
      files to canonical signpost)
    - `docs/architecture/` (6 files — after D5a P1-5 dedup of agents.md)
    - `docs/development/` (7 files)
    - `docs/governance/INDEX.md`
    - `docs/vision/roadmap.md` (after sample-content sanitize)
    - `docs/package.json`, `docs/package-lock.json`

### Phase C — Infrastructure

11. **CI/CD:** `.github/workflows/` (5), `.github/ISSUE_TEMPLATE/` (3),
    `.github/CODEOWNERS`, `FUNDING.yml`, `dependabot.yml`,
    `pull_request_template.md`
12. **Agent runtime rules:** `.claude/rules/{brain,auditor,worker-default}.md`,
    `.codex/rules/` (3), `.gemini/rules/` (3)
    - **PRECONDITION:** D5a P0-5 fix applied (regenerate ADR injection from
      `.brain/exports/decisions.md` so 45 ADRs are present, not 42)
13. **Contracts:** `.contracts/api-surface.md`
    - **PRECONDITION:** D8 P2 fix applied (sync V1 task schema → V2)
14. **Pre-commit:** `.pre-commit-config.yaml`, `.secrets.baseline`
15. **`.editorconfig`** (if exists)
16. **`.gitignore`** (PUBLIC version — extended to cover all DELETE patterns
    from §3 below)

### Phase D — `.deckent/` infrastructure (templates + manifests)

17. `.deckent/agents/` (15 built-in agent dirs + manifests)
    - **EXCLUDE:** `temp-react-specialist/`, `temp-react-ts-specialist/`,
      `archive/temp-*` (zombie temps — DELETE per Sprint 162)
18. `.deckent/skills/` (21 skill dirs + manifests + signatures)
19. `.deckent/plugins/` (7 files — plugin scaffold examples)
20. `.deckent/workspace/` (`BOOT.md`, `IDENTITY.md`, `TOOLS.md`,
    `WORKER-GUIDE.md` — templates)
    - **PRECONDITION:** D8 P0 fix applied (auto-regenerate IDENTITY.md
      from `config.json` + agent-pool stats)
21. `.deckent/i18n/` (`en.json`, `tr.json`)
22. `.deckent/cost-config.json`, `.deckent/docs.json`,
    `.deckent/features-manifest.json`
23. `.deckent/ci-baseline.json` (as **fresh seed** — Sprint 162 rerun pristine
    test suite first; current `testFailed=24, coverage=0` must NOT ship)
24. `.deckent/project-stack.json` (as seed; regen at user `deckent init`)
25. `.deckent/config.template.json` (NEW FILE — Sprint 162 to create as
    sanitized template; current `.deckent/config.json` is KEEP-PRIVATE)

### Phase E — Examples

26. `examples/quickstart/` (3 files)

---

## 2. Keep in dev repo only (KEEP-PRIVATE — never migrate)

These files are the **dev repo's private state**. They must NOT appear in the
public repo at any point. The list below is non-exhaustive; see
MIGRATION-TRIAGE-MATRIX.md for full classification.

### Internal documentation (NOT for public consumption)

- **Root:** `DECKENT-MASTER-BLUEPRINT.md`, `DECKENT-ANA-PLAN-TR.md`,
  `DECKENT-TEST-REPORT.md`, `NEXT-SESSION-PROMPT.md`,
  `SYSTEM-MIGRATION-2026-04-22.md`, `DIRECTIVES.md` (live)
  - Reason: internal blueprint with sprint metrics / one-shot playbooks /
    handoff prompts / live scratchpad
- **`docs/launch/`** (9 files) — internal launch playbook
- **`docs/release/`** (6 files) — internal release ops
- **`docs/directives/`** (32 files) — historical directive snapshots
- **`docs/audits/`** (107 files across 26 sprint-NNN dirs + sibling files) —
  internal sprint forensics
- **`docs/superpowers/`** (26 files in specs/ + plans/) — live brainstorm
  artifacts
- **`docs/sprint-log/`** (2 files) — abandoned dir
- **`docs/analysis/`** (5 files) — internal analysis
- **`docs/archive/`** (8 files) — internal archive
- **`docs/design/multi-project-isolation.md`** — internal design doc
- **`docs/SPRINT-LOG.md`** — 145 KB internal sprint log monolith
- **`docs/ROADMAP-GOD-LEVEL.md`** — internal roadmap (use
  `docs/vision/roadmap.md` as public version)

### Internal scripts

- `scripts/public-repo-sync.sh`
- `scripts/verify-publish.sh`
- `scripts/npm-publish-dry.sh`
- `scripts/npm-publish-dry-final.sh`
- `scripts/directives-stress-simulator.mjs`
- `scripts/dead-code-audit.mjs`
- `scripts/migrate-brain-v2.mjs` (UNCERTAIN; lean KEEP unless v1→v2 upgrade
  publicly supported)
- `scripts/archive-decisions-md.mjs` (UNCERTAIN; lean KEEP)
- `scripts/backfill-relations.mjs` (UNCERTAIN; lean KEEP)

### `.deckent/` per-instance state (private)

- `.deckent/config.json` (live — ship `.deckent/config.template.json` instead)
- `.deckent/decisions/` (per-sprint SDL)
- `.deckent/routing/` (outcomes/learnings DB)
- `.deckent/archive/` (historical sprint archives)
- `.deckent/sprint-141-analysis-archive/` (341 files — internal Sprint 141
  self-analysis)
- `.deckent/sprint-god-analysis/` (321 files — internal Sprint 139
  self-analysis)
- `.deckent/provider-cache.json`, `.deckent/model-registry-refresh.json`,
  `.deckent/run-gate.json`, `.deckent/safety-point.json`,
  `.deckent/metrics.jsonl`

### `.brain/` per-instance state (private)

- `.brain/MEMORY.md`, `RETRO.md`, `DEBT.md`, `ERRORS.md`, `PATTERNS.md`,
  `PROJECT-IDENTITY.md`
- `.brain/memory.db` + `memory.db-shm` + `memory.db-wal`
- `.brain/exports/` (8 files — auto-regenerated at `deckent init`)
- `.brain/sprints/sprint-NNN.md` (22 files)
- `.brain/reviews/` (3 files)
- `.brain/archive/` (271 files)

### Other private

- `.claude/settings.local.json`
- `deckent-hub/` (65 files — DELETE before flip per §3 below)

---

## 3. Delete candidates (Sprint 162+) — list with rationale

These files should be **removed from the working tree** in Sprint 162. Some
are also `.gitignore` candidates (live runtime state); some are pure cruft.

### 3.1 P0 — Must remove before public flip (DELETE candidates)

| Bucket | Count | Rationale | Recommended action |
|--------|------:|-----------|--------------------|
| **`deckent-hub/`** | 65 | D5b P0-1: misplaced sub-repo / accidental clone of separate hub repo. Has its own README + skills tree. | `git submodule status` first; if not a submodule, `git rm -r deckent-hub/` + add to `.gitignore` |
| **`.test-e2e-sprint-21914/.tasks/`** | 18 | Orphan e2e test sandbox | `git rm -rf .test-e2e-sprint-21914/`; add `.test-e2e-sprint-*/` to `.gitignore` |
| **`.test-e2e-sprint-33991/.tasks/`** | 3 | Orphan e2e test sandbox | Same |
| **`src/test-sprint-154-marker.ts`** | 1 | D2 F5 + D5b: ships in `dist/`, leaks to npm. | `git rm src/test-sprint-154-marker.ts`; rebuild + verify `dist/test-sprint-154-marker.js` is gone |
| **`scripts/insert-sprint-154-adrs.mjs`** | 1 | One-shot historical migration | `git mv` to `scripts/_archive/` OR `git rm` |
| **`.deckent/agents/temp-react-specialist/`** + **`temp-react-ts-specialist/`** | 2 dirs | D8 P1: zombie temps (0 uses; LRU eviction broken) | `git rm -r .deckent/agents/temp-*` |
| **`.deckent/agents/archive/temp-react-specialist/`** + **`archive/temp-react-ts-specialist/`** | 2 dirs | Duplicates of active temps | `git rm -r .deckent/agents/archive/temp-*` |
| **`.deckent/config.json.bak*`** | 4 | D8 P2: 14-day-stale config backups | `git rm .deckent/config.json.bak*`; add pattern to `.gitignore` |
| **`.brain/archive/pre-v2/DECISIONS.md`** | 1 (96 KB) | D5a P3: byte-identical to `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md` | Pick canonical, delete other |

### 3.2 P0 — `.gitignore` `.deckent/` runtime state

These files are runtime artifacts. They should **not** be tracked. Verify
`.gitignore` covers them; if currently tracked, `git rm --cached`.

| Pattern | Count | Rationale |
|---------|------:|-----------|
| `.deckent/jobs/sprint-*.json`, `.deckent/jobs/run-*.json` | 161 files | D5b P0-3: per-instance runtime state |
| `.deckent/sprint-*-*.{json,jsonl,tar.gz,sha256,seq}` | ~75 | D5b P0-4: per-sprint runtime/audit state + binary archives |
| `.deckent/sprint.lock` | 1 | Live runtime |
| `.deckent/sprint-state.json` | 1 | Live runtime |
| `.deckent/pids/sprint-*.{pid,snapshot.json}` | 2 | Live PID/snapshot |
| `.deckent/cache/managed-docs-cache.json` | 1 | Runtime cache |
| `.dashboard` (root) | 1 | Live dashboard JSON |

### 3.3 P1 — Doc-pollution cleanup (Sprint 163 — see ROADMAP-PATCH.md)

These don't block the public flip but should clean up before "production"
docs site. Tracked separately in SPRINT-162-DIRECTIVES-DRAFT.md theme
"HIGH: Documentation pollution cleanup".

- 17 stamp-pad `load-test-report.md` files (sprints 143-160) → consolidate
  into `docs/audits/load-test-history.md` rolling log
- `docs/audits/sprint-148/` + `sprint-149/` + `sprint-150/` 3-clone
  (`doc-review-report.md` + `i18n-parity` + `npm-publish-dry-final.md`) →
  diff-and-keep-latest, archive others
- `docs/audits/sprint-152/` 27-file T-152-NNN cluster → archive to
  `docs/archive/sprint-152-historical/`
- `docs/audits/sprint-132/` 7-file 256 KB monolith → consolidate into
  single `EXECUTIVE-SUMMARY.md`
- `.deckent/sprint-141-analysis-archive/` + `.deckent/sprint-god-analysis/`
  → move to `docs/archive/sprint-snapshots/sprint-{141,139}/`
- `docs/directives/` (frozen at sprint-145) → either revive auto-mirror
  from `.brain/archive/DIRECTIVES-sprint-*` OR archive with `DEPRECATED.md`

---

## 4. Required structural changes

### 4.1 `.brain/` replacement strategy

The dev repo's `.brain/` directory is per-instance state. The public repo
**should not** ship the dev's brain history. Two options:

**Option A — Empty seeds at `deckent init` (recommended):**
- Public repo ships `.deckent/workspace/BOOT.md` + `IDENTITY.md` (templates)
- `deckent init` creates fresh `.brain/memory.db` from
  `scripts/migrate-brain-v2.mjs` (or built-in seed function)
- `.brain/exports/*.md` are auto-generated from the fresh DB

**Option B — `.brain.example/` directory:**
- Public repo ships a `.brain.example/` tree with template `MEMORY.md`,
  `RETRO.md`, etc. (empty/seed content)
- `deckent init` copies `.brain.example/` → `.brain/`
- Less elegant; harder to keep in sync with auto-export shape

**Decision:** Option A. Add a `seed-brain` step to `deckent init`.

### 4.2 `DIRECTIVES.md` template

- Public repo ships an empty `DIRECTIVES.md` template (similar to current
  pre-Sprint-160 state).
- `deckent set-directives` is the canonical way to write into it.

### 4.3 `.gitignore` extensions

The public repo's `.gitignore` must cover (in addition to current dev repo):

```
# Public-flip additions (Sprint 162)
.deckent/jobs/
.deckent/sprint-*-*.{json,jsonl,tar.gz,sha256,seq}
.deckent/sprint.lock
.deckent/sprint-state.json
.deckent/pids/
.deckent/cache/
.deckent/config.json.bak*
.deckent/decisions/
.deckent/routing/
.deckent/provider-cache.json
.deckent/model-registry-refresh.json
.deckent/safety-point.json
.deckent/run-gate.json
.deckent/metrics.jsonl
.dashboard
.test-e2e-sprint-*/
deckent-hub/
```

Run `scripts/verify-gitignore.mjs` after applying.

### 4.4 `.npmignore` audit

Confirm `dist/` ships, but excludes:
- `dist/test-sprint-154-marker.js` (will be auto-removed once D2-F5 fix lands
  and `src/test-sprint-154-marker.ts` is deleted)
- Any future `dist/test-*-marker.js` artifacts

### 4.5 `package.json` `files` field cross-check

Verify the `files` field in `package.json` matches the MIGRATE-PUBLIC list.
Specifically should include:
- `dist/`
- `bin/`
- `scripts/copy-assets.mjs` (if needed at install time)
- `.deckent/agents/`, `.deckent/skills/`, `.deckent/plugins/`,
  `.deckent/workspace/`, `.deckent/i18n/` (built-in infrastructure shipped)
- `.contracts/`
- `examples/`
- `LICENSE`, `README.md`, `README-TR.md`, `CHANGELOG.md`,
  `CLAUDE.md`, `DECKENT.md`, `AGENTS.md`, `VISION.md`, `VISION-TR.md`,
  `BETA-TRACKER.md`, `BETA-TRACKER-TR.md`, `COMPETITIVE-ANALYSIS.md`,
  `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`

---

## 5. Order of operations (dependency-aware)

The public flip must happen in this order to avoid corrupted intermediate state:

1. **Sprint 162 hot-fix wave** (orchestration repair + recover repair).
   Without this, the dev repo's pipeline is broken — cannot validate that the
   migrated code base produces a healthy sprint.
2. **Sprint 162 cleanup wave** (DELETE-CANDIDATE removal: §3.1 P0 list).
   This shrinks the working tree by ~205 files.
3. **Sprint 162 fix waves** (D5a/D5b/D6/D8/D9 P0 fixes — see
   SPRINT-162-DIRECTIVES-DRAFT.md):
   - D5a regen-claim-counts script + publish-gate
   - D5a Sprint 154 T-010 archival (3 root MDs to `docs/archive/sprint-152/`)
   - D5a CHANGELOG reconciliation
   - D5a `.claude/rules/*.md` ADR injection regeneration (42→45)
   - D5b 4-file gitignore extensions + verify
   - D6 generator-naming alignment (Plan A: rename to `.prompt-task-*` /
     `.worker-task-*`)
   - D8 identity convergence (auto-regen PROJECT-IDENTITY.md)
   - D8 ci-baseline pristine rerun
   - D9 F13 shell-injection migration (worker-verify + mid-sprint-adapter)
4. **Sprint 162 validation:** controlled smoke sprint (1 task) to confirm
   pipeline-health gate passes.
5. **Sprint 162.x flip:**
   - Run `scripts/public-repo-sync.sh --dry-run`; verify output matches
     this manifest
   - Run flip
   - In public repo: `npm run build:all`, `npm test`, `npm run validate:publish`
   - `git tag v1.0.0-beta.NN`, push tags
   - `gh release create` (release.yml triggers on tag push)
6. **`npm publish`** — manual by Alperen (per memory: npm publish approval).
7. **Post-flip validation:**
   - Fresh-env install: `npm install -g deckent`; run `deckent doctor`
   - Smoke sprint in fresh project
8. **Sprint 163+ doc cleanup waves** (Sprint 163-167 per D5a §5 phased plan).

---

## 6. Validation checklist

Before flip:

- [ ] Sprint 162 hot fix wave landed (8 P0 orchestration + recover bugs fixed)
- [ ] All P0 DELETE-CANDIDATEs removed from working tree
- [ ] `.gitignore` covers all P0 patterns from §3.2
- [ ] `scripts/verify-gitignore.mjs` exits 0
- [ ] D5a P0-1..7 contradictions resolved
- [ ] `.brain/exports/decisions.md` regenerated atomically (D7 P1-B fix)
- [ ] D8 PROJECT-IDENTITY.md auto-regen wired
- [ ] `ci-baseline.json` shows `testFailed=0, coverage>=N%` (N from baseline)
- [ ] `npm audit --audit-level=high` returns 0 advisories (D1 fix wave)
- [ ] `npm run lint:adr` passes (D3 ADR-010 amended)
- [ ] D6 generator-consumer naming aligned (Plan A executed)
- [ ] D9 F13 shell-injection migrated to `execFileSync`
- [ ] Controlled smoke sprint produced 1 PASS task end-to-end
- [ ] `scripts/public-repo-sync.sh --dry-run` output matches this manifest
- [ ] Public repo `npm run build:all` clean
- [ ] Public repo `npm test` 12,485 pass + 16 skipped
- [ ] Public repo `npm run validate:publish` passes
- [ ] Fresh-env install validates (`scripts/fresh-env-test.sh`)

---

*End PUBLIC-REPO-MIGRATION-PLAN.md — 2026-05-08*
