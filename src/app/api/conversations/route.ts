import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";

export async function GET() {
  const rows = db
    .select({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      relatedTicket: conversation.relatedTicket,
      lastMessageAt: sql<string | null>`MAX(${message.timestamp})`,
    })
    .from(conversation)
    .leftJoin(message, eq(conversation.id, message.conversationId))
    .groupBy(conversation.id)
    .orderBy(
      desc(
        sql`COALESCE(MAX(${message.timestamp}), ${conversation.createdAt})`
      )
    )
    .all();

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const row = {
    id: randomUUID(),
    title: (body.title as string).trim(),
    createdAt: new Date().toISOString(),
    relatedTicket: (body.relatedTicket as string) ?? null,
  };

  db.insert(conversation).values(row).run();

  return NextResponse.json(row, { status: 201 });
}
