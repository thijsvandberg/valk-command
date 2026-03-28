import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await db.query.conversations.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.timestamp);

  return NextResponse.json({
    ...conversation,
    messages: conversationMessages,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await db.query.conversations.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  await db.delete(conversations).where(eq(conversations.id, id));

  return new NextResponse(null, { status: 204 });
}
