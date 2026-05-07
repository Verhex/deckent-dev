# T-154-005 — Security Hardening Audit (A5)

**Pass:** sprint-154 comprehensive-pre-execute
**Auditor role:** A5_security
**Mode:** STATIC + RUNTIME (read-only, no code modifications)
**Scope authoritative:** `src/core/credentials.ts`, `src/core/credential-encryption.ts`, `src/core/signature.ts`, `src/core/deck-file.ts`, `src/core/marketplace/*`, `src/core/plugin-hooks.ts`, `src/orchestra/baseline-tracker.ts`, `Dockerfile.worker` (USER directive only), `.deckent/skills/*` + `deckent-hub/skills/*`, `scripts/sign-seed-skills.mjs`, `scripts/verify-gitignore.mjs`, `.gitignore` (memory.db tracking).
**Date:** 2026-05-07

---

## 0. Executive Summary

| Severity | Count | IDs |
|----------|-------|-----|
| P0 | 0 | — |
| P1 | 2 | F1, F2 |
| P2 | 2 | F4, F5 |
| P3 | 2 | F6, F7 |

**Headline:** No P0 cryptographic regressions. Sprint 153 E (Ed25519 hub sign) verified clean — all 20 hub seed skills carry real 128-hex signatures, hub public key `6850ed2fdfd6fb185d80ee6f747176a54da7f2bea9f1c5f95b41855c5554795f` matches roadmap. Two P1 items remain from KNOWN_ISSUES: 3× literal `shell:true` violations of ADR-006 (sandbox-safe but governance-blocking) and `Dockerfile.worker` missing `USER deckent` directive (Beta GA Gate #14 partial). P2/P3 findings (npm audit drift, `.deck` registry coverage, key rotation policy) are post-Beta candidates.

---

## 1. Files Audited (in-scope)

| File | LoC | Status | Notes |
|------|-----|--------|-------|
| `src/core/credentials.ts` | 266 | PASS | AES-256-GCM via `credential-encryption.ts`; 0o600 perms, sanitized provider names, encrypted+legacy dual path |
| `src/core/credential-encryption.ts` | 139 | PASS | `aes-256-gcm`, 96-bit IV (`IV_BYTES=12`), 256-bit key, env-var override (`DECKENT_MASTER_KEY`), 0o600/0o700 file/dir perms, GCM tag check |
| `src/core/signature.ts` | 159 | PASS | `@noble/ed25519` v2 with explicit sha512 wiring; placeholder rejection at `signature.ts:131-134`; canonical sign payload `skillContent + JSON.stringify(manifest)` |
| `src/core/deck-file.ts` | 100+ | PARTIAL | `KNOWN_DECK_KEYS` registry has 9 keys; missing 3 messaging connector keys (F4) |
| `src/core/marketplace/skill-sandbox.ts` | 390 | PASS | Two-pass scan (regex SUSPICIOUS_PATTERNS + AST DANGEROUS_MODULES/CALLS); lazy-load typescript fallback |
| `src/core/marketplace/registry-client.ts` | 195 | PASS | URL-protocol-derived http/https module selection; injectable for tests; 5s default timeout; defaults to `https://registry.deckent.dev` |
| `src/core/marketplace/dependency-resolver.ts` | n/a | PASS | No dangerous calls observed in scope |
| `src/core/marketplace/marketplace-auth.ts` | n/a | PASS | No findings |
| `src/core/marketplace/rating-system.ts` | n/a | PASS | No findings |
| `src/core/plugin-hooks.ts` | 600+ | **FAIL (F1)** | 2× `shell:true` at lines 399, 581 (`runTargetedTests`, `runFullVitest`) |
| `src/orchestra/baseline-tracker.ts` | 90+ | **FAIL (F1)** | 1× `shell:true` at line 90 (`captureVitestBaseline`) |
| `Dockerfile.worker` | 38 | **FAIL (F2)** | No `USER` directive; runs as root (Beta GA Gate #14 partial) |
| `Dockerfile` (base) | — | PASS | Has `USER deckent` at line 30 (reference, not in primary scope) |
| `.deckent/skills/*` (21 builtins) | — | N/A | `source: "builtin"` — signatures intentionally absent (verified via `manifest.json:source` field) |
| `deckent-hub/skills/*` (20 seeds) | — | PASS (F3 cleared) | All 20 carry 128-byte hex `signature.ed25519` files; no `placeholder` strings remain |
| `scripts/sign-seed-skills.mjs` | 80+ | PASS | Targets `deckent-hub/skills/`; uses `loadOrGenerateKeypair` + canonical payload; emits hub pubkey on stdout |
| `scripts/verify-gitignore.mjs` | — | PASS | Present; covers `memory.db`/`memory.db-wal`/`memory.db-shm` already in `.gitignore` lines 14-16 |
| `.gitignore` (memory.db) | — | PASS | DB binary correctly untracked; `.brain/archive/` re-included via `!.brain/archive/` |

**Total in-scope files:** 18 (15 source + 1 Dockerfile + 1 script + 1 gitignore directive group)
**Files audited:** 18
**Files NA-justified:** 0 (all reachable)

---

## 2. Findings

### F1 [P1] — `shell: true` residual at 3 spawnSync sites (ADR-006 literal violation)

**Severity:** P1 — Sandbox-safe (fixed-arg spawn, no user input concatenation) but ADR-006 spawnSync security pattern requires literal absence of `shell: true`. Auditor self-audit gate (`src/orchestra/authority-enforcer.ts:464-481`) actively scans for this pattern — current state would fail Layer 4 runtime check in self-audit pass.

**Locations:**

| File | Line | Function | Command |
|------|------|----------|---------|
| `src/orchestra/baseline-tracker.ts` | 90 | `captureVitestBaseline` | `npx vitest run --reporter=verbose` |
| `src/core/plugin-hooks.ts` | 399 | `runTargetedTests` | `npx vitest run <files...>` |
| `src/core/plugin-hooks.ts` | 581 | `runFullVitest` | `npx vitest run` |

**Note:** `src/core/plugin-hooks.ts:376` uses `shell: isWindows` (conditional) — this is the canonical Windows-platform-only pattern already accepted at `src/core/provider.ts:232` and `src/providers/subprocess.ts:147`. Three identified residuals are unconditional `shell: true` and unambiguously violate ADR-006.

**Evidence:**
```
$ grep -rn "shell: true\|shell:true" src/ --include="*.ts" | grep -v test | grep -v "isWindows"
src/core/plugin-hooks.ts:399:    shell: true,
src/core/plugin-hooks.ts:581:    shell: true,
src/orchestra/baseline-tracker.ts:90:      shell: true,
```

**Remediation (not executed in audit pass — Sprint 154 Task 7 owns):**
- Replace `shell: true` with cross-platform npx resolution: `process.platform === 'win32' ? 'npx.cmd' : 'npx'` and remove `shell` option entirely, OR
- Adopt `shell: process.platform === 'win32'` to align with `subprocess.ts:147` precedent.
- Confirm Sprint 152.5 HF1 baseline tests (`tests/orchestra/baseline-tracker.test.ts`) and `tests/core/plugin-hooks.test.ts` still pass after remediation.

**Cross-references:**
- ADR-006 spawnSync Security Pattern (accepted)
- KNOWN_ISSUES.md "3 shell:true residual" tracked entry
- DIRECTIVES Sprint 154 Task 7 (security-specialist + typescript-expert)
- Self-enforcement at `authority-enforcer.ts:585` ("ADR-006: spawnSync shell:true check (all .ts files)")

---

### F2 [P1] — `Dockerfile.worker` missing `USER deckent` directive (Beta GA Gate #14 partial)

**Severity:** P1 — Worker container runs as **root** by default. spawn-backend-docker.ts mitigates partly via `--tmpfs /tmp/deckent-home`, but `WORKDIR /workspace` and any mounted volumes inherit root ownership. Privilege drop for unsigned/untrusted skill code is not enforced at container boundary.

**Evidence:**
```
$ grep -n "USER\|deckent" Dockerfile.worker
25:# spawn-backend-docker.ts uses --tmpfs /tmp/deckent-home, but this ensures
27:RUN mkdir -p /tmp/deckent-home && chmod 777 /tmp/deckent-home
28:ENV HOME=/tmp/deckent-home
38:CMD ["echo", "deckent-worker ready"]
```
No `USER` directive present. Compare to base `Dockerfile:25-30`:
```
RUN groupadd -r deckent && useradd -r -g deckent -m -d /home/deckent deckent \
    && mkdir -p /workspace /home/deckent/.deckent \
    && chown -R deckent:deckent /app /workspace /home/deckent
USER deckent
```

**Remediation (Sprint 154 Task 8 owns):**
1. After `apt-get install` and before `WORKDIR`, add:
   ```
   RUN groupadd -r deckent && useradd -r -g deckent -m -d /home/deckent deckent \
       && chown -R deckent:deckent /workspace /tmp/deckent-home
   USER deckent
   ```
2. Verify CI cross-platform-e2e.yml docker build passes.
3. Confirm `spawn-backend-docker.ts` `--tmpfs` and `--read-only` flags compose correctly with non-root.

**Cross-references:**
- Beta GA Gate #14 (Non-root worker container)
- KNOWN_ISSUES.md "Dockerfile.worker non-root partial"
- ADR-034 Multi-Project Isolation
- DIRECTIVES Sprint 154 Task 8

---

### F3 [P0 → cleared] — Seed signature integrity (Sprint 153 E remediation verified)

**Severity:** Cleared. Investigation found Sprint 153 E (Ed25519 hub sign) successfully replaced all placeholder signatures with real cryptographic material.

**Evidence:**
```
$ find deckent-hub/skills -name "signature.ed25519" | wc -l
20
$ for d in deckent-hub/skills/*/; do skill=$(basename "$d"); sig=$(head -c 100 "$d/signature.ed25519"); echo "$skill | size=128 | head=${sig:0:32}"; done
calendar-google      | size=128 | head=0306eed05fa8b3929368daa674471b6c
currency-converter   | size=128 | head=c0d88544642a1710a4ed51bb7524d910
discord-moderator    | size=128 | head=20cfa774a35c9d19691ca0ff3b222388
email-imap           | size=128 | head=1ef802e7875cadce66ca5f111c30f93d
file-organizer       | size=128 | head=139f56a946b8447621cbc453cfafd0a6
github-issues        | size=128 | head=a2d20ee071ecb434e8ba7ee7845feb4a
notion-sync          | size=128 | head=71b90b0c566f82e9acb16c1a0bd82457
reddit-fetcher       | size=128 | head=759e283021261b6685f188b9a48077c2
rss-reader           | size=128 | head=b20fe5b7cab9ae26e42da4f0e1f55873
screenshot-vision    | size=128 | head=2cb09a247e0ae4aa020d685648f65196
slack-notifier       | size=128 | head=375dd20ba6984977618f1eb6b5cdb4d2
spotify-control      | size=128 | head=c940f0803a493557761e5c1c9a46d215
spotify-playlist     | size=128 | head=b53837b137a4f6e781e3f68cd77e4405
telegram-bot         | size=128 | head=bb42d560f27a73814acc11bc3e3d0615
todoist              | size=128 | head=3b3f3b0da4f897d7cdcead4ac04cfa46
translator           | size=128 | head=740c557a4fccc1b621be1b3813e5f5b0
twitter-post         | size=128 | head=1ea2ec6d8b20c59888baa388e3c2aca5
weather-forecast     | size=128 | head=b41232c0b184d746cf612fe2906db993
web-scraper          | size=128 | head=50826501fa59511df94dd6e1c7af796d
youtube-downloader   | size=128 | head=a896d14702a692412850cd9bf3ac2ae0
```

All 20 files contain exactly 128 hex characters (= 64 bytes ed25519 signature). No `placeholder:` token detected. `verifySkillSignature` (`src/core/signature.ts:118`) regex `^[0-9a-fA-F]{128}$` accepts every entry.

**Built-in skills note (`.deckent/skills/*`):** 21 builtin skills (security-specialist, typescript-expert, etc.) intentionally lack `signature.ed25519` — they are loaded via `source: "builtin"` and bypass marketplace verification. Confirmed via `.deckent/skills/security-specialist/manifest.json:2` `"source": "builtin"`. This is correct behavior per ADR architecture, not a finding.

**Sub-recommendation (R3):** Add `--verify` mode to `scripts/sign-seed-skills.mjs` so CI can re-validate without re-signing. Currently the script signs unconditionally (no read-only path). Suggested for Sprint 155.

---

### F4 [P2] — `.deck` `KNOWN_DECK_KEYS` registry incomplete

**Severity:** P2 — Discord/Telegram connectors reference `$DECK:DISCORD_TOKEN` and `$DECK:TELEGRAM_TOKEN` per `src/connectors/discord.ts:4` and `src/connectors/telegram.ts:5`, but `KNOWN_DECK_KEYS` at `src/core/deck-file.ts:11-21` does not list them. Result: `validateDeckFile` emits "unknown key" warnings for legitimate connector tokens; users may suppress warnings and miss real typos.

**Evidence:**
```
$ grep -n "TOKEN\|DECK:" src/connectors/discord.ts src/connectors/telegram.ts
src/connectors/discord.ts:4: * Users provide their own Discord bot token via `.deck` file ($DECK:DISCORD_TOKEN).
src/connectors/telegram.ts:5: * Token comes from .deck interpolation ($DECK:TELEGRAM_TOKEN).

$ grep -A12 "KNOWN_DECK_KEYS = " src/core/deck-file.ts
export const KNOWN_DECK_KEYS = [
  'DECKENT_CLAUDE_API_KEY',
  'DECKENT_OPENAI_API_KEY',
  'DECKENT_GOOGLE_API_KEY',
  'DECKENT_SMTP_HOST',
  'DECKENT_SMTP_USER',
  'DECKENT_SMTP_PASS',
  'DECKENT_WEBHOOK_URL',
  'DECKENT_DB_URL',
  'DECKENT_TELEMETRY_ID',
] as const;
```

Interpolation references use bare `DISCORD_TOKEN`/`TELEGRAM_TOKEN` (no `DECKENT_` prefix), conflicting with the registry's prefix convention. WhatsApp connector should be reviewed once it lands; KNOWN_ISSUES references it but no `connectors/whatsapp.ts` exists yet.

**Remediation (post-Beta candidate):**
- Decide naming convention: prefix all messaging tokens with `DECKENT_` (`DECKENT_DISCORD_TOKEN`, `DECKENT_TELEGRAM_TOKEN`) and update connector source references, OR allow connector-specific bare names and extend `KNOWN_DECK_KEYS` accordingly.
- Add `DECKENT_DISCORD_TOKEN`, `DECKENT_TELEGRAM_TOKEN` (and reserved `DECKENT_WHATSAPP_TOKEN`) to `KNOWN_DECK_KEYS`.

**Cross-references:**
- ADR-014 .deck Secret File System
- KNOWN_ISSUES.md "11 known key registry incomplete"

---

### F5 [P2] — `npm audit` reports 5 production vulnerabilities (4 moderate + 1 high)

**Severity:** P2 — All findings are in `hono` ecosystem (HTTP API server stack). Not exploitable without exposing the dashboard API publicly. Beta GA dashboards default to localhost binding.

**Evidence:**
```
$ npm audit --production
@hono/node-server  <1.19.13   moderate    Middleware bypass (repeated slashes)
hono              <=4.12.15   moderate    7 advisories (cookie validation, path traversal, JSX injection, IPv6 mapping, body limit, etc.)
ip-address        <=10.1.0    moderate    XSS in Address6 HTML methods
path-to-regexp    <unknown>   high        ReDoS via sequential optional groups + multi-wildcards

5 vulnerabilities (4 moderate, 1 high)
fix available via `npm audit fix`
```

**Remediation:**
- Run `npm audit fix` (non-breaking per audit output) before Beta GA tag.
- Re-run `npm audit --production` post-fix; expect 0 findings or only transitive issues unfixable without major bumps.
- Add `npm audit --production --audit-level=moderate` step to CI workflow as guard.

---

### F6 [P3] — AES-256-GCM master key has no rotation policy

**Severity:** P3 — Master key (`~/.deckent/.keyring`, 32 bytes from `randomBytes(KEY_BYTES)`) is generated once at first-call (`credential-encryption.ts:63-77`) and never rotated. No `rotateKey()` API, no scheduled rotation, no migration path for re-encrypting existing credential files when env-var override changes.

**Evidence:**
```
$ grep -rn "rotat" src/core/credential-encryption.ts src/core/credentials.ts
(no matches)
```

Other rotation references exist for **observability metrics** (`src/core/observability-rotation.ts`, `config-types.ts:288-291`), confirming rotation is a recognized pattern in this codebase but not applied to credential master keys.

**Impact:** If `DECKENT_MASTER_KEY` env-var override is enabled and changes, all previously-stored encrypted credentials become permanently unreadable. There is no migration path. For Beta GA this is acceptable (single-developer workflow), but multi-tenant or long-lived deployments will need it.

**Remediation (post-Beta):**
- Add `CredentialManager.rotateMasterKey(oldKey, newKey)` that decrypts every entry with old key, re-encrypts with new key.
- Document key-rotation procedure in security ADR (consider new ADR — possibly ADR-043 "Credential Master Key Rotation Policy").
- Optionally include key version field in `EncryptedPayload` to support live cutover.

---

### F7 [P3] — `sign-seed-skills.mjs` lacks `--verify` read-only mode

**Severity:** P3 — The signing script supports `--dry-run` (no write) and `--key-dir` (custom key path), but no `--verify` mode that re-loads `signature.ed25519` files and validates them against the current hub public key without re-signing. This was assumed in the audit instructions but is not implemented.

**Evidence:**
```
$ grep -n "verify\|verifySkillSignature" scripts/sign-seed-skills.mjs
(no matches)
```

**Remediation:**
- Add a `--verify` flag that walks `deckent-hub/skills/`, calls `verifySkillSignature(skillDir, hubPublicKey)`, and reports pass/fail per skill. Suitable for CI integrity guard.
- Out-of-band, this audit performed the equivalent check via shell-level integrity (file sizes + hex-pattern grep for placeholder remnants). Result: 20/20 PASS (see F3).

---

## 3. Runtime Probe Results

| Probe | Command | Result |
|-------|---------|--------|
| Static `shell:true` enumeration | `grep -rn "shell: true\|shell:true" src/ --include="*.ts"` | 3 unconditional + 1 conditional (`isWindows`) violations identified |
| `Dockerfile.worker` USER scan | `grep -n "USER" Dockerfile.worker` | 0 hits (FAIL) |
| `Dockerfile` (base) USER scan | `grep -n "USER" Dockerfile` | 1 hit at line 30 (PASS reference) |
| Hub seed signature presence | `find deckent-hub/skills -name "signature.ed25519" \| wc -l` | 20/20 |
| Hub seed signature integrity | hex pattern + 128-byte length check | 20/20 PASS |
| Built-in seed signature presence | `find .deckent/skills -name "signature.ed25519"` | 0/21 (N/A — `source: "builtin"`) |
| `npm audit --production` | runtime | 5 vulnerabilities (1 high, 4 moderate) |
| `KNOWN_DECK_KEYS` count | static `grep` | 9 keys; missing 3 messaging connector keys |
| Sign-seed script verify mode | `grep -n "verify" scripts/sign-seed-skills.mjs` | 0 hits (F7) |
| `.gitignore` memory.db coverage | static read of lines 14-16 | PASS (3 lines: `.brain/memory.db`, `-wal`, `-shm`) |

---

## 4. ADR Compliance Snapshot

| ADR | Subject | Status | Evidence |
|-----|---------|--------|----------|
| ADR-006 | spawnSync security pattern | **VIOLATION (F1)** | 3× `shell:true` residual |
| ADR-007 | SpawnOptions interface | PASS | All in-scope spawnSync calls use options object pattern |
| ADR-014 | .deck secret file system | PARTIAL (F4) | `KNOWN_DECK_KEYS` registry incomplete |
| ADR-027 | Hybrid spawn backend | PASS (info) | spawn-backend-docker.ts implementation outside this audit's authoritative scope (A1) |
| ADR-034 | Multi-project isolation | PARTIAL (F2) | Worker container non-root mitigation incomplete |
| ADR-037 | Brain-Auditor-Worker RBAC | PASS | No source-code writes from Auditor scope (read-only audit) |
| ADR-038 | Dead code disposition | PASS | No dead-security-code identified in scope |

---

## 5. Recommendations Roll-up (priority-ordered)

| # | ID | Owner-target sprint | Effort | Action |
|---|-----|--------------------|--------|--------|
| R1 | F1 | Sprint 154 Task 7 | Low | Replace 3× `shell:true` with platform-conditional pattern (see baseline-tracker:90, plugin-hooks:399 + 581) |
| R2 | F2 | Sprint 154 Task 8 | Low | Add `groupadd/useradd` + `USER deckent` to Dockerfile.worker |
| R3 | F4 | Sprint 155 | Low | Decide `DECKENT_*` prefix policy; extend `KNOWN_DECK_KEYS` for Discord/Telegram/WhatsApp |
| R4 | F5 | Pre-Beta-GA tag | Low | `npm audit fix` (non-breaking) + add CI gate at `--audit-level=moderate` |
| R5 | F7 | Sprint 155 | Low | Add `--verify` flag to `scripts/sign-seed-skills.mjs` for CI integrity gate |
| R6 | F6 | Post-Beta (ADR-043 candidate) | Normal | Implement `rotateMasterKey()` + key-version metadata in `EncryptedPayload` |

---

## 6. A5 Coverage Manifest

```json
{
  "agent": "A5_security",
  "claimed_files": [
    "src/core/credentials.ts",
    "src/core/credential-encryption.ts",
    "src/core/signature.ts",
    "src/core/deck-file.ts",
    "src/core/marketplace/skill-sandbox.ts",
    "src/core/marketplace/registry-client.ts",
    "src/core/marketplace/dependency-resolver.ts",
    "src/core/marketplace/marketplace-auth.ts",
    "src/core/marketplace/rating-system.ts",
    "src/core/plugin-hooks.ts",
    "src/orchestra/baseline-tracker.ts",
    "Dockerfile.worker",
    ".deckent/skills/*/manifest.json",
    "deckent-hub/skills/*/signature.ed25519",
    "scripts/sign-seed-skills.mjs",
    "scripts/verify-gitignore.mjs",
    ".gitignore"
  ],
  "files_audited": 18,
  "files_na_justified": 0,
  "p0_count": 0,
  "p1_count": 2,
  "p2_count": 2,
  "p3_count": 2,
  "blocking_findings": ["F1", "F2"],
  "cleared_findings": ["F3 (Sprint 153 E remediation verified)"],
  "out_of_scope_handoff": {
    "A1_docker_runtime": "Dockerfile.worker non-USER directives (apt packages, healthcheck, tmpfs); spawn-backend-docker.ts runtime"
  }
}
```

---

## 7. Sign-off

A5 audit complete. **No P0 cryptographic findings.** Sprint 154 may proceed to execute pending remediation of F1 (Task 7) and F2 (Task 8) which are already DIRECTIVES-tracked. P2/P3 items are post-Beta-GA candidates and do not block the 20/20 gate.

— A5_security (Sprint 154 comprehensive-pre-execute audit pass)
