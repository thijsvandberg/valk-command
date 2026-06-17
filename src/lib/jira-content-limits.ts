// Jira Cloud content limits for the fields Bridge pushes, and the helper that
// drives the editor's live size indicator (BRDG-349).
//
// IMPORTANT - the count Jira validates is the *rendered ADF* the server sends,
// not the raw markdown the PO types. `markdownToAdf` expands markdown into a JSON
// document, so neither markdown.length nor ADF JSON size equals the other exactly:
// markdown syntax (`#`, `*`, `[]()`, table pipes) drops out of the visible text,
// while structural blocks (expand/panel/table) add ADF overhead. We therefore use
// raw markdown length as an APPROXIMATION for the live counter and the pre-flight
// guard. This can warn slightly early or late depending on content structure; the
// authoritative check remains Jira's own response, surfaced as a failure toast.
// Empirical confirmation of the exact threshold against our instance is a manual
// follow-up (requires graduated test pushes with live Jira write access).

/** Documented Jira limit for the description field (ADF text content). */
export const JIRA_DESCRIPTION_LIMIT = 32767;

/** Documented Jira limit for the summary (title) field - plain string. */
export const JIRA_TITLE_LIMIT = 255;

/**
 * Server-side guard ceiling for a description draft (raw markdown length). Set to
 * the documented Jira limit: markdown at/above this almost certainly exceeds Jira's
 * ADF ceiling, so we reject before the round-trip. Looser cases still fail at Jira
 * and surface via the toast.
 */
export const DESCRIPTION_GUARD_MAX = JIRA_DESCRIPTION_LIMIT;

/** Show the live counter once content reaches this fraction of the limit. */
export const NEAR_LIMIT_RATIO = 0.9;

export type DescriptionSizeState = "hidden" | "near" | "over";

export interface DescriptionSizeInfo {
  state: DescriptionSizeState;
  /** Characters over the limit (0 unless state is "over"). */
  over: number;
}

/**
 * Classify a description's raw length against the Jira limit for the live editor
 * indicator. Hidden when comfortably under, "near" within NEAR_LIMIT_RATIO of the
 * limit, "over" once it exceeds it.
 */
export function describeDescriptionSize(len: number): DescriptionSizeInfo {
  if (len > JIRA_DESCRIPTION_LIMIT) {
    return { state: "over", over: len - JIRA_DESCRIPTION_LIMIT };
  }
  if (len >= JIRA_DESCRIPTION_LIMIT * NEAR_LIMIT_RATIO) {
    return { state: "near", over: 0 };
  }
  return { state: "hidden", over: 0 };
}
