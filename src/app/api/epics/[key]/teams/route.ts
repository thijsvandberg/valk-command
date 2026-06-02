import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limiter";
import { parseJsonBody } from "@/lib/request-parser";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { safeJsonParse } from "@/lib/api-validation";
import { sanitizeTeams } from "@/lib/epic-metadata";

const setTeamsSchema = z.object({
  teams: z.array(z.enum(TEAMS)).max(TEAMS.length),
});

function readTeams(epicKey: string): Team[] {
  const row = db
    .select({ teams: epicMetadata.teams })
    .from(epicMetadata)
    .where(eq(epicMetadata.epicKey, epicKey))
    .get();
  if (!row) return [];
  return sanitizeTeams(safeJsonParse<unknown>(row.teams, [], "epic-teams-route"));
}

// GET /api/epics/[key]/teams - the epic's assigned teams (empty when unset)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return NextResponse.json(
    { epicKey: key, teams: readTeams(key) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// PUT /api/epics/[key]/teams - replace the epic's team assignment. Empty array clears it.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;

  const parsed = await parseJsonBody(request, setTeamsSchema);
  if ("error" in parsed) return parsed.error;

  // Dedupe while preserving the fixed-set order.
  const teams = TEAMS.filter((t) => parsed.data.teams.includes(t));
  const serialized = JSON.stringify(teams);

  db.insert(epicMetadata)
    .values({ epicKey: key, teams: serialized })
    .onConflictDoUpdate({
      target: epicMetadata.epicKey,
      set: { teams: serialized, updatedAt: sql`(datetime('now'))` },
    })
    .run();

  // The progress aggregation caches teams; drop it so the row reflects the change.
  cache.invalidate("/api/epics/progress");

  return NextResponse.json({ epicKey: key, teams });
}
