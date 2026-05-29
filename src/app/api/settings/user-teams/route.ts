import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { userTeamAssignment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";
import { TEAMS } from "@/lib/sprint-utils";
import { parseJsonBody } from "@/lib/request-parser";

const setTeamsSchema = z.object({
  displayName: z.string().min(1).max(200),
  teams: z.array(z.enum(TEAMS)).max(TEAMS.length),
});

// GET /api/settings/user-teams - list all user-team assignments grouped by user
export async function GET() {
  const rows = db.select().from(userTeamAssignment).all();

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.displayName) ?? [];
    list.push(row.team);
    grouped.set(row.displayName, list);
  }

  const assignments = Array.from(grouped.entries()).map(([displayName, teams]) => ({
    displayName,
    teams,
  }));

  return NextResponse.json(
    { assignments },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// PUT /api/settings/user-teams - replace all team assignments for a user
export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, setTeamsSchema);
  if ("error" in parsed) return parsed.error;

  const { displayName, teams } = parsed.data;

  db.delete(userTeamAssignment)
    .where(eq(userTeamAssignment.displayName, displayName))
    .run();

  for (const team of teams) {
    db.insert(userTeamAssignment)
      .values({ id: randomUUID(), displayName, team })
      .onConflictDoNothing()
      .run();
  }

  return NextResponse.json({ displayName, teams });
}
