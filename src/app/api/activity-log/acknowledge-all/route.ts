import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/activity-log/acknowledge-all
 *
 * Marks all unacknowledged failed entries as acknowledged,
 * clearing the error badge in the UI.
 */
export async function POST() {
  await db
    .update(activityLog)
    .set({ acknowledged: true })
    .where(
      and(
        eq(activityLog.status, "failed"),
        eq(activityLog.acknowledged, false),
      ),
    );

  return NextResponse.json({ ok: true });
}
