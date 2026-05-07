# DIRECTIVES — Sprint 159: Mixed Claude+Gemini Production Sprint + Auth Surface Closure

> Sprint 154→158 5 routing/labeling bug'ı kapadı, Sprint 159 ilk **mixed-provider production sprint**: Claude (code-heavy reasoning) + Gemini (doc-heavy large-context) hibrit dağılım. Aynı zamanda Sprint 159 başında bulduğumuz **8. bug** (`detectGemini` legacy path) commit `7bec80b` ile kapandı; bu sprint **auth-surface-checklist'i 9 surface'a günceller** ve Sprint 155'te yarım kalan `--refresh-models` doctor flag'ini wire eder.

## Referanslar
- Sprint 158 fix stack: `e1a47a1`, `932356f`, `6b39ac3`
- Sprint 159 hotfix: `7bec80b` (detectGemini/detectCodex OAuth + subscription labeling)
- auth-surface-checklist.md (Sprint 157 deliverable, Sprint 159'da 9 surface'a çıkacak)
- Config: `worker_provider: gemini`, `fallback_provider: claude`
- Gemini quota durumu: 2026-05-07 itibarıyla all-tier 429 capacity (transient Google capacity), fallback chain claude'a swap edecek — bu sprint Sprint 155 fallback chain'in **canlı production stress test**'i

## Goal

Mixed-provider production sprint — Claude'un code/reason gücü + Gemini'nin doc/large-context avantajı kombinasyonu. **Beklenen kanıtlar**:
1. **En az 1 task gemini provider'da DONE** (Sprint 158'in 158-003'te zaten elde ettiği seviyenin tekrarı + genişlemesi)
2. Eğer Gemini 429 hit ederse → fallback chain (Sprint 155 Task 1) Claude'a swap → DONE — `tokenUsage.provider` field'ı gerçek runtime provider'ı yansıtır
3. Sprint 159 hotfix `7bec80b` doğrulaması: doctor "subscription auth active" göstermeli (canlı test'te başarılı, sprint deliverable bunu kalıcı dokümante eder)
4. Auth Surface Checklist 9 surface'a güncellenmiş şekilde commit'lenir

Sprint stratejisi: 3 Claude + 2 Gemini task; Gemini task'ları doc-heavy (large context avantajı) + low-write-pressure (429 tolere edilebilir, fallback hazır), Claude task'ları code/reason-heavy.

---

## Task 1: Auth Surface Checklist 7→9 surface güncelle [CLAUDE]
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/development/auth-surface-checklist.md
- Scope: docs/development/

### Description

`docs/development/auth-surface-checklist.md` Sprint 157'de 7 surface'la oluştu. Sprint 159 hotfix'te `src/core/provider.ts:detectGemini` + `detectCodex` legacy paths bulundu — ki bunlar surface 8 ve 9. Mevcut 7 maddeyi koruyarak Surface 8 (`detectCodex`) ve Surface 9 (`detectGemini`) bölümlerini ekle:

- Her birinde "code intent" + "Sprint 159 fix description" + commit SHA `7bec80b` referansı
- Validation playbook'a yeni adım ekle: `npx deckent doctor` çıktısında her provider için "subscription auth active" / "API key configured" / "session auth active" labelinin doğru göründüğünü doğrula

Salt-yazı task — sadece checklist .md dosyası güncellenir.

**Kanıt**: `grep -c "## Surface " docs/development/auth-surface-checklist.md` → 9 (önceden 7).

**Test**: N/A (documentation-only).

---

## Task 2: Wire `deckent doctor --refresh-models` flag [CLAUDE]
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, api-builder
- Files: src/cli/commands/doctor.ts, tests/cli/commands/doctor.test.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description

Sprint 155 `model-registry-refresh.ts` modülünü ekledi (lastRefresh + isStale + refresh fonksiyonları). Ama `deckent doctor --refresh-models` CLI flag'i wire edilmedi. Sprint 159 bunu kapatır:

1. `src/cli/commands/doctor.ts` `.option('--refresh-models', '...')` ekle
2. Action handler'da: flag varsa `runModelRegistryRefresh()` çağır (doctor-checks.ts'den export var), her provider için pre-fetch dene (API key/subscription varsa, yoksa skip), refresh tarihini `.deckent/model-registry-refresh.json`'a kaydet
3. Output: "Refreshed claude (3 models), gemini (4 models, 1 stale-warning), codex (skipped — no auth)" benzeri tablo
4. Test: 2+ test (flag detect, mock refresh success, no-auth provider skip)

**Kanıt**: `grep -c "refresh-models" src/cli/commands/doctor.ts` ≥ 1; `npx deckent doctor --help` çıktısında `--refresh-models` görünür.

**Test**: 2+ test.

---

## Task 3: Sprint metrics CLI — `deckent metrics summary <sprintId>` [CLAUDE]
- Model: opus
- Effort: high
- Skills: typescript-expert, api-builder
- Files: src/cli/commands/metrics.ts (new), src/cli/index.ts, tests/cli/commands/metrics.test.ts (new)
- Scope: src/cli/commands/, tests/cli/commands/, src/cli/

### Description

Sprint 159 ana mimari deliverable: bir sprint için **agent + skill + provider compliance** metriklerini CLI'dan çıkaran komut.

**Komut**: `deckent metrics summary <sprintId>` ya da `deckent metrics summary --last`

**Çıktı şeması** (markdown table):
```
Sprint sprint-159 — Metrics Summary

Provider Distribution:
| Provider | Tasks | DONE | NO_GO | Avg Duration |
| claude   | 3     | 3    | 0     | 4m 12s       |
| gemini   | 2     | 1    | 1     | 6m 45s       |

Model Distribution:
| Model            | Tasks | Routing |
| sonnet           | 2     | direct  |
| opus             | 1     | direct  |
| gemini-2.5-flash | 2     | direct  |

Agent Compliance:
| Agent          | Assigned | Used | Compliance |
| doc-writer     | 2        | 2    | 100%       |
| architect      | 1        | 1    | 100%       |
| (generic)      | 2        | 2    | 100%       |

Skill Compliance:
| Skill                    | Assigned | Used (proxy: filesChanged scope match) |
| documentation-writer     | 4        | 4 (100%)                                |
| typescript-expert        | 1        | 1 (100%)                                |

Fallback Events:
- task-159-XXX: gemini → claude (capacity 429)

Honesty/Coverage Drift: 0
```

Veri kaynakları:
- `.deckent/sprint-{id}-metrics.jsonl` (provider distribution + duration)
- `.tasks/archive/sprint-{id}-tasks/task-*.{json,result}` (agent/skill assignments + actual filesChanged)
- `.tasks/archive/sprint-{id}-tasks/task-*.result.fallback-attempt-N` (fallback events)

**Kanıt**: `npx deckent metrics summary sprint-159` markdown table çıktısı verir; her bölüm en az 1 satır içerir; provider DONE/NO_GO sayımı task-N.result dosyalarındaki `selfAssessment` ile eşleşir.

**Test**: 5+ test (cli flag parse, jsonl parse, table render, missing sprint graceful, --last resolves).

---

## Task 4: README.md ve README-TR.md drift fix uygulaması [GEMINI]
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: README.md, README-TR.md
- Scope: ./

### Description

`docs/audits/sprint-156-tr-en-sync-report.md` (Sprint 156 deliverable) ve potansiyel `docs/audits/sprint-158-readme-drift-fix.md` (Sprint 158 deliverable) drift'lerini OKUDuktan sonra, bulunan EN-vs-TR farklılıkları için **doğrudan README.md ve README-TR.md fix'lerini uygula** (audit önerilerini kod tabanına yansıt).

Stratejik kural:
- Yeni feature ekleme/silme YOK — sadece olan içeriği iki dilde tutarlı hale getir
- Section başlıkları + listeler eşitlensin
- Versiyon/sayım/tarih bilgileri canonical (EN) tarafa yaslansın, TR'a propagate et
- Hiçbir değişiklik commit message için kritik değilse skip et

Bu task **Gemini-friendly** (geniş context — README.md + README-TR.md + audit raporları aynı anda okunmalı).

**Kanıt**: `git diff README.md README-TR.md` her iki dosyada >= 5 satır değişiklik; `grep -c "^## " README.md` == `grep -c "^## " README-TR.md` (section count parity).

**Test**: N/A (markdown sync only).

---

## Task 5: docs/CHANGELOG.md TR/EN normalize [GEMINI]
- Model: gemini-2.5-flash
- Effort: low
- Skills: documentation-writer
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description

`docs/CHANGELOG.md` header'ı `<!-- Dil: TR | Teknik terimler EN -->` diyor — yani canonical TR. Ama bazı entry'ler tam İngilizce yazılmış (özellikle Sprint 154→158 zincirim). Sprint 158'in `docs/audits/sprint-158-changelog-drift.md` raporu bunu zaten audit etmişti.

Bu task: o audit raporundaki recommendation'lara göre EN entry'leri **TR canonical formuna çevir** (teknik terimler EN kalır — code, function name, file path, ADR id, commit SHA, model name, gate # etc).

Stratejik kural:
- Sprint 154 öncesi entry'lere DOKUNMA (bunlar zaten orijinal yazıldıkları dilde tarihsel)
- Sprint 154-158-159 entry'leri TR'a normalize et
- Code blok'ları, file path'ler, commit SHA'lar EN/raw kalır
- Cümle yapısı + bağlaç + açıklama TR'a çevirilir

**Kanıt**: Sprint 154-159 entry'lerinde TR'lı baskın cümle yapısı; `grep "Implemented\|Fixed\|Updated" docs/CHANGELOG.md | wc -l` ≥ 50% azalmış (Türkçe karşılıklarla yer değiştirmiş).

**Test**: N/A.

---

## Sprint 159 Notları (planlama meta)

- **Provider routing**: 3 task Claude (sonnet/opus), 2 task Gemini (gemini-2.5-flash). `worker_provider: gemini` config'inde olsa bile Claude task'ları forceModel ile direkt claude'a gider (Sprint 157 fix sayesinde planner Model directive'ini honor ediyor).
- **Empirical kriterler**:
  - En az 1 task `tokenUsage.provider == "gemini"` (Sprint 158 158-003 seviyesi)
  - Eğer 429 hit olursa, fallback chain canlı kanıt verir (`task-XXX.result.fallback-attempt-1` dosyası)
  - Sprint 159 hotfix `7bec80b` doctor'a yansıdı — Task 1 deliverable bunu kalıcı yapar
- **No regression budget**: 6088+ test geçmeye devam etmeli
- **Quota**: Gemini Code Assist free 1000 RPD; 2 task güvenli, 429 olursa fallback chain çalışacak
- **Bu sprint Sprint 155 fallback chain için ilk gerçek production stress test**: önceki sprintlerde fallback chain unit-test'le doğrulandı, gerçek 429'a karşı henüz canlı çalışmadı
