/**
 * Canonical person reference (BRDG-360).
 *
 * People on a ticket (reporter, assignee) used to be keyed on their free-text
 * display name, which breaks on a Jira rename and cannot tell apart two people
 * with the same name. A PersonRef keys on Jira's `accountId` (a globally stable
 * GUID) and treats the display name + email as labels, not keys.
 *
 * These resolvers are pure functions over a stored ticket row: they read the
 * columns captured during sync (see src/lib/upsert-issue.ts) and never re-derive
 * identity from the name. Display rendering (initials/colour) stays in
 * buildAssignee; PersonRef just carries the label so nothing regresses visually.
 */

export interface PersonRef {
  /** Stable Jira identifier. Null only for legacy rows synced before capture. */
  accountId: string | null;
  /** Human-readable label; no longer the matching key. */
  displayName: string | null;
  /** Secondary human key; can change or be hidden by Jira privacy settings. */
  email: string | null;
  avatar: string | null;
}

/** Subset of a ticket row carrying reporter identity. */
export interface ReporterFields {
  reporter: string | null;
  reporterAccountId: string | null;
  reporterAvatar: string | null;
  reporterEmail: string | null;
}

/** Subset of a ticket row carrying assignee identity. */
export interface AssigneeFields {
  assignee: string | null;
  assigneeAvatar: string | null;
  assigneeAccountId: string | null;
  assigneeEmail: string | null;
}

/** Resolve the reporter of a ticket row to a PersonRef, or null when absent. */
export function resolveReporter(row: ReporterFields): PersonRef | null {
  if (!row.reporter && !row.reporterAccountId && !row.reporterEmail) return null;
  return {
    accountId: row.reporterAccountId ?? null,
    displayName: row.reporter ?? null,
    email: row.reporterEmail ?? null,
    avatar: row.reporterAvatar ?? null,
  };
}

/** Resolve the assignee of a ticket row to a PersonRef, or null when absent. */
export function resolveAssignee(row: AssigneeFields): PersonRef | null {
  if (!row.assignee && !row.assigneeAccountId && !row.assigneeEmail) return null;
  return {
    accountId: row.assigneeAccountId ?? null,
    displayName: row.assignee ?? null,
    email: row.assigneeEmail ?? null,
    avatar: row.assigneeAvatar ?? null,
  };
}

/**
 * True when two references point to the same person. Compares by the stable
 * accountId first, then falls back to email, then the display name while the
 * backfill of accountIds is incomplete. The fallback chain is what lets a
 * renamed person still match: same accountId wins regardless of the new name.
 */
export function samePerson(
  a: PersonRef | null | undefined,
  b: PersonRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.accountId && b.accountId) return a.accountId === b.accountId;
  if (a.email && b.email) return a.email.toLowerCase() === b.email.toLowerCase();
  if (a.displayName && b.displayName) return a.displayName === b.displayName;
  return false;
}
