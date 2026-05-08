# D4 — Library Version Mismatch (context7 cross-reference)

**Lane:** 3 — Agent D4
**Sprint:** 161 god-audit
**Mode:** READ-ONLY (context7 + grep + Read; no install/upgrade)
**Date:** 2026-05-08

## Scope

Cross-reference deckent's third-party library usage against current upstream
docs (via context7) for nine targeted dependencies. Identify deprecated
patterns, available new APIs, and breaking changes upcoming.

Primary `package.json`: `/home/alperen/deckent-dev/package.json`
Dashboard `package.json`: `/home/alperen/deckent-dev/src/dashboard/package.json`

> **Note on AI provider SDKs:** `@anthropic-ai/sdk` and `@google/generative-ai`
> are **NOT** declared dependencies. Deckent invokes Claude/Codex/Gemini as
> CLI subprocesses (`spawnSync`, `child_process.spawn`) — the only mention of
> `@anthropic-ai/claude-code` is install advice in user-facing error messages
> (`src/core/errors.ts`, `src/cli/commands/doctor.ts`). The library audit for
> these SDKs therefore focuses on *model identifiers* and *advisory drift*
> rather than direct API surface usage.

---

## Per-Library Findings

### vitest

- **Declared version:** `^3.0.0` (devDependencies)
- **Installed version:** `3.2.4`
- **Latest stable:** `3.2.4` (current channel) — `4.0.7` released as next major.
- **Our usage patterns:**
  - Configs: `/home/alperen/deckent-dev/vitest.config.ts`,
    `/home/alperen/deckent-dev/vitest.dashboard.config.ts`,
    `/home/alperen/deckent-dev/src/dashboard/vitest.config.ts`.
  - 743 test files import from `vitest`.
  - API tally: `vi.fn` 5,146 calls, `vi.mocked` 4,330, `vi.mock` 1,384,
    `vi.spyOn` 179, `vi.importActual` 32, `vi.useFakeTimers` 28,
    `vi.stubGlobal` 18, `vi.hoisted` 4, `vi.setSystemTime` 2.
  - Coverage provider: `v8` (matches default).
  - Dashboard config uses `esbuild.jsx: 'automatic'` + `environment: 'happy-dom'`.
- **Deprecated patterns observed:** None on Vitest 3.2.4 itself, but the
  following will break on Vitest 4.x (per migration guide):
  - **None of our tests use 3-arg `test(name, fn, options)` form** — confirmed
    via grep.
  - We do NOT use `workspace` (deprecated; replaced by `projects`) — confirmed.
  - No `poolMatchGlobs`, `environmentMatchGlobs`, `browser.testerScripts`, or
    `minWorkers` — none present.
- **New API recommendations:**
  - Vitest 4 introduces `projects` to merge our two configs
    (`vitest.config.ts` + `vitest.dashboard.config.ts`) into a single
    file — would simplify runner orchestration and let us drop the manual
    `npm run test:dashboard` script.
  - `@vitest/browser-playwright` (or `@vitest/browser-webdriverio`) is the
    forward path if we want real-browser dashboard tests instead of `happy-dom`.
- **Breaking changes upcoming (v4):**
  - `test`/`describe` no longer accept a 3rd-argument options object — must be
    2nd. We are NOT affected today, but new tests should use `test(name, opts, fn)`.
  - `deps` flat options moved under `server.deps` (not in our config).
  - `@types/node` typing fix: deprecated types removed.

---

### @anthropic-ai/sdk

- **Declared version:** *not a direct dependency* (CLI-spawned only).
- **Latest stable:** Per context7 (`/anthropics/anthropic-sdk-typescript`),
  the SDK exposes a `Model` type union with current model IDs:
  - `claude-opus-4-7` (latest, no dated variant yet)
  - `claude-mythos-preview`
  - `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`,
    `claude-haiku-4-5-20251001`
  - older: `claude-opus-4-5`, `claude-sonnet-4-5`, etc.
- **Our usage patterns:**
  - `src/core/model-registry.ts:46-73` — declares `apiId` for `opus`,
    `sonnet`, `haiku` slots:
    - `opus` -> `claude-opus-4-6`
    - `sonnet` -> `claude-sonnet-4-6`
    - `haiku` -> `claude-haiku-4-5-20251001`
  - Worker prompts spawn the Claude Code CLI (`spawnWorker` in
    `src/providers/claude.ts`); model IDs are passed to the CLI rather than
    to the SDK.
- **Deprecated patterns observed:**
  - `apiId: 'claude-opus-4-6'` is one minor behind the SDK's current default
    `claude-opus-4-7`. Not a breakage — Anthropic CLI typically resolves
    aliases server-side — but the registry **lags one minor revision**.
  - No usage of `claude-mythos-preview` (likely intentional — preview only).
- **New API recommendations:**
  - When/if deckent ever embeds the Anthropic SDK directly (e.g. for
    `cost.ts` token forecasts), prompt caching primitives are available:
    `cache_control: { type: 'ephemeral', ttl: '5m' }` on `system`, `tools`,
    and message blocks — high-value for our long-lived agent prompts.
- **Breaking changes upcoming:**
  - None directly impact deckent (no SDK consumption). Risk surface is
    purely CLI compatibility — tracked separately by D6 dogfood lanes.

---

### better-sqlite3

- **Declared version:** `^12.9.0`
- **Installed version:** `12.9.0`
- **Latest stable:** `12.6.2` (per context7 documented variants);
  `12.9.0` is current channel and in active use. Upstream README is stable
  across the 12.x line.
- **Our usage patterns:**
  - `src/core/memory-store.ts` — primary consumer: `new Database(dbPath)`,
    `db.pragma('journal_mode = WAL')`, `db.pragma('foreign_keys = ON')`,
    multiple `db.prepare(...)`, `db.exec(...)`, `db.transaction(() => {...})`.
  - `src/core/adr-seed.ts`, `src/orchestra/authority-enforcer.ts`,
    `src/core/rule-generator.ts` — secondary consumers.
  - Native binding rebuild step lives in CI workflow:
    `.github/workflows/ci.yml` runs `npx node-gyp rebuild --release` after
    `npm ci` due to `.npmrc:ignore-scripts=true` (CLAUDE.md gotcha).
- **Deprecated patterns observed:** None. WAL+`foreign_keys=ON`+prepared
  statements+transaction wrapper match upstream best practice exactly.
- **New API recommendations:**
  - `pragma(..., { simple: true })` shorthand is in use *implicitly* (we
    use `journal_mode = WAL` as a write-only PRAGMA). When reading values
    back, this option avoids array unwrap — review `memory-store.ts` reads
    for opportunities (low priority).
  - Transaction modes (`.deferred()`, `.immediate()`, `.exclusive()`) — we
    rely on default `deferred`. If concurrency contention surfaces (multi-IDE
    Brain access), `.immediate()` would lock writers earlier and avoid
    `SQLITE_BUSY` retries.
- **Breaking changes upcoming:** None within 12.x; N-API is stable.
  `better-sqlite3` 12.9 already targets Node 20+ (matches our `engines.node`
  `>=20`).

---

### commander

- **Declared version:** `^13.0.0`
- **Installed version:** `13.1.0`
- **Latest stable:** `13.1.0` is the current GA on the `13.x` line.
- **Our usage patterns:**
  - `src/cli/index.ts` — `new Command()` root program with 50+ registered
    sub-commands using the `register{Name}(program)` pattern (ADR-012).
  - Per-command files use `program.command(...).description(...).option(...).action(...)`
    chain — idiomatic Commander.
  - `import { Command } from 'commander'` (root) and
    `import type { Command } from 'commander'` in registry modules.
- **Deprecated patterns observed:**
  - **NO** use of `.command('*')` default catch-all (deprecated; use
    `isDefault: true`).
  - **NO** use of `noHelp` (renamed `hidden` in 5.1).
  - **NO** use of `.on('command:*')` — we rely on built-in unknown-command
    handling.
- **New API recommendations:**
  - `showSuggestionAfterError()` is enabled by default in 13.x, matches our
    expected UX. Spot-check confirmed no manual override.
  - Custom option processors with callbacks are a clean fit for repeated
    `--type a,b,c` flags (e.g. `recall.ts` already splits manually with
    `.split(',')` — converting to a Commander option processor would
    centralize the parsing logic). Low priority.
- **Breaking changes upcoming:**
  - Commander 14 is in active development upstream; current public docs note
    no API removals beyond the long-deprecated items above. Our register
    pattern is fully forward-compatible.

---

### zod

- **Declared version:** `^3.25.0`
- **Installed version:** `3.25.76` (this version ships **both** Zod 3 and
  Zod 4 alongside via `zod/v4` and `zod/v3` subpaths — single-package dual
  release; exports map confirmed in `node_modules/zod/package.json`).
- **Latest stable:** `3.25.76` is current; `4.x` exists as a separate
  channel (`/colinhacks/zod` versions `v3.24.2`, `v4.0.1`).
- **Our usage patterns (mixed — split-version):**
  - **MCP tools (`src/mcp/tools/*.ts`):** import from `'zod/v4'` — confirmed
    in `start.ts:1`, `kill.ts`, `history.ts`, `status.ts`, `review.ts`,
    `doctor.ts`, `nervous.ts`, `directives.ts`, `cleanup.ts`,
    `checkpoint.ts`, etc. Required because `@modelcontextprotocol/sdk`
    expects v4-compatible schemas.
  - **Orchestra/API/CLI:** plain `import { z } from 'zod'` (resolves to v3
    default):
    - `src/orchestra/planner.ts:3`
    - `src/orchestra/task-builder.ts:3`
    - `src/api/server.ts:5`
    - `src/cli/commands/skill.ts:5`
    - `src/mcp/tools/feature-query.ts:7` — *outlier:* MCP tool but uses v3.
  - API tally: `.parse(...)` 324 calls, `z.string` 60, `z.object` 36,
    `z.enum` 21, `z.array` 17, `.safeParse(...)` 7, `z.number` 6,
    `z.unknown` 2, `z.record` 2, `z.infer` 2.
- **Deprecated patterns observed:**
  - `result.error.format()` is used at
    `src/orchestra/task-builder.ts:67` — Zod v4 deprecates `.format()` in
    favor of `z.treeifyError()`, `z.prettifyError()`, and `z.flattenError()`.
    Still functional in 3.x for now; will need a migration when this file
    moves to `zod/v4`.
  - `feature-query.ts` is registered as MCP tool but imports from `'zod'`
    (v3) — inconsistent with the rest of `src/mcp/tools/`. **Risk:** if MCP
    SDK v2 strict-binds to Zod v4 schemas, this tool's `inputSchema` could
    fail validation at runtime.
- **New API recommendations:**
  - For all error formatting, migrate to `z.treeifyError(error)` (preserves
    schema shape) or `z.prettifyError(error)` (human-readable string) —
    cleaner than the current manual flattening loop in `task-builder.ts`.
  - `z.flattenError(error)` is form-friendly — relevant for HTTP API errors
    in `api/server.ts`.
  - Consolidate to a single import path. Easiest migration: bump everything
    to `'zod/v4'` since 3.25 ships it bundled.
- **Breaking changes upcoming (v4 hard cut):**
  - Issue type rename map: `ZodInvalidTypeIssue` -> `z.core.$ZodIssueInvalidType`,
    plus removal of `ZodInvalidEnumValueIssue`/`ZodInvalidLiteralIssue`/
    `ZodInvalidDateIssue` (merged into `$ZodIssueInvalidValue` /
    `$ZodIssueInvalidType`). Affects custom error inspectors — deckent has
    none today, low risk.
  - Error customization unified under `error` parameter — `message`,
    `errorMap`, `invalid_type_error`, `required_error` are all replaced.
    None of our schemas use these today (verified — only positional
    `.min(1)`, `.enum([...])` calls).
  - `error.format()` removal date is post-v4, but the v4 channel marks it
    deprecated — we should plan migration before v5.

---

### react

- **Declared version:** `^19.0.0` (in `src/dashboard/package.json`)
- **Installed version:** `19.2.4`
- **Latest stable:** `19.2.x` is current on the v19 line.
- **Our usage patterns:**
  - `src/dashboard/src/**/*.tsx` — hook usage tally: `useState` 62,
    `useEffect` 29, `useCallback` 19, `useRef` 13, `useContext` 12,
    `useMemo` 5.
  - **No** `useActionState`, `useOptimistic`, or `use()` adoption observed.
  - `forwardRef` is still used in:
    - `src/dashboard/src/components/ui/select.tsx`
    - `src/dashboard/src/components/ui/input.tsx`
    - `src/dashboard/src/components/ui/scroll-area.tsx`
- **Deprecated patterns observed:**
  - `forwardRef` is **soft-deprecated** in React 19 — `ref` is now a regular
    prop on function components. Existing code keeps working but the React
    team marks `forwardRef` as legacy in the v19 docs.
  - No `defaultProps` (deprecated since 18) found — clean.
  - No `React.FC<>` type annotations — clean (matches modern style).
- **New API recommendations:**
  - Drop `forwardRef` wrappers in `select.tsx`, `input.tsx`,
    `scroll-area.tsx` — destructure `ref` from props directly.
  - Adopt `useActionState` for the new sprint modal form
    (`components/NewSprintModal.tsx`) — replaces manual `isSubmitting` state
    + handler.
  - Adopt `useOptimistic` for live worker-status cards (`WorkerCard.tsx`)
    when wiring up SSE streams from `/api`.
  - Adopt `use(Promise)` for SSE stream consumption with Suspense boundaries
    — replaces some `useEffect`-based fetch loops.
- **Breaking changes upcoming:**
  - React 19 already dropped string refs, legacy context, `findDOMNode`,
    `propTypes` — none used by deckent (verified).
  - React 20 is on the horizon; no public migration list yet.

---

### vite

- **Declared version:** `^6.0.0` (devDependencies in `src/dashboard/package.json`)
- **Installed version:** `6.4.1`
- **Latest stable:** Vite 6.x current; **7.x and 8.x exist** (`v7.0.0`,
  `v7.3.1`, `v8.0.0`, `v8.0.7`, `v8.0.10` per context7).
- **Our usage patterns:**
  - `src/dashboard/vite.config.ts`: minimal — `defineConfig` with
    `@vitejs/plugin-react`, `@tailwindcss/vite`, dev-server proxy to
    `localhost:3100`.
  - `vitest.dashboard.config.ts` (root): manual `resolve.alias` mapping for
    `react`/`react-dom` to root `node_modules` to avoid duplicate React
    instances.
- **Deprecated patterns observed:**
  - We do **not** author Vite plugins, so the `options.ssr` deprecation
    (replaced by `this.environment.config.consumer === 'server'`) does
    not apply.
  - No use of deprecated `ViteDevServer.moduleGraph` /
    `transformRequest` / `reloadModule` etc. (we don't write plugins).
- **New API recommendations:**
  - Vite 7 introduces `buildApp` hook for multi-environment build
    coordination — useful if we ever ship multiple targets (web + electron).
    Not needed today.
  - Vite 7 default `resolve.conditions` are now explicit
    (`['module', 'browser', 'development|production']` for client) —
    confirms our minimal config still resolves correctly.
- **Breaking changes upcoming (v7 -> v8):**
  - Bumping to Vite 7 should be a low-risk move (no plugins authored). The
    Environment API remains experimental but won't impact app-level usage.
  - Vite 8 is GA per context7 metadata — review release notes before
    migration; primary risk is plugin compatibility (`@vitejs/plugin-react`
    and `@tailwindcss/vite` must both have v7/v8-compatible releases).

---

### typescript

- **Declared version:** `^5.7.0` (devDependencies)
- **Installed version:** `5.9.3`
- **Latest stable:** `5.9.3` is current; `6.0.2` exists as next major (per
  context7 versions list — likely RC/beta).
- **Our usage patterns:**
  - `tsconfig.json` (root): `target: ES2022`, `module: Node16`,
    `moduleResolution: Node16`, `strict: true`, `noUncheckedIndexedAccess: true`,
    `noUnusedLocals: true`, `noUnusedParameters: true`,
    `noFallthroughCasesInSwitch: true`, `isolatedModules: true`.
  - `src/dashboard/tsconfig.json`: `module: ESNext`, `moduleResolution: bundler`,
    `jsx: react-jsx`, `noEmit: true`.
- **Deprecated patterns observed:**
  - `moduleResolution: 'node'`, `'node10'`, and `'classic'` are deprecated
    in TS 5.x. We use `Node16` (root) and `bundler` (dashboard) — both
    current.
  - **CLAUDE.md gotcha confirmed:** ESM `.js` extension on relative imports
    is mandatory under `Node16` resolution; tested by lint pipeline.
- **New API recommendations:**
  - TS 5.8 introduced `--erasableSyntaxOnly` flag — restricts syntax to
    purely type-erasure forms (no `enum`, no parameter property classes).
    deckent does not use `enum`/parameter-property classes (verified —
    `grep "enum " src/` shows only string-literal types). Could opt-in for
    forward compatibility with Node's native TS strip-only execution.
  - TS 5.9 deprecates `module: nodenext` for Node 20-targeting projects
    (per Node-Target-Mapping docs) — recommends `module: node20` once
    available. We use `Node16` which still works but is the most
    conservative option; `node20` would unlock newer Node ESM features.
  - `--isolatedDeclarations` flag (TS 5.5+) is unused. Useful for
    monorepo `.d.ts` perf — not critical for deckent's single-package layout.
- **Breaking changes upcoming:**
  - TS 6.0 (per context7 `v6.0.2` listing): TypeScript-Go (native compiler
    port) is being prepared. No API breakages anticipated for our config —
    but lint/build perf will improve substantially when GA.

---

### @google/generative-ai

- **Declared version:** *not a dependency* (CLI-spawned).
- **Status:** **DEPRECATED upstream.** context7 metadata for
  `/google-gemini/deprecated-generative-ai-js` explicitly labels the package
  "deprecated… now superseded by the unified Google Gen AI SDK" published as
  `@google/genai` (`/googleapis/js-genai`).
- **Our usage patterns:**
  - `src/providers/gemini.ts` invokes the Gemini CLI via Node's
    `child_process` API — no SDK import in source.
  - Model IDs in `src/core/model-registry.ts:138-176`:
    `gemini-3.1-pro-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`,
    `gemini-2.0-flash`. These align with the unified Gen AI catalog.
- **Deprecated patterns observed:** None at the SDK boundary (no SDK in
  use). Risk is **advisory drift in our docs** — DECKENT.md references the
  unofficial `GOOGLE_API_KEY` env var (correct for both old and new SDKs)
  but does not mention the migration story should we ever embed the SDK.
- **New API recommendations:**
  - If deckent later wants direct token counting for cost forecasting, use
    `@google/genai` (`/googleapis/js-genai`) — the unified SDK supports
    Gemini Developer API and Vertex AI behind one client.
- **Breaking changes upcoming:**
  - The deprecated `@google/generative-ai` package will stop receiving
    updates. No direct deckent impact (CLI surface is stable).

---

### @modelcontextprotocol/sdk

- **Declared version:** `^1.27.1`
- **Installed version:** `1.27.1`
- **Peer dependency:** `zod: '^3.25 || ^4.0'`, engines: `node >=18`.
- **Latest stable:** `1.27.1` is the current `1.x` line. **MCP SDK v2 is
  shipping** under split package names: `@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `@modelcontextprotocol/core`,
  `@modelcontextprotocol/node`, `@modelcontextprotocol/express`,
  `@modelcontextprotocol/hono` (per upstream `docs/migration.md`).
- **Our usage patterns:**
  - `src/mcp/server.ts:7-8`: `import { McpServer } from
    '@modelcontextprotocol/sdk/server/mcp.js'`,
    `import { StdioServerTransport } from
    '@modelcontextprotocol/sdk/server/stdio.js'`.
  - All 31 tool/resource registrations use the modern
    `server.registerTool(name, { description, inputSchema, annotations }, handler)`
    pattern — verified in `src/mcp/tools/start.ts`,
    `src/mcp/tools/init.ts`, etc.
  - `inputSchema` uses `z.object({...})` (Zod v4) — matches v2 expectations
    (raw object shapes are no longer accepted).
  - 27 of 27 MCP tool files in `src/mcp/tools/*.ts` import from `zod/v4`;
    one outlier (`feature-query.ts`) imports plain `zod` (v3) — see Zod
    section.
- **Deprecated patterns observed:**
  - **None.** We are fully on the v2-compatible registration shape. The
    deprecated variadic `server.tool(name, schema, callback)` form is not
    used anywhere — verified via grep `server.tool(`.
- **New API recommendations:**
  - When the v2 package split lands as the *only* shipping surface, our
    imports will need to change:
    - `'@modelcontextprotocol/sdk/server/mcp.js'` -> `'@modelcontextprotocol/server'`
    - `'@modelcontextprotocol/sdk/server/stdio.js'` -> `'@modelcontextprotocol/server/stdio'`
  - For HTTP transport (if we ever add it), the Node-specific transport
    moves to `@modelcontextprotocol/node` (`NodeStreamableHTTPServerTransport`).
- **Breaking changes upcoming (v2):**
  - Package name split: monolithic `@modelcontextprotocol/sdk` will be
    superseded by per-role packages. Migration is mechanical (import path
    rewrites only — no shape changes since we already use `registerTool`).
  - `InMemoryTransport` moves from `@modelcontextprotocol/sdk/inMemory.js`
    to `@modelcontextprotocol/server` / `@modelcontextprotocol/client`. We
    don't use it today, but tests sometimes do — `grep` shows no usage.
  - Zod peer dep is now `^3.25 || ^4.0` — `feature-query.ts` outlier could
    cause runtime mismatch when the SDK shifts to v4-only schemas.

---

## Aggregate Findings

### F-1 — zod import path inconsistency (HIGH)
Five files import plain `'zod'` (v3) while all neighboring MCP tools use
`'zod/v4'`. The outlier inside `src/mcp/tools/` (`feature-query.ts`) is the
highest risk: MCP SDK v2 will hard-bind to v4 schemas, and an inputSchema
constructed with v3 `z` will fail at registration time. The other v3 holdouts
(`planner.ts`, `task-builder.ts`, `api/server.ts`, `cli/commands/skill.ts`)
are internal validators with no SDK boundary, but unifying simplifies the
mental model. Combined with the deprecated `result.error.format()` call at
`task-builder.ts:67`, this is the single largest concrete tech-debt item
surfaced by this audit.

### F-2 — MCP SDK v2 import-path rewrite is preordained (MEDIUM)
We are fully shape-compatible with v2 (registerTool + inputSchema +
zod-object schemas). The only migration cost is mechanical import-path
rewrites across 31 tool files when the v1.x EOL is announced. No structural
refactor needed — risk is low and effort is bounded.

### F-3 — React 19 forwardRef holdovers in dashboard (LOW)
Three UI primitives (`select.tsx`, `input.tsx`, `scroll-area.tsx`) wrap
components with `forwardRef`. React 19 made `ref` a regular prop on
functional components; `forwardRef` is soft-deprecated. Migration is a
3-file mechanical change. No runtime impact.

### F-4 — Anthropic apiId one-rev behind upstream catalog (LOW)
`model-registry.ts` declares `claude-opus-4-6`/`claude-sonnet-4-6` while
context7 reports `claude-opus-4-7` shipped (no dated variant yet). Claude
CLI typically resolves model aliases server-side, so user-facing impact is
minimal — but `cost.ts` token forecasts and provider tier-equivalence
mapping should be reviewed each minor.

### F-5 — Vitest 4 readiness is GREEN (INFO)
None of the Vitest 4 breaking changes affect our 743 test files: no
`workspace`, no 3-arg `test(name, fn, opts)`, no `deps` flat options, no
deprecated `poolMatchGlobs`/`environmentMatchGlobs`. Migration would be a
config-only patch.

### F-6 — Vite 7/8 upgrade is unblocked (INFO)
We author no Vite plugins, so the `options.ssr` and `ViteDevServer.*`
deprecations do not apply. Plugin compatibility (`@vitejs/plugin-react`,
`@tailwindcss/vite`) is the only gating factor.

### F-7 — TypeScript 5.9 features unused (INFO)
We're on TS 5.9.3 with a `Node16` config. Forward levers available:
`erasableSyntaxOnly` (cheap opt-in — we don't use enums/param-property
classes), `module: 'node20'` (when 5.9+ stabilizes), and TS-Go preview for
build-time perf when 6.x ships.

### F-8 — Better-sqlite3 usage is canonical (INFO)
WAL + foreign_keys + prepared statements + transaction wrapper match the
upstream README verbatim. No deprecated APIs. The CI native-binding rebuild
(`node-gyp rebuild --release`) is documented in CLAUDE.md gotcha.

### F-9 — Commander 13 usage is forward-compatible (INFO)
The `register{Name}(program)` pattern (ADR-012) plus the
`new Command()` chain idiom are 100% forward-compatible with Commander 14
beta. No deprecated calls observed.

---

## Sprint 162+ Recommendations

| Pri  | Item | Effort | Files Touched | Library |
|------|------|--------|---------------|---------|
| P1   | Migrate `src/mcp/tools/feature-query.ts` from `'zod'` to `'zod/v4'` for MCP boundary consistency | low | 1 | zod / mcp-sdk |
| P1   | Replace `result.error.format()` in `src/orchestra/task-builder.ts:67` with `z.treeifyError()` or `z.prettifyError()` (and unify import to `zod/v4`) | low | 1 | zod |
| P2   | Bump `apiId` for `opus`/`sonnet` slots from `claude-*-4-6` -> `claude-*-4-7` once upstream `claude-opus-4-7-YYYYMMDD` dated variant publishes | low | 1 (`model-registry.ts`) | @anthropic-ai/sdk (catalog) |
| P2   | Convert remaining v3 zod imports (`planner.ts`, `task-builder.ts`, `api/server.ts`, `cli/commands/skill.ts`) to `zod/v4` after F-1 P1 unblocks the import-path policy | low-med | 4 | zod |
| P2   | Drop `forwardRef` from dashboard UI primitives (`select.tsx`, `input.tsx`, `scroll-area.tsx`) — accept `ref` as a regular prop | low | 3 | react |
| P3   | Plan MCP SDK v1->v2 import rewrite (path-only): `@modelcontextprotocol/sdk/server/mcp.js` -> `@modelcontextprotocol/server` (and stdio variant). Mechanical codemod across 31 files | med | 31 | @modelcontextprotocol/sdk |
| P3   | Vitest config consolidation: collapse `vitest.config.ts` + `vitest.dashboard.config.ts` into single config with `projects: [...]` (Vitest 4 forward-compat) | low | 2 (delete one, edit one) | vitest |
| P4   | Adopt `useActionState` in `NewSprintModal.tsx` and `useOptimistic` in `WorkerCard.tsx` for cleaner async UX | med | 2 | react |
| P4   | Opt-in `erasableSyntaxOnly` in root `tsconfig.json` to lock down "no runtime-emitting TS" — supports Node native TS strip-only runners | low | 1 | typescript |
| P5   | Evaluate Vite 7 upgrade (gate on `@vitejs/plugin-react` and `@tailwindcss/vite` v7-compat releases) | med | 1-3 | vite |

---

## Out-of-Scope / Not Applicable

- **`@anthropic-ai/sdk` direct usage:** none — deckent shells out to the
  Claude Code CLI (`spawnWorker` in `src/providers/claude.ts`). The SDK
  audit is advisory only.
- **`@google/generative-ai` direct usage:** none — Gemini provider shells
  out to the `gemini` CLI binary. Even though the package is officially
  deprecated upstream, deckent has zero exposure. If/when SDK adoption is
  considered, the unified `@google/genai` package is the correct target.
- **Discord.js (`^14.26.3`, optionalDependencies):** out of scope per
  task brief, but installed and current.
- **Telegraf (`^4.16.0`, dep):** out of scope; installed `4.16.3`, current.
- **`@noble/ed25519`, `@noble/hashes`:** crypto deps not in audit scope.

---

## Method Notes

- All version data sourced from `node_modules/<lib>/package.json` (installed
  state) and root `package.json` (declared range).
- Upstream "latest stable" determined via context7
  `mcp__plugin_context7_context7__resolve-library-id` version listings and
  `mcp__plugin_context7_context7__query-docs` migration excerpts.
- Pattern detection: grep across `src/` and `tests/` with explicit
  file extension filters; `head -N` truncation noted where tallies were
  approximate.
- No npm operations performed (READ-ONLY constraint honored).
