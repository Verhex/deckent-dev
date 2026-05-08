# D9 — Security Surface (Sprint 161)

Lane 3 Agent D9 — pre-beta security baseline audit. OWASP top 10 lens, secret leakage, sandbox bypass surface. **READ-ONLY**.

Audit scope: `/home/alperen/deckent-dev`
Audit date: 2026-05-08

---

## 1. Secret scan results

**Command:**
```
grep -rEn '(api[_-]?key|secret|password|token|bearer|credential)\s*[:=]\s*["'\''][a-zA-Z0-9_-]{20,}' . \
  --include='*.ts' --include='*.json' --include='*.md' --include='*.yml' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
```

- Hits in tracked files: **0**
- Details: Empty result set. No literal secrets longer than 20 chars stored in tracked source/JSON/MD/YAML.

Status: CLEAN.

---

## 2. .env / .deck inventory

**Command:**
```
find . -name '.env*' -not -path './node_modules/*' -not -path './.git/*'
find . -name '.deck'  -not -path './node_modules/*' -not -path './.git/*'
```

- `.env*` files found: **0**
- `.deck` files found: **0**
- Git-tracked secret files (`git ls-files .deck .env .env.*`): **0**

All gitignored: **Y** (defense-in-depth — file class is gitignored, no instances exist).

`.gitignore` covers (lines 51–58 of root `.gitignore`):
```
.env
.env.*
.deck
*.pem
*.key
credentials.json
```

Plus AES-256-GCM encrypted credential keyring at `~/.deckent/.keyring` (outside repo, mode 0600 — `src/core/credential-encryption.ts:69-72`). Master key resolved via `DECKENT_MASTER_KEY` env or auto-generated keyring file.

Status: CLEAN.

---

## 3. Dockerfile USER directive

**Command:** `grep -nE '^USER\s' Dockerfile`

- Status: **present non-root**
- Line: `Dockerfile:30: USER deckent`
- User created with `groupadd -r deckent && useradd -r -g deckent` (line 25) — system account, no shell login.
- `WORKDIR /workspace` post-USER (line 33) — runtime cwd is non-privileged.

`Dockerfile.worker` (1416 bytes) — separate worker image; was not in the audit checklist but worth a follow-up scan in Sprint 162.

Status: PASS (root Dockerfile).

---

## 4. AST sandbox observations (`src/core/marketplace/skill-sandbox.ts`)

Two-pass scan: regex (all files) + AST via `ts.createSourceFile()` (`.ts/.js` only).

| Pattern | Regex blocked | AST blocked | Notes |
|---------|---------------|-------------|-------|
| `eval(...)` | Y (line 32) | Y (`DANGEROUS_CALLS`, line 59) | Both direct + bracket-access (`global['eval']`) + obfuscated concat (`'ev'+'al'`) caught (lines 119–134, 170–193) |
| `new Function(...)` / `Function(...)` | Y (line 33) | Y (`DANGEROUS_CALLS` + NewExpression handler line 148) | |
| `child_process` | Y (line 34) + `node:child_process` (line 38) | Y (`DANGEROUS_MODULES` line 47) — covers `require()` + dynamic `import()` | |
| `fs` direct require | Y (line 35) | Y (`DANGEROUS_MODULES` line 51 — both `fs` and `node:fs`) | |
| `process.env` | Y (line 36) | N | Regex-only; AST does not flag — but regex catches all forms |
| Command-execution call patterns | Y (line 37) | Partial — `child_process` family blocked via module ban; standalone method-name match caught only by regex | False positives possible (regex-name collision) but raises issue not error |
| `globalThis` / `global.` | Y (line 39) | Y — `global.eval`, `globalThis.eval` PropertyAccess (lines 156–161) | |
| `Proxy(...)` | Y (line 40) | N | Regex only |
| `net` module | Y (line 41) | Y (`DANGEROUS_MODULES` line 53) | |
| `os` module | N (regex) | Y (`DANGEROUS_MODULES` line 52) | AST-only — minor regex gap |
| `setTimeout('code', ...)` (string-arg) | N | Y (`DANGEROUS_STRING_ARG_CALLS`, line 62, lines 103–108) | |

### Bypass surface

- **Trusted-skill allowlist short-circuit** — `BUILTIN_TRUSTED_SKILLS` set (line 197) bypasses scanning entirely for the 5 built-in skill IDs (`typescript-expert`, `react-expert`, `node-expert`, `test-expert`, `doc-expert`). Note: actual built-in skill IDs differ — DECKENT.md lists 21 skills, only 5 are pre-trusted here. This is acceptable (built-ins ship from repo) but should be cross-checked against `src/core/skill-registry.ts` to confirm naming alignment.
- **TypeScript lazy-load fallback** — if `typescript` package not available at runtime (`scanCodeAST` returns `[]`), only regex-pass runs. Production npm install ships `typescript` as devDep — if a user installs `deckent` as runtime dep without devDeps, AST scan silently degrades. **MEDIUM** finding.
- **Manifest-only validation** — `validateManifest` checks `id`, `name`, `version`, `category`. Does not verify provenance/signature. ed25519 signing infrastructure exists (`@noble/ed25519`) but not wired into manifest validator.
- **Hidden directory skip** — `_collectFiles` skips `name.startsWith('.')` (line 376). A skill author could place malicious code under `.hidden/payload.ts` and avoid scanning. **MEDIUM** finding.
- **Unicode/encoding obfuscation** — regex pass operates on raw bytes. Skills using homoglyph variants would bypass regex; AST normalizes during parse, so AST pass mitigates this for `.ts/.js`. Non-`.ts/.js` files (`.md`, `.json`) only use regex.

Forbidden patterns blocked correctly: **Y for all primary patterns** (eval, Function, child_process, fs, process.env). **MEDIUM** gaps documented above.

---

## 5. SQL injection surface

**Commands:**
```
grep -rn "prepare(.*\${" src/core/ --include="*.ts"
grep -rEn '\.run\(`.*\${|prepare\(`[^`]*\${' src/ --include="*.ts"
```

- String-concat queries: **0**
- All `db.prepare(...)` calls use static SQL strings; user-controlled values are bound via named params (`@type_0`, `@status_0`, `@tag_0`, etc. — see `src/core/memory-query.ts:290-366` and `src/core/memory-store.ts`).
- `db.exec(...)` calls (memory-store.ts lines 90, 148, 180, 189, 215, 224, 233): all are static DDL strings (`CREATE TABLE`, `CREATE VIRTUAL TABLE`, `ALTER TABLE`) without interpolation.
- Dynamic IN-clause placeholder generation (`buildFilterClauses`): placeholders are `@type_${i}` — index `i` is integer-only (loop counter), values are bound separately. Safe.

Locations of dynamic SQL construction (all parameterized):
- `src/core/memory-query.ts:217-229` (FTS5 dual-layer search, named binds)
- `src/core/memory-query.ts:268-274` (structured search, named binds)
- `src/core/memory-query.ts:290-366` (filter clause builder — placeholders generated from array length, values bound)

Status: PASS — no SQL injection surface observed.

---

## 6. .deck contract bypass surface (direct `process.env`)

**Command:** `grep -rn "process.env\[" src/ --include="*.ts"`

- `process.env[...]` (bracket): **60 hits**
- `process.env.X` (dot): **21 hits** (excluding dashboard `node_modules`)
- **Total direct env access (production code): ~81**

### Categorization of hits

| Category | Count (approx) | Locations | Bypass concern |
|----------|---------------|-----------|----------------|
| API key resolution | ~15 | `src/core/provider.ts`, `src/core/model-registry-refresh.ts`, `src/providers/{claude,gemini}.ts`, `src/cli/commands/doctor-checks.ts` | Expected — `.deck` file is loaded into `process.env` upstream by `src/core/deck-file.ts`; subsequent reads via `process.env[...]` are intentional. Not a bypass; **but see finding** |
| Runtime/debug toggles | ~10 | `DECKENT_DEBUG`, `DECKENT_MCP_ACTIVE`, `DECKENT_WORKER_MODE`, `DECKENT_PARENT_PID`, `NODE_ENV`, `VITEST` | Operational flags, not secrets |
| Provider/mode/style overrides | ~10 | `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_STYLE` | Config layer, no secret |
| LANG / NO_COLOR / locale | ~5 | `subprocess.ts`, `output.ts`, `splash.ts`, `init-wizard.ts` | OS metadata |
| `process.env['ANTHROPIC_API_KEY'] = claudeKey` write | 1 | `src/core/provider.ts:487` | **Mutation** — sets env from credential store at runtime, then later code reads via `process.env`. Intentional bridging pattern, but means in-memory plaintext lives in `process.env` until process exit. |

### Bypass observations

- **No central abstraction** — there is `src/core/deck-file.ts` (`KNOWN_DECK_KEYS` enum, `parseDeckFile`), but downstream consumers read `process.env` directly rather than going through a typed accessor. A `getSecret(key)` wrapper would centralize logging/audit hooks. **LOW** finding (refactor opportunity).
- **`process.env` mutation at line 487 of `provider.ts`** — writes `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` from credential store back into `process.env` for downstream subprocess/SDK consumption. This is a deliberate bridge to support libraries that only read env. Risk: any code (including imported skills if they ran outside the AST sandbox) could read these via `process.env`. The skill sandbox **does** block `process.env` (regex line 36), so contained.

Status: **NO bypass observed**, but refactor recommendation logged.

---

## 7. `package.json` script shell injection surface

Scripts inspected:
```
build:        "tsc && node scripts/copy-assets.mjs"
dev:          "tsc --watch"
test:         "vitest run"
test:watch:   "vitest"
test:coverage:"vitest run --coverage"
test:dashboard:"vitest run --config vitest.dashboard.config.ts"
build:dashboard:"cd src/dashboard && npx vite build --outDir ../../dist/dashboard"
build:all:    "tsc && node scripts/copy-assets.mjs && npm run build:dashboard"
postbuild:    "npm run build:dashboard"
lint:         "tsc --noEmit"
lint:adr:     "node scripts/adr-validator.mjs"
lint:errors:  "node scripts/check-error-handling.mjs"
clean:        "rm -rf dist"
validate:publish: "npx tsx scripts/validate-publish.ts"
docs:generate-cli:"npx tsx scripts/generate-cli-docs.ts"
prepublishOnly: "npm run build"
```

- No user-controlled inputs interpolated into script strings.
- `clean` runs `rm -rf dist` — destructive but path is hardcoded.
- `prepublishOnly` runs build only; no env-var interpolation.

Status: PASS — no shell injection vector via `npm run` chain.

---

## 8. `.github/workflows/` secret usage

**Command:** `grep -rEn "secrets\." .github/workflows/`

| Workflow | Line | Reference | Purpose |
|----------|------|-----------|---------|
| `publish.yml` | 49 | `${{ secrets.NPM_TOKEN }}` | Dry-run publish auth |
| `publish.yml` | 54 | `${{ secrets.NPM_TOKEN }}` | Real npm publish |
| `release.yml` | 73 | `${{ secrets.NPM_TOKEN }}` | npm publish on tag push |

- Total secrets referenced: **1 unique** (`NPM_TOKEN`) across 3 sites
- Other workflow files (`ci.yml`, `cross-platform-e2e.yml`, `docs.yml`): **0 secret references** — type-check, test, build only.
- Both `publish.yml` and `release.yml` set `permissions: id-token: write` for npm provenance (sigstore OIDC) — this is correct: `npm publish --provenance` requires OIDC, so PAT-based fallback with token is properly scoped.
- **`release.yml:48-59`** uses GitHub-derived inputs (`GITHUB_REF_NAME`) and writes them to `/tmp/release-notes.txt` via `awk`. The variable is passed through shell expansion (`${GITHUB_REF_NAME#v}`) — git tag names cannot contain shell metacharacters that escape the awk regex meaningfully, but **a malicious tag name could cause awk pattern issues**. **LOW** finding.

Status: PASS — minimal secret surface, principle of least privilege observed.

---

## 9. Shell-spawn surface review (bonus — within scope)

Inventory of synchronous child-process calls in production paths:

| File | Line | Command | User input? |
|------|------|---------|-------------|
| `src/core/deck-file.ts` | 187 | `git ls-files --error-unmatch .deck` | Static |
| `src/agents/worker-verify.ts` | 127 | `${testCmd} --reporter=verbose ${scope.join(' ')}` | **Scope from task JSON** |
| `src/agents/worker-verify.ts` | 254 | `npx tsc --noEmit` or stack-detected build | Static (stack-detected) |
| `src/orchestra/mid-sprint-adapter.ts` | 228 | `git diff --stat HEAD${pathArgs}` | **pathArgs from worker output** |
| `src/orchestra/mid-sprint-adapter.ts` | 258 | `npx tsc --noEmit` | Static |
| `src/orchestra/mid-sprint-adapter.ts` | 284 | `npx vitest run --reporter=json ${testPatterns.join(' ')}` | **testPatterns from worker** |

### Finding (HIGH)

**`worker-verify.ts:122-127`** — `command` string is built via template literal with `scope.join(' ')`. `scope` comes from the task JSON file (`scope.directories`). If a malicious user (or compromised brain) writes a task JSON with a directory containing shell metacharacters, the synchronous child-process call would interpret it as shell. The default invocation goes through `/bin/sh`. **Same issue at mid-sprint-adapter.ts:228 (pathArgs) and :284 (testPatterns)**.

In practice, scope/paths come from Brain (trusted) — but ADR-037 RBAC and ADR-039 self-modifying-task detection acknowledge that brain-worker boundary is a security perimeter. A task-JSON poisoning attack (e.g., supply-chain via `.tasks/` write outside Brain) could leverage this.

Mitigation already partially in place: `verifyCompilation` and `verifyTests` are called by Worker on its own scope after Brain has written it; ADR-037 enforces Worker scope writes via RBAC. But shell-string template literal usage violates ADR-006 spawnSync security pattern in spirit (although ADR-006 is about spawnSync specifically). Recommended fix: switch to `execFileSync(bin, args[])` form which bypasses the shell.

---

## Findings (severity-tagged)

| ID | Severity | Area | Finding | File:Line |
|----|----------|------|---------|-----------|
| D9-F1 | LOW | Secret scan | No secrets leaked in tracked files. Defense-in-depth: `.env`/`.deck` gitignored AND not present. | (clean) |
| D9-F2 | LOW | Dockerfile | Non-root `USER deckent` set. `Dockerfile.worker` (separate image) not in this scan — recommend audit in Sprint 162. | `Dockerfile:30` |
| D9-F3 | MEDIUM | Sandbox | AST scan silently degrades to regex-only if `typescript` package not installed at runtime (lazy-load fallback at `scanCodeAST`). Production install of `deckent` without devDeps → AST pass is no-op. | `skill-sandbox.ts:71-79` |
| D9-F4 | MEDIUM | Sandbox | `_collectFiles` skips entries starting with `.` — malicious skill could hide payload under `.hidden/` directory and bypass both regex and AST scans. | `skill-sandbox.ts:376` |
| D9-F5 | LOW | Sandbox | `BUILTIN_TRUSTED_SKILLS` set (5 IDs) does not match the 21 actual built-in skill IDs in the project. Risk that legitimate built-ins are scanned (acceptable) but also risk of stale allowlist not aligning with `skill-registry.ts`. | `skill-sandbox.ts:197-203` |
| D9-F6 | LOW | Sandbox | Manifest validator does not verify ed25519 signature even though `@noble/ed25519` is a runtime dependency. Provenance check missing. | `skill-sandbox.ts:289-319` |
| D9-F7 | LOW | SQL | All queries parameterized via `better-sqlite3` named binds. Zero injection surface. | (clean) |
| D9-F8 | LOW | Env access | 81 direct `process.env` reads scattered across providers, config, doctor, CLI. No central typed accessor — refactor to `getSecret()` pattern would centralize audit + logging. | (cross-cutting) |
| D9-F9 | LOW | Env mutation | `provider.ts:487` writes credentials back into `process.env` to bridge SDK consumers. In-memory plaintext lifecycle = process lifetime. Skill sandbox blocks `process.env`, so contained — but documented behavior. | `provider.ts:487-494` |
| D9-F10 | PASS | npm scripts | No user-controlled input in `package.json` scripts. | (clean) |
| D9-F11 | LOW | CI workflows | Single secret (`NPM_TOKEN`) used at 3 sites, scoped to publish/release workflows. OIDC `id-token: write` properly enabled for `--provenance`. | `publish.yml`, `release.yml` |
| D9-F12 | LOW | CI workflow | `release.yml:48-59` interpolates `GITHUB_REF_NAME` (tag name) into shell `awk` pipeline. Tag names are constrained by GitHub but worth quoting/escaping. | `release.yml:48-59` |
| D9-F13 | **HIGH** | Shell spawn | Shell-string template-literal interpolation of task `scope.directories`, `pathArgs`, `testPatterns` in `worker-verify.ts` and `mid-sprint-adapter.ts`. Defaults to `/bin/sh` shell parsing. If `.tasks/` is written outside Brain (supply-chain or RBAC bypass), attacker can inject shell metacharacters via scope. ADR-037 RBAC mitigates but does not eliminate. | `worker-verify.ts:127, 254`, `mid-sprint-adapter.ts:228, 258, 284` |
| D9-F14 | LOW | npm audit | `ci.yml` runs `npm audit --audit-level=high` with `continue-on-error: true`. Vulnerabilities surface in CI logs but do not block. Acceptable for dev velocity, document for beta GA. | `ci.yml:33-34` |

**Severity legend:** HIGH = exploitable in plausible scenario / should fix before beta GA; MEDIUM = defense-in-depth gap; LOW = hygiene/refactor recommendation.

---

## Sprint 162+ recommendations

1. **[HIGH] Replace shell-string spawn calls with `execFileSync(bin, args[])`** in `worker-verify.ts` and `mid-sprint-adapter.ts`. Eliminates shell metacharacter interpretation. Aligns with ADR-006 spirit. Estimated effort: NORMAL — ~5 call sites.
2. **[MEDIUM] Make AST scanning mandatory in skill-sandbox.** Either:
   - Bundle `typescript` as a runtime dep (size cost ~60MB), or
   - Hard-fail `validateSkillSafety` if `typescript` is missing (safer default than silent regex-only fallback).
3. **[MEDIUM] Remove `name.startsWith('.')` skip in `_collectFiles`.** Or scan hidden dirs explicitly with a denylist (`.git`, `node_modules` only). Closes payload-hiding bypass.
4. **[LOW] Reconcile `BUILTIN_TRUSTED_SKILLS` with `src/core/skill-registry.ts`.** Either remove the allowlist (always scan, even built-ins) or sync with the 21 production built-ins.
5. **[LOW] Wire ed25519 manifest signature validation in `validateManifest`.** Infra is already a dependency. Define key distribution model (ship with project? per-author?) before committing.
6. **[LOW] Introduce `src/core/secret-store.ts` with typed `getSecret(key: KnownDeckKey)` accessor.** Replace 81 `process.env[...]` call sites incrementally. Adds audit hook for `deckent doctor` and prepares for vault integrations (Sprint 170+).
7. **[LOW] Audit `Dockerfile.worker` separately.** Was outside this lane's scope; should mirror root Dockerfile USER discipline.
8. **[LOW] Quote `GITHUB_REF_NAME` in `release.yml` awk pipeline.** Defense in depth; GitHub already constrains tag names but explicit escaping is hygiene.
9. **[LOW] Promote `npm audit` to `continue-on-error: false`** before beta GA — or pin a specific allowlist of acceptable findings.
10. **[BONUS] Add `npm audit signatures` step to `publish.yml`.** Validates dependency provenance before npm publish. Pairs with the `--provenance` flag already in use.

---

## Audit attestation

- READ-ONLY: Yes. No source files modified. No secret values printed (counts/patterns only).
- Single output file: `docs/audits/sprint-161/cc-deepdive/D9-security-surface.md`.
- Lane 3 / Agent D9 / Sprint 161 — Security Surface.
