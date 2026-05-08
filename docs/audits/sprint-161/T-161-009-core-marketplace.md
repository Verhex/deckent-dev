# T-161-009 — Core Marketplace Audit (READ-ONLY)

**Sprint:** 161 (Lane 1 God-Level Static Audit)
**Task:** T-161-009 — `src/core/marketplace/` (sandbox + registry)
**Mode:** READ-ONLY (no source changes; only this report is written)
**Date:** 2026-05-08
**Worker:** w-161-009 (model: opus, agent: doc-writer + skills typescript-expert,security-specialist)

---

## 1. Scope

Five files audited — entire `src/core/marketplace/` directory (1,206 LoC, well within the 2,000 LoC budget):

| File | LoC | Responsibility |
|------|-----|----------------|
| `src/core/marketplace/skill-sandbox.ts` | 390 | Two-pass (regex + TypeScript AST) static security scan, manifest validation, quarantine, trust list |
| `src/core/marketplace/registry-client.ts` | 195 | HTTPS/HTTP client for remote skill registry (search, detail, publish), 429 handling |
| `src/core/marketplace/dependency-resolver.ts` | 271 | Topological sort (Kahn) for skill deps, circular detection, custom semver compare |
| `src/core/marketplace/marketplace-auth.ts` | 150 | File-based marketplace token store at `~/.deckent/credentials/marketplace.json` |
| `src/core/marketplace/rating-system.ts` | 200 | Local + user-submitted skill ratings, weighted formula, JSON file persistence |

**Lead questions per directive:**
1. AST sandbox bypass surface — handled in §3.A
2. `eval` / `Function` / `child_process` / `fs` / `process.env` block coverage — handled in §3.B
3. Production wiring vs dead code — handled in §3.C

**Cross-references consulted (read only — outside the audit scope but inspected for production-wiring evidence):** `src/core/plugin-loader.ts`, `src/cli/commands/skill-marketplace.ts`, `tests/core/marketplace/*.test.ts`.

---

## 2. Findings — Severity Index

| Sev | # | Title | File | Dimension |
|-----|---|-------|------|-----------|
| **P0** | F-1 | `typescript` is a `devDependency` — `scanCodeAST` silently no-ops in production installs, leaving only the regex pass | `skill-sandbox.ts:71-79` | Sandbox bypass / Dependency hygiene |
| **P0** | F-2 | `BUILTIN_TRUSTED_SKILLS` set names (`react-expert`, `node-expert`, `test-expert`, `doc-expert`) do not match the real built-in skill IDs (`react-specialist`, `documentation-writer`, `testing-expert`, …) — every legitimate built-in is treated as untrusted | `skill-sandbox.ts:197-203` | Drift / Dead trust list |
| **P1** | F-3 | `RegistryClient` defaults to `http:` when `registryUrl` is overridden with a non-`https:` URL — no protocol pinning, no allowlist, no MitM defense | `registry-client.ts:74-79` | Security A02/A10 (TLS, SSRF) |
| **P1** | F-4 | Marketplace token persisted in plaintext to `~/.deckent/credentials/marketplace.json` — bypasses ADR-014 (`.deck` AES-256-GCM secret system) | `marketplace-auth.ts:80-88` | ADR violation / A02 Crypto Failures |
| **P1** | F-5 | `_collectFiles` extension allowlist `(ts|js|mjs|cjs|json|md)` excludes `.tsx`, `.jsx`, `.ts.snap`, `.sh`, `.py`, etc. — a malicious skill can ship payloads in `.tsx`/`.jsx` and load them via dynamic import at runtime, never having been scanned | `skill-sandbox.ts:380` | Sandbox bypass |
| **P1** | F-6 | `quarantine()` uses `renameSync` only — fails with `EXDEV` when project root and `.quarantine` straddle a filesystem boundary (volume / bind-mount / overlay), silently returning `false` and leaving the unsafe skill in place | `skill-sandbox.ts:333-339` | Reliability / Security |
| **P1** | F-7 | Registry client has no response-body byte ceiling — server (or MitM) can stream gigabytes into `Buffer.concat`, OOM-killing the CLI | `registry-client.ts:151-176` | DoS resilience |
| **P1** | F-8 | `_compareSemver` strips non-numeric chars before comparing (`"1.0.0-alpha".replace(/[^0-9.]/g,'')` → `"1.0.0"`) — pre-release versions are treated equal to their release counterpart, breaking the "highest version" guarantee in `resolveConflicts` | `dependency-resolver.ts:259-269` | Drift / Bug |
| **P1** | F-9 | Suspicious-pattern regex `process.env` blocks **all** environment access — pushes legitimate skills to be quarantined or forces users to disable scan; high false-positive rate erodes trust | `skill-sandbox.ts:36` | Sandbox usability / Drift |
| **P2** | F-10 | `RatingSystem` has zero `src/` callers — only consumed by `tests/core/marketplace/rating-system.test.ts`. Either wire into `deckent skill` flow or mark for removal | `rating-system.ts` (entire file) | Dead code |
| **P2** | F-11 | `DependencyResolver` has zero `src/` callers — only consumed by `tests/core/marketplace/dependency-resolver.test.ts` and `tests/core/non-null-safety.test.ts`. Same dilemma as F-10 | `dependency-resolver.ts` (entire class) | Dead code |
| **P2** | F-12 | `DependencyConflictError` exported but never thrown anywhere in `src/`. `resolveConflicts` returns the highest version instead of throwing on conflict; the error class is vestigial | `dependency-resolver.ts:32-40` | Dead code / API drift |
| **P2** | F-13 | `_collectFiles` traverses symlinks without detection (`isDirectory()` follows the link); a malicious skill with `lib/payload -> /etc/passwd` causes the scanner to read system files (read-only impact, but breaks isolation invariant) | `skill-sandbox.ts:368-389` | Defense in depth |
| **P2** | F-14 | `tryResolveStringConcat` only handles binary `+` AST nodes — template literals (`\`ev${''}al\``), `String.fromCharCode(101,118,97,108)`, and `Array.prototype.join` obfuscation all bypass the obfuscation defense | `skill-sandbox.ts:171-193` | Sandbox completeness |
| **P2** | F-15 | `RatingSystem.submitRating` accepts `comment` of unbounded length and never sanitizes — DoS vector (multi-MB JSON), and reflective injection if a downstream renderer trusts the field | `rating-system.ts:94-112` | A03 Injection / DoS |
| **P2** | F-16 | `MarketplaceAuth.login` swallows `chmodSync` failures silently (`try { … } catch {}`) — on Windows or non-POSIX volumes the token may end up world-readable with no warning | `marketplace-auth.ts:82-87` | Security observability |
| **P2** | F-17 | Two `defaultFS` records (`skill-sandbox.ts:216`, `dependency-resolver.ts:49`, `marketplace-auth.ts:45`, `rating-system.ts:41`) — same FS-injection idiom is duplicated four times. Candidate for shared helper | core/marketplace/* | Duplication |
| **P2** | F-18 | `RegistryClient` and `MarketplaceAuth` use a hardcoded `User-Agent: 'deckent-cli'` — there is no version suffix; registry-side observability cannot distinguish CLI versions for deprecation/forced-upgrade flows | `registry-client.ts:146` | Drift |
| **P3** | F-19 | `validateManifest` does not require `description`, `entrypoint`, or `permissions` — fields the `skill-marketplace.ts` CLI does require (`validateManifestForPublish`, `description` mandatory) — two manifest contracts diverge | `skill-sandbox.ts:289-319` vs `cli/commands/skill-marketplace.ts:53-61` | Drift |
| **P3** | F-20 | `RegistryClient.searchSkills` clamps `limit` to `[1,100]` but does not clamp `page` to a maximum — a caller can iterate to `page=Number.MAX_SAFE_INTEGER` | `registry-client.ts:84-91` | Robustness |
| **P3** | F-21 | `RatingSystem._saveRating` rewrites the entire ratings JSON on every `calculateLocalRating` call (no batching, no fsync) — wasted I/O for hot paths | `rating-system.ts:176-199` | Performance |
| **P3** | F-22 | `MarketplaceTokenEntry.storedAt` recorded but never consulted — no token expiry / rotation flow | `marketplace-auth.ts:75-78` | API drift |
| **P3** | F-23 | `_collectFiles` recurses without depth limit — a malicious skill with very deep directory tree can stack-overflow the recursive scanner | `skill-sandbox.ts:367-389` | Defense in depth |
| **P3** | F-24 | `RegistryClient` `User-Agent` and `Accept` are spread before user-supplied `headers` (`...options?.headers`) — caller can override `Authorization` with a bogus value or strip `User-Agent` | `registry-client.ts:142-147` | Defensive coding |
| **P3** | F-25 | `SkillSandboxError` exported but never thrown — only `SafetyReport` failure shape is returned. Either remove the class or wire the throw path | `skill-sandbox.ts:22-27` | Dead code |
| **P3** | F-26 | Comment "node_modules and hidden directories" at `skill-sandbox.ts:376` — but `name === 'node_modules'` is a single literal check; if a malicious skill ships its payload under `node_modules-evil/` the directory IS scanned. Cosmetic mismatch with intent | `skill-sandbox.ts:376` | Drift / cosmetic |
| **P3** | F-27 | `_topologicalSort` ends with `result.reverse()` and a comment explaining "Kahn's gives reverse order" — but Kahn's normally gives topological order from sources to sinks; the reverse here is because graph edges are `skill → dep` (reverse of "install order"). The comment block at `:206-208,229-230` partly explains it but the logic is fragile to refactor | `dependency-resolver.ts:194-231` | Maintainability |

No additional **P0** beyond F-1/F-2. Both P0s break the sandbox's core security invariant under realistic install scenarios; combined they reduce the marketplace defense to ten weak regex patterns.

---

## 3. Lead-Question Deep-Dives

### 3.A — AST Sandbox Bypass Surface

**File:** `src/core/marketplace/skill-sandbox.ts:64-168`

The defense is structured as two passes:

```typescript
// Pass 1: Fast regex scan (all file types)
for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
  if (pattern.test(content)) issues.push(`${relFile}: ${description}`);
}

// Pass 2: AST scan (.ts/.js files only — more accurate, catches obfuscation)
if (/\.(ts|js|mjs|cjs)$/.test(file)) {
  const astViolations = scanCodeAST(content, file);
  …
}
```

`scanCodeAST` covers most of the documented attack vectors:

| Attack | AST detection |
|--------|--------------|
| `eval(payload)` | ✓ `CallExpression` + `DANGEROUS_CALLS.has('eval')` |
| `Function('return …')()` | ✓ direct + `new` |
| `globalThis['eval']('…')` | ✓ `ElementAccessExpression` with string literal |
| `globalThis['ev'+'al']('…')` | ✓ `tryResolveStringConcat` (binary `+` only) |
| `global.eval('…')` | ✓ `PropertyAccessExpression` |
| `require('child_process')` | ✓ explicit `DANGEROUS_MODULES` set |
| `await import('child_process')` | ✓ `node.expression.kind === ts.SyntaxKind.ImportKeyword` branch |
| `setTimeout('alert(1)', 100)` | ✓ string-arg branch |

Documented gaps that still bypass:

```typescript
// Gap 1: Template literal obfuscation (F-14)
globalThis[`ev${''}al`]("alert(1)");
//        ↑ TemplateExpression — not a BinaryExpression; tryResolveStringConcat skips

// Gap 2: Indirect handle (regex `/eval\s*\(/` matches; AST path also handles
// PropertyAccessExpression — but only on global/globalThis. Below escapes both:
const e = (0, eval); e("alert(1)");
//         ↑ ParenthesizedExpression + SequenceExpression coerces to indirect eval
//         AST visitor only inspects CallExpression.expression as Identifier — `e`
//         is a local Identifier whose binding is not tracked.

// Gap 3: Reflect-based (regex misses, AST misses)
Reflect.apply(eval, null, ['alert(1)']);
//             ↑ `eval` here is Identifier inside a CallExpression argument; the
//             visitor only checks the outer CallExpression's expression
//             (Reflect.apply, a PropertyAccessExpression on Reflect — not in the
//             allowlist). Reflect itself is unflagged.

// Gap 4: Constructor pattern (PARTIALLY caught: `new Function` IS detected)
const F = (function(){}).constructor; F('alert(1)')();
//        ↑ MemberExpression chain — neither pattern fires.

// Gap 5: String.fromCharCode-built name
const name = String.fromCharCode(101,118,97,108);
globalThis[name]('alert(1)');
//          ↑ ElementAccessExpression with Identifier (not string literal) →
//          AST scanner gives up, regex doesn't see "eval" anywhere.

// Gap 6: WebAssembly / Worker / vm module — none in the DANGEROUS_MODULES list.
require('vm').runInNewContext('process.exit()');   // not blocked
require('worker_threads').Worker;                   // not blocked
```

**Verdict on §3.A:** Coverage is **good for the named OWASP-Top-10 patterns** but is not a complete sandbox. It is best characterized as a "defense in depth" linter — a determined attacker can bypass with intermediate aliasing, Reflect, vm, or worker_threads. The doc-comment on line 1-3 ("Security validation and quarantine system") slightly oversells its assurance level.

---

### 3.B — `eval` / `Function` / `child_process` / `fs` / `process.env` Block Coverage

**Regex layer** (`SUSPICIOUS_PATTERNS`, `skill-sandbox.ts:31-42`):

| Pattern | What it matches | Caveat |
|---------|----------------|--------|
| `/eval\s*\(/` | Direct `eval(` call | Misses `const e = eval; e(...)` (tested in F-14 above) |
| `/Function\s*\(/` | `Function(` and `Function (` | Also matches `Array.from.call.Function(` and other identifiers ending in `Function` — false positive surface is small but non-zero |
| `/child_process/` | Any literal substring | Triggers on **doc strings** containing the word; `// child_process is forbidden` blocks the file |
| `/require\s*\(\s*['"]fs['"]/` | `require('fs')` only | Misses `require("node:fs")`, `import fs from 'fs'`, `import('fs')` |
| `/process\.env/` | Any env access | F-9: triggers on legitimate code (`process.env.NODE_ENV` is universal) |
| `/\.exec\s*\(/` | Any `.exec(` member call | Triggers on `RegExp.prototype.exec`, `Array.from(...).exec(...)`, jest `expect(...).exec(...)` — high FP |
| `/import\s+.*from\s+['"]node:child_process['"]/` | `import x from 'node:child_process'` | Misses `import('node:child_process')` (caught by AST), misses default import without `from` keyword |
| `/globalThis\|global\./` | Either token | Triggers on `// globalThis polyfill` doc-comments |
| `/Proxy\s*\(/` | `Proxy(` and `new Proxy (` | Proxy is a legitimate language feature; large FP surface |
| `/require\s*\(\s*['"]net['"]/` | `require('net')` only | Same misses as `fs`: `node:net`, dynamic import, `import` syntax |

**AST layer** (`DANGEROUS_MODULES`, `skill-sandbox.ts:47-56`):

```typescript
new Set(['child_process', 'node:child_process', 'fs', 'node:fs',
         'os', 'node:os', 'net', 'node:net'])
```

Notable absences from `DANGEROUS_MODULES`:
- `vm` / `node:vm` (script evaluation in fresh context — equivalent to eval)
- `worker_threads` / `node:worker_threads` (spawns isolated JS contexts that can call dangerous APIs unscanned)
- `dgram` / `node:dgram` (UDP — exfiltration without TCP rules)
- `cluster`, `inspector`, `perf_hooks` (each enables its own escape hatch)
- `https` / `http` (network exfil; the codebase itself uses these but a skill ought to declare network permissions explicitly)

**Verdict on §3.B:** The five named blocks are present. The regex layer has high false-positive rates (env, proxy, exec) which will frustrate skill authors. The AST layer's module allowlist is significantly smaller than Node's actual escape hatch surface — `vm` and `worker_threads` in particular are well-known JS-sandbox-escape vectors and are not blocked.

---

### 3.C — Production Wiring vs Dead Code

Cross-cutting grep results (`SkillSandbox|RegistryClient|DependencyResolver|MarketplaceAuth|RatingSystem`):

| Class | Production callers in `src/` | Test callers | Verdict |
|-------|------------------------------|--------------|---------|
| `SkillSandbox` | `src/core/plugin-loader.ts:13`, `src/cli/commands/skill-marketplace.ts:9` | yes | **Live** — security-critical |
| `RegistryClient` | `src/cli/commands/skill-marketplace.ts:7` | yes | **Live** — CLI search/publish |
| `MarketplaceAuth` | `src/cli/commands/skill-marketplace.ts:8` | yes | **Live** — CLI auth |
| `DependencyResolver` | **none** | `tests/core/marketplace/dependency-resolver.test.ts`, `tests/core/non-null-safety.test.ts` | **Dead** (F-11) — implementation tested but never invoked |
| `RatingSystem` | **none** | `tests/core/marketplace/rating-system.test.ts` | **Dead** (F-10) — same |

`DependencyConflictError` (F-12) is exported but never thrown anywhere — `resolveConflicts` returns the highest version silently, so the error class can never be raised. It is dead even within its own module.

`SkillSandboxError` (F-25) is exported but the public methods (`validateSkillSafety`, `validateManifest`, `quarantine`, `trustSkill`, `isTrusted`, `getBuiltinTrustedSkills`) all return shapes (`SafetyReport`, `ManifestValidation`, `boolean`, `void`, `string[]`) instead of throwing.

---

## 4. Evidence — File:Line Citations

| Finding | Citation |
|---------|----------|
| F-1 | `skill-sandbox.ts:71-79` (`createRequire(import.meta.url); esmRequire('typescript')`); `package.json:devDependencies.typescript` |
| F-2 | `skill-sandbox.ts:197-203` vs `agent-pool.ts` real built-ins / `.deckent/skills/*/manifest.json` IDs (`react-specialist`, `documentation-writer`, …) |
| F-3 | `registry-client.ts:74-79` (`parsedUrl.protocol === 'http:' ? http : https`) |
| F-4 | `marketplace-auth.ts:80-88` (`writeFileSync(filePath, JSON.stringify(entry, null, 2))`); ADR-014 mandates AES-256-GCM `.deck` |
| F-5 | `skill-sandbox.ts:380` (`/\.(ts|js|mjs|cjs|json|md)$/.test(name)`) |
| F-6 | `skill-sandbox.ts:333-339` (`renameSync(skillDir, targetDir); … catch { return false; }`) |
| F-7 | `registry-client.ts:151-176` (`Buffer.concat(chunks)` with no `chunks.length` cap) |
| F-8 | `dependency-resolver.ts:259-269` (`a.replace(/[^0-9.]/g, '')`) |
| F-9 | `skill-sandbox.ts:36` (`{ pattern: /process\.env/, description: 'Environment variable access' }`) |
| F-10 | grep `RatingSystem` in `src/` returns only `src/core/marketplace/rating-system.ts` itself |
| F-11 | grep `DependencyResolver` in `src/` returns only `src/core/marketplace/dependency-resolver.ts` itself |
| F-12 | `dependency-resolver.ts:32-40` declared, `dependency-resolver.ts:113-124` (`resolveConflicts` returns highest, never throws) |
| F-13 | `skill-sandbox.ts:368-389` (no `entry.isSymbolicLink()` check) |
| F-14 | `skill-sandbox.ts:171-193` (only `BinaryExpression` with `PlusToken`) |
| F-15 | `rating-system.ts:94-112` (`comment?: string` no length check, no escape) |
| F-16 | `marketplace-auth.ts:82-87` (silent `try { chmodSync } catch {}`) |
| F-17 | `skill-sandbox.ts:216-223`, `dependency-resolver.ts:49-52`, `marketplace-auth.ts:45-52`, `rating-system.ts:41-46` |
| F-18 | `registry-client.ts:146` (`'User-Agent': 'deckent-cli'` — no version) |
| F-19 | `skill-sandbox.ts:289-319` vs `cli/commands/skill-marketplace.ts:53-61` |
| F-20 | `registry-client.ts:84-91` (`Math.max(1, options?.page ?? 1)` — only floor) |
| F-21 | `rating-system.ts:176-199` (writes file in `_saveRating` on every score update) |
| F-22 | `marketplace-auth.ts:22-25` (`storedAt: string` field never read elsewhere) |
| F-23 | `skill-sandbox.ts:367-389` (no depth ceiling on `_collectFiles`) |
| F-24 | `registry-client.ts:142-147` (`...options?.headers` spread last, allows override of `User-Agent`/`Accept`) |
| F-25 | `skill-sandbox.ts:22-27` exported, never thrown |
| F-26 | `skill-sandbox.ts:376` (`if (name === 'node_modules' || name.startsWith('.')) continue;` — single literal) |
| F-27 | `dependency-resolver.ts:194-231` (`result.reverse()` at end with two divergent comments) |

---

## 5. Migration Triage

Recommended classification per file for "is this safe to ship in a public marketplace SDK?":

| File | Classification | Rationale |
|------|---------------|-----------|
| `skill-sandbox.ts` | **KEEP-PRIVATE** until F-1/F-2/F-5/F-6 fixed | Production-wired (plugin-loader + CLI). Two P0s render its security guarantees illusory. Public release without fixing them advertises a sandbox that does not exist. |
| `registry-client.ts` | **KEEP-PRIVATE** until F-3/F-7/F-18 fixed | Security A02/DoS issues. Pinning HTTPS, capping body size, and versioning the User-Agent are prerequisites. |
| `marketplace-auth.ts` | **KEEP-PRIVATE** until F-4 fixed | ADR-014 violation. Plaintext token leaks if `~/.deckent/credentials/` is backed up to a non-encrypted store, copied to a screenshare, or read by a sibling tool. Migrate to `.deck` AES-256-GCM. |
| `dependency-resolver.ts` | **DELETE-CANDIDATE** or **MIGRATE-PUBLIC** with rewrite | No `src/` callers. Either wire to `deckent skill install` (the obvious intended user) or remove. If wired, F-8 (semver) and F-12 (vestigial conflict error) must be fixed; the custom semver compare should be replaced by the `semver` package. |
| `rating-system.ts` | **DELETE-CANDIDATE** | No `src/` callers. The data flow (local stats → rating recalc on every event → JSON rewrite) has not yet been integrated with `outcome-tracker.ts` or the skill registry. Until a consumer exists, code rots. |

**Cross-file:** the four duplicated `defaultFS` records (F-17) suggest a small `core/marketplace/_fs.ts` helper would tighten the module's surface. Worth a follow-up sprint task in the migration cycle.

---

## 6. Recommendation — Sprint 162+ Work Description (NOT a code change)

The audit findings cluster into three classes of follow-up work:

### 6.1 Security correctness (must-fix before public marketplace launch)
- **R-1 (F-1):** Move `typescript` to `dependencies` (or vendor a minimal AST scanner). Without this, the public install of deckent has no AST defense. **OR** remove the lazy-load fallback and emit a hard `SkillSandboxError` with a clear remediation message when `typescript` is absent — never silently disable the second pass.
- **R-2 (F-2):** Reconcile `BUILTIN_TRUSTED_SKILLS` with the real built-in skill IDs (`agent-pool.ts` / `.deckent/skills/*/manifest.json`). Either populate dynamically from `skill-pool.ts` or remove the trust list entirely if it is no longer the design. Document the trust model in an ADR amendment.
- **R-3 (F-3):** Enforce `https:` for the registry URL by default. Allow `http:` only when an explicit `--insecure` flag is set, log a warning, and gate `publishSkill` to require `https:`. Add a registry URL allowlist for the corporate / mirrored deployment story.
- **R-4 (F-4):** Migrate marketplace token storage to the `.deck` AES-256-GCM system per ADR-014. Encrypt at rest; decrypt only when the publish call needs the bearer header. Add token expiry/rotation using the existing `storedAt` field.
- **R-5 (F-5, F-13, F-23):** Harden `_collectFiles`: include `.tsx`, `.jsx`, executable extensions; refuse to traverse symlinks (`statSync.isSymbolicLink()` check); cap recursion depth at e.g. 32 levels.
- **R-6 (F-6):** When `renameSync` raises `EXDEV`, fall back to copy + delete via `cp -R` semantics (or `fs.cpSync` + `rm -rf`). Otherwise quarantine silently fails on Docker bind-mounts.
- **R-7 (F-7):** Add a `MAX_RESPONSE_BYTES` constant (e.g. 5 MB) and reject responses that exceed it. Stream the parse instead of `Buffer.concat` if the registry payload could grow unbounded.
- **R-8 (F-9, F-19):** Rebalance the regex layer: drop `process.env`, `Proxy`, `globalThis|global.`, `.exec` (too many false positives — they should be linter-grade warnings, not safety failures). Promote any genuinely dangerous patterns to AST-level checks.
- **R-9 (F-14):** Extend `tryResolveStringConcat` to handle template literals (`TemplateExpression`) and known `String.prototype.concat` / `Array.prototype.join` patterns. Or alternatively, detect indirect-eval idioms (`(0, eval)`, `Reflect.apply(eval, …)`).
- **R-10 (Dangerous module list):** Add `vm`, `node:vm`, `worker_threads`, `node:worker_threads`, `dgram`, `node:dgram`, `cluster`, `node:cluster`, `inspector`, `node:inspector` to `DANGEROUS_MODULES`.

### 6.2 Dead code disposition (per ADR-038)
- **R-11 (F-10, F-11, F-12, F-25):** Decide for each of `RatingSystem`, `DependencyResolver`, `DependencyConflictError`, `SkillSandboxError`: wire to a real consumer, or remove. Recommendation: open Sprint 162 task to integrate `DependencyResolver` into `deckent skill install`, and fold `RatingSystem` into `outcome-tracker.ts`'s skill-stats pipeline. If neither integration lands by Sprint 165, delete.

### 6.3 Drift / hygiene (P2/P3 cleanup)
- **R-12 (F-15):** Cap comment length (e.g. 1024 chars) and HTML-escape on read. Add a maximum submissions-per-skill cap.
- **R-13 (F-16):** Emit a warning when `chmodSync` fails on the credential file (still proceed, but tell the user).
- **R-14 (F-17):** Extract shared FS abstraction to `core/marketplace/_fs.ts`.
- **R-15 (F-18):** Append `package.json` `version` to the User-Agent.
- **R-16 (F-19):** Unify `validateManifest` (in `skill-sandbox.ts`) with `validateManifestForPublish` (in `cli/commands/skill-marketplace.ts`). Single source of truth — likely best to live in `skill-sandbox.ts` and be re-exported.
- **R-17 (F-21):** Batch `_saveRating` writes (debounce 1 s) or migrate to SQLite (the project already runs `better-sqlite3` for memory).
- **R-18 (F-24):** Spread caller `headers` BEFORE the safe defaults so `User-Agent` and `Accept` cannot be overridden, and reject any caller-supplied `Authorization` header at the API surface.
- **R-19 (F-27):** Replace the hand-rolled topological sort + reverse with a documented Kahn's-with-reversed-edges helper, and add an inline comment block explaining the edge direction once.

### 6.4 Test gaps (informational)
- The five test files cover happy paths well but do not cover: (a) `typescript` absent at runtime — F-1; (b) `EXDEV` quarantine failure — F-6; (c) `Buffer.concat` huge response — F-7; (d) symlink traversal — F-13; (e) deep nested directories — F-23. A sprint task to add these adversarial fixtures would convert every P-flag above into a regression-detection asset.

---

## 7. ADR Compliance Summary

| ADR | Status |
|-----|--------|
| ADR-001 (TypeScript + ESM) | ✓ all imports use `.js` suffix; `import * as fs from 'node:fs';` ESM-correct |
| ADR-002 (Node16 module resolution) | ✓ no missing `.js` |
| ADR-006 (spawnSync security) | N/A — no spawn in this module |
| ADR-007 (SpawnOptions interface) | N/A |
| ADR-014 (.deck secret system, AES-256-GCM) | **✗ violated** by `marketplace-auth.ts` (F-4) |
| ADR-027 (Hybrid spawn backend) | N/A |
| ADR-034 (Multi-Project Isolation) | partial — marketplace token at `~/.deckent/credentials/` is user-global by design (acceptable: marketplace identity is per-user, not per-project), but should be documented explicitly in the ADR |
| ADR-037 (Brain-Auditor-Worker authority) | N/A — marketplace runs at CLI/load time, not inside sprint pipeline |
| ADR-038 (Dead Code Disposition) | partial — F-10/F-11/F-12/F-25 are dead per the ADR's criteria |
| ADR-039 (Self-Modifying Detection) | N/A — this is a user-facing module, not the sprint pipeline |

---

## 8. Out of Scope (Explicitly Untouched)

Per directive, this audit is READ-ONLY and constrained to `src/core/marketplace/`. The following adjacent files were **read** for cross-reference but are NOT in scope:

- `src/core/plugin-loader.ts` — covered by a separate task (T-161-007 or T-161-009 cross-link)
- `src/cli/commands/skill-marketplace.ts` — covered by T-161-028 (CLI advanced commands)
- `src/core/signature.ts` — covered by T-161-008
- All tests under `tests/core/marketplace/` — out of sprint scope (per DIRECTIVES `DO NOT touch tests/`)

No source code was modified. No file outside `docs/audits/sprint-161/T-161-009-core-marketplace.md` was written.

---

## 9. Audit Self-Check

- [x] Single audit report written, single-path scope respected
- [x] All five marketplace files read in full
- [x] 27 findings cataloged with severity, file:line evidence, and dimension
- [x] Three lead questions addressed with concrete bypass examples
- [x] Migration triage completed for each file
- [x] Sprint 162+ recommendation list does NOT include code changes — only descriptions
- [x] ADR cross-reference (ADR-014 violation called out explicitly)
- [x] Boundary check: `git diff --stat` should show only this report file added

**End of T-161-009 audit report.**
