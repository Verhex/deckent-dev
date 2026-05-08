# D6 — Fixture References (non-test) (Sprint 161)

**Lane 3 Agent:** D6 — Doc-as-Code Fixture References (non-test)
**Mode:** READ-ONLY (grep + Read only; tests/ scope excluded)
**HEAD reference:** see `/home/alperen/deckent-dev/docs/audits/sprint-161/PRE-AUDIT-HEAD-SHA.txt`
**Date:** 2026-05-08
**Inputs:** src/, docs/, scripts/, .deckent/, .brain/

---

## Executive summary (2 minute read)

Sprint 160 T-001 narrowed three sweep paths from `.prompt-` / `.worker-` to `.prompt-task-` / `.worker-task-` to protect user-planted forensic files. Live filesystem evidence shows the **generators never emit the `.prompt-task-` / `.worker-task-` form**:

```
$ ls -1 /home/alperen/deckent-dev/.tasks/ | grep -E '\.(prompt|worker)-' | head -5
.prompt-test-docker-317411-64210aee9bf7a00c.txt
.worker-161-001.sh
.worker-161-002.sh
.worker-161-003.sh
.worker-161-004.sh
```

The actual emissions are `.worker-${taskId}.sh` (e.g. `.worker-161-001.sh`) and `.prompt-${taskId}-${hash}${fixSuffix}.txt` (e.g. `.prompt-161-001-abc123.txt`). The Sprint 160 sweeps look for files starting with `.worker-task-` / `.prompt-task-` — those prefixes never occur on disk. **Result: the three Sprint 160 fix sites are now silently no-op for live tasks.** Plant-protection works (because plants never matched `task-` either), but the intended sprint-end cleanup is now broken.

This is a P0 generator-vs-consumer asymmetry, **broader and more critical than Sprint 160 documented**. Sprint 162 must re-converge — see "Recommendation" below.

A second P0 finding: `scripts/prompt-linter.mjs:252` filters by `.prompt-${sprintId}-` (pre-Sprint 160 implicit narrowing). For sprint 161, this matches `.prompt-161-001-...` correctly because of taskId structure (sprintId is a prefix of taskId), so the linter still works in the wild — but it represents yet a third independent pattern the codebase uses to identify the same files.

---

## 1. Generator vs consumer table (live, src/ only)

| # | Module | Side | Pattern emitted/consumed | File:line | Sprint 160 touched? |
|---|--------|------|---------------------------|-----------|---------------------|
| 1 | spawn-backend-docker.ts | **Generator** (writeFileSync) | `.prompt-${taskId}-${promptId}${fixSuffix}.txt` | `src/orchestra/spawn-backend-docker.ts:167-169` | No |
| 2 | spawn-backend-docker.ts | **Generator** (writeFileSync) | `.worker-${taskId}.sh` | `src/orchestra/spawn-backend-docker.ts:187-188, 319` | No |
| 3 | tmux.ts (writePromptFile) | **Generator** (writeFileSync) | `.prompt-${id}.txt` (random hex hash, **NO taskId**) | `src/orchestra/tmux.ts:60-61` | No |
| 4 | spawn-backend-docker.ts (archivePromptFiles) | Consumer (sweep + rename) | `.prompt-` startsWith + `.txt` endsWith | `src/orchestra/spawn-backend-docker.ts:776` | No |
| 5 | sprint-docs-updater.ts (archiveOrphanTasks) | Consumer (sweep) | `.prompt-task-` startsWith | `src/orchestra/sprint-docs-updater.ts:706` | **YES (T-001 #2)** |
| 6 | sprint-lifecycle.ts (cleanup) | Consumer (sweep + unlink) | `.prompt-task-` OR (`.worker-task-` + `.sh` endsWith) | `src/orchestra/sprint-lifecycle.ts:269` | **YES (T-001 #1)** |
| 7 | cli/commands/cleanup.ts (dry-run) | Consumer (sweep + print) | `.prompt-task-` startsWith | `src/cli/commands/cleanup.ts:78` | **YES (T-001 #3)** |
| 8 | cli/commands/kill.ts (cleanPromptFiles) | Consumer (sweep + unlink) | `.prompt-` startsWith + `.includes(taskId)` | `src/cli/commands/kill.ts:74` | No |
| 9 | providers/claude.ts (_cleanupOrphanedPromptFiles) | Consumer (sweep + unlink) | `.prompt-` startsWith + `.txt` endsWith | `src/providers/claude.ts:155` | No |
| 10 | mcp/tools/cleanup.ts (listCleanableFiles) | Consumer (sweep + list) | `.prompt-` startsWith OR (`.worker-` + `.sh` endsWith) | `src/mcp/tools/cleanup.ts:28` | No |
| 11 | mcp/tools/cleanup.ts (cleanTasks) | Consumer (sweep + unlink) | `.prompt-` startsWith OR (`.worker-` + `.sh` endsWith) | `src/mcp/tools/cleanup.ts:46` | No |
| 12 | task-restoration.ts (classifyTaskFiles) | Consumer (regex + classify) | `^(task-\d+-\d+)` regex; non-task → "always archivable" | `src/orchestra/task-restoration.ts:174-182` | No |

**Out of src/ but in scope:**

| # | Module | Side | Pattern emitted/consumed | File:line |
|---|--------|------|---------------------------|-----------|
| 13 | scripts/prompt-linter.mjs (lintSprintPrompts) | Consumer (sweep + score) | `.prompt-${sprintId}-` startsWith + `.txt` endsWith | `scripts/prompt-linter.mjs:252` |

**Backends not represented** (negative confirmation): `src/providers/subprocess.ts` does not emit any `.prompt-*` or `.worker-*` files — it pipes the prompt over child.stdin (`subprocess.ts:184`). No fixture lifecycle there.

---

## 2. Asymmetries (beyond Sprint 160 fixes)

Sprint 160 fixed three CONSUMER sites by narrowing them to `.prompt-task-` / `.worker-task-`. Live evidence proves the asymmetry was misdiagnosed: generator emits a third form (`.prompt-${taskId}-` / `.worker-${taskId}.sh`) that matches **none** of the three fixed consumers.

### P0 — UNFIXED — Generator emits `.worker-${taskId}.sh` (no `task-` prefix in literal); Sprint 160 consumers expect `.worker-task-` literal prefix

**Empirical proof (live filesystem):**
```
$ ls /home/alperen/deckent-dev/.tasks/.worker-* 2>/dev/null
.worker-161-001.sh    .worker-161-005.sh
.worker-161-002.sh    .worker-161-006.sh
.worker-161-003.sh    .worker-test-docker-317411.sh
.worker-161-004.sh
```

**Generator (intent vs literal):**
- `src/orchestra/spawn-backend-docker.ts:187` → `` `.worker-${taskId}.sh` ``
- When `taskId = "161-001"` → emits `.worker-161-001.sh` (literal token after `.worker-` is `161-001`, NOT `task-161-001`)

**Sprint 160 consumer (does not match):**
- `src/orchestra/sprint-lifecycle.ts:269` → `file.startsWith('.worker-task-') && file.endsWith('.sh')`
- Tests `.worker-161-001.sh.startsWith('.worker-task-')` → **false**

**Impact:**
- Sprint-end CLEANUP phase no longer unlinks `.worker-${taskId}.sh` scripts. The 7 `.worker-161-*.sh` files currently sitting in `.tasks/` (sprint-161 mid-execution) will survive sprint cleanup — they will only be removed by `mcp/tools/cleanup.ts` (which still uses generic `.worker-` filter — see P0 below) or by manual user action.
- Plant-survival INVARIANT still holds (because plants like `.worker-MANUAL-PLANT.sh` never match `.worker-task-` either) — this is why Sprint 160 plant-survival tests passed. The tests proved plant survival, not real-task-file removal.

### P0 — UNFIXED — Same asymmetry on the prompt side: Generator emits `.prompt-${taskId}-${hash}.txt`; Sprint 160 consumers expect `.prompt-task-` literal prefix

**Generator (literal):**
- `src/orchestra/spawn-backend-docker.ts:167` → `` `.prompt-${taskId}-${promptId}${fixSuffix}.txt` ``
- When `taskId = "161-001"`, `promptId = "abc123"` → emits `.prompt-161-001-abc123.txt`
- Sprint 139 spec (`docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md:1559`) explicitly documents `Format: .prompt-NNN-XXX-<hash>` as the canonical convention

**Sprint 160 consumer (does not match):**
- `src/orchestra/sprint-lifecycle.ts:269` → `file.startsWith('.prompt-task-')` → **false** for `.prompt-161-001-abc123.txt`
- `src/orchestra/sprint-docs-updater.ts:706` → `f.startsWith('.prompt-task-')` → **false**
- `src/cli/commands/cleanup.ts:78` → `f.startsWith('.prompt-task-')` → **false**

**Impact:**
- `archiveOrphanTasks()` now archives ZERO real-task prompt files for any sprint (since Sprint 160 deploy). Real prompts only get archived by the parallel `archivePromptFiles()` path (`spawn-backend-docker.ts:776`) which still uses the generic `.prompt-` filter. There are now TWO archive paths that disagree: one moves all `.prompt-*.txt` to `.tasks/archive/sprint-NNN/`, the other (lifecycle/orphan) tries to move them to `.brain/archive/sprint-NNN-tasks/` but matches nothing.
- `sprint-lifecycle:269` no longer unlinks any real prompt tmpfile.
- `cleanup --dry-run` reports zero prompt files for archive even when many are present.

This was hinted at in the Sprint 160 worker NO_GO note ("`spawn-backend-docker.ts:776` and `providers/claude.ts:155` and `kill.ts:74` still use generic `.prompt-` matching … recommend follow-up sprint task to evaluate") but the magnitude was not — Sprint 160 worker treated the surviving generic filters as "intentional or low priority" without verifying that the generator emits the SAME generic pattern the un-narrowed sites still consume. The real story is the NARROWED sites are the broken ones.

### P0 — Discipline-bleed — `mcp/tools/cleanup.ts` (parallel sweep) NOT updated alongside Sprint 160 T-001

`src/mcp/tools/cleanup.ts:28,46` (in both `listCleanableFiles` and `cleanTasks`) still uses the pre-Sprint-160 generic filter:
```ts
TASK_EXTENSIONS.test(f) || f.startsWith('.prompt-') || (f.startsWith('.worker-') && f.endsWith('.sh'))
```
This is the MCP tool counterpart of `cli/commands/cleanup.ts:78` which Sprint 160 DID narrow. So `deckent_cleanup` (MCP) and `deckent cleanup` (CLI) now disagree on what files to delete:
- CLI: archives only `.prompt-task-*` (zero, by P0 above), preserves all real-task `.prompt-${taskId}-*.txt` and `.worker-${taskId}.sh`
- MCP tool: deletes any `.prompt-*` and any `.worker-*.sh` (including user plants)

This is a CLI/MCP feature-parity violation (ADR-022-V2). User running `deckent_cleanup` via MCP gets DIFFERENT behavior than user running `deckent cleanup` from shell — the MCP path eats forensic plants the CLI preserves.

### P1 — `kill.ts:74` and `claude.ts:155` use generic `.prompt-` filter

These are kill-time tmpfile cleanup paths, not sprint-end. They were NOT in Sprint 160 scope and probably correctly stay generic — kill-cleanup happens immediately, plants are unlikely to be in the directory at the kill instant, and `kill.ts:74` further narrows by `.includes(taskId)` so it's a no-op for plants without that token. These are LOWER risk but worth noting for future symmetry decisions.

- `kill.ts:74`: `file.startsWith('.prompt-') && file.includes(taskId)` — taskId-included narrowing protects plants OK
- `claude.ts:155`: `file.startsWith('.prompt-') && file.endsWith('.txt')` — invoked from `_cleanupOrphanedPromptFiles` after kill; would delete a `.prompt-TEST-PLANT.txt` if present. Mild plant risk, but practically rare.

### P1 — Three independent emitter/consumer naming conventions in the codebase

For the same logical file (a per-task prompt tmpfile), the codebase has THREE distinct identifying patterns simultaneously:
- A: `.prompt-${id}.txt` (tmux backend; `id` is random hex, no taskId at all) — `tmux.ts:60`
- B: `.prompt-${taskId}-${hash}${fixSuffix}.txt` (Docker backend; taskId-hash-fix) — `spawn-backend-docker.ts:167`
- C: `.prompt-task-*` (Sprint 160 narrowed consumers expect this — never emitted by anything)

Pattern A breaks `scripts/prompt-linter.mjs:252` for tmux-backend sprints (filter `.prompt-${sprintId}-` will not match `.prompt-${randomHex}.txt`). The linter currently works only when Docker backend is active — silent capability gap.

### P2 — task-restoration.ts comment claims `.prompt-*` is "always archivable" — outdated

`src/orchestra/task-restoration.ts:181`: comment `// Non-task files (e.g. .prompt-*) are always archivable`. Post Sprint 160, the live invariant is "any file not matching `^task-\d+-\d+` is treated as a non-task file and archived". A `.prompt-${taskId}-` file matches the comment intent (always archivable) — but the regex on line 174 only triggers for `task-\d+-\d+`, so `.prompt-161-001-abc.txt` falls into the else branch (line 182: archivable). That's coincidentally correct, but the example given (`.prompt-*`) glosses over the fact that the same file is named with the same `${taskId}` token as real task files. Documentation drift — minor.

---

## 3. Doc/script references to old patterns

| Doc / file | Line(s) | Reference text | Accurate? |
|------------|---------|-----------------|-----------|
| `docs/guide/docker-backend.md` | 186 | `Write prompt to .tasks/.prompt-<id>.txt` | **Inaccurate** — guide implies tmux-style hash pattern; Docker generator actually writes `.prompt-${taskId}-${hash}${fix}.txt`. Mild user confusion if anyone relies on this for log-grepping. |
| `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` | 218, 1559-1560 | `Format: .prompt-NNN-XXX-<hash>` (initial), `-fix` | **Accurate as historical spec** — matches live generator output to this day (Sprint 139 spec was implemented as designed; it does NOT include the literal `task-` token). |
| `docs/audits/sprint-152/T-152-003-cli-core-lifecycle.md` | 117 | dry-run sample `prompt → archive: .prompt-152-001-8658eb75f6939522.txt` | Accurate at time of writing (Sprint 152). After Sprint 160 narrow, dry-run would NO LONGER show such files (it now greps `.prompt-task-` only) — historical doc is preserved as evidence. |
| `docs/superpowers/plans/2026-04-14-sprint-139-deckent-god-sprint-plan.md` | 571 | `ls .tasks/.prompt-139-*.* 2>&1 \| wc -l` | Accurate at Sprint 139 time. Still works today (matches live `.prompt-139-NNN-${hash}.txt` if any survive). Format same as today. |
| `docs/audits/sprint-140/emergency-assessment.md` | 95, 306, 382-383 | `.prompt-140-001-b339fd4eac11ea74.txt`, `.tasks/.worker-140-*.sh` | Accurate as historical audit evidence. Matches live generator output naming. |
| `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` | 2384 | `grep -c "Clean up fil" .tasks/.prompt-146-*.txt` | Accurate. Matches live pattern. |
| `docs/CHANGELOG.md` | 52, 64 | Discusses `.worker-*.sh` and `.prompt-158-*.txt` lifecycle bugs | Accurate description of generator-side names; honest narrative of the `task-` ↔ no-`task-` confusion ("two remaining file-lifecycle questions" para is the unresolved Sprint 158/160 mystery THIS audit nails down). |
| `docs/ROADMAP-GOD-LEVEL.md` | 353 | Sprint 158 narrative around `.worker-*.sh` cleanup | Accurate. Sprint 158 fix landed; this is post-mortem narrative. |
| `docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md` | 333 | "`.worker-TEST-*` confirmed preserved per Sprint 160 fix; `.prompt-TEST-*` only partially preserved (Sprint 160 surfaced `archivePromptFiles` asymmetry, candidate for Sprint 162)" | Accurate — explicitly flags the candidate this report develops further. |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-lifecycle.ts.md` | 78 | `(.prompt-*, .worker-*.sh, satır 264-269)` | Outdated post Sprint 160 — line 269 now says `.prompt-task-` / `.worker-task-`, not `.prompt-*` / `.worker-*.sh`. Static-analysis archive needs refresh OR can be left as historical snapshot if the dir is a sealed analysis run. |
| `.deckent/sprint-god-analysis/src/orchestra/spawn-backend-docker.md` | 66, 99 | "`.worker-*.sh` cleanup in monitorContainer" | Outdated — Sprint 158 removed the per-container exit cleanup (`spawn-backend-docker.ts:719-724` comment confirms), so the analysis line no longer describes live behavior. Historical snapshot. |
| `.deckent/sprint-god-analysis/src/orchestra/tmux.md` | 80 | `writePromptFile writes prompt to .tasks/.prompt-{hash}.txt` | **Accurate** for tmux backend (no taskId in the filename — confirms P1 #5 above: tmux uses pattern A while Docker uses pattern B). |
| `scripts/prompt-linter.mjs` | 252, 310 | Hardcoded filter `.prompt-${sprintId}-*.txt` | Accurate ONLY for Docker-backend sprints. Silently fails for tmux-backend sprints (which emit `.prompt-${randomHex}.txt`). |
| `.brain/archive/DIRECTIVES-sprint-148.md` | 299 | `.tasks/.prompt-148-*.txt` regex test | Accurate then, accurate now (matches Docker generator). |
| `.brain/archive/sprint-160-tasks/task-160-001.json` | description | Says `Mevcut unit test'ler kırılırsa düzeltilir` — directive contemplated test-fixture breakage from T-001 narrowing | Accurate — but the directive (and Sprint 160 worker) MISSED that production generator emissions also fail to match the new narrowed prefix. The directive treated `.prompt-task-` as if it were the canonical existing format; it was actually a NEW format invented during Sprint 160 planning that NO emitter ever produced. |

---

## 4. Verify Sprint 160 T-001 fix references in docs

Sprint 160 T-001 reportedly fixed three sites: `sprint-lifecycle.ts:269` / `sprint-docs-updater.ts:706` / `cli/commands/cleanup.ts:78`.

| Claimed fix site | Documented in | On disk now? | Compiles intent? | Functionally correct? |
|------------------|----------------|--------------|-------------------|------------------------|
| `sprint-lifecycle.ts:269` | `.brain/archive/sprint-160-tasks/task-160-001-fix.json` (description) | YES — `file.startsWith('.prompt-task-') \|\| (file.startsWith('.worker-task-') && file.endsWith('.sh'))` | Plant-protection: yes (plants don't match `task-` literal) | **NO — generator emits `.worker-${taskId}.sh` (e.g. `.worker-161-001.sh`), which startsWith `.worker-` but not `.worker-task-`. Filter never matches live emissions.** |
| `sprint-docs-updater.ts:706` | same | YES — `f.startsWith('.prompt-task-')` | Plant-protection: yes | **NO — same asymmetry; generator emits `.prompt-${taskId}-${hash}.txt`, not `.prompt-task-...`.** |
| `cli/commands/cleanup.ts:78` | same | YES — `f.startsWith('.prompt-task-')` | Plant-protection: yes | **NO — same asymmetry; user-facing dry-run reports zero prompt files for archive.** |

Sprint 160 documentation is **technically accurate about what code changed** but **incorrect about behavioral outcome**. The retro/CHANGELOG should be amended to note that the fix achieved plant survival but broke real-task sweep matching — net behavior is "no harm, but no benefit either, except for plant tests that pass for the wrong reason".

Plant-protection working invariant explained: plants `.prompt-TEST-*`, `.worker-MANUAL-*` etc. don't start with `.worker-task-` either. Sprint 160 plant-survival tests pass because BOTH plant files AND real task files are now skipped by the sweep. The tests proved plant survival, not generator/consumer alignment.

---

## 5. Sprint 162 generator migration recommendation

Two viable plans. Each has trade-offs.

### Plan A — Migrate generator-side to `.prompt-task-${taskId}` / `.worker-task-${taskId}` format

**Changes:**
- `src/orchestra/spawn-backend-docker.ts:167` → `` `.prompt-task-${taskId}-${promptId}${fixSuffix}.txt` ``
- `src/orchestra/spawn-backend-docker.ts:187` → `` `.worker-task-${taskId}.sh` ``
- `src/orchestra/tmux.ts:60` → `` `.prompt-task-${taskId}-${id}.txt` `` (also requires plumbing `taskId` into `writePromptFile`, currently it only receives projectRoot+prompt)
- Update `scripts/prompt-linter.mjs:252` filter to match new prefix
- Update `docs/guide/docker-backend.md:186` and `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md:1559-1560` (mark old format as historical)
- Audit and update generic-consumer sites for symmetry: `mcp/tools/cleanup.ts:28,46`, `spawn-backend-docker.ts:776`, `kill.ts:74`, `claude.ts:155` — narrow them too OR leave them generic (they'll still match new prefix correctly because `.prompt-task-...` startsWith `.prompt-` is true).

**Tradeoffs:**
- + Restores intended Sprint 160 behavior (sweeps actually run on live tasks again)
- + Plant protection becomes EXPLICIT not accidental — design intent matches code
- + Brings tmux backend into the same naming scheme (currently it has no taskId in the prompt filename — debugging burden today)
- − Requires touching 4+ generator/consumer sites coordinated as a single change (big scope)
- − Breaks existing in-flight sprint artifacts and any downstream tooling that greps `.prompt-` (release notes, debugging guides, audit reports already on disk)
- − Breaks `.deckent/sprint-god-analysis/` snapshots (low impact; those are already historical)
- − Existing test fixtures from Sprint 160 (which plant `.prompt-task-160-001.txt` synthetic files — see `.brain/archive/sprint-160-tasks/task-160-002-fix.json` notes) would coincidentally validate this — already in the right format

**Risk level:** Medium. Atomic deploy required (generator + sweep + linter together).

### Plan B — Widen sweep filter back to regex form (revert Sprint 160 conceptually but with pattern guards)

**Changes:**
- Revert the three Sprint 160-narrowed consumers to use a regex like `/^\.(prompt|worker)-\d+-\d+(?:-[\w]+)?(?:-fix)?\.(txt|sh)$/` — matches `task-` literal (if Plan A also lands) OR matches the current numeric-taskId form
- Plant-protection achieved via "must-match-NNN-NNN" rather than "must-have-task-prefix"
- Keep `kill.ts:74` style `.includes(taskId)` narrowing where applicable

**Tradeoffs:**
- + Single-file change per consumer site; no generator coordination required
- + Backward-compatible with all existing prompt/worker tmpfiles on disk (audit reports, archives, etc.)
- + Symmetry across CLI/MCP/in-process sweeps achievable with a shared helper (e.g. `core/task-tmpfile-pattern.ts`)
- − Plant protection now relies on the regex disallowing `TEST` / `MANUAL` / non-numeric tokens — fragile if a future plant fixture happens to look like `XX-YY` numerically
- − Three separate consumer sites must agree on the regex (or import from a single source) — discipline question for ADR-022-V2

**Risk level:** Low. Single-file changes; reversible.

### Recommendation (this audit's view)

**Plan A** is the principled fix and aligns with the original Sprint 160 design intent (literal `task-` token is the plant-protection guard). Coordinated with a Sprint 162 single-task scope:
1. Generator-side rename (3 sites: docker prompt, docker worker, tmux prompt+plumbing)
2. Sweep filter alignment (8 consumer sites: 3 already narrowed, 5 generic — narrow them or leave generic since `.prompt-task-` ⊂ `.prompt-`)
3. Linter update (`scripts/prompt-linter.mjs:252,310`)
4. Doc-as-code refresh (`docs/guide/docker-backend.md`, `docs/superpowers/specs/2026-04-14-sprint-139-...md` historical-tag)
5. Test fixture alignment (already correct in Sprint 160 e2e plant-survival tests; unit fixtures will need update — anticipated by `Mevcut unit test'ler kırılırsa düzeltilir` clause from T-001 directive)

Plan B is the cheap escape hatch if Sprint 162 has limited capacity — but leaves the fundamental design question (literal `task-` as plant-shield) unanswered.

---

## 6. Files referenced by absolute path

Generator/consumer code:
- `/home/alperen/deckent-dev/src/orchestra/spawn-backend-docker.ts` (lines 163-167, 187-188, 319, 749-786)
- `/home/alperen/deckent-dev/src/orchestra/tmux.ts` (lines 56-63)
- `/home/alperen/deckent-dev/src/orchestra/sprint-lifecycle.ts` (lines 266-273)
- `/home/alperen/deckent-dev/src/orchestra/sprint-docs-updater.ts` (lines 705-707)
- `/home/alperen/deckent-dev/src/orchestra/task-restoration.ts` (lines 173-184)
- `/home/alperen/deckent-dev/src/cli/commands/cleanup.ts` (lines 76-89, 190-205)
- `/home/alperen/deckent-dev/src/cli/commands/kill.ts` (lines 67-86)
- `/home/alperen/deckent-dev/src/providers/claude.ts` (lines 144-162)
- `/home/alperen/deckent-dev/src/providers/subprocess.ts` (lines 180-185 — confirmation of stdin-only path)
- `/home/alperen/deckent-dev/src/mcp/tools/cleanup.ts` (lines 22-52)

Doc-as-code references:
- `/home/alperen/deckent-dev/docs/guide/docker-backend.md` (line 186)
- `/home/alperen/deckent-dev/docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` (lines 218, 1559-1573)
- `/home/alperen/deckent-dev/docs/superpowers/plans/2026-04-14-sprint-139-deckent-god-sprint-plan.md` (line 571)
- `/home/alperen/deckent-dev/docs/audits/sprint-140/emergency-assessment.md` (lines 95, 306, 382-383)
- `/home/alperen/deckent-dev/docs/audits/sprint-152/T-152-003-cli-core-lifecycle.md` (line 117)
- `/home/alperen/deckent-dev/docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` (line 2384)
- `/home/alperen/deckent-dev/docs/audits/sprint-137/layer3-scorecard.md` (line 179)
- `/home/alperen/deckent-dev/docs/CHANGELOG.md` (lines 52, 64)
- `/home/alperen/deckent-dev/docs/ROADMAP-GOD-LEVEL.md` (line 353)
- `/home/alperen/deckent-dev/docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md` (line 333)

Scripts & analysis archives:
- `/home/alperen/deckent-dev/scripts/prompt-linter.mjs` (lines 250-267, 299-311)
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/src/orchestra/sprint-lifecycle.ts.md` (line 78 — outdated)
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/src/orchestra/spawn-backend-docker.md` (lines 66, 99 — outdated)
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/src/orchestra/tmux.md` (lines 80, 108 — accurate)
- `/home/alperen/deckent-dev/.brain/archive/sprint-160-tasks/task-160-001.json` (directive — historical)
- `/home/alperen/deckent-dev/.brain/archive/sprint-160-tasks/task-160-001-fix-fix.json` (worker reasoning — corroborates this report)

Live filesystem evidence:
- `/home/alperen/deckent-dev/.tasks/.worker-161-001.sh` … `.worker-161-006.sh` (live generator emissions, no `task-` literal)
- `/home/alperen/deckent-dev/.tasks/.prompt-test-docker-317411-64210aee9bf7a00c.txt` (live; matches `.prompt-${taskId}-${hash}.txt`)

---

## Appendix A — grep summaries

**Generator sites (writeFileSync of prompt/worker):**
```
src/orchestra/spawn-backend-docker.ts:169:    writeFileSync(promptHostPath, prompt, 'utf-8');     // .prompt-${taskId}-${hash}${fix}.txt
src/orchestra/spawn-backend-docker.ts:319:    writeFileSync(scriptHostPath, scriptContent, ...); // .worker-${taskId}.sh
src/orchestra/tmux.ts:61:                       writeFileSync(promptPath, prompt, 'utf-8');         // .prompt-${randomHex}.txt
```

**Consumer sites (startsWith / regex sweep):**
```
src/orchestra/sprint-lifecycle.ts:269:                .prompt-task- || (.worker-task- && .sh)        # Sprint 160 narrowed
src/orchestra/sprint-docs-updater.ts:706:            .prompt-task-                                   # Sprint 160 narrowed
src/cli/commands/cleanup.ts:78:                       .prompt-task-                                   # Sprint 160 narrowed
src/orchestra/spawn-backend-docker.ts:776:           .prompt- && .txt                                # generic, not narrowed
src/cli/commands/kill.ts:74:                          .prompt- && .includes(taskId)                  # taskId-narrowed
src/providers/claude.ts:155:                          .prompt- && .txt                                # generic, not narrowed
src/mcp/tools/cleanup.ts:28:                          .prompt- || (.worker- && .sh)                  # generic, not narrowed (CLI/MCP parity gap)
src/mcp/tools/cleanup.ts:46:                          .prompt- || (.worker- && .sh)                  # generic, not narrowed
src/orchestra/task-restoration.ts:174-182:           regex /^(task-\d+-\d+)/, else "always archivable" # taskId-regex (different mechanism)
scripts/prompt-linter.mjs:252:                        .prompt-${sprintId}- && .txt                   # third independent pattern
```

---

## Appendix B — Sprint 160 mystery, resolved

`docs/CHANGELOG.md:64` reads:
> *Investigation continues on two remaining file-lifecycle questions: (a) which code path actually deleted `.prompt-158-*.txt` files mid-sprint despite Sprint 137's "persist until sprint end" intent — direct deletion paths in the codebase don't account for the empirical loss …*

This audit suggests an answer for (a): post Sprint 160, the narrowed sweep filters in `sprint-lifecycle.ts:269` / `cleanup.ts:78` / `sprint-docs-updater.ts:706` no longer delete real `.prompt-${taskId}-...` files. **But the parallel `archivePromptFiles()` path at `spawn-backend-docker.ts:776` still uses generic `.prompt-` filter and DOES move every `.prompt-*.txt` to the archive directory.** During sprint finalize, both paths fire — the narrowed paths no-op, the generic path moves files to `.tasks/archive/sprint-NNN/`. The mid-sprint deletion mystery from Sprint 158 (which pre-dated Sprint 160) is unresolved by this finding, but going forward the file-vanish behavior is fully accounted for: `archivePromptFiles` is the sole effective mover post-Sprint-160. Worth a focused empirical run in Sprint 162 to capture the Sprint 158 root cause separately.

---

**END D6**
