import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { alert, ticket, sprintNameCache } from "@/db/schema";
import { desc, eq, sql, and, inArray } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

const createNotificationSchema = z.object({
  type: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  category: z.string().max(100).optional(),
  jiraKey: z.string().max(100).optional(),
  linkUrl: z.string().max(500).optional(),
});

const patchNotificationSchema = z.union([
  z.object({ markAll: z.literal(true) }),
  z.object({ ids: z.array(z.string()).min(1).max(200) }),
  z.object({ id: z.string().min(1) }),
]);

// GET /api/notifications - list notifications (alerts) with optional unread filter
export async function GET(request: Request) {
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

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
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createNotificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { type, message, category, jiraKey, linkUrl } = parsed.data;
  createNotification(type, message, { category: category as never, jiraKey, linkUrl });
  return NextResponse.json({ type, message }, { status: 201 });
}

// PATCH /api/notifications - mark notification(s) as read
// { markAll: true }     → mark all unread as read
// { ids: string[] }     → mark specific IDs as read (filtered bulk action)
// { id: string }        → mark single notification as read
export async function PATCH(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchNotificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "id, ids, or markAll required" }, { status: 400 });
  }

  const body = parsed.data;

  if ("markAll" in body) {
    db.update(alert)
      .set({ read: true })
      .where(eq(alert.read, false))
      .run();
    return NextResponse.json({ marked: "all" });
  }

  if ("ids" in body) {
    db.update(alert)
      .set({ read: true })
      .where(and(inArray(alert.id, body.ids), eq(alert.read, false)))
      .run();
    return NextResponse.json({ marked: body.ids.length });
  }

  db.update(alert)
    .set({ read: true })
    .where(eq(alert.id, body.id))
    .run();
  return NextResponse.json({ marked: body.id });
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
