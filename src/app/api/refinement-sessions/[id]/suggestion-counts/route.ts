import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession, subtaskSuggestion } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/refinement-sessions/[id]/suggestion-counts
 *
 * Returns subtask suggestion counts for all tickets in the session.
 * Response: { counts: Record<string, number> }
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const session = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const ticketKeys = JSON.parse(session.ticketKeys) as string[];
  if (ticketKeys.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  const rows = db
    .select({
      ticketKey: subtaskSuggestion.ticketKey,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(subtaskSuggestion)
    .where(inArray(subtaskSuggestion.ticketKey, ticketKeys))
    .groupBy(subtaskSuggestion.ticketKey)
    .all();

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.ticketKey] = row.count;
  }

  return NextResponse.json({ counts });
}
