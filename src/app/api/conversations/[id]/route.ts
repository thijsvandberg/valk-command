import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message, storyWriterSession } from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return errorResponse("Conversation not found", 404);
  }

  const conversationMessages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(sql`COALESCE(${message.sequence}, 999999999)`, message.timestamp);

  return NextResponse.json({
    ...conv,
    messages: conversationMessages,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return errorResponse("Conversation not found", 404);
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.relatedTicket === "string" || body.relatedTicket === null) {
    updates.relatedTicket = body.relatedTicket;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (typeof body.metadata === "string" || body.metadata === null) {
    updates.metadata = body.metadata;
  }
  if (typeof body.readAt === "string" || body.readAt === null) {
    updates.readAt = body.readAt;
  }
  if (typeof body.pinned === "boolean" || typeof body.pinned === "number") {
    const wantPin = Boolean(body.pinned);
    if (wantPin && !conv.pinned) {
      const pinned = await db.select({ id: conversation.id })
        .from(conversation)
        .where(and(eq(conversation.pinned, true), ne(conversation.id, id)));
      if (pinned.length >= 10) {
        return errorResponse("Maximum 10 pinned conversations reached", 409);
      }
    }
    updates.pinned = wantPin;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("No valid fields to update", 400);
  }

  await db.update(conversation).set(updates).where(eq(conversation.id, id));

  const updated = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return errorResponse("Conversation not found", 404);
  }

  // Remove story writer sessions that reference this conversation (FK constraint)
  await db.delete(storyWriterSession).where(eq(storyWriterSession.conversationId, id));
  await db.delete(conversation).where(eq(conversation.id, id));

  return new NextResponse(null, { status: 204 });
}
