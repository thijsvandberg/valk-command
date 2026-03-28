import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";

export async function POST(
  request: Request,
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  if (!body.role || !["user", "assistant"].includes(body.role as string)) {
    return NextResponse.json(
      { error: "role must be 'user' or 'assistant'" },
      { status: 400 }
    );
  }

  const row = {
    id: randomUUID(),
    conversationId: id,
    role: body.role as "user" | "assistant",
    content: (body.content as string).trim(),
    timestamp: new Date().toISOString(),
    workspaceTaskId: (body.workspaceTaskId as string) ?? null,
  };

  db.insert(message).values(row).run();

  return NextResponse.json(row, { status: 201 });
}
