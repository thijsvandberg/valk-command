/**
 * Tier-2 deep-dive selection + enqueue API (BRDG-284).
 *
 * POST queues tickets for deep scanning by one of three selection methods:
 *   - `keys`            explicit hand-picked list (multi-select in the UI)
 *   - `worst-staleness` top-X by combined Tier-1 score (most-likely-stale first)
 *   - `oldest`          top-X by oldest lastScannedAt (least-recently-evaluated)
 * Enqueue is idempotent: a ticket already pending/running is not double-queued.
 *
 * GET returns queue-status counts so the view can show batch progress.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { and, eq, isNull, or, notInArray } from "drizzle-orm";
import { FINISHED_STATUSES, EXCLUDED_SCAN_TYPES } from "@/lib/ticket-status";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import {
  enqueueDeepScan,
  queueStatusCounts,
  listQueue,
  removeQueueItem,
  clearPendingQueue,
  type QueueSource,
} from "@/lib/deprecation-scan-queue";
import {
  selectDeepScanKeys,
  type SelectableTicket,
} from "@/lib/deprecation-deep-scan-selection";

const MAX_TOP_X = 200;

const bodySchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("keys"),
    keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_TOP_X),
  }),
  z.object({
    method: z.literal("worst-staleness"),
    topX: z.number().int().min(1).max(MAX_TOP_X),
  }),
  z.object({
    method: z.literal("oldest"),
    topX: z.number().int().min(1).max(MAX_TOP_X),
  }),
]);

// Scan-eligible = the SAME backlog definition the scanners use.
// Finished tickets (DONE, DEPRECATED, etc.) are excluded because resolved work
// is not a deprecation candidate.
async function loadEligible(): Promise<SelectableTicket[]> {
  const rows = await db
    .select({
      jiraKey: ticket.jiraKey,
      scanOverall: ticketMetadata.scanOverall,
      lastScannedAt: ticketMetadata.lastScannedAt,
      disposition: ticketMetadata.disposition,
      dispositionUntil: ticketMetadata.dispositionUntil,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        eq(ticket.sprintName, ""),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.status, FINISHED_STATUSES as string[]),
        // Subtasks are excluded: they are cleaned up together with their parent
        // and must never appear as their own row in the deprecation review.
        // or(isNull) ensures tickets with a null type are not silently dropped
        // (NULL NOT IN (...) evaluates to NULL/false in SQL).
        or(isNull(ticket.type), notInArray(ticket.type, EXCLUDED_SCAN_TYPES as string[])),
      ),
    );
  return rows.map((r) => ({
    jiraKey: r.jiraKey,
    scanOverall: r.scanOverall ?? null,
    lastScannedAt: r.lastScannedAt ?? null,
    disposition: r.disposition ?? null,
    dispositionUntil: r.dispositionUntil ?? null,
  }));
}

export async function GET() {
  // Counts power the progress summary; items[] powers the management list. Both
  // are returned together so the Cleanup view renders the queue in one fetch.
  // Counts remain at the top level for backward compatibility with callers that
  // only read pending/running/done/error.
  const [counts, items] = await Promise.all([queueStatusCounts(), listQueue()]);
  return NextResponse.json({ ...counts, items }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

const deleteBodySchema = z.union([
  z.object({ key: z.string().min(1).max(64) }),
  z.object({ all: z.literal(true) }),
]);

/**
 * DELETE /api/cleanup/deep-scan
 *
 * Two variants for queue management:
 *  - { key }            remove one PENDING item (by row id or jiraKey).
 *  - { all: true } or ?all=1   clear ALL pending items (the "stop / clear" action).
 *
 * Running items are never deleted; see removeQueueItem / clearPendingQueue for
 * the running-item policy (the current batch finishes; only new work is stopped).
 */
export async function DELETE(request: Request) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  if (url.searchParams.get("all") === "1") {
    const removed = await clearPendingQueue();
    const counts = await queueStatusCounts();
    return NextResponse.json({ cleared: true, removed, queue: counts });
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = deleteBodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }
  const body = validation.data;

  if ("all" in body) {
    const removed = await clearPendingQueue();
    const counts = await queueStatusCounts();
    return NextResponse.json({ cleared: true, removed, queue: counts });
  }

  const result = await removeQueueItem(body.key);
  if (result === "not_found") {
    return NextResponse.json({ error: "No pending queue item found for that key" }, { status: 404 });
  }
  if (result === "running") {
    // 409: the item exists but cannot be removed because it is mid-scan.
    return NextResponse.json(
      { error: "Item is currently running and cannot be removed; it will finish on its own" },
      { status: 409 },
    );
  }
  const counts = await queueStatusCounts();
  return NextResponse.json({ removed: true, key: body.key, queue: counts });
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = bodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }
  const body = validation.data;

  let keys: string[];
  let source: QueueSource;
  if (body.method === "keys") {
    // Explicit picks are constrained to the eligible backlog so a stale UI can't
    // queue a ticket that has since moved into a sprint or been removed.
    const eligibleKeys = new Set((await loadEligible()).map((t) => t.jiraKey));
    keys = body.keys.filter((k) => eligibleKeys.has(k));
    source = "manual";
  } else {
    const eligible = await loadEligible();
    keys = selectDeepScanKeys(body.method, eligible, body.topX);
    source = body.method;
  }

  const enqueued = await enqueueDeepScan(keys, source);
  const counts = await queueStatusCounts();

  return NextResponse.json({
    method: body.method,
    requested: keys.length,
    enqueued: enqueued.length,
    enqueuedKeys: enqueued,
    queue: counts,
  });
}
