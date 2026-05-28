import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedTicket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const followTicketSchema = z.object({
  ticketKey: z.string().min(1).max(100),
});

// GET /api/followed-tickets - list all followed ticket keys
export async function GET() {
  const rows = db.select().from(followedTicket).limit(500).all();
  return NextResponse.json(rows.map((r) => r.ticketKey), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST /api/followed-tickets - follow a ticket (idempotent)
export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = followTicketSchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { ticketKey } = validation.data;

  // Atomic insert: unique constraint on ticketKey prevents duplicates
  db.insert(followedTicket)
    .values({ id: randomUUID(), ticketKey })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ ticketKey });
}

// DELETE /api/followed-tickets - unfollow a ticket
export async function DELETE(request: Request) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  const ticketKey = url.searchParams.get("ticketKey");
  if (!ticketKey) {
    return errorResponse("ticketKey required", 400);
  }

  db.delete(followedTicket)
    .where(eq(followedTicket.ticketKey, ticketKey))
    .run();

  return NextResponse.json({ ticketKey });
}
