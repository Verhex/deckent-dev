# DIRECTIVES — Sprint 158: Gemini Real Sprint Dogfood + Codex Onboarding (Conditional)

> Sprint 156–157 üç ardışık routing bug'ını kapadı (`isAvailable` OAuth, `resolveTaskModel` provider default, `sprint-planner` provider hop). Sprint 156'da Gemini sprint scale'de **çalışamadığı** ortaya çıktı — şimdi fix'lerle gerçek bir Gemini sprint çalıştırıyoruz. Bu sprint, Beta GA gate #8'in claude+gemini tarafının empirical close'u.

## Referanslar
- Routing fix stack: `60566eb`, `b4df0e2`
- Auth surface checklist: `docs/development/auth-surface-checklist.md` (Sprint 157 deliverable)
- Sprint 156 archive: `.brain/archive/DIRECTIVES-sprint-156.md`
- Config: `worker_provider: gemini`, `fallback_provider: claude`
- Quota baseline: Gemini Code Assist free tier — 60 RPM, 1000 RPD, gemini-2.5-flash + 2.5-pro accessible (2.5-pro hits "No capacity" intermittently)

## Goal

3 doc/audit task'ını `worker_provider=gemini` ile çalıştır. **Beklenen kanıtlar (empirical gate #8 close)**:
1. **At least one task DONE** with `tokenUsage.provider === "gemini"` (not claude). Sprint 156'da bu HAVADA değildi — fix'lerle ÇIKMASI bekleniyor.
2. Eğer fallback chain tetiklenirse, `.result.fallback-attempt-N` dosyası diskte görünür ve Sprint 155 Task 1'in canlı kanıtı olur.
3. Doctor `Provider Auth (gemini): configured=subscription, detected=subscription ✓` korunur.
4. Sprint complete (NEVER incomplete) — 30dk timeout içinde finalize.

Sprint stratejisi: Sprint 156'dan farklı olarak DIRECTIVES'e `Model: gemini-2.5-flash` koymakla yetinmeyip task JSON'ları direkt edit edip `provider: "gemini"` set etmeyeceğiz — Sprint 157 fix'i bu manuel müdahaleyi gereksiz kılmalı. Eğer planner çıktısı yanlışsa fix kanıtlanmaz.

---

## Task 1: README.md vs README-TR.md Drift Fix Proposal
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-158-readme-drift-fix.md
- Scope: docs/audits/

### Description

`docs/audits/sprint-156-tr-en-sync-report.md` (Sprint 156 deliverable) drift'leri tespit etmişti — şimdi her drift için **somut fix önerisi** yaz. Mevcut audit raporunu oku, her finding için Finding/Source/Drift/Recommended fix/Rationale formatında 5–10 finding kapsamı yaz.

Salt-yazı task — README.md veya README-TR.md'yi DEĞİŞTİRME, sadece audit rapor + fix önerisi.

**Kanıt:** `ls docs/audits/sprint-158-readme-drift-fix.md` → dosya var; `grep -c "## Finding" docs/audits/sprint-158-readme-drift-fix.md` ≥ 5.

**Test:** N/A (documentation-only).

---

## Task 2: Auth Surface Checklist Validation Run
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer, code-reviewer
- Files: docs/audits/sprint-158-auth-surface-validation.md
- Scope: docs/audits/

### Description

`docs/development/auth-surface-checklist.md` 7 auth surface'ı listeliyor. Her surface için **mevcut kod state'inin checklist ile uyumlu olduğunu doğrula** — claude.ts, gemini.ts, codex.ts, doctor-checks.ts, model-selector.ts, sprint-planner.ts, spawn-backend-docker.ts.

Format: surface başına ✓ veya ⚠️ işareti, line ref, kısa not. 7 surface + bonus surface (Docker cred mounts) için bu format. Eksiklik bulursan flag et ama tamir etme — bu task audit, fix'i ayrı sprint task'ı.

**Kanıt:** `ls docs/audits/sprint-158-auth-surface-validation.md` → dosya var; her 7 surface için ✓ veya ⚠️ işareti.

**Test:** N/A.

---

## Task 3: CHANGELOG Language Consistency Audit
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-158-changelog-drift.md
- Scope: docs/audits/

### Description

`docs/CHANGELOG.md` header'ında `<!-- Dil: TR | Teknik terimler EN -->` var ama bazı entry'ler EN, bazıları TR. Mevcut entry'leri tarayıp dil tutarlılığını markdown table'da raporla, recommended canonical direction (TR per header) belirt.

**Kanıt:** `ls docs/audits/sprint-158-changelog-drift.md` → dosya var; en az 5 entry sınıflandırılmış.

**Test:** N/A.

---

## Sprint 158 Notları (planlama meta)

- **Tüm task'lar Gemini routing'te çalışmalı** — Sprint 157 fix'leri sayesinde planner artık `Model: gemini-2.5-flash` directive'ini honor etmeli. Manuel JSON edit GEREKMEZ.
- **Empirical validation kriteri**: `cat .tasks/task-158-*.result | jq '.tokenUsage.provider'` çıktısında **en az bir tanesi `"gemini"` olmalı**. Hiçbiri gemini değilse, bilinmeyen 4. routing bug var demektir → bug-fix sprint'i tetiklenmeli.
- **Codex Live Onboarding (CONDITIONAL)**: Sprint 158 çalıştırılırken Codex CLI erişimi gelmişse, Sprint 156 Task 4 backlog'undan Codex live install + dogfood task'ı bu sprint'e ekleyebiliriz. Şimdilik DIRECTIVES'e dahil etmiyoruz — runtime'da eklenebilir.
- **No regression budget**: Mevcut 6088+ test geçmeye devam etmeli. Sprint 158 task'ları source'a dokunmadığı için risk minimal.
- **Quota optimizasyonu**: Tüm 3 task `gemini-2.5-flash` (Code Assist free tier en cömert quota) — `gemini-2.5-pro` "No capacity" sıkıntısından kaçındık.
