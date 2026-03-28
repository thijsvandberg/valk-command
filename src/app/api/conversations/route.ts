import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET() {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || body.title.trim() === "") {
    return NextResponse.json(
      { error: "title is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const conversation = {
    id,
    title: body.title.trim(),
    createdAt: new Date().toISOString(),
    relatedTicket: body.relatedTicket ?? null,
  };

  await db.insert(conversations).values(conversation);

  const created = await db.query.conversations.findFirst({
    where: (c, { eq }) => eq(c.id, id),
  });

  return NextResponse.json(created, { status: 201 });
}
