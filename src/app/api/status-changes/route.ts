import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/user-settings";
import { getActingUser } from "@/lib/acting-user";
import { listUnseenStatusChanges } from "@/lib/status-changes-query";

// GET /api/status-changes?keys=VPL-1,VPL-2 — unseen status changes for the active sprint's
// tickets (BRDG-414). Scoped by ticket key (the board passes the active sprint's keys).
// Per-user (seen state + "what's new, not by me"), so no shared cache; the payload is small
// (one line per changed ticket).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const keys = (url.searchParams.get("keys") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return NextResponse.json({ rows: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const userId = await resolveUserId();
  const actingUser = await getActingUser();
  const rows = await listUnseenStatusChanges({ userId, jiraName: actingUser?.name ?? null }, keys);

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
