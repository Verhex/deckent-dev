# D2 — dist/src Drift Detector (Sprint 161)

**Lane**: 3 (cc-deepdive)
**Agent**: D2
**Mode**: READ-ONLY audit
**Date**: 2026-05-08
**Project root**: /home/alperen/deckent-dev

## Build artifact integrity

- **Source files (src/*.ts)**: 937 files
- **Dist files (dist/*.js)**: 392 files
- **Latest src/ change (mtime)**: `1778225949` → 2026-05-08 10:39:09 (`src/orchestra/sprint-lifecycle.ts`, `src/orchestra/sprint-docs-updater.ts`, `src/cli/commands/cleanup.ts`)
- **Latest dist/ change (mtime)**: `1778225983` → 2026-05-08 10:39:43 (`dist/orchestra/managed-docs/index.js` and 3 others)
- **Δ src→dist**: ~34 seconds (dist newer than src — expected for compiled artifact)
- **Drift direction**: **forward (synchronized)** — every dist .js mtime is newer than the corresponding src .ts mtime. tsc finished at 10:39:43, ~34s after the last src edit at 10:39:09.
- **Build clustering**: ALL 392 dist/*.js files have mtimes within a 0.7-second window (`1778225983.14 → 1778225983.82`), confirming a single monolithic `tsc` pass — not incremental, not piecewise.

### Sanity counts

| Query | Count | Interpretation |
|-------|-------|----------------|
| `find dist/ -name "*.js" -newer src/` | 392 | All dist files newer than src/ **directory** mtime (2026-05-07 10:52). |
| `find src/ -name "*.ts" -newer dist/` | 27 | False positive — compares against `dist/` **directory** mtime (2026-05-07 11:37) which was NOT bumped during the in-place rebuild on 2026-05-08. |
| `find src/ -name "*.ts" -newer dist/orchestra/sprint-lifecycle.js` | 0 | True staleness check: NO src .ts is newer than the latest dist .js. |
| `find dist/ -newer src/orchestra/sprint-lifecycle.ts -name "*.js"` | 392 | All 392 dist files are newer than the most-recent src file. |

**Verdict**: dist/ is fully synchronized with src/. The 27-file "reverse staleness" reading is a `find -newer` artifact: directory mtimes only update on entry add/remove, not when files within are overwritten by tsc.

## Auto-rebuild mechanism investigation

### Sprint 160 finding restated
dist/ appeared "rebuilt without manual command". Investigation below.

### Searches performed

**1. Direct tsc invocations in source** (`src/orchestra/`, `src/agents/`, `src/cli/`):

| File:Line | Spawn pattern | Purpose |
|-----------|---------------|---------|
| `src/orchestra/sprint-finalizer.ts:247` | `spawnSync` of `npx tsc --noEmit` | Self-Audit Gate (verify only, **--noEmit**) |
| `src/orchestra/mid-sprint-adapter.ts:258` | `execSync` of `npx tsc --noEmit` | Mid-sprint reroute check (verify only, **--noEmit**) |
| `src/agents/worker-verify.ts:347` | promisified node:child_process call to `npx tsc --noEmit` | Worker pre-result verify loop (**--noEmit**) |

All three use `--noEmit` — they read the type-check, they do not write anything to dist/.

**2. Build script triggers** (`scripts/`):

| Script | Build invocation | Trigger |
|--------|------------------|---------|
| `scripts/chain-gate-check.mjs:67` | `spawnSync` of `npx tsc --noEmit` | Pre-publish gate (no emit) |
| `scripts/prepublish.ts:153` | `execSync` of `npx tsc --noEmit` | publish:validate (no emit) |
| `scripts/build-verify.ts:28` | `execSync` of `npx tsc --noEmit` | Build sanity (no emit) |
| `scripts/pre-flight-health-check.mjs:52` | `spawnSync` of `npx tsc --noEmit --project …` | Health check (no emit) |

None of these emit to dist/. The only emitting compile path is the manual `npm run build` (`tsc && node scripts/copy-assets.mjs`).

**3. Lifecycle hooks** (top-level `package.json` scripts):

```
build           → tsc && node scripts/copy-assets.mjs   ← only emitting path
dev             → tsc --watch                            ← interactive only, dev-only
postbuild       → npm run build:dashboard                ← runs after build
prepublishOnly  → npm run build                          ← npm publish only
```

- **No `postinstall`** hook (would not auto-rebuild on `npm install`).
- **No `prepare`** hook (would not auto-rebuild on git checkout).
- **No husky / git hooks**: `.git/hooks/` contains only `.sample` files; `.husky/` directory does not exist.
- **No tsc watch process active** at audit time (`ps aux | grep tsc` returned empty).

**4. Indirect npm invocations**: Only `src/cli/commands/upgrade.ts` shells `npm` (for `list`, `view`, `config` — never `build`).

### Hypothesis (root-cause analysis)

The "auto-rebuild mystery" reported in Sprint 160 has **three possible explanations**, ranked by evidence:

1. **Most likely — `tsc --watch` from `npm run dev`**: A previously-spawned `tsc --watch` process emits dist/ files automatically on every src/ save. On dev's next session it may have died but it would explain in-session dist/ updates without explicit `npm run build`. **No active tsc watch at audit time** → not currently running, but plausible historically.
2. **Possible — manual `npm run build` forgotten in shell history**: The 0.7s tight build cluster at 2026-05-08 10:39:43 is consistent with a single tsc pass. If the operator ran `npm run build` ~34s after their last src edit (10:39:09 → 10:39:43), it would produce exactly this signature.
3. **Unlikely — IDE/editor build-on-save**: VS Code's TypeScript server or Cursor's auto-build would also produce per-file emits, but that yields a wider mtime spread (one save = one file). The 0.7s tight cluster argues against this.

**No evidence** of: postinstall hooks, git hooks, file watchers in src/orchestra/, hidden cron, MCP-triggered build, or any worker-spawned tsc that emits.

**Recommendation**: Add `"prepare": "echo no-op"` and document explicitly that `npm run build` is the only sanctioned dist-emit path. Consider removing `npm run dev` (tsc --watch) or renaming to `dev:watch` to make it explicit.

## Per-module drift table (10 samples)

| # | Source file (mtime) | Dist counterpart (mtime) | Δ | Suspicious? |
|---|---------------------|---------------------------|---|-------------|
| 1 | `src/orchestra/sprint-lifecycle.ts` (2026-05-08 10:39:09) | `dist/orchestra/sprint-lifecycle.js` (2026-05-08 10:39:43) | +34 s | No (forward) |
| 2 | `src/orchestra/sprint-docs-updater.ts` (2026-05-08 10:39:09) | `dist/orchestra/sprint-docs-updater.js` (2026-05-08 10:39:43) | +34 s | No (forward) |
| 3 | `src/cli/commands/cleanup.ts` (2026-05-08 10:39:09) | `dist/cli/commands/cleanup.js` (2026-05-08 10:39:43) | +34 s | No (forward) |
| 4 | `src/core/config.ts` (2026-05-07 09:52:28) | `dist/core/config.js` (2026-05-08 10:39:43) | +24h 47m | No (forward) |
| 5 | `src/orchestra/sprint-controller.ts` (2026-05-07 13:53:51) | `dist/orchestra/sprint-controller.js` (2026-05-08 10:39:43) | +20h 45m | No (forward) |
| 6 | `src/core/types.ts` (2026-04-24 09:27:19) | `dist/core/types.js` (2026-05-08 10:39:43) | +14d 1h | No (forward) |
| 7 | `src/cli/entry.ts` (2026-05-05 22:40:19) | `dist/cli/entry.js` (2026-05-08 10:39:43) | +2d 11h 59m | No (forward) |
| 8 | `src/orchestra/result-collector.ts` (2026-05-07 15:17:45) | `dist/orchestra/result-collector.js` (2026-05-08 10:39:43) | +19h 21m | No (forward) |
| 9 | `src/providers/claude.ts` (2026-05-07 13:53:51) | `dist/providers/claude.js` (2026-05-08 10:39:43) | +20h 45m | No (forward) |
| 10 | `src/agents/worker.ts` (2026-05-07 10:37:29) | `dist/agents/worker.js` (2026-05-08 10:39:43) | +24h 2m | No (forward) |

**Pattern**: Every dist file is newer than its src counterpart. No reversal anywhere. The Δ varies because src files were edited at different times, but all dist files compiled in the same 10:39:43 window.

## Sprint 160 fix verification (cleanup discipline)

Sprint 160 introduced filters distinguishing `.prompt-task-*` and `.worker-task-*.sh` from real task JSON. Verification:

| File:line | Source code | Dist code | Match |
|-----------|-------------|-----------|-------|
| `src/orchestra/sprint-lifecycle.ts:269` | `if (file.startsWith('.prompt-task-') \|\| (file.startsWith('.worker-task-') && file.endsWith('.sh')))` | `dist/orchestra/sprint-lifecycle.js:235` (identical) | **Y** |
| `src/orchestra/sprint-docs-updater.ts:706` | `const promptFiles = allFiles.filter(f => f.startsWith('.prompt-task-'));` | `dist/orchestra/sprint-docs-updater.js:619` (identical) | **Y** |
| `src/cli/commands/cleanup.ts:78` | `const promptFiles = allTaskFiles.filter(f => f.startsWith('.prompt-task-'));` | `dist/cli/commands/cleanup.js:82` (identical) | **Y** |

**Verdict**: dist/ accurately reflects the Sprint 160 cleanup-discipline fix at all three sites. The MCP server (long-lived process) will need a `/mcp restart` to pick up the new compiled code if it was started before 2026-05-08 10:39:43, but the on-disk artifact is correct.

### Bin field verification (`package.json` → `dist/cli/entry.js`)

- `package.json` `bin.deckent` = `./dist/cli/entry.js` ✓
- `dist/cli/entry.js` exists, `2026-05-08 10:39:43`, executable bit `+x`, shebang `#!/usr/bin/env node` ✓
- First line after shebang: `import { buildProgram } from './index.js';` ✓ (ESM `.js` extension correct per ADR-002)
- `package.json` `bin.deckent-mcp` = `./dist/mcp/server.js` ✓ (compiled fresh 2026-05-08 10:39:43)
- `package.json` `main` = `./dist/index.js` ✓

## Findings (severity-tagged)

### INFO

1. **F1 (INFO)** — dist/ is fully synchronized with src/. No staleness, no reverse drift. The Sprint 160 reported "27 src newer than dist" was a `find -newer` artifact comparing directory mtime (which doesn't bump on in-place file overwrites) — the actual file-vs-file comparison shows 0 stale.

2. **F2 (INFO)** — Sprint 160 cleanup-discipline fix correctly compiled into dist/ at all three call sites (sprint-lifecycle, sprint-docs-updater, cleanup). MCP server restart still required for long-running processes.

### LOW

3. **F3 (LOW)** — `npm run dev` (`tsc --watch`) is the most plausible explanation for "auto-rebuild without command" — if the operator left a watcher running in another terminal it would emit silently. No active watcher at audit time, but the script exists and is undocumented as a side-effect risk.

4. **F4 (LOW)** — `dist/` directory mtime (2026-05-07 11:37:57) is older than `src/` directory mtime (2026-05-07 10:52:10) by ~45 minutes inverted ordering, BUT also older than every file inside dist/ (2026-05-08 10:39:43). Reason: tsc rewrites files in-place without `mkdir`, so dir mtime is stale. This causes `find -newer dist/` to over-report. **Fix**: `touch dist/` after build, or rely only on file-level mtime checks.

### MEDIUM

5. **F5 (MEDIUM)** — `dist/test-sprint-154-marker.js` exists in dist/ as the file with the very latest timestamp (1778225983 → tied for top). This is a test/debug artifact that probably shouldn't ship in dist/ for a beta release. Verify whether it's gated by `.npmignore` / `files` field. (Out of scope for this lane; flag for D-other or Lane 4.)

### Not a finding

6. The "auto-rebuild mystery" did not show evidence of orchestra-internal tsc emission. Brain/Worker/Auditor code paths only call `tsc --noEmit` — they never write to dist/. The mystery is operator-side, not pipeline-side.

## Sprint 162+ recommendations

1. **R1 — Document `npm run dev` side effect** (Sprint 162, LOW effort): Add a comment in `package.json` and CONTRIBUTING.md noting that `tsc --watch` silently emits to dist/. Consider renaming to `dev:watch` for explicitness.

2. **R2 — Add `touch dist/` to copy-assets.mjs** (Sprint 162, LOW effort): At the end of `scripts/copy-assets.mjs`, add `utimesSync(DIST, new Date(), new Date())`. This makes `find -newer dist/` reliable for staleness detection, eliminating the directory-mtime artifact that confused Sprint 160.

3. **R3 — Add a `dist:check` npm script** (Sprint 162, LOW effort): A read-only verification (`scripts/dist-check.mjs`) that compares src/*.ts vs dist/*.js mtimes and exits non-zero if any reverse-drift exists. Wire into `chain-gate-check.mjs` and CI.

4. **R4 — Remove `dist/test-sprint-154-marker.js`** (Sprint 162, LOW effort): Confirm the marker file is not needed at runtime; if test-only, exclude via `.npmignore` or move source to `tests/` so tsc doesn't emit it. (Defer to D-other if outside D2 charter.)

5. **R5 — Add postcheckout-aware staleness alert** (Sprint 163+, MEDIUM effort): When Brain starts a sprint, check `git log -1 --format=%ct -- src/` vs newest dist/ file. If src is newer, emit `dashboard.alert: dist-stale` and refuse to spawn workers (or auto-run `npm run build` with operator confirmation). This prevents the "MCP cached old code" footgun (CLAUDE.md gotcha).

6. **R6 — Document the find-newer directory-mtime gotcha in `.brain/PATTERNS.md`** (Sprint 162, LOW effort): The "27 stale src files" false alarm is a recurring class of error. Codify the correct staleness check as a pattern.

---

**Audit complete**: dist/ is synchronized, Sprint 160 fix verified, no internal auto-rebuild mechanism exists. Sprint 160's reported mystery is most likely an artifact of (a) `tsc --watch` from `npm run dev` left running, or (b) directory-mtime drift confusing `find -newer`. Both explanations are operator-side, not pipeline-side.
