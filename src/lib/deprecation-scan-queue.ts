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
import { deprecationScanQueue, type DeprecationScanQueueRow } from "@/db/schema";
import { and, eq, inArray, asc } from "drizzle-orm";

export type QueueSource = "manual" | "worst-staleness" | "oldest" | "auto";

export interface QueueStatusCounts {
  pending: number;
  running: number;
  done: number;
  error: number;
}

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
