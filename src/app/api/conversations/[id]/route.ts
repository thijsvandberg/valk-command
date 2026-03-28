import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const conv = db
    .select()
    .from(conversation)
    .where(eq(conversation.id, id))
    .get();

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const messages = db
    .select()
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(asc(message.timestamp))
    .all();

  return NextResponse.json({ ...conv, messages });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const conv = db
    .select()
    .from(conversation)
    .where(eq(conversation.id, id))
    .get();

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  db.delete(message).where(eq(message.conversationId, id)).run();
  db.delete(conversation).where(eq(conversation.id, id)).run();

  return NextResponse.json({ success: true });
}
