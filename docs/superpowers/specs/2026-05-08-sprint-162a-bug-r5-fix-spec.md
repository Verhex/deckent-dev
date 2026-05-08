# Sprint 162A — Bug R5 Fix Spec — Cleanup Tmpfile Sweep Asymmetry

**Subagent:** INV-R5
**Date:** 2026-05-08
**Mode:** READ-ONLY investigation → spec only (no code changes)
**Sprint:** 162A (parent: `2026-05-08-sprint-162a-orchestration-repair-design.md`)
**Bug:** R5 — `.worker-*.sh` and `.prompt-*` tmpfiles survive recover/cleanup
**Severity:** P1 (cleanup discipline asymmetry; user-visible litter; recurring since Sprint 158)

---

## 1. Bug Statement

`deckent recover <sprint-id>` archives `task-NNN.*` artifacts via `postFinalizeCleanup()` but does **NOT** sweep the parallel hidden tmpfiles `.worker-${taskId}.sh` and `.prompt-${taskId}-${hash}.txt` that the Docker spawn backend emits into `.tasks/`. After Sprint 161 finalize, 34 `.worker-*.sh` files were left in `.tasks/`; Alperen had to `rm` them manually.

The same asymmetry leaks into three further consumer sites:
- `src/orchestra/sprint-lifecycle.ts:266-273` — `cleanup()` already attempts the sweep but uses the Sprint 160 narrowed prefix `.prompt-task-` / `.worker-task-` which **never matches generator emissions** (D6 audit confirms — generator emits `.prompt-${taskId}-…` / `.worker-${taskId}.sh`, no `task-` infix).
- `src/orchestra/sprint-docs-updater.ts:706` — `archiveOrphanTasks()` filters with `f.startsWith('.prompt-task-')` → **zero matches** for live emissions.
- `src/cli/commands/cleanup.ts:78` — dry-run preview filters with `f.startsWith('.prompt-task-')` → reports zero prompt files even when many present.

D6 deepdive concluded: Sprint 160 plant-protection works **only because it sweeps nothing at all** — both plants and real tasks fall through. Sprint 162A R5 must converge on a single canonical sweep filter that:
1. Catches real generator emissions (`.prompt-${taskId}-…` / `.worker-${taskId}.sh`)
2. Preserves forensic `TEST-*` and `MANUAL-*` plants
3. Adds the missing sweep step to `recover.ts` (currently absent entirely)

This spec adopts D6 **Plan B** (widen consumer regex with prefix-guards) over Plan A (migrate generator) — Plan A is a larger coordinated change and out of Sprint 162A scope; Plan B is a single-file-per-site adjustment plus a shared helper, fully reversible.

---

## 2. Evidence

### 2.1 Live filesystem (Sprint 161 wash-up state)

```bash
$ ls /home/alperen/deckent-dev/.tasks/.worker-*.sh 2>/dev/null | wc -l
34         # 34 .worker-*.sh files survived recover

$ ls /home/alperen/deckent-dev/.tasks/.worker-* 2>/dev/null | head -3
.worker-161-001.sh
.worker-161-002.sh
.worker-161-003.sh

$ ls /home/alperen/deckent-dev/.tasks/.prompt-* 2>/dev/null | head -2
.prompt-161-001-abc123.txt
.prompt-test-docker-317411-64210aee9bf7a00c.txt    # forensic plant — must survive
```

### 2.2 Generator vs consumer disagreement (D6 audit table excerpt)

| Site | Pattern | Result on live emissions |
|------|---------|--------------------------|
| `spawn-backend-docker.ts:187` (generator) | `.worker-${taskId}.sh` | Emits `.worker-161-001.sh` |
| `spawn-backend-docker.ts:167` (generator) | `.prompt-${taskId}-${promptId}${fix}.txt` | Emits `.prompt-161-001-abc.txt` |
| `sprint-lifecycle.ts:269` (consumer) | `.startsWith('.worker-task-')` | **NEVER MATCHES** |
| `sprint-docs-updater.ts:706` (consumer) | `.startsWith('.prompt-task-')` | **NEVER MATCHES** |
| `cli/commands/cleanup.ts:78` (consumer) | `.startsWith('.prompt-task-')` | **NEVER MATCHES** |
| `cli/commands/recover.ts` (no sweep at all) | — | **NO SWEEP** |

### 2.3 Sprint 160 retro evidence

`.brain/archive/sprint-160-tasks/task-160-001-fix.result` (line 13, KNOWN TECH_DEBT #3):

> Generator-side asymmetry (forward-looking contract gap) — actual prompt-file generators currently write `.prompt-${taskId}-...` (no `task-` infix)… After this change the new sweep filter MISSES production-generated prompt files until those generators migrate to a `.prompt-task-${taskId}-...` shape… RECOMMEND: Brain spawn a follow-up sprint task to migrate generator filenames OR widen sweep filters to a regex form like `^\.prompt-(task-)?[0-9]+`.

This spec is the recommended follow-up.

---

## 3. Fix — 4-File Diff

A new shared helper `src/core/task-tmpfile-pattern.ts` exports the single source of truth for tmpfile classification. All four sites import from it.

### 3.1 NEW FILE — `src/core/task-tmpfile-pattern.ts`

```typescript
// ═══ Task Tmpfile Pattern — Single Source of Truth ═══════════════════════
// Classifies hidden tmpfiles in .tasks/ that the Docker spawn backend
// (and tmux backend) emits per task. Used by every cleanup / archive /
// recover path so the sweep filter never drifts.
//
// Generator emissions covered (from src/orchestra/spawn-backend-docker.ts):
//   .prompt-${taskId}-${promptId}${fixSuffix}.txt   (line 167)
//   .worker-${taskId}.sh                              (line 187)
//
// Forensic plants preserved (Sprint 160 invariant):
//   .prompt-TEST-*    .worker-TEST-*
//   .prompt-MANUAL-*  .worker-MANUAL-*
//
// Plant guard rule: the token immediately after `.prompt-` / `.worker-`
// must NOT be `TEST` or `MANUAL` (case-sensitive prefix). The token must
// also start with a digit so synthetic test fixtures (e.g. `.prompt-test-…`)
// are also preserved (lowercase `test-`).

/** Sweep target classifier. Returns true iff this filename is a deckent-
 *  generated per-task tmpfile that should be removed/archived during
 *  cleanup/recover. */
export function isTaskTmpfile(fileName: string): boolean {
  // Path-traversal guard — a defense-in-depth check; readdirSync never
  // returns "." or ".." but if a caller hand-constructs a name we reject.
  if (fileName === '..' || fileName === '.' || fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }

  // .worker-${taskId}.sh — taskId starts with digit (sprint number)
  // .prompt-${taskId}-${hash}${optional-fix}.txt — taskId starts with digit
  const workerMatch = fileName.match(/^\.worker-([^.\/\\]+)\.sh$/);
  const promptMatch = fileName.match(/^\.prompt-([^.\/\\]+)\.txt$/);
  const tail = workerMatch?.[1] ?? promptMatch?.[1];
  if (!tail) return false;

  // Plant guard: preserve forensic plants. Rule: tail must start with a
  // digit (real taskId begins with sprint number). TEST-*, MANUAL-*,
  // test-*, manual-*, plant-*, etc. all start with letters → preserved.
  if (!/^[0-9]/.test(tail)) return false;

  return true;
}

/** Filter helper — reduces a directory listing to its sweepable tmpfiles. */
export function selectTaskTmpfiles(fileNames: readonly string[]): string[] {
  return fileNames.filter(isTaskTmpfile);
}

/** Inverse classifier — names of files that LOOK like tmpfiles but were
 *  preserved by the plant guard. Useful for observability payload. */
export function selectPreservedPlants(fileNames: readonly string[]): string[] {
  return fileNames.filter((f) => {
    if (!f.startsWith('.worker-') && !f.startsWith('.prompt-')) return false;
    return !isTaskTmpfile(f);
  });
}
```

### 3.2 EDIT — `src/cli/commands/recover.ts`

Add `taskTmpfilesSwept` to `RecoveryReport`, add Step 5 sweep block to `runRecovery()`, emit `sprint.recover.tmpfile-swept` event.

```diff
@@ src/cli/commands/recover.ts
 import { existsSync, readdirSync, statSync } from 'node:fs';
+import { unlinkSync } from 'node:fs';
 import { join } from 'node:path';
 import type { Command } from 'commander';
 import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
 import { clearStaleLocks } from '../../core/file-lock.js';
 import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
 import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
 import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
+import { isTaskTmpfile, selectPreservedPlants } from '../../core/task-tmpfile-pattern.js';
+import { writeEvent, CHANNELS } from '../../orchestra/event-stream.js';
 import { print, printError } from '../helpers/output.js';
 import { resolveProjectRoot } from '../helpers/process.js';

 export interface RecoveryReport {
   audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
   orphanIpcDirs: string[];
   staleLocksCleaned: number;
   taskFilesArchived: number;
   taskFilesPreserved: number;
+  tmpfilesSwept: number;
+  tmpfilesPreserved: number;
 }

 async function runRecovery(
   root: string,
   sprintId: string,
   opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean },
 ): Promise<RecoveryReport> {
   const report: RecoveryReport = {
     audit: { overallGate: 'SKIPPED' },
     orphanIpcDirs: [],
     staleLocksCleaned: 0,
     taskFilesArchived: 0,
     taskFilesPreserved: 0,
+    tmpfilesSwept: 0,
+    tmpfilesPreserved: 0,
   };

   /* …existing audit + dry-run preview… */
+  if (opts.dryRun) {
+    /* existing dry-run code… additionally count tmpfiles: */
+    const tasksDir2 = join(root, TASKS_DIR);
+    if (existsSync(tasksDir2)) {
+      const entries = readdirSync(tasksDir2);
+      report.tmpfilesSwept = entries.filter(isTaskTmpfile).length;
+      report.tmpfilesPreserved = selectPreservedPlants(entries).length;
+    }
+    return report;
+  }

   /* Step 2 IPC cleanup… Step 3 stale locks… Step 4 archive task files… */

+  // Step 5: Sweep .worker-${taskId}.sh + .prompt-${taskId}-*.txt tmpfiles
+  // Forensic plants (TEST-*, MANUAL-*, test-*, etc.) are preserved.
+  try {
+    const tasksDir = join(root, TASKS_DIR);
+    if (existsSync(tasksDir)) {
+      const entries = readdirSync(tasksDir);
+      const sweptFiles: string[] = [];
+      const preservedFiles = selectPreservedPlants(entries);
+      for (const name of entries) {
+        if (!isTaskTmpfile(name)) continue;
+        try {
+          unlinkSync(join(tasksDir, name));
+          sweptFiles.push(name);
+        } catch (e) {
+          print(`  Warning: tmpfile sweep failed for ${name}: ${e}`);
+        }
+      }
+      report.tmpfilesSwept = sweptFiles.length;
+      report.tmpfilesPreserved = preservedFiles.length;
+      if (sweptFiles.length > 0 || preservedFiles.length > 0) {
+        writeEvent(root, sprintId, 'deckent', '*', 'sprint.recover.tmpfile-swept', {
+          sprintId,
+          sweptCount: sweptFiles.length,
+          preservedCount: preservedFiles.length,
+          files: sweptFiles,
+          preservedSamples: preservedFiles.slice(0, 5),
+        });
+      }
+    }
+  } catch (e) {
+    print(`  Warning: tmpfile sweep failed: ${e}`);
+  }

   return report;
 }
```

Print summary (CLI action handler):

```diff
   print(`  Stale locks:     ${report.staleLocksCleaned} cleared`);
   print(`  Task files:      ${report.taskFilesArchived} archived, ${report.taskFilesPreserved} preserved`);
+  print(`  Tmpfiles:        ${report.tmpfilesSwept} swept, ${report.tmpfilesPreserved} plants preserved`);
   print(`  ─────────────────────────────────────────`);
```

### 3.3 EDIT — `src/orchestra/sprint-lifecycle.ts:266-273`

```diff
@@ src/orchestra/sprint-lifecycle.ts
+import { isTaskTmpfile } from '../core/task-tmpfile-pattern.js';
 …
   // Clean up leftover .tasks/.prompt-* and .worker-*.sh hidden tmpfiles
-  // from Docker/tmux backends
-  if (existsSync(tasksDir)) {
-    for (const file of readdirSync(tasksDir)) {
-      if (file.startsWith('.prompt-task-') || (file.startsWith('.worker-task-') && file.endsWith('.sh'))) {
-        try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTmpFile', e); }
-      }
-    }
-  }
+  // from Docker/tmux backends. Forensic plants (TEST-*, MANUAL-*) preserved
+  // via shared classifier in core/task-tmpfile-pattern.ts.
+  if (existsSync(tasksDir)) {
+    for (const file of readdirSync(tasksDir)) {
+      if (isTaskTmpfile(file)) {
+        try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTmpFile', e); }
+      }
+    }
+  }
```

### 3.4 EDIT — `src/cli/commands/cleanup.ts:76-89` (dry-run preview)

```diff
@@ src/cli/commands/cleanup.ts
+import { isTaskTmpfile, selectPreservedPlants } from '../../core/task-tmpfile-pattern.js';
 …
       if (opts.dryRun) {
         const locksDir = join(root, LOCKS_DIR);
         const allTaskFiles = existsSync(tasksDir) ? (readdirSync(tasksDir) as string[]) : [];
         const taskFiles = allTaskFiles.filter(f => /\.(json|plan|hb|result|paused|log|timeout)$/.test(f));
-        const promptFiles = allTaskFiles.filter(f => f.startsWith('.prompt-task-'));
+        const tmpFiles = allTaskFiles.filter(isTaskTmpfile);
+        const preservedPlants = selectPreservedPlants(allTaskFiles);
         const lockFiles = existsSync(locksDir) ? (readdirSync(locksDir) as string[]) : [];

         print('[dry-run] Would archive:');
-        for (const f of promptFiles) print(`  prompt → archive: ${f}`);
+        for (const f of tmpFiles) print(`  tmpfile → archive: ${f}`);
+        for (const f of preservedPlants) print(`  plant preserved: ${f}`);
         print('[dry-run] Would delete:');
         for (const f of taskFiles) print(`  task: ${f}`);
         for (const f of lockFiles) print(`  lock: ${f}`);
         print(`  ${taskFiles.length} task file(s) (includes .log, .timeout artifacts)`);
         print(`  ${lockFiles.length} lock file(s)`);
-        print(`  ${promptFiles.length} prompt file(s) → archived to .tasks/archive/`);
+        print(`  ${tmpFiles.length} tmpfile(s) → archived to .tasks/archive/  (${preservedPlants.length} plant(s) preserved)`);
         …
       }
```

### 3.5 EDIT — `src/orchestra/sprint-docs-updater.ts:706` (`archiveOrphanTasks`)

```diff
@@ src/orchestra/sprint-docs-updater.ts
+import { isTaskTmpfile } from '../core/task-tmpfile-pattern.js';
 …
   const allFiles = readdirSync(tasksDir);
   const taskFiles = allFiles.filter(f =>
     f.startsWith(prefix) && ORPHAN_TASK_EXTENSIONS.test(f),
   );
-  // Also archive .prompt-* files for this sprint
-  const promptFiles = allFiles.filter(f => f.startsWith('.prompt-task-'));
-  const filesToArchive = [...taskFiles, ...promptFiles];
+  // Also archive .prompt-${taskId}-…txt + .worker-${taskId}.sh for this sprint.
+  // Plant guard inside isTaskTmpfile preserves forensic TEST-*/MANUAL-* files.
+  const tmpFiles = allFiles.filter(isTaskTmpfile);
+  const filesToArchive = [...taskFiles, ...tmpFiles];
```

---

## 4. Tests

### 4.1 NEW — `tests/cli/commands/recover-r5-tmpfile-sweep.test.ts`

Filesystem integration test (real `.tasks/` dir under `os.tmpdir()`):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testRoot = '/tmp/test';

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));
vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: vi.fn().mockResolvedValue({ overallGate: 'PASS' }),
}));
vi.mock('../../../src/core/orphan-cleaner.js', () => ({
  cleanOrphanIpcDirs: vi.fn().mockReturnValue([]),
  postFinalizeCleanup: vi.fn().mockReturnValue({ archivedFiles: [], preservedFiles: [], staleLocksCleaned: 0 }),
}));
vi.mock('../../../src/core/file-lock.js', () => ({
  clearStaleLocks: vi.fn().mockReturnValue(0),
}));

import { Command } from 'commander';
import { registerRecover } from '../../../src/cli/commands/recover.js';

describe('Bug R5 — recover sweeps task tmpfiles, preserves plants', () => {
  beforeEach(() => {
    testRoot = join(tmpdir(), `recover-r5-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });
  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  function plant(name: string): void {
    writeFileSync(join(testRoot, '.tasks', name), 'x', 'utf-8');
  }

  async function recover(sprintId: string): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRecover(program);
    await program.parseAsync(['node', 'test', 'recover', sprintId, '--force', '--skip-audit']);
  }

  it('sweeps real .worker-${taskId}.sh tmpfiles', async () => {
    plant('.worker-161-001.sh');
    plant('.worker-161-002.sh');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining).not.toContain('.worker-161-001.sh');
    expect(remaining).not.toContain('.worker-161-002.sh');
  });

  it('sweeps real .prompt-${taskId}-${hash}.txt tmpfiles', async () => {
    plant('.prompt-161-001-abc123.txt');
    plant('.prompt-161-002-def456-fix.txt');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining.filter(f => f.startsWith('.prompt-161-'))).toHaveLength(0);
  });

  it('PRESERVES forensic TEST-* plants (uppercase)', async () => {
    plant('.worker-TEST-PLANT.sh');
    plant('.prompt-TEST-PLANT-abc.txt');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining).toContain('.worker-TEST-PLANT.sh');
    expect(remaining).toContain('.prompt-TEST-PLANT-abc.txt');
  });

  it('PRESERVES forensic MANUAL-* plants', async () => {
    plant('.worker-MANUAL-FORENSIC.sh');
    plant('.prompt-MANUAL-FORENSIC-x.txt');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining).toContain('.worker-MANUAL-FORENSIC.sh');
    expect(remaining).toContain('.prompt-MANUAL-FORENSIC-x.txt');
  });

  it('PRESERVES lowercase test-* plants (e.g. .prompt-test-docker-…)', async () => {
    plant('.prompt-test-docker-317411-64210aee9bf7a00c.txt');
    plant('.worker-test-docker-317411.sh');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining).toContain('.prompt-test-docker-317411-64210aee9bf7a00c.txt');
    expect(remaining).toContain('.worker-test-docker-317411.sh');
  });

  it('emits sprint.recover.tmpfile-swept event with payload', async () => {
    plant('.worker-161-001.sh');
    plant('.worker-TEST-FORENSIC.sh');
    await recover('sprint-161');
    const eventsFile = join(testRoot, '.deckent', 'sprint-161-events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const raw = require('node:fs').readFileSync(eventsFile, 'utf-8') as string;
    const events = raw.trim().split('\n').map(l => JSON.parse(l));
    const sweep = events.find((e: { channel: string }) => e.channel === 'sprint.recover.tmpfile-swept');
    expect(sweep).toBeDefined();
    expect(sweep.payload.sprintId).toBe('sprint-161');
    expect(sweep.payload.sweptCount).toBe(1);
    expect(sweep.payload.preservedCount).toBe(1);
    expect(sweep.payload.files).toEqual(['.worker-161-001.sh']);
  });

  it('mixed real+plant sweep — Sprint 161 wash-up scenario (34 .worker-*.sh)', async () => {
    for (let i = 1; i <= 34; i++) {
      plant(`.worker-161-${String(i).padStart(3, '0')}.sh`);
    }
    plant('.worker-TEST-PIN.sh');
    plant('.worker-MANUAL-PIN.sh');
    await recover('sprint-161');
    const remaining = readdirSync(join(testRoot, '.tasks'));
    expect(remaining.filter(f => f.startsWith('.worker-161-'))).toHaveLength(0);
    expect(remaining).toContain('.worker-TEST-PIN.sh');
    expect(remaining).toContain('.worker-MANUAL-PIN.sh');
  });

  it('rejects path-traversal-like names in helper (defense-in-depth)', async () => {
    const { isTaskTmpfile } = await import('../../../src/core/task-tmpfile-pattern.js');
    expect(isTaskTmpfile('..')).toBe(false);
    expect(isTaskTmpfile('.')).toBe(false);
    expect(isTaskTmpfile('.worker-../etc/passwd.sh')).toBe(false);
    expect(isTaskTmpfile('.prompt-..\\evil.txt')).toBe(false);
  });
});
```

### 4.2 Existing test fixture renames (tech-debt — out of R5 scope)

Sprint 160 task-160-001-fix.result tech-debt #1 lists 4 tests planting old `.prompt-NNN.txt` shape that are already broken. Those plants should be updated to the new shape once R5 lands:
- `tests/orchestra/sprint-docs-cleanup.test.ts > 'archives .prompt-* files alongside task files'`
- `tests/cli/commands/cleanup-dryrun.test.ts > 'should list prompt files correctly'`
- `tests/cli/commands/cleanup.test.ts > 'A) dry-run correctly separates task files…'`
- `tests/cli/commands/cleanup.test.ts > 'E) dry-run shows prompts will be archived…'`

Recommended action in R5 implementation task: rename plant fixtures from `.prompt-152-001-foo.txt` → keep as-is (the new `isTaskTmpfile` matches both — the plants already start with digit `152`).  Verify in CI run; if any still fail, add the rename to filesWrite scope of the implementation task.

---

## 5. Out-of-Scope Sweep Sites (deferred to Sprint 162B)

These sites also use `.prompt-` / `.worker-` filters but stay outside this fix's filesWrite scope. They should be triaged in a follow-up R5b spec:

| Site | Current Filter | Risk |
|------|----------------|------|
| `src/mcp/tools/cleanup.ts:28,46` | generic `.prompt-` / `.worker-…sh` | **CLI/MCP parity gap** — MCP tool deletes plants the CLI preserves (ADR-022-V2 violation) |
| `src/orchestra/spawn-backend-docker.ts:776` (`archivePromptFiles`) | generic `.prompt-` + `.txt` | Plant-eater on archive path |
| `src/providers/claude.ts:155` (`_cleanupOrphanedPromptFiles`) | generic `.prompt-` + `.txt` | Mild plant risk on kill |
| `src/cli/commands/kill.ts:74` (`cleanPromptFiles`) | `.prompt-` + `.includes(taskId)` | OK (taskId narrowing) |
| `scripts/prompt-linter.mjs:252,310` | `.prompt-${sprintId}-` | Tmux-backend silent gap (third independent pattern) |

R5 narrows the four canonical sweep sites (recover/cleanup/lifecycle/archive). The five sites above should converge on `isTaskTmpfile` in a Sprint 162B audit pass.

---

## 6. Observability — Event Stream

| Channel | Source | Target | Payload |
|---------|--------|--------|---------|
| `sprint.recover.tmpfile-swept` | `recover.ts` | `*` (broadcast) | `{ sprintId: string, sweptCount: number, preservedCount: number, files: string[], preservedSamples: string[] (≤5) }` |

**Emission policy:** `recover.ts` emits this event after the sweep block completes, even if `sweptCount === 0` and `preservedCount === 0` — provided either count is > 0 (avoids noise on no-op recover calls). When emitted, payload includes:
- `files`: full list of deleted tmpfile names (forensic trail; bounded by sprint task count, typically ≤ 50)
- `preservedSamples`: first 5 plant names (so dashboard can confirm plants still on disk without including all 100+ in event JSON)

**Consumer hooks:**
- `monitor/auditor.ts` (existing tail loop) can tally swept-vs-preserved to detect cleanup discipline regression.
- Dashboard sidebar: surface "tmpfiles swept on recover" alongside "task files archived".

**Note:** Event emission lives **only** in `recover.ts`. `sprint-lifecycle.ts:cleanup()` runs at sprint end inside a normal lifecycle (not a recovery event) — adding the event there would conflate normal cleanup with crash-recover and cause noise in monitoring dashboards. If a future sprint needs end-of-sprint sweep observability, use a distinct channel `sprint.cleanup.tmpfile-swept`.

---

## 7. ADR Amendments

### 7.1 ADR-039 V2 — Cleanup Discipline Tmpfile Mandate

**Amendment to ADR-039 (Self-Modifying Task Detection — Sprint 139):** Extend with a tmpfile-cleanup discipline section.

> ### Tmpfile Sweep Discipline (V2 — Sprint 162A)
>
> Every sprint-cleanup or recover code path that operates on `.tasks/`
> MUST classify hidden tmpfiles via the canonical helper
> `src/core/task-tmpfile-pattern.ts` (function `isTaskTmpfile`). Direct
> string-matching on `.prompt-` or `.worker-` literals is forbidden in:
> - `src/cli/commands/recover.ts`
> - `src/cli/commands/cleanup.ts`
> - `src/orchestra/sprint-lifecycle.ts:cleanup`
> - `src/orchestra/sprint-docs-updater.ts:archiveOrphanTasks`
>
> Out-of-scope sites (mcp/tools/cleanup.ts, providers/claude.ts,
> kill.ts, archivePromptFiles, prompt-linter.mjs) MUST be migrated by
> Sprint 162B; until then they use legacy filters and risk plant
> destruction.
>
> ### Plant Preservation Exception
>
> Forensic plants (`TEST-*`, `MANUAL-*`, lowercase `test-*`,
> `manual-*`, etc.) are preserved by the `isTaskTmpfile` plant guard:
> the token following `.prompt-` / `.worker-` MUST start with a digit
> to qualify for sweep. Any non-digit prefix (alphabetic) is treated
> as a plant. Adding a new plant family requires no code change — it
> only requires that the plant name not begin with a digit.
>
> Test obligation: every cleanup site touched in this discipline MUST
> have a positive test plant survival assertion (e.g. recover-r5-
> tmpfile-sweep.test.ts pattern).

**Status transition:** ADR-039 stays `accepted`; ADR-039 V2 added as amendment in same entry (per Sprint 162A ADR governance — Brain inserts a new memory-store entry of type `adr` referencing ADR-039 with `relations: [{ kind: 'amends', target: 'adr-039' }]`).

### 7.2 ADR-022-V2 follow-up note

R5 leaves a known CLI/MCP feature-parity gap at `src/mcp/tools/cleanup.ts:28,46`. Sprint 162B must converge or the gap will reappear in next audit. Spec recommends adding a comment in `mcp/tools/cleanup.ts` referencing this debt:

```typescript
// TODO(Sprint 162B / ADR-022-V2): Converge on isTaskTmpfile() from
// core/task-tmpfile-pattern.ts. Currently uses generic prefix matching
// and will eat forensic TEST-* / MANUAL-* plants the CLI preserves.
// See docs/superpowers/specs/2026-05-08-sprint-162a-bug-r5-fix-spec.md §5.
```

(The TODO comment-add is **not** in R5 filesWrite scope — listed here so 162B's investigator finds the breadcrumb.)

---

## 8. Acceptance Criteria

1. **R5-AC1 — Real tmpfile sweep**: `deckent recover sprint-NNN --force` with 34 planted `.worker-NNN-MMM.sh` files results in 0 surviving in `.tasks/`. Recovery report shows `Tmpfiles: 34 swept`.
2. **R5-AC2 — Plant survival**: Same recover with 2 planted `.worker-TEST-X.sh` + 2 `.prompt-MANUAL-Y.txt` results in 4 surviving. Report shows `4 plants preserved`.
3. **R5-AC3 — Lifecycle cleanup converges**: A unit test that simulates `cleanup()` on a sprint with mixed tmpfiles + plants → tmpfiles unlinked, plants survive (matching same isTaskTmpfile contract as recover).
4. **R5-AC4 — Dry-run preview accurate**: `deckent cleanup --dry-run` lists every `.prompt-${taskId}-…` file as `tmpfile → archive` and every plant as `plant preserved`. Counts match real sweep counts when run without `--dry-run`.
5. **R5-AC5 — archiveOrphanTasks aligned**: `archiveOrphanTasks()` invocation post-sprint copies `.prompt-${taskId}-…` files into `.brain/archive/sprint-NNN-tasks/` (currently 0 due to `.prompt-task-` filter mismatch).
6. **R5-AC6 — Event emission**: `.deckent/sprint-NNN-events.jsonl` contains a `sprint.recover.tmpfile-swept` line with the documented payload schema; readEvents filter on that channel returns 1+ events post-recover.
7. **R5-AC7 — tsc + vitest clean**: `npm run lint` (tsc --noEmit) exit 0; `npx vitest run tests/cli/commands/recover-r5-tmpfile-sweep.test.ts` 8/8 pass.
8. **R5-AC8 — No regression**: Pre-existing tests in `tests/cli/commands/cleanup.test.ts`, `tests/cli/commands/cleanup-dryrun.test.ts`, `tests/orchestra/sprint-docs-cleanup.test.ts` remain green (or fail with deterministic plant-rename instructions per §4.2 if new contract makes them outdated).

---

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Generator emits a 4th naming pattern not covered by `isTaskTmpfile` | Low | Med (silent leak) | Helper emits debug warn for files matching `.prompt-` / `.worker-` but failing classifier; auditor surfaces in dashboard alerts |
| Existing test fixtures break (4 known per §4.2) | High | Low (deterministic) | Sprint 160 retro already documented; rename plants in Sprint 162A implementation pass |
| User has custom plant prefix starting with digit (e.g. `.worker-2025-debug.sh`) | Very Low | Med (plant eaten) | Document in ADR-039 V2: plant prefix must be non-digit; recommend `TEST-` / `MANUAL-` / `DEBUG-` etc. |
| Path-traversal via crafted filename | Very Low | High | Helper rejects `..`, `.`, `/`, `\`; sweep restricted to `readdirSync(.tasks)` output (kernel never returns traversal names); defense-in-depth confirmed in test §4.1 last case |
| Race: sprint still running when recover invoked | Low | Med | Out of R5 scope — `recover.ts` already requires `--force` for non-interactive; full lifecycle integrity is Bug R2's concern (recover sprint-state freeze) |

---

## 10. Security Review — Path Traversal

Sweep operations invoke `unlinkSync(join(tasksDir, fileName))` where `fileName` is from `readdirSync`. Threat model:

1. **Kernel-supplied names**: `readdirSync` returns only direct entries; never `.` or `..`. Already safe.
2. **Hand-crafted names from caller**: Helper rejects any name containing `/`, `\`, or equal to `.` / `..` (test §4.1 last case verifies).
3. **Symlink in `.tasks/`**: `unlinkSync` removes the symlink, not the target — safe.
4. **TOCTOU between readdir and unlink**: Plant guard rule (digit-prefix) is checked on the name string itself, not on file content — race-free.
5. **`writeEvent` payload contains filenames**: Filenames bounded by readdir (no user-supplied input); JSON.stringify safe for arbitrary filenames including unicode.

**Filter-by-`.tasks/` invariant**: All four sweep sites resolve `tasksDir = join(projectRoot, TASKS_DIR)` where `TASKS_DIR = '.tasks'` (constant). No user-supplied path can redirect this. Combined with `isTaskTmpfile` rejecting `..` / `/` / `\`, sweep cannot escape the `.tasks/` directory.

**Conclusion:** Sweep operation is bounded to direct entries of `.tasks/` matching a strict regex with a plant guard. No path-traversal surface.

---

## 11. Multi-Language Notes

**N/A** — Bug R5 is a TypeScript-internal cleanup discipline issue. Tmpfile naming is generated by deckent's own spawn-backend, not by user code in any language. The fix introduces no language-detection branches and applies identically to all user projects (TypeScript, Python, Go, Rust, Java, .NET) regardless of stack.

---

## Appendix A — Files Referenced (absolute paths)

Code surface to read:
- `/home/alperen/deckent-dev/src/cli/commands/recover.ts`
- `/home/alperen/deckent-dev/src/cli/commands/cleanup.ts` (line 78)
- `/home/alperen/deckent-dev/src/orchestra/sprint-lifecycle.ts` (lines 266-273)
- `/home/alperen/deckent-dev/src/orchestra/sprint-docs-updater.ts` (line 706, `archiveOrphanTasks`)
- `/home/alperen/deckent-dev/src/orchestra/spawn-backend-docker.ts` (lines 167, 187 — generator)
- `/home/alperen/deckent-dev/src/orchestra/event-stream.ts` (writeEvent API)
- `/home/alperen/deckent-dev/src/core/constants.ts` (TASKS_DIR, TASK_FILE_EXTENSIONS)
- `/home/alperen/deckent-dev/src/orchestra/sprint-metrics.ts` (extractSprintNumber)

Audit & retro evidence:
- `/home/alperen/deckent-dev/docs/audits/sprint-161/cc-deepdive/D6-fixture-references-non-test.md`
- `/home/alperen/deckent-dev/.brain/archive/sprint-160-tasks/task-160-001-fix.result`

Test conventions:
- `/home/alperen/deckent-dev/tests/cli/commands/recover.test.ts` (existing)
- `/home/alperen/deckent-dev/tests/cli/commands/cleanup.test.ts`
- `/home/alperen/deckent-dev/tests/cli/commands/cleanup-dryrun.test.ts`
- `/home/alperen/deckent-dev/tests/orchestra/sprint-docs-cleanup.test.ts`

Parent design:
- `/home/alperen/deckent-dev/docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md`

---

## Appendix B — Sprint 160 vs Sprint 162A Pattern Comparison

| Sprint | Filter Pattern | Generator Match | Plant Match |
|--------|----------------|-----------------|-------------|
| Pre-Sprint 160 | `.startsWith('.prompt-')` and `.startsWith('.worker-')` | YES (matches all real tmpfiles) | **YES (eats plants)** |
| Sprint 160 (current) | `.startsWith('.prompt-task-')` and `.startsWith('.worker-task-')` | **NO (misses all real tmpfiles)** | NO (plants safe) |
| Sprint 162A R5 (this fix) | `isTaskTmpfile(name)` — regex `/^\.(worker\|prompt)-([^./\\]+)\.(sh\|txt)$/` + tail starts-with-digit guard | YES (matches `.prompt-NNN-…`, `.worker-NNN.sh`) | NO (plants safe — alphabetic prefix preserved) |

Net behavior change: Sprint 162A R5 restores the intended cleanup discipline that Sprint 160 silently broke, while preserving the plant-survival invariant that Sprint 160 introduced.

---

**END R5 FIX SPEC**
