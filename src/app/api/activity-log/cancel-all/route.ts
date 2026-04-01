import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { abortAll } from "@/lib/sync-abort";

/**
 * POST /api/activity-log/cancel-all
 *
 * Cancels all running entries at once.
 */
export async function POST() {
  const abortedIds = abortAll();

  const running = await db.query.activityLog.findMany({
    where: (row, { eq: eqFn }) => eqFn(row.status, "running"),
  });

  const now = new Date().toISOString();
  let cancelled = 0;

  for (const entry of running) {
    const durationMs = Date.now() - new Date(entry.startedAt).getTime();
    await db.update(activityLog).set({
      status: "cancelled",
      summary: "Cancelled by user",
      durationMs,
      completedAt: now,
    }).where(eq(activityLog.id, entry.id));
    cancelled++;
  }

  return NextResponse.json({ ok: true, cancelled, aborted: abortedIds.length });
}
