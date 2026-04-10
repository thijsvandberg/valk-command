import { NextResponse } from "next/server";
import { db } from "@/db";
import { alert } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// GET /api/notifications - list notifications (alerts) with optional unread filter
export async function GET(request: Request) {
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const conditions = unreadOnly ? eq(alert.read, false) : undefined;

  const rows = db
    .select()
    .from(alert)
    .where(conditions)
    .orderBy(desc(alert.createdAt))
    .limit(limit)
    .all();

  const unreadCount = db
    .select({ count: sql<number>`count(*)` })
    .from(alert)
    .where(eq(alert.read, false))
    .get();

  return NextResponse.json({
    notifications: rows,
    unreadCount: unreadCount?.count ?? 0,
  });
}

// PATCH /api/notifications - mark notification(s) as read
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, markAll } = body as { id?: string; markAll?: boolean };

  if (markAll) {
    db.update(alert)
      .set({ read: true })
      .where(eq(alert.read, false))
      .run();
    return NextResponse.json({ status: "all_read" });
  }

  if (id) {
    db.update(alert)
      .set({ read: true })
      .where(eq(alert.id, id))
      .run();
    return NextResponse.json({ status: "read" });
  }

  return NextResponse.json({ error: "id or markAll required" }, { status: 400 });
}
