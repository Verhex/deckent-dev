# T-161-008 — Core Credentials, Deck-File, Global-Config, Signature Audit

**Sprint:** 161 (Lane 1, READ-ONLY)
**Task:** 161-008
**Worker:** w-161-008 / docker-161-008 (claude / opus)
**Date:** 2026-05-08
**Mandate:** READ-ONLY static audit. No source modifications. Single audit report under `docs/audits/sprint-161/`.

---

## 1. Scope

Files audited (≤8 files, ≤2000 LoC):

| File | Bytes | LoC | mtime |
|------|------:|----:|-------|
| `src/core/credentials.ts` | 8083 | 266 | 2024-04-24 |
| `src/core/deck-file.ts` | 6873 | 199 | 2024-04-24 |
| `src/core/global-config.ts` | 2302 | 74 | 2024-04-24 |
| `src/core/signature.ts` | 6069 | 159 | 2026-05-06 |

Supporting files inspected for cross-reference (NOT modified):

- `src/core/credential-encryption.ts` (140 LoC) — referenced by credentials.ts for AES-256-GCM
- `src/core/constants.ts` — for `GLOBAL_*` paths
- `src/core/utils.ts:78` — `readJsonSafe`
- `src/core/config.ts:147` — `deepMerge`
- `src/core/provider.ts:479` — `applyDeckSecretsToEnv` (downstream consumer of .deck)
- `.brain/exports/decisions.md:141` — ADR-014 source-of-truth text

Test coverage signal (existing):

| Suite | LoC | Status |
|-------|----:|--------|
| `tests/core/credentials.test.ts` | 435 | reasonable |
| `tests/core/credential-encryption.test.ts` | 356 | reasonable |
| `tests/core/deck-file.test.ts` | 305 | reasonable |
| `tests/core/global-config.test.ts` | 261 | reasonable |
| `tests/core/signature.test.ts` | 136 | thin (ratio 0.86 LoC test:src) |

---

## 2. Findings (P0/P1/P2/P3 by dimension)

### P0 — Architectural / ADR Violation

**F-1 [ADR Violation] ADR-014 promises worker isolation, runtime breaks it.**
- **Dimension:** ADR violations, drift, security
- **ADR-014 text** (`.brain/exports/decisions.md:149`): *"Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder."* — Workers MUST NOT see `.deck` content; Brain injects only necessary keys per task scope.
- **Local code intent** (`src/core/deck-file.ts:81-83`): "Does NOT inject into process.env — Brain decides what to pass to workers." ✓
- **Runtime reality** (`src/core/provider.ts:485-503`): `applyDeckSecretsToEnv()` writes `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` directly to `process.env` of the Brain process. Any subprocess/Docker/tmux worker spawned thereafter inherits the **complete** secret set — there is no per-task scope filter.
- **Severity rationale:** Three forces compound this: (1) ADR-014 is the design contract; (2) ADR-034 (Multi-Project Isolation) explicitly extends this to per-project boundaries; (3) ADR-037 (RBAC) authority matrix assumes worker secrets are scoped. The current implementation negates all three.
- **Why this is P0 (not P1):** A stated security boundary is silently absent. Documentation, ADRs, and code comments tell the user a guarantee that the runtime does not actually deliver. The fix is non-trivial (per-task secret injection requires the spawn backends to filter env), so it cannot be hot-fixed before public beta.

### P1 — Security / Cryptographic Hygiene

**F-2 [Crypto] AES-256-GCM ciphertexts are not bound to the credential file (no AAD).**
- **Dimension:** Type safety / security
- **Evidence:** `src/core/credential-encryption.ts:91-103`. `createCipheriv('aes-256-gcm', masterKey, iv)` is called without `cipher.setAAD(...)`. The persisted JSON envelope (`{ provider, encrypted: { iv, ciphertext, tag } }`) stores the provider name in plaintext — but it is not authenticated. An attacker with read-write access to `~/.deckent/credentials/` can swap the `encrypted` blob between two files (e.g., copy `claude.json`'s ciphertext into `openai.json`) and decryption succeeds because the master key is shared. The runtime then uses the wrong key for the wrong provider.
- **Severity rationale:** The threat actor model that justifies encryption-at-rest (anyone with disk access who shouldn't have plaintext) trivially bypasses the integrity guarantee. Fix is one line: `cipher.setAAD(Buffer.from(provider, 'utf-8'))` at encrypt and `decipher.setAAD(...)` at decrypt — but it is a stored-format change requiring a migration path.

**F-3 [Permissions] `signature.ts` does not chmod-retry the private key file.**
- **Dimension:** Security
- **Evidence:** `src/core/signature.ts:51` writes `private.hex` with `{ mode: 0o600 }` but does not follow up with `chmodSync(privPath, 0o600)`. The two sister modules use that pattern explicitly:
  - `credentials.ts:120-124` — chmod-retry under try/catch with comment "in case umask interfered"
  - `credential-encryption.ts:71-75` — same pattern for the keyring file
- On Linux/WSL with permissive umask (`002`), `writeFileSync(... { mode: 0o600 })` may produce 0o660 — group-readable. The `.gitignore` does not protect against host-level group readability.
- **Severity rationale:** A single Ed25519 private key compromises every signature ever produced; this is the most sensitive byte sequence in the project. Symmetric chmod-retry across the three crypto modules is cheap and consistent.

**F-4 [Permissions] `global-config.ts:ensureGlobalDir()` does not set 0o700 on `~/.deckent/`.**
- **Dimension:** Security, drift
- **Evidence:** `src/core/global-config.ts:17-23`. `mkdirSync(GLOBAL_DECKENT_DIR, { recursive: true })` and same for `GLOBAL_CREDENTIALS_DIR` — neither sets a `mode`. By contrast:
  - `credentials.ts:67` does set `mode: 0o700` when *first* creating the credentials dir.
  - `credential-encryption.ts:65` sets `mode: 0o700` for the keyring dir.
- Race condition: if `deckent config set ...` runs before any `deckent credential add`, both `~/.deckent/` and `~/.deckent/credentials/` are created with default umask permissions. A subsequent `storeCredential` call short-circuits (`existsSync(this.credentialsDir)` is true) and never tightens the directory mode.
- **Severity rationale:** Plaintext config (`~/.deckent/config.json`) and the keyring file may live in a 0o755 directory, making them world-readable on multi-user systems.

**F-5 [TOFU] No symlink protection on `.deck` reads.**
- **Dimension:** Security
- **Evidence:** `src/core/deck-file.ts:90` — `readFileSync(deckPath, 'utf-8')` follows symlinks unconditionally. If a project is checked out into a directory where another user (or a stale layout) controls a `.deck` symlink, an attacker can redirect the read to e.g. `/etc/passwd`. The `parseDeckFile` parser only emits keys matching `^[A-Za-z_][A-Za-z0-9_]*$` so unrelated content is mostly filtered, but a crafted file could still inject `DECKENT_*` keys that collide with the user's intended secrets.
- **Severity rationale:** Lower likelihood than F-1/F-2 because it requires local control of the filesystem, but trivial to mitigate with `lstat()` + `O_NOFOLLOW`.

**F-6 [Validation] `DECKENT_MASTER_KEY` env var length check is byte-count after hex decode, not character count.**
- **Dimension:** Type safety / drift
- **Evidence:** `src/core/credential-encryption.ts:42-49`. `Buffer.from(envKey, 'hex')` silently truncates at the first non-hex character. `Buffer.from('00'.repeat(32) + 'gg', 'hex').length === 32` passes the length check but the user gave 66 chars (32 valid hex bytes + 2 garbage). The error message reports "got 66 chars" only when the **hex-decoded** length is wrong, not when the input is malformed but happens to decode to 32 bytes.
- **Severity rationale:** Operator footgun — if a user pastes a key with a stray character at the end, the system accepts a silently-truncated key and all encryptions use the wrong material relative to what the user thinks. Fix: `if (!/^[0-9a-fA-F]{64}$/.test(envKey)) throw …` before `Buffer.from`.

### P2 — Drift, Conflicts, Type Hygiene

**F-7 [Drift] `loadDeckSecrets` doc-comment is technically true but globally misleading.**
- **Dimension:** Drift, documentation pollution
- **Evidence:** `src/core/deck-file.ts:81-82` — *"Does NOT inject into process.env — Brain decides what to pass to workers."* Statement is correct in isolation (this function returns a `Record<string, string>`). The misleading part is that the **only** Brain code path that uses this function (`provider.ts:549`) immediately calls `applyDeckSecretsToEnv()` (`provider.ts:479-505`) which writes to `process.env`. A reader following the comment expects opt-in, scoped injection, not a system-wide write. See F-1 for the security consequence.
- **Severity rationale:** P2 because the wrong mental model leaks into other modules' design — e.g., a future developer wiring a new provider would copy the `applyDeckSecretsToEnv` pattern, perpetuating the F-1 violation.

**F-8 [Conflict] `mergeWithProjectConfig` does redundant double `deepMerge`.**
- **Dimension:** Conflicting / duplicated logic
- **Evidence:** `src/core/global-config.ts:52-59`:
  ```
  const withGlobal = deepMerge(projectConfig, globalConfig);   // global wins
  return deepMerge(withGlobal, projectConfig);                  // project re-wins
  ```
- The same end-state is `deepMerge(globalConfig as DeckentConfig, projectConfig)` (one call). The current 2-step likely exists because the type signature `deepMerge<T>(base: T, override: Partial<T>)` requires a `T` base; treating `Partial<DeckentConfig>` as `T` would need a cast. The cost: every config merge triples the work (two `structuredClone` traversals over the full config, plus a wasted intermediate object). For a 200-key config, this is microseconds — negligible perf, but smells.
- **Severity rationale:** Pure code smell, not a bug, hence P2.

**F-9 [Type] `as KnownDeckKey` cast in `deck-file.ts:113` masks an array-`includes` widening pitfall.**
- **Dimension:** Type safety
- **Evidence:** `KNOWN_DECK_KEYS.includes(key as KnownDeckKey)` where `key: string`. The cast is a workaround for TS's strict `Array.includes` typing on `readonly` literal arrays. Cleaner: `(KNOWN_DECK_KEYS as readonly string[]).includes(key)`. Functionally identical, but the current form trains the codebase to accept type assertions on user-supplied keys.

**F-10 [Type] `as unknown as CredentialEntry` in `credentials.ts:151,229` is a runtime-shape unverified cast.**
- **Dimension:** Type safety
- **Evidence:** `credentials.ts:150-152` and `:229`. `readJsonSafe<Record<string, unknown>>(...)` returns either `null` or arbitrary JSON. The plaintext-entry branch then casts to `CredentialEntry` without validating the `provider`/`key`/`storedAt` shape. If a malicious actor writes `{"provider":"claude","key":null}` to the file, `getCredential` returns `null` (which the contract permits), but `getCredentialEntry` returns a `CredentialEntry` with a null `key` — the type system says `string` but the runtime says `null`. Down-stream callers may then crash with `Cannot read property 'length' of null`.
- **Severity rationale:** P2 because the malicious-write threat model also implies disk access, but the point is the code does not defensively validate.

**F-11 [Inconsistency] `signature.ts` mixes sync and async key loading.**
- **Dimension:** Drift / API design
- **Evidence:** `signature.ts:25-29` defines `generateKeypair()` (async, uses `getPublicKeyAsync`), but `signature.ts:34-55` defines `loadOrGenerateKeypair()` (sync, uses `getPublicKey`). There is no functional reason for the asymmetry — `loadOrGenerateKeypair` could call `getPublicKey` either way since `sha512Sync` is wired at module load. The two functions essentially duplicate the keypair-generation logic with slightly different semantics. A consumer that wants "load if exists, generate otherwise" with async semantics has no path.

**F-12 [Side-effect] `signature.ts` mutates `@noble/ed25519` at module-load.**
- **Dimension:** Conflict / dependency hygiene
- **Evidence:** `signature.ts:12-13`:
  ```
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));
  ```
- The library requires this wiring (per @noble/ed25519 v2 contract), but the side-effect is global. If another file in the project imports `@noble/ed25519` and assigns a different `sha512Sync` (e.g., a wrapper that logs), the **last import wins** — no diagnostic, no warning. Sprint 153 sign-seed-skills.mjs script (referenced in signature.ts:117) is the only other caller in repo per spot grep, so live-impact is low. But the pattern is brittle if marketplace adds more crypto consumers.

### P3 — Doc / Cosmetic

**F-13 [Doc] `signature.ts:117` references "Sprint 153 sign-seed-skills.mjs" but no link.**
- **Dimension:** Documentation pollution
- **Evidence:** Inline comment claims a sister script will replace placeholder format. Without a path/symlink, future readers must grep to verify the script exists.

**F-14 [Doc] `credentials.ts:50-53` JSDoc says "stored in a separate file with 0600 permissions" but does not mention encryption-at-rest by default.**
- **Dimension:** Drift
- **Evidence:** The class-level docstring describes file-mode protection but omits that since Sprint 145+ encryption is enabled by default (`encryptionEnabled = options?.encryption ?? true`). A reader skimming the class header would think the only protection is filesystem permissions.

**F-15 [Doc] `global-config.ts:ensureGlobalDir()` JSDoc claims to create `~/.deckent/credentials/` but only `~/.deckent/` is documented in `GLOBAL_DECKENT_DIR`.**
- **Dimension:** Documentation
- **Evidence:** Function does create both, code matches, but the JSDoc could mention that this is also where credentials live — relevant for ADR-034 multi-project isolation discussion.

**F-16 [Dead] No dead code detected in target set.**
- **Dimension:** Dead code
- **Evidence:** Every exported symbol in the four files has at least one reference in `src/`:
  - `credentials.ts` exports — used by CLI commands `credential-set`/`credential-list`/`credential-delete` and provider modules.
  - `deck-file.ts` exports — used by `provider.ts`, CLI doctor, `api/server.ts`.
  - `global-config.ts` exports — used by `config.ts`, CLI config command, doctor.
  - `signature.ts` exports — used by `core/marketplace/skill-sandbox.ts`, skill publish/install commands.

### Summary Table

| ID | Severity | Dimension | File | Line(s) | Title |
|----|----------|-----------|------|--------:|-------|
| F-1 | P0 | ADR / Drift / Sec | provider.ts (consumer) | 485-503 | ADR-014 worker isolation broken at runtime |
| F-2 | P1 | Crypto | credential-encryption.ts | 91-103, 109-128 | AES-GCM no AAD → cross-file blob swap |
| F-3 | P1 | Sec | signature.ts | 51 | Missing chmod-retry on private key |
| F-4 | P1 | Sec | global-config.ts | 17-23 | `~/.deckent/` not chmod 0o700 |
| F-5 | P1 | Sec | deck-file.ts | 90 | No symlink protection on .deck read |
| F-6 | P1 | Type / Sec | credential-encryption.ts | 42-49 | DECKENT_MASTER_KEY hex validation gap |
| F-7 | P2 | Drift | deck-file.ts | 81-82 | Misleading "no env injection" comment |
| F-8 | P2 | Conflict | global-config.ts | 52-59 | Redundant double deepMerge |
| F-9 | P2 | Type | deck-file.ts | 113 | `as KnownDeckKey` widening cast |
| F-10 | P2 | Type | credentials.ts | 151, 229 | `as unknown as CredentialEntry` unverified |
| F-11 | P2 | Drift | signature.ts | 25-55 | Sync/async keypair API asymmetry |
| F-12 | P2 | Conflict | signature.ts | 12-13 | Global `@noble/ed25519` mutation |
| F-13 | P3 | Doc | signature.ts | 117 | Missing link to Sprint 153 script |
| F-14 | P3 | Doc | credentials.ts | 50-53 | JSDoc omits encryption-at-rest default |
| F-15 | P3 | Doc | global-config.ts | 14-15 | JSDoc omits credentials subdir |
| F-16 | — | Dead code | (all) | — | No dead code detected |

---

## 3. Evidence — file:line citations

```
src/core/credentials.ts:59-63         constructor accepts options.encryption, default true
src/core/credentials.ts:67            mode: 0o700 only at first ensureDir
src/core/credentials.ts:71-74         provider name sanitized via /[^a-zA-Z0-9_-]/g
src/core/credentials.ts:117           writeFileSync mode 0o600
src/core/credentials.ts:120-124       chmodSync 0o600 follow-up (defensive)
src/core/credentials.ts:140-148       isEncryptedEntry → decrypt with master key
src/core/credentials.ts:151           `entry = raw as unknown as CredentialEntry` — F-10
src/core/credentials.ts:229           same unsafe cast — F-10
src/core/deck-file.ts:11-21           KNOWN_DECK_KEYS readonly tuple (9 entries)
src/core/deck-file.ts:81-95           loadDeckSecrets — does NOT inject env (correct in isolation)
src/core/deck-file.ts:90              readFileSync — no symlink check — F-5
src/core/deck-file.ts:101-123         validateDeckFile — warnings on unknown keys
src/core/deck-file.ts:113             KNOWN_DECK_KEYS.includes(key as KnownDeckKey) — F-9
src/core/deck-file.ts:160-180         ensureDeckGitignore — auto-adds .deck
src/core/deck-file.ts:185-198         isDeckFileCommitted — execSync('git ls-files ...') — fixed argv, no injection
src/core/global-config.ts:17-24       ensureGlobalDir — no mode arg — F-4
src/core/global-config.ts:43-46       writeGlobalConfig — no mode arg either
src/core/global-config.ts:52-59       mergeWithProjectConfig — double deepMerge — F-8
src/core/signature.ts:5-13            @noble/ed25519 + global sha512Sync wiring — F-12
src/core/signature.ts:25-29           generateKeypair (async)
src/core/signature.ts:34-55           loadOrGenerateKeypair (sync) — F-11
src/core/signature.ts:50              mkdirSync mode 0o700
src/core/signature.ts:51              writeFileSync mode 0o600 — but no chmod-retry — F-3
src/core/signature.ts:118-158         verifySkillSignature — placeholder rejection, sig length check
src/core/signature.ts:139-141         long-form `ed25519:hub:<pubkey>:<sig>` — embedded pubkey ignored
src/core/credential-encryption.ts:23-27   ALGORITHM = 'aes-256-gcm'; IV_BYTES = 12; KEY_BYTES = 32
src/core/credential-encryption.ts:42-49   DECKENT_MASTER_KEY length check — F-6
src/core/credential-encryption.ts:91     iv = randomBytes(IV_BYTES)  ← CSPRNG, no IV reuse
src/core/credential-encryption.ts:92-103  AES-GCM no AAD — F-2
src/core/credential-encryption.ts:117-122 setAuthTag + decipher — auth tag verified
src/core/provider.ts:485-503          applyDeckSecretsToEnv — writes process.env globally — F-1
.brain/exports/decisions.md:141-149   ADR-014 source text (worker isolation contract)
```

---

## 4. Migration triage (per file)

| File | Triage | Reasoning |
|------|--------|-----------|
| `src/core/credentials.ts` | **MIGRATE-PUBLIC** (with hardening) | API surface is stable (4 main methods + 3 convenience funcs), tests are reasonable (435 LoC). Public release acceptable AFTER F-2 (AAD), F-10 (cast cleanup) addressed in Sprint 162. |
| `src/core/deck-file.ts` | **MIGRATE-PUBLIC** (with hardening) | API stable, security-critical. Public exposure acceptable AFTER F-5 (symlink) and F-7 (comment fix) addressed. |
| `src/core/global-config.ts` | **MIGRATE-PUBLIC** | Pure utility, only 74 LoC. Public exposure acceptable AFTER F-4 (chmod 0o700) addressed. F-8 (double deepMerge) is a cosmetic preference. |
| `src/core/signature.ts` | **KEEP-PRIVATE** until skill marketplace launches | The marketplace gate (BETA-TRACKER) is not yet open. Once marketplace ships, this file's API is part of the integrator contract and should MIGRATE-PUBLIC alongside `core/marketplace/`. F-3 (chmod-retry), F-11 (sync/async unification), F-12 (global mutation comment) should be cleaned first. |
| `src/core/credential-encryption.ts` (referenced) | **MIGRATE-PUBLIC** (with hardening) | Cited because credentials.ts depends on it; same triage applies. F-2, F-6 priority. |

No DELETE-CANDIDATE files in this set; F-16 confirms all exports are used.
No UNCERTAIN files; the four target files have clear roles and consumer chains.

---

## 5. Recommendations (Sprint 162+)

These are **READ-ONLY recommendations** for future sprints. No code change is requested in Sprint 161.

### Sprint 162 — Security Hardening Pass (priority order)

1. **F-1 (P0): Restore ADR-014 worker isolation.**
   Two-phase approach:
   - **Phase A (quick win):** Move `applyDeckSecretsToEnv` out of `bootstrapProviders` and into a per-task function called by the spawn backends. The Brain-process env stays clean; only worker spawn `env` parameter receives the filtered subset.
   - **Phase B (full ADR conformance):** Per-task scope filter — task `scope.providers` (new field) declares which providers the task may use; spawn backends inject only those keys. Update `.contracts/api-surface.md` to document the field.
   - Add an integration test in `tests/e2e/` that asserts a worker subprocess does NOT see `process.env.OPENAI_API_KEY` when the task is Claude-only.

2. **F-2 (P1): Add AAD to AES-256-GCM.**
   - Bind `provider` (and optionally `storedAt`) as AAD: `cipher.setAAD(Buffer.from(provider, 'utf-8'))`.
   - Migration path: bump `EncryptedPayload` schema with optional `aadVersion: 'v1' | undefined`. Decryption tries AAD first; falls back to no-AAD for legacy entries; a `deckent credential migrate` command rewrites legacy entries.
   - Estimated effort: low — single function pair changes, behavior fully test-covered.

3. **F-3 + F-4 (P1): Symmetric chmod hygiene across crypto modules.**
   - Add `chmodSync(privPath, 0o600)` retry in `signature.ts:loadOrGenerateKeypair`.
   - Add `mode: 0o700` to both `mkdirSync` calls in `global-config.ts:ensureGlobalDir`.
   - Consider extracting a `secureCreateDir(path)` utility into `core/security-utils.ts` so the three call sites (credentials, credential-encryption, signature, global-config) share one implementation.

4. **F-5 (P1): Symlink protection on `.deck`.**
   - Use `fs.lstat()` to detect symlink before reading; either reject or follow only if owner matches process UID.
   - Optional warning in `deckent doctor` output.

5. **F-6 (P1): Strict hex validation on `DECKENT_MASTER_KEY`.**
   - Add regex check `/^[0-9a-fA-F]{64}$/` before `Buffer.from`.
   - Improve error message to distinguish "wrong length" from "non-hex characters".

### Sprint 162-163 — Cleanup & Type Safety

6. **F-7: Fix the misleading `loadDeckSecrets` comment.**
   - After F-1 phase A lands, replace the comment with the new contract.

7. **F-8: Simplify `mergeWithProjectConfig`.**
   - Either resolve the type-cast cleanly (`(globalConfig as DeckentConfig)`) or update `deepMerge` signature to accept `Partial<T>` as base.

8. **F-9, F-10: Type-safety pass.**
   - Replace `as KnownDeckKey` with read-only string array narrow.
   - Add a `validateCredentialEntry(raw): raw is CredentialEntry` shape guard, return null otherwise.

9. **F-11: Unify `signature.ts` keypair API.**
   - Either `loadOrGenerateKeypairAsync` mirroring the async `generateKeypair`, or consolidate into one function with an `async`/`sync` overload via discriminator.

10. **F-12: Document `@noble/ed25519` global mutation.**
    - Move `sha512Sync` wiring to a dedicated `core/crypto-init.ts` with a top-of-file warning.
    - Or use `@noble/ed25519`'s instance API if v2 supports it.

### Sprint 163+ — Documentation

11. **F-13, F-14, F-15: JSDoc cleanup.** Low priority but improves first-time-reader experience for marketplace integrators.

### ADR Amendments to Propose

- **ADR-014 amendment:** Codify the per-task scope filter. Replace the prose claim "Brain injects only necessary keys per task scope" with a normative reference to `task.scope.providers` (after F-1 lands). Otherwise the ADR is aspirational.
- **ADR-035 (Verification Protocol Standard):** Add a channel code for "secret-leak detection" so future audits have a standard handshake when reporting cross-process secret visibility.

### Cross-task coordination

- T-161-009 (marketplace) audits `skill-sandbox.ts` + `registry-client.ts`. F-12 (signature.ts global mutation) intersects — coordinate findings.
- T-161-007 (locks/events) audits `scope-sanitizer.ts`. F-5 (symlink) and the path-traversal regex in `credentials.ts:73` are similar concerns — coordinate findings.
- T-161-001 (config + types) audits `config.ts`. F-8 (deepMerge) is observed there too — primary recommendation should land in T-161-001.
- T-161-038 (providers) audits `provider.ts` directly — F-1 root cause lives there; this audit defers the fix recommendation to that task.

---

## 10-Dimension Coverage Matrix

| Dimension | Findings | Notes |
|-----------|---------:|-------|
| 1. Dead code (unused exports) | 0 | F-16 confirms all exports referenced |
| 2. ADR violations | F-1 | ADR-014 |
| 3. Conflicting / duplicated logic | F-8, F-12 | mergeWithProjectConfig double-merge; global ed25519 mutation |
| 4. Drift (comments vs behavior) | F-7, F-11, F-14, F-15 | "no env injection" claim, sync/async asymmetry, JSDoc gaps |
| 5. Type safety (any, ts-ignore, as unknown as) | F-9, F-10 | unsafe casts |
| 6. Dependency hygiene (.js, circular) | clean | All imports use `.js` per ADR-001/002; no circular deps in target set |
| 7. Documentation pollution | F-13, F-14, F-15 | minor JSDoc gaps |
| 8. Memory V2 coherence | n/a | Target files do not interact with memory store |
| 9. Config integrity | F-4, F-8 | Permissions on `~/.deckent/`; merge ergonomics |
| 10. Migration triage | section 4 | per-file recommendation given |

---

## Worker Notes

- READ-ONLY mandate observed: only `docs/audits/sprint-161/T-161-008-core-credentials-deck.md` written; no source modified.
- `tsc --noEmit` and `vitest run` not run because no source code changes were made (per "Test: N/A" in DIRECTIVES). If gate requires verification, build state is unchanged from sprint baseline.
- Findings F-1, F-2, F-3 are recommended for **CRITICAL** debt-tracker entries should they not be picked up in Sprint 162.
- ADR-039 (self-modifying detector) status: this task modifies only `docs/audits/sprint-161/`; no `src/` changes — clean.
- Cross-cutting: F-1 root cause is in `src/core/provider.ts:applyDeckSecretsToEnv`, which is in T-161-038's scope. This audit cites it as evidence but defers the remediation recommendation to T-161-038's report.
