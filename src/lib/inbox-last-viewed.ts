/**
 * Inbox "new" predicate (BRDG-434 / BRDG-438). A story is new when it was created
 * strictly after the baseline — the moment the user last marked something read
 * (`MAX(newStoryRead.readAt)`, see `getInboxBaseline`). This is the single shared
 * definition used by the per-row dot, the inbox count/filter, AND the 2x/day
 * digest, so the numbers always agree (BRDG-438 unified the previous visit-based
 * baseline onto this read-based one).
 *
 * Permissive on missing/unknown data, matching the digest: a null baseline (the
 * user has never triaged) makes the whole unread inbox new, and a missing or
 * unparseable created timestamp counts as new so a row is never silently dropped.
 */

// Normalizes a stored timestamp to epoch ms. jiraCreatedAt is ISO-8601 (has a
// "T"); MAX(readAt) can be SQLite's `datetime('now')` form ("YYYY-MM-DD HH:MM:SS",
// UTC, no zone), which must be read as UTC rather than local. Returns NaN on
// garbage.
function toEpochMs(value: string): number {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).getTime();
}

export function isNewSinceLastViewed(
  jiraCreatedAt: string | null,
  baseline: string | null,
): boolean {
  if (baseline === null) return true;
  const base = toEpochMs(baseline);
  if (Number.isNaN(base)) return true;
  if (!jiraCreatedAt) return true;
  const created = toEpochMs(jiraCreatedAt);
  if (Number.isNaN(created)) return true;
  return created > base;
}
