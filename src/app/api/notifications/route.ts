import { NextResponse } from "next/server";
import { db } from "@/db";
import { alert, ticket, sprintNameCache } from "@/db/schema";
import { desc, eq, lt, sql, and, inArray } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

// GET /api/notifications - list notifications (alerts) with optional unread filter
export async function GET(request: Request) {
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  // Auto-cleanup: delete notifications older than 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.delete(alert).where(lt(alert.createdAt, cutoff)).run();

  const conditions = unreadOnly ? eq(alert.read, false) : undefined;

  const rows = db
    .select({
      id: alert.id,
      type: alert.type,
      jiraKey: alert.jiraKey,
      message: alert.message,
      createdAt: alert.createdAt,
      eventAt: alert.eventAt,
      read: alert.read,
      category: alert.category,
      linkUrl: alert.linkUrl,
      jiraTitle: ticket.title,
      sprintName: sprintNameCache.displayName,
    })
    .from(alert)
    .leftJoin(ticket, eq(alert.jiraKey, ticket.jiraKey))
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(conditions)
    .orderBy(desc(alert.createdAt))
    .limit(limit)
    .all();

  const unreadCount = db
    .select({ count: sql<number>`count(*)` })
    .from(alert)
    .where(eq(alert.read, false))
    .get();

  const totalCount = db
    .select({ count: sql<number>`count(*)` })
    .from(alert)
    .get();

  return NextResponse.json({
    notifications: rows,
    unreadCount: unreadCount?.count ?? 0,
    totalCount: totalCount?.count ?? 0,
  });
}

// POST /api/notifications - create a notification
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!type || !message) {
    return NextResponse.json({ error: "type and message are required" }, { status: 400 });
  }

  const category = typeof body.category === "string" ? body.category : undefined;
  const jiraKey = typeof body.jiraKey === "string" ? body.jiraKey : undefined;
  const linkUrl = typeof body.linkUrl === "string" ? body.linkUrl : undefined;

  createNotification(type, message, { category: category as never, jiraKey, linkUrl });
  return NextResponse.json({ status: "created" }, { status: 201 });
}

// PATCH /api/notifications - mark notification(s) as read
// { markAll: true }     → mark all unread as read
// { ids: string[] }     → mark specific IDs as read (filtered bulk action)
// { id: string }        → mark single notification as read
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, markAll, ids } = body as { id?: string; markAll?: boolean; ids?: string[] };

  if (markAll) {
    db.update(alert)
      .set({ read: true })
      .where(eq(alert.read, false))
      .run();
    return NextResponse.json({ status: "all_read" });
  }

  if (Array.isArray(ids) && ids.length > 0) {
    db.update(alert)
      .set({ read: true })
      .where(and(inArray(alert.id, ids), eq(alert.read, false)))
      .run();
    return NextResponse.json({ status: "batch_read" });
  }

  if (id) {
    db.update(alert)
      .set({ read: true })
      .where(eq(alert.id, id))
      .run();
    return NextResponse.json({ status: "read" });
  }

  return NextResponse.json({ error: "id, ids, or markAll required" }, { status: 400 });
}

// DELETE /api/notifications - delete a single notification or clear read notifications
// ?id=<uuid>         → delete that specific notification
// ?ids=a,b,c         → delete specific read notifications (filtered bulk clear)
// (no params)        → delete all read notifications
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const idsParam = url.searchParams.get("ids");

  if (id) {
    db.delete(alert).where(eq(alert.id, id)).run();
    return NextResponse.json({ status: "dismissed" });
  }

  if (idsParam) {
    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length > 0) {
      db.delete(alert).where(and(inArray(alert.id, ids), eq(alert.read, true))).run();
    }
    return NextResponse.json({ status: "batch_dismissed" });
  }

  db.delete(alert).where(eq(alert.read, true)).run();
  return NextResponse.json({ status: "cleared_read" });
}
