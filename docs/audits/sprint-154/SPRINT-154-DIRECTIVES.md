# DIRECTIVES — Sprint 154: Root Cause Fix + Pipeline Wire (DRAFT)

## Goal: Sprint 154 audit pass'inde keşfedilen 13 P0 bug'ı kapatmak — KESIN ROOT CAUSE (claude.json:ro mount), pipeline dead exports (A4), nervous half-loop (A7), ADR-039 dormant (A9), doc drift (A2/A3). Hedef: Sprint 144→153 boyunca yaşanan "worker timeout / 0 line yazma" pattern'inin **kalıcı** sonu, advanced features'un **gerçekten** koşması, Beta GA Gate konsensusu (BETA-TRACKER 12-15 ↔ ROADMAP 20 → tek schema). Tüm task'lar sonnet (mode=performance + haiku_allowed=false uyumlu).

**Audit referansı:** `docs/audits/sprint-154/EXECUTIVE-SUMMARY.md` + 10 T-154-NNN raporu.

---

## Task 1: 🔴 ROOT CAUSE — `.claude.json` mount `:ro` → `:rw`
- Model: sonnet
- Effort: low
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/spawn-backend-docker.test.ts, tests/e2e/docker-backend.test.ts
- Scope: src/orchestra/, tests/orchestra/, tests/e2e/

### Description
Sprint 144→153 boyunca yaşanan tüm "worker timeout, 0 line, NO_GO" pattern'inin TEK root cause'u: `spawn-backend-docker.ts:257` `~/.claude.json` dosyasını **read-only** mount ediyor. Claude CLI startup'ta config persistence için bu dosyaya yazmak istiyor → `EROFS: read-only file system` → CLI silent exit 0 → prompt API'ye hiç gitmiyor.

**Fix:** mount flag `:ro` → `:rw`. Tek satır.

**Ek E2E test (T-154 audit A1.F7 önerisi):** Mevcut `tests/e2e/docker-backend.test.ts` real Claude prompt assertion'ı skip ediyor → silent exit bug CI'da görünmez kalıyor. **Yeni test:** spawn → prompt deliver → 60s window'da `.tasks/<id>.result` dosyası yazılır + `linesAdded > 0` assert.

**Kanit:** `grep "claude.json:rw" src/orchestra/spawn-backend-docker.ts` → 1 hit; bir test container spawn et, `docker exec ... cat /tmp/deckent-home/.claude.json` write OK; e2e test pass
**Test:** 1 yeni test (spawn → prompt → result dosyası 60s window) + mevcut docker-backend.test.ts skipped assertion'ı aktive et

---

## Task 2: 🔴 docker logs canlı tee — `.tasks/*.log` post-mortem değil real-time
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-log-capture.test.ts (yeni)
- Scope: src/orchestra/, tests/orchestra/

### Description
A1.F2: Şu anki implementasyon container exit sonrası `docker logs` çağırıyor → container silindiyse "No such container" yazıyor (Sprint 153 kanıt). Doğru: spawn esnasında `docker logs -f <container> > .tasks/task-<id>.log &` veya `claude -p ... 2>&1 | tee .tasks/task-<id>.log` ile **canlı stdout capture**.

**Kanit:** `tail -f .tasks/task-XXX.log` worker çalışırken canlı satır ekleniyor; container silindikten sonra dosya intact
**Test:** 2 test (canlı capture, container exit sonrası dosya intact)

---

## Task 3: 🔴 Doc count drift universal sync (Sprint 153 T1 carry-over deepened)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: DECKENT.md, CLAUDE.md, README.md, README-TR.md, AGENTS.md, .deckent/workspace/IDENTITY.md, src/cli/commands/help.ts, src/mcp/tools/help.ts, src/mcp/server.ts (instructions block)
- Scope: docs/, src/cli/commands/help.ts, src/mcp/tools/help.ts, src/mcp/server.ts, .deckent/workspace/, top-level .md files

### Description
A2.F5 truth source RUNTIME-verified: **MCP=31 / CLI=46 / Built-in agents=15 / Skills=21 / Resources=8**. 6 farklı kaynak farklı sayılar diyor (DECKENT 22/49/16, IDENTITY 27/55+/15+3, CLAUDE 27, README 22, server.ts boot text 27, help.ts:48-71 22). Hepsini live truth ile senk et. **A2.F8** ek: `src/mcp/tools/help.ts:48-71` 22-tool list embedded → drift root, ya dynamically generate ya kaldır.

**Kanit:** `grep -rE "(22|23|27)\s*(MCP|tool)|49\+\s*CLI|16\s*built-in" docs/ src/ DECKENT.md CLAUDE.md README*.md AGENTS.md` → 0 hit (sadece yeni 31/46/15 kalsın); MCP server boot text canlı `tools/list` count ile match
**Test:** Yeni test gerekmez; mevcut tests/mcp/help.test.ts ve tests/cli/help.test.ts güncel sayıyı assert ediyor olmalı

---

## Task 4: 🔴 `dist/cli/entry.js` + `dist/mcp/server.js` chmod +x persist
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: scripts/copy-assets.mjs, package.json (postbuild hook), tests/scripts/copy-assets.test.ts (yeni)
- Scope: scripts/, package.json

### Description
A2.F6 + A3.F1: `npm run build` (tsc + copy-assets.mjs) sonrası bin dosyaları `-rw-r--r--` (644). `tsc` Unix mode bit'lerini propagate etmiyor. `copy-assets.mjs` chmod logic taşımıyor. **Fix:** `copy-assets.mjs`'e BIN_FILES sabit listesi + `chmodSync(p, 0o755)`. CI gate: `.github/workflows/ci.yml` Verify dist step'ine `test -x dist/cli/entry.js && test -x dist/mcp/server.js`.

```javascript
import { chmodSync } from 'node:fs';
const BIN_FILES = ['dist/cli/entry.js', 'dist/mcp/server.js'];
for (const f of BIN_FILES) {
  const p = join(ROOT, f);
  if (existsSync(p)) chmodSync(p, 0o755);
}
```

**Kanit:** `rm -rf dist && npm run build && ls -la dist/cli/entry.js dist/mcp/server.js` → `-rwxr-xr-x` her ikisi
**Test:** 1 unit test (post-build chmod check) + CI gate satırı

---

## Task 5: 🔴 forceModel tier-clamp bypass fix
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/model-selector.ts, src/orchestra/task-router.ts, tests/core/model-selector.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
A4.F1 + bu session keşif: DIRECTIVES `Model: haiku` parsing → `forceModel:haiku` task JSON'a yazılıyor → `model-selector.ts:215-221` early return ediyor (Layer 1b min_tier kontrolü line 268'e ulaşmıyor) → `haiku_allowed: false` config silently bypass. Fix: `forceModel` set olduğunda min_tier clamp uygula, bypass ise WARN ve clamp et.

**Kanit:** Test setup `haiku_allowed:false` + DIRECTIVES `Model: haiku` → routing reject veya clamp to sonnet
**Test:** 2 test (forceModel allowed bypass, forceModel blocked clamp)

---

## Task 6: 🔴 FIX phase timeout 600s → 1800s
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/fix-phase.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
A4.F2: `sprint-phases.ts:556` default `600_000` ms (10dk). Sprint 152+153 kanıt: opus FIX worker'ları yetişemedi. → `1_800_000` (30dk). Backward-compat: `fix_phase_timeout_seconds` config key.

**Kanit:** `grep "1_800_000\|1800000\|fix_phase_timeout" src/orchestra/sprint-phases.ts src/core/config-types.ts` → match
**Test:** 2 test (default value, config override)

---

## Task 7: 🔴 Wire dead pipeline exports (3 P0 birleştirilmiş)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-spawner.ts, src/orchestra/result-collector.ts, src/orchestra/result-evaluator.ts, src/orchestra/sprint-phases.ts, tests/orchestra/wire-validation.test.ts (yeni)
- Scope: src/orchestra/, tests/orchestra/

### Description
**A4.F3 + F5 + F11 birleşik fix.** Sprint 134-139'da yazılmış advanced features production'da hiç çağrılmıyor:
- `respawnEligibleTasks` (sprint-spawner.ts:361) → 0 caller — Wave 2 NO_GO için FIX retry yok
- `evaluateWithRubric` → `reconcileSpuriousNoGo` çağırmıyor — TIMEOUT_WITH_WORK partial-work recovery dead
- `applyCascadeToSprint` + `applyUnblockToSprint` (sprint-spawner.ts:681,739) → 0 caller — Sprint 139 cascade dead

**Fix:** `runSprint` EVALUATE/FIX path'ine wire et. ~50 LoC toplam (3 wire noktası).

**Kanit:** `grep -rn "respawnEligibleTasks\|reconcileSpuriousNoGo\|applyCascadeToSprint\|applyUnblockToSprint" src/orchestra/ | grep -v test | grep -v "^.*://"` → her biri en az 1 production caller
**Test:** 3 wire-validation test (her function'ın production path'ten çağrıldığını assert)

---

## Task 8: 🔴 Nervous System subscriber wire — observer → dispatcher/proposer/executor/history
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/nervous/observer.ts, src/nervous/dispatcher.ts, src/nervous/history.ts, tests/nervous/integration/full-pipeline.test.ts (yeni)
- Scope: src/orchestra/, src/nervous/, tests/nervous/

### Description
A7.F1: NervousObserver wired (Sprint 153 B1+B2) ama `'detection'` event 0 production subscriber. 11 sprint'te 0 `nervous-history.jsonl`. ADR-040 yarım çalışıyor. **Fix:** `runSprint`'e Dispatcher + HistoryStore instantiate + observer.on('detection', ...) wire. ~10 LoC.

**Kanit:** Sprint koşusu sonrası `ls .deckent/nervous-history*.jsonl` → en az 1 dosya; içerik geçerli `detection` event(ler)i
**Test:** 1 yeni full-pipeline test (observer → detection → dispatcher → history JSONL write)

---

## Task 9: 🔴 ADR-039 Self-Modifying Detector wire-up (12+ sprint dormant)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/agents/worker.ts, src/orchestra/task-builder.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/self-modifying-detector.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description
A9.F1: ADR-039 (Sprint 139 Task 51/52 +789 LoC) `checkWorkerAuthority()`, `isSelfModifyingSprint()`, `detectDeckentRepo()` — 0 production call site. `worker.ts:437` default `false`. Sprint 148 catastrophic-lesson kuralı runtime'da yok. **Fix:** `task-builder.ts`'de task creation aşamasında `isSelfModifyingSprint(scope)` çağır, true ise worker prompt'a self-modifying-warning inject + `worker.ts` startup'ta `checkWorkerAuthority()` enforce.

**Kanit:** `grep -rn "checkWorkerAuthority\|isSelfModifyingSprint" src/ --include="*.ts" | grep -v test` → en az 2 production caller
**Test:** Mevcut `self-modifying-detector.test.ts` 32 test pass + 1 yeni "production path call" assertion

---

## Task 10: 🔴 `scripts/adr-validator.mjs` path fix (DECISIONS.md → memory.db)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: scripts/adr-validator.mjs, package.json (lint:adr script ref)
- Scope: scripts/

### Description
A9.F4: `adr-validator.mjs` `.brain/DECISIONS.md` arıyor (Memory V2 migration sırasında silindi). `npm run lint:adr` silently failing — CI break risk. **Fix:** SQLite `memory.db` `getByType('adr')` query'sine geçiş, ADR format compliance check (status enum, title required, alternatives section).

**Kanit:** `npm run lint:adr 2>&1 | head -10` → "42 ADR audited" benzer çıktı (DECISIONS.md hatası yerine)
**Test:** Yeni unit test (adr-validator.test.ts) 1 fixture ADR ile

---

## Task 11: 🔴 Sprint reporter total task count fix
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
A4.F4 + bu session kanıt: CLAUDE.md sprint-reporter "Total Tasks: 6" yazdı (Sprint 153 11 task'lık idi, Wave 1 + Wave 2 + FIX). `sprint-phases.ts:564,569-570` `evaluations.size` FIX phase loop'unda overwrite ediliyor. Fix: snapshot count baseline + FIX retry'lar sayım'a katılmasın.

**Kanit:** Sprint 154 sonrası CLAUDE.md "Total Tasks: 13" (gerçek task sayısı) — Sprint 153 retro fix-edilmiş
**Test:** 2 test (Wave-only count, Wave + FIX count'a Wave katılmaz)

---

## Task 12: 🔴 BETA-TRACKER ↔ ROADMAP gate schema unification
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/BETA-TRACKER.md, docs/BETA-TRACKER-TR.md, docs/ROADMAP-GOD-LEVEL.md
- Scope: docs/

### Description
A10.F2: BETA-TRACKER 12-15 gate listesi ↔ ROADMAP-GOD-LEVEL 20 gate listesi tutarsız. ROADMAP "19/20 açıldı" diyor — doğru ama BETA-TRACKER'a göre yanlış görünüyor. Tek schema: BETA-TRACKER 20 gate'e expand et + ROADMAP referans olarak göster.

**Kanit:** `grep -c "^| #" docs/BETA-TRACKER.md docs/ROADMAP-GOD-LEVEL.md` → eşit gate sayısı (20)
**Test:** Yeni test gerekmez

---

## Task 13: 🔴 ADR-044 entry — Sprint 154 audit findings + Hot Fix with Subagents pattern (ADR-043 birleşik)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: scripts/adr-add-from-audit.mjs (yeni veya manuel SQL insert)
- Scope: scripts/, .brain/memory.db

### Description
Sprint 154 audit findings'i ADR-044 olarak memory.db'ye kalıcı kaydet (audit pattern documentation). Aynı zamanda Sprint 150A + 152.5 + 154 Hot Fix with Subagents pattern'i ADR-043'e ata. ADR-044 başlık: "Sprint 154 Comprehensive Audit — 10-Agent Parallel Pass + Pipeline Wire Validation Methodology". ADR-043 başlık: "Hot Fix with Claude Subagents — Pipeline-Bypass Repair Pattern".

**Kanit:** `sqlite3 .brain/memory.db "SELECT id, title, status FROM entries WHERE id IN ('adr-043','adr-044')"` → 2 satır accepted
**Test:** Yeni test gerekmez

---

## Stretch (zaman kalırsa) — P1 kümesi

Aşağıdakiler Sprint 154'e zaman kalırsa eklenir, yoksa Sprint 155 backlog:

- **A1.F4 + A5.F2** Dockerfile.worker `USER deckent` directive + `ca-certificates` install (security + cert chain)
- **A2.F1+F2+F3** memory query CLI + config read subcmd + nervous status CLI (parity gap kapanışı, KNOWN_ISSUES Sprint 153 carry-over)
- **A8.F3 + F4** SSE keepalive + `firstHeartbeatAt` field (Sprint 144-148 catastrophic kill cascade'in DOĞRUDAN sebebi)
- **A6.F1** `opus.apiId` 4-6 → 4-7 + 6 fixture/test cascade
- **A6.F3** `fallback_provider` config bootstrap warning (only-one-provider preflight)
- **A4.F8** `.claude/rules/*.md` doubled headings (auto-regen append bug)
- **A4.F9** `.deckent/decisions/` SDL writer wire (claimed 22 SDL, 0 written)

---

## Post-Sprint Verify Gate

Sprint 154 tamamlandığında **mecburi:**

1. **Live dogfood:** `deckent run "echo HELLO > src/test-sprint-154.ts" --provider claude` → src/'a dosya 60s'de yazıldı
2. **Sprint koşusu:** Bu DIRECTIVES'in P0 task'larıyla mini sprint başlat (3-4 task seç) → Wave 1 success rate ≥ %80 (Sprint 153'te %0 idi)
3. **Nervous evidence:** `ls .deckent/nervous-history*.jsonl` → en az 1 dosya `detection` event ile
4. **ADR-039 enforcement:** Test sprint'te self-modifying scope detect edildi (kanıtlı log)
5. **Dist chmod:** `npm run build && file dist/cli/entry.js` → "executable" mention
6. **Doc count:** `grep -E "27|22|49\+|16" DECKENT.md CLAUDE.md README*.md` → 0 hit

Hepsi pass → Sprint 154 GO. Herhangi biri fail → ROOT CAUSE re-investigation (ADR-035 verification protocol V1.0).

---

## Skill/Agent Assignment Tahmini

| Task | Assigned Agent | Skill |
|------|---------------|-------|
| 1, 2, 7, 11 | architect | typescript-expert, docker-expert |
| 3, 12, 13 | doc-writer | documentation-writer |
| 4, 10 | devops-engineer | typescript-expert |
| 5, 6 | architect | typescript-expert |
| 8, 9 | architect | typescript-expert |

---

**Önemli not:** Bu DIRECTIVES taslağı **Sprint 154 P0 budget'ı kapsamında**. P1 stretch listesi opsiyonel. Sprint 154 P0'lar fix edildikten sonra Sprint 155'e Beta GA Gate #13 (messaging) + P2 cleanup + P3 strategic alignment kalır.

**Tahmini wall-clock:** 13 P0 task × ~1-2 saat ortalama = 13-25 saat sprint runtime (max_workers=6, 2 wave). docker_max_timeout=36000 (10 saat) yeterli. Sprint başlatmadan önce Task 1 (claude.json:rw) **manuel** uygulanmalı çünkü sprint kendisi bu fix olmadan koşamaz (chicken-and-egg).
