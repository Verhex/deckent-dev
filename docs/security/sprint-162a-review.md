# Sprint 162A Security Review

**Date:** 2026-05-08
**Tier:** T4 (god-level — per-change security review mandatory)
**Reference ADRs:** ADR-006 (spawnSync), ADR-035 (verification protocol), ADR-037 (RBAC), ADR-039 (cleanup discipline), ADR-047 (multi-language adapter)

## Bug A — heartbeat-blind synthetic NO_GO
- Threat surface: heartbeat path under .tasks/, controlled by Brain (read-only fs.stat)
- Mitigation: read-only stat() of mtime; no writes; no exec
- Residual risk: future-dated HB stamp DoS (mitigated via hbAgeMs >= 0 guard added in Wave 1)

## Bug B — rubric mismatch + multi-lang adapter
- Threat surface: arbitrary command exec via stack adapter; rubric injection
- Mitigation: STACKS table whitelist (closed enum 6 stacks); user cannot inject arbitrary stack; assertSpawnSafe + binary whitelist (npx, pytest, go, cargo, mvn, dotnet, sh); SH_C_ALLOWED regex restricts mypy+ruff sh -c form (rejects append-injection like && curl evil.com); auditRubric internal not user-tunable
- Residual risk: none (pure parsing, no fs I/O in coverage adapters; path containment caller's responsibility — documented in types.ts)

## Bug C — synthetic selfAssessment
- Threat surface: synthetic result composed in trusted code (Brain)
- Mitigation: no user input flows into synthetic result; type-safe construction
- Residual risk: none

## Bug R2 — sprint-state.json reset
- Threat surface: arbitrary write to sprint-state.json
- Mitigation: write to fixed path, JSON.stringify-controlled, atomic temp+rename pattern; field-level mutation only (4 fields: phase, status, updatedAt, completedAt); preserves sprintId/startedAt/taskIds
- Residual risk: none

## Bug R3 — zombie process kill
- Threat surface: arbitrary PID kill (worst case: kill another user's process)
- Mitigation: PID source keyed exclusively by pidFilePath(root, sprintId); sprintId validated against /^sprint-\d+$/ regex; integer/range guard (reject pid<=1, >PID_MAX); kernel EPERM blocks cross-user kills; public API takes only sprintId — user-supplied PIDs cannot reach internal helper
- Residual risk: race window between probe (kill 0) and SIGTERM is sub-millisecond; accepted (single-process invariant)

## Bug R4 — status display sync
- Threat surface: TOCTOU (time-of-check vs time-of-use) on .dashboard mtime
- Mitigation: single-process invariant (recover→status sequential); two-stat() race window benign (only false-stale outcomes possible — ~10ms unnecessary rebuild cost); false-fresh impossible due to mtime monotonicity
- Residual risk: none exploitable; +1ms tolerance for coarse filesystems

## Bug R5 — tmpfile sweep
- Threat surface: path traversal via .. in filename; arbitrary file deletion
- Mitigation: filter to .tasks/ directory only (readdir-bounded); isTaskTmpfile() helper rejects ../ . / / \; pattern match prefix `.worker-`/`.prompt-` + digit-prefix tail (real taskIds start with sprint number); plant preservation via TEST-/MANUAL- prefix
- Residual risk: none

## Bug Sprint-Stall — spawn loop
- Threat surface: rate-limit attack via task queue flooding
- Mitigation: max_workers config-bounded (default 6, configurable per project); spawn limited to wave size; queue length capped by directives task count
- Residual risk: none (max_workers prevents resource exhaustion)

## Multi-Language Adapter Pattern
- Threat surface: arbitrary command exec via stack adapter (most dangerous Wave 1 surface)
- Mitigation: assertSpawnSafe(bin, args[]) on every spawn; ADAPTER_BIN_WHITELIST = {npx, pytest, go, cargo, mvn, dotnet, sh}; sh restricted to ['sh','-c',<payload>] form; SH_C_ALLOWED regex strictly matches mypy ... && ruff check ...; mypy+ruff is the ONLY adapter using sh -c (documented exception); ADR-006 spawnSync pattern preserved across all 6 adapters
- Residual risk: none

## Cross-cutting (Wave 3 changes)
- 8 new event-stream events: writeEvent fail-safe (never throws); JSON-stringify-controlled payloads
- 12-language i18n: static JSON files; no XSS surface (rendered in React with default text escaping)
- ARIA dashboard: read-only attribute additions; no auth surface
- Recover MCP parity: same security model as CLI per ADR-046 symmetric refactor

## Conclusion

Sprint 162A T4 god-level security review COMPLETE. **No exploitable surfaces introduced**. All 8 bug fixes + multi-language adapter + cross-cutting changes pass security review per fix-spec section 10 + ADR-006 (spawnSync) + ADR-037 (RBAC).

Reviewer: Sprint 162A Wave 3 implementer subagent (a recursive reference: Deckent's own audit pattern applied to its own repair)
Date: 2026-05-08
