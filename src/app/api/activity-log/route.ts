import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { desc, eq, and, lt, notInArray } from "drizzle-orm";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 7;
const RETENTION_MAX_ENTRIES = 200;

/**
 * GET /api/activity-log?limit=20&unacknowledged=true
 *
 * Returns recent activity log entries, newest first.
 * Also marks running syncs older than 5 minutes as failed (stale cleanup).
 * Prunes entries older than 7 days or beyond the 200 most recent.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 20 : parsedLimit, 500));
  const onlyUnacked = searchParams.get("unacknowledged") === "true";

  // Stale cleanup: mark running syncs older than 5 min as failed
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  await db.update(activityLog).set({
    status: "failed",
    errorDetail: "Sync timed out (no response after 5 minutes)",
    completedAt: new Date().toISOString(),
  }).where(
    and(
      eq(activityLog.status, "running"),
      lt(activityLog.startedAt, cutoff),
    ),
  );

  // Retention cleanup: delete entries older than 7 days
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(activityLog).where(lt(activityLog.startedAt, retentionCutoff));

  // Retention cleanup: keep max 200 entries (delete oldest beyond that)
  const recentIds = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .orderBy(desc(activityLog.startedAt))
    .limit(RETENTION_MAX_ENTRIES);
  const keepSet = recentIds.map((r) => r.id);
  if (keepSet.length === RETENTION_MAX_ENTRIES) {
    await db.delete(activityLog).where(notInArray(activityLog.id, keepSet));
  }

  let rows;
  if (onlyUnacked) {
    rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.acknowledged, false))
      .orderBy(desc(activityLog.startedAt))
      .limit(limit);
  } else {
    rows = await db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.startedAt))
      .limit(limit);
  }

  return NextResponse.json(rows);
}
