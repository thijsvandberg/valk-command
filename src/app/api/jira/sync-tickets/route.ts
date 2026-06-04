import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  syncIndividualTickets,
  syncSprint,
  syncBacklog,
  planGroupKeys,
  reconcileGroupMembership,
  SyncValidationError,
  type GroupSyncTarget,
} from "@/lib/sync-tickets-service";

const ticketKeysBodySchema = z.object({
  ticketKeys: z.array(z.string().min(1)).min(1).max(100),
});

const reconcileBodySchema = z.object({
  keys: z.array(z.string().min(1)).max(2000),
});

// Resolves the sprint/epic the request targets, used by the tranched group sync
// (?mode=plan|reconcile). Sprint id and epic key are mutually exclusive.
function resolveGroupTarget(searchParams: URLSearchParams): GroupSyncTarget {
  const sprintId = searchParams.get("sprintId");
  const epicKey = searchParams.get("epicKey");
  if (epicKey) return { kind: "epic", id: epicKey };
  if (sprintId) return { kind: "sprint", id: sprintId };
  throw new SyncValidationError("sprintId or epicKey is required");
}

/**
 * POST /api/jira/sync-tickets
 *
 * Modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets (max 100)
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 *   3. Query ?mode=plan&sprintId=xxx|&epicKey=XYZ-1 - returns { keys } (current Jira
 *      membership, rank-ordered) for a tranched client-side sync
 *   4. Query ?mode=reconcile&sprintId=xxx|&epicKey=XYZ-1 + body { keys } - restores
 *      rank order and reconciles tickets that left the sprint/epic
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode === "plan") {
    try {
      const keys = await planGroupKeys(resolveGroupTarget(searchParams), request.signal);
      return NextResponse.json({ keys });
    } catch (err) {
      if (err instanceof SyncValidationError) return errorResponse(err.message, err.status);
      return errorResponse("Plan failed", 500);
    }
  }

  if (mode === "reconcile") {
    let keys: string[] = [];
    try {
      const parsed = reconcileBodySchema.safeParse(await request.json());
      if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "Invalid keys", 400);
      }
      keys = parsed.data.keys;
    } catch {
      return errorResponse("Invalid request body", 400);
    }
    try {
      const result = await reconcileGroupMembership(resolveGroupTarget(searchParams), keys, request.signal);
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof SyncValidationError) return errorResponse(err.message, err.status);
      return errorResponse("Reconcile failed", 500);
    }
  }

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
