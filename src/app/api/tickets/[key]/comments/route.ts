import { NextResponse } from "next/server";
import { db } from "@/db";
import { poComment, jiraComment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const poComments = await db
    .select()
    .from(poComment)
    .where(eq(poComment.ticketKey, key))
    .all();

  const jiraComments = await db
    .select()
    .from(jiraComment)
    .where(eq(jiraComment.ticketKey, key))
    .all();

  return NextResponse.json({ poComments, jiraComments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.content !== "string" || !(body.content as string).trim()) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }
  const content = (body.content as string).trim();
  if (content.length > 10000) {
    return NextResponse.json(
      { error: "content must not exceed 10000 characters" },
      { status: 400 },
    );
  }

  const author = typeof body.author === "string" && body.author.trim().length > 0
    ? body.author.trim().slice(0, 100)
    : "Product Owner";

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(poComment).values({
    id,
    ticketKey: key,
    author,
    content,
    createdAt: now,
  });

  const created = await db.query.poComment.findFirst({
    where: (row, { eq }) => eq(row.id, id),
  });

  return NextResponse.json(created, { status: 201 });
}
