import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { abortAll } from "@/lib/sync-abort";

/**
 * POST /api/sync-log/cancel-all
 *
 * Cancels all running syncs at once.
 */
export async function POST() {
  const abortedIds = abortAll();

  const running = await db.query.syncLog.findMany({
    where: (row, { eq: eqFn }) => eqFn(row.status, "running"),
  });

  const now = new Date().toISOString();
  let cancelled = 0;

  for (const entry of running) {
    const durationMs = Date.now() - new Date(entry.startedAt).getTime();
    await db.update(syncLog).set({
      status: "cancelled",
      summary: "Cancelled by user",
      durationMs,
      completedAt: now,
    }).where(eq(syncLog.id, entry.id));
    cancelled++;
  }

  return NextResponse.json({ ok: true, cancelled, aborted: abortedIds.length });
}
