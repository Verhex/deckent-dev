// ═══ Task Tmpfile Pattern — Single Source of Truth ═══════════════════════
// Classifies hidden tmpfiles in .tasks/ that the Docker spawn backend
// (and tmux backend) emits per task. Used by every cleanup / archive /
// recover path so the sweep filter never drifts.
//
// Generator emissions covered (from src/orchestra/spawn-backend-docker.ts):
//   .prompt-${taskId}-${promptId}${fixSuffix}.txt   (line 167)
//   .worker-${taskId}.sh                              (line 187)
//
// Forensic plants preserved (Sprint 160 invariant — D6 Plan B digit-prefix
// guard):
//   .prompt-TEST-*    .worker-TEST-*
//   .prompt-MANUAL-*  .worker-MANUAL-*
//   .prompt-test-*    .worker-test-*    (lowercase test fixtures)
//   .prompt-manual-*  .worker-manual-*  (lowercase manual fixtures)
//
// Plant guard rule: the token immediately after `.prompt-` / `.worker-`
// MUST start with a digit. Real generator emissions start with the sprint
// number (e.g. `.worker-161-001.sh`). Any non-digit prefix (TEST, MANUAL,
// test, manual, plant, debug, etc.) is preserved.
//
// ADR-039 V2 (Sprint 162A — Bug R5): forbids direct string-matching on
// `.prompt-` / `.worker-` literals at any cleanup site. All cleanup,
// archive, and recover code paths MUST go through `isTaskTmpfile`.

/**
 * Sweep target classifier. Returns true iff the filename is a
 * deckent-generated per-task tmpfile that should be removed/archived
 * during cleanup/recover.
 *
 * Forensic plants (alphabetic prefix after `.prompt-` / `.worker-`)
 * are preserved.
 */
export function isTaskTmpfile(fileName: string): boolean {
  // Path-traversal guard — defense-in-depth. readdirSync never returns
  // "." or ".." but if a caller hand-constructs a name we reject.
  if (
    fileName === '..' ||
    fileName === '.' ||
    fileName.includes('/') ||
    fileName.includes('\\')
  ) {
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

/**
 * Filter helper — reduces a directory listing to its sweepable tmpfiles.
 */
export function selectTaskTmpfiles(fileNames: readonly string[]): string[] {
  return fileNames.filter(isTaskTmpfile);
}

/**
 * Inverse classifier — names of files that LOOK like tmpfiles
 * (start with `.prompt-` or `.worker-`) but were preserved by the
 * plant guard. Useful for observability payload.
 */
export function selectPreservedPlants(fileNames: readonly string[]): string[] {
  return fileNames.filter((f) => {
    if (!f.startsWith('.worker-') && !f.startsWith('.prompt-')) return false;
    return !isTaskTmpfile(f);
  });
}
