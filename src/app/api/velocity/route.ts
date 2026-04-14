import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
}

// Extract sprint number for sorting: "BT: 133" → 133, "BT: 130 - Align sidebars" → 130
function sprintNumber(name: string): number {
  // First number after the team prefix
  const m = name.match(/[: ]\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/**
 * GET /api/velocity?teamPrefix=BT&limit=10
 *
 * Returns completed story points per sprint for a given team,
 * computed from tickets already in the local DB.
 * Does not trigger any Jira fetches.
 */
export async function GET(request: NextRequest) {
  const teamPrefix = request.nextUrl.searchParams.get("teamPrefix");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10), 30);

  if (!teamPrefix) {
    return NextResponse.json({ error: "teamPrefix required" }, { status: 400 });
  }

  // Load sprint metadata from cache
  const sprintRow = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
  });

  if (!sprintRow) {
    return NextResponse.json([]);
  }

  let allSprints: StoredSprint[] = [];
  try {
    allSprints = JSON.parse(sprintRow.value);
  } catch {
    return NextResponse.json([]);
  }

  // Filter to this team's closed sprints only (Backlog/TODO/Cleanup are never "closed")
  // Use same prefix extraction as the page: capital letters followed by colon or space
  const teamSprints = allSprints
    .filter((s) => {
      const prefix = s.name.match(/^([A-Z]+)[: ]/)?.[1];
      return prefix === teamPrefix && s.state === "closed";
    })
    .sort((a, b) => sprintNumber(a.name) - sprintNumber(b.name));

  if (teamSprints.length === 0) {
    return NextResponse.json([]);
  }

  // Get the last `limit` sprints by number
  const relevantSprints = teamSprints.slice(-limit);
  // sprint_name column actually stores the sprint ID as a string
  const sprintIdStrings = relevantSprints.map((s) => String(s.id));

  // Aggregate completed story points per sprint ID from the ticket table
  const rows = await db
    .select({
      sprintIdStr: ticket.sprintName,
      completedPoints: sql<number>`COALESCE(SUM(CASE WHEN ${ticket.status} = 'DONE' THEN ${ticket.storyPoints} ELSE 0 END), 0)`,
      totalTickets: sql<number>`COUNT(*)`,
    })
    .from(ticket)
    .where(sql`${ticket.sprintName} IN (${sql.join(sprintIdStrings.map((id) => sql`${id}`), sql`, `)})`)
    .groupBy(ticket.sprintName);

  const pointsById = new Map(rows.map((r) => [r.sprintIdStr, r]));

  // Build result: only sprints that have at least one ticket
  const result = relevantSprints
    .map((s) => {
      const row = pointsById.get(String(s.id));
      if (!row || row.totalTickets === 0) return null;
      return {
        sprintId: s.id,
        sprintName: s.name,
        completedPoints: row.completedPoints,
      };
    })
    .filter(Boolean);

  return NextResponse.json(result);
}
