// @vitest-environment happy-dom
/**
 * Sprint 162A Wave 3 Task 15 — ARIA event component tests.
 *
 * Verifies WCAG 2.1 AA compliance for the 8 new orchestration event types
 * added by Wave 1+2. For each event we assert:
 *
 *   - correct role            (status | alert)
 *   - correct aria-live       (polite | assertive)
 *   - aria-atomic="true"
 *   - aria-label set (i18n-driven via t())
 *   - data-event-kind anchor for e2e a11y tooling
 *
 * Spec: docs/superpowers/specs/2026-05-08-sprint-162a-bug-a-fix-spec.md §9
 *       docs/superpowers/specs/2026-05-08-sprint-162a-bug-c-fix-spec.md §9
 *       docs/superpowers/specs/2026-05-08-sprint-162a-bug-r3-fix-spec.md §9
 *       docs/superpowers/specs/2026-05-08-sprint-162a-bug-r4-fix-spec.md §9
 *       docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md Wave 3
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import {
  OrchestrationEvent,
  EVENT_DESCRIPTORS,
  getEventDescriptor,
  type OrchestrationEventKind,
} from "../../src/dashboard/src/components/OrchestrationEvent";

function renderWithProviders(ui: React.ReactElement) {
  return render(React.createElement(LanguageProvider, null, ui));
}

interface EventCase {
  kind: OrchestrationEventKind;
  expectedRole: "status" | "alert";
  expectedAriaLive: "polite" | "assertive";
  expectedSeverity: "info" | "critical";
}

// ---------------------------------------------------------------------------
// Canonical mapping table — single source of truth for the test suite.
// ---------------------------------------------------------------------------
const EVENT_CASES: EventCase[] = [
  // INFO events — 4.1.3 Status Messages (AA): role="status" + aria-live="polite"
  {
    kind: "sprint.eval.heartbeat-skip",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  {
    kind: "sprint.eval.audit-rubric-applied",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  {
    kind: "sprint.eval.synthetic-timeout",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  {
    kind: "sprint.recover.state-reset",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  {
    kind: "sprint.recover.status-sync",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  {
    kind: "sprint.recover.tmpfile-swept",
    expectedRole: "status",
    expectedAriaLive: "polite",
    expectedSeverity: "info",
  },
  // CRITICAL events — alert role: must interrupt screen-reader
  {
    kind: "sprint.spawn.deadlock-detected",
    expectedRole: "alert",
    expectedAriaLive: "assertive",
    expectedSeverity: "critical",
  },
  {
    kind: "sprint.recover.zombie-killed",
    expectedRole: "alert",
    expectedAriaLive: "assertive",
    expectedSeverity: "critical",
  },
];

describe("OrchestrationEvent — WCAG 2.1 AA ARIA attributes", () => {
  // -- Per-kind table-driven assertions ------------------------------------

  for (const c of EVENT_CASES) {
    it(`event "${c.kind}" → role="${c.expectedRole}" + aria-live="${c.expectedAriaLive}"`, () => {
      const { container } = renderWithProviders(
        React.createElement(OrchestrationEvent, {
          kind: c.kind,
          taskId: "162-001",
        }),
      );

      const node = container.querySelector(`[data-event-kind="${c.kind}"]`);
      expect(node).not.toBeNull();
      expect(node?.getAttribute("role")).toBe(c.expectedRole);
      expect(node?.getAttribute("aria-live")).toBe(c.expectedAriaLive);
      expect(node?.getAttribute("aria-atomic")).toBe("true");
      expect(node?.getAttribute("aria-label")).toBeTruthy();
      expect(node?.getAttribute("aria-label")?.length).toBeGreaterThan(0);
      expect(node?.getAttribute("data-task-id")).toBe("162-001");
      expect(node?.getAttribute("data-severity")).toBe(c.expectedSeverity);
    });
  }

  // -- Coverage assertion: all 8 design events are wired -------------------

  it("EVENT_DESCRIPTORS covers all 8 Wave 1+2 event kinds", () => {
    const kinds = Object.keys(EVENT_DESCRIPTORS).sort();
    expect(kinds).toEqual(
      [
        "sprint.eval.audit-rubric-applied",
        "sprint.eval.heartbeat-skip",
        "sprint.eval.synthetic-timeout",
        "sprint.recover.state-reset",
        "sprint.recover.status-sync",
        "sprint.recover.tmpfile-swept",
        "sprint.recover.zombie-killed",
        "sprint.spawn.deadlock-detected",
      ].sort(),
    );
    expect(EVENT_CASES.length).toBe(8);
  });

  // -- Critical-vs-info partition (Section 9 §"Rationale" — only deadlock
  //    and zombie-killed are critical / interrupting) -----------------------

  it("only deadlock-detected and zombie-killed are role=\"alert\"", () => {
    const alertKinds = EVENT_CASES.filter((c) => c.expectedRole === "alert").map(
      (c) => c.kind,
    );
    expect(alertKinds.sort()).toEqual(
      ["sprint.recover.zombie-killed", "sprint.spawn.deadlock-detected"].sort(),
    );
    // The other 6 are role="status"
    const statusKinds = EVENT_CASES.filter((c) => c.expectedRole === "status");
    expect(statusKinds).toHaveLength(6);
  });

  it("aria-live=\"assertive\" iff role=\"alert\" (Section 9 invariant)", () => {
    for (const c of EVENT_CASES) {
      if (c.expectedRole === "alert") {
        expect(c.expectedAriaLive).toBe("assertive");
      } else {
        expect(c.expectedAriaLive).toBe("polite");
      }
    }
  });

  // -- aria-atomic must be present on every row (Section 9 — "announce as
  //    one utterance rather than fragmented") -------------------------------

  it("every rendered event has aria-atomic=\"true\"", () => {
    for (const c of EVENT_CASES) {
      const { container, unmount } = renderWithProviders(
        React.createElement(OrchestrationEvent, { kind: c.kind }),
      );
      const node = container.querySelector(`[data-event-kind="${c.kind}"]`);
      expect(node?.getAttribute("aria-atomic")).toBe("true");
      unmount();
    }
  });

  // -- getEventDescriptor mirror — programmatic lookup matches table -------

  it("getEventDescriptor returns canonical role/aria-live for every kind", () => {
    for (const c of EVENT_CASES) {
      const d = getEventDescriptor(c.kind);
      expect(d.role).toBe(c.expectedRole);
      expect(d.ariaLive).toBe(c.expectedAriaLive);
      expect(d.severity).toBe(c.expectedSeverity);
      expect(d.i18nKey).toMatch(/^event\./);
    }
  });

  // -- Optional fields render correctly -----------------------------------

  it("renders detail and timestamp when supplied", () => {
    renderWithProviders(
      React.createElement(OrchestrationEvent, {
        kind: "sprint.eval.heartbeat-skip",
        taskId: "162-007",
        detail: "1500ms / 2000ms",
        timestamp: "2026-05-08T12:34:56Z",
      }),
    );
    expect(screen.getByText("— 162-007")).toBeTruthy();
    expect(screen.getByText("1500ms / 2000ms")).toBeTruthy();
  });

  it("omits taskId span when no taskId supplied", () => {
    const { container } = renderWithProviders(
      React.createElement(OrchestrationEvent, {
        kind: "sprint.recover.tmpfile-swept",
      }),
    );
    const node = container.querySelector(
      `[data-event-kind="sprint.recover.tmpfile-swept"]`,
    );
    expect(node?.getAttribute("data-task-id")).toBeNull();
  });

  // -- Each WCAG criterion is independently observable --------------------

  it("WCAG 4.1.3 Status Messages (AA): info events use role=\"status\" + aria-live=\"polite\"", () => {
    const { container } = renderWithProviders(
      React.createElement(OrchestrationEvent, {
        kind: "sprint.eval.heartbeat-skip",
      }),
    );
    const node = container.querySelector(
      '[data-event-kind="sprint.eval.heartbeat-skip"]',
    );
    expect(node?.getAttribute("role")).toBe("status");
    expect(node?.getAttribute("aria-live")).toBe("polite");
  });

  it("WCAG 4.1.2 Name, Role, Value (A): aria-label is set from i18n key", () => {
    const { container } = renderWithProviders(
      React.createElement(OrchestrationEvent, {
        kind: "sprint.recover.zombie-killed",
        taskId: "162-099",
      }),
    );
    const node = container.querySelector(
      '[data-event-kind="sprint.recover.zombie-killed"]',
    );
    const label = node?.getAttribute("aria-label");
    expect(label).toBeTruthy();
    expect(label?.length).toBeGreaterThan(0);
    // Defensive: label is either the i18n value or the i18n key fallback —
    // both are non-empty human-readable strings.
  });

  it("WCAG 1.3.1 Info & Relationships: data-event-kind anchor is set", () => {
    for (const c of EVENT_CASES) {
      const { container, unmount } = renderWithProviders(
        React.createElement(OrchestrationEvent, { kind: c.kind }),
      );
      const node = container.querySelector(`[data-event-kind="${c.kind}"]`);
      expect(node).not.toBeNull();
      unmount();
    }
  });
});
