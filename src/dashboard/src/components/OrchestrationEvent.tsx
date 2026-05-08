import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslationKey } from "../i18n/en";

/**
 * OrchestrationEvent — Sprint 162A Wave 3 Task 15 (a11y)
 *
 * Renders the 8 new orchestration event types (added by Wave 1+2) with
 * WCAG 2.1 AA-compliant ARIA attributes:
 *
 *   - role="status" + aria-live="polite" for non-critical info events
 *     (heartbeat-skip, audit-rubric-applied, synthetic-timeout,
 *      status-sync, state-reset, tmpfile-swept).
 *   - role="alert"  + aria-live="assertive" for critical events
 *     (deadlock-detected, zombie-killed).
 *   - aria-atomic="true" so each row is announced as a single utterance
 *     instead of fragmented (per fix-spec INV-A §9 "Rationale").
 *   - aria-label is i18n-driven (`t(...)`) per fix-spec §9 mapping.
 *   - data-event-kind / data-task-id provide deterministic anchors for
 *     end-to-end accessibility tests (axe-core, playwright-axe).
 *
 * WCAG 2.1 mapping:
 *   - 4.1.3 Status Messages (Level AA) — role="status" + aria-live="polite".
 *   - 1.3.1 Info and Relationships         — data-* semantic anchors.
 *   - 4.1.2 Name, Role, Value (Level A)    — explicit role + aria-label.
 *
 * Spec references:
 *   - docs/superpowers/specs/2026-05-08-sprint-162a-bug-a-fix-spec.md §9
 *   - docs/superpowers/specs/2026-05-08-sprint-162a-bug-c-fix-spec.md §9
 *   - docs/superpowers/specs/2026-05-08-sprint-162a-bug-r3-fix-spec.md §9
 *   - docs/superpowers/specs/2026-05-08-sprint-162a-bug-r4-fix-spec.md §9
 *   - docs/superpowers/specs/2026-05-08-sprint-162a-orchestration-repair-design.md §Wave 3
 */

export type OrchestrationEventKind =
  | "sprint.eval.heartbeat-skip"
  | "sprint.eval.audit-rubric-applied"
  | "sprint.eval.synthetic-timeout"
  | "sprint.spawn.deadlock-detected"
  | "sprint.recover.state-reset"
  | "sprint.recover.zombie-killed"
  | "sprint.recover.status-sync"
  | "sprint.recover.tmpfile-swept";

export type EventSeverity = "info" | "critical";

interface EventDescriptor {
  /** WAI-ARIA role — "status" for info, "alert" for critical. */
  role: "status" | "alert";
  /** aria-live politeness — "polite" for info, "assertive" for critical. */
  ariaLive: "polite" | "assertive";
  /** Severity classifier (for callers / styling). */
  severity: EventSeverity;
  /** i18n translation key for the human-readable label. */
  i18nKey: TranslationKey;
}

/**
 * Per-event ARIA + i18n descriptor table.
 *
 * Critical events (alert / assertive): `deadlock-detected`, `zombie-killed`.
 * All other 6 events are informational (status / polite).
 *
 * The i18n keys mirror the catalogue defined by the parent design (Wave 3
 * Task 14 — `src/dashboard/i18n/{en,tr,...}.ts`). If a key has not yet been
 * added to a given locale, `LanguageProvider.t()` falls back to the key
 * string itself, which is still a meaningful human-readable identifier
 * for screen-reader announcement.
 */
export const EVENT_DESCRIPTORS: Record<OrchestrationEventKind, EventDescriptor> = {
  "sprint.eval.heartbeat-skip": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.eval.heartbeatSkip.label" as TranslationKey,
  },
  "sprint.eval.audit-rubric-applied": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.eval.auditRubricApplied.label" as TranslationKey,
  },
  "sprint.eval.synthetic-timeout": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.eval.syntheticTimeout.label" as TranslationKey,
  },
  "sprint.spawn.deadlock-detected": {
    role: "alert",
    ariaLive: "assertive",
    severity: "critical",
    i18nKey: "event.sprint.spawn.deadlockDetected.label" as TranslationKey,
  },
  "sprint.recover.state-reset": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.recover.stateReset.label" as TranslationKey,
  },
  "sprint.recover.zombie-killed": {
    role: "alert",
    ariaLive: "assertive",
    severity: "critical",
    i18nKey: "event.sprint.recover.zombieKilled.label" as TranslationKey,
  },
  "sprint.recover.status-sync": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.recover.statusSync.label" as TranslationKey,
  },
  "sprint.recover.tmpfile-swept": {
    role: "status",
    ariaLive: "polite",
    severity: "info",
    i18nKey: "event.sprint.recover.tmpfileSwept.label" as TranslationKey,
  },
};

export interface OrchestrationEventProps {
  /** Discriminator — one of the 8 Wave 1+2 event kinds. */
  kind: OrchestrationEventKind;
  /** Sprint task associated with the event (optional — not all events carry one). */
  taskId?: string;
  /** Detail text (e.g. "{hbAgeMs}ms / {graceMs}ms") rendered after the label. */
  detail?: string;
  /** ISO 8601 timestamp; if provided, rendered in HH:MM:SS leading the row. */
  timestamp?: string;
  /** Optional className passthrough for custom styling. */
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * Look up the ARIA + i18n descriptor for a given event kind.
 * Exported for use by callers that render their own DOM but still need
 * the canonical role / aria-live / aria-label mapping (e.g. the existing
 * `ActivityFeed` component).
 */
export function getEventDescriptor(
  kind: OrchestrationEventKind,
): EventDescriptor {
  return EVENT_DESCRIPTORS[kind];
}

export function OrchestrationEvent({
  kind,
  taskId,
  detail,
  timestamp,
  className,
}: OrchestrationEventProps) {
  const { t } = useTranslation();
  const descriptor = EVENT_DESCRIPTORS[kind];
  // `t()` falls back to the key string if the locale has not yet defined
  // this entry — this is correct behaviour and matches LanguageProvider.tsx:47.
  const label = t(descriptor.i18nKey);

  const baseClass =
    "flex items-start gap-2 text-xs px-2 py-1 rounded-sm";
  const severityClass =
    descriptor.severity === "critical"
      ? "bg-red-950/40 text-red-200 border border-red-900/60"
      : "text-zinc-300";
  const finalClass = [baseClass, severityClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role={descriptor.role}
      aria-live={descriptor.ariaLive}
      aria-atomic="true"
      aria-label={label}
      data-event-kind={kind}
      data-task-id={taskId}
      data-severity={descriptor.severity}
      className={finalClass}
    >
      {timestamp && (
        <span className="text-zinc-500 font-mono shrink-0 mt-0.5">
          {formatTime(timestamp)}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <span className="font-medium">{label}</span>
        {taskId && (
          <span className="ml-1 text-zinc-500 font-mono">— {taskId}</span>
        )}
        {detail && (
          <span className="block text-zinc-500 truncate">{detail}</span>
        )}
      </div>
    </div>
  );
}
