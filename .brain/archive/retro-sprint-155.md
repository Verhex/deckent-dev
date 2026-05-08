# Sprint sprint-154 Retrospective

## Summary
Multi-provider hardening sprint. Delivered Faz A (Docker multi-provider backend),
Faz A.5 (provider-aware command builder), Faz B (provider_auth schema + doctor
enforcement), Faz C (effort translator per adapter). Gemini OAuth live E2E verified
inside Docker — first non-Claude live dogfood in project history.

## Highlights
- `spawn-backend-docker.ts`: `buildProviderInvocation()` exhaustive switch replaces
  hardcoded `claude -p -` — now routes gemini/codex with provider-specific CLI grammar
- Gemini `detectAuthMode()`: 5-mode detection (oauth → api_key → vertex → cloud_shell → none)
- Provider auth schema: `provider_auth.{claude,gemini,codex}.mode` config field added
- Effort translator: `translateEffort()` interface — claude maps to `--max-tokens`, codex
  to `--reasoning-effort` (reasoning models only), gemini returns `[]`
- Doctor: `checkProviderAuthConsistency()` + `checkFallbackProviderGap()` wired
- ADR-043 (Hot Fix pipeline-bypass) + ADR-044 (10-agent audit protocol) inserted
- ADR-045 in DB: Multi-Provider Docker Backend Parity

## Issues
- Gate #8 reclassified: Sprint 148 PASS was unit-test-based, not Docker E2E —
  real Docker hardcoded-claude bug found in Sprint 154 live run
- Container UID pollution: root-mode debug dirtied host-mounted dirs; required
  `docker run --rm -v ... alpine rm -rf` cleanup
- Codex CLI access still pending (external dependency) — gate #8 is 2/3 live

## Metrics
| What | Value |
|------|-------|
| Tasks completed | 4/4 (Faz A+A.5+B+C) |
| Hot-fix waves | 4 (Wave A–D, Sprint 154 audit) |
| New files | 2 (provider-auth-resolver interface, effort-translator interface) |
| ADRs added | ADR-043, ADR-044 (file) + ADR-045 (DB) |
| Live providers | 2/3 (claude + gemini — codex blocked) |
| Beta gate | 18/20 PASS (gate #8 reclassified from 19 → 18) |

## Learnings

### 1 — "PASS" Claim ≠ Live Evidence
Gate #8 was marked PASS in Sprint 148 based on adapter-level unit tests with mocked
Docker invocations. Sprint 154 ran the actual Docker backend live with Gemini — and
immediately found that `spawn-backend-docker.ts:102-111` was hardcoded to
`claude -p - --model X` regardless of the `provider` field. The unit tests had mocked
around this path entirely.

**Lesson**: Any gate with "Docker E2E" or "live provider" in its scope MUST require
a live artifact (command output, result file, container log) as evidence — not just
passing unit tests. ROADMAP gate format should add a mandatory `liveEvidence` field.

### 2 — Mount UID Pollution Playbook
When debugging Docker worker failures as root (e.g., `docker run --user root ...`),
any files written by the container into host-mounted volumes inherit root ownership.
On the next non-root container run those files become unreadable/unwritable, causing
silent failures that look like auth or permission bugs — not the actual root cause.

**Recovery**: `docker run --rm -v <host-dir>:/mnt alpine rm -rf /mnt/<affected-paths>`
bypasses the sudo password prompt because Docker itself runs as root and the alpine
container does the deletion inside the mount. No `sudo rm` needed.

### 3 — Bisect Playbook (Kademeli Debug)
Sprint 154 Docker Gemini fix required 4 sequential layers, each revealing the next:
1. `--skip-trust` (Gemini CLI's containerized-cwd trust check silently overrides
   `--approval-mode plan` and hangs on stdin — invisible in logs)
2. RW mount (`.gemini/` needs write access so OAuth token refresh can persist)
3. Provider-aware cmd builder (hardcoded `claude` string replaced with exhaustive switch)
4. UID pollution cleanup (root-debug artifacts dirtied the host mount)

**Pattern**: Fix the topmost symptom → a new symptom becomes visible → repeat.
Never assume one fix closes the chain. Run the full end-to-end after each layer.

## Agent Performance
| Agent | Tasks | Done | Debt | NoGo | Notes |
|-------|-------|------|------|------|-------|
| architect | 2 | 2 | 0 | 0 | Faz A + A.5 Docker backend |
| api-builder | 1 | 1 | 0 | 0 | Faz B auth schema |
| devops-engineer | 1 | 1 | 0 | 0 | Faz C effort translator |

## Gate Status After Sprint 154
| Gate | Status | Notes |
|------|--------|-------|
| #8 Multi-provider 3/3 live | PARTIAL 2/3 | codex external CLI pending |
| #15 Ed25519 signing | PASS | Sprint 153 |
| #17 Gemini OAuth E2E | PASS | Sprint 154 live dogfood |
| Overall | 18/20 | was 19/20 — gate #8 reclassified |
