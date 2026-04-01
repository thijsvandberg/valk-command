import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { desc, eq, and, lt } from "drizzle-orm";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * GET /api/sync-log?limit=20&unacknowledged=true
 *
 * Returns recent sync log entries, newest first.
 * Also marks running syncs older than 5 minutes as failed (stale cleanup).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const onlyUnacked = searchParams.get("unacknowledged") === "true";

  // Stale cleanup: mark running syncs older than 5 min as failed
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  await db.update(syncLog).set({
    status: "failed",
    errorDetail: "Sync timed out (no response after 5 minutes)",
    completedAt: new Date().toISOString(),
  }).where(
    and(
      eq(syncLog.status, "running"),
      lt(syncLog.startedAt, cutoff),
    ),
  );

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
