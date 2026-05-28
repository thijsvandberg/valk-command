import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { alert, ticket, sprintNameCache } from "@/db/schema";
import { desc, eq, sql, and, inArray, like, or, isNull } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { getSubscribedTeams } from "@/lib/subscribed-teams";
import { escapeLikePattern } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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

  const subscribedTeams = getSubscribedTeams();

  // When teams are subscribed, count unread only for those teams.
  // Notifications without a team (no jiraKey / no sprint) always count.
  let subscribedUnreadCount = unreadCount?.count ?? 0;
  if (subscribedTeams.length > 0) {
    const teamMatches = subscribedTeams.map((t) => like(sprintNameCache.displayName, `${escapeLikePattern(t)}: %`));
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(alert)
      .leftJoin(ticket, eq(alert.jiraKey, ticket.jiraKey))
      .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
      .where(and(
        eq(alert.read, false),
        or(
          isNull(alert.jiraKey),
          isNull(sprintNameCache.displayName),
          ...teamMatches,
        ),
      ))
      .get();
    subscribedUnreadCount = result?.count ?? 0;
  }

  return NextResponse.json({
    notifications: rows,
    unreadCount: unreadCount?.count ?? 0,
    subscribedUnreadCount,
    subscribedTeams,
    totalCount: totalCount?.count ?? 0,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST /api/notifications - create a notification
export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = createNotificationSchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { type, message, category, jiraKey, linkUrl } = validation.data;
  createNotification(type, message, { category: category as never, jiraKey, linkUrl });
  return NextResponse.json({ type, message }, { status: 201 });
}

// PATCH /api/notifications - mark notification(s) as read
// { markAll: true }     → mark all unread as read
// { ids: string[] }     → mark specific IDs as read (filtered bulk action)
// { id: string }        → mark single notification as read
export async function PATCH(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = patchNotificationSchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse("id, ids, or markAll required", 400);
  }

  const body = validation.data;

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
  const limited = applyRateLimit("delete");
  if (limited) return limited;

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
