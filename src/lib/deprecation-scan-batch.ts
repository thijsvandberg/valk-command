/**
 * Batch selection for the Tier-1 deprecation staleness scan (BRDG-282).
 *
 * Pure ordering/selection helpers kept separate from the DB-bound scheduler
 * task so the rotation logic is unit-testable in isolation. The scan always
 * processes the tickets with the OLDEST `lastScannedAt` first (never-scanned
 * rows, with null `lastScannedAt`, sort first). Because each processed ticket
 * is stamped with the current time, it moves to the back of the queue, so the
 * scan rotates through the whole backlog and wraps around for continuous
 * re-evaluation without needing an explicit positional cursor.
 */

export interface ScannableTicket {
  jiraKey: string;
  /** ISO timestamp of the last Tier-1 scan, or null if never scanned. */
  lastScannedAt: string | null;
}

/**
 * Order candidates oldest-scanned-first with nulls (never scanned) first.
 * Ties broken by jiraKey for deterministic output.
 */
export function orderByOldestScan<T extends ScannableTicket>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    if (a.lastScannedAt == null && b.lastScannedAt == null) {
      return a.jiraKey.localeCompare(b.jiraKey);
    }
    // Nulls first: a never-scanned ticket always precedes a scanned one.
    if (a.lastScannedAt == null) return -1;
    if (b.lastScannedAt == null) return 1;
    const cmp = a.lastScannedAt.localeCompare(b.lastScannedAt);
    return cmp !== 0 ? cmp : a.jiraKey.localeCompare(b.jiraKey);
  });
}

/**
 * Pick the next batch (oldest-scanned-first) of at most `batchSize` tickets.
 */
export function selectScanBatch<T extends ScannableTicket>(
  tickets: T[],
  batchSize: number,
): T[] {
  return orderByOldestScan(tickets).slice(0, Math.max(0, batchSize));
}
