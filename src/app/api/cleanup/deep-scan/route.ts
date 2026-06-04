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
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { FINISHED_STATUSES } from "@/lib/ticket-status";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { enqueueDeepScan, queueStatusCounts, type QueueSource } from "@/lib/deprecation-scan-queue";
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
  const counts = await queueStatusCounts();
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "private, no-store" },
  });
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
