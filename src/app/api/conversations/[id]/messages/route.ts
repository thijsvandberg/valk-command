import { NextResponse } from "next/server";
import { db } from "@/db";
import { message } from "@/db/schema";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { nextSequence } from "@/db/next-sequence";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const VALID_ROLES = ["user", "assistant"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("write");
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

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  if (typeof body.content !== "string" || body.content.trim() === "") {
    return errorResponse("content is required and must be a non-empty string", 400);
  }

  if (body.content.length > 50000) {
    return errorResponse("content must not exceed 50000 characters", 400);
  }

  if (!body.role || !VALID_ROLES.includes(body.role as typeof VALID_ROLES[number])) {
    return errorResponse("role is required and must be 'user' or 'assistant'", 400);
  }

  const messageId = randomUUID();
  const msg = {
    id: messageId,
    conversationId: id,
    role: body.role as (typeof VALID_ROLES)[number],
    content: body.content.trim(),
    timestamp: new Date().toISOString(),
    workspaceTaskId: (body.workspaceTaskId as string | undefined) ?? null,
    sequence: nextSequence(id),
  };

  await db.insert(message).values(msg);

  return NextResponse.json(msg, { status: 201 });
}
