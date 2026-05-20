import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { poComment } from "@/db/schema";
import { randomUUID } from "crypto";
import { sanitizeHtml } from "@/lib/sanitize";
import { preparedPoComments, preparedJiraComments } from "@/db/prepared";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const poComments = preparedPoComments({ key });
  const jiraComments = preparedJiraComments({ key });

  return NextResponse.json({ poComments, jiraComments }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

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
  const content = sanitizeHtml((body.content as string).trim());
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
