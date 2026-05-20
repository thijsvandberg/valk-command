import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { abortSync } from "@/lib/sync-abort";
import { validatePathParam } from "@/lib/api-validation";

/**
 * POST /api/activity-log/:id/cancel
 *
 * Cancels a running sync by aborting its in-flight Jira requests
 * and marking the activity log entry as cancelled.
 * Uses optimistic concurrency: only updates if status is still "running".
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const entry = await db.query.activityLog.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.id, id),
  });

  if (!entry) {
    return NextResponse.json({ error: "Activity log entry not found" }, { status: 404 });
  }

  if (entry.status !== "running") {
    return NextResponse.json({ error: "Entry is not running" }, { status: 409 });
  }

  abortSync(id);

  // Optimistic concurrency: only cancel if still running
  const durationMs = Date.now() - new Date(entry.startedAt).getTime();
  const result = await db.update(activityLog).set({
    status: "cancelled",
    summary: "Cancelled by user",
    durationMs,
    completedAt: new Date().toISOString(),
  }).where(and(eq(activityLog.id, id), eq(activityLog.status, "running")));

  const updated = result.changes > 0;

  if (!updated) {
    return NextResponse.json({
      ok: false,
      error: "Entry already completed before cancellation took effect",
    }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
