/**
 * Persisted Tier-2 deep-dive queue (BRDG-284).
 *
 * Wraps the `deprecation_scan_queue` table with the small set of operations the
 * enqueue API and the background runner need. The queue lives in the DB so it
 * survives restarts and is observable; the active-row unique index makes
 * enqueue idempotent at the storage level (at most one pending/running row per
 * ticket). These helpers keep that invariant in one place.
 */

import { db } from "@/db";
import { deprecationScanQueue, ticket, type DeprecationScanQueueRow } from "@/db/schema";
import { and, eq, inArray, asc, desc, or } from "drizzle-orm";

export type QueueSource = "manual" | "worst-staleness" | "oldest" | "auto";

export interface QueueStatusCounts {
  pending: number;
  running: number;
  done: number;
  error: number;
}

export interface QueueItem {
  id: string;
  jiraKey: string;
  status: "pending" | "running" | "done" | "error";
  source: string;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  /** Joined from the ticket table so the UI renders a meaningful row without a
   * second fetch. Null when the ticket no longer exists locally. */
  title: string | null;
  ticketStatus: string | null;
}

export interface ListQueueOptions {
  /** Cap on completed (done/error) rows returned, newest-first. Pending and
   * running rows are always returned in full so the actionable queue is never
   * truncated. */
  recentLimit?: number;
}

/**
 * Outcome of a single-item removal so the API can report precisely.
 *  - "removed":   a pending row was deleted.
 *  - "not_found": no active (pending/running) row matched.
 *  - "running":   the matched row is running; we refuse to delete it (see below).
 */
export type RemoveQueueResult = "removed" | "not_found" | "running";

const DEFAULT_RECENT_LIMIT = 50;

/**
 * Idempotently enqueue tickets for deep scanning. Tickets already pending or
 * running are skipped (not double-queued). Returns the keys that were actually
 * newly enqueued. Uses INSERT ... ON CONFLICT DO NOTHING on the active-key
 * unique index so concurrent ticks can never create duplicates.
 */
export async function enqueueDeepScan(
  jiraKeys: string[],
  source: QueueSource = "manual",
): Promise<string[]> {
  const unique = [...new Set(jiraKeys)].filter((k) => k.length > 0);
  if (unique.length === 0) return [];

  const enqueued: string[] = [];
  for (const jiraKey of unique) {
    const res = await db
      .insert(deprecationScanQueue)
      .values({
        id: `dsq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        jiraKey,
        status: "pending",
        source,
        activeKey: jiraKey,
      })
      // The unique index on activeKey rejects a second active row for the same
      // ticket; DO NOTHING turns that into a silent skip (idempotency).
      .onConflictDoNothing({ target: deprecationScanQueue.activeKey })
      .returning({ jiraKey: deprecationScanQueue.jiraKey });
    if (res.length > 0) enqueued.push(jiraKey);
  }
  return enqueued;
}

/**
 * Claim up to `limit` pending rows, marking them running atomically. Returns the
 * claimed rows oldest-first so the queue drains FIFO. WHY claim (not just read):
 * marking running before work starts means a crash mid-batch leaves the row in
 * `running`, which the runner can detect and recover rather than silently
 * dropping it.
 */
export async function claimPendingBatch(limit: number): Promise<DeprecationScanQueueRow[]> {
  const pending = await db
    .select()
    .from(deprecationScanQueue)
    .where(eq(deprecationScanQueue.status, "pending"))
    .orderBy(asc(deprecationScanQueue.enqueuedAt))
    .limit(Math.max(0, limit));

  if (pending.length === 0) return [];

  const ids = pending.map((r) => r.id);
  const startedAt = new Date().toISOString();
  await db
    .update(deprecationScanQueue)
    .set({ status: "running", startedAt })
    .where(inArray(deprecationScanQueue.id, ids));

  return pending.map((r) => ({ ...r, status: "running" as const, startedAt }));
}

/** Mark a claimed row done and clear its active flag so it can be re-queued later. */
export async function markDone(id: string): Promise<void> {
  await db
    .update(deprecationScanQueue)
    .set({ status: "done", finishedAt: new Date().toISOString(), activeKey: null })
    .where(eq(deprecationScanQueue.id, id));
}

/** Mark a claimed row errored and clear its active flag. */
export async function markError(id: string, error: string): Promise<void> {
  await db
    .update(deprecationScanQueue)
    .set({ status: "error", finishedAt: new Date().toISOString(), error, activeKey: null })
    .where(eq(deprecationScanQueue.id, id));
}

/** Aggregate counts per status for the batch-progress surface. */
export async function queueStatusCounts(): Promise<QueueStatusCounts> {
  const rows = await db
    .select({ status: deprecationScanQueue.status })
    .from(deprecationScanQueue);
  const counts: QueueStatusCounts = { pending: 0, running: 0, done: 0, error: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

/**
 * Recover rows stuck in `running` (e.g. a crash mid-batch) back to pending so
 * the next tick retries them. Called at the start of each runner tick.
 */
export async function requeueStuckRunning(): Promise<number> {
  const stuck = await db
    .select({ id: deprecationScanQueue.id })
    .from(deprecationScanQueue)
    .where(eq(deprecationScanQueue.status, "running"));
  if (stuck.length === 0) return 0;
  await db
    .update(deprecationScanQueue)
    .set({ status: "pending", startedAt: null })
    .where(and(eq(deprecationScanQueue.status, "running")));
  return stuck.length;
}

/**
 * List queue rows for the management UI. Returns every pending and running row
 * (the actionable queue, oldest-first so it reads in drain order) plus the most
 * recent `recentLimit` done/error rows (newest-first) for context. The ticket
 * title and status are joined so a row is self-describing without a second
 * fetch. Rows whose ticket was deleted locally keep a null title rather than
 * being dropped.
 */
export async function listQueue(opts: ListQueueOptions = {}): Promise<QueueItem[]> {
  const recentLimit = Math.max(0, opts.recentLimit ?? DEFAULT_RECENT_LIMIT);

  const active = await db
    .select({
      id: deprecationScanQueue.id,
      jiraKey: deprecationScanQueue.jiraKey,
      status: deprecationScanQueue.status,
      source: deprecationScanQueue.source,
      enqueuedAt: deprecationScanQueue.enqueuedAt,
      startedAt: deprecationScanQueue.startedAt,
      finishedAt: deprecationScanQueue.finishedAt,
      error: deprecationScanQueue.error,
      title: ticket.title,
      ticketStatus: ticket.status,
    })
    .from(deprecationScanQueue)
    .leftJoin(ticket, eq(deprecationScanQueue.jiraKey, ticket.jiraKey))
    .where(
      or(
        eq(deprecationScanQueue.status, "pending"),
        eq(deprecationScanQueue.status, "running"),
      ),
    )
    .orderBy(asc(deprecationScanQueue.enqueuedAt));

  const recent = recentLimit === 0
    ? []
    : await db
        .select({
          id: deprecationScanQueue.id,
          jiraKey: deprecationScanQueue.jiraKey,
          status: deprecationScanQueue.status,
          source: deprecationScanQueue.source,
          enqueuedAt: deprecationScanQueue.enqueuedAt,
          startedAt: deprecationScanQueue.startedAt,
          finishedAt: deprecationScanQueue.finishedAt,
          error: deprecationScanQueue.error,
          title: ticket.title,
          ticketStatus: ticket.status,
        })
        .from(deprecationScanQueue)
        .leftJoin(ticket, eq(deprecationScanQueue.jiraKey, ticket.jiraKey))
        .where(
          or(
            eq(deprecationScanQueue.status, "done"),
            eq(deprecationScanQueue.status, "error"),
          ),
        )
        .orderBy(desc(deprecationScanQueue.finishedAt))
        .limit(recentLimit);

  return [...active, ...recent].map((r) => ({
    id: r.id,
    jiraKey: r.jiraKey,
    status: r.status,
    source: r.source,
    enqueuedAt: r.enqueuedAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    error: r.error,
    title: r.title ?? null,
    ticketStatus: r.ticketStatus ?? null,
  }));
}

/**
 * Remove a single queue item identified by row id OR jiraKey. Only PENDING rows
 * are removed.
 *
 * Running-item policy: a running row is NOT deleted. The deep-scan handler holds
 * the row in `running` for the duration of its work and clears it on completion;
 * deleting it mid-flight would let markDone/markError write to a vanished row and
 * could orphan the active-key invariant. We therefore refuse (return "running")
 * and let the current scan finish naturally. Done/error rows are history and are
 * also left untouched (treated as not an active item -> "not_found").
 */
export async function removeQueueItem(idOrKey: string): Promise<RemoveQueueResult> {
  const row = await db
    .select({ id: deprecationScanQueue.id, status: deprecationScanQueue.status })
    .from(deprecationScanQueue)
    .where(
      and(
        or(eq(deprecationScanQueue.id, idOrKey), eq(deprecationScanQueue.jiraKey, idOrKey)),
        or(
          eq(deprecationScanQueue.status, "pending"),
          eq(deprecationScanQueue.status, "running"),
        ),
      ),
    )
    .get();

  if (!row) return "not_found";
  if (row.status === "running") return "running";

  await db.delete(deprecationScanQueue).where(eq(deprecationScanQueue.id, row.id));
  return "removed";
}

/**
 * Clear the queue: delete all PENDING rows (the "stop / clear" action). Returns
 * the number removed.
 *
 * Running items are intentionally left in place — the current batch is allowed
 * to finish; clearing only stops NEW work from starting. Because the auto-enqueue
 * task can refill the queue, the PO should also disable the deprecation tasks via
 * the toggle API if they want the queue to stay empty.
 */
export async function clearPendingQueue(): Promise<number> {
  const pending = await db
    .select({ id: deprecationScanQueue.id })
    .from(deprecationScanQueue)
    .where(eq(deprecationScanQueue.status, "pending"));
  if (pending.length === 0) return 0;
  await db.delete(deprecationScanQueue).where(eq(deprecationScanQueue.status, "pending"));
  return pending.length;
}
