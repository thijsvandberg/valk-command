import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq }) => eq(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq }) => eq(m.jiraKey, key),
  });

  return NextResponse.json({ ...t, metadata: meta || null });
}
