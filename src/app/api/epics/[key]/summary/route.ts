import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("Body must be a JSON object", 400);
  }

  const { summary } = body as Record<string, unknown>;
  if (typeof summary !== "string") {
    return errorResponse("summary (string) is required", 400);
  }

  const existing = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .where(and(eq(ticket.jiraKey, key), eq(ticket.type, "epic")))
    .get();

  if (!existing) {
    return errorResponse("Epic not found", 404);
  }

  const now = new Date().toISOString();
  await db
    .update(ticket)
    .set({ summary, summaryUpdatedAt: now })
    .where(eq(ticket.jiraKey, key));

  cache.invalidate("/api/epics");

  return NextResponse.json({ key, summary, summaryUpdatedAt: now });
}
