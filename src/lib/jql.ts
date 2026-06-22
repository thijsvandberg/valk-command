/**
 * Helpers for safely building JQL (Jira) and CQL (Confluence) queries from
 * externally-controlled values (search terms, issue types, ticket/epic keys).
 *
 * Values interpolated into a double-quoted query literal must have their
 * backslashes and quotes escaped, or a crafted value can break out of the
 * literal and alter the query structure.
 */

/**
 * Escape a value for safe interpolation inside a JQL double-quoted string
 * literal. Backslash is escaped first so the escapes we add are not themselves
 * re-escaped, then the double quote.
 */
export function escapeJql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** CQL string literals use the same escaping rules as JQL. */
export function escapeCql(value: string): string {
  return escapeJql(value);
}

/** Canonical Jira issue-key shape, e.g. "VPL-123". Case-insensitive. */
export const JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;

export function isValidJiraKey(key: string | null | undefined): boolean {
  return typeof key === "string" && JIRA_KEY_RE.test(key);
}

/** Issue types this project recognises; used to validate the search filter. */
export const KNOWN_ISSUE_TYPES = [
  "Story",
  "Task",
  "Bug",
  "Epic",
  "Spike",
  "Sub-task",
  "Subtask",
] as const;

export function isKnownIssueType(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return KNOWN_ISSUE_TYPES.some((t) => t.toLowerCase() === lower);
}
