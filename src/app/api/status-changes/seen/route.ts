import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveUserId } from "@/lib/user-settings";
import { markStatusChangeSeen, bulkMarkStatusChangesSeen } from "@/lib/status-change-seen-store";

// PUT /api/status-changes/seen — mark a single status change seen/unseen for the acting
// user (BRDG-414). Keyed on the status-change id, so a later transition of the same ticket
// is unaffected.
export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { id, seen } = parsed.data as { id?: string; seen?: boolean };

  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const userId = await resolveUserId();
  await markStatusChangeSeen(userId, id, seen ?? true);
  return NextResponse.json({ ok: true });
}

// POST /api/status-changes/seen — bulk "mark all seen" for the acting user.
export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { ids } = parsed.data as { ids?: string[] };

  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  }

  const userId = await resolveUserId();
  const result = await bulkMarkStatusChangesSeen(userId, ids);
  return NextResponse.json(result);
}
