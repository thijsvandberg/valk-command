import { NextResponse } from "next/server";
import { db } from "@/db";
import { message } from "@/db/schema";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";

const VALID_ROLES = ["user", "assistant"] as const;

export async function POST(
  request: Request,
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (body.content.length > 50000) {
    return NextResponse.json(
      { error: "content must not exceed 50000 characters" },
      { status: 400 },
    );
  }

  if (!body.role || !VALID_ROLES.includes(body.role as typeof VALID_ROLES[number])) {
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
    timestamp: new Date().toISOString(),
    workspaceTaskId: (body.workspaceTaskId as string | undefined) ?? null,
  };

  await db.insert(message).values(msg);

  return NextResponse.json(msg, { status: 201 });
}
