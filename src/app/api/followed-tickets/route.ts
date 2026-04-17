import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedTicket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const followTicketSchema = z.object({
  ticketKey: z.string().min(1).max(100),
});

// GET /api/followed-tickets - list all followed ticket keys
export async function GET() {
  const rows = db.select().from(followedTicket).limit(500).all();
  return NextResponse.json(rows.map((r) => r.ticketKey));
}

// POST /api/followed-tickets - follow a ticket (idempotent)
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = followTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticketKey } = parsed.data;

  // Atomic insert: unique constraint on ticketKey prevents duplicates
  db.insert(followedTicket)
    .values({ id: randomUUID(), ticketKey })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ ticketKey });
}

// DELETE /api/followed-tickets - unfollow a ticket
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const ticketKey = url.searchParams.get("ticketKey");
  if (!ticketKey) {
    return NextResponse.json({ error: "ticketKey required" }, { status: 400 });
  }

  db.delete(followedTicket)
    .where(eq(followedTicket.ticketKey, ticketKey))
    .run();

  return NextResponse.json({ ticketKey });
}
