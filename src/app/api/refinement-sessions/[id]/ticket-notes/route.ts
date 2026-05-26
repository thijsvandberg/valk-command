import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession, refinementSessionTicketNote } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const session = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const notes = await db
    .select()
    .from(refinementSessionTicketNote)
    .where(eq(refinementSessionTicketNote.sessionId, id));

  return NextResponse.json(notes);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const session = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticketKey, content } = body;
  if (typeof ticketKey !== "string" || !ticketKey.trim()) {
    return NextResponse.json({ error: "ticketKey must be a non-empty string" }, { status: 400 });
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Empty content = delete the note
  if (!content.trim()) {
    await db
      .delete(refinementSessionTicketNote)
      .where(
        and(
          eq(refinementSessionTicketNote.sessionId, id),
          eq(refinementSessionTicketNote.ticketKey, ticketKey.trim()),
        ),
      );
    return new NextResponse(null, { status: 204 });
  }

  // Upsert: try update first, then insert
  const existing = await db.query.refinementSessionTicketNote.findFirst({
    where: (n, { eq, and }) =>
      and(eq(n.sessionId, id), eq(n.ticketKey, ticketKey.trim())),
  });

  if (existing) {
    await db
      .update(refinementSessionTicketNote)
      .set({ content: content.trim(), updatedAt: now })
      .where(eq(refinementSessionTicketNote.id, existing.id));

    const updated = await db.query.refinementSessionTicketNote.findFirst({
      where: (n, { eq }) => eq(n.id, existing.id),
    });
    return NextResponse.json(updated);
  }

  const noteId = randomUUID();
  await db.insert(refinementSessionTicketNote).values({
    id: noteId,
    sessionId: id,
    ticketKey: ticketKey.trim(),
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.refinementSessionTicketNote.findFirst({
    where: (n, { eq }) => eq(n.id, noteId),
  });

  return NextResponse.json(created, { status: 201 });
}
