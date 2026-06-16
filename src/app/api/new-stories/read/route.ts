import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveUserId } from "@/lib/user-settings";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";

// PUT /api/new-stories/read - mark a single ticket read/unread for the acting
// user (BRDG-359: read state is per-user).
export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { key, read } = parsed.data as { key?: string; read?: boolean };

  if (typeof key !== "string" || key.length === 0) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    const userId = await resolveUserId();
    const result = await ticketService.markNewStoryReadForUser(userId, key, read ?? true);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// POST /api/new-stories/read - bulk mark many tickets read/unread for the acting
// user (multi-select).
export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { keys, read } = parsed.data as { keys?: string[]; read?: boolean };

  if (!Array.isArray(keys)) {
    return NextResponse.json({ error: "keys must be an array" }, { status: 400 });
  }

  try {
    const userId = await resolveUserId();
    const result = await ticketService.bulkMarkNewStoriesRead(userId, keys, read ?? true);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
