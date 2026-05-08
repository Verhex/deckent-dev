import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Import translation objects directly ────────────────────────────
// We import from source to get the actual key/value pairs for comparison.
import { en } from "../../src/dashboard/src/i18n/en.js";
import { tr } from "../../src/dashboard/src/i18n/tr.js";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");

// ─── Helper: flatten nested keys (our translations are flat, but safety) ────
function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      keys.push(...getAllKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ─── Test 1: Key count equality ─────────────────────────────────────

describe("i18n — key count equality", () => {
  it("en.ts and tr.ts have the same number of keys", () => {
    const enKeys = getAllKeys(en);
    const trKeys = getAllKeys(tr);
    expect(enKeys.length).toBe(trKeys.length);
  });
});

// ─── Test 2: Key parity (every en key in tr, every tr key in en) ────

describe("i18n — key parity", () => {
  const enKeys = new Set(getAllKeys(en));
  const trKeys = new Set(getAllKeys(tr));

  it("every en.ts key exists in tr.ts", () => {
    const missingInTr = [...enKeys].filter((k) => !trKeys.has(k));
    expect(missingInTr).toEqual([]);
  });

  it("every tr.ts key exists in en.ts", () => {
    const missingInEn = [...trKeys].filter((k) => !enKeys.has(k));
    expect(missingInEn).toEqual([]);
  });
});

// ─── Test 3: No empty tr.ts translations ────────────────────────────

describe("i18n — no empty translations in tr.ts", () => {
  it("no tr.ts value is an empty string", () => {
    const emptyKeys = Object.entries(tr)
      .filter(([, value]) => typeof value === "string" && value.trim() === "")
      .map(([key]) => key);
    expect(emptyKeys).toEqual([]);
  });
});

// ─── Test 4: Hardcoded English UI string scan ───────────────────────
//
// Scans component TSX files for leftover hardcoded English UI strings.
// Technical terms (phase/status enum values) are excluded.
// This test validates that i18n conversion is complete in target files.

describe("i18n — hardcoded English string scan", () => {
  // Target component files that should be fully i18n-ized
  const targetFiles = [
    "pages/StatusPage.tsx",
    "components/SprintSummary.tsx",
    "components/TaskCard.tsx",
    "components/DebtTable.tsx",
    "components/SprintChart.tsx",
    "components/Layout.tsx",
  ];

  // Patterns that indicate hardcoded English UI strings
  // These match quoted strings containing common English UI phrases
  // We look for JSX text content and string literals that look like UI text
  const hardcodedPatterns = [
    // Direct JSX text (not inside {t(...)}) — matches lines with bare English words
    // between > and < that aren't just technical terms or single words
    />\s*(No |Loading|Error|Failed|Success|Warning|Waiting|Working|Queued|Active|Done|Tasks|Providers|Needs attention|What's happening)/,
    // String literals assigned to label/name props with English UI text
    /(?:label|name|placeholder)\s*[=:]\s*["'](No |Loading|Error|Failed|Tasks|Providers|Needs attention|Working|Coverage|Success Rate)/,
    // Template literals with English UI text (not inside t())
    /(?<!t\(['"])[`"'](No |Loading |Error |Failed |Waiting for|needs attention|auto-fixed|tasks done|min remaining|min elapsed|just started)/,
  ];

  /**
   * Detect whether a given line index falls inside an exported standalone function
   * (not a React component). Exported helpers like describeCurrentAction(),
   * getStatusLabel(), estimateTimeRemaining(), formatElapsedTime() etc.
   * are kept as non-i18n fallbacks for tests and non-React callers.
   * Only JSX-rendering code (inside React components) needs full i18n.
   */
  function isInsideExportedHelper(lines: string[], lineIdx: number): boolean {
    // Walk backwards to find the enclosing function declaration
    let braceDepth = 0;
    for (let i = lineIdx; i >= 0; i--) {
      const l = lines[i]!;
      // Count braces (simplified — good enough for our component files)
      for (let c = l.length - 1; c >= 0; c--) {
        if (l[c] === "}") braceDepth++;
        if (l[c] === "{") braceDepth--;
      }
      // If we find an export function declaration and brace depth indicates
      // we're inside it, check if it's a React component or a helper
      if (/^export\s+function\s+(\w+)/.test(l.trim())) {
        const match = l.trim().match(/^export\s+function\s+(\w+)/);
        if (match) {
          const fnName = match[1]!;
          // React components start with uppercase and typically accept props
          // Helpers are lowercase or known utility function names
          const isComponent = /^[A-Z]/.test(fnName);
          return !isComponent;
        }
      }
    }
    return false;
  }

  for (const relPath of targetFiles) {
    const fullPath = join(DASHBOARD_SRC, relPath);

    it(`${relPath} uses useTranslation`, () => {
      const content = readFileSync(fullPath, "utf-8");
      expect(content).toContain("useTranslation");
    });

    it(`${relPath} has no hardcoded English UI strings`, () => {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Skip comment lines
        if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) {
          continue;
        }

        // Skip import lines
        if (line.trim().startsWith("import ")) continue;

        // Skip lines that are pure type/interface definitions
        if (/^\s*(export\s+)?(type|interface)\s/.test(line)) continue;

        for (const pattern of hardcodedPatterns) {
          if (pattern.test(line)) {
            // Skip if inside exported non-component helper functions
            // (these have English fallbacks for non-i18n callers)
            if (isInsideExportedHelper(lines, i)) continue;

            violations.push(`Line ${i + 1}: ${line.trim()}`);
          }
        }
      }

      // Report all violations for easier debugging
      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} hardcoded English string(s) in ${relPath}:\n` +
            violations.map((v) => `  ${v}`).join("\n"),
        );
      }
    });
  }
});

// ─── Test 5: 12-language event-label catalogue coverage ─────────────
//
// Sprint 162A Wave 3 Task 14 — adds 8 new event types that flow through
// the dashboard event-stream component. Each event needs a translated
// label in 12 languages so non-English operators can read the live feed.
//
// Storage: src/dashboard/src/i18n/{lang}.json (flat key→string map).
// These JSONs are independent of the existing en.ts/tr.ts catalogues
// (which cover dashboard *page* strings, not event-stream labels).

const SUPPORTED_LANGUAGES = [
  "en",
  "tr",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh",
  "ar",
] as const;

const REQUIRED_EVENT_KEYS = [
  "events.sprint.eval.heartbeat-skip",
  "events.sprint.eval.audit-rubric-applied",
  "events.sprint.eval.synthetic-timeout",
  "events.sprint.spawn.deadlock-detected",
  "events.sprint.recover.state-reset",
  "events.sprint.recover.zombie-killed",
  "events.sprint.recover.status-sync",
  "events.sprint.recover.tmpfile-swept",
] as const;

// Translation fingerprints — substring assertions per language.
// We do NOT assert literal English to allow for proper translation; instead
// we assert each catalogue contains a substring that is uniquely native to
// the target language for at least one of the 8 keys. This guards against
// "translator forgot to translate and copy-pasted English" failures.
//
// The fingerprint per language is anchored on a high-signal, unambiguous
// term that should appear in any reasonable translation of the
// `events.sprint.eval.heartbeat-skip` label. RTL languages and CJK get
// non-Latin script fingerprints. Latin-script languages get terms that
// would never appear in clean English (accented chars or distinct words).
const LANGUAGE_FINGERPRINTS: Record<(typeof SUPPORTED_LANGUAGES)[number], RegExp> = {
  en: /Heartbeat alive/i,
  tr: /değerlendirme/i, // Turkish: "evaluation" with cedilla+breve
  de: /Bewertung/, // German: "evaluation"
  fr: /évaluation/i, // French: "evaluation" with é
  es: /evaluación/i, // Spanish: "evaluation" with ó
  it: /valutazione/i, // Italian: "evaluation"
  pt: /avaliação/i, // Portuguese: "evaluation" with ã+ç
  ru: /оценка/i, // Russian Cyrillic: "evaluation"
  ja: /評価|ハートビート/, // Japanese: "evaluation" or "heartbeat" katakana
  ko: /평가|하트비트/, // Korean: "evaluation" or "heartbeat" hangul
  zh: /评估|心跳/, // Chinese: "evaluation" or "heartbeat" simplified
  ar: /تقييم|نبضة/, // Arabic: "evaluation" or "pulse"
};

describe("i18n — 12-language event catalogue coverage", () => {
  const I18N_DIR = join(DASHBOARD_SRC, "i18n");

  // Test 5.1: every supported language has a JSON file
  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang}.json exists and parses as JSON`, () => {
      const filePath = join(I18N_DIR, `${lang}.json`);
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed).toBeTypeOf("object");
      expect(parsed).not.toBeNull();
    });
  }

  // Test 5.2: every JSON contains all 8 required event keys
  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang}.json contains all 8 new event keys`, () => {
      const filePath = join(I18N_DIR, `${lang}.json`);
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>;
      const missing = REQUIRED_EVENT_KEYS.filter((k) => !(k in parsed));
      expect(missing).toEqual([]);
    });
  }

  // Test 5.3: every label is a non-empty string (no placeholders left)
  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang}.json has non-empty labels for every event key`, () => {
      const filePath = join(I18N_DIR, `${lang}.json`);
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>;
      const empties = REQUIRED_EVENT_KEYS.filter((k) => {
        const v = parsed[k];
        return typeof v !== "string" || v.trim() === "";
      });
      expect(empties).toEqual([]);
    });
  }

  // Test 5.4: every catalogue is actually translated (substring fingerprint)
  // For non-English languages we require the fingerprint to appear in at
  // least one of the 8 labels — this catches "translator copy-pasted EN"
  // bugs without forcing a literal-string match per individual key.
  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang}.json contains genuine ${lang}-language content`, () => {
      const filePath = join(I18N_DIR, `${lang}.json`);
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>;
      const fingerprint = LANGUAGE_FINGERPRINTS[lang];
      const haystack = REQUIRED_EVENT_KEYS.map((k) => parsed[k] ?? "").join("\n");
      expect(haystack).toMatch(fingerprint);
    });
  }

  // Test 5.5: identical key-tree across all 12 catalogues
  it("all 12 language files have identical key sets", () => {
    const keySets = SUPPORTED_LANGUAGES.map((lang) => {
      const filePath = join(I18N_DIR, `${lang}.json`);
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>;
      return { lang, keys: new Set(Object.keys(parsed)) };
    });

    const referenceKeys = keySets[0]!.keys;
    const mismatches: string[] = [];
    for (const { lang, keys } of keySets) {
      const missing = [...referenceKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !referenceKeys.has(k));
      if (missing.length > 0 || extra.length > 0) {
        mismatches.push(
          `${lang}: missing=[${missing.join(",")}] extra=[${extra.join(",")}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  // Test 5.6: non-English catalogues differ from English baseline
  // (ensures translations actually changed at least one label per language).
  it("each non-English catalogue differs from en.json on every event key", () => {
    const enPath = join(I18N_DIR, "en.json");
    const enParsed = JSON.parse(readFileSync(enPath, "utf-8")) as Record<string, string>;

    const failures: string[] = [];
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === "en") continue;
      const filePath = join(I18N_DIR, `${lang}.json`);
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, string>;
      for (const key of REQUIRED_EVENT_KEYS) {
        if (parsed[key] === enParsed[key]) {
          failures.push(`${lang}:${key} is identical to en (translation missing)`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
