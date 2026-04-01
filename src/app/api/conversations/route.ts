import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET() {
  const result = await db
    .select()
    .from(conversation)
    .orderBy(desc(conversation.createdAt));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
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

  const id = randomUUID();
  const conv = {
    id,
    title: body.title.trim(),
    createdAt: new Date().toISOString(),
    relatedTicket: body.relatedTicket ?? null,
  };

  await db.insert(conversation).values(conv);

  const created = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  return NextResponse.json(created, { status: 201 });
}
