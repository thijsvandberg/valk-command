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

/**
 * Assert every key is a well-formed Jira issue key before it is interpolated as a
 * bare (unquoted) JQL identifier (e.g. `key NOT IN (...)`). Keys are internal today,
 * so this is defense in depth: a malformed key throws instead of silently producing
 * a broken/injectable clause.
 */
export function assertValidJiraKeys(keys: string[]): void {
  const bad = keys.find((k) => !isValidJiraKey(k));
  if (bad !== undefined) {
    throw new Error(`Invalid Jira issue key: ${JSON.stringify(bad)}`);
  }
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
