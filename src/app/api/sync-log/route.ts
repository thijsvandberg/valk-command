import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/sync-log?limit=20&unacknowledged=true
 *
 * Returns recent sync log entries, newest first.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const onlyUnacked = searchParams.get("unacknowledged") === "true";

  let rows;
  if (onlyUnacked) {
    rows = await db
      .select()
      .from(syncLog)
      .where(eq(syncLog.acknowledged, false))
      .orderBy(desc(syncLog.startedAt))
      .limit(limit);
  } else {
    rows = await db
      .select()
      .from(syncLog)
      .orderBy(desc(syncLog.startedAt))
      .limit(limit);
  }

  return NextResponse.json(rows);
}
