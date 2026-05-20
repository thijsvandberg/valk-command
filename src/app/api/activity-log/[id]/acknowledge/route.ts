import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";

/**
 * POST /api/activity-log/:id/acknowledge
 *
 * Marks an activity log entry as acknowledged so it stops showing in the
 * unacknowledged error list.
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

  await db.update(activityLog).set({ acknowledged: true }).where(eq(activityLog.id, id));

  return NextResponse.json({ ok: true });
}
