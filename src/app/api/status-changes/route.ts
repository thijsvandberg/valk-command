import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/user-settings";
import { getActingUser } from "@/lib/acting-user";
import { listUnseenStatusChanges } from "@/lib/status-changes-query";

// GET /api/status-changes?sprintIds=a,b — unseen status changes for the given active
// sprint(s) (BRDG-414). Per-user (seen state + "what's new, not by me"), so no shared
// cache; the payload is small (one line per changed ticket on the active sprint).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sprintIds = (url.searchParams.get("sprintIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (sprintIds.length === 0) {
    return NextResponse.json({ rows: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const userId = await resolveUserId();
  const actingUser = await getActingUser();
  const rows = await listUnseenStatusChanges({ userId, jiraName: actingUser?.name ?? null }, sprintIds);

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
