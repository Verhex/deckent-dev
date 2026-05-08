// src/core/lang/stack-detector.ts
//
// Lang-specific stack detector for the multi-language adapter pattern.
// Distinct from `src/core/stack-detector.ts` (rich framework detection):
// this file is a thin adapter selector that prefers the cached project-stack
// information when available and falls back to a marker-file walk.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { STACKS, projectStackToStackId, type StackId } from './types.js';
import { detectProjectStack } from '../stack-detector.js';

/**
 * Detect the stack for the project at projectRoot.
 *
 * Resolution order:
 *   1. Existing detectProjectStack() (cached in .deckent/project-stack.json)
 *      mapped via projectStackToStackId.
 *   2. STACKS table file existence (TS package.json+tsconfig, Py pyproject.toml,
 *      Go go.mod, Rust Cargo.toml, Java pom.xml, C# *.csproj).
 *   3. null (caller should fall back to typescript adapter for backward compat).
 */
export function detectStack(projectRoot: string): StackId | null {
  // Layer 1: cached project-stack.json via existing detector
  try {
    const ps = detectProjectStack(projectRoot);
    const mapped = projectStackToStackId(ps);
    if (mapped) return mapped;
  } catch {
    /* fall through */
  }

  // Layer 2: file-presence walk (table is small, linear scan is fine)
  for (const entry of STACKS) {
    if (entry.detectFiles.every((f) => existsMaybeGlob(projectRoot, f))) {
      return entry.id;
    }
  }

  return null;
}

/**
 * Check whether `pattern` exists under `root`. Supports a single leading-`*`
 * extension glob (e.g. `*.csproj`, `*.sln`).
 */
function existsMaybeGlob(root: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return fs.existsSync(path.join(root, pattern));
  }
  // Single-star wildcard support for *.csproj, *.sln
  const ext = pattern.replace(/^\*/, '');
  try {
    return fs.readdirSync(root).some((f) => f.endsWith(ext));
  } catch {
    return false;
  }
}
