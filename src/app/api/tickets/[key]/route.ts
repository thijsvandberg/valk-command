import { NextResponse, after } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { enqueue as enqueueForRevalidation } from "@/lib/revalidation-queue";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { buildTicketDetail, updateTicketFields } from "@/lib/ticket-detail-builder";
import { syncIndividualTickets } from "@/lib/sync-tickets-service";
import { emitTicketEvent, originFromRequest } from "@/lib/ticket-events";
import { db } from "@/db";

/**
 * Re-sync epic children whose sprint is stored as a legacy name (no id) so their `sprint_name`
 * becomes the current Jira sprint id, then drop the parent detail + sprint caches so the next read
 * rebuilds with resolved dates/state. Detached and best-effort: never affects the response.
 */
function scheduleUnresolvedSprintResync(parentKey: string, childKeys: string[]) {
  if (childKeys.length === 0) return;
  after(async () => {
    try {
      await syncIndividualTickets(childKeys);
      cache.invalidate(`/api/tickets/${parentKey}`);
      cache.invalidate("/api/jira/sprints");
    } catch (err) {
      logger.warn("ticket-detail", "unresolved sprint re-sync failed", err instanceof Error ? err.message : String(err));
    }
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const cacheKey = `/api/tickets/${key}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    enqueueForRevalidation([key]);
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "private, no-cache",
      },
    });
  }

  const result = await buildTicketDetail(key);
  if (!result) {
    return errorResponse("Ticket not found", 404);
  }

  cache.set(cacheKey, result.data, 60_000);
  enqueueForRevalidation([key]);
  scheduleUnresolvedSprintResync(key, result.unresolvedSprintKeys);

  return NextResponse.json(result.data, {
    headers: {
      "X-Query-Time-Ms": String(result.durationMs),
      "X-Cache": "MISS",
      "Cache-Control": "private, no-cache",
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  // Capture the pre-update epic so a move between epics also refreshes the old epic.
  const before = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    columns: { epicKey: true },
  });

  const outcome = await updateTicketFields(key, body);
  if ("error" in outcome) {
    return errorResponse(outcome.error, outcome.status);
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // Epic children tables render this ticket's fields from the epic's cached detail,
  // and the epics progress view aggregates story points per epic.
  if (before?.epicKey) {
    cache.invalidate(`/api/tickets/${before.epicKey}`);
  }
  if (typeof body.epicKey === "string" && body.epicKey) {
    cache.invalidate(`/api/tickets/${body.epicKey}`);
  }
  if ("storyPoints" in body || "epicKey" in body) {
    cache.invalidate("/api/epics/progress");
  }

  if ("storyPoints" in body) {
    emitTicketEvent({ type: "ticket:changed", ticketKey: key, kinds: ["points"], origin: originFromRequest(request) });
  }

  return NextResponse.json(outcome.result);
}
