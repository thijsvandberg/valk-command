// Shared row-surface "skin" for issue-list rows (BRDG-390). One source of truth for the
// background tint + left accent + keyboard-focus outline + opacity fades + corner rounding +
// live-pulse, so BoardRow and ChildIssueRow render an identical surface and a change lands in
// one place instead of being hand-copied per row.
//
// State precedence (highest first): selected / context-target > checked > flagged > focus >
// resting hover, with independent opacity fades removed > deprecated > inflight. This helper
// owns ONLY the part that used to drift between the two rows; the per-host layout (flex,
// padding, cursor, container query) stays in each component and is concatenated around the
// helper output.

export type RowSurfaceAccent = "border" | "none";

export interface RowSurfaceState {
  /** Open in the sidebar / sprint-board selected row. Highest tint precedence. */
  selected: boolean;
  /** Targeted by an open row context menu; renders identically to selected. */
  contextTarget: boolean;
  /** In the bulk-selection queue. */
  checked: boolean;
  /** Flagged ticket (red tint + red accent). */
  flagged: boolean;
  /** Keyboard-focused (outline ring; only when not already selected/context-target). */
  focused: boolean;
  /** Removed-from-jira fade. */
  removed: boolean;
  /** Deprecated fade. */
  deprecated: boolean;
  /** In-flight / pending fade. */
  inflight: boolean;
  /** Round the bottom corners to the card edge (last row in its card). */
  lastInCard: boolean;
  /** Round the top corners to the card edge (first row in its card). */
  firstInCard: boolean;
  /** Drop the colored left accent; the background tints still convey state. */
  hideAccent: boolean;
  /** Live-pulse highlight (this ticket changed in another tab / via an agent). */
  livePulse: boolean;
}

export interface RowSurfaceOptions {
  /**
   * Accent mechanism. "border" (default) reserves a 3px left border on every row (transparent
   * when no accent state applies, so the color can change without shifting content); "none"
   * omits the border entirely. BRDG-390 standardises both rows on "border".
   */
  accent?: RowSurfaceAccent;
}

/**
 * The className string for a row's surface element, given its visual state. Returns only the
 * surface-state classes (see module note); reproduce BoardRow's historical classes exactly so
 * the board has zero visual change.
 */
export function rowSurfaceClasses(state: RowSurfaceState, opts: RowSurfaceOptions = {}): string {
  const accent = opts.accent ?? "border";
  const active = state.selected || state.contextTarget;
  const parts: string[] = [];

  // The 3px left border is reserved on every row (even when transparent) so the accent color
  // can change without a content shift; "none" opts out entirely.
  if (accent === "border") parts.push("border-l-[3px]");

  // Background tint, precedence active > checked > flagged > resting hover.
  parts.push(
    active
      ? "bg-[var(--color-brand-600)]/12"
      : state.checked
      ? "bg-[var(--color-brand-500)]/6 hover:bg-[var(--color-brand-500)]/10"
      : state.flagged
      ? "bg-[color-mix(in_srgb,var(--color-status-error)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_8%,transparent)]"
      : "hover:bg-overlay-subtle",
  );

  // Left accent color, same precedence; dropped when hideAccent is set.
  if (accent === "border") {
    parts.push(
      state.hideAccent
        ? "border-l-transparent"
        : active
        ? "border-l-[var(--color-brand-300)]"
        : state.checked
        ? "border-l-[var(--color-brand-300)]"
        : state.flagged
        ? "border-l-[var(--color-status-error)]"
        : "border-l-transparent hover:border-l-[var(--color-brand-400)]/25",
    );
  }

  // Keyboard-focus outline, only when not already highlighted as active.
  if (state.focused && !active) {
    parts.push("outline outline-1 -outline-offset-1 outline-[var(--color-brand-500)]/40");
  }

  // Opacity fade, precedence removed > deprecated > inflight.
  if (state.removed) parts.push("opacity-50");
  else if (state.deprecated) parts.push("opacity-60");
  else if (state.inflight) parts.push("opacity-70");

  // Round the corners that meet the card edge.
  if (state.firstInCard) parts.push("rounded-t-[11px]");
  if (state.lastInCard) parts.push("rounded-b-[11px]");

  if (state.livePulse) parts.push("live-pulse");

  return parts.join(" ");
}
