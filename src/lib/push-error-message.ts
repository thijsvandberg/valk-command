// Map a raw push failure (the `detail`/`error` from a failed push-to-Jira
// response) to PO-friendly copy for the toolbar text and the failure toast
// (BRDG-349). Known Jira codes get a clear, actionable message; everything else
// falls back to the raw detail so the real reason is never hidden again.

const GENERIC_PUSH_ERROR = "Failed to push to Jira";

export const CONTENT_LIMIT_MESSAGE =
  "This description is too large for Jira. Trim it and try again.";

// Toast variant drops the "Trim it..." call to action - the toast pairs the
// reason with a link to the ticket instead (BRDG-349).
export const CONTENT_LIMIT_MESSAGE_SHORT = "This description is too large for Jira.";

function isContentLimitDetail(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes("content_limit_exceeded") ||
    lower.includes("content exceeds") ||
    lower.includes("maximum allowed length") ||
    lower.includes("too large for jira")
  );
}

/**
 * The Jira-specific error code lives inside the parsed `detail` string (the
 * server's `code` is the generic `JIRA_OPERATION_ERROR`), so we substring-match
 * the detail rather than switching on a code field. Pass `{ short: true }` for
 * the toast copy, which omits the trim instruction.
 */
export function mapPushErrorMessage(detail?: string | null, opts?: { short?: boolean }): string {
  if (!detail) return GENERIC_PUSH_ERROR;
  if (isContentLimitDetail(detail)) {
    return opts?.short ? CONTENT_LIMIT_MESSAGE_SHORT : CONTENT_LIMIT_MESSAGE;
  }
  return detail;
}
