import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { desc, eq, max } from "drizzle-orm";
import crypto from "node:crypto";

export async function GET() {
  const rows = db
    .select({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      relatedTicket: conversation.relatedTicket,
      lastMessageAt: max(message.timestamp),
    })
    .from(conversation)
    .leftJoin(message, eq(conversation.id, message.conversationId))
    .groupBy(conversation.id)
    .orderBy(desc(max(message.timestamp)))
    .all();

  const result = rows.map((row) => ({
    id: row.id,
    title: row.title,
    lastMessageAt: row.lastMessageAt ?? row.createdAt,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title } = body as { title?: string };
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "title is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.insert(conversation)
    .values({ id, title: title.trim(), createdAt })
    .run();

  return NextResponse.json(
    { id, title: title.trim(), lastMessageAt: createdAt },
    { status: 201 },
  );
}
