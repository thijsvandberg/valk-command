import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  await db.delete(conversation).where(eq(conversation.id, id));

  return new NextResponse(null, { status: 204 });
}
