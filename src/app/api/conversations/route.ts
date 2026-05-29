import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { randomUUID } from "crypto";
import { preparedConversationList } from "@/db/prepared";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET() {
  // Story writer conversations (relatedTicket is set) are only shown once the user
  // has actually sent a message. Conversations without relatedTicket (regular chat)
  // are always shown.
  const result = preparedConversationList();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, string | null>;

  if (typeof body.title !== "string" || body.title.trim() === "") {
    return errorResponse("title is required and must be a non-empty string", 400);
  }

  if (body.title.length > 500) {
    return errorResponse("title must not exceed 500 characters", 400);
  }

  const validTypes = ["chat", "investigation"] as const;
  const convType = body.type && validTypes.includes(body.type as typeof validTypes[number])
    ? (body.type as typeof validTypes[number])
    : "chat";

  const id = randomUUID();
  const conv = {
    id,
    title: body.title.trim(),
    type: convType,
    createdAt: new Date().toISOString(),
    relatedTicket: body.relatedTicket ?? null,
    metadata: null,
  };

  await db.insert(conversation).values(conv);

  return NextResponse.json(conv, { status: 201 });
}
