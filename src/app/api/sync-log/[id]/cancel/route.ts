import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { abortSync } from "@/lib/sync-abort";

/**
 * POST /api/sync-log/:id/cancel
 *
 * Cancels a running sync by aborting its in-flight Jira requests
 * and marking the sync log entry as cancelled.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const entry = await db.query.syncLog.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.id, id),
  });

  if (!entry) {
    return NextResponse.json({ error: "Sync log entry not found" }, { status: 404 });
  }

  if (entry.status !== "running") {
    return NextResponse.json({ error: "Sync is not running" }, { status: 409 });
  }

  abortSync(id);

  const durationMs = Date.now() - new Date(entry.startedAt).getTime();
  await db.update(syncLog).set({
    status: "cancelled",
    summary: "Cancelled by user",
    durationMs,
    completedAt: new Date().toISOString(),
  }).where(eq(syncLog.id, id));

  return NextResponse.json({ ok: true });
}
