# DIRECTIVES — Sprint 155: Multi-Provider Runtime Hardening

> Sprint 154 çıkışı: provider_auth schema (Faz B) + effort translator (Faz C) + Docker multi-provider command builder (Faz A.5) + Gemini OAuth live E2E (DONE). Sprint 155, Faz B'de "advisory only" bıraktığımız enforcement + Sprint 154 backlog'unu (429 fallback, model registry refresh) kapatmaya odaklanıyor.

## Referanslar
- Sprint 154 commit'leri: `da7c93f` (Faz A+A.5), `fe5c3a4` (Faz B+C)
- Audit bulgusu: A6.F3 (fallback_provider gap — Sprint 154'te doctor warning olarak çözüldü, runtime gap açık)
- BETA-TRACKER gate #8: 2/3 live (claude+gemini), codex pending external CLI access
- ADR-040 (Nervous System): proactive meta-orchestrator, Sprint 144-146 olaylarından doğdu
- Memory: `Sprint 154 Multi-Provider Audit closed adapter-only/Docker-live gap`

## Goal

Sprint 154 multi-provider altyapısını **runtime'a tam entegre etmek**: doctor advisory'leri runtime enforcement'a dönüştür, 429/capacity hatalarında otomatik provider fallback'i wire et, model registry'yi provider'dan canlı yenilet, Codex CLI erişimi geldiğinde live dogfood'u kapat. Faz D — pre-beta multi-provider hardening.

---

## Task 1: Runtime Fallback Chain — 429/Capacity Auto-Recovery
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/result-evaluator.ts, src/core/provider-fallback.ts (new), tests/orchestra/fallback-chain.test.ts (new)
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

Worker output'unda 429/capacity/quota patterns tespit edildiğinde (örn. Gemini'nin `"No capacity available for model X on the server"` veya OpenAI'nin `"rate_limit_exceeded"`), task'ı otomatik olarak `fallback_provider` ile yeniden execute et. Sprint 154'te doctor `checkFallbackProviderGap()` config'de fallback unset uyarısı veriyor; bu task runtime tarafını tamamlıyor.

**Dizayn**:
1. **`src/core/provider-fallback.ts`** — `detectCapacityError(workerOutput): { hit: boolean; reason: string; provider: ProviderName }` regex tabanlı tespit. Test edilebilir saf fonksiyon.
2. **`src/orchestra/result-evaluator.ts`** — Result evaluate ederken `selfAssessment === 'NO_GO'` + `capacity error detected` → `RetryWithFallback` action emit et.
3. **`src/orchestra/sprint-controller.ts`** — FIX phase'inde RetryWithFallback geldiğinde, task'ın provider'ını `fallback_provider`a swap edip respawn et (max 1 fallback retry per task — sonsuz döngü yok).
4. Retry sonucu .result'a `tokenUsage.provider`'da kullanılan provider yazılı kalmalı (fallback olduğu görülmeli).

**Kanıt**: `npx vitest run tests/orchestra/fallback-chain.test.ts` 8+ test; mock worker output ile `detectCapacityError` true/false matris; `result-evaluator` retry önerisi; `sprint-controller` fallback respawn integration.

**Test**: 8+ test (gemini 429 detect, openai rate_limit detect, claude overloaded detect, no capacity = no fallback, fallback chain unset = NO_GO not retry, max-retry=1 enforcement, fallback success path, fallback also fails path).

---

## Task 2: Adapter-Side provider_auth.mode Runtime Enforcement
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/providers/claude.ts, src/providers/gemini.ts, src/providers/codex.ts, src/core/provider-auth-resolver.ts (new), tests/providers/auth-enforcement.test.ts (new)
- Scope: src/providers/, src/core/, tests/providers/

### Description

Faz B'de `provider_auth.{name}.mode` doctor advisory olarak çalışıyor; configured ile detected mode farklıysa uyarı veriyor ama spawn yine de auto-detect ediyor. Sprint 155 task'ı: adapter `spawn()` içinde configured mode'u **enforce** et — `mode: 'subscription'` set edilmişse env var olsa bile API key path'ine düşmesin, `mode: 'api_key'` set edilmişse cached OAuth varsa onu görmezden gelsin.

**Dizayn**:
1. **`src/core/provider-auth-resolver.ts`** — `resolveAuthMode(adapter, config): AuthMode | null` saf fonksiyon: config'deki preference + adapter `detectAuthMode()` outputu birleştir, çelişki varsa configured kazansın.
2. Her adapter constructor'a opsiyonel `authConfig?: ConfigProviderAuth` param ekle (factory üzerinden enjekte edilir).
3. `spawn()` resolver'ı çağırıp `mode === 'api_key'` zorlaması varsa OAuth creds dosyasına bakılmasın; `mode === 'subscription'` zorlaması varsa env var inject edilmesin.
4. Çelişki = ProviderError ile fail-fast (hint: doctor zaten warning verdi).

**Kanıt**: `grep -n "resolveAuthMode" src/providers/*.ts` → 3 adapter çağırıyor; `tests/providers/auth-enforcement.test.ts` config-vs-detect matrisi geçer.

**Test**: 6+ test (config api_key + env present → use env; config api_key + no env → throw; config subscription + oauth present → use oauth; config subscription + no oauth + env present → throw; config auto → fallback to detectAuthMode behavior; explicit mode mismatch → ProviderError with helpful message).

---

## Task 3: Model Registry Remote Refresh
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, api-builder, anthropic-sdk
- Files: src/core/model-registry.ts, src/core/model-registry-refresh.ts (new), src/cli/commands/doctor-checks.ts, tests/core/model-registry-refresh.test.ts (new)
- Scope: src/core/, src/cli/commands/, tests/core/

### Description

`BUILTIN_MODELS` 13 model olarak hardcoded — provider yeni model çıkardığında deckent fark etmiyor (`gpt-4o → gpt-4.1` migration tipik örnek). Stale-while-revalidate cache pattern'i ekle:

**Dizayn**:
1. **`src/core/model-registry-refresh.ts`** — Provider başına async refresh: Anthropic `GET /v1/models`, OpenAI `GET /v1/models`, Gemini `GET /v1beta/models?key=...`. Subscription-only kullanıcı için fallback: `claude config get models` / `codex models list` / `gemini --list-models` CLI komutları (varsa).
2. ModelRegistry'ye `lastRefresh: Record<ProviderName, number>` + `staleAfterMs = 7 * 24 * 60 * 60 * 1000`. `isStale(provider): boolean`.
3. CLI komut: `deckent doctor --refresh-models` — manuel refresh trigger.
4. Doctor entegrasyonu: `Model registry: codex models last refreshed X days ago` warning (>7d).

**Kanıt**: `deckent doctor --refresh-models` 3 provider için canlı API çağrısı yapar (key/sub varsa), success → `last refreshed Just now`. Stale check unit test.

**Test**: 5+ test (refresh updates timestamp, stale check returns true after staleAfter, no api key → graceful skip with hint, malformed response → no crash, all 3 providers parallel refresh).

---

## Task 4: Codex Live Install + Dogfood (BLOCKED on external)
- Model: sonnet
- Effort: low
- Skills: ci-testing
- Files: docs/CHANGELOG.md, BETA-TRACKER.md (gate #8 close)
- Scope: docs/

### Description

**Bu task external dependency tarafından blocked: Codex CLI erişimi henüz Alperen tarafında alınmadı. Brain bu task'ı `BLOCKED` state'inde bırakmalı, otomatik spawn etmemeli.**

Erişim geldiğinde manuel adımlar:
1. `npm i -g @openai/codex && codex login` (subscription) veya `OPENAI_API_KEY` set
2. `deckent doctor` → "Codex CLI v0.X — auth: subscription (codex auth status)" görmeli
3. `deckent run "Print one short word in Turkish" --model gpt-5-mini --timeout 60000` — Docker container'da end-to-end (Faz A.5 routing zaten yazıldı)
4. Result: DONE bekleniyor; capacity hatası olursa Sprint 155 Task 1'in fallback chain'i devreye girmeli (canlı dogfood for Task 1)

**Kanıt**: BETA-TRACKER gate #8 → 3/3 live; CHANGELOG entry "Codex live dogfood DONE".

**Test**: N/A (manuel verification + docs sync).

---

## Task 5: Sprint 154 Retro + Memory Sync
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: .brain/RETRO.md, .brain/exports/memory.md, docs/SPRINT-LOG.md
- Scope: .brain/, docs/

### Description

Sprint 154 multi-provider work'ünü `.brain/RETRO.md` + `.brain/exports/memory.md`'ye yansıt. Üç ana öğrenim:

1. **"PASS" claim ≠ live evidence** — gate #8 Sprint 148'de PASS işaretliydi ama unit test bazlıydı; Sprint 154'te canlı E2E denenince Docker hardcoded-claude bug'ı bulundu. Retro lesson: gate'lerin "live evidence" zorunluluğu ROADMAP'a eklenmeli.
2. **Mount UID pollution playbook** — root-mode docker debug edilince mount edilmiş host dizinleri kirlenir; cleanup için `docker run --rm -v ... alpine rm -rf` (sudo password engeli yok).
3. **Bisect playbook** — 3 ardışık fix-katmanı (`--skip-trust` → RW mount → provider-aware cmd builder → UID pollution cleanup). Pattern: tek katmanı çözmek diğerini açığa çıkarır, kademeli debug yöntemini benimse.

**Kanıt**: `git log .brain/RETRO.md` + `cat .brain/RETRO.md | grep -i sprint-154` → entry görünür.

**Test**: N/A (manuel review).

---

## Sprint 155 Notları (planlama meta)

- **Task 1, 2, 3 paralel çalıştırılabilir** — independent scopes (orchestra/, providers/, core/registry).
- **Task 4 BLOCKED** — Brain spawn etmemeli, manual unblock gerek.
- **Task 5 DECAY phase'inde** çalıştırılır (sprint sonu memory update).
- **Beta GA gate'leri** — Sprint 155 sonrası gate #8 yeniden değerlendirme: Task 1+2+3 PASS → 19/20 (codex hâlâ external).
- **429 capacity hatası canlı laboratuvar** — Sprint 154'te `gemini-2.5-flash` 429 gerçek olay olarak hit edildi; Task 1'in fallback chain'i bu pattern'i kapsamalı (regex test fixture olarak kullanılabilir).
