/**
 * Inbox "new since last visit" comparison (BRDG-434). A story is new when it was
 * created strictly after the baseline timestamp of the PO's previous inbox visit.
 *
 * A null baseline means there is no recorded previous visit (first-ever open), so
 * nothing is marked new — otherwise the very first visit would dot every row.
 * A missing or unparseable timestamp is never new, so a malformed value degrades
 * to "no marker" rather than throwing.
 */
export function isNewSinceLastViewed(
  jiraCreatedAt: string | null,
  baseline: string | null,
): boolean {
  if (baseline === null) return false;
  if (!jiraCreatedAt) return false;
  const created = new Date(jiraCreatedAt).getTime();
  const base = new Date(baseline).getTime();
  if (Number.isNaN(created) || Number.isNaN(base)) return false;
  return created > base;
}
