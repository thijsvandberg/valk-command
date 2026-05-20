import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message, storyWriterSession } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

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
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const conversationMessages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(message.timestamp);

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
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.relatedTicket === "string" || body.relatedTicket === null) {
    updates.relatedTicket = body.relatedTicket;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
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
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // Remove story writer sessions that reference this conversation (FK constraint)
  await db.delete(storyWriterSession).where(eq(storyWriterSession.conversationId, id));
  await db.delete(conversation).where(eq(conversation.id, id));

  return new NextResponse(null, { status: 204 });
}
