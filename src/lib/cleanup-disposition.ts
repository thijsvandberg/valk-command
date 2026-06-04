/**
 * Disposition transition logic for the Backlog Deprecation Review epic
 * (BRDG-289, see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * Pure helpers kept apart from the API route so the cooldown maths and the
 * field-set a transition writes are unit-testable without a DB or HTTP layer.
 *
 * HARD CONSTRAINT (epic-wide): a disposition is a LOCAL marker on
 * ticketMetadata. Nothing here ever writes to Jira. Confirm/dismiss only record
 * the PO's judgement; the actual deprecation in Jira stays a manual action.
 */

export type DispositionAction = "confirm" | "dismiss" | "reset";

// Default dismiss snooze window. WHY 90 days: long enough that a false positive
// does not keep reappearing every scan cycle, short enough that the ticket is
// re-evaluated within a quarter in case product context has shifted. The
// background deep-scan runner already skips a dismissed ticket while
// dispositionUntil is in the future, so this value directly controls re-surfacing.
export const DISMISS_COOLDOWN_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Cap the optional note so a runaway paste cannot bloat the row. Generous enough
// for a sentence or two of "why this is a false positive".
export const MAX_DISPOSITION_NOTE_LENGTH = 500;

export interface DispositionFields {
  disposition: "confirmed" | "dismissed" | null;
  dispositionUntil: string | null;
  dispositionNote: string | null;
}

/**
 * Compute the local field-set for a disposition action. The cooldown applies to
 * `dismiss` only; confirm and reset clear it so a previously snoozed ticket is
 * not silently kept out of scans after the PO changes their mind.
 */
export function computeDispositionFields(
  action: DispositionAction,
  opts: { note?: string | null; now?: number; cooldownDays?: number } = {},
): DispositionFields {
  const now = opts.now ?? Date.now();
  const note = normalizeNote(opts.note);

  switch (action) {
    case "confirm":
      return { disposition: "confirmed", dispositionUntil: null, dispositionNote: note };
    case "dismiss": {
      const days = opts.cooldownDays ?? DISMISS_COOLDOWN_DAYS;
      const until = new Date(now + days * MS_PER_DAY).toISOString();
      return { disposition: "dismissed", dispositionUntil: until, dispositionNote: note };
    }
    case "reset":
      return { disposition: null, dispositionUntil: null, dispositionNote: null };
  }
}

/** Trim, collapse empties to null, and clamp to the max length. */
export function normalizeNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_DISPOSITION_NOTE_LENGTH);
}
