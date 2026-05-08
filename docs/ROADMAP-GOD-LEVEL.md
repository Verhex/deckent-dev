# Deckent God-Level Roadmap — Sprint 149 → Sprint 200

**Created:** 2026-04-20 (Sprint 148 sonrası)
**Status:** CANONICAL — Sprint 149-200 anchor document
**Vision:** OpenClaw'ın god-level üstün hali — developer-first + life-assistant dual platform
**Brainstorming:** Alperen onayları 12+ karar, 5 paralel agent kod tabanı analizi
**Last update:** 2026-05-08 (akşam) — Sprint 162A Hot Fix Day — 8 orchestration bug closed (A/B/C/R2-R5/Stall) + 6-stack multi-language adapter pattern (ADR-047) + 3 ADR V2 amendment + 12-lang i18n + ARIA dashboard + per-change security review. ~305 yeni test, 69 file +2703/-801 LoC. **PARTIAL SUCCESS — live verification Bug X discovered**: dual-evaluator stale-state path race triggers fix-spawn cascade ~30min mark despite worker DONE. Sprint 162B = Bug X close + 5 R5-deferred sites + fix_phase_timeout gating. Sprint 161 baseline 87.5% false-NO_GO → Sprint 162 LIVE %0 internal mismatch + %16 external Bug X residual.
**Next audit:** Sprint 162B Bug X Hot Patch Wave + fixture digit-prefix migration + ADR-043 sub-agent loop discipline amendment + Sprint 162C documentation coherence + Sprint 162D library/security + Sprint 162E public-flip prep.

---

## ⚡ 2026-05-08 (akşam) Session Kapanış — Sprint 162A T4 Hot Fix Day + Bug X Discovery

### Sprint 162A — 8 bug closure + multi-language adapter (T4 god-level, ~20h wall-clock)

**Durum:** Sprint 161'in 8 orchestration bug'ı (A/B/C/R2-R5/Stall) Sprint 162A T4 hot fix bundle ile kapatıldı. Live verification (sprint-162-failed-build-race + sprint-162-live) PARTIAL SUCCESS: Sprint 161 deadlock + 87.5% false-NO_GO pattern'i kırıldı, AMA **yeni Bug X keşfedildi** (dual-evaluator stale-state path race ~30min mark trigger). Sprint completion'a doğal CLEANUP'a kadar gitti vs Sprint 161 stall.

### ADR-043 Hot Fix Pattern 4. uygulaması — Subagent-Driven Development scale up

13 CC subagent dispatch (8 paralel investigation + 5 sequential/paralel implementer):
- **Phase 1**: 8 paralel investigation subagent → 8 fix-spec markdown (~5248 LoC, ~261KB)
- **Phase 2 Wave 1** (orchestration + multi-lang): sprint-phases A+C+Stall (3 bug 1 file) + result-evaluator B + multi-lang adapter (6 stack) — 129 tests
- **Phase 2 Wave 2** (recovery): R2+R3+R4+R5 4-bug coherent integration — 41 tests + 4 event channels + MCP parity
- **Phase 2 Wave 3** (cross-cutting): 4 paralel subagent (event verify+ADR / 12-lang i18n / ARIA / security review) — 135+ tests
- **Phase 3** smoke: live verification Sprint 161 56-task replicate

### Bug X — yeni keşfedilen 9. bug (Sprint 162B P0)

**Live forensic**: 11 stable smoking-gun cases at ~30min mark in sprint-162-live. `task-NNN.result` shows `evaluationDecision=DONE` AND `task-NNN-fix.json` shows `reason="evaluated as NO_GO"` — paralel iki evaluator path race condition. Cost penalty: 84 fix.json final cascade triggered API quota exhaustion at 15:36Z (Sprint 162 ~10-12M token vs ~5M baseline = 2x cost).

### Multi-Language Adapter Pattern (ADR-047 NEW)

`src/core/lang/{types,stack-detector,test-runner-adapter,coverage-adapter,build-adapter,index}.ts` — 6 baseline stacks (TypeScript vitest, Python pytest+mypy/ruff, Go go-test, Rust cargo-test, Java junit, C#/.NET xunit). Coverage parsers per format (vitest JSON, coverage.py XML, go cover txt, tarpaulin XML, jacoco XML, opencover XML). Static `STACKS` registry + `assertSpawnSafe(bin, args[])` whitelist + ADR-006 spawnSync pattern preserved + SH_C_ALLOWED regex hardened beyond spec (rejects append-injection). Future stacks (Ruby, PHP, Elixir, Kotlin, Swift) extensible via STACKS append.

### Cross-cutting deliverables

- **ADR amendments (3 V2 + 1 NEW)**: ADR-035 V2 (synthetic result + spawn-liveness mandate), ADR-037 V2 (recover RBAC bounds + cache invalidation), ADR-039 V2 (cleanup discipline + plant preservation), ADR-047 NEW (multi-lang adapter contract). All in `.brain/memory.db`; `.brain/exports/decisions.md` regenerated.
- **8 yeni event-stream channel**: sprint.eval.heartbeat-skip / audit-rubric-applied / synthetic-timeout, BRAIN→AUDITOR:SPAWN_DEADLOCK_DETECTED, DECKENT→*:SPRINT_RECOVER_{STATE_RESET,ZOMBIE_KILLED,STATUS_SYNC,TMPFILE_SWEPT}
- **12-lang i18n**: en, tr, de, fr, es, it, pt, ru, ja, ko, zh, ar (66 tests, fingerprint regex enforces native content)
- **ARIA dashboard component** `OrchestrationEvent.tsx` (WCAG 2.1 AA, 18 tests; severity → role+aria-live mapping)
- **Per-change security review** `docs/security/sprint-162a-review.md` (632 words, 8 bugs + adapter)

### Live Verification — sprint-162-live (PARTIAL, quota-exhausted)

| Iteration | Result | Fix.json | Smoking gun | Active workers |
|-----------|-------:|---------:|------------:|---------------:|
| Iter 1 (15:05Z) | 17 | 0 | 0 | 6 |
| Iter 3 (15:13Z) | 25 | 8 | 8 | 6 |
| Iter 5 (15:21Z) | ~38 | 14 | 11 | 6 |
| Iter 6 (15:30Z) | 40 | 42 | 11 | 6 |
| Iter 7 (15:36Z post-quota) | ~44 | **84** | 11 stable | 0 (API fail) |

Sprint completed naturally to CLEANUP (Sprint 161'de bu mümkün değildi — deadlock'a düşüyordu). Smoking-gun count 11'de stable = Bug X single-shot batch trigger; 84 final = quota cascade fix-of-fix wave.

### Sprint 162B P0 backlog

1. **Bug X dual-evaluator stale-state path race** close
2. **fix_phase_timeout condition gating** (only-on-real-NO_GO)
3. **Subagent loop discipline ADR-043 amendment** (controller-side dispatch pattern, not sub-agent loop)
4. **Build-after-spawn race protection** (Brain pre-flight dist mtime check)
5. **5 R5-deferred sites** (mcp/tools/cleanup, archivePromptFiles, providers/claude, kill.ts, prompt-linter)
6. **4 fixture digit-prefix migration** (sprint-docs-cleanup × 2, brain-provider × 2)

### Beta GA Gate Durumu (2026-05-08 akşam — Sprint 162A sonrası)

| Gate | Sprint 161 audit | Sprint 162A |
|------|------------------|-------------|
| #11 Documentation sync | ⚠️ REGRESSION | (Sprint 162C target — Bug X close sonrası) |
| Pipeline Health (implicit) | ⚠️ REGRESSION | 🟡 **PARTIAL** — sprint completes naturally but Bug X cost penalty 2x |
| All other gates (#1-10, #12-20) | ✅ | ✅ |

**Beta GA blocker**: Bug X cost cascade. Sprint 162B fix → re-smoke → public-flip prep (Sprint 162C/D/E).

### Meta-Dogfood Kanıtları (Sprint 162A — yeni kayıt 8+)

1. **Subagent paralel pattern Sprint 154 10-agent'tan 1.3x ölçek** — 8 paralel investigation tek mesaj dispatch
2. **Build-after-spawn race ilk RCA**: dist mtime > sprint-state.json mtime + 22 saniye = Brain old code load (CLAUDE.md gotcha #1 yansıması Brain process'e)
3. **Bug X live discovery during smoke** — 30min batch trigger, single-shot, fingerprint stable (11 cases). Sprint 162A self-discovered next bug.
4. **Subagent loop architectural limit confirmed** — Lane 2 Sprint 161 + W1/W2/W3 Sprint 162-live aynı pattern (delegate + exit). Loop must be controller-side.
5. **Cost penalty per-bug quantified**: Bug X = 2x token consumption. Hidden cost behind "kalite" debt — token bleed eklenmeli ROI analysis'a.
6. **Org monthly usage limit hit live during dogfood** — 15:36Z'de Anthropic API quota tükendi, sprint mid-cascade. Bu kalıcı kayıt: Sprint 162B re-smoke için aylık reset bekle.
7. **ADR-047 (multi-lang adapter) introduce'da SH_C_ALLOWED regex spec hardening** — subagent'ı kendi spec'i daha sıkı hale getirdi (append-injection bloke). Spec contract reality-tightened canlı.
8. **Sprint 162-live finalize cleanup wiped `.tasks/` data** — Brain's CLEANUP phase aggressively deleted; archive empty. Sprint 162B P1: cleanup discipline preserve forensic at finalize.

### Audit Deliverables (Sprint 162A)

- `docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md` — design spec (T4 god-level)
- `docs/superpowers/plans/2026-05-08-sprint-162a-orchestration-repair-execution.md` — execution plan
- `docs/superpowers/specs/2026-05-08-sprint-162a-bug-{a,b,c,r2,r3,r4,r5,stall}-fix-spec.md` — 8 fix-spec
- `docs/superpowers/retros/sprint-162a-retro.md` — bu retro
- `docs/security/sprint-162a-review.md` — per-change security review
- 4 ADR (035 V2 / 037 V2 / 039 V2 / 047 NEW) in `.brain/memory.db`

---

## ⚡ 2026-05-08 (sabah) Session Kapanış — Sprint 161 God-Audit + Orchestration Discovery Day

### Sprint 161 — 56-Task Three-Lane God-Audit + Live Brain Break (~4h 20m)

**Durum:** Sprint 161 pre-beta-GA architectural audit olarak planlandı. Üç paralel lane çalıştı; **Lane 1 28/56 task tamamladı** (worker tarafından), **Lane 2 (3 monitor) ve Lane 3 (10 deep-dive) tamamlandı**. Sprint 161 kendisi ise **mid-flight FAILED** — Brain orchestration broke (false NO_GO synthesis + recover failures + spawn loop deadlock). Audit verisi tam yakalandı; Sprint 162 hot fix gerekli.

**Üç-lane mimari (yeni god-audit pattern, Sprint 154'ten daha geniş):**
- **Lane 1 — 28 deckent worker audit raporu** (T-161-001..028): src/core, src/orchestra, src/cli granular slices. **READ-ONLY** sınırı %100 korundu (A2/A3 monitor doğruladı; sıfır kaynak ihlali).
- **Lane 2 — 3 CC monitor raporu** (A1/A2/A3): live sprint sırasında Brain rubric, worker honesty, auditor authority izlendi. A2 nihai snapshot 28 finalized, **0 P0 dishonest, 11 P2 minor format gap**. A3 phase transitions clean (SPAWN→EXECUTE→FIX gözlemlendi).
- **Lane 3 — 10 CC deep-dive raporu** (D1-D9 + D5b): node_modules deps, dist/src drift, ADR cross-reference, library version (context7), doc pollution, public-repo migration triage, fixture references, Memory V2, .deckent/.brain/ structural, security surface.

### Bulgu sayıları (toplam ~356 finding, kabaca P0/P1/P2/P3 dağılımı)

- **P0:** ~20 (orchestration repair + recover + ADR-038 dormant + ADR-005 sync I/O contradiction + ADR-010 1-vs-7 deps + identity drift + deckent-hub misplacement + jobs/ leak + generator-asymmetry + sprint-stall)
- **P1:** ~88 (high — Sprint 162 hot fix + library migration + Memory V2 fixes + sprint-controller regrowth + dual evaluateResult)
- **P2:** ~142 (medium — drift, dead exports, type asymmetry)
- **P3:** ~106 (low — hygiene, naming, doc style)

### Mimari Sürprizler (Sprint 161 audit tarafından keşfedildi)

1. **Brain Orchestration BROKE Live (NEW Sprint 154-class regression)** — 87.5% false NO_GO rate (49/56 tasks Failed by Brain when worker self-assessment was DONE for all 28 finalized). Üç ayrı bug:
   - **Bug A** (`sprint-phases.ts:492-525`): premature evaluate sentezler NO_GO heartbeat-blind
   - **Bug B** (`quality-assessor.ts` + `result-evaluator.ts`): rubric mismatch READ-ONLY audit task'larını code-writing rubric'iyle skorluyor
   - **Bug C** (`sprint-phases.ts:492-525`): synthetic result selfAssessment NO_GO yerine TIMEOUT_WITH_WORK olmalı (ADR-035 verification protocol)

2. **`deckent recover` All-Four-Assertions Failed** — Sprint 161 kill sırasında recover komutu dört kritik kontrolde başarısız (R1 archive-claim ghost düzeltildi: aslında `.tasks/archive/sprint-161/`'e archive ediyor, sadece path yanlış lookup'tı; yine de R2/R3/R4 geçerli):
   - **Bug R2**: sprint-state.json reset edilmedi (hâlâ EXECUTE/ACTIVE; manual `deckent cleanup` sonrası temizlendi)
   - **Bug R3**: zombie Brain pid (286601) öldürülmedi (bash exit ile self-cleared, ayrı bir tedbir gerekli değil ama recover bunu garanti etmemeli)
   - **Bug R4**: `deckent status` display lag (0/49 gösterdi recover sonrası)
   - **Bug R5 (yeni)**: recover task-NNN.* artifacts'leri archive eder ama `.worker-*.sh` + `.prompt-*` tmpfiles **sweep ETMEZ** (Sprint 160 cleanup discipline asymmetry'sinin recover path'inde tekrarı; manuel `rm` gerekti)

3. **Bug Sprint-Stall** (`sprint-controller.ts`/`sprint-spawner.ts`/`result-collector.ts`): FIX phase transition sonrası 41 fix task queue'da, **>1 saat sıfır worker spawn**. docker ps boş, tmux ls boş. Spawn loop sessizce deadlock'landı.

4. **D5a — 701 .md drift universe** — `docs/ROADMAP-GOD-LEVEL.md` Block E "388 .md review" claim, gerçek 701 working / 1,261 incl. analysis archives. 7 P0 contradictions: CLI count 46/48/55+, MCP tools 31/27, sprint pointer 4-5 stale, MCP resources 8/6, ADR injection 42/45 (5 active ADR worker prompt'lara enjekte EDİLMİYOR), root vs docs CHANGELOG drift, root CoC vs docs/launch CoC. **Sprint 154 T-010 archival 7 sprint geç** (NEXT-SESSION-PROMPT.md, SYSTEM-MIGRATION-2026-04-22.md, DECKENT-TEST-REPORT.md hâlâ root'ta).

5. **D6 — Sprint 160 Generator-Consumer Asymmetry SILENTLY NO-OP** — Sprint 160 T-001 fix consumer'ları `.prompt-task-*`/`.worker-task-*` literal'a daralttı; **generator'lar bu prefix'i HİÇ ÜRETMİYOR** (Docker `.prompt-${taskId}-${hash}.txt`, `.worker-${taskId}.sh`; tmux `.prompt-${randomHex}.txt`). Live evidence: `.tasks/.worker-161-001.sh`. Plant-survival testleri pass çünkü BOTH plants AND real task files atlanıyor — Sprint 160 fix sadece "şanslıca" plant koruyor, gerçek task sweep'i kırık. Plus `mcp/tools/cleanup.ts` Sprint 160 ile birlikte güncellenmedi → CLI/MCP parity violation (ADR-022-V2).

6. **D3 — ADR Dormancy 22 Sprint Overdue** — ADR-038 Kademe 2 mandate (`@deprecated` + DEFERRED-marker) `handoff-protocol.ts` (152 LoC) + `brain-context.ts` (268 LoC) için **EXECUTE EDİLMEDİ**. Her iki dosya 0 importer ile diskte; Sprint 145 reassessment deadline 16 sprint geç. Plus ADR-005 deprecated ama 804 sync I/O site hâlâ aktif; ADR-010 "tek dependency: commander" claim, gerçek 7 prod dep; ADR-022-V2 sayım `19/19` claim, gerçek 28/56; ADR-035 backward-compat Sprint 142 milestone 19 sprint geç; ADR-042 status `proposed` ama Sprint 149/150'de shipped.

7. **D4 — Library Migration Debt** — Zod v3/v4 split (5 file v3, çoğunluk v4); `feature-query.ts:7` MCP boundary risk; `task-builder.ts:67` deprecated `result.error.format()`; React 19 `forwardRef` 3 dashboard primitive'inde soft-deprecated; `@modelcontextprotocol/sdk@1.27.1 -> 1.29.0` patch-bump 5 P2 advisory'yi kapatır; `happy-dom@20.8.4` 2 high CVE (CVSS 7.5+8.8) — wanted 20.9.0 patch.

8. **D9 F13 HIGH — Shell Injection Surface in Worker-Verify** — `worker-verify.ts:127,254` ve `mid-sprint-adapter.ts:228,258,284` template-literal ile shell command oluşturuyor. `.tasks/` poison'lanırsa scope.directories üzerinden metacharacter injection mümkün. Migration: shell-string template literal'dan `(bin, args[])` form'a (shell parsing bypass) — ADR-006 ruhuna align.

9. **D7 — Memory V2 Decay Dead** — `decay_after_sprints=20`, current=160 ⇒ <140 entries decay-eligible. Bulgu: 11 entry decay-eligible ama deleted_at=NULL (mem-132..139 + sprint-log-136..139). **Decay never ran on memory/sprint types**. ADR/identity exempt korundu — yani exempt-flag wiring çalışıyor ama active-decay path hiç tetiklenmemiş. Bonus: `mem-134` missing (132, 133, 135 var) — Sprint 134 retro extensively referenced in ADR-008 → muhtemelen veri kaybı.

10. **D8 — Identity Drift Across 5 Files** — CLAUDE.md / DECKENT.md / `.deckent/workspace/IDENTITY.md` / `.brain/PROJECT-IDENTITY.md` / `.deckent/config.json` **HİÇBİRİ AYNI METRİĞE SAHİP DEĞİL**. Sprint number 5 farklı yer 5 farklı sayı (155 / 155 / 155 / 160 / 161). Agent count 15/15/15+3/16/18. MCP tools 31/31/27/22/N. Bonus P0: `ci-baseline.json` `testFailed=24, coverage=0` — Sprint 161 yellow-flag review olmadan başlamamalıydı.

### Yeni ADR'lar (45→47 önerilen)

- **ADR-045 (önerilen Sprint 162)** "Minimal-but-justified Runtime Dependencies" — ADR-010 supersede. 7 prod dep + per-dep rationale + gating policy.
- **ADR-046 (önerilen Sprint 162)** durum: ADR-035'in dual-state alternative path'i (file-based + event stream both kanonik) açıklaması.

### Sprint 162 Hot Fix Theme

Sprint 162 = **Sprint 161 audit hot fix wave + public-flip prep** (Sprint 154 pattern devamı, 3rd uygulama). 24 task projeksiyon:
- 8 task **Theme 1+2** kritik path (orchestration + recover repair) — opus tier
- 5 task **Theme 4** doc pollution P0 (D5a fix)
- 4 task **Theme 5** Memory V2 fixes (D7 + D8)
- 5 task **Theme 3** ADR amendments (010/038/005/042/035)
- 4 task **Theme 6** library migration (zod, MCP SDK patch, React forwardRef, happy-dom)
- 1 task **Theme 7** D9 F13 HIGH security migration
- 1 task **Theme 8** dist/test-marker cleanup (D2-F5)
- 3 task **Theme 9** .gitignore extensions (D5b P0 — `.test-e2e-sprint-*/`, `deckent-hub/`, `.deckent/jobs|sprint-*-*/`)
- 1 task **Theme 10** D6 generator naming alignment (Plan A — generator + 5 consumer site + linter + doc)

**Tahmini effort:** 6 high-opus + 12 normal-sonnet + 6 low-haiku. ~12-16 saat worker zamanı + ~2-4 saat operator review. Theme 1+2 önce (performance mode), sonra 4+5+9 (balanced mode), en son 6+8+10 (economic mode).

### Beta GA Gate Durumu (2026-05-08 Sprint 161 sonrası)

| # | Gate | Sprint 154 sonu | Sprint 161 audit sonrası |
|---|------|------------------|---------------------------|
| #1-12 | Build/test/MCP/CLI/Memory etc. | ✅ | ✅ (audit window'da regression yok) |
| #11 Documentation sync | ✅ Sprint 154 T3 | ⚠️ **REGRESSION** — D5a 7 yeni P0 contradiction; auto-regen script henüz yok |
| #13 Messaging trio smoke | 🟡 token bekleniyor | 🟡 (eternal — Pazar) |
| #14 Dockerfile USER non-root | ✅ | ✅ (D9 F2 doğruladı; Dockerfile.worker Sprint 162 audit pending) |
| #15 DeckentHub 20 seed signed | ✅ | ✅ |
| #16-20 | ✅ | ✅ |
| Implicit: Pipeline Health | ✅ Sprint 154 LIVE dogfood | ⚠️ **REGRESSION** — Sprint 161 mid-flight broke (Bug A/B/C/R2-R5/Stall); Sprint 162 hot fix sonrası re-test gerekli |

**Sprint 161 sonrası Beta GA için kalan gate:** Sprint 162 hot fix wave (orchestration repair + recover repair + identity-drift cleanup) **BLOCKER**. Sprint 162 sonrası kontrollü smoke sprint ile pipeline-health re-validation, sonra public-flip.

### Sprint 161 Marked FAILED (orchestration broke mid-flight)

Sprint 161 **FAILED** olarak işaretlendi — Brain controller mid-flight broke (yukarıdaki Bug A/B/C/R2-R5/Stall canlı kanıt). **Audit verisi (28/56 worker raporu + 3 monitor + 10 deep-dive) tam yakalandı**, retro yazılmadı (sprint normal `RETRO -> DECAY -> CLEANUP` akışını tamamlayamadı). Sprint 162 hot fix wave'i bu boşluğu kapatacak ve Sprint 161 ile kullanılan 3-lane god-audit pattern'i resmi olarak ADR-044'e ek (`Sprint 161 Three-Lane Pattern`) olarak eklenecek.

### Meta-Dogfood Kanıtları (Sprint 161 — yeni kayıt 7+)

1. **Üç-lane paralel audit pattern Sprint 154 10-agent pattern'in 3.8x'i** (28 worker + 3 monitor + 10 deep-dive = 41 raporu eşzamanlı yakalama)
2. **READ-ONLY discipline %100 korundu** (A2/A3 monitor + Lane 1 worker self-assessment + post-audit git diff cross-validation üçü de doğruladı)
3. **Lane 2 monitor'lar Brain bug'ını LIVE yakaladı** (A2 28 finalized DONE vs Brain 49 Failed = 87.5% false NO_GO; sprint-bug döngüsünün **dogfood evidence kaynağı**)
4. **D6 deep-dive Sprint 160 fix'in NO-OP olduğunu kanıtladı** (live filesystem evidence: `.tasks/.worker-161-001.sh` matches generator output, NOT consumer literal `.worker-task-*`)
5. **D3 cross-reference 5 dormant ADR + 4 status drift** (Sprint 154'ün ADR-038/039 wire-fix'i intact ama Kademe 2 disposition gap 22 sprint overdue)
6. **D8 5-file identity disagreement** (proje hakkındaki en temel sayılar bile reproducible source-of-truth'tan değil → manual sync failing → automation kaçınılmaz)
7. **In-flight discovery: kendi pipeline'ı kırıldı sprint çalışırken** — Sprint 161 audit pre-beta-GA validate edecekti, validate ederken broke → audit veri yine kullanılabilir → meta-resilience kanıtı (audit-tarafı survive etti, orchestration-tarafı düştü)

### Audit Deliverables (Sprint 161 consolidator output)

- `docs/audits/sprint-161/EXECUTIVE-SUMMARY.md` — top-down + 30 P0 master table (379 satır, 27.8 KB)
- `docs/audits/sprint-161/MIGRATION-TRIAGE-MATRIX.md` — file-class triage (~735 MIGRATE / ~1,265 KEEP-PRIVATE / ~205 DELETE / ~17 UNCERTAIN)
- `docs/audits/sprint-161/PUBLIC-REPO-MIGRATION-PLAN.md` — Sprint 162+ public-flip ordered manifest (5-phase + 14-step validation)
- `docs/audits/sprint-161/SPRINT-162-DIRECTIVES-DRAFT.md` — 24-task DIRECTIVES.md draft (655 satır)
- `docs/audits/sprint-161/ROADMAP-PATCH.md` — patch source (bu içerik buradan uygulandı)
- `docs/audits/sprint-161/T-161-001..028-*.md` — 28 worker audit reports
- `docs/audits/sprint-161/cc-monitor/{A1,A2,A3}-*.md` — 3 monitor reports
- `docs/audits/sprint-161/cc-deepdive/D{1,2,3,4,5a,5b,6,7,8,9}-*.md` — 10 deep-dive reports

---

## ⚡ 2026-04-21 Session Kapanış — Sprint 150 + Hot Fix Özeti

### Sprint 150 Final Metrikler (1h 20m)
- **37/41 task DONE (%90)** — 38 orijinal + 3 FIX (T-008/013/021 re-try)
- **4 NO_GO:** T-150-008/022/028 "verification-blind" pattern (Brain evaluator rubric bug) + T-150-008 fix döngüsü
- **tsc:** PASS (0 error sprint sonunda)
- **vitest:** delta 5 fail (gate FAIL) ama baseline 104 fail
- **0 boundary violation, 0 honesty violation**
- **+8032 / -227 LoC**
- **Code churn:** 38 task → 11 meta-dogfood kanıt (Sprint 148 rekoru 6, 2x artış)

### Hot Fix with Claude Subagents (Session 1, ~68 dakika)
Deckent kırık haliyle Deckent'i tamir etme sonsuz döngü riskinden kaçınmak için Alperen direktifiyle Claude Code subagent'lar ile cerrahi müdahale yapıldı:

| # | Hot Fix | Süre | Sonuç |
|---|---------|-----:|-------|
| **H1** | CLI `skill publish` duplicate fix | 3 dk | 49 CLI komut geri geldi (tüm `deckent *` broken idi) |
| **H2** | Vitest triage + fix | 33 dk | **104 → 9 fail** (Gate %99.5 aşıldı → %99.94) |
| **H3** | Config sadeleştirme tam | 5 dk | Flat providers silindi, retention+rotation defaults eklendi |
| **H4** | T-150-035 retention runtime wire | 2.5 dk | 17 sprint → 10, archive canlı, forensic taşındı |
| **H5** | T-150-030 rotation runtime wire | 4 dk | metrics.jsonl 268KB → 0, 15x gzip compression |
| **H6** | DECKENT→USER:NOTIFY wire + Nervous bridge | 12.5 dk | 5 lifecycle hook + CLI+MCP+File adapters + nervous bridge canlı |
| **H7** | Rebuild + MCP restart + canlı test | 8 dk | **`ℹ️ [deckent] Task H6 DONE` terminal'e yazıldı — ilk canlı DECKENT→USER:NOTIFY kanıtı** |

**Toplam:** ~1M token, 145+ file, +6047/-5473 LoC, **Beta GA Exit Gate'lerin 17/20'si açıldı**.

### 3 Yeni MCP Tool Canlı Deploy (Sprint 150 T-029/032)
- `deckent_audit` — Brain Self-Audit Gate user-facing
- `deckent_feature_query` — Feature Manifest runtime query (16 active feature)
- `deckent_recover` — Crash recovery user-facing (orphan cleanup + stale lock + archive)

### Meta-Dogfood Kanıtları (Sprint 150 + Hot Fix)
13 canlı kanıt, Sprint 148 rekoru 6'dan 2.2x artış:
1. T-150-008 scope sanitizer `.gz` false positive sprint içinde fix
2. T-150-033 safety-point stale sprint-149 bug kendi implementasyonuyla çözüldü
3. T-150-030 event stream stuck 27 event bug — kodu yazıldı
4. T-150-028 orphan IPC 0 count canlı kanıt (preflight cleanup)
5. T-150-036 managed-docs-cache.json git-untrack canlı
6. T-150-035 retention canlı tetiklendi (sprint boundary trigger)
7. Sprint 149 paradoksu (27/27 fake DONE vs Sprint 150 gerçek 37/41)
8. Worker `coverage=0` rubric schema ihlali (Sprint 151 T-151-NEW-D)
9. T-150-034 config flat provider removal yarım kalıp H3 ile tamamlandı
10. T-150-007 Docker HB fix Sprint 146-148 debt tamamen kapanmadı (vitest timeout kayboldu H2 sonrası)
11. T-150-029 `scripts/sync-manifest.mjs` canlı 16 active feature listeledi
12. Gate.json generation pipeline canlı (sprint-150-gate.json yazıldı)
13. **Sprint 139 T-041 DECKENT→USER:NOTIFY kanalı 12 sprint ölü kaldıktan sonra H6+H7 ile canlandı** — Alperen terminal'inde `ℹ️ [deckent] Task H6 DONE` okundu

### Sprint 151 P0 Debt (Hot Fix ile Taşınan)
| Debt | Kaynak | Sprint 151 Task |
|------|--------|-----------------|
| Vitest 9 residual fail (config-sprint064 + error-handling whitelist) | H2 kalan | T-151-NEW-E (minor fix) |
| Brain evaluator verification-blind + global build race + rubric schema | Sprint 150 retro | T-151-NEW-D |
| Docker HB 3-sprint debt (vitest timeout cascade) | Sprint 146-148-150 | T-151-NEW-G |
| MODE_PRESETS duplicate (`config.ts:84-105` vs `mode-presets.ts`) | H3 opsiyonel scope | T-151-NEW-H (opsiyonel) |
| `src/orchestra/task-mode-runner.ts` bare `throw new Error` whitelist | Sprint 150 T-003 | T-151-NEW-D kapsamı |
| `fix-of-fix` retry spawn ama execute edilmedi (max_fix_retries=1 limit) | Sprint 150 FIX phase | T-151-NEW-D-3 FIX context enrichment |

---

## ⚡ 2026-05-07 Session Kapanış — Sprint 154 Hot Fix Day (TARİHİ AN)

### Sprint 154 — Comprehensive Audit + 13 P0 Hot Fix (~2 saat audit + ~75dk fix)

**Durum:** Sprint 144→153 9-sprint kronik "worker timeout / 0 line yazma" bug zinciri **KESIN OLARAK ÇÖZÜLDÜ**.

**KESIN ROOT CAUSE bulundu:** `src/orchestra/spawn-backend-docker.ts:257` `~/.claude.json:ro` mount → claude CLI startup'ta `EROFS: read-only file system` hatası → silent exit 0, prompt API'ye hiç gitmiyor. **1 satır fix** (`:ro` flag kaldır).

**LIVE Dogfood Kanıt:**
- Sprint 153 (claude.json:ro): 17 worker × 47dk × **0 line** yazma
- Sprint 154 fix sonrası: 1 worker × **52sn** × 1 dosya yazma (`src/test-sprint-154-marker.ts`)

### Comprehensive Audit Pass (10-agent paralel, ~2 saat)
- **A1 docker-runtime / A2 cli-mcp-parity / A3 build-artifact / A4 lifecycle-edge / A5 security / A6 multi-provider / A7 nervous-system / A8 dashboard-api / A9 code-doc-coverage / A10 vision-direction**
- 273 file explicit claim (ilk 10-agent paralel pass), 87 finding (13 P0 + 21 P1 + 30 P2 + 23 P3)
- 3739 satır audit content, ~1.3M token
- Rapor: `docs/audits/sprint-154/T-154-001..010-*.md` + `EXECUTIVE-SUMMARY.md` + `SPRINT-154-DIRECTIVES.md` + `audit-coverage.json`

### Hot Fix with Claude Subagents (3rd uygulama, ~75dk)
Sprint 150A + 152.5 pattern devamı — Deckent kendi kendisini fix edemediği için Claude Code subagent ile cerrahi müdahale (claude.json:ro chicken-and-egg).

| Wave | Commit | İçerik | Approach |
|------|--------|--------|----------|
| **A** | `9b91405` | T1 .claude.json:rw (ROOT CAUSE) + T4 chmod +x persist + T6 FIX timeout 600→1800s + T10 adr-validator path | Direct Edit (single-line fixes) |
| **B** | `1014065` | T5 forceModel tier-clamp + T7 3-export wire (respawnEligibleTasks/applyCascade/Unblock + reconcileSpuriousNoGo) + T8 nervous subscriber wire + T9 ADR-039 wire | 4 paralel general-purpose subagent |
| **C** | `2aaeae7` | T2 docker logs canlı tee + T3 doc count drift sync (8 file) + T11 sprint reporter -fix filter + T12 BETA-TRACKER ↔ ROADMAP gate schema unify | 4 paralel general-purpose subagent |
| **D** | `b388d7d` | T13 ADR-043 + ADR-044 insert (Memory V2 DB-first) + audit deliverables commit + memory exports regenerate | Direct + script |
| **cleanup** | `5645951` | Sprint 153 reporter artifacts archive + Sprint 154 dogfood marker + 117 file cleanup | git add -A |

### Mimari Sürprizler (P0 yeni — Sprint 154 audit tarafından keşfedildi)
1. **Sprint Pipeline Advanced Features DEAD** (A4): `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint`, `reconcileSpuriousNoGo` (rubric path) — 0 production caller. Sprint 134-139'da yazılmış ama runSprint asla çağırmıyordu. Wave B T7'de wire edildi (~50 LoC sprint-phases.ts + 5 LoC sprint-controller.ts).
2. **Nervous System Half-Loop** (A7): NervousObserver Sprint 153 B1+B2 wired AMA `'detection'` event 0 production subscriber. Dispatcher/HistoryStore production'da hiç instantiate edilmemiş, 11 sprint × 0 `nervous-history.jsonl`. Wave B T8'de wire edildi (~60 LoC).
3. **ADR-039 Self-Modifying Detector 12+ Sprint Dormant** (A9): `checkWorkerAuthority()` 0 production call site. Sprint 148 catastrophic-lesson kuralı runtime'da yok'tu. Wave B T9'da wire edildi (~40 LoC task-builder + worker.ts).
4. **forceModel Tier-Clamp Bypass**: DIRECTIVES `Model: haiku` `haiku_allowed: false` config'i silently bypass ediyordu — Wave B T5'te clamp eklendi.

### Yeni ADR'lar (43→45)
- **ADR-043** Hot Fix with Claude Subagents — Pipeline-Bypass Repair Pattern (Sprint 150A + 152.5 + 154 üçüncü uygulama)
- **ADR-044** Sprint 154 Comprehensive Audit Methodology — 10-Agent Parallel Pass + Pipeline Wire Validation

### Meta-Dogfood Kanıtları (Sprint 154 — yeni kayıt 5+)
1. Audit 10-agent paralel dispatch ile root cause bulundu (Sprint 152 audit verification-blind nedeniyle yanlış sayım sonucu kapatamadı)
2. A4 derin tarama 4 fonksiyonun production'da çağrılmadığını kanıtladı (Sprint 134-139 advanced features illusion)
3. A7 11 sprint × 0 nervous-history.jsonl → ADR-040 yarım çalışıyordu
4. A9 ADR-039 12+ sprint dormant — Sprint 152 audit yüzeysel "FULL" demişti
5. A10.F8 meta-irony: `feedback_break_sprint_bug_cycle.md` "yeni audit önerme" kuralı çiğnendi ama gerekçeli (Sprint 152 listeleme, Sprint 154 kanıt+fix)
6. **LIVE dogfood:** `deckent run` 52sn × 1 dosya yazma — pipeline LIVE kanıtı (Sprint 153 0 line vs)

### Beta GA Gate Durumu (2026-05-07 Sprint 154 sonrası)
| # | Gate | Sprint 153 sonu | Sprint 154 sonu |
|---|------|-----------------|-----------------|
| #1-12 | Build/test/MCP/CLI/Memory etc. | ✅ | ✅ |
| #11 Documentation sync | 🔄 partial | ✅ Sprint 154 T3 (doc count drift universal sync) |
| #13 Messaging trio smoke | 🟡 token bekleniyor | 🟡 (eternal — Pazar) |
| #14 Dockerfile USER non-root | ✅ | ✅ (T8 ile bütünlendi — A5.F2 backlog) |
| #15 DeckentHub 20 seed signed | ✅ Sprint 153 E | ✅ |
| #16-20 | ✅ | ✅ |
| **Implicit: Pipeline Health** | (varsayılan) | ✅ **Sprint 154 LIVE dogfood — kanıtlı** |

**Sprint 154 sonrası Beta GA için kalan gate:** Sadece **#13 (messaging trio smoke)** — Pazar token bekleniyor. Long-term **#3 coverage** Phase 2.

---

## ⚡ 2026-05-06 Session Kapanış — Sprint 152 + 152.5 + 153 Partial

### Sprint 152 — Post-Migration Audit (2026-04-24, ~45 dk, 27 audit raporu)
- 30 opus task, ~45 dk, **27 rapor** (`docs/audits/sprint-152/T-152-001..027.md` ~500KB)
- Brain retro metrikleri yanıltıcı (8/36 DONE → aslında 27 DONE) — Brain rubric `verification-blind` bug canlı yakalandı (meta-dogfood)
- 86 bulgu: 42 PASS + 18 DRIFT + 12 FAIL + 8 MISSING + 6 PARTIAL
- Kapsam: doctor deep audit, CLI/MCP lifecycle + observational + nervous + resources, memory V2 integrity, 11 nervous detector, provider health, docker backend, dashboard, ADR compliance, tsc/vitest baseline, auto-memory loss impact, self-modifying detector, skills/agents routing, debt envanter, Beta GA gates, hotfix pattern, Phase 2 readiness

### Sprint 152.5 — Hot Fix Day (2026-04-24, ~2 saat, Claude subagent pattern)
4 Beta GA blocker fix (Sprint 150A pattern devamı — Deckent pipeline bypass):
| Fix | Etki |
|-----|------|
| **HF1** Docker worker GLIBC 2.38 mismatch | `node:22-slim` → `node:24-trixie-slim` (glibc 2.41) — Memory V2 DB container'da 176 entry canlı |
| **HF2** Brain verification task filter | `isVerificationTask` `filesChanged=[]` → `srcChanges=[]`. Audit task'lar artık DONE değerlendiriliyor |
| **HF3** Rules silent catch | `rule-generator.ts` DB fail silent catch kaldırıldı — rules dosyaları korunur |
| **HF4** MCP dry-run provider | `start.ts:bootstrapProviders(config)` — CLI/MCP parity |

### Sprint 153 — CI Greening + Node 20 + D Batch + Dogfood (2026-05-05/06, ~6 saat)
**Yapılan iş:**
- **CI Greening** — `.npmrc:ignore-scripts=true` → `npx node-gyp rebuild --release` step (9 job). Workflow ilk tam yeşil.
- **Vitepress fix** — blog YAML quote + srcExclude expansion (audits/, superpowers/, design/, governance/, sprint-log/, vision/)
- **`orphan-cleaner-ipc` negative ageMs** — `Math.max(0, …)` 2 call site
- **`archive-debt` test isolation** — mock `memory.db` false döndürüyor, dev DB state'inden bağımsız
- **Node 18 drop + exhaustive purge** — `engines: ">=20.0.0"`, matrix `[20.x, 22.x, 24.x]`, 36 dosyada Node 18 izleri silindi (kod + test + script + doc + i18n + mock)
- **D1 ADR-008** — `notify.ts` core → orchestra (5 caller + 2 test import güncellemesi). Layer 4 enforcement clean.
- **D2 ADR-038** — `batch-stats.ts` + tests silindi (334 LoC, 0 consumer)
- **D3 promotion-pipeline** — `temp-temp-` double-prefix bug fix (baseId normalize)
- **D4 commander unknown subcmd** — exit 1 + help (CI false-pass riski kapandı)
- **Coverage Report continue-on-error** — vitest worker timeout flakiness için
- **Docker backend timeout result clarity** — `on_exit()` bash trap `.timeout` marker detect ediyor, "HIT WORKER_TIMEOUT — increase --timeout or split scope" hint hem `TIMEOUT_WITH_WORK` hem `NO_GO` notes'a ekleniyor

**Meta-dogfood kanıtları (Sprint 153):**
1. CI fix sırasında lokalde `node_modules/.bin/tsc` 0-byte zombie keşfedildi — `npm run lint` çalışıyor (npm internal resolution) ama `npx tsc` sessizce sıfır exit ediyor — local-only quirk, CI fresh install'da yok
2. Sprint 152 audit 27/30 task DONE ama Brain `8/36 DONE 28 NO_GO` raporladı — verification-blind bug Sprint 152.5 HF2 ile fixlendi (canlı meta-dogfood)
3. **Deckent Run Dogfood Timeout Bulgusu (yeni):** 3 paralel `deckent_run` audit task'ı (Node 18 cleanup verification) `docker_min_timeout=1200s` cap'ine takıldı. Workers infrastructure %100 sağlam çalıştı (3 docker container, heartbeat sequence düzenli, cleanup OK), ancak Claude CLI tüm src/+tests/+scripts/+.github/ taraması + grep + markdown rapor yazımını 20dk'ya sığdıramadı. Bu bulgu kendisi yeni bir Sprint 153 P1 debt: `deckent run`'a `--timeout-seconds` veya `--effort` parametresi.
4. Timeout marker dosyası mevcut ama `.result` notes'unda fark edilmiyor → Sprint 153 docker-backend fix (yukarıda)

### Sprint 153 — Gerçekleşen İş (TÜMÜ ✅)
- **CI Greening ✅** — 14 commit batch (224618c → 2f7f7d8). `.npmrc:ignore-scripts=true` + `npx node-gyp rebuild --release` step (9 job). Workflow ilk tam yeşil weeks of red sonrası.
- **Vitepress fix ✅** — blog YAML quote + srcExclude expansion (audits/, superpowers/, design/, governance/, sprint-log/, vision/, ROADMAP-GOD-LEVEL, KNOWN_ISSUES)
- **`orphan-cleaner-ipc` negative ageMs ✅** — `Math.max(0, …)` 2 call site (CI ext4/tmpfs precision rounding fix)
- **`archive-debt` test isolation ✅** — mock `memory.db` false döndürüyor, dev DB state'inden bağımsız
- **Node 18 EOL drop ✅** — `engines: ">=20.0.0"`, matrix `[20.x, 22.x, 24.x]`, 36 dosyada exhaustive purge (kod + test + script + doc + i18n + mock + runtime guard)
- **D1 ADR-008 ✅** — `notify.ts` core → orchestra (5 caller + 2 test import). Layer 4 enforcement clean.
- **D2 ADR-038 ✅** — `batch-stats.ts` + tests silindi (334 LoC, 0 consumer)
- **D3 promotion-pipeline ✅** — `temp-temp-` double-prefix bug fix (baseId normalize)
- **D4 commander unknown subcmd ✅** — exit 1 + help (CI false-pass riski kapandı)
- **Coverage Report continue-on-error ✅** — vitest worker timeout flakiness için
- **Docker backend timeout result clarity ✅** — `on_exit()` bash trap `.timeout` marker detect ediyor, "HIT WORKER_TIMEOUT — increase --timeout or split scope" hint hem `TIMEOUT_WITH_WORK` hem `NO_GO` notes'a ekleniyor
- **B1+B2 Nervous Observer wire ✅** — `runSprint` `NervousObserver` instantiate + start + stop (5 cleanup path covered). 11 detector config schema sync (5 orphan `reserve_for: sprint-148` placeholders silindi → 6 implemented detector eklendi: `task_mode_idle`, `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly`, `scope_collision_rate`, `notification_delivery_health`). 1,300+ LoC dormant kod canlandı.
- **B3 Wire end-to-end test ✅** — `tests/nervous/integration/observer-wire-end-to-end.test.ts` (5/5 pass). eventBus → observer → 'observe' → 'detection' pipeline kanıt. Listener registration arity 2, idempotent start, clean stop.
- **E Ed25519 keygen + 20 seed sign + install verify ✅** — `scripts/sign-seed-skills.mjs` 20/20 seed skill imzaladı (gerçek hex signatures, placeholder `ed25519:placeholder:awaiting-t149016-keygen:0000…` format silindi). `verifySkillSignature` helper + `skill install` verify wire (lazy keypair load). `--allow-unsigned` flag opt-out. **Beta GA Gate #15 açıldı.** Hub public key: `6850ed2fdfd6fb185d80ee6f747176a54da7f2bea9f1c5f95b41855c5554795f`.
- **`deckent run` timeout/effort param ✅** — MCP tool yeni `effort` (low/normal/high) + `timeoutSeconds` (60-7200) input fields. `brainEstimateTimeout` plumbing. Sprint 153 dogfood'dan gelen P1 kapandı.
- **Local 0-byte bin onarımı ✅** — `npm rebuild` ile `node_modules/.bin/{tsc,vitest}` symlink restore. Lokal feedback loop geri geldi (zombie 0-byte bin `npm run lint`'i sessizce geçiriyordu — Sprint 153 audit'inde 2 gerçek TS error gizlemişti).

### Sprint 154 — Yarına Devam Eden İş
- **A1+A2 Telegram/Discord smoke** — token Pazar (~2026-05-10) bekleniyor. Kod hazır (`scripts/deploy-{telegram,discord}.sh`). Sprint 152.5 HF4 sonrası MCP/CLI provider parity canlı.
- **Sprint 153 finalize + retro** — Brain `deckent retro` çıktısı; B3 wire kanıtı + tüm Sprint 153 commit'leri arşiv'e
- **B3 production-driven detector log evidence** — wire kanıt (test) tamam; gerçek sprint koşusunda detector 'detection' event'lerinin event-stream JSONL'a yazıldığını gözlem
- **`deckent_run` timeout cap audit re-run** — yeni `effort: 'high'` + `timeoutSeconds: 3600` ile 3 paralel Node 18 cleanup verification dogfood'u re-koş (önceki 20dk cap'e takılıp NO_GO almıştı, yeni override hazır)
- **Phase 2 takvim revizyonu (opsiyonel)** — orijinal 152-160 aralığı slipped (152 = audit, 152.5 HF, 153 = CI/Node/B/E). Phase 2 plan tablosu (Section 4) realite ile güncellenmeli

### Beta GA Gate Durumu (2026-05-06)
| Gate | Durum (Sprint 152.5 sonrası) | Sprint 153 etki |
|------|------------------------------|-----------------|
| #2 vitest pass rate | ✅ PASS (CI 716 test files yeşil) | Doğrulandı |
| #4 27+ MCP tool | ✅ 30 tool | — |
| #5 45+ CLI komut | ✅ 49 | — |
| #11 Documentation sync | 🔄 Partial → ROADMAP+CHANGELOG güncellendi | İlerleme |
| #13 Messaging trio smoke | 🟡 Token bekleniyor (Pazar) | A1+A2 deferred |
| #15 DeckentHub 20 seed signed | ✅ 20/20 imzalandı (`scripts/sign-seed-skills.mjs`), install verify canlı | Sprint 153 E ile açıldı |
| **CI Workflow Health** (yeni implicit gate) | ✅ İlk yeşil run weeks of red sonrası | Sprint 153 |

---

---

## 1. Vizyon Özeti

Deckent = **Sprint Mode** (developer orchestrator, GO/NO-GO disiplin) **+ Task Mode** (günlük life assistant, OpenClaw benzeri) birleşik platform. Config-driven (`deckent_style: "sprint" | "task"`) tek mode aktif, user tercih eder.

**OpenClaw benchmarkı** (Kasım 2025 launch → 346K star / 5 ay / %20 malicious skill):
- Deckent **daha olgun** başlıyor (%99.12 test coverage, 41 ADR, 148 sprint discipline)
- Deckent **daha güvenli** (AST sandbox + Ed25519 signature)
- Deckent **eşit hızda evrimleşmeli** (post-launch bug fix frenzy = community building)

**Beta GA hedef:** Sprint 150 Perşembe 23 Nis 2026 TRT — `v1.0.0-beta.1`

**God-level GA hedef:** Sprint 200 (~6 ay sonra, Ekim-Kasım 2026) — `v1.0.0` stable

---

## 2. Anchor Kararlar (Alperen Onaylı)

### 2.1 Mode Architecture
- **Config key:** `deckent_style: "sprint" | "task"` (kod kelimesi çakışması önlemek için `style`)
- **Single mode aktif** — dual değil, config ile toggle
- **2-layer user ayarı**: `~/.deckent/config.json` global + `./project/.deckent/config.json` project override (mevcut ADR-004 3-layer merge üzerine)
- **CLI**: `deckent mode task` / `deckent mode sprint` / `deckent mode auto` (context-detect)

### 2.2 Hub Repo
- **Ayrı repo**: `VerhexIO/deckent-hub` (OpenClaw ClawHub pattern parity)
- **20 seed skill** Sprint 149 (spotify-control, telegram-bot, calendar-google, email-imap, weather-forecast, rss-reader, web-scraper, github-issues, slack-notifier, notion-sync, todoist, spotify-playlist, youtube-downloader, reddit-fetcher, twitter-post, screenshot-vision, file-organizer, currency-converter, translator, discord-moderator)
- **Signing**: Ed25519 (Deckent'in OpenClaw %20 malicious sorununa yanıtı)
- **`deckent skill publish`** — sign + push to registry

### 2.3 Messaging Trio
- **Discord** (developer community, local bot kurulumu)
- **Telegram** (genel user, Türkiye'de popüler)
- **WhatsApp** (hazırlık scaffold, aktivasyon Business API onayı sonrası)
- **Local-first**: User kendi bot API key `.deck` file'a yazar veya ENV'den ref verir

### 2.4 Public Repo Açılışı
- **`VerhexIO/deckent`** repo hazır Sprint 149 sonu
- Sprint 150 Alperen manual flip — göz kontrolü sonrası public

### 2.5 Milestone-Gated Features
- **Voice (STT/TTS)**: 10K GitHub star sonrası (Sprint 171-180)
- **Mobile app**: 50K GitHub star sonrası (Sprint 181-200)
- **Cloud hosted**: v1.0 GA sonrası opsiyonel

### 2.6 Güvenlik Prensibi
- **AST sandbox** zorunlu (zaten var, OpenClaw'da yok)
- **Ed25519 signature** zorunlu (Sprint 149 yeni)
- **`.deck` secret file** — hiç commit olmaz, interpolation ile config'e ref
- **Dockerfile non-root** — USER directive zorunlu (Sprint 149 fix)
- **OpenClaw %20 malicious antitheziyiz** — pazarlama mesajımız

---

## 3. Kod Tabanı Gap Analizi (Sprint 148 sonrası)

### 3.1 Hazırlık Oranı

| Alan | Hazır % | Gerekçe |
|------|---------|---------|
| Messaging/Connectors | **20%** | Provider+dispatcher pattern var, 0 adapter |
| Hub/Skill Marketplace | **75%** | Sandbox+registry-client+install CLI var, Ed25519+separate repo eksik |
| Config & Mode Toggle | **95%** | 3-layer merge+env+.deck hepsi var, sadece `deckent_style` key ekleme |
| Security + .deck | **85%** | P0 4/5 kapalı (shell/path/memory.db/API auth), Dockerfile root+.deck interpolation eksik |
| Nervous + Dashboard + Daemon | **80%** | 5 detector+SSE+heartbeat-daemon var, chat tab+`deckentd`+Electron yok |
| **GENEL HAZIR** | **71%** | God-level'e sandığımızdan yakın |

### 3.2 Reuse Edilecek Mevcut Altyapı (ZATEN VAR)

**Messaging:**
- `src/core/provider.ts:32-82` — ProviderAdapter interface (template)
- `src/nervous/dispatcher.ts:40-42` — ChannelAdapter (extend)
- `src/core/notification-dispatcher.ts:30-34` — NotificationAdapter (outgoing Discord/Slack)
- `src/api/server.ts:283-545` — HTTP server + Zod + rate limiter

**Hub:**
- `src/core/marketplace/skill-sandbox.ts:70-168` — AST sandbox (eval, Function, child_process, fs, process.env blok)
- `src/core/marketplace/registry-client.ts:1-79` — RegistryClient HTTP/HTTPS
- `src/cli/commands/skill.ts:286-454` — `skill install <source>` (git + SHA256)
- `src/orchestra/promotion-pipeline.ts:12-74` — PromotionPipeline
- `src/core/credentials.ts:54-241` — AES-256-GCM

**Config:**
- `src/core/config.ts:636-812` — 3-layer merge
- `src/core/deck-file.ts:1-199` — `.deck` format (11 known keys, gitignore enforcement)
- `src/core/global-config.ts:17-74` — `~/.deckent/` erişim

**Security:**
- Sprint 143-144'te kapalı: shell injection (tmux.ts), path traversal (validators.ts), memory.db (.gitignore), API auth (auth.ts)

**Nervous + Dashboard:**
- `src/nervous/detector-registry.ts:1-120` — 5 active + extension pattern
- `src/dashboard/src/pages/*` — 6 page React+Vite+Tailwind
- `src/api/server.ts:416-428` — SSE `/api/events`
- `src/cli/commands/run.ts` + `src/mcp/tools/run.ts:19-112` — `deckent run` one-shot
- `src/orchestra/heartbeat-daemon.ts:1-120` — heartbeat daemon

### 3.3 TAMAMEN YENİ — Yazılacak

**Sprint 149 (Çar 22 Nis) — 27 task, ~1450 LoC yeni:**
- Block A: `deckent_style` config key (5-6 satır modif)
- Block B: Dockerfile USER + `.deck` interpolation (~150 LoC)
- Block C: `src/connectors/` 6 module Discord+Telegram+WhatsApp+pool+router (~800 LoC)
- Block D: Ed25519 + VerhexIO/deckent-hub repo + 20 seed skill (~400 LoC)
- Block E: Doc consolidation (388 .md review)
- Block F: ADR-041 accept + npm publish dry-run v1.0.0-beta.1

**Sprint 150 (Per 23 Nis) — Beta GA:**
- npm publish v1.0.0-beta.1
- Dashboard ChatPage.tsx (7. page)
- deckent-hub public flip
- Discord + Telegram bots canlı

---

## 4. Sprint 149-200 Master Roadmap (2026-04-21 güncellendi)

### Phase 1: Beta GA Launch (Sprint 149-151)
**Hedef: Solid launch + community preview**

| Sprint | Gün | Tema | Task | Çıktı | Durum |
|--------|-----|------|------|-------|-------|
| **149** | Pzr 20 Nis | Hybrid Foundation — attempt 1 | 27 task | FAİL (DIRECTIVES kayboldu), attempt1 arşivi | ❌ FAİL |
| **150** | Pzr 20 Nis (re-run) | Hybrid Foundation + Debt Liquidation + 2026-04-21 Konsolidasyon | 38 task (8 block × 7 wave) | 37/41 DONE (%90), 4 NO_GO, 17/20 Beta GA gate açıldı, +8032 LoC, 13 meta-dogfood kanıt | ✅ DONE |
| **150A** | Sal 21 Nis | 🔧 **HOT FIX WITH CLAUDE SUBAGENTS** (Deckent kırıkken) | 7 hot fix (H1..H7) | CLI düzeldi, vitest %99.94, retention+rotation+notification wire canlı, DECKENT→USER:NOTIFY ilk kanıt | ✅ DONE |
| **151** | Çar 22 Nis | 🚀 BETA GA CUTOVER v1.0.0-beta.1 + P0 Residual Debt | ~13-15 task | npm publish + public repo flip + Discord/Telegram launch + T-NEW-A/B/C/D/E/F/G residual fix | ⏳ Plan |

**Hot Fix Session (Sprint 150A — 2026-04-21):**
Sprint 150 kırık haliyle Deckent'le Deckent'i tamir sonsuz döngü riskinden kaçınmak için Alperen direktifiyle Claude Code subagent'lar ile cerrahi müdahale. 7 hot fix, ~68 dakika, ~1M token, 145+ file, +6047/-5473 LoC. Canlı kanıt: `ℹ️ [deckent] Task H6 DONE` Alperen terminal'inde göründü — DECKENT→USER:NOTIFY 12 sprint sonra canlandı.

### Phase 2: Post-Launch Bug Frenzy + Messaging (Sprint 152-160)
**Hedef: Community feedback + messaging ecosystem + hub growth**

**Realite (2026-05-06 itibarıyla):** Orijinal takvim slipped — Phase 2 ilk üç sprint sürpriz iş yutuldu (post-migration audit, HF day, weeks-of-red CI greening). Aşağıdaki tablo gerçekleşeni + revize edilmiş forward planı yansıtır.

| Sprint | Gün | Tema | Durum |
|--------|-----|------|-------|
| **152** | **Per 24 Nis (gerçek)** | **Post-Migration Audit — 27 rapor + 86 bulgu** | ✅ DONE (orijinal "Community Bug Triage" → audit'e dönüştü, 30 task ~45dk) |
| **152.5** | **Per 24 Nis (gerçek)** | **Hot Fix Day — 4 Beta GA blocker** (Claude subagent pattern, 2nd uygulaması) | ✅ DONE (HF1 GLIBC, HF2 verification-blind, HF3 rules silent catch, HF4 MCP provider parity) |
| **153** | **Pzt 5-6 May (gerçek)** | **CI Greening + Node 20 + D batch + B Nervous wire + E Ed25519 hub sign + run-param** | ✅ DONE (14 commit, ilk tam yeşil CI run, Beta GA Gate #15 açıldı) |
| **154** | **Çar 7 May (gerçek)** | **🔥 HOT FIX DAY (3rd uygulama) — 10-agent comprehensive audit (87 finding) + 13 P0 fix (4 wave)** — KESIN ROOT CAUSE: claude.json:ro mount → silent EROFS exit. LIVE dogfood: 52sn × 1 file (Sprint 153: 47dk × 0 line). ADR-043 + ADR-044 yeni. Pipeline LIVE. | ✅ DONE (5 commit chain, +6037 / -94 LoC, 45 ADR, mimari kemikler production'a bağlı) |
| **155** | **Çar 7 May (gerçek)** | **Multi-Provider Runtime Hardening** — runtime fallback chain (429/capacity-aware respawn) + adapter-side `provider_auth.mode` enforcement + model registry stale-while-revalidate refresh + Sprint 154 retro/memory sync | ✅ DONE (4/5 tasks 23min, 0 tech debt, +2301/-32 LoC, 1 NO_GO Codex BLOCKED-external; commits `c31cf51`+`729cba3`) |
| **156** | **Çar 7 May (gerçek)** | **Gemini Sprint Dogfood — Hidden Bug Hunt #1** — 3 doc/audit task `worker_provider=gemini`; ilk Gemini sprint orchestration testi → `isAvailable()` Sprint 154 regression açığa çıktı (API-key-only check). Plus prompt-template + result-collector hardcoded `provider:claude` injection bulundu. | ✅ DONE (3/3 tasks DONE; 1 hidden bug fixed `60566eb`; Sprint 156 sonucu: gerçek dogfood validation = öngörülmemiş bug bulma yaratıcı bir araç) |
| **157** | **Çar 7 May (gerçek)** | **Routing Hotfix — Hidden Bug Hunt #2** — `resolveTaskModel` provider-default `'claude'` + `sprint-planner` `src.provider` hop drop ikinci bug zinciri. DIRECTIVES `Model: gemini-2.5-flash` planner çıktısında `sonnet` oluyordu. Live dry-run kanıt: post-fix Model column gemini-2.5-flash gösteriyor. **`docs/development/auth-surface-checklist.md` (7 surface) yeni doc**. | ✅ DONE (commit `b4df0e2` fix + `c14a1fc` docs; ADR-046 in-DB) |
| **158** | **Çar 7 May (gerçek)** | **Provider Labeling + File Lifecycle Hotfix — Hidden Bug Hunt #3** — `prompt-god-template:291` + `result-collector:73` task.provider hardcoded → worker prompt "provider: MUST be claude" injection; `spawn-backend-docker:706` over-aggressive `.worker-*.sh` cleanup; Docker workers hiç `.plan` yazmıyor (worker.ts dead code); `.prompt` mid-sprint deletion mystery (static analiz çözemedi → Sprint 159 empirical). Sprint 158 dogfood + 6/7 bug fix. | ✅ DONE (3 fix commit: `e1a47a1`+`932356f`+`6b39ac3`; tasks 158-003 ilk doğru gemini-labeled DONE) |
| **159** | **Çar 7 May (gerçek)** | 🎯 **İlk Mixed Claude+Gemini Production Sprint** — auth-surface 7→9, `--refresh-models` doctor flag wire, `deckent metrics summary` CLI, README/CHANGELOG TR/EN normalize. **3 Claude (sonnet/opus reasoning-heavy) + 2 Gemini (flash large-context doc-friendly)** — fallback chain ilk production stress test (Gemini quota 429 hit'i fallback claude'a swap edecek senaryosu). Sprint 159 başında `detectGemini`/`detectCodex` legacy 8th routing bug fixed (`7bec80b`). | ⏳ PLANLANDI (5 task, ~30dk hedef) |
| 160 | ~Per 8 May (revize) | Sprint 159 retro + Bug 4 (.prompt mid-sprint deletion) empirical validation + Telegram/Discord canlı smoke (Pazar token bekleniyor) + B3 production detector log evidence | ⏳ Plan |
| 161 | ~Cum 9 May | Hub Growth — 20 → 50 skill + moderation CI + rating system | ⏳ Plan |
| 162 | ~Pzt 12 May | Feature requests triage + routing V4 + skill heuristics | ⏳ Plan |
| 163 | ~Sal 13 May | Adaptive agent activation (analiz → öneri + autonomous apply) | ⏳ Plan |
| 164 | ~Çar 14 May | DeckentHub moderation queue + CI auto-signature + Ed25519 key rotation | ⏳ Plan |
| 165 | ~Per 15 May | Messaging polish + thread management + user context memory | ⏳ Plan |
| 166 | ~Cum 16 May | CLI/MCP parity audit + i18n TR/EN gaps + docs site | ⏳ Plan |

### Phase 3: Daemon + Local AI + Polish (Sprint 161-170)
**Hedef: 7/24 background operation + local model support**

| Sprint | Tema | Anahtar Çıktı |
|--------|------|---------------|
| 161 | `deckentd` daemon wrapper | systemd/launchd service files, PID management |
| 162 | Electron tray (optional) + desktop app scaffold | macOS/Linux tray icon |
| 163 | Local LLM (Ollama) integration | Ollama adapter + config |
| 164 | Groq + Fireworks + Together AI adapters | litellm proxy pattern |
| 165 | Embeddings (OpenAI + Voyage + local) | RAG-ready skill context |
| 166 | SWE-bench benchmark run + publish score | competitive positioning |
| 167 | Monorepo support (multi-project sprint) | workspace-aware planner |
| 168 | Template gallery (DIRECTIVES library) | 20 project template |
| 169 | Blog post + tutorial campaign | 10 long-form content |
| 170 | 1st month retrospective + 10K star push | Hacker News/Twitter round 2 |

### Phase 4: Voice + Intelligence (Sprint 171-180)
**Gate: 10K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 171-173 | STT (Whisper) adapter + wake word (Porcupine) |
| 174-176 | TTS (OpenAI Voice + ElevenLabs) + real-time streaming |
| 177-178 | Voice-activated sprint commands |
| 179-180 | Voice UX polish + accessibility |

### Phase 5: Mobile (Sprint 181-200)
**Gate: 50K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 181-185 | React Native iOS/Android MCP client |
| 186-190 | Push notifications (APNs + FCM) |
| 191-195 | Mobile-specific skills (Contacts, GPS, camera) |
| 196-200 | v1.0.0 stable GA — "God-level üstün" launch |

---

## 5. Beta GA (Sprint 151) Exit Criteria — 20 Gate (BETA-TRACKER + Sprint 150 Konsolidasyon)

**Durum (2026-05-06 Sprint 153 sonrası): 19/20 açıldı** ✅ — kalan tek gate #13 messaging trio smoke (token Pazar)

| # | Gate | Hedef | Mevcut | Durum |
|---|------|-------|--------|-------|
| 1 | `tsc --noEmit` 0 errors | 0 | 0 error | ✅ PASS |
| 2 | vitest ≥ %99.5 pass | 99.5%+ | **%99.94** (9 fail / 15671 pass) | ✅ **H2 ile aşıldı** |
| 3 | Coverage ≥ 85% | 85%+ | ~%52 (uzun vadeli, Sprint 160+) | 🔄 Phase 2 (uzun) |
| 4 | 27+ MCP tool functional | 27+ | 30 (yeni: audit/feature_query/recover) | ✅ PASS |
| 5 | 45+ CLI komut functional | 45+ | 49 (H1 sonrası) | ✅ PASS |
| 6 | `npm pack --dry-run` temiz | 0 warning | 1.08MB, 0 warning | ✅ T-150-026 |
| 7 | Cross-platform 3/3 | 3/3 | 3/3 | ✅ Sprint 148 |
| 8 | Multi-provider 3/3 | 3/3 | 3/3 | ✅ Sprint 148 |
| 9 | `deckent_style` toggle canlı | sprint/task switch | canlı | ✅ T-150-001..003 |
| 10 | Memory V2 stress test | Pass | Pass | ✅ Sprint 145 |
| 11 | Documentation sync | Current | Sprint 153 sonu — ROADMAP+CHANGELOG+SPRINT-LOG+IDENTITY+CLAUDE.md güncel | ✅ Sprint 153 |
| 12 | Built-in Bundle (npm pack) | 15+21 bundle | 36/36 bundle'da | ✅ T-150-031 P0 |
| 13 | Messaging trio smoke test | Discord+Telegram canlı | Token Pazar (~10 May) bekleniyor, kod hazır | 🟡 Sprint 154 |
| 14 | Dockerfile USER non-root | non-root | USER deckent | ✅ T-150-005 |
| 15 | DeckentHub 20 seed skill | 20 published + signed | **20/20 imzalandı** (`scripts/sign-seed-skills.mjs`), `skill install` verify wire canlı | ✅ Sprint 153 E |
| 16 | Config duplicate removal | ✅ | Flat providers silindi | ✅ H3 |
| 17 | Managed-docs cache git-untrack | ✅ | git-untrack | ✅ T-150-036 |
| 18 | docs.json private/public split | ✅ | template + runtime split | ✅ T-150-037 |
| 19 | Metrics.jsonl rotation | rotate | 268KB → 0, gzip archive | ✅ H5 canlı |
| 20 | Sprint file count ≤ 60 | ≤ 60 | 17 → 10 sprint (54 file) | ✅ H4 canlı |

**Sprint 153 sonu Beta GA için kalan tek gate (excluding long-term #3 coverage):** #13 (messaging trio smoke) — Telegram + Discord bot token Pazar (~2026-05-10) bekleniyor, kod %100 hazır. WhatsApp Business API onayı external dependency, Sprint 154+ aktif olur.

**Implicit gate (Sprint 153'te eklendi):** **CI Workflow Health** ✅ — 3 workflow (CI, Cross-Platform E2E, Build and Deploy Docs) ilk tam yeşil run weeks-of-red sonrası. better-sqlite3 native binding pipeline + Vitepress build + 4 silent test bug fix kombinesi.

---

## 6. Taşınan Debt (Sprint 148 → 149 → 150 → 151)

### Sprint 148 → 149 (tarihsel)
8 item: Docker HB + scope sanitizer + auditor stale + Dockerfile root + .deck interpolation + test-writer kalıntı → hepsi Sprint 149/150 tarafından kapatıldı.

### Sprint 150 → 151 (Hot Fix sonrası kalan)

| Debt | Öncelik | Kaynak | Sprint 151 Task |
|------|---------|--------|-----------------|
| Brain evaluator verification-blind (filesChanged=0 → false NO_GO) | **P0** | Sprint 150 retro (T-008/022/028) | **T-151-NEW-D** 5-in-1 rubric fix |
| Worker coverage field missing (rubric 4D → max 75/100) | **P0** | Sprint 150 retro schema gap | **T-151-NEW-D-2** |
| FIX task context enrichment (brain NO_GO gerekçesi yok) | **P0** | T-008 fix döngü | **T-151-NEW-D-3** |
| Global build race (sprint-ortası TSC fail → rubric düşüşü) | **P0** | T-028 pre-existing errors | **T-151-NEW-D-4** |
| Scope compliance heuristic relaxation (T-007/T-009 scope=0) | P1 | Sprint 150 retro | **T-151-NEW-D-5** |
| Vitest 9 residual (config-sprint064 `claude_backend` + error-handling whitelist) | P1 | H2 kalan | **T-151-NEW-E** |
| MODE_PRESETS duplicate (`config.ts:84-105` vs `mode-presets.ts`) | P2 | H3 opsiyonel scope | **T-151-NEW-H** (opsiyonel) |
| Docker HB + vitest timeout debt 3-sprint spiral | P0 | Sprint 146-148-150 | **T-151-NEW-G** |
| CLI 49 komut tam smoke test harness | P1 | Alperen direktif | **T-151-NEW-C** |

**Toplam:** 9 P0/P1 debt → Sprint 151'e entegre. Beta GA cutover 8 roadmap task ile birlikte **~13-15 task Sprint 151 DIRECTIVES**.

---

## 7. Rekabet Konumu — OpenClaw vs Deckent

| Kriter | OpenClaw (Nis 2026) | Deckent (Nis 2026) | Değerlendirme |
|--------|---------------------|---------------------|---------------|
| GitHub star | 346K (5 ay) | 0 (launch bekleyen) | OpenClaw momentum 🏆 |
| Mevcut skill | 44K (%20 malicious) | 21 built-in + 20 seed | OpenClaw scale, Deckent quality 🏆 |
| Target audience | Life assistant (genel user) | Developer + life dual | Deckent geniş 🏆 |
| Security | AST eksik, %20 malicious skandal | AST sandbox + Ed25519 | Deckent 🏆 |
| Multi-provider | 200+ LLM | 3 provider + 13 model | OpenClaw 🏆 |
| Voice/Speech | ✅ macOS/iOS/Android | ❌ yok (10K star sonrası) | OpenClaw 🏆 |
| Mobile | ✅ | ❌ (50K star sonrası) | OpenClaw 🏆 |
| Messaging | WhatsApp/iMessage/SMS | Discord+Telegram+WhatsApp | Eşitleniyor 🤝 |
| Sprint discipline | ❌ ad-hoc | ✅ GO/NO-GO + rubric | Deckent 🏆 |
| Self-healing nervous | ❌ reactive | ✅ 5 detector proactive | Deckent 🏆 |
| Test coverage | ? bilinmiyor | %99.12 (15256 test) | Deckent 🏆 |
| Memory system | Session state | DB-first SQLite FTS5 i18n | Deckent 🏆 |
| ADR governance | ❌ yok | ✅ 41 ADR MADR v3 | Deckent 🏆 |

**Deckent'in rekabet stratejisi:** "Open source, AST-sandboxed, disciplined alternative to OpenClaw — developer-first ama hayat asistanı olabilir."

---

## 8. Pazarlama Mesajları (Sprint 150 Launch)

### Ana Tagline Adayları
1. **"The AI orchestrator OpenClaw never built — for developers who want discipline."**
2. **"148 sprints. 99.12% test coverage. 0 malicious skills. Open source."**
3. **"Deckent: Sprint Mode + Task Mode. Developer + Life Assistant. One platform."**

### USP (Unique Selling Points)
- **Sprint Discipline**: GO/NO-GO gates + rubric grading (hiçbir rakipte yok)
- **Nervous System**: Proactive detector (Deckent sees problems before you do)
- **AST Sandbox**: Zero malicious skills (OpenClaw %20 problem çözümü)
- **Multi-Provider Freedom**: Claude + Codex + Gemini (vendor lock-in yok)
- **Memory V2**: SQLite FTS5 dual-layer i18n (Turkish + English + German %100 recall)
- **Dual Mode**: Sprint (developer) + Task (life assistant) single platform
- **148 Sprint Battle-Tested**: solo dev disiplin + public evolution

### Launch Kanalları (Sprint 150 Perşembe 10:00 TRT = 03:00 EST)
1. Show HN — "Deckent: Open source AI orchestrator with nervous system (Solo dev, 148 sprints)"
2. Reddit r/LocalLLaMA + r/programming + r/opensource
3. Twitter thread (Alperen hesabı)
4. Turkish dev Twitter (Webtekno, ShiftDelete, Teknokulis)
5. Discord server launch (community hub)
6. Dev.to post + Hashnode

---

## 9. Risk Matrix (Sprint 149-200)

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|------------|
| Sprint 149 8h aşımı (27 task) | Orta | Orta | Block E-F ertelenebilir Sprint 150'ye |
| Sprint 150 launch provider error | Düşük | Yüksek | npm publish --dry-run Sprint 149'da |
| Community no-show Sprint 150 | Orta | Yüksek | Turkish dev network ile pre-announce |
| Hub skill security breach | Düşük | Yüksek | Ed25519 + CI sandbox scan zorunlu |
| WhatsApp Business API red | Orta | Orta | Scaffold Sprint 149, aktivasyon Sprint 152+ |
| Post-launch bug flood | **Yüksek** | Orta | **Bu beklenen** — Sprint 151 community triage |
| Sprint 149 AI mode yine fail | Orta | Düşük | Structured fallback hazır |
| God-level 50 sprint sürer | Orta | Düşük | OpenClaw 24 ayda 0→70K, biz 6 ayda 10K+ hedef |
| Solo dev burnout | Orta | Yüksek | Sprint pace < 2/gün, milestone-gated features |

---

## 10. Bağlantılı Dokümanlar

- `BETA-TRACKER.md` + `BETA-TRACKER-TR.md` — sprint-level exit criteria
- `DECKENT-MASTER-BLUEPRINT.md` — architectural blueprint
- `DECKENT-ANA-PLAN-TR.md` — Turkish master plan
- `VISION.md` + `VISION-TR.md` — product vision
- `COMPETITIVE-ANALYSIS.md` — rekabet analizi
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` — god-audit 233 findings
- `.deckent/sprint-god-analysis/FINAL-REPORT.md` — 317 files × 74K LoC analysis
- `docs/analysis/competitive-analysis.md` — OpenClaw/Cursor/Devin head-to-head
- `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` — Sprint 148 spec
- `.brain/exports/summary.md` — 41 ADR registry

---

## 11. Anchor Kuralları — Yoldan Şaşmamak İçin

1. **Sprint 151 Beta GA Çarşamba 22 Nis** — (Sprint 150 re-run + Hot Fix sonrası güncel hedef), catastrophic fail dışında ertelenmez
2. **test-writer agent yasak** — Sprint 148 reform kalıcı, tekrar eklenmez
3. **Nervous system production-critical** — her sprint'te event kanıtı aranır; **2026-04-21 Hot Fix H6 sonrası DECKENT→USER:NOTIFY canlı** + nervous bridge aktif
4. **Ed25519 signature zorunlu** — imzasız skill hub'a kabul edilmez
5. **Deckent "ürün değil servis"** — SaaS/paywall/enterprise edition yasak (ADR-033)
6. **Milestone-gated**: Voice 10K, Mobile 50K (Alperen kararı)
7. **Solo dev hikayesi** pazarlama asset'idir — solo + sprint disiplini = USP
8. **OpenClaw mesafe azalıyor** — her sprint rekabet pozisyonu güncellenir
9. **.deck + AST sandbox + Ed25519 = güvenlik DNA'sı** — bu üçlüden taviz yok
10. **Doküman-önce-kod** — her sprint öncesi design spec + DIRECTIVES
11. **Hot Fix with Claude Subagents pattern (2026-04-21 kurulmuş)** — Deckent kırıkken Deckent'le Deckent'i tamir sonsuz döngü riski. Kritik P0 bug'ları cerrahi müdahale için Claude Code `Agent` tool (`general-purpose` subagent) ile paralel/sequential çözülür. Deckent sprint pipeline bypass edilir, sadece **deploy-level bug fix** için uygulanır. Sprint 150A (H1..H7, ~68dk) ilk canlı uygulama, rekor kabul.
12. **Meta-dogfood kanıt sayacı per-sprint** — Sprint 146 (1), Sprint 147 (3), Sprint 148 (6), Sprint 150 (11) + Sprint 150A Hot Fix (13), Sprint 152 (1 büyük: verification-blind bug audit içinde yakalandı), Sprint 153 (4: 0-byte bin keşfi + verification-blind dogfood + run timeout cap + timeout result clarity). Her sprint kendi kodu kendi canlı kanıtladığı bulgu sayısı sürdürülüyor.
13. **Node.js minimum >=20** (Sprint 153, 2026-05-06) — Node 18 EOL 2025-03-27, Node 20 EOL 2026-03-24 ama hâlâ widely deployed; matrix `[20.x, 22.x, 24.x]`. better-sqlite3 zaten Node 18'i desteklemiyor, vite 20.19+ istiyor. CI'da `npm ci` sonrası `npx node-gyp rebuild --release` step'i zorunlu (`.npmrc:ignore-scripts=true` postinstall'ları bloke ediyor; tek trusted dep'i explicit derliyoruz).
14. **CI green imperative** (Sprint 153 sonrası) — push öncesi lokalde `npm run lint` + targeted `npx vitest run` zorunlu. **`node_modules/.bin/{tsc,vitest}` 0-byte zombie** olabilir (npm install bin link bug); şüphe halinde `npm rebuild`. Direkt invoke: `node node_modules/typescript/bin/tsc` veya `node node_modules/vitest/vitest.mjs run`.
15. **Beta GA Gate #15 ✅ (Sprint 153 E)** — 20/20 seed skill Ed25519 imzalı, `skill install` lazy verify wire canlı, `--allow-unsigned` opt-out. Hub public key `6850ed2fdfd6fb185d80ee6f747176a54da7f2bea9f1c5f95b41855c5554795f` (project hub key — kullanıcı kendi `~/.deckent/keys/`'i ile signs). Production hub publish'inde external rotated key kullanılacak.
16. **Sprint 154 KESIN ROOT CAUSE (2026-05-07) — TARİHİ KANIT** — Sprint 144→153 9-sprint kronik "worker timeout / 0 line yazma" bug'ı `spawn-backend-docker.ts:257` `~/.claude.json:ro` mount → silent EROFS exit kaynaklıydı. **1 satır fix** (`:ro` flag kaldır). LIVE dogfood: Sprint 153 17 worker × 47dk × 0 line ↔ Sprint 154 1 worker × 52sn × 1 dosya. Claude CLI startup config write fail container'da silent exit ediyordu — pipeline 9 sprint sonra LIVE.
17. **Mimari "advanced features" wire validation zorunlu** (Sprint 154 audit A4 keşif) — Sprint 134-139'da yazılmış olan `respawnEligibleTasks`, `applyCascadeToSprint`, `applyUnblockToSprint`, `reconcileSpuriousNoGo`, `task-retry.ts`, ADR-039 self-modifying-detector — production'da 0 caller'dı. Test'te isolated pass aldatıcı. Bundan sonra her ADR/feature implement etmeden önce **production call site assertion** zorunlu (wire-validation test pattern). Sprint 154 Wave B T7+T8+T9 ile 4 dead export wire edildi.

---

**İmza (orijinal):** Koordinatör (5 paralel agent analiz + Alperen 12 karar + OpenClaw rekabet verisi)
**İmza (2026-04-21 Hot Fix güncellemesi):** Koordinatör (Claude Code subagent-driven hot fix session — H1..H7 7 paralel/sequential general-purpose subagent, ~68dk, ~1M token, 145+ file, DECKENT→USER:NOTIFY 12 sprint sonra canlandı)
**Diriliş:** Bu doküman Sprint 149-200 canlı — her sprint sonu güncellenecek
**İmza (2026-05-06 Sprint 153 güncellemesi):** Koordinatör (14 commit batch — CI greening + Node 18 EOL drop + D batch + B Nervous wire + B3 wire test + E Ed25519 hub sign + run-param + docker timeout result clarity + 0-byte bin keşif. Beta GA gate 17/20 → 19/20)
**İmza (2026-05-07 Sprint 154 Hot Fix Day — TARİHİ AN):** Koordinatör (10-agent comprehensive audit + 13 P0 hot fix + 5 commit chain — claude.json:ro KESIN ROOT CAUSE + LIVE dogfood 52sn × 1 file kanıt. Pipeline 9 sprint sonra LIVE. Mimari "advanced features" production wire'a bağlandı: Sprint Pipeline cascade/unblock/retry + Nervous half-loop + ADR-039 dormant 12+ sprint çözüldü. ADR 43→45. Beta GA gate 19/20 → 20/20 (impl. Pipeline Health) — kalan tek dış bağımlılık #13 messaging token.)
**Sonraki revize:** Sprint 155 sonrası — Telegram/Discord smoke pas + B3 production detector log evidence + Sprint 154 P1 stretch (parity gaps)
