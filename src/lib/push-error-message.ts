// Map a raw push failure (the `detail`/`error` from a failed push-to-Jira
// response) to PO-friendly copy for the toolbar text and the failure toast
// (BRDG-349). Known Jira codes get a clear, actionable message; everything else
// falls back to the raw detail so the real reason is never hidden again.

const GENERIC_PUSH_ERROR = "Failed to push to Jira";

export const CONTENT_LIMIT_MESSAGE =
  "This description is too large for Jira. Trim it and try again.";

/**
 * The Jira-specific error code lives inside the parsed `detail` string (the
 * server's `code` is the generic `JIRA_OPERATION_ERROR`), so we substring-match
 * the detail rather than switching on a code field.
 */
export function mapPushErrorMessage(detail?: string | null): string {
  if (!detail) return GENERIC_PUSH_ERROR;

  const lower = detail.toLowerCase();
  if (
    lower.includes("content_limit_exceeded") ||
    lower.includes("content exceeds") ||
    lower.includes("maximum allowed length") ||
    lower.includes("too large for jira")
  ) {
    return CONTENT_LIMIT_MESSAGE;
  }

  return detail;
}
