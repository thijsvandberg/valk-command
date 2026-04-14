import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { desc, eq, and, lt, gte, notInArray, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { ActivityLogType } from "@/types/ticket";
import { computeStats } from "./compute-stats";

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 7;
const RETENTION_MAX_ENTRIES = 200;

/**
 * GET /api/activity-log?limit=20&offset=0&unacknowledged=true&type=review,metadata-update&status=failed
 *
 * Returns recent activity log entries, newest first.
 * Supports comma-separated type filter via the `type` query param.
 * Supports `status` filter (running|success|failed|cancelled).
 * Supports `offset` for pagination.
 * Also marks running entries older than 5 minutes as failed (stale cleanup).
 * Prunes entries older than 7 days or beyond the 200 most recent.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 20 : parsedLimit, 500));
  const parsedOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset);
  const onlyUnacked = searchParams.get("unacknowledged") === "true";
  const typeFilter = searchParams.get("type")?.split(",").filter(Boolean) ?? [];
  const VALID_STATUSES = new Set(["running", "success", "failed", "cancelled"]);
  const statusFilter = searchParams.get("status") ?? "";
  const statusParam = VALID_STATUSES.has(statusFilter) ? statusFilter : null;

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

  const conditions: SQL[] = [];
  if (onlyUnacked) {
    conditions.push(eq(activityLog.acknowledged, false));
  }
  if (typeFilter.length > 0) {
    conditions.push(inArray(activityLog.type, typeFilter as ActivityLogType[]));
  }
  if (statusParam) {
    conditions.push(eq(activityLog.status, statusParam as "running" | "success" | "failed" | "cancelled"));
  }

  const rows = await db
    .select()
    .from(activityLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLog.startedAt))
    .limit(limit)
    .offset(offset);

  const includeStats = searchParams.get("include") === "stats";
  if (!includeStats) {
    return NextResponse.json(rows);
  }

  // Compute date boundaries
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfYesterday = new Date(new Date(startOfToday).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // 7-day window shifted back 7 days (for trend comparison)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoEnd = sevenDaysAgo;

  const [todayRows, yesterdayRows, sevenDayFailedRows, timelineRows, sevenDaysAgoPeriodRows] = await Promise.all([
    db.select().from(activityLog).where(gte(activityLog.startedAt, startOfToday)),
    db.select().from(activityLog).where(
      and(gte(activityLog.startedAt, startOfYesterday), lt(activityLog.startedAt, startOfToday)),
    ),
    db.select().from(activityLog).where(
      and(gte(activityLog.startedAt, sevenDaysAgo), eq(activityLog.status, "failed")),
    ),
    db.select().from(activityLog).where(gte(activityLog.startedAt, twentyFourHoursAgo)),
    db.select().from(activityLog).where(
      and(gte(activityLog.startedAt, fourteenDaysAgo), lt(activityLog.startedAt, sevenDaysAgoEnd)),
    ),
  ]);

  const stats = computeStats(
    todayRows,
    yesterdayRows,
    sevenDayFailedRows,
    timelineRows,
    timelineRows,
    sevenDaysAgoPeriodRows,
  );

  return NextResponse.json({ entries: rows, stats });
}
