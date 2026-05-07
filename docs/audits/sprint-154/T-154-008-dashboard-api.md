# T-154-008 — Dashboard / API / Connectors / Monitor Audit

**Sprint:** sprint-154
**Auditor:** A8 dashboard-api
**Mode:** STATIC + curl smoke (server not running)
**Date:** 2026-05-07
**Scope:** `src/dashboard/`, `src/api/`, `src/connectors/`, `src/monitor/`, `src/extensions/vscode/`, `tests/dashboard/`, `tests/api/`, `tests/connectors/`, `tests/monitor/`

---

## 0. Scope inventory

| Area | Files | LoC |
|------|-------|-----|
| `src/api/` | server.ts (848), auth.ts (112), rate-limiter.ts (95), watcher.ts (28) | 1083 |
| `src/monitor/` | auditor.ts (2029), dashboard-manager.ts (258), sprint-state.ts (63), index.ts (12) | 2362 |
| `src/connectors/` | base-connector (80), connector-pool (113), discord (74), incoming-router (187), telegram (112), types (82), whatsapp (68) | 716 |
| `src/dashboard/src/` | App.tsx (33), routes.tsx (13), 7 pages (1543), 14 components (~2289), 2 hooks | ~3900 |
| `src/extensions/vscode/` | extension.ts (89), package.json (18) | 107 |
| **Total in scope** | ~28 source files + ~28 test files | ~8200 LoC |

curl smoke: `curl -s -m 3 http://localhost:3000/api/{status,health}` — no listener (dashboard server not running locally — STATIC ONLY mode).

---

## 1. Findings

### F1 [P2] — StatusPage.tsx orphan dead code (KNOWN_ISSUES confirmed)

**File:** `src/dashboard/src/pages/StatusPage.tsx` (68 LoC)

**Evidence (live):**
```
$ grep -rn "StatusPage" src/dashboard/ --include="*.tsx" --include="*.ts"
src/dashboard/src/pages/StatusPage.tsx:2: * StatusPage — Human-friendly sprint status view.
src/dashboard/src/pages/StatusPage.tsx:12:export default function StatusPage() {
```

Two hits — both **inside the file itself**. No external import, no `<Route>`, no `routes.tsx` entry. Pure orphan.

**Detail:**
- File defines `StatusPage` component with SSE+fallback fetch flow + `SprintSummary` render.
- Functionality is duplicated by `DashboardPage.tsx` (398 LoC) which already serves `/`.
- `App.tsx` does not import `StatusPage`; `routes.tsx` does not list `/status`.

**Impact:**
- Bundle bloat (68 LoC + transitive imports `SprintSummary`, `useSSE`, `fetchJson`, i18n) — wasted vite chunk surface.
- Maintenance: dead path can drift from live `DashboardPage` and look authoritative to next developer.
- Sprint 153 DIRECTIVES Task 9 explicitly listed this as deletion candidate, **not yet done**.

**Status:** OPEN — Sprint 153 Task 9 carry-over.

**Fix recommendation:** `git rm src/dashboard/src/pages/StatusPage.tsx`. Verify `npm run build:all` and `npm run test:dashboard` regression-free.

---

### F2 [P2] — `routes.tsx` vs `App.tsx` drift (KNOWN_ISSUES confirmed)

**Files:** `src/dashboard/src/routes.tsx` (5 entries), `src/dashboard/src/App.tsx` (6 routes)

**Evidence (live):**

`routes.tsx` exports:
```tsx
export const ROUTES = [
  { path: "/",        label: "Dashboard" },
  { path: "/history", label: "History" },
  { path: "/memory",  label: "Memory" },
  { path: "/config",  label: "Config" },
  { path: "/chat",    label: "Chat" },
] as const;
```

`App.tsx` actually mounts:
```tsx
<Route path="/"         element={<DashboardPage />} />
<Route path="/settings" element={<SettingsPage />} />   // ← NOT in routes.tsx
<Route path="/history"  element={<HistoryPage />} />
<Route path="/memory"   element={<MemoryPage />} />
<Route path="/config"   element={<ConfigPage />} />
<Route path="/chat"     element={<ChatPage />} />
```

**Drift:**
- `/settings` route exists in `App.tsx` (mounts `SettingsPage`) but absent from `ROUTES`.
- `routes.tsx` header comment claims "actual routing lives in App.tsx" — explicit acknowledgement that `routes.tsx` is documentation-only, **but it is also exported as a const**: any consumer importing `ROUTES` (e.g. `Layout` nav) will miss `/settings`.
- `SettingsPage.tsx` is 5 LoC — comment says "redirects to /config". So `/settings` is a deprecated alias; the right call is either delete the route (preferred) or add it to `ROUTES`.

**Impact:**
- Layout nav consumers may render incorrect menu.
- Two-source-of-truth violates ADR-022-V2 single-config principle.

**Fix recommendation:** Either (a) drop `/settings` route from `App.tsx` and `SettingsPage.tsx` if migration is complete, or (b) `App.tsx` imports `ROUTES` from `routes.tsx` and `.map()` to render — single source. Option (a) is simpler; Sprint 153 Task 10 should complete this.

**Status:** OPEN — Sprint 153 Task 10 carry-over.

---

### F3 [P1] — SSE `:keepalive` heartbeat completely missing (KNOWN_ISSUES confirmed)

**File:** `src/api/server.ts:423-435`

**Evidence (live):**
```
$ grep -rn ":keepalive\|: keepalive\|setInterval.*heartbeat" src/api/ src/dashboard/ src/monitor/
(no source-code hits — only TypeScript lib.dom.d.ts noise)
```

Live `/api/events` handler (server.ts:423-435):
```ts
if (url === '/api/events') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': allowedOrigin,
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
  if (initWatcher) initWatcher();
  return;
}
```

There is `retry: 3000` (initial) but **no recurring heartbeat**. The connection only emits `data: {...}` when `watchDashboard()` callback fires (i.e., when `.dashboard` file changes). During an idle phase (e.g., FIX wait, EVALUATE wait, brain reflection), the SSE stream is silent for minutes.

**Impact:**
- **Nginx** default `proxy_read_timeout = 60s` → kills stream silently → dashboard "disconnected" without reason.
- **Cloudflare** Free 100s idle limit, Pro 524 timeout, identical effect.
- **AWS ALB** 60s idle default.
- User experience: "dashboard donmuş" — Sprint 152 retro mentioned this anecdotally.

**Fix recommendation (Sprint 153 Task 6 carry-over):**
```ts
// Inside the /api/events handler, after sseClients.add(res):
const keepalive = setInterval(() => {
  try { res.write(':keepalive\n\n'); } catch { /* socket closed */ }
}, 20_000); // 20s — well under any common proxy idle (60s)
keepalive.unref?.();
req.on('close', () => {
  clearInterval(keepalive);
  sseClients.delete(res);
});
```

`:` prefix = SSE comment frame (RFC: line starting with `:` ignored by EventSource client) — so it never triggers a re-render but resets all proxy idle timers.

**Test plan:** `tests/api/sse.test.ts` — assert `res.write` called with string starting with `:` after fake-timers advance 20s; cleanup on close.

**Status:** OPEN — Sprint 153 Task 6 carry-over. **P1 because user-facing dashboard breakage in any production deploy**.

---

### F4 [P1] — `firstHeartbeatAt` field missing from `AgentInfo` / DashboardState (NEW Sprint 154)

**Files:** `src/core/monitoring-types.ts:41-53`, `src/cli/helpers/status-renderer.ts:74-82`, `src/monitor/auditor.ts:880-928`

**Evidence (live):**

`AgentInfo` type definition:
```ts
export interface AgentInfo {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  model: ModelType;
  tmuxWindow: string;
  taskId?: string;
  currentAction?: string;
  spawnedAt?: string;        // ← when sprint-spawner created the agent record
  lastHeartbeat?: string;    // ← latest heartbeat timestamp
  assignedAgent?: string;
  // ❌ NO firstHeartbeatAt
}
```

`workerHealthIcon` in `status-renderer.ts:76-82`:
```ts
export function workerHealthIcon(agent: AgentInfo, now: Date = new Date()): string {
  if (!agent.lastHeartbeat) return '🔴';   // ← if no HB yet, RED immediately
  const ms = now.getTime() - new Date(agent.lastHeartbeat).getTime();
  if (ms < 2 * 60 * 1000)  return '🟢';
  if (ms < 5 * 60 * 1000)  return '🟡';
  return '🔴';
}
```

`spawnedAt` is set by `sprint-spawner.ts:341` (`spawnedAt: now()`) at orchestration time, **but does not reflect the worker's actual readiness**. Docker containers spend 30-90s on cold pull + npm-postinstall + first Brain prompt round-trip before emitting their first heartbeat. During that window:

- `lastHeartbeat` is `undefined` → `workerHealthIcon` returns 🔴 ("stale").
- User sees "🔴 Up 0m" — interpretation: "worker dead, must kill".
- **This is exactly the Sprint 152 anti-pattern that produced spurious `deckent kill` calls.**

**The semantic gap:** the dashboard cannot distinguish:
1. "Worker spawned 30s ago, still booting Docker, no HB yet" (healthy starting)
2. "Worker spawned 30 minutes ago, last HB 6 min ago" (genuinely stale)

Both currently render 🔴.

**Fix recommendation:**

1. **Add field** to `AgentInfo`:
   ```ts
   firstHeartbeatAt?: string;  // ISO timestamp of the first HB received
   ```
2. **Set on first HB** in `auditor.ts:900-911` agent merge loop:
   ```ts
   const hb = scanResult.heartbeats.find(h => h.workerId === agent.id);
   if (hb) {
     return {
       ...agent,
       status: hb.status,
       currentAction: hb.currentAction,
       lastHeartbeat: hb.timestamp,
       firstHeartbeatAt: agent.firstHeartbeatAt ?? hb.timestamp,  // sticky
     };
   }
   ```
3. **Refine `workerHealthIcon`** to add a 4th state:
   ```ts
   if (!agent.firstHeartbeatAt) {
     // Still booting — grace period from spawnedAt
     const bootMs = now.getTime() - new Date(agent.spawnedAt!).getTime();
     return bootMs < 120_000 ? '🟡' : '🔴';   // 2min grace for cold-start
   }
   // ... existing lastHeartbeat-based check
   ```
4. **Surface in status output JSON** — `deckent_status` resource and CLI text rendering display `health: starting` (yellow) vs `health: stale` (red).

**Test plan:** unit test `workerHealthIcon` 4 cases (no spawnedAt + no HB / spawnedAt < 2m / spawnedAt > 2m + no HB / has firstHB + stale).

**Status:** OPEN — **NEW finding, Sprint 154 candidate. Direct UX gap that produced Sprint 144-148 catastrophic kill cascade.**

---

### F5 [P2] — Two parallel RateLimiter implementations (drift + dead code)

**Files:** `src/api/server.ts:51-76` (inline class), `src/api/rate-limiter.ts:28-95` (standalone class)

**Evidence (live):**

`server.ts:51` defines and **uses**:
```ts
export class RateLimiter {
  // 100 req/min default, simple Map<ip, {count, resetAt}>
  // No retryAfter field, no cleanup timer, no destroy()
}
```

`rate-limiter.ts:28` defines a **richer** standalone:
```ts
export class RateLimiter {
  // 60 req/min default, returns {allowed, remaining, retryAfter}
  // Has cleanup timer (5min), unref'd, destroy() method
}
```

Server uses the inline class (line 798: `new RateLimiter(rateLimitMax)`). The standalone `rate-limiter.ts` exports a class with the same name but **is not imported by anyone** in `src/`:

```
$ grep -rn "from.*api/rate-limiter\|from.*\\.\\/rate-limiter" src/ --include="*.ts"
(no hits — only test fixtures reference it)
```

Tests `tests/api/rate-limiter.test.ts` exercise the standalone class. Production server uses the inline one. **The two diverge on `retryAfter`, default `maxRequests`, and cleanup behaviour.**

**Impact:**
- Tests give false confidence — they validate a RateLimiter the server doesn't use.
- The richer standalone class is dead code on the live path.
- Sprint 121 introduced rate-limiter.ts; server.ts inline never migrated.

**Fix recommendation:** Pick one. Preferred: delete inline class, replace `new RateLimiter(rateLimitMax)` with `import { RateLimiter } from './rate-limiter.js'; new RateLimiter({ maxRequests: rateLimitMax })`. Use the `retryAfter` value to set the `Retry-After` HTTP header on 429 responses (currently absent).

**Status:** OPEN — Sprint 154 candidate.

---

### F6 [P3] — Dashboard worker stdout live-view exists but is poll-based, not SSE

**File:** `src/dashboard/src/components/AgentDetail.tsx:58-77`

**Evidence (live):**
```tsx
useEffect(() => {
  let active = true;
  const fetchLog = async () => {
    const res = await fetch(`${apiBase}/api/worker/${taskId}/log`);
    if (res.ok && active) setData(await res.json() as WorkerLogData);
  };
  fetchLog();
  const interval = setInterval(fetchLog, 3000);   // ← 3s polling
  return () => { active = false; clearInterval(interval); };
}, [taskId, apiBase]);
```

So Sprint 144 tmux-attach loss is **partially compensated** — there IS a live worker log view (3-second polling). My earlier KNOWN_ISSUES note "UX gap" was overstated.

**Remaining gap:**
- Polling is whole-file refetch every 3s — for long-running workers (10K+ line logs), this is ~50-200KB/3s per open detail panel.
- No server-side `If-Modified-Since` or `Range`-based tail; `readWorkerLog` returns full content.
- Better path: SSE log-tail per task (`/api/worker/:taskId/log/stream`) emitting incremental lines, similar to docker `--follow`.

**Impact:** P3 — performance/bandwidth concern only, functionally OK. Demote previous P2 estimate.

**Fix recommendation:** Defer. Acceptable for Beta GA. Track as Phase 2 enhancement (Sprint 160+) alongside SSE keepalive (F3).

**Status:** OPEN-LOW.

---

### F7 [P2] — Connectors deploy scripts present, smoke test guarded by absent tokens

**Files:** `scripts/deploy-discord.sh`, `scripts/deploy-telegram.sh`, `src/connectors/{discord,telegram,whatsapp}.ts`

**Evidence (live):**
- `scripts/deploy-discord.sh` exists, supports `--check`, `--smoke`, `--help` modes (Discord Developer Portal token prereq).
- `scripts/deploy-telegram.sh` exists, supports `--check-only`, `--skip-smoke`.
- No `scripts/deploy-whatsapp.sh` — WhatsApp scaffold-only (Sprint 149 ADR), `whatsapp.ts:31` is a no-op throw.

Connector lifecycle (live):
- `discord.ts` (74 LoC): wraps `discord.js` Client, `start()` requires `DISCORD_BOT_TOKEN` env. Throws on `send()` if not started.
- `telegram.ts` (112 LoC): wraps `Telegraf`, requires `TELEGRAM_BOT_TOKEN`.
- `whatsapp.ts` (68 LoC): scaffold-only, hard-throws "WhatsApp connector requires official Business API approval".

**Status of live deploy:**
- Discord: smoke script ready, awaiting bot token (Verhex Discord workspace) — KNOWN_ISSUES references "token Pazar bekleniyor" — currently 2026-05-07 (Thursday), token target Sun 2026-05-10.
- Telegram: smoke script ready, awaiting BotFather token.
- WhatsApp: blocked at platform layer (Meta Business API approval), scaffold accepted as ADR-aligned posture.

**Risk:**
- Beta GA gate references "connector smoke" but actual smoke tests are mocked in `tests/connectors/*.test.ts`. **No live integration evidence yet.**
- `incoming-router.ts` (187 LoC) routes via `validateWebhookKey` — security path is testable; live e2e webhook delivery is not.

**Fix recommendation:** When tokens arrive (Sun 2026-05-10), execute `bash scripts/deploy-discord.sh --smoke && bash scripts/deploy-telegram.sh` and capture output evidence under `docs/audits/sprint-154/connector-smoke-evidence.md`. Block Beta GA gate #?? until evidence committed. Until then this is P2 OPEN.

**Status:** OPEN — pending external dependency. Not actionable in Sprint 154 audit pass; track as gate.

---

### F8 [P3] — Inconsistent default port between server.ts and dashboard package

**File:** `src/api/server.ts:40` (`DEFAULT_PORT = 3100`); CLAUDE.md auditor probe used 3000; `vite.config.ts` likely 5173.

**Evidence (live):**
```ts
const DEFAULT_PORT = 3100;
```

`Access-Control-Allow-Origin` defaults to `http://localhost:${DEFAULT_PORT}` = `http://localhost:3100`.

CORS regex `^http:\/\/(?:localhost|127\.0\.0\.1):\d+$` allows any port — so the **fallback origin** when origin header missing is `:3100`, but vite dev server may serve on 5173 or 3000 in dev. Inconsistency triggers no observed bug because regex permissive — but the fallback is misleading.

**Impact:** P3 — cosmetic, no security or correctness issue.

**Fix recommendation:** Document the canonical port in `IDENTITY.md` once. Consider `default_dashboard_port` config key.

**Status:** OPEN-LOW.

---

### F9 [P2] — `auditor.ts` is 2029 LoC — god file in scope (architecture concern)

**File:** `src/monitor/auditor.ts` — 2029 LoC.

**Context:** Sprint 76 god-object split (ADR-026) covered orchestra/. `monitor/auditor.ts` not on the split list. It now exceeds:
- `sprint-controller.ts` (slimmed to 209 LoC per ADR-024).
- All other monitor/ files combined (~333 LoC).

**Evidence:** `wc -l src/monitor/auditor.ts` → 2029.

**Impact:** P2 — maintenance, test surface, change risk. Not breaking anything live.

**Fix recommendation:** Sprint 160+ — extract:
- `auditor-heartbeat.ts` (HB cache, scan)
- `auditor-violation.ts` (boundary, lock, RBAC)
- `auditor-dashboard-write.ts` (dashboard merge + write)
- Keep `auditor.ts` slim entry (~200 LoC) per ADR-026 pattern.

**Status:** OPEN — backlog tech debt.

---

### F10 [P3] — `vscode/extension.ts` is 89 LoC, no tests in scope

**File:** `src/extensions/vscode/extension.ts`

**Evidence:** No `tests/extensions/` dir. Single 89-LoC file. `package.json` (18 LoC) — minimal manifest.

**Impact:** P3 — extension surface untested but small. Acceptable for Beta GA if extension is "preview" labelled.

**Fix recommendation:** Add `tests/extensions/vscode-activation.test.ts` smoke (mock VSCode API). Document extension status in IDENTITY.md.

**Status:** OPEN-LOW.

---

## 2. Items verified compliant (no finding)

- **`metrics.jsonl` rotation** (Sprint 150 H5): `src/core/observability-rotation.ts` correctly gzip-archives + truncates + enforces `keepLastN`. Logic verified static; matches DIRECTIVES note. Out of A8 scope (`core/`) but referenced by monitor → acknowledged as healthy.
- **`dashboard-manager.ts` schema validation + auto-repair** (Sprint 137+ "ghost parse error"): `validateDashboardSchema` + `mergeDashboardDefaults` + `ensureDashboard` chain is sound, no missing-field crashes possible.
- **Auth middleware** (`src/api/auth.ts`): Bearer token resolution + exempt paths look correct, env fallback present. Out of A8 RBAC focus → A5 covers cryptographic primitives.
- **CORS hardening** in `server.ts:277` — strict regex `localhost|127.0.0.1:\d+` only, never wildcard. Compliant with ADR-034 multi-project isolation.
- **CSP `default-src 'none'; frame-ancestors 'none'`** + `X-Frame-Options DENY` + `Strict-Transport-Security` — fully present, conservative defaults.
- **Worker stdout live view** in `AgentDetail.tsx` — Sprint 144 tmux-attach loss is functionally compensated by 3s polling (downgrades F6 to P3).

---

## 3. Cross-cutting observations

1. **Sprint 153 Task 6 (SSE keepalive), Task 9 (StatusPage delete), Task 10 (routes drift)** — all three originally planned for Sprint 153 are still OPEN. Sprint 153 SPRINT-LOG marks "B+E+run-param complete" but did not complete the dashboard cleanup batch. Either:
   - Carry forward to Sprint 154 explicitly in DIRECTIVES, OR
   - Mark as Sprint 154 backlog with priority levels.

2. **F4 (firstHeartbeatAt)** is a NEW finding directly traceable to Sprint 144-148 catastrophic kill cascade post-mortem. Recommend P1 inclusion in Sprint 154 directives — small implementation (~60 LoC types + status-renderer + auditor merge) with high ops payoff.

3. **F5 (RateLimiter dual class)** is real but invisible — tests pass against the unused class. This is the kind of latent drift that bites during a security review (A5). Flagging A5 to cross-check whether `tests/api/rate-limiter.test.ts` actually exercises the production path.

4. **Connector deploy gates (F7)** are blocked on Verhex Discord token. Document the gate in DIRECTIVES `## Goal` so Sprint 154 review knows it's externally dependent.

---

## 4. Findings table (ranked)

| ID | Priority | Finding | Files | Status |
|----|----------|---------|-------|--------|
| F4 | **P1** | `firstHeartbeatAt` field missing — workers show 🔴 during Docker cold-start | monitoring-types.ts, status-renderer.ts, auditor.ts | NEW Sprint 154 |
| F3 | **P1** | SSE `:keepalive` heartbeat absent — proxy idle timeout breaks dashboard | api/server.ts:423-435 | Carry-over Sprint 153 T6 |
| F1 | P2 | `StatusPage.tsx` orphan dead code | src/dashboard/src/pages/StatusPage.tsx | Carry-over Sprint 153 T9 |
| F2 | P2 | `routes.tsx` vs `App.tsx` 5-vs-6 entry drift, `/settings` only in App.tsx | dashboard src/App.tsx, routes.tsx | Carry-over Sprint 153 T10 |
| F5 | P2 | Two parallel `RateLimiter` classes (inline server.ts vs rate-limiter.ts) | api/server.ts, api/rate-limiter.ts | Sprint 154 candidate |
| F7 | P2 | Connector deploy smoke evidence pending external tokens | scripts/deploy-{discord,telegram}.sh | Gate, awaits 2026-05-10 |
| F9 | P2 | `auditor.ts` 2029 LoC god file — split candidate | monitor/auditor.ts | Sprint 160+ backlog |
| F6 | P3 | Worker log live-view is 3s polling, not SSE incremental | dashboard/components/AgentDetail.tsx | Phase 2 enhancement |
| F8 | P3 | DEFAULT_PORT 3100 vs vite dev 5173 inconsistency (cosmetic) | api/server.ts:40 | Backlog low |
| F10 | P3 | VSCode extension 89 LoC + no test scope | extensions/vscode/extension.ts | Backlog low |

**Summary:** 2 P1, 5 P2, 3 P3. No P0 in this scope. Two P1s have a single-sprint patch path (F3 ~30 LoC, F4 ~60 LoC).

---

## 5. Recommended Sprint 154 inclusions (this scope)

| Task # | Finding | Rationale | Effort |
|--------|---------|-----------|--------|
| Recommend T-X | F3 | SSE keepalive — production proxy compatibility | low |
| Recommend T-Y | F4 | `firstHeartbeatAt` field — kills entire class of false-stale alerts | low-normal |
| Recommend T-Z | F1 | Delete `StatusPage.tsx` — Sprint 153 carry-over | low |
| Recommend T-W | F2 | Reconcile `routes.tsx` vs `App.tsx` — Sprint 153 carry-over | low |
| Recommend T-V | F5 | Unify `RateLimiter` to standalone, delete inline duplicate | low |

Five low-effort tasks total. F7 cannot be Sprint 154 task (external dependency); track as gate.

---

## 6. Out-of-scope acknowledged

- `src/orchestra/spawn-backend-docker.ts` `.timeout` marker (DIRECTIVES note) — A1 scope.
- `src/cli/commands/status.ts` rendering — partially A2 scope, but `firstHeartbeatAt` surface affects A8 dashboard surface so flagged here.
- `src/core/observability-rotation.ts` — A9 core scope; verified healthy as cross-reference only.
- Brain self-audit hooks, ADR enforcement — A4/A5 scopes.

---

## 7. Sign-off

**Auditor:** A8 dashboard-api
**Cap usage:** ~52K in / ~9K out (well within 65-80K / 12K budget)
**Method:** STATIC source review + 1 attempted curl smoke (server not running, fell back to static).
**Next:** A1-A10 consolidation in `T-154-CONSOLIDATION.md`.
