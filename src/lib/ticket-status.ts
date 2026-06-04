/**
 * Shared helpers for classifying Jira ticket statuses stored in the local DB.
 *
 * After normalizeStatus() (upsert-issue.ts) runs on ingest, the values stored
 * are the JiraStatus union strings ("TO DO", "IN PROGRESS", "TEST", "DONE",
 * "DEPRECATED") plus any unmapped upstream statuses stored as uppercase (e.g.
 * "CANCELLED", "WON'T DO"). This module is the single source of truth for which
 * of those mean "finished work that should be excluded from deprecation review".
 */

/**
 * Statuses that represent completed or otherwise finished work. Tickets with
 * these statuses are excluded from deprecation scanning and the cleanup list
 * because they are irrelevant to the "should we keep or deprecate this?" review:
 * the work was already resolved in some way.
 *
 * Values are stored uppercase after normalizeStatus() runs. DONE covers Jira's
 * "Closed" and "Resolved" (both normalize to DONE). DEPRECATED is a first-class
 * Valk Platform status. CANCELLED and WON'T DO are included defensively for any
 * Jira configuration that stores them without normalizing.
 */
export const FINISHED_STATUSES: readonly string[] = [
  "DONE",
  "DEPRECATED",
  "CANCELLED",
  "WON'T DO",
  "WONT DO",
] as const;

const FINISHED_STATUSES_SET = new Set<string>(FINISHED_STATUSES);

/**
 * Returns true when a ticket status represents finished work that should be
 * excluded from deprecation scanning. Comparison is case-insensitive so it
 * works against both normalized (uppercase) and raw Jira values.
 */
export function isFinishedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return FINISHED_STATUSES_SET.has(status.toUpperCase().trim());
}

/**
 * Issue types excluded from deprecation scanning.
 *
 * Only Subtask is excluded: subtasks are cleaned up together with their parent,
 * so they must never appear as their own row in the cleanup overview or be
 * scored individually. Epic, Story, Spike, Task, and Bug are all scannable.
 *
 * The value "subtask" is stored lowercase after normalizeIssueType() runs on
 * ingest (upsert-issue.ts: `if (lower.includes("sub")) return "subtask"`).
 */
export const EXCLUDED_SCAN_TYPES: readonly string[] = ["subtask"] as const;

const EXCLUDED_SCAN_TYPES_SET = new Set<string>(EXCLUDED_SCAN_TYPES);

/**
 * Returns true when a ticket type is a parent-level work item that should be
 * included in deprecation scanning. Subtasks return false; all other types
 * (story, task, bug, spike, epic) return true.
 */
export function isScannableType(type: string | null | undefined): boolean {
  if (!type) return true; // unknown/null types are included to avoid silently hiding work
  return !EXCLUDED_SCAN_TYPES_SET.has(type.toLowerCase().trim());
}
