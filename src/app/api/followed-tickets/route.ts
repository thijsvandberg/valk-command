import { NextResponse } from "next/server";
import { db } from "@/db";
import { followedTicket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// GET /api/followed-tickets - list all followed ticket keys
export async function GET() {
  const rows = db.select().from(followedTicket).all();
  return NextResponse.json(rows.map((r) => r.ticketKey));
}

// POST /api/followed-tickets - follow a ticket
export async function POST(request: Request) {
  const body = await request.json();
  const ticketKey = body.ticketKey as string;
  if (!ticketKey) {
    return NextResponse.json({ error: "ticketKey required" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(followedTicket)
    .where(eq(followedTicket.ticketKey, ticketKey))
    .get();

  if (existing) {
    return NextResponse.json({ status: "already_followed" });
  }

  db.insert(followedTicket)
    .values({ id: randomUUID(), ticketKey })
    .run();

  return NextResponse.json({ status: "followed" });
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

  return NextResponse.json({ status: "unfollowed" });
}
