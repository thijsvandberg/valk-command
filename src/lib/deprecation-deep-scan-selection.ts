/**
 * Pure selection ordering for the Tier-2 deep-dive enqueue (BRDG-284).
 *
 * Kept separate from the DB-bound API route so the three selection methods can
 * be unit-tested without a database. Each method maps the eligible backlog to an
 * ordered list of jiraKeys; the API then takes the top-X and enqueues them
 * idempotently. Dismissed tickets still inside their cooldown are excluded so a
 * snoozed false-positive is never auto-re-queued.
 */

export type DeepScanSelectionMethod = "keys" | "worst-staleness" | "oldest";

export interface SelectableTicket {
  jiraKey: string;
  /** Combined Tier-1 score, drives worst-staleness ordering. Null = unscored. */
  scanOverall: number | null;
  /** ISO timestamp of the last (Tier-1) scan; drives oldest ordering. */
  lastScannedAt: string | null;
  /** null | candidate | dismissed | confirmed. */
  disposition: string | null;
  /** ISO timestamp; dismissed tickets are skipped until now passes this. */
  dispositionUntil: string | null;
}

/**
 * Drop tickets a selection method must never auto-pick: a dismissed ticket whose
 * cooldown has not yet elapsed. Explicit hand-picked keys bypass this (the PO is
 * deliberately overriding), so this is applied only to the ranked methods.
 */
export function excludeCooldown<T extends SelectableTicket>(
  tickets: T[],
  now: number = Date.now(),
): T[] {
  return tickets.filter((t) => {
    if (t.disposition !== "dismissed") return true;
    if (!t.dispositionUntil) return true; // dismissed without a cooldown is selectable
    const until = new Date(t.dispositionUntil).getTime();
    if (Number.isNaN(until)) return true;
    return now >= until;
  });
}

/** Worst-staleness first: highest scanOverall first; unscored (null) last. */
export function orderByWorstStaleness<T extends SelectableTicket>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    if (a.scanOverall == null && b.scanOverall == null) {
      return a.jiraKey.localeCompare(b.jiraKey);
    }
    if (a.scanOverall == null) return 1;
    if (b.scanOverall == null) return -1;
    const cmp = b.scanOverall - a.scanOverall;
    return cmp !== 0 ? cmp : a.jiraKey.localeCompare(b.jiraKey);
  });
}

/** Oldest last-scanned first; never-scanned (null) first. */
export function orderByOldestScanned<T extends SelectableTicket>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    if (a.lastScannedAt == null && b.lastScannedAt == null) {
      return a.jiraKey.localeCompare(b.jiraKey);
    }
    if (a.lastScannedAt == null) return -1;
    if (b.lastScannedAt == null) return 1;
    const cmp = a.lastScannedAt.localeCompare(b.lastScannedAt);
    return cmp !== 0 ? cmp : a.jiraKey.localeCompare(b.jiraKey);
  });
}

/**
 * Resolve a ranked selection method to an ordered list of jiraKeys, top-X
 * applied, cooldown excluded. `keys` is handled by the caller (explicit list).
 */
export function selectDeepScanKeys(
  method: Exclude<DeepScanSelectionMethod, "keys">,
  tickets: SelectableTicket[],
  topX: number,
  now: number = Date.now(),
): string[] {
  const eligible = excludeCooldown(tickets, now);
  const ordered =
    method === "worst-staleness"
      ? orderByWorstStaleness(eligible)
      : orderByOldestScanned(eligible);
  return ordered.slice(0, Math.max(0, topX)).map((t) => t.jiraKey);
}
