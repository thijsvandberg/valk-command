// BRDG-315: a newly created story should land at the bottom of the sprint but ABOVE the
// trailing block of finished work, and the create row should render at that same spot.
//
// "Finished work" = the contiguous run of DONE / DEPRECATED tickets at the very bottom of the
// list. Only that bottom run counts: a stray done/deprecated ticket sitting higher up among
// unfinished work is ignored (the new story still lands below it). If there is no trailing
// finished block, the insertion point is the end of the list.

const FINISHED_STATUSES = new Set(["DONE", "DEPRECATED"]);

type HasStatus = { jiraStatus: string | null | undefined };

/**
 * Index of the first ticket in the trailing contiguous DONE/DEPRECATED block — i.e. the index
 * a new ticket should be inserted at. Returns `tickets.length` when there is no trailing block.
 */
export function trailingDoneDepStart(tickets: readonly HasStatus[]): number {
  let i = tickets.length;
  while (i > 0 && FINISHED_STATUSES.has((tickets[i - 1].jiraStatus ?? "").toUpperCase())) {
    i -= 1;
  }
  return i;
}

/**
 * Splice `key` into a manual PO order (the per-view key list the board sorts by when one exists)
 * so it lands at the same spot the rank rule places it: just above `displayKeys[insertIdx]` (the
 * trailing done/deprecated block, or the top for a backlog), or after the sprint's last displayed
 * row when there is no such anchor. Falls back to appending when neither anchor is in the order.
 * A no-op (returns a copy) when `key` is already present.
 */
export function spliceKeyIntoOrder(
  order: readonly string[],
  displayKeys: readonly (string | undefined)[],
  insertIdx: number,
  key: string,
): string[] {
  const next = [...order];
  if (order.includes(key)) return next;
  const below = displayKeys[insertIdx];
  const belowAt = below ? next.indexOf(below) : -1;
  if (belowAt !== -1) {
    next.splice(belowAt, 0, key);
    return next;
  }
  const last = displayKeys[displayKeys.length - 1];
  const lastAt = last ? next.indexOf(last) : -1;
  if (lastAt !== -1) {
    next.splice(lastAt + 1, 0, key);
    return next;
  }
  next.push(key);
  return next;
}

/**
 * A `jiraRank` value that, under the board's rank sort, places an optimistic ticket between the
 * `before` and `after` neighbours so it appears at the insertion point with no resort/jump
 * (BRDG-315). The board sorts `(a.jiraRank ?? Infinity) - (b.jiraRank ?? Infinity)`.
 *
 * - both numeric  -> midpoint
 * - only `before` -> just below it (`before + 1`), i.e. appended at the end
 * - only `after`  -> just above it (`after - 1`)
 * - neither       -> `null` (no numeric anchor; falls to the bottom, which is the sane default)
 */
export function interpolateRank(before: number | null | undefined, after: number | null | undefined): number | null {
  const b = before ?? null;
  const a = after ?? null;
  if (b != null && a != null) return (b + a) / 2;
  if (b != null) return b + 1;
  if (a != null) return a - 1;
  return null;
}
