import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  let tickets;
  if (sprintId) {
    tickets = await db.select().from(ticket).where(eq(ticket.sprintName, sprintId));
  } else {
    tickets = await db.select().from(ticket);
  }

  // Join with metadata
  const result = await Promise.all(
    tickets.map(async (t) => {
      const meta = await db.query.ticketMetadata.findFirst({
        where: (m, { eq }) => eq(m.jiraKey, t.jiraKey),
      });
      return {
        ...t,
        metadata: meta || null,
      };
    }),
  );

  return NextResponse.json(result);
}
