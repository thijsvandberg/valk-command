import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity-logger";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq }) => eq(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await db.query.ticketMetadata.findFirst({
    where: (m, { eq }) => eq(m.jiraKey, key),
  });

  const updates: Record<string, unknown> = {};

  if (body.poStatus !== undefined) {
    const validStatuses = [
      null,
      "New",
      "In Progress",
      "Awaiting Feedback",
      "Ready for Refinement",
      "Ready",
      "Parked",
    ];
    if (!validStatuses.includes(body.poStatus)) {
      return NextResponse.json(
        { error: "Invalid poStatus value" },
        { status: 400 },
      );
    }
    updates.poStatus = body.poStatus;
  }

  if (body.qualityScore !== undefined) {
    if (body.qualityScore !== null) {
      if (typeof body.qualityScore !== "number" || body.qualityScore < 0 || body.qualityScore > 100) {
        return NextResponse.json(
          { error: "qualityScore must be a number between 0 and 100, or null" },
          { status: 400 },
        );
      }
    }
    updates.qualityScore = body.qualityScore;
  }

  if (body.poNotes !== undefined) {
    if (body.poNotes !== null && typeof body.poNotes !== "string") {
      return NextResponse.json(
        { error: "poNotes must be a string or null" },
        { status: 400 },
      );
    }
    if (typeof body.poNotes === "string" && body.poNotes.length > 5000) {
      return NextResponse.json(
        { error: "poNotes must not exceed 5000 characters" },
        { status: 400 },
      );
    }
    updates.poNotes = body.poNotes;
  }

  if (existing) {
    await db
      .update(ticketMetadata)
      .set(updates)
      .where(eq(ticketMetadata.jiraKey, key));
  } else {
    await db.insert(ticketMetadata).values({
      jiraKey: key,
      ...updates,
    } as typeof ticketMetadata.$inferInsert);
  }

  const result = await db.query.ticketMetadata.findFirst({
    where: (m, { eq }) => eq(m.jiraKey, key),
  });

  const changedFields = Object.keys(updates).join(", ");
  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Updated ${changedFields}`,
  });

  return NextResponse.json(result);
}
