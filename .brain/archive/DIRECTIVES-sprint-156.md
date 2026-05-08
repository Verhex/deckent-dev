# DIRECTIVES — Sprint 156: Gemini Sprint Dogfood

> Sprint 154-155'te kurulan multi-provider altyapısının (Gemini OAuth + Docker backend + auth enforcement + 429 fallback chain) **sprint orchestration scale'inde canlı doğrulanması**. Sprint 154 audit gate #8'in tam kapanışı için son adım.

## Referanslar
- Sprint 155 commit'leri: `c31cf51` (runtime fallback chain), `729cba3` (finalize)
- Sprint 154 commit'leri: `da7c93f` (Gemini OAuth), `fe5c3a4` (auth schema), `a285961` (docs)
- Config: `worker_provider: gemini`, `fallback_provider: claude`, `provider_auth.gemini.mode` not set (auto)
- Gemini OAuth: `~/.gemini/settings.json` selectedType=oauth-personal, free Code Assist license, 1000 RPD
- Bilinen quota: gemini-2.5-pro hit "No capacity available" → fallback chain (Sprint 155 Task 1) Claude'a swap etmeli

## Goal

3 doc/refactor task'ı `worker_provider=gemini` ile çalıştır. **Beklenen kanıtlar**:
1. En az 1 task DONE → Gemini sprint orchestration scale'de çalışıyor (gate #8 close)
2. Fallback chain canlı tetiklenirse (gemini 429 → claude swap), tokenUsage.provider'da fallback provenance görünür
3. Tüm provider_auth doctor consistency check'leri yeşil
4. Sprint complete (NEVER incomplete) — 30dk timeout içinde finalize

Sprint stratejisi: doc-heavy + low-risk task'lar. Gemini 2.5 Flash 1M context ve doc/refactor için ideal. Critical kod path'lerine dokunulmuyor.

---

## Task 1: README + BETA-TRACKER TR/EN Senk Audit
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-156-tr-en-sync-report.md (new)
- Scope: docs/audits/

### Description

`README.md` (EN), `README-TR.md` (TR), `BETA-TRACKER.md` (EN), `BETA-TRACKER-TR.md` (TR) dosyalarını oku, **drift'leri tespit et** ve `docs/audits/sprint-156-tr-en-sync-report.md` (yeni dosya) altında raporla.

**Çıktı formatı**:
```markdown
# Sprint 156 — TR/EN Documentation Sync Audit

## README sync
| Section | EN status | TR status | Drift? |
|---------|-----------|-----------|--------|
| ...     | ...       | ...       | ✓ / ⚠️  |

## BETA-TRACKER sync
| Gate | EN status | TR status | Drift? |
|------|-----------|-----------|--------|

## Recommended fixes
- (5-10 actionable bullet points)
```

**Salt-okuma + tek dosya yazma** — herhangi bir source veya bilinen md'yi modify etme. Bu task tamamen audit/raporlama, drift fix ayrı bir task'ın işi.

**Kanıt**: `ls docs/audits/sprint-156-tr-en-sync-report.md` → dosya var; içerik markdown table, en az 10 satır.

**Test**: N/A (documentation-only task, no source changes).

---

## Task 2: docs/development/ Staleness Audit
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer, code-reviewer
- Files: docs/audits/sprint-156-development-staleness.md (new)
- Scope: docs/audits/

### Description

`docs/development/` altındaki tüm `.md` dosyalarını oku, **stale içerik veya kod referans'ı dead linkler** olup olmadığını tespit et. Kontrol edilecekler:
- Linked source files (örn. `src/orchestra/sprint-controller.ts`) gerçekten var mı? (Sprint 154+155'te bazı dosyalar yeniden organize edildi)
- Referenced sprint numbers (`Sprint 144`, `Sprint 138` vs.) hâlâ relevant mi?
- Code snippets (markdown ```` ```ts ```` blocks) syntax-valid görünüyor mu?
- "TODO", "FIXME", "deprecated" anahtar kelimelerini ara

**Çıktı**: `docs/audits/sprint-156-development-staleness.md` — bulunan stale referanslar tablosu + recommended fixes.

**Salt-okuma + tek yeni dosya yazma** — mevcut `docs/development/*.md`'yi DEĞİŞTİRME, sadece audit yap.

**Kanıt**: `ls docs/audits/sprint-156-development-staleness.md` → dosya var; en az 1 stale reference (Sprint 154+155 reorgs çok sayıda yeni dosya yarattı, drift olması beklenen).

**Test**: N/A.

---

## Task 3: src/core/provider-fallback.ts JSDoc Genişletme
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer, typescript-expert
- Files: src/core/provider-fallback.ts
- Scope: src/core/

### Description

Sprint 155 Task 1'de oluşturulan `src/core/provider-fallback.ts`'in (216 LoC) public API'sine **kapsamlı JSDoc** ekle. Mevcut comment'leri korurken her exported fonksiyon ve type için:
- `@param` her parametre için
- `@returns` dönen değer açıklaması
- `@example` en az 1 kullanım örneği (gerçek 429 mesajı pattern'i ile)
- `@see` related fonksiyonlar veya ADR referansları

**Mevcut kodu değiştirme** — sadece JSDoc bloklarını genişlet. Public exports: `detectCapacityError`, `selectFallbackProvider`, `decideFallbackRetry`, `MAX_FALLBACK_RETRIES`, ve type'lar.

**Kanıt**: `grep -c "@example" src/core/provider-fallback.ts` → ≥4 (her major fonksiyon için 1 örnek); `npx tsc --noEmit` clean kalır.

**Test**: 
1. `npx tsc --noEmit` 0 errors (tip-cast bozulması olmadığını doğrular)
2. `npx vitest run tests/orchestra/fallback-chain.test.ts` 29/29 pass (mevcut testler etkilenmedi)

---

## Sprint 156 Notları (planlama meta)

- **Tüm task'lar Gemini routing'te çalışmalı** (`worker_provider: gemini` config'de set). Task model fields `gemini-2.5-flash` explicit override.
- **Fallback chain test fırsatı**: Eğer Gemini 429/capacity hit ederse, Sprint 155 Task 1 fallback chain Claude'a swap etmeli. tokenUsage.provider'a bakarak fallback'in tetiklenip tetiklenmediğini görürüz.
- **Sprint completion criteria**: 3 task'tan en az 1 DONE → Sprint 156 başarılı kabul edilir (gate #8 close için yeterli kanıt).
- **No regression**: Mevcut 6332+ test geçmeye devam etmeli.
- **Quota optimizasyonu**: Tüm task'lar `gemini-2.5-flash` (free Code Assist tier'da en cömert quota); pro variant'tan kaçınıldı.
