# Sprint 161 Lane Roster (T+0)

**Audit start:** 2026-05-08
**Spec:** docs/superpowers/specs/2026-05-08-sprint-161-god-audit-design.md
**Plan:** docs/superpowers/plans/2026-05-08-sprint-161-god-audit-execution.md

## Lane 1 — Deckent workers
Expected task count: 56 (per Brain structured plan dry-run)
Output dir: docs/audits/sprint-161/T-161-NNN-*.md

## Lane 2 — CC Behavior Monitor (3 agents)
- A1: Brain Rubric Watcher → cc-monitor/A1-brain-rubric-anomalies.md
- A2: Worker Honesty Auditor → cc-monitor/A2-worker-honesty.md
- A3: Auditor Authority Watcher → cc-monitor/A3-auditor-authority.md

## Lane 3 — CC Deep-Dive (9 mandatory + 1 optional)
- D1: node_modules Auditor → cc-deepdive/D1-node-modules.md
- D2: dist/src Drift Detector → cc-deepdive/D2-dist-src-drift.md
- D3: ADR Cross-Reference → cc-deepdive/D3-adr-cross-reference.md
- D4: Library Version Mismatch (context7) → cc-deepdive/D4-library-version-mismatch.md
- D5a: Documentation Pollution & Drift → cc-deepdive/D5a-doc-pollution.md
- D5b: Public-Repo Migration Triage → cc-deepdive/D5b-migration-triage.md
- D6: Doc-as-Code Fixture References → cc-deepdive/D6-fixture-references-non-test.md
- D7: Memory V2 Deep Audit → cc-deepdive/D7-memory-v2-deep-audit.md
- D8: .deckent/ & .brain/ Structural → cc-deepdive/D8-deckent-brain-structural.md
- D9 (optional): Security Surface → cc-deepdive/D9-security-surface.md

## Tool availability notes
- `sqlite3` CLI: NOT installed system-level → D7 uses `better-sqlite3` Node bindings (readonly)
- `jq`: NOT installed system-level → A1/A2/A3 use `node -e` JSON parsing
- All other tools (gemini, claude, node v24, docker, npm, find, grep, git, sed, awk) present
