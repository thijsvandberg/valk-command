import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticketLocalEdit } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const edits = await db
    .select()
    .from(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key))
    .all();

  return NextResponse.json(edits);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { field, localValue, baseJiraVersion } = body;

  if (!field || !["title", "description"].includes(field)) {
    return NextResponse.json(
      { error: "field must be 'title' or 'description'" },
      { status: 400 },
    );
  }

  if (typeof localValue !== "string") {
    return NextResponse.json(
      { error: "localValue must be a string" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, field)))
    .get();

  if (existing) {
    await db
      .update(ticketLocalEdit)
      .set({ localValue, modifiedAt: now, baseJiraVersion: baseJiraVersion ?? existing.baseJiraVersion })
      .where(eq(ticketLocalEdit.id, existing.id));
  } else {
    await db.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: key,
      field: field as "title" | "description",
      localValue,
      baseJiraVersion: baseJiraVersion ?? null,
      modifiedAt: now,
    });
  }

  const result = await db
    .select()
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, field)))
    .get();

  return NextResponse.json(result);
}
