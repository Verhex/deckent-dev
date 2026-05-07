#!/usr/bin/env node
/**
 * Sprint 154 Wave D / T13 — Insert ADR-043 + ADR-044 into Memory V2 DB.
 *
 * ADR-043: Hot Fix with Claude Subagents — Pipeline-Bypass Repair Pattern
 *          (Sprint 150A + 152.5 + 154 üçüncü uygulaması after this commit)
 * ADR-044: Sprint 154 Comprehensive Audit Methodology — 10-Agent Parallel
 *          Pass + Pipeline Wire Validation (87 finding, 13 P0)
 *
 * Reference: docs/audits/sprint-154/EXECUTIVE-SUMMARY.md
 */

import { MemoryStore } from '../dist/core/memory-store.js';
import { join } from 'node:path';

const DB_PATH = join(process.cwd(), '.brain', 'memory.db');
const store = new MemoryStore(DB_PATH);

const today = new Date().toISOString().slice(0, 10);

const adr043 = {
  id: 'adr-043',
  type: 'adr',
  status: 'accepted',
  sprint_id: 'sprint-154',
  title: 'Hot Fix with Claude Subagents — Pipeline-Bypass Repair Pattern',
  content: `## Decision
Deckent kendi pipeline'ı bozulduğunda (worker spawn, prompt delivery,
config persistence vb. catastrophic bug), Deckent'le Deckent'i tamir
sonsuz döngü riski yerine Claude Code subagent'lar (general-purpose
Agent tool) ile cerrahi müdahale yapılır. Sprint pipeline bypass edilir,
sadece **deploy-level** bug fix için uygulanır.

## Context
- Sprint 150A (2026-04-21): 7 hot fix, ~68 dakika, ~1M token, 145+ file,
  +6047/-5473 LoC. Canlı kanıt: \`ℹ️ [deckent] Task H6 DONE\` Alperen
  terminal'inde — DECKENT→USER:NOTIFY 12 sprint sonra canlandı.
- Sprint 152.5 (2026-04-24): 4 Beta GA blocker (HF1 GLIBC, HF2 verification-blind,
  HF3 rules silent catch, HF4 MCP provider parity), ~2 saat.
- Sprint 154 (2026-05-07): 13 P0 hot fix, 4 wave (Wave A direct, Wave B+C
  subagent), ~75 dakika. KESIN ROOT CAUSE bulundu: spawn-backend-docker.ts
  .claude.json:ro mount → silent EROFS exit (Sprint 144→153 9-sprint
  worker timeout krizinin kaynağı).

## Consequence
- Pattern artık ADR olarak kayıt altında, Sprint 200'e kadar geçerli
- Deckent kendi kendini tamir edemediğinde başvurulan kanonik repair pathway
- Pipeline güvensizliğin somut göstergesi; her uygulama Sprint reporter
  ve memory'ye meta-dogfood kanıt olarak kaydedilir
- Sprint 150A pattern → Sprint 152.5 → Sprint 154 — şimdi 3. uygulama
  istatistik trend'i

## Trigger Conditions
1. Sprint pipeline catastrophic bug (worker timeout cascade, prompt delivery,
   spawn fail) yaşandığında
2. Deckent run sonucu şüpheli (linesAdded:0 hepsi gibi) ve root cause
   pipeline'da olabilir
3. Beta GA gate kapanışı için pipeline-bypass cerrahi şart`,
  tags: ['sprint-154', 'hot-fix-pattern', 'pipeline-bypass', 'subagent', 'meta-dogfood'],
  created_at: today,
  updated_at: today,
};

const adr044 = {
  id: 'adr-044',
  type: 'adr',
  status: 'accepted',
  sprint_id: 'sprint-154',
  title: 'Sprint 154 Comprehensive Audit — 10-Agent Parallel Pass + Pipeline Wire Validation',
  content: `## Decision
Sprint 152 audit'in (verification-blind bug ile yanlış sayım, 8/36 DONE
iddiası gerçekte 27/30) ardından, runtime stability ve veri tutarlılığı
krizine cevap olarak Sprint 154'te 10 paralel general-purpose subagent
ile comprehensive audit pass yapıldı: 273 file explicit claim, 87 finding
(13 P0, 21 P1, 30 P2, 23 P3), 3739 satır audit raporu.

## Context
- Sprint 144→153 9-sprint boyunca yaşanan worker timeout/0 line yazma
  pattern'i çözülmemiş kaldı; her sprint debt birikti
- Sprint 152 audit raporları geçerli ama Brain rapor yanlış sayım yaptı
- Hot Fix with Subagents pattern (ADR-043) 2 kez kullanıldı, 3. kez
  bekleniyordu
- Veri dağınıklığı: 102 docs/.md + 20 top-level .md + 76 audit + 22 decision
  + 42 ADR + 401 source — single source of truth iddiası teorik kalıyordu

## Methodology
- 10 paralel agent dispatch (mutually-exclusive scope, audit-coverage.json
  registry, T-154-NNN-*.md rapor formatı)
- Wall-clock ~12 dakika paralel + ~5 dakika consolidation
- ~1.3M token toplam
- Per-agent deliverable: file inventory + findings (verification gate
  zorunlu) + drift matrix + recommendations

## Consequence
- KESIN ROOT CAUSE bulundu: A1.F1 spawn-backend-docker.ts:257 .claude.json:ro
  mount → silent EROFS exit. **1 satır fix.**
- 4 mimari sürpriz (P0): Sprint Pipeline advanced features (respawnEligibleTasks,
  applyCascadeToSprint, applyUnblockToSprint, reconcileSpuriousNoGo wire)
  production'da hiç çağrılmıyordu — Sprint 154 Wave B'de wire edildi
- ADR-039 Self-Modifying Detector 12+ sprint dormant — Sprint 154 Wave B
  T9'da wire edildi (task-builder + worker.ts call site'ları)
- Nervous system half-loop kapandı — observer.on('detection') Dispatcher
  + HistoryStore'a wire (Wave B T8)
- 13 P0 fix Sprint 154 Hot Fix Day'inde Claude Code subagent pattern (ADR-043)
  ile uygulandı, Deckent pipeline koşturulmadı
- A10.F8 meta-irony: feedback_break_sprint_bug_cycle.md "yeni audit önerme"
  kuralı çiğnendi ama gerekçeli — Sprint 152 listeleme, Sprint 154 kanıt+fix.
  Kural revize: "audit önerme **kanıt yoksa**, sürpriz çıkarsa diagnostic dispatch yap"

## References
- docs/audits/sprint-154/EXECUTIVE-SUMMARY.md (87 finding consolidation)
- docs/audits/sprint-154/SPRINT-154-DIRECTIVES.md (13 P0 task taslağı)
- docs/audits/sprint-154/T-154-001..010-*.md (10 individual audit raporu)
- docs/audits/sprint-154/audit-coverage.json (registry, 273 file, 10/10 complete)
- ADR-043 (Hot Fix with Subagents — execution pattern)
- /home/alperen/.claude/plans/rippling-noodling-pie.md (audit plan dokümanı)`,
  tags: ['sprint-154', 'audit-methodology', 'parallel-dispatch', 'pipeline-wire', 'meta-dogfood', 'root-cause-claude-json'],
  created_at: today,
  updated_at: today,
};

let inserted = 0;
let updated = 0;

for (const adr of [adr043, adr044]) {
  const existing = store.getById(adr.id);
  if (existing) {
    store.update(adr.id, adr);
    updated++;
    console.log(`  ↻ Updated ${adr.id}: ${adr.title}`);
  } else {
    store.insert(adr);
    inserted++;
    console.log(`  + Inserted ${adr.id}: ${adr.title}`);
  }
}

const total = store.getByType('adr').length;
console.log(`\n✓ ADR insert complete: +${inserted} new, ${updated} updated. Total ADRs: ${total}`);

store.close();
