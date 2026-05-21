import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cache } from "@/lib/cache";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const { summary } = body as Record<string, unknown>;
  if (typeof summary !== "string") {
    return NextResponse.json({ error: "summary (string) is required" }, { status: 400 });
  }

  const existing = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .where(and(eq(ticket.jiraKey, key), eq(ticket.type, "epic")))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Epic not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db
    .update(ticket)
    .set({ summary, summaryUpdatedAt: now })
    .where(eq(ticket.jiraKey, key));

  cache.invalidate("/api/epics");

  return NextResponse.json({ key, summary, summaryUpdatedAt: now });
}
