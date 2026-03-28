import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const conv = db
    .select()
    .from(conversation)
    .where(eq(conversation.id, conversationId))
    .get();

  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { role, content } = body as { role?: string; content?: string };

  if (!role || !["user", "assistant"].includes(role)) {
    return NextResponse.json(
      { error: "role must be 'user' or 'assistant'" },
      { status: 400 },
    );
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const newMessage = {
    id,
    conversationId,
    role: role as "user" | "assistant",
    content: content.trim(),
    timestamp,
  };

  db.insert(message).values(newMessage).run();

  return NextResponse.json(newMessage, { status: 201 });
}
