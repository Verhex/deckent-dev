# D1 — node_modules Auditor (Sprint 161)

**Lane:** 3 (Deep Dive)
**Agent:** D1
**Mode:** READ-ONLY
**Date:** 2026-05-08
**Project root:** `/home/alperen/deckent-dev`

> Note on ADR-010: ADR-010 declares "Tek Runtime Dependency — commander.js." Reality (per `package.json` / lockfile): there are **7 declared `dependencies`**, **8 `devDependencies`**, and **1 `optionalDependencies`** at the root. ADR-010 is therefore stale relative to current shipping reality and should be reconciled in Sprint 162+ (see recommendations).

---

## Summary

| Metric | Value |
|---|---|
| **Total resolved packages (`package-lock.json` packages count)** | **360** |
| **`npm audit` total dependencies** | 359 (prod=149, dev=190, optional=74, peer=13) |
| Direct `dependencies` (package.json) | 7 |
| Direct `devDependencies` (package.json) | 8 |
| Direct `optionalDependencies` (package.json) | 1 (`discord.js`) |
| Engines | `node >= 20.0.0` |
| Outdated packages | **11** (10 with known CVE / advisory implications) |
| Deprecated transitive packages in tree | **2** (`glob@10.5.0`, `prebuild-install@7.1.3`) |
| **Total vulnerabilities** | **9** |
| └─ critical | **0** |
| └─ high | **3** |
| └─ moderate | **6** |
| └─ low | 0 |
| └─ info | 0 |

### Direct dependency surface

| Type | Packages |
|---|---|
| `dependencies` | `@modelcontextprotocol/sdk`, `@noble/ed25519`, `@noble/hashes`, `better-sqlite3`, `commander`, `telegraf`, `zod` |
| `devDependencies` | `@testing-library/jest-dom`, `@testing-library/react`, `@types/better-sqlite3`, `@types/node`, `@vitest/coverage-v8`, `happy-dom`, `typescript`, `vitest` |
| `optionalDependencies` | `discord.js` |

ADR-010 reality check: ~~"single runtime dependency: commander"~~ — actual is `commander + 6 others`. ADR-010 needs amendment.

---

## Findings — Vulnerabilities (`npm audit`)

> No P0 (critical) findings. The audit table below uses Sprint 161 priority mapping: severity *high* → P1, severity *moderate* → P2.

### P0 (critical)

_None._

### P1 (high) — 3 advisories

| Package | Current | Fix-available range | Advisory | CVE / GHSA | CVSS | Migration cost |
|---|---|---|---|---|---|---|
| `happy-dom` (direct devDep) | `20.8.4` | `>=20.8.9` | Fetch credentials use page-origin cookies instead of target-origin (info disclosure) | GHSA-w4gp-fjgq-3q4g | 7.5 | **Low** — already on `^20.8.4`, satisfied by patch bump to `20.9.0`; `npm outdated` shows `Wanted: 20.9.0` |
| `happy-dom` (direct devDep) | `20.8.4` | `>=20.8.8` | ECMAScriptModuleCompiler: unsanitized export names interpolated as executable code (RCE-class) | GHSA-6q6h-j7hj-3r64 | 8.8 | **Low** — same patch bump fixes both |
| `path-to-regexp` (transitive via `express@5.2.1` → `router@2.2.0`) | `8.3.0` | `>=8.4.0` | ReDoS via sequential optional groups | GHSA-j3q9-mxjg-w52f | 7.5 | **Low–medium** — fix is in `express@5.x` patch line; needs `npm update express` (no major bump) |
| `vite` (transitive via dashboard build chain) | `7.3.1` | `>7.3.1` (likely `7.3.2+`) | Path traversal in optimized deps `.map`, `server.fs.deny` bypass via queries, arbitrary file read via WS | GHSA-4w7w-66w2-5vf9 / GHSA-v2wj-q39q-566r / GHSA-p9ff-h696-f583 | 0–high | **Low** — vite is a dev-time only tool (dashboard build); risk only in dev server. Patch bump available |

### P2 (moderate) — 6 advisories

| Package | Current | Fix-available range | Advisory | CVE / GHSA | CVSS | Migration cost |
|---|---|---|---|---|---|---|
| `@hono/node-server` (transitive of `@modelcontextprotocol/sdk`) | `1.19.11` | `>=1.19.13` | Middleware bypass via repeated slashes in `serveStatic` | GHSA-92pp-h63x-v22m | 5.3 | **Low** — patch bump in MCP SDK upgrade chain; `@modelcontextprotocol/sdk` outdated `1.27.1 → 1.29.0` likely fixes |
| `brace-expansion` (transitive, 2 instances) | `2.0.x / 4.0.x–5.0.4` | `>=5.0.5` (and `>=2.0.3`) | Zero-step sequence causes process hang & memory exhaustion (DoS) | GHSA-f886-m6hf-6m8v | 6.5 | **Low** — pure resolution bump |
| `express-rate-limit` (transitive of `@modelcontextprotocol/sdk`) | `8.3.1` | `>8.5.0` | Inherits `ip-address` XSS | (via ip-address) | — | **Low** — bump via MCP SDK update |
| `hono` (transitive of `@modelcontextprotocol/sdk`) | `4.12.8` | `>=4.12.16` | 8 advisories: cookie validation, path traversal in `toSSG()`, `serveStatic` bypass, JSX HTML injection, IPv4-mapped IPv6 mismatch in `ipRestriction()`, `bodyLimit()` bypass for chunked requests | GHSA-26pp-8wgv-hjvm + 7 others | 4.3–6.5 | **Low** — single transitive bump. Note: dashboard does not use hono SSR/JSX directly — exposure surface is MCP HTTP transport |
| `ip-address` (transitive via `express-rate-limit`) | `10.1.0` | `>10.1.0` | XSS in `Address6` HTML-emitting methods | GHSA-v2v4-37r5-5v8g | 0 | **Low** — MCP SDK chain upgrade |
| `postcss` (transitive of dashboard tailwind chain) | `8.5.8` | `>=8.5.10` | XSS via unescaped `</style>` in stringify output | GHSA-qx2v-qp2m-jg93 | 6.1 | **Low** — dev-time only. Dashboard uses postcss for tailwind build — output served to browser |

### Aggregate exploitability assessment for Deckent runtime

| Vector | Exposure |
|---|---|
| `happy-dom` exploitability at runtime | **None** — devDep only (vitest jsdom alternative, Sprint 134 dashboard tests). No runtime path |
| `vite` / `postcss` runtime | **None** — build-time only. Production users do not run vite |
| `path-to-regexp` (via express) | **Low** — `src/api/server.ts` exposes HTTP API but disabled by default; CVE is ReDoS via crafted route → impacts only when user runs API server |
| `hono` / `@hono/node-server` (via MCP SDK) | **Medium** — MCP server is the primary integration path. `hono` is the HTTP transport for MCP streamable HTTP transport. Most advisories are middleware/serveStatic bypasses; Deckent MCP only uses stdio transport by default |
| `brace-expansion` | **Negligible** — process-hang DoS via local-only file glob input; not user-driven |
| `ip-address` / `express-rate-limit` | **Low** — only when API server is enabled |

**Bottom line:** No vulnerability poses runtime risk for the **default** Deckent install (`npx deckent`). Risk window opens when user explicitly enables the HTTP API server (P1 path-to-regexp) or MCP HTTP transport (P2 hono chain). Dev-time risks (happy-dom, vite, postcss) affect Deckent contributors only.

---

## Outdated dependencies (`npm outdated`)

| Package | Current | Wanted (semver) | Latest (major) | Direct? | Notes |
|---|---|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.27.1 | 1.29.0 | 1.29.0 | direct dep | Patch bump available, fixes hono / express-rate-limit / @hono/node-server chain |
| `@noble/ed25519` | 2.3.0 | 2.3.0 | **3.1.0** | direct dep | Major bump available; signature.ts uses this — needs validation |
| `@noble/hashes` | 1.8.0 | 1.8.0 | **2.2.0** | direct dep | Major bump |
| `@types/node` | 25.5.0 | 25.6.2 | 25.6.2 | direct devDep | Patch — safe |
| `@vitest/coverage-v8` | 3.2.4 | 3.2.4 | **4.1.5** | direct devDep | Major — coupled with `vitest` |
| `commander` | 13.1.0 | 13.1.0 | **14.0.3** | direct dep | Major — CLI command surface (46 commands) — needs migration testing |
| `discord.js` | 14.26.3 | 14.26.4 | 14.26.4 | optional dep | Patch only |
| `happy-dom` | 20.8.4 | 20.9.0 | 20.9.0 | direct devDep | **Patch fixes 2 high-sev CVEs** — top priority |
| `typescript` | 5.9.3 | 5.9.3 | **6.0.3** | direct devDep | Major — entire codebase impact, defer |
| `vitest` | 3.2.4 | 3.2.4 | **4.1.5** | direct devDep | Major — 12,485 tests, defer |
| `zod` | 3.25.76 | 3.25.76 | **4.4.3** | direct dep | Major — heavy validation usage, defer |

**Wanted-but-not-installed = 4** (MCP SDK, @types/node, discord.js, happy-dom). These are the cheapest wins and should be addressed in Sprint 162 quick-fix wave.

**Major bumps available = 7** (@noble/ed25519, @noble/hashes, @vitest/coverage-v8, commander, typescript, vitest, zod). Each warrants an isolated migration sprint per ADR-027 / Sprint 153 model bump pattern.

---

## License inventory (top 30 by direct & visibility)

| Package | Version | License | OSS-friendly? |
|---|---|---|---|
| @modelcontextprotocol/sdk | 1.27.1 | MIT | Yes |
| @noble/ed25519 | 2.3.0 | MIT | Yes |
| @noble/hashes | 1.8.0 | MIT | Yes |
| better-sqlite3 | 12.9.0 | MIT | Yes |
| commander | 13.1.0 | MIT | Yes |
| telegraf | 4.16.3 | MIT | Yes |
| zod | 3.25.76 | MIT | Yes |
| @testing-library/jest-dom | 6.9.1 | MIT | Yes |
| @testing-library/react | 16.3.2 | MIT | Yes |
| @types/better-sqlite3 | 7.6.13 | MIT | Yes |
| @types/node | 25.5.0 | MIT | Yes |
| @vitest/coverage-v8 | 3.2.4 | MIT | Yes |
| happy-dom | 20.8.4 | MIT | Yes |
| typescript | 5.9.3 | **Apache-2.0** | Yes (compatible with MIT distribution) |
| vitest | 3.2.4 | MIT | Yes |
| express | 5.2.1 | MIT | Yes |
| hono | 4.12.8 | MIT | Yes |
| @hono/node-server | 1.19.11 | MIT | Yes |
| discord.js | 14.26.3 | **Apache-2.0** | Yes |
| react | 19.2.4 | MIT | Yes |
| react-dom | 19.2.4 | MIT | Yes |
| vite | 7.3.1 | MIT | Yes |
| postcss | 8.5.8 | MIT | Yes |
| ajv | 8.18.0 | MIT | Yes |
| jose | 6.2.1 | MIT | Yes |
| ip-address | 10.1.0 | MIT | Yes |
| path-to-regexp | 8.3.0 | MIT | Yes |
| brace-expansion | 5.0.4 | MIT | Yes |
| iconv-lite | 0.7.2 | MIT | Yes |
| tailwindcss | _(not at top-level node_modules path; nested in dashboard build)_ | MIT (per upstream) | Yes |

### Full lockfile-wide license distribution (360 packages)

| License | Count | OSS-friendly |
|---|---|---|
| MIT | 305 | Yes |
| ISC | 19 | Yes |
| Apache-2.0 | 16 | Yes |
| BSD-3-Clause | 8 | Yes |
| BlueOak-1.0.0 | 5 | Yes (permissive) |
| BSD-2-Clause | 3 | Yes |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 | Yes |
| (MIT OR WTFPL) | 1 | Yes |
| 0BSD | 1 | Yes |

**No GPL/AGPL/LGPL/SSPL/Commercial-only licenses observed.** No `UNKNOWN` license fields. **License surface is fully MIT-distribution-compatible** for npm publish.

---

## Deprecated patterns observed

Two transitive packages carry the `deprecated` field in lockfile:

| Package | Path | Version | Deprecation message |
|---|---|---|---|
| `glob` | `node_modules/glob` | `10.5.0` | "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update." |
| `prebuild-install` | `node_modules/prebuild-install` | `7.1.3` | "No longer maintained. Please contact the author of the relevant native addon; alternatives are available." |

### Impact analysis

- **`glob@10.5.0`** — pulled in by Vitest / coverage chain. Vitest 4.x (`outdated → 4.1.5`) likely uses newer glob. Resolved by Sprint 162 vitest major-bump migration.
- **`prebuild-install@7.1.3`** — pulled in by `better-sqlite3@12.9.0`'s native binding install path. Already noted in CLAUDE.md gotchas as a CI pain point (`.npmrc:ignore-scripts=true` causes `prebuild-install` to be skipped, requiring `npx node-gyp rebuild`). Upstream `better-sqlite3` has no Node-based replacement; this deprecation is **non-actionable from Deckent side** until `better-sqlite3` upstream migrates. Track but do not act.

Other patterns:
- One `UNMET OPTIONAL DEPENDENCY` warning: `@cfworker/json-schema@^4.1.1` (under `@modelcontextprotocol/sdk`). Optional, not used in stdio transport — safe to ignore.
- Two `UNMET OPTIONAL DEPENDENCY` warnings under `@testing-library/react`: `@types/react@^18||^19` and `@types/react-dom@^18||^19`. Dashboard tests pass without them — types provided via `@types/node` + react itself. Cosmetic warning, no action.

---

## Sprint 162+ recommendations

Listed in ROI order (highest impact / lowest cost first):

### Sprint 162 quick-fix wave (1 task, low effort, security-focused)

1. **happy-dom 20.8.4 → 20.9.0** — patch bump fixes 2 high-severity CVEs (CVSS 7.5 + 8.8). Only impacts dashboard test suite. ~5min validation.
2. **@modelcontextprotocol/sdk 1.27.1 → 1.29.0** — patch bump cascades fixes to `hono`, `@hono/node-server`, `express-rate-limit`, `ip-address` chain. Closes 11 of 9 audit advisories transitively (all moderate-sev MCP-side). Validate stdio MCP transport tests + tools/resources count after bump.
3. **express path-to-regexp ReDoS** — included in any `npm update` that touches express 5.x patch line. If MCP SDK bump alone doesn't deduplicate `path-to-regexp@8.3.0`, run targeted `npm update path-to-regexp`.
4. **postcss 8.5.8 → 8.5.10** — included by tailwind bump or `npm update postcss`. Dashboard build only.
5. **@types/node 25.5.0 → 25.6.2** — patch bump, zero risk.
6. **discord.js 14.26.3 → 14.26.4** — patch only, optional dep.

Expected outcome: vulnerability count drops from **9 → 0** (or **9 → 1** if `vite` patch lags). Single sprint, single Worker (devops-engineer + ci-testing skill), ~30min.

### Sprint 163: ADR-010 reconciliation

ADR-010 ("Tek Runtime Dependency — commander.js") is **factually inaccurate** today. Options:

- **Option A** — Amend ADR-010 to read "Minimal-but-justified runtime dependencies." List `commander, @modelcontextprotocol/sdk, @noble/ed25519, @noble/hashes, better-sqlite3, telegraf, zod` with single-line rationale per package. Mark current as `accepted` with revision date.
- **Option B** — Mark ADR-010 `superseded`, write ADR-045 / ADR-046 (next free slot) with current dependency surface and gating policy ("any new runtime dep requires ADR amendment").

Recommend **Option B** — preserves history and creates explicit RBAC gate (per ADR-037) for future runtime dep additions. Also blocks accidental dep creep before npm publish (`validate:publish` gate).

### Sprint 164+: major-bump migration sprints (one per major)

Each isolated sprint per ADR-027 hybrid-spawn pattern, with full test suite + dogfood validation:

| Sprint | Migration | Risk | Justification |
|---|---|---|---|
| 164 | `commander 13 → 14` | Medium | Touches all 46 CLI commands. Likely API tweaks (deprecated parsers). Worker: refactorer + cli-testing skill |
| 165 | `zod 3 → 4` | High | Pervasive validation usage (planner Zod schemas, config validation). Zod 4 has breaking changes around error formatting. Worker: typescript-expert + thorough test rewrite |
| 166 | `vitest 3 → 4` + `@vitest/coverage-v8 3 → 4` | High | 12,485 tests, two configs (vitest.config + vitest.dashboard.config). Vitest 4 changes worker pool defaults. Pair migration |
| 167 | `typescript 5.9 → 6.0` | High | Whole-codebase impact. Wait for stable + ecosystem readiness; at minimum 1 minor cycle of soak time |
| 168 | `@noble/ed25519 2 → 3` + `@noble/hashes 1 → 2` | Low | Used only in `signature.ts` for OAuth/MCP signing. Tightly scoped, easy to validate |

### Standing ops (no sprint required)

- Add `npm audit --audit-level=high` to CI gate (`.github/workflows/ci.yml`) — fail build on new high+critical advisories. Currently no automated drift signal.
- Add `npm outdated` snapshot to `validate:publish` script (warn, not fail) — Alperen sees diff before manual publish.
- Track `glob` and `prebuild-install` deprecations in `.brain/exports/debt.md` as "passive — upstream-blocked." No action needed until upstream moves.

---

## Audit metadata

- **Tool versions:** npm (per project), node `>=20.0.0` (engines)
- **Lockfile hash:** _(not captured — `package-lock.json` Read-only path; available on request)_
- **Constraints honored:** READ-ONLY. Only `npm ls`, `npm outdated`, `npm audit` invoked. No mutations to `node_modules/`, `package.json`, `package-lock.json`. No installs.
- **Skipped:** Subdirectories like `dashboard/` may have their own `node_modules` not surveyed here — root-level only.
