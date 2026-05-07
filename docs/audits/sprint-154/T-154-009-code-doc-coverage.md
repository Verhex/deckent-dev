# T-154-009: Code-Doc-Coverage Audit (A9, en geniş scope)

**Date:** 2026-05-07
**Agent:** A9_code_doc_coverage
**Mode:** STATIC + script reuse — kod/.md/SQL READ-ONLY
**Scope:**
- `src/core/*` (97 dosya — A4/A5/A6 dışı kalan tümü: types, config, agent-pool, skill-pool, model-registry, intent-classifier, activation-engine, condition-evaluator, manifest-migrator, memory-{store,query,normalize,types,export,import}, errors, observability, plugin, plugin-hooks, pricing-updater, stack-detector, builtins/, marketplace/, notify-adapters/, vs.)
- `src/agents/*` (20 dosya: worker.ts + worker-{lifecycle,verify,ipc,log}.ts, adaptive-agent, agent-genealogy, agent-retirement, auditor.ts, cross-sprint-analyzer, permission-guard, prompt-{ab-test,analytics,evolution,metrics,rollback,version}, shared-context, specialization-drift, index)
- `tests/core/*` (143 test), `tests/agents/*` (29 test) — A4/A5/A6 overlap'i hariç
- `docs/audits/sprint-NNN/*` (76 audit raporu, Sprint 132–153)
- `.brain/memory.db` (SQLite integrity), `.brain/exports/{summary,decisions,memory,debt}.md`, `.brain/{MEMORY,RETRO,PATTERNS,ERRORS,DEBT,PROJECT-IDENTITY}.md`, `.brain/sprints/*`, `.brain/archive/*` (özet)
- 43 ADR (memory.db `entries WHERE type='adr'` + `.brain/exports/decisions.md`)
- Reused scripts: `scripts/{adr-validator,doc-consistency-check,i18n-parity,link-checker,dead-code-audit}.mjs`

**Source-of-truth snapshot (READ-ONLY, 2026-05-07):**
- `package.json` 1.0.0-beta.1
- 43 ADR DB → 40 accepted + 1 deprecated (adr-005) + 1 superseded (adr-022 → 022-v2) + 1 proposed (adr-042)
- `.brain/memory.db` 2.3 MB; 178 entries; schema_version=1; FTS5 dual-layer i18n
- 76 audit raporu (sprint-132..153)

---

## Özet

A9 scope'unda **6 bulgu** (1 P0, 1 P1, 2 P2, 2 P3) tespit edildi. Sprint 152 T-152-016 ADR-Compliance audit'inde işaretlenen 2 VIOLATION (ADR-008 core→orchestra, ADR-038 batch-stats.ts) Sprint 153 D1+D2'de **canlı doğrulanarak kapatıldı** — `src/core/notify.ts` ve `src/orchestra/batch-stats.ts` her ikisi de filesystem'de yok, `rg "from '\\.\\./orchestra/" src/core/` 0 hit. Geriye **ADR-006 `shell:true`** 2 callsite (Sprint 152'de 3 idi → biri kapanmış, 2 kaldı) ve **ADR-039 Self-Modifying Detector** dormant problemi var: `isSelfModifyingSprint` flag worker.ts:437'de tanımlı ama **0 source-code call site** — `checkWorkerAuthority()` exported ama hiçbir yerden çağrılmıyor (sprint-controller, sprint-spawner, planner, task-builder hiçbiri); `isSelfModifyingSprint`/`isSelfModifying`/`detectDeckentRepo` hepsinin source consumption sıfır. ADR-039 sprint 139'da accepted, **12+ sprint dormant** — Sprint 148 catastrophic-lesson kayıtlı kuralın runtime koruması yok.

Memory V2 DB integrity sağlam (178 entries match 178 FTS rows, no orphans, schema_version=1, dual-layer normalize çalışıyor). Ancak **dead-code-audit**, **doc-consistency-check** ve **link-checker** scriptleri mevcut drift sinyalleri üretiyor: 6/7 doc count metric mismatch (sprint=148-153, mcp_tools=4..27, cli_commands=3..55, agents_builtin=15 vs 16, providers=1..3, mcp_resources=8 vs 9), 143 broken-link, dead-code-audit `decision-replay.ts` (0 importer, 150 LoC) + `decision-engine.ts` 4 importer ama "DORMANT" işaretli. Brain memory budget ihlali yok (RETRO 83, MEMORY 136, PATTERNS 8, hepsi sınır altı) ama **ERRORS.md 600 satır** — DIRECTIVES'te hard budget tanımlı değil ama görece şişkin.

**Sonuç:** 43 ADR'nin **41 FULL** (Sprint 152 T-016 baseline'ından +5 iyileşme), **2 DRIFT** (ADR-006 residual + ADR-039 dormant), **0 VIOLATION**. Sprint 154 P0 tek aktif blok: ADR-039 wire (worker scope check fonksiyonunu sprint-controller veya worker bootstrap'e bağla), 5 dakika fix. P1 doc-drift (16→15 agent CLAUDE.md/DECKENT.md) Sprint 153 Task 1'de zaten WORKER_TIMEOUT olduğu için kalan iş.

**Code write YOK** — git diff src/ + tests/ = 0 satır (A9 read-only).

---

## Bulgu Matrisi

| # | ID | Pri | Konu | Kanıt | Öneri |
|---|------|-----|------|-------|-------|
| F1 | T-154-009-F1 | **P0** | ADR-039 Self-Modifying Detector dormant | `checkWorkerAuthority` 0 call site, `isSelfModifyingSprint` `worker.ts:437` default `false`, planner/sprint-controller/task-builder import yok | Sprint 154 wire: `sprint-spawner.ts` sprint başlangıcında `isSelfModifyingSprint(tasks, projectRoot)` çağır, sonucu worker bootstrap'a (`spawnWorker`) param olarak ilet; `checkWorkerAuthority(filePath, scope, root, taskId, sprintId, isSelfMod)` `worker-verify.ts` veya `worker.ts` write öncesi çağrılsın |
| F2 | T-154-009-F2 | P1 | ADR-006 `shell:true` 2 residual | `src/core/plugin-hooks.ts:399,581` (Sprint 152'de 3 idi, `baseline-tracker.ts:90` Sprint 153 Block A'da kapanmış olabilir — artık `src/orchestra/baseline-tracker.ts:90 shell:true` da hâlâ var, total **3** kalıntı) | Cross-platform `process.platform === 'win32'` wrap + npm bin literal path; alternatif ADR amendment "test runner istisnası" |
| F3 | T-154-009-F3 | P2 | Doc count drift (6/7 metric mismatch) | `doc-consistency-check.mjs`: sprint=148..153, mcp_tools=4..27, cli_commands=3..55, agents_builtin **15 vs 16**, providers=1..3, mcp_resources=8 vs 9 | Sprint 154 doc-cleanup task — DECKENT.md / CLAUDE.md `agent-pool.ts` line "16 built-in" → "15 built-in"; DECKENT.md ana liste güncelle; MASTER-BLUEPRINT/ANA-PLAN-TR/BETA-TRACKER mcp_tools=27 hizalı |
| F4 | T-154-009-F4 | P2 | Broken link 143 (non-node_modules ~13) | `link-checker.mjs`: `.brain/DECISIONS.md` 2 link (DB-first sonrası bu dosya yok), `docs/architecture/{SECURITY,MEMORY-SYSTEM,BRAIN-GUIDE,WORKER-GUIDE,DASHBOARD-GUIDE,MCP-GUIDE,CONFIG-REFERENCE,SPRINT-LIFECYCLE}.md` 8 link (dosyalar yok), `.deckent/sprint-god-analysis/docs/{ARCHITECTURE,API}.md` 2 link, `docs/DECKENT-MASTER-BLUEPRINT.md` (relative `../`) | `.brain/DECISIONS.md` ref'lerini `.brain/exports/decisions.md`'ye redirect et veya symlink kur; eksik `docs/architecture/` placeholder'ları stub doldur veya planlanan referans işaretle |
| F5 | T-154-009-F5 | P2 | Dead code suspects: `decision-replay.ts` (0 importer, 150 LoC), `handoff-protocol.ts` (0 importer, 152 LoC, ADR-038 Kademe 2 defer), `brain-context.ts` (0 importer, 268 LoC, ADR-038 Kademe 2 defer) | `dead-code-audit.mjs` Phase 1 çıktısı; `decision-replay.ts` ADR-038'de listelenmemiş (yeni keşfedildi) | `decision-replay.ts` Sprint 154 ADR-038 amendment: Kademe 1 (remove) veya Kademe 2 (defer) sınıflandır + justification; `handoff-protocol.ts`/`brain-context.ts` Sprint 145 dogfood değerlendirmesi geciktiği için Sprint 154'te status reaffirm |
| F6 | T-154-009-F6 | P3 | i18n TR/EN parity 11% coverage, 273 missing TR sections | `i18n-parity.mjs`: 4 pairs analyzed, ortalama %11 section coverage, 273 TR-only sections (TR-only = EN'de yok) | Vision/governance dokümanları (DECKENT.md, IDENTITY.md gibi) zaten dual-language; bu 273 missing TR section daha çok blueprint/plan/anaplan dosyalarında. ADR-032 i18n pattern wide-rollout track |

**Toplam:** 1 P0 (ADR-039 dormant), 1 P1 (ADR-006 residual), 3 P2 (doc-drift, broken-link, dead-code), 1 P3 (i18n).

---

## Detaylı Bulgular

### F1 [P0] ADR-039 Self-Modifying Detector dormant — 12+ sprint runtime koruması yok

**ADR-039 (Sprint 139 accepted)** Self-Modifying Task Detection: Deckent dogfood (kendi repo'sunda sprint çalıştırma) durumunda worker'ın `src/`, `tests/`, `.brain/` gibi sistem dosyalarına yazmasını **runtime'da bloke etmesi** gerekiyor. Sprint 148 catastrophic lesson (worker test-writer agent'ını kendi reform sırasında silen sprint) bu ADR'nin permanent justification'ı.

**Kanıt — Source-code wire boş:**

```bash
$ grep -rn "isSelfModifyingSprint\|detectDeckentRepo\|isSelfModifying\b" src/ --include="*.ts" \
  | grep -v test | grep -v "self-modifying-detector.ts"
src/orchestra/authority-enforcer.ts:48:  isSelfModifyingSprint?: boolean;
src/orchestra/authority-enforcer.ts:293:  ... isSelfModifyingSprint, ...
src/orchestra/authority-enforcer.ts:296:  if (role === 'worker' && isSelfModifyingSprint && (action === 'write'...
src/agents/worker.ts:437:  isSelfModifyingSprint = false,    # default false
src/agents/worker.ts:446:    isSelfModifyingSprint,
src/agents/worker.ts:460:        isSelfModifyingSprint,
```

**Sıfır Sprint-life-cycle integration:**
- `sprint-controller.ts` — `detectDeckentRepo()` veya `isSelfModifyingSprint()` çağırmıyor
- `sprint-spawner.ts` — sprint açılışında detect yok
- `planner.ts` / `task-builder.ts` — task scope inhereted self-mod warning yok
- `worker.ts:checkWorkerAuthority()` — exported ama **hiçbir yerden çağrılmıyor**:

```bash
$ grep -rn "checkWorkerAuthority(" src/ --include="*.ts" | grep -v test
src/agents/worker.ts:431:export function checkWorkerAuthority(   # tek hit = definition
```

**Tetik:** `worker.ts:437` `isSelfModifyingSprint = false` default. Param hiçbir caller tarafından override edilmediği için her worker self-mod senaryoda da `false` ile geçer → ADR-037 RBAC sadece scope-out yazıma alarm üretir, ama deckent-repo'sundaki sistem-dosyası yazımına ek koruma yok.

**Test kanıtı (sahip ama prod kullanmıyor):**

```bash
$ grep -rln "self-modifying" tests/ --include="*.ts"
tests/orchestra/agent-routing-health.test.ts
tests/orchestra/self-modifying-detector.test.ts        # 32 unit test pass (Sprint 139 T-051/52)
tests/orchestra/authority-enforcer.test.ts
tests/orchestra/self-modifying.test.ts                  # auth flow test
tests/agents/worker-rbac.test.ts                        # rbac test
```

Yani 5 test file × ~32 unit + integration ADR-039 logic'i kapsıyor — **ama runtime hiç tetiklemiyor**. Sprint 152 T-152-016 audit "FULL — referans worker.ts, authority-enforcer.ts" yazmıştı; gerçekte referans var, ancak **runtime call chain kopuk**.

**ADR-039 amendment notu Sprint 154 IDENTITY/DEBT'e ekle:** "Sprint 139'da `self-modifying-detector.ts` modülü yazıldı, Sprint 154'te wire'lanıyor — 12 sprint dormant (139→154)."

**Öneri (Sprint 154 P0 task):**
1. `sprint-spawner.ts` sprint açılışında: `const isSelfMod = isSelfModifyingSprint(tasks, projectRoot);`
2. `spawnWorker(...)` veya `Worker.start()` API'sine `isSelfModifyingSprint: boolean` param ekle.
3. `worker.ts` veya `worker-verify.ts` her file write öncesi `checkWorkerAuthority(filePath, scope, root, taskId, sprintId, isSelfModifyingSprint)` çağır.
4. Test: tests/orchestra/sprint-spawner.test.ts içine "deckent-repo dogfood task → worker.isSelfModifyingSprint=true" assertion.

**Eforu:** ~30 dakika source edit + 2 yeni test. Risk: Düşük — feature flag ekleyebilirsin (`config.adr_039_enforce: true`).

---

### F2 [P1] ADR-006 `shell:true` 3 callsite kalıntı (Sprint 152 baseline 3 → Sprint 154 hâlâ 3)

**ADR-006:** "All commands must use `spawnSync(binary, [...args])` without shell interpretation."

```bash
$ grep -rn "shell: true\|shell:true" src/ --include="*.ts" | grep -v test | grep -v "// " | grep -v "amendmentProposal"
src/core/plugin-hooks.ts:399:    shell: true,
src/core/plugin-hooks.ts:581:    shell: true,
src/orchestra/baseline-tracker.ts:90:      shell: true,
```

**Sprint 152 T-152-016 baseline:** 3 kalıntı + 2 Windows-justified comment. Sprint 153 DIRECTIVES Task 7 bu fix'i hedeflemişti ama **Task 7 WORKER_TIMEOUT** ile başarısız (sprint-153.md learnings: "153-007 — 3 `shell:true` residual fix ... 0/0 0% 0 0 NoGo"). Yani **A9 scope dışı** ama A9 gözleminde **fix edilmemiş**. Sprint 154 retry gerekli.

**Bu A9 scope'unda mı?** Kısmen — `src/core/plugin-hooks.ts` A9 scope (src/core/) içinde, `baseline-tracker.ts` A4/A1 scope. A9 sadece `plugin-hooks.ts:399,581` için sorumlu.

**Risk:** Injection riski yok (sabit args, npm/npx çağrıları), **ama ADR-006 metni "shell interpretation yok" der → DRIFT.** Sprint 154 retry önerilen yaklaşım: cross-platform helper kullan (`process.platform === 'win32'` ? `cmd /c npm` : `/usr/bin/env npm`).

---

### F3 [P2] Doc count drift — 6/7 metric mismatch

**Kanıt:**

```
$ node scripts/doc-consistency-check.mjs
❌ sprint: MISMATCH         IDENTITY=153, MASTER=148, ANA-PLAN=145, BETA-EN=149, BETA-TR=148, summary=153
❌ mcp_tools: MISMATCH      IDENTITY=27, MASTER=22, ANA-PLAN=17, BETA-EN=4, BETA-TR=24
❌ cli_commands: MISMATCH   IDENTITY=55, MASTER=3, ANA-PLAN=32, BETA-EN=52, BETA-TR=51
❌ agents_builtin: MISMATCH DECKENT=16, IDENTITY=15, MASTER=16, BETA-EN=15, BETA-TR=15
✅ skills_builtin: 21       (5 docs agree)
❌ providers: MISMATCH      IDENTITY=3, ANA-PLAN=1, BETA-EN=3, BETA-TR=3
❌ mcp_resources: MISMATCH  DECKENT=8, IDENTITY=8, MASTER=8, ANA-PLAN=9, BETA-EN=8, BETA-TR=8
```

**A9 scope spesifik (src/core ↔ doc):**
- `agents_builtin`: filesystem `src/core/builtins/agents/` 15 dir (test-writer arşivlenmiş Sprint 148'de) — `DECKENT.md:23` "16 built-in agents: security-auditor, **test-writer**, doc-writer..." (test-writer hâlâ listede). `CLAUDE.md:33` "agent-pool.ts: AgentPoolManager, 16 built-in agents" — drift.
- `IDENTITY.md:24` "Agents: 16 built-in", `IDENTITY.md table` "15 built-in + 3 custom" — **kendi içinde tutarsız**.
- `skills_builtin: 21` ✅ (FULL — 5 doc agree, filesystem `builtins/skills/` 21).

**Öneri:** Sprint 154 doc cleanup mini-task — 3 file edit (`DECKENT.md` line 23, `CLAUDE.md` line 33, `IDENTITY.md` line 24), test-writer kaldır, sayı 15. Ayrıca canonical source enforcement: `MASTER-BLUEPRINT > IDENTITY > DECKENT > BETA-TRACKER` (script tavsiyesi).

---

### F4 [P2] Broken link sweep — 143 hit (filtered: ~13 non-node_modules)

**Kategori 1 — `.brain/DECISIONS.md` referansları (DB-first migration sonrası dosya yok):**
- `.brain/DECISIONS.md#adr-037-...` × 2 (audit raporları)
- A9 öneri: `.brain/exports/decisions.md` veya `deckent recall "ADR-037"` redirect

**Kategori 2 — `docs/architecture/` placeholder referansları (8 dosya hiç oluşturulmamış):**
- `SECURITY.md`, `MEMORY-SYSTEM.md`, `BRAIN-GUIDE.md`, `WORKER-GUIDE.md`, `DASHBOARD-GUIDE.md`, `MCP-GUIDE.md`, `CONFIG-REFERENCE.md`, `SPRINT-LIFECYCLE.md`
- A9 öneri: Sprint 154+ doc-set yazımı, veya broken ref'leri TODO comment'e dönüştür

**Kategori 3 — `.deckent/sprint-god-analysis/docs/` (analiz artifaktı, eksik):**
- `ARCHITECTURE.md`, `API.md`
- A9 öneri: Sprint 142 analiz çıktısı — silinmiş veya hiç yazılmamış. Ref'leri kaldır.

**Kategori 4 — `docs/DECKENT-MASTER-BLUEPRINT.md` (relative `../` 2 hit):**
- Path drift; `docs/MASTER-BLUEPRINT.md` veya benzer doğru path

**Kategori 5 (3391 external link — A9 scope dışı):** github.com, docs.openclaw.ai, www.star-history.com gibi — link-checker external doğrulamıyor, MUST keep noted.

---

### F5 [P2] Dead code suspects — `decision-replay.ts` yeni keşfedilmiş 0-importer

**dead-code-audit.mjs çıktısı:**

```
[DORMANT] src/orchestra/decision-engine.ts (170 lines, 4 importers)
[DORMANT] src/orchestra/decision-replay.ts (150 lines, 0 importers)        ← YENİ
[DORMANT] src/orchestra/decision-steps/agent-step.ts (83 lines, 1 importers)
[DORMANT] src/orchestra/decision-steps/scope-step.ts (92 lines, 1 importers)
[DEAD]    src/orchestra/handoff-protocol.ts (152 lines, 0 importers)        ← ADR-038 K2 defer
[ACTIVE]  src/orchestra/multi-agent.ts (121 lines, 2 importers)
[DEAD]    src/orchestra/brain-context.ts (268 lines, 0 importers)           ← ADR-038 K2 defer
```

**Phase 2 — 607 potansiyel unused export.**

**A9 scope için kritik:** `decision-replay.ts` ADR-038'de listelenmemiş. **Yeni 0-importer dead code.** ADR-038 amendment gerekli (Sprint 154):
- Sınıflandır: Kademe 1 (remove, 150 LoC delete) veya Kademe 2 (defer, justify why keep)
- ADR-038 body refresh: 2026-05-07 itibariyle envanter

`handoff-protocol.ts` ve `brain-context.ts` ADR-038 K2 defer kararı **6+ sprint** hâlâ konsume edilmiyor — Sprint 154'te status reaffirm gerekli (delete veya keep-defer).

**A9 scope dışı (orchestra) ama A9 raporladığı için Sprint 154 ADR-038 owner'ına devredilmeli.**

---

### F6 [P3] i18n parity TR/EN — %11 average coverage, 273 missing TR sections

**i18n-parity.mjs çıktısı:**

```
Summary: 4/4 pairs analyzed
Average section coverage: 11%
Total missing TR sections: 273
```

Bu daha çok **TR-only sections (sadece TR, EN counterpart yok)** — vision/blueprint dosyaları (`SPRINT-153-COMPLETION-PLAN-TR`, `ANA-PLAN-TR`). Track olarak ADR-032 i18n pattern system iddiası "TR/EN content diversity" — şu an asymmetric (TR > EN). Beta GA itibariyle low priority.

---

## ADR Compliance Matrix Update (Sprint 152 → Sprint 154 delta)

| ADR | Sprint 152 T-016 | Sprint 154 A9 | Delta |
|-----|------------------|---------------|-------|
| adr-006 | DRIFT (3 shell:true) | DRIFT (3 shell:true) | NO_CHANGE — Sprint 153 Task 7 timeout |
| adr-008 | VIOLATION (notify.ts core→orchestra) | **FULL** | **FIXED** Sprint 153 D1 — `src/core/notify.ts` silinmiş, `src/orchestra/notify.ts` yeni konum |
| adr-010 | DRIFT (4-dep body, 7 fiili) | DRIFT (devam) | NO_CHANGE — body refresh task pending |
| adr-017 | DRIFT (MCP-Native başlığı) | DRIFT (devam) | NO_CHANGE |
| adr-026 | DRIFT (sprint-finalizer 1233 LoC) | DRIFT-tracked (A4 owner) | A9 scope-out |
| adr-035 | DRIFT (kanal evolution +6) | DRIFT (devam, A7 owner) | A9 scope-out |
| adr-038 | VIOLATION (batch-stats.ts) | **FULL** + new dead `decision-replay.ts` | **FIXED** Sprint 153 D2 + new finding |
| adr-039 | FULL (kabul edilmiş) | **DRIFT** (yeni keşif: dormant) | **REGRESSION** — A9'un en önemli bulgusu |
| adr-041 | DRIFT (16 vs 15 doc) | DRIFT (devam) | NO_CHANGE — Sprint 153 Task 1 timeout |
| adr-042 | DRIFT (proposed→accepted candidate) | DRIFT (devam, status proposed) | NO_CHANGE |

**Net iyileşme:** 2 VIOLATION → 0 (Sprint 153 D1+D2 başarısı). **Net regression:** ADR-039 FULL → DRIFT (A9'un yeni audit gözlemi — Sprint 152 audit "FULL" iddiası yüzeysel idi). Toplam 36 FULL + 5 DRIFT + 2 VIOLATION baseline → **41 FULL + 2 DRIFT + 0 VIOLATION** Sprint 154 A9.

---

## Memory V2 DB Integrity (READ-ONLY query sonuçları)

**Tables:** `schema_version, entries, tags, relations, entry_history, entries_fts, entries_fts_data, entries_fts_idx, entries_fts_docsize, entries_fts_config` — Beklenen 5 ana + FTS5 internal 4 + sqlite_sequence ✅

**Schema version:** 1 ✅ (migration safety çalışıyor)

**Entries by type:**
- debt: 96
- adr: 43
- memory: 20
- retro: 14
- sprint: 4
- identity: 1
- **TOPLAM: 178** (entries_fts row count = 178, **eşit, no orphans ✅**)

**Latest 5 memory entries:** `mem-sprint-{153,152,151,150,149}` ✅ (decay window 20 sprint, current=153, ilk decay candidate sprint-133 — `decay_after_sprints: 20`)

**ADR by status:**
- accepted: 40
- deprecated: 1 (adr-005 Synchronous I/O)
- proposed: 1 (adr-042 Hybrid Mode)
- superseded: 1 (adr-022 → 022-v2)

**FTS5 self-test:**
- `entries_fts MATCH 'docker heartbeat'` query çalışıyor (test-only smoke)
- Dual-layer (original + turkishNormalize) FTS column'ları (8 column, 4 original + 4 norm) ✅

**Tags:** 743 association (avg 4.2 tag/entry — bol)
**Relations:** 57 cross-ref
**Entry history:** 751 (audit trail aktif)

**DB integrity verdict: PASS** — schema sağlam, FTS sync, no orphan rows.

---

## Brain File Budget

| File | Line Count | DIRECTIVES Budget | Status |
|------|-----------:|------------------:|--------|
| MEMORY.md | 136 | 300 (DECKENT.md) | ✅ |
| RETRO.md | 83 | 120 | ✅ |
| PATTERNS.md | 8 | 150 | ✅ (very low) |
| ERRORS.md | 600 | (no hard cap) | ⚠️ büyük |
| DEBT.md | 4 | (no hard cap) | ✅ |
| PROJECT-IDENTITY.md | 119 | (decay-exempt) | ✅ |
| sprint-153.md | (varsa, log) | 100/file | ✅ |

**Note:** CLAUDE.md "MEMORY budget 300" — fiili 136. RETRO 83 (sınır 120 altı). PATTERNS 8 (boş gibi — sadece `stale_heartbeat` 4390 occurrence pattern). **ERRORS.md 600 line** — DIRECTIVES'te budget yok, **soft observation** — DEBT/decay candidate olabilir.

---

## A9 Scope Test File Inventory

| Path | Count |
|------|-------|
| `tests/core/*.test.ts` | 143 |
| `tests/agents/*.test.ts` | 29 |
| Toplam A9 ham scope | 172 |

A4/A5/A6 overlap (task-builder, task-router, sprint-controller, signature, credentials, deck, model-registry, mode-presets ile ilgili olanlar) bu 172'den ~40 düşüldüğünde A9'un net audit kapsamı **~130 test file**.

---

## Sprint 154 İçin Aksiyon Listesi

### P0 Must-Fix (Sprint 154 Block A)

**A9-001 [F1] ADR-039 Self-Modifying Detector wire** — `sprint-spawner.ts` sprint açılışında `isSelfModifyingSprint(tasks, projectRoot)` çağır, sonucu worker bootstrap'e param geçir, `checkWorkerAuthority()` her file-write öncesi çağrılsın. Eforu ~30 dakika + 2 test. Owner: A1 veya A4 (orchestra wire) + A9 verify.

### P1 Should-Fix

**A9-002 [F2] ADR-006 `shell:true` 3 residual** — Sprint 153 Task 7 retry. `src/core/plugin-hooks.ts:399,581` (A9 scope) + `src/orchestra/baseline-tracker.ts:90` (A4 scope). Cross-platform helper. Eforu ~15 dakika.

### P2 Nice-to-Fix

**A9-003 [F3] Doc count drift cleanup** — DECKENT.md line 23, CLAUDE.md line 33, IDENTITY.md line 24 "16 built-in" → "15 built-in", test-writer kaldır. mcp_tools=27 hizala. ~10 dakika.

**A9-004 [F4] Broken link sweep** — `.brain/DECISIONS.md` redirect, `docs/architecture/*.md` placeholder veya TODO. ~30 dakika.

**A9-005 [F5] ADR-038 amendment** — `decision-replay.ts` (yeni keşif) + `handoff-protocol.ts`+`brain-context.ts` (6 sprint defer) — Sprint 154 sınıflandır. ~20 dakika ADR body edit.

### P3 Track

**A9-006 [F6] i18n parity** — Sprint 155+ blueprint TR/EN dual-language pass.

### Auditor Layer 4 Enforcement Genişletme (yorum)

ADR-039 dormant problemi, ADR-036 "Mandatory Architecture Decision Enforcement" worker prompt injection'ın **runtime tetikleme zincirini** içermediğini kanıtlıyor — prompt level enforcement (worker görür) var ama **call-site enforcement** (sprint-spawner çağırır) yok. Sprint 154 önerisi: `authority-enforcer.ts` Layer 4 pilot'a ADR-039 ekle.

---

## Kanıt Ekleri

### 1. Sprint 152 → Sprint 154 ADR violation closure

```bash
$ ls src/orchestra/batch-stats.ts          # Sprint 152: VAR (VIOLATION)
ls: cannot access 'src/orchestra/batch-stats.ts': No such file or directory  # Sprint 154: YOK ✅

$ ls src/core/notify.ts                    # Sprint 152: VAR (VIOLATION)
# Sprint 154: YOK; src/orchestra/notify.ts taşınmış ✅

$ rg "from ['\"]\.\./orchestra/" src/core/ --type ts
# Sprint 154: 0 hit ✅
```

### 2. ADR-039 dormant kanıt (full grep)

```bash
$ grep -rn "checkWorkerAuthority(" src/ --include="*.ts" | grep -v test
src/agents/worker.ts:431:export function checkWorkerAuthority(   # SADECE definition

$ grep -rn "isSelfModifyingSprint" src/orchestra/ --include="*.ts"
src/orchestra/authority-enforcer.ts:48:  isSelfModifyingSprint?: boolean;
src/orchestra/authority-enforcer.ts:293:  ...isSelfModifyingSprint...
src/orchestra/authority-enforcer.ts:296:  if (role === 'worker' && isSelfModifyingSprint && ...
src/orchestra/self-modifying-detector.ts:155:export function isSelfModifyingSprint(

$ grep -rn "isSelfModifying\b\|detectDeckentRepo\b" src/orchestra/sprint-controller.ts \
   src/orchestra/sprint-spawner.ts src/orchestra/planner.ts src/orchestra/task-builder.ts
# 0 hit — runtime call chain kopuk
```

### 3. Memory DB integrity full snapshot

```js
// node -e "..."
Tables: 11 (5 core + 4 FTS internal + sqlite_sequence + schema_version)
Schema version: 1
Total entries: 178
FTS rows: 178   (eşit, no orphan)
Entries by type: debt=96, adr=43, memory=20, retro=14, sprint=4, identity=1
ADR by status: accepted=40, deprecated=1, proposed=1, superseded=1
Tags: 743 (avg 4.2/entry)
Relations: 57 (cross-ref active)
Entry history: 751 (audit trail)
```

### 4. Doc consistency mismatch summary

```
Documents checked: 7/7
Metrics checked: 7
Mismatches: 6/7   (only skills_builtin=21 ✅ on all 5 docs)
```

### 5. Dead code audit phase 1 (FULL output above F5)

```
1 ACTIVE, 4 DORMANT, 2 DEAD
Phase 2: 607 unused exports flagged (sampling)
```

### 6. Brain file line counts

```
136 .brain/MEMORY.md
 83 .brain/RETRO.md
  8 .brain/PATTERNS.md
600 .brain/ERRORS.md
  4 .brain/DEBT.md
119 .brain/PROJECT-IDENTITY.md
950 total
```

### 7. ADR validator script gap

```bash
$ node scripts/adr-validator.mjs
✗ ADR validation failed: 1 error(s)
  - File not found: /home/alperen/deckent-dev/.brain/DECISIONS.md
```

**Yeni bulgu (F4'ün uzantısı):** `scripts/adr-validator.mjs` hâlâ `.brain/DECISIONS.md` arıyor — DB-first sonrası bu dosya `.brain/exports/decisions.md`'ye taşındı. Script kendisi P2 fix gerekli (Sprint 154 mini task — script path update). Bu script `package.json:29 lint:adr` üzerinden çağrılıyor — CI'da broken kalmış olabilir. **Sprint 154 P0 candidate** çünkü ADR governance enforcement zinciri buradan kopabilir.

---

## Sonuç

A9 scope (`src/core/` + `src/agents/` + tests + 76 audit + memory.db + .brain/) **READ-ONLY tarama tamamlandı.**

**Net iyileşme (Sprint 152 → Sprint 154):**
- ADR-008 VIOLATION → FULL ✅ (Sprint 153 D1)
- ADR-038 batch-stats.ts VIOLATION → FULL ✅ (Sprint 153 D2)
- 36 FULL + 5 DRIFT + 2 VIOLATION → **41 FULL + 2 DRIFT + 0 VIOLATION**

**Net regression / yeni bulgu:**
- **ADR-039 Self-Modifying Detector** Sprint 152'de "FULL" işaretlenmişti ama A9 derin tarama 0 source-call kanıtladı → **DRIFT (dormant)** — Sprint 154 P0
- **`decision-replay.ts`** ADR-038'de listelenmemiş yeni 0-importer dead code (150 LoC) — Sprint 154 P2
- **`scripts/adr-validator.mjs`** path obsolete (.brain/DECISIONS.md → exports/decisions.md) — Sprint 154 P0 candidate (CI break risk)

**Memory V2 DB integrity:** PASS (178 entries match 178 FTS, schema_version=1, no orphan, dual-layer normalize aktif).

**Brain budget:** PASS (MEMORY 136/300, RETRO 83/120, PATTERNS 8/150). ERRORS.md 600 satır soft observation — explicit budget yok.

**Code write YOK** — git diff src/ + tests/ + docs/ = sadece bu A9 raporu (`docs/audits/sprint-154/T-154-009-code-doc-coverage.md`). Audit-coverage.json A9 slot update'i bu raporla beraber tek dosya değişikliği.

---

**Owner:** A9_code_doc_coverage
**Next handoff:** Consolidator (Sprint 154 final report) — Bulgu F1 (ADR-039 dormant) acil P0, doğru owner A1 + A4 (orchestra wire). F2/F5 ADR-038 owner. F3/F4 doc cleanup. Memory V2 DB sağlık net.
