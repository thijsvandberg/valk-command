import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { randomUUID } from "crypto";
import { preparedConversationList } from "@/db/prepared";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET() {
  // Story writer conversations (relatedTicket is set) are only shown once the user
  // has actually sent a message. Conversations without relatedTicket (regular chat)
  // are always shown.
  const result = preparedConversationList();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  let body: Record<string, string | null>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.title !== "string" || body.title.trim() === "") {
    return NextResponse.json(
      { error: "title is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (body.title.length > 500) {
    return NextResponse.json(
      { error: "title must not exceed 500 characters" },
      { status: 400 },
    );
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
  };

  await db.insert(conversation).values(conv);

  return NextResponse.json(conv, { status: 201 });
}
