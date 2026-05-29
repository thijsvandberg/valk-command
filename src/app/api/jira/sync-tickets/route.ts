import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limiter";
import { syncIndividualTickets, syncSprint, syncBacklog, SyncValidationError } from "@/lib/sync-tickets-service";

const ticketKeysBodySchema = z.object({
  ticketKeys: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * POST /api/jira/sync-tickets
 *
 * Two modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets (max 100)
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  let sprintId = searchParams.get("sprintId");

  let ticketKeys: string[] | undefined;
  let strategy = searchParams.get("strategy") ?? "bulk";
  try {
    const body = await request.json();
    if (body?.ticketKeys !== undefined) {
      const parsed = ticketKeysBodySchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "Invalid ticketKeys", 400);
      }
      ticketKeys = parsed.data.ticketKeys;
    } else {
      if (!sprintId && body?.sprintId) {
        sprintId = String(body.sprintId);
      }
      if (body?.strategy && typeof body.strategy === "string") {
        strategy = body.strategy;
      }
    }
  } catch {
    // No valid JSON body
  }

  try {
    let result;
    if (ticketKeys) {
      result = await syncIndividualTickets(ticketKeys, request.signal);
    } else if (sprintId === "__backlog__") {
      result = await syncBacklog(strategy, request.signal);
    } else {
      result = await syncSprint(sprintId, strategy, request.signal);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SyncValidationError) {
      return errorResponse(err.message, err.status);
    }
    return errorResponse("Sync failed", 500);
  }
}
