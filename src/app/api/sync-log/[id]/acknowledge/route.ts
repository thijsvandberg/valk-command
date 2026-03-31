import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/sync-log/:id/acknowledge
 *
 * Marks a sync log entry as acknowledged so it stops showing in the
 * unacknowledged error list.
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

  await db.update(syncLog).set({ acknowledged: true }).where(eq(syncLog.id, id));

  return NextResponse.json({ ok: true });
}
