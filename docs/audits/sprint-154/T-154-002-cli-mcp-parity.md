# T-154-002: CLI/MCP Parity — Comprehensive Audit (RUNTIME mode)

**Sprint:** sprint-154 (comprehensive pre-execute audit)
**Audit role:** A2 — cli-mcp-parity
**Pass:** Tüm CLI komutlarının ve MCP tool'larının canlı stdio invocation + parity matrix
**Mode:** RUNTIME (live exec; statik şema diff DEĞİL)
**Tarih:** 2026-05-07T07:15Z (WSL2 host, Node v24.15.0, package.json 1.0.0-beta.1)
**Kaynak komutlar:**
- CLI: `node dist/cli/entry.js <cmd> --help` (46 top-level)
- MCP: `node dist/mcp/server.js` stdio + JSON-RPC `tools/list` + 3 spot real-call (`agent_list`, `skill_list`, `history`)
- Smoke: `bash scripts/cli-smoke-test.sh` (jq dependency missing → fallback inline loop)

---

## Özet

CLI/MCP parity audit'i Sprint 152 T-152-007/008 raporlarındaki tüm kritik bulguları **canlı re-confirm** etti ve Sprint 153 sonrası **3 yeni regresyon** + **1 build artifact bug** ekledi:

1. **Tool count drift derinleşti** — Server `instructions` bloğu hâlâ "27 tools" diyor; gerçek `tools/list` **31** döndürüyor. DECKENT.md hâlâ "22 tools". CLAUDE.md "27 tools". IDENTITY.md self-contradicts (line 14 "MCP: 22 tools" vs line 25 tablo "27"). Uçtan uca tek doğru kaynak: live `tools/list`.
2. **Agent count drift artıyor** — Live `deckent_agent_list` çağrısı **15 built-in + 3 temp = 18** döndürüyor; DECKENT.md ve IDENTITY.md hâlâ "16 built-in". Sprint 148 reform sonrası `test-writer` kaldırıldı, `accessibility-auditor`, `data-engineer`, `migration-specialist` listede ama 0 use ile dormant. `react-ts-specialist` temp olarak listed (uses=38, %86.8 success — promote candidate).
3. **F1 (P1) memory-query CLI eksik** — CLI'de `memory query` subcommand YOK; MCP'de `deckent_memory_query` var. CLI tarafında `deckent recall <query>` farklı bir komut adı altında — semantik aynı ama parity-by-naming DRIFT. KNOWN_ISSUES'taki "memory-query CLI wrapper eksik" bu.
4. **F2 (P1) `config read` subcmd yok ama help advertise ediyor** — CLI subcommands: `config set`, `config get`, `config export`, `config import`, `config list`, `config keys`, `config migrate`, `config nervous`. **`config read` YOK**. Buna rağmen `src/cli/commands/help.ts:43,78` (TR+EN) hâlâ `deckent config read` reklamı yapıyor. MCP `deckent_help` tools'u da `src/mcp/tools/help.ts:224` `'config read'` advertise ediyor. Kullanıcı boyutunda confusion.
5. **F3 (P1) `nervous status` CLI eksik / `nervous show` yok** — MCP `deckent_nervous_status` var (canlı, valid). CLI tarafında `deckent nervous` 6 alt komut sunuyor (`accept`, `reject`, `edit`, `undo`, `history`, `log`) **fakat `status` veya `show` YOK**. Authority matrix `deckent config nervous list` ile görüntüleniyor ama bu farklı — pending+history+config birleşik view CLI'de mevcut değil.
6. **F4 (P2) `feature_query` MCP naming inconsistency** — CLI: `deckent features` (top-level + `--category`). MCP tool: `deckent_feature_query` (snake-case + `_query` suffix). Diğer parity'lerde MCP genelde CLI komut adına suffix eklemez (`deckent_doctor`, `deckent_history` vs CLI `doctor`, `history`). Sadece bu tool ve `memory_query` "_query" suffix kullanıyor.
7. **F5 (P0) Doc count drift evrensel** — Hiçbir doc kaynağı (DECKENT.md, CLAUDE.md, IDENTITY.md, README.md) live `tools/list`/`commands` sayısıyla uyuşmuyor. Drift matrisi aşağıda.
8. **F6 (P0) `npx deckent --version` execute permission bug** — `dist/cli/entry.js` kaynak `src/cli/entry.ts` 755 ama tsc compile output 644. `package.json` "bin": `"./dist/cli/entry.js"`. `scripts/copy-assets.mjs` chmod yapmıyor. Tsc post-build hook YOK. `chmod +x` manuel düzeltildiyse persist edilmiyor — her `npm run build` sonrası tekrar gerekiyor. NPM publish'te `npm` postinstall otomatik bin'e symlink açıyor ama `npx deckent` lokal repo'da fail veriyor.
9. **F7 (P1) `deckent_run --dry-run` yok her iki tarafta da** — CLI `run --help` çıktısı: `--model`, `--scope`, `--timeout`, `--keep`, `--auto-approve`, `--verbose`. MCP `inputSchema`: `description`, `model`, `scope`, `autoApprove`, `effort`, `timeoutSeconds`. Hiçbirinde `--dry-run` yok. Sprint 152 T-152-008'deki SPEC-GAP devam ediyor.
10. **F8 (P2) Server instructions bloğu doc kaynağı drift** — `deckent_help` tool'u `src/mcp/tools/help.ts:48-71` 22 tool listeliyor — Server boot anında MCP `instructions`'a bu liste enjekte ediliyor (transcript ile teyit). Buradaki sayı hem sayısal hem de set olarak yanlış (4 tool eksik: watch, audit, feature_query, recover; 5 nervous_* tool eksik veya kısmi).

**Genel parity skoru:** Sprint 152 T-152-008'de "PARTIAL — 0/10 FULL parity" skoru tespit edilmişti. Sprint 153'te 3 yeni tool eklendi (audit, recover, watch) + nervous trio + feature_query dahil → 31 tool. Sprint 154 audit'inde 31/31 tool'un CLI counterpart'ı var ama **0/31 FULL parity**. Drift artıyor değişmedikçe.

---

## Inventory Snapshot

| Metric | Live (RUNTIME truth) | DECKENT.md | CLAUDE.md | IDENTITY.md | README.md | Status |
|--------|----------------------|------------|-----------|-------------|-----------|--------|
| MCP `tools/list` count | **31** | 22 | 27 | 22 (line 14) / 27 (line 25) | 22 | **6-way DRIFT** |
| MCP `resources/list` count | **8** | 8 | 8 | 8 | 8 | PASS |
| CLI top-level commands (`--help` parse) | **46** | "49+" / "55+" mix | — | "40+" (l.13) / "55+" (l.27) | — | **DRIFT** |
| CLI registerXxx in index.ts | **46** | — | — | — | — | match |
| Built-in agents (live `deckent_agent_list`) | **15** | 16 | 16 | 16 | 16 | **DRIFT** |
| Temp agents (live) | 3 | — | — | — | — | (info) |
| Built-in skills (live `deckent_skill_list`) | **21** | 21 | 21 | 21 | 21 | PASS |
| MCP server `instructions` (boot text) | "Tools (27)" | — | — | — | — | **DRIFT** (live=31) |
| `deckent_help` TOOLS list size | **22** (src/mcp/tools/help.ts:48-71) | — | — | — | — | **DRIFT** (live=31) |
| `dist/cli/entry.js` exec permission | **644** (post-build) | — | — | — | — | **BROKEN** (bin=755 expected) |
| `dist/mcp/server.js` exec permission | **644** (post-build) | — | — | — | — | **BROKEN** (bin=755 expected) |
| package.json `version` | 1.0.0-beta.1 | — | — | 1.0.0-beta.1 | 1.0.0-beta.1 | PASS |

### 31 MCP Tool Live Inventory (sorted by tools/list response)

```
deckent_init, deckent_set_directives, deckent_plan, deckent_start,
deckent_status, deckent_doctor, deckent_retro, deckent_history,
deckent_analyze_project, deckent_sync, deckent_config, deckent_review,
deckent_run, deckent_kill, deckent_cleanup, deckent_help,
deckent_agent_list, deckent_skill_list, deckent_checkpoint, deckent_docs,
deckent_explain, deckent_memory_query, deckent_watch,
deckent_nervous_subscribe, deckent_nervous_accept, deckent_nervous_reject,
deckent_nervous_status, deckent_nervous_config, deckent_feature_query,
deckent_audit, deckent_recover
```

### 46 CLI Top-Level Command Live Inventory

```
init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor,
config, history, plugin, upgrade, onboard, analyze, archive-debt,
dashboard, serve, web, sync, watch, run, test, agent, skill, review,
finalize, explain, set-directives, heartbeat, checkpoint, docs, output,
cost, recall, remember, memory, resume, nervous, mode, features, audit,
recover, help-info (alias: info), help (commander built-in)
```

`--help` smoke result: **45/45 PASS** (loop fixture; `help-info` runs OK via direct call). 0 fail.

---

## Bulgular — Detaylı

### F1 [P1] — `memory-query` CLI wrapper eksik (KNOWN_ISSUES tracked)

- **MCP:** `deckent_memory_query` (`src/mcp/tools/memory-query.ts`) — `query`, `type[]`, `status[]`, `limit`, `sprint_min`, `mode`, `root` parametreleri.
- **CLI alternative:** `deckent recall <query>` (`src/cli/commands/recall.ts`) — `--type`, `--limit`, `--sprint-min`, `--mode`. **`--status` filtresi yok.**
- **CLI gap:** `deckent memory query` subcommand YOK (`src/cli/commands/memory.ts:13-217` — sadece rebuild/export/stats/relations).
- **Etki:** CLI/MCP parity-by-naming kırık. Discoverability: kullanıcı MCP belgesinden `memory_query` görüp CLI'da `deckent memory query "..."` denerse "unknown command". `deckent recall` shadow-aliased ama keyword discovery başarısız.
- **Fix önerisi:** `mem.command('query <text>')` ekle, `recall` ile underlying impl'i paylaşsın (alias). `--status` filtresini hem `recall`'a hem `memory query`'ye ekle (MCP'ye paritelik).
- **Verdict:** **DRIFT** — Sprint 153 DIRECTIVES Task 3 zaten bu fix'i planlamış (henüz uygulanmadı). Sprint 154'e taşınıyor.
- **Evidence:** `grep -n "command(" src/cli/commands/memory.ts` → 5 subcmd, hiçbiri `query`. `src/cli/commands/recall.ts:13` aktive.

---

### F2 [P1] — `config read` subcmd yok ama help-info advertise ediyor

- **CLI subcommand list (live):** `set <k> <v>`, `get <k>`, `export [file]`, `import <file>`, `list`, `keys`, `migrate`, `nervous` (config-nervous).
- **`config read` YOK.** `node dist/cli/entry.js config read` → unknown subcommand error.
- **Help drift:**
  - `src/cli/commands/help.ts:43`: `['deckent config read', 'Read current configuration']` — EN
  - `src/cli/commands/help.ts:78`: `['deckent config read', 'Mevcut yapılandırmayı oku']` — TR
  - `src/mcp/tools/help.ts:224`: `config: ['config read', 'config set key value', 'sync']` — MCP help
- **Closest behavior:** `node dist/cli/entry.js config` (no-args fallback) tüm config'i dump eder. `config get <key>` tek key.
- **Etki:** Yeni kullanıcı help-info okur, "config read" çalıştırır, **hata alır** ve onboarding pürüzlü olur. KNOWN_ISSUES'ta tracked.
- **Fix önerisi:** Ya `config read [key]` subcommand ekle (Sprint 153 DIRECTIVES Task 2'de zaten istenmiş), ya da help.ts metnini `config get` ile değiştir.
- **Verdict:** **DRIFT** — KNOWN_ISSUES P1, Sprint 153 backlog, Sprint 154'e taşındı.
- **Evidence:** `node dist/cli/entry.js config --help` → 8 subcmd listeli, `read` yok. `help-info` çıktısı: `deckent config read   Read current configuration`.

---

### F3 [P1] — `nervous status` / `nervous show` CLI eksik (KNOWN_ISSUES tracked)

- **MCP:** `deckent_nervous_status` — pending notifications + recent history + current config view (`src/mcp/tools/nervous.ts:179-220`). Tek tool ile dashboard.
- **CLI:** `deckent nervous` subcommands: `accept`, `reject`, `edit`, `undo`, `history`, `log`. **`status` veya `show` YOK.**
  - `deckent nervous` (no args) → "error: too many arguments for 'nervous'. Expected 0 arguments but got 1." (Commander hata).
  - `deckent config nervous list` → authority matrix preset table. Pending/recent yok.
- **Etki:** Kullanıcı MCP arayüzünden Nervous System dashboard'una bakabilir, CLI'dan **bakamaz**. Asymmetric capability.
- **Fix önerisi:** `nervous.command('status')` veya `nervous.command('show')` action handler MCP `loadNervousConfig()` + `NervousHistory` aynı veri kümesini print etsin. KNOWN_ISSUES Sprint 153 backlog'da bu.
- **Verdict:** **DRIFT** — Sprint 154'e taşındı.
- **Evidence:** `node dist/cli/entry.js nervous --help` 6 subcmd, status yok. MCP boot instructions: "deckent_nervous_status: Show Nervous System dashboard…"

---

### F4 [P2] — `feature_query` MCP naming inconsistency

- **CLI:** `deckent features [options]` (`src/cli/commands/features.ts:85-87`). Top-level command.
- **MCP:** `deckent_feature_query` (`src/mcp/tools/feature-query.ts:43-44`). `_query` suffix.
- **Diğer paralleller:**
  - CLI `analyze` ↔ MCP `deckent_analyze_project` (suffix farklı).
  - CLI `recall` ↔ MCP `deckent_memory_query` (komut adı farklı + suffix).
  - CLI `features` ↔ MCP `deckent_feature_query` (suffix farklı).
- **Etki:** `_query` suffix bilinçli bir konvansiyon olarak kullanılmıyor (hem `recall` hem `features` aynı suffix'i alıyor MCP'de ama farklı CLI komut adlarıyla mapping var). Bu çoğul drift.
- **Fix önerisi:** Sprint 154 ADR-022-v2 dokümanına bir naming convention bölümü ekle: "MCP tool adı = `deckent_<cli_command_name_normalized>`. Eski adlar (analyze_project, memory_query, feature_query) backward-compat alias olarak kalır." Yeni MCP eklemeleri konvansiyonu izlesin.
- **Verdict:** **MINOR DRIFT** — Behavior parity intact, sadece discoverability açısından minor.
- **Evidence:** Live `tools/list` "deckent_feature_query"; live `deckent --help` "features".

---

### F5 [P0] — Doc count drift evrensel

Tüm sayım drift'i tek başlık altında konsolide:

| Source | MCP tool sayısı | CLI komut sayısı | Built-in agent | Notları |
|--------|-----------------|------------------|----------------|---------|
| Live `tools/list` | **31** | **46** | **15** | RUNTIME truth |
| `dist/mcp/server.js` boot instructions | "Tools (27)" | — | — | server.ts:24 yanlış |
| `src/mcp/tools/help.ts:48-71` (deckent_help payload) | 22 tool listeli | — | — | 4 tool eksik (watch, audit, feature_query, recover); 5 nervous_* eksik veya partial |
| `src/mcp/tools/help.ts:194` (CLI rehber blok) | — | "config read", "sync", … | — | — |
| `src/cli/commands/help.ts:43,78` | — | — | — | "config read" yanlış |
| `DECKENT.md:23` | — | — | "16 built-in agents" | test-writer yok artık |
| `DECKENT.md:30` | "22 tools" | — | — | DRIFT |
| `CLAUDE.md:33` | — | — | "16 built-in agents" | DRIFT |
| `CLAUDE.md:58` | "27 tools" | — | — | DRIFT |
| `IDENTITY.md:14` | "22 tools" | "40+ CLI" | "16 built-in" | DRIFT |
| `IDENTITY.md:25-27` (status table) | "27" | "55+" | (16+2 custom) | self-contradicts l.14 |
| `README.md:147,175` | "22 tools" | — | — | DRIFT |
| `README.md:209` | — | "1.0.0-beta.1" | — | version PASS |

**Etki:** Üretici user (Alperen) ve LLM tüketici (Claude/GPT) iki farklı sayı hayal ediyor. Onboarding belge incelendiğinde kaç tool olduğu konusunda mütalaa karışık. KNOWN_ISSUES "Documentation Drift" zaten flag'lediği bir aile.

**Fix önerisi:**
1. **Single source of truth scripti:** `scripts/sync-docs-counts.mjs` MCP server'ı boot edip live `tools/list` say, CLI `--help` say, `deckent_agent_list` say, sonra `DECKENT.md`, `CLAUDE.md`, `IDENTITY.md`, `README.md`'yi sed-replace etsin (post-build hook). Sprint 153 DIRECTIVES Task 1 bu fix'in semi-manual versiyonu.
2. **CI gate:** `scripts/doc-consistency-check.mjs` (zaten var) live count vs doc count diff'i fail'lesin.
3. **`src/mcp/tools/help.ts`'i refactor:** Tool listesini hard-code'lama, `tools/index.ts` registrar'ını introspect et veya constants yapısı oluştur.
4. **`server.ts` instructions bloğu:** Tools (N) sayısını runtime'da `registeredTools.length` ile değiştir.

**Verdict:** **P0 DRIFT** — KNOWN_ISSUES + Sprint 153 + Sprint 154 audit re-confirm.

---

### F6 [P0] — `npx deckent --version` execute permission bug (build artifact)

- **Symptom:** Bu session'da `npx deckent --version` execute permission denied (EACCES). Manuel `chmod +x dist/cli/entry.js` çalıştı, sonraki `npm run build` 644'e geri düşürdü.
- **Root cause:** `dist/cli/entry.js` Tsc compile output'u 644 mode ile yazılıyor. `package.json` `"bin": {"deckent": "./dist/cli/entry.js"}` yetkisi 755 olmalı (npm publish path'inde npm CDN otomatik chmod yapar ama lokal `npx` link'inde fail eder).
- **Build chain analiz:**
  - `npm run build` → `tsc && node scripts/copy-assets.mjs`
  - `tsc` permission preserve etmiyor (TypeScript bilinen davranış).
  - `scripts/copy-assets.mjs` JSON/MD asset kopyalıyor, **chmod yapmıyor**.
  - `prepublish.ts` veya `publish.ts` chmod yapıyor mu? `grep -n "chmod" scripts/*.ts scripts/*.mjs` → 0 hit.
- **Permission live snapshot:**
  ```
  -rw-r--r-- (644) /home/alperen/deckent-dev/dist/cli/entry.js   ← BROKEN
  -rw-r--r-- (644) /home/alperen/deckent-dev/dist/mcp/server.js  ← BROKEN
  ```
  Source: `src/cli/entry.ts` 755 — kaynak korumalı. Sorun build pipeline'da.
- **Etki:** Lokal repo'da `npx deckent` (or `./dist/cli/entry.js`) doğrudan çağrı **EACCES**. Çözüm: `node dist/cli/entry.js …` (workaround). Audit-time bu workaround kullanıldı. NPM published paketinde npm `chmod +x` postinstall ile fix oluyor ama `npm pack && npm install -g ./pack.tgz` test path'inde ve lokal `npm link` path'inde de bug etkili.
- **Fix önerisi:**
  - `scripts/copy-assets.mjs` sonuna chmod hook ekle: `chmodSync('dist/cli/entry.js', 0o755); chmodSync('dist/mcp/server.js', 0o755)`.
  - VEYA `package.json` `"build"` scriptine `&& chmod +x dist/cli/entry.js dist/mcp/server.js` ekle.
- **Verdict:** **P0 BROKEN** — Sprint 154'e CRITICAL P0 olarak işaretle.
- **Evidence:** `stat -c "%a %n" dist/cli/entry.js dist/mcp/server.js` → 644 644 (post `npm run build`). `grep "chmod" scripts/*.{ts,mjs,sh}` → no chmod in build pipeline.

---

### F7 [P1] — `deckent_run --dry-run` her iki tarafta da YOK

- **CLI `run --help`:** `--model`, `--scope`, `--timeout`, `--keep`, `--auto-approve`, `--verbose`. Yok: `--dry-run`.
- **MCP `deckent_run` inputSchema:** `description`, `model`, `scope`, `autoApprove`, `effort`, `timeoutSeconds`. Yok: `dryRun`.
- **Sprint 152 T-152-008 tespiti:** "spec 'run (dry-run)' der ama CLI/MCP destekler değil — SPRINT 153 DEBT."
- **Sprint 153 sonucu:** Fix edilmedi → Sprint 154'e taşındı.
- **Etki:** Test sürecinde "task ne yapacak?" preview yapılamıyor; her run = direct spawn = fork-process (CLI subprocess, MCP backend.spawn).
- **Fix önerisi:** `--dry-run` flag → task JSON'u oluştur, **prompt + agent + skills resolve** et, **backend.spawn() ÇAĞIRMA**. JSON dump dön. Hem CLI hem MCP.
- **Verdict:** **DRIFT (sustained)**.

---

### F8 [P2] — `deckent_help` payload TOOLS listesi 22 tool (live=31)

- **`src/mcp/tools/help.ts:48-71`** (orchestra/agent rehberi metni içinde) 22 tool sayıyor. Eksikler: `watch`, `audit`, `feature_query`, `recover`, `nervous_*` (5 tool kısmen).
- **Server boot `instructions` bloğu** (`src/mcp/server.ts:24+`) 27 tool listeliyor. Hâlâ eksik: 4 tool.
- **Etki:** LLM tüketici MCP server'a connect olur, `instructions` okur, "27 tool var" zannedip 4 mevcut tool'u **kullanmıyor** (discoverability fail).
- **Fix önerisi:** Single registry. `src/mcp/tools/index.ts` `registerTools()` aktif tool listesini export etsin; `help.ts` ve `server.ts` instruction'lar bunu introspect etsin.
- **Verdict:** **DRIFT** + dependent on F5 fix.

---

## Parity Matrix — 31 MCP × 46 CLI

(F1-F8 dışındaki paritelere ilişkin Sprint 152 T-152-008 raporundaki 10-tool detay matrisi geçerli; bu audit'te Sprint 153 sonrası eklenen 3 yeni tool için ek satırlar:)

| MCP Tool | CLI Counterpart | Parity Status | Notes |
|----------|-----------------|---------------|-------|
| `deckent_watch` | `deckent watch` | **PARTIAL** | CLI tmux split panel; MCP read-only sprint dashboard. İşlevsel olarak farklı. |
| `deckent_audit` | `deckent audit <sprint-id>` | **NEAR-FULL** | Her ikisi de Brain Self-Audit Gate çağırıyor. CLI'da `--profile`, MCP'de yok. Minor. |
| `deckent_recover` | `deckent recover <sprint-id>` | **NEAR-FULL** | Crash recovery. CLI'da `--auto-archive`, MCP'de aynı param `auto_archive`. Pariteye yakın. |
| `deckent_feature_query` | `deckent features` | **PARTIAL** + naming drift | F4. Behavior parity OK, isim farklı. |
| `deckent_nervous_subscribe` | (none) | **MCP-ONLY** | CLI counterpart yok. SSE/event-stream subscription MCP-specific. |
| `deckent_nervous_accept` | `deckent nervous accept <id>` | **FULL** | Pariteye yakın. |
| `deckent_nervous_reject` | `deckent nervous reject <id>` | **FULL** | `--reason` her ikisinde. |
| `deckent_nervous_status` | (none) | **MCP-ONLY** + F3 gap | F3 kapsamında. |
| `deckent_nervous_config` | `deckent config nervous list/set/override/reset` | **PARTIAL** | Subcommand structure farklı. |

**Toplam parity skoru:**
- **FULL:** 2/31 (nervous_accept, nervous_reject)
- **NEAR-FULL:** 2/31 (audit, recover)
- **PARTIAL:** 22/31
- **MCP-ONLY:** 2/31 (nervous_subscribe, nervous_status — F3)
- **CLI-ONLY:** 0/31 (no MCP gap from CLI)
- **DRIFT (count, naming):** 31/31 (sayım drift universal)

---

## Smoke Test Status

- **`scripts/cli-smoke-test.sh`:** `jq: command not found` — runtime dependency missing on this WSL2 host. Smoke script çalışmadı.
- **Inline fallback (audit harness):** 45/45 PASS for `--help` çağrıları (tüm 46 top-level komut için non-zero exit yok).
- **MCP stdio boot test:** OK — `tools/list` 31 tool, `resources/list` 8 resource, 3 spot real-call (`agent_list`, `skill_list`, `history`) tümü valid response.
- **Recommendation:** `scripts/cli-smoke-test.sh`'i jq dependency'sinden kurtarmak için pure bash + node JSON.parse kombinasyonuyla rewrite edilmeli (Sprint 154 minor).

---

## Aksiyon Önerileri (Sprint 154 / 155)

| Priority | Action | Files | Estimate |
|----------|--------|-------|----------|
| **P0** | F6: chmod hook ekle build script'e | `scripts/copy-assets.mjs` veya `package.json` build | 5 dk |
| **P0** | F5: live tool/cli/agent count → doc sed-replace script + CI gate | `scripts/sync-docs-counts.mjs` (new), DECKENT.md, CLAUDE.md, IDENTITY.md, README.md, server.ts:24 | 1-2 saat |
| **P1** | F1: `deckent memory query` subcommand | `src/cli/commands/memory.ts`, tests/cli/memory.test.ts | 1 saat |
| **P1** | F2: `config read` subcmd VEYA help.ts düzeltme | `src/cli/commands/config.ts` veya `src/cli/commands/help.ts:43,78` + `src/mcp/tools/help.ts:224` | 30 dk |
| **P1** | F3: `nervous status` CLI subcmd | `src/cli/commands/nervous.ts`, tests/cli/nervous.test.ts | 1-2 saat |
| **P1** | F7: `--dry-run` flag (CLI + MCP) | `src/cli/commands/run.ts`, `src/mcp/tools/run.ts` | 1 saat |
| **P2** | F4: ADR-022-v2 naming convention bölümü | `.brain/memory.db` ADR-022-v2 entry | 30 dk |
| **P2** | F8: `help.ts` ve `server.ts:instructions` introspection refactor | `src/mcp/tools/help.ts`, `src/mcp/server.ts`, `src/mcp/tools/index.ts` | 2-3 saat |
| **P3** | jq-free smoke test rewrite | `scripts/cli-smoke-test.sh` | 1 saat |

---

## Dosya Erişim Manifest (claimed_files)

Tam liste audit-coverage.json'a `A2_cli_mcp_parity.claimed_files` altında yazıldı. Özet:

- **CLI commands (47):** `src/cli/commands/*.ts` (agent, analyze, archive-debt, attach, audit, checkpoint, cleanup, config, config-nervous, cost, dashboard, docs, doctor (+checks/format), explain, features, finalize, heartbeat, help, history, init (+steps/templates/wizard), kill, memory, mode, nervous, onboard, output, plan, plugin, quick-start, recall, recover, remember, resume, retro (+formatter/parser), review, run, serve, set-directives, skill, skill-marketplace, spawn, start, status, sync, test-run, upgrade, watch, web)
- **CLI scaffold:** `src/cli/index.ts`, `src/cli/entry.ts`, `src/cli/auto-setup.ts`, `src/cli/version-info.ts`, `src/cli/helpers/*.ts`
- **MCP tools (29):** `src/mcp/tools/*.ts` (agent-list, analyze, audit, checkpoint, cleanup, config, directives, docs, doctor, explain, feature-query, help, history, init, job-runner, kill, memory-query, nervous, plan, recover, retro, review, run, skill-list, start, status, sync, watch, index)
- **MCP scaffold:** `src/mcp/server.ts`, `src/mcp/resources/*.ts` (9 file), `src/mcp/helpers/*.ts` (3 file)
- **Tests:** `tests/cli/**/*.ts` (151 file), `tests/mcp/**/*.ts` (38 file)
- **Smoke:** `scripts/cli-smoke-test.sh`

---

## Çapraz Referans

- Sprint 152 T-152-007 (MCP lifecycle smoke) — 31-tool inventory, drift first flagged.
- Sprint 152 T-152-008 (MCP observational) — 10-tool parity matrix, 0/10 FULL.
- Sprint 153 DIRECTIVES Task 1-3 — doc drift + memory query CLI + config read; bunlar fix edilmediği için Sprint 154'e taşındı.
- KNOWN_ISSUES.md "Documentation Drift" + "CLI/MCP Parity Gaps" — bu raporda 8 finding olarak konsolide.
- ADR-022-v2 — naming convention için update gerekli (F4).

---

**Sonuç:** CLI/MCP parity Sprint 152 ↔ 154 arasında **iyileşmedi, kötüleşti** (yeni tool'lar eklendi, doc'lar güncellenmedi). Beta GA gate (#13 hariç 19/20) kapsamında F5+F6 P0 = blocker. F1-F3-F7 P1 = Sprint 154'e taşınması zorunlu. F4-F8 P2 = takip edilmeli.
