import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { desc, eq, and, lt, notInArray } from "drizzle-orm";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 7;
const RETENTION_MAX_ENTRIES = 200;

/**
 * GET /api/sync-log?limit=20&unacknowledged=true
 *
 * Returns recent sync log entries, newest first.
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

  // Retention cleanup: delete entries older than 7 days
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(syncLog).where(lt(syncLog.startedAt, retentionCutoff));

  // Retention cleanup: keep max 200 entries (delete oldest beyond that)
  const recentIds = await db
    .select({ id: syncLog.id })
    .from(syncLog)
    .orderBy(desc(syncLog.startedAt))
    .limit(RETENTION_MAX_ENTRIES);
  const keepSet = recentIds.map((r) => r.id);
  if (keepSet.length === RETENTION_MAX_ENTRIES) {
    await db.delete(syncLog).where(notInArray(syncLog.id, keepSet));
  }

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
