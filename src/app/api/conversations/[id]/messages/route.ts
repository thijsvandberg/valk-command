import { NextResponse } from "next/server";
import { db } from "@/db";
import { message } from "@/db/schema";
import { randomUUID } from "crypto";

const VALID_ROLES = ["user", "assistant"] as const;

export async function POST(
  request: Request,
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

  const body = await request.json().catch(() => null);

  if (!body || typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (!body.role || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json(
      { error: "role is required and must be 'user' or 'assistant'" },
      { status: 400 },
    );
  }

  const messageId = randomUUID();
  const msg = {
    id: messageId,
    conversationId: id,
    role: body.role as (typeof VALID_ROLES)[number],
    content: body.content.trim(),
    workspaceTaskId: body.workspaceTaskId ?? null,
  };

  await db.insert(message).values(msg);

  const created = await db.query.message.findFirst({
    where: (m, { eq }) => eq(m.id, messageId),
  });

  return NextResponse.json(created, { status: 201 });
}
