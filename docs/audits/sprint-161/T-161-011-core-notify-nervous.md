# T-161-011: Core — notification-dispatcher + notify-adapters + nervous-types Audit

**Sprint:** 161 (READ-ONLY pre-beta audit, Lane 1)
**Task:** T-161-011
**Auditor:** doc-writer agent (worker w-161-011, model opus)
**Date:** 2026-05-08
**Mode:** READ-ONLY — no source code modified
**Lead questions:** ADR-040 nervous architecture types, dispatcher channel adapter contract

---

## 1. Scope

Files audited (5 files, 776 LoC):

| File | LoC | Sprint introduced |
|------|-----|-------------------|
| `src/core/notification-dispatcher.ts` | 199 | Sprint 139 (DECKENT→USER:NOTIFY) |
| `src/core/notify-adapters/cli-adapter.ts` | 79 | Sprint 139 |
| `src/core/notify-adapters/file-adapter.ts` | 41 | Sprint 145 |
| `src/core/notify-adapters/mcp-adapter.ts` | 84 | Sprint 139 |
| `src/core/nervous-types.ts` | 331 | Sprint 146 (placeholder) → 147 (extended for ADR-040) |
| `src/core/notify-registry.ts` *(adjacent — referenced for context)* | 42 | Sprint 150 H6 |

Out-of-scope but referenced: `src/nervous/*` (live runtime — covered by T-161-035/036), `src/orchestra/notify.ts`, `src/mcp/server.ts`, design spec `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`.

---

## 2. Findings (severity — dimension — summary)

### P0 — Critical
*None.*

### P1 — Major

**P1-01 — Drift — `nervous-types.ts` header still claims ADR-040 is `proposed`, but ADR-040 is `accepted` (Sprint 147).**
Multiple comments use future-tense Sprint 147 promises that are now historical. Misleading for new contributors auditing whether the file is still a placeholder.
*Dimension:* drift, documentation pollution.
*Risk:* a future maintainer may believe the file is unfinished and open a fix PR that overlaps with shipped functionality.

**P1-02 — Conflicting areas — Two parallel notification systems share overlapping vocabulary but distinct contracts.**
- `Notification` (`notification-dispatcher.ts:20`) carries `priority` (`critical | warning | info`) + `event` (5 hard-coded names) + flat `title/summary`.
- `NervousNotification` (`nervous-types.ts:100`) carries `severity` (`info | warning | critical | emergency`) + `actions` array + `timeoutMs` + `groupKey`.
Both systems live in `src/core/`, both have a "Dispatcher", and both have CLI/MCP/file emit paths. The only structural cross-reference is `src/nervous/dispatcher.ts` reusing `NotificationEventName` from `notification-dispatcher.ts` — otherwise the systems are oblivious to each other.
*Dimension:* conflicting areas, drift (claim "complementary" vs reality).
*Risk:* ambiguity for maintainers about which dispatcher to extend; double-emit risk if both systems trigger for the same event.

**P1-03 — ADR violation candidate — `Severity` (4 values) and `NotificationPriority` (3 values) diverge.**
`nervous-types.ts:51` defines `Severity = 'info' | 'warning' | 'critical' | 'emergency'`.
`notification-dispatcher.ts:11` defines `NotificationPriority = 'critical' | 'warning' | 'info'`.
ADR-040 references *severity* (4 values, including `emergency`). The Sprint 139 system has no path to surface `emergency` notifications to the user. If Brain ever needs to escalate beyond `critical`, the call site must build a `NervousNotification`, not a `Notification`.
*Dimension:* drift, type safety boundary.
*Risk:* low today (Sprint 139 callers stay within 3-tier), but future detectors emitting `emergency` will be silently demoted.

### P2 — Moderate

**P2-01 — Cross-platform — `cli-adapter.ts` `/proc/<pid>/fd/1` path is Linux-only, but project supports macOS + WSL2 (CLAUDE.md, IDENTITY.md).**
On macOS, `existsSync('/proc/...')` returns `false`, so the adapter silently falls back to writing the local process's `stderr`. Functional, but the documented "parent-TTY pass-through" feature is unavailable on macOS. The header comment at `cli-adapter.ts:3` does say "on Linux" but does not flag the macOS gap explicitly.
*Dimension:* drift, dependency hygiene.

**P2-02 — Memory hazard — `NotifyDispatcher.queue` is unbounded.**
If `dispatch()` is called faster than `minInterval` (1000 ms default) and all events are non-critical, items accumulate in `this.queue` (line 47). `flush()` consumes only one item per call, and `scheduleFlush()` re-schedules only when `processing === false`. Under sustained load, queue grows indefinitely. No max-length guard, no oldest-eviction.
*Dimension:* dead code → no eviction policy; type safety → array unbounded by contract.
*Risk:* low in normal usage (sprint emits ≤5 notifications per task) but a buggy detector loop could OOM the orchestrator.

**P2-03 — Throttle ratchet — `sendNow()` updates `lastSent` even when zero adapters are available.**
`notification-dispatcher.ts:108` sets `this.throttle.lastSent = Date.now()` unconditionally. If no adapter `isAvailable()`, the system still consumes a throttle slot, delaying the next valid notification. Subtle but inconsistent with "delivered" semantics.
*Dimension:* drift (return value claims "delivered", but throttle treats every dispatch as if delivered).

**P2-04 — Self-Modifying / dispatcher contract — `NotificationAdapter` interface contract is implicit about ordering and concurrency.**
`dispatch()` and `sendNow()` invoke adapters serially via `for...of` + `await`. No documentation guarantees this ordering or whether adapters may reasonably be concurrent. Testing surface (e.g. mock adapters that throw) confirms fail-safe path, but the interface JSDoc does not specify "blocking adapters block other adapters".
*Dimension:* documentation pollution (JSDoc gap), drift (contract vs behavior).

### P3 — Minor

**P3-01 — Documentation — `nervous-types.ts` header refers to design spec `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`. Not verified for existence in this audit, but referenced in `decisions.md` line 1716. Cross-check spec presence.**
*Dimension:* documentation pollution.

**P3-02 — Type safety — `payload?: Record<string, unknown>` repeated across 4 interfaces (NotificationAction, ObserverEvent, ExecutionRecord).**
Acceptable for opaque event bus, but a discriminated union per `event.type` (or a generic parameter) would catch payload-shape bugs (Sprint 145 `string;` corruption motivated ADR-040). Currently any string is valid.
*Dimension:* type safety.

**P3-03 — Naming — `Notification` is too generic. Two adjacent files in `src/core/` define `Notification` (dispatcher) and `NervousNotification` (nervous types). When auditing imports, distinguishing them requires path inspection.**
*Dimension:* conflicting areas, naming hygiene.
*Suggestion:* consider `LocalNotification` or `UserNotification` for the Sprint 139 type.

**P3-04 — Dead-code candidate — `toEventPayload()` (`notification-dispatcher.ts:190`) is exported but only called from `src/orchestra/notify.ts:68`. One call site, no test coverage observed in scope.**
*Dimension:* dead code (single-call-site, not actually dead but worth a coverage check).

**P3-05 — Documentation — `cli-adapter.ts` priority emoji map (`PRIORITY_EMOJI` line 14) uses `Record<string, string>` instead of `Record<NotificationPriority, string>`.**
Loses exhaustiveness checking — adding a new priority would not flag the missing emoji at compile time.
*Dimension:* type safety.

**P3-06 — i18n — Comments mix Turkish and English inconsistently across `nervous-types.ts`. Most JSDoc is Turkish; `notification-dispatcher.ts` is fully English.**
*Dimension:* documentation pollution (style consistency).

**P3-07 — Time wrap — `setTimeout` callback in `scheduleFlush` (`notification-dispatcher.ts:150`) is `async` but the returned promise is dropped.**
Standard pattern, but a thrown error inside `flush` (none currently, but future change) would become an unhandled rejection. Wrap in try/catch.
*Dimension:* type safety, error handling.

**P3-08 — Missing newline policy — `notification-dispatcher.ts` ends at line 199 (file ends with newline); `cli-adapter.ts:79` (no trailing blank); inconsistent file-end style.** Minor.
*Dimension:* documentation pollution.

---

## 3. Evidence (file:line citations)

| ID | Citation | Note |
|----|----------|------|
| P1-01 | `src/core/nervous-types.ts:7` `// ADR-040: proposed (Sprint 147 sonunda accept edilecek)` | ADR-040 status is `accepted` per `.brain/exports/decisions.md:1597` and `summary.md:46`. |
| P1-01 | `src/core/nervous-types.ts:95-99` `// Sprint 147 implementasyon notu: …` | Sprint 147 is historical. |
| P1-01 | `src/core/nervous-types.ts:133` `// Sprint 147'de built-in preset'ler bu interface'i uygulayacak` | Already implemented in `src/nervous/authority-matrix.ts`. |
| P1-01 | `src/core/nervous-types.ts:158` `// Sprint 147'de config-validator.ts bu interface'i doğrulayacak.` | Future-tense; Sprint 147 is past. |
| P1-01 | `src/core/nervous-types.ts:177` `// Sprint 147'de DetectorRegistry bu interface'i kullanan Detector'ları yönetecek.` | DetectorRegistry exists at `src/nervous/detector-registry.ts`. |
| P1-02 | `src/core/notification-dispatcher.ts:20-28` (Notification) vs `src/core/nervous-types.ts:100-125` (NervousNotification) | Two distinct shapes, similar names. |
| P1-02 | `src/nervous/dispatcher.ts:20` `import type { NotificationEventName } from '../core/notification-dispatcher.js';` | Only structural touch-point. |
| P1-03 | `src/core/notification-dispatcher.ts:11` 3-tier `NotificationPriority` | No `emergency`. |
| P1-03 | `src/core/nervous-types.ts:51` 4-tier `Severity` | Includes `emergency`. |
| P2-01 | `src/core/notify-adapters/cli-adapter.ts:33-44` `/proc/${parentPid}/fd/1` | Linux-only path. macOS has no `/proc`. |
| P2-01 | `CLAUDE.md` / `IDENTITY.md` `Platform: macOS, Linux, WSL2` | Stated cross-platform support. |
| P2-02 | `src/core/notification-dispatcher.ts:47,98,131-135,147-154` | Queue + flush mechanics. |
| P2-03 | `src/core/notification-dispatcher.ts:108-126` | `lastSent` set before any adapter call. |
| P2-04 | `src/core/notification-dispatcher.ts:111-123` | Serial `for…of` loop. |
| P3-04 | `src/core/notification-dispatcher.ts:190` + `src/orchestra/notify.ts:68` | Single call site. |
| P3-05 | `src/core/notify-adapters/cli-adapter.ts:14` `PRIORITY_EMOJI: Record<string, string>` | Should be `Record<NotificationPriority, string>` for exhaustiveness. |
| P3-07 | `src/core/notification-dispatcher.ts:150-153` | Async setTimeout callback, no try/catch. |

---

## 4. Per-File Migration Triage

| File | Triage | Justification |
|------|--------|---------------|
| `src/core/notification-dispatcher.ts` | **KEEP-PRIVATE** | Internal orchestration plumbing. Public API surface (if any) should funnel through `src/orchestra/notify.ts` or the MCP `deckent_nervous_*` tools. |
| `src/core/notify-adapters/cli-adapter.ts` | **KEEP-PRIVATE** | Tightly coupled to `DECKENT_PARENT_PID` and `/proc` semantics — implementation detail. |
| `src/core/notify-adapters/file-adapter.ts` | **KEEP-PRIVATE** | Audit-trail JSONL emitter; users interact via `.deckent/nervous-history.jsonl` (file path), not via class. |
| `src/core/notify-adapters/mcp-adapter.ts` | **KEEP-PRIVATE** | Adapter is wired internally by `src/mcp/server.ts`; not user-facing. |
| `src/core/nervous-types.ts` | **MIGRATE-PUBLIC (selective)** | Pure type contracts (`NervousNotification`, `AuthorityMode`, `ApprovalPolicy`, `RiskLevel`, `SafetyFloorAction`) are candidates for a public `@deckent/types` export when SDK ships. Implementation-internal types (`DetectorContext`, `ObserverEvent`) stay private. |
| `src/core/notify-registry.ts` *(context)* | **KEEP-PRIVATE** | Singleton wiring detail; consumers use the dispatcher itself. |

No `DELETE-CANDIDATE` files in scope. No `UNCERTAIN` files.

---

## 5. Recommendations (Sprint 162+ work, NOT a code change in this sprint)

### R1 — Stale-comment cleanup in `nervous-types.ts` (P1-01)
Refresh the header (lines 1-7) and 5 inline comments (lines 95-99, 133-134, 158-159, 177, 95-98) to past tense and `accepted` status. Preserve sprint reference for blame-history continuity.
*Effort:* low, doc-only.

### R2 — Reconcile dual-notification systems (P1-02, P1-03, P3-03)
Author an architectural note (or amend ADR-040) explicitly documenting:
- When to use `Notification` (Sprint 139 — local DECKENT→USER:NOTIFY events)
- When to use `NervousNotification` (ADR-040 — proactive meta-orchestrator with action proposals)
- Whether `Severity` should subsume `NotificationPriority` (recommended: align on 4-tier `Severity` for both)
- Renaming `Notification` → `LocalNotification` or `UserNotification` in `notification-dispatcher.ts`
*Effort:* normal (touches `core/`, `mcp/`, `orchestra/`, requires test updates).

### R3 — Cross-platform CLI adapter (P2-01)
Add a macOS-aware path: e.g., on `process.platform === 'darwin'`, use `lsof -p <ppid>` or fall through to a documented `process.stderr` path. Update header to reflect actual behavior. Alternative: drop parent-TTY entirely and document `stderr` as the canonical channel.
*Effort:* low, contained to `cli-adapter.ts`.

### R4 — Bound the dispatch queue (P2-02)
Add `maxQueueLength` (default 100) to `NotifyDispatcher` constructor; on overflow, drop oldest non-critical items and emit a debug log. Critical notifications bypass queue and so are unaffected.
*Effort:* low.

### R5 — Defer `lastSent` update until after adapter success (P2-03)
Move `this.throttle.lastSent = Date.now()` to after the for-loop, gated on `delivered > 0`. Restores "throttle ticks only when at least one adapter delivered" semantics matching the function's return contract.
*Effort:* trivial; verify no test assumes pre-loop throttle update.

### R6 — Type-safe priority/severity unions (P3-05)
Tighten `PRIORITY_EMOJI` in `cli-adapter.ts` to `Record<NotificationPriority, string>`; remove the `?? 'ℹ️'` fallback once exhaustiveness is enforced.
*Effort:* trivial.

### R7 — Discriminated payloads for high-stakes events (P3-02)
For `ObserverEvent` and `NotificationAction`, introduce a discriminated union keyed on `type` / `id` so detectors and the executor get type-safe payloads. Mitigates a recurrence of Sprint 145 `string;` corruption family.
*Effort:* normal (touches `nervous-types.ts` + 11 detectors + executor + proposer).

### R8 — Surface `toEventPayload()` coverage gap (P3-04)
Add a unit test for `toEventPayload()` and confirm `src/orchestra/notify.ts:68` integration path. If unused outside that one call, consider inlining.
*Effort:* trivial.

### R9 — Async-safe `scheduleFlush` (P3-07)
Wrap the `setTimeout` callback body in `try/catch` and route errors through `debugLog`. Prevents unhandled rejections from any future enrichment of `flush()`.
*Effort:* trivial.

---

## 6. Ten-Dimension Coverage Matrix

| Dimension | Coverage |
|-----------|----------|
| 1. Dead code (unused exports) | P3-04 (`toEventPayload` single call site). No truly dead exports observed. |
| 2. ADR violations (44 active ADRs) | P1-03 (Severity vs Priority — ADR-040 alignment). All other ADRs (001 ESM, 002 Node16, 015 Routing, 035 Verification, 040 Nervous) honored: imports use `.js`, no Node16 violations, NotificationAdapter contract is provider-agnostic. |
| 3. Conflicting areas (duplicated logic) | P1-02 (dual notification systems), P3-03 (`Notification` naming overlap). |
| 4. Drift (comments vs behavior) | P1-01 (stale Sprint 147 future-tense), P2-03 (throttle vs "delivered" claim), P2-01 (header mentions Linux without macOS gap). |
| 5. Type safety | P3-02 (`Record<string, unknown>` payloads), P3-05 (priority emoji map widening), P1-03 (Severity/Priority divergence). No `any`, `as unknown as`, `// @ts-ignore` found. `strict: true` honored. |
| 6. Dependency hygiene | All imports use `.js` extensions per ADR-001/002. No circular deps observed within scope (notify-registry breaks the only known circular risk per its header comment). `node:fs`, `node:path` correctly prefixed. |
| 7. Documentation pollution | P1-01 (stale Sprint references), P3-06 (TR/EN mix), P3-08 (file-end style). JSDoc generally good but contract-level concurrency/ordering left implicit (P2-04). |
| 8. Memory V2 coherence | N/A — these files do not interact with `memory.db` / `MemoryStore`. `nervous-types.ts` references `JSONL` history file (`.deckent/nervous-history.jsonl`), not the SQLite store — consistent with ADR-040 design. |
| 9. Config integrity | `NervousSystemConfig` (`nervous-types.ts:159-170`) schema is consistent with `mcp/tools/nervous.ts:28-29` (`quietHours`, `throttleWindowMs`) and `nervous/proposer.ts:127` defaults (5 min throttle). Snake-case fallbacks (`ns.quiet_hours`, `ns.throttle_ms`) suggest historical config keys still supported. |
| 10. Migration triage | Section 4. 5 KEEP-PRIVATE, 1 selective MIGRATE-PUBLIC, 0 DELETE/UNCERTAIN. |

---

## 7. Audit Outcome

- **Severity distribution:** 0 P0, 3 P1, 4 P2, 8 P3.
- **Type safety posture:** Strong (no `any`/`as unknown as`/`@ts-ignore`); minor exhaustiveness gaps documented.
- **ADR posture:** No accepted-ADR violations. ADR-040 alignment can be tightened by harmonizing severity vocabularies.
- **Dead code:** None confirmed (one near-orphan exported helper flagged for verification).
- **READ-ONLY mandate:** Honored. `git diff --stat` outside `docs/audits/sprint-161/` should show zero changes from this task.

This module pair (`notification-dispatcher.ts` + `nervous-types.ts`) is **production-ready** in current form. The primary ergonomic risk is the dual-system ambiguity (R2); the primary correctness risks are the unbounded queue (R4) and the throttle ratchet (R5), both low-frequency but easy-to-fix tightening opportunities.

---

*End of report — 776 LoC audited across 5 files (+1 contextual). 15 findings catalogued with file:line evidence and Sprint 162+ recommendations.*
