import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { like, or, ne, and } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const exclude = url.searchParams.get("exclude");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
  const conditions = [
    or(
      like(ticket.jiraKey, pattern),
      like(ticket.title, pattern),
    ),
  ];

  if (exclude) {
    conditions.push(ne(ticket.jiraKey, exclude));
  }

  const results = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
    })
    .from(ticket)
    .where(and(...conditions))
    .limit(15);

  return NextResponse.json(results);
}
