import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { safeJsonParse } from "@/lib/api-validation";
import { TEAMS, type Team } from "@/lib/sprint-utils";

const TEAM_SET = new Set<string>(TEAMS);

// Keeps only valid team codes, in case the stored JSON drifts from the fixed set.
export function sanitizeTeams(value: unknown): Team[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Team>();
  for (const v of value) {
    if (typeof v === "string" && TEAM_SET.has(v)) seen.add(v as Team);
  }
  return Array.from(seen);
}

// Batched read of assigned teams for a set of epics. Epics with no metadata row
// resolve to an empty array (handled by the caller's default).
export function getEpicTeamsMap(epicKeys: string[]): Map<string, Team[]> {
  const result = new Map<string, Team[]>();
  if (epicKeys.length === 0) return result;

  const rows = db
    .select({ epicKey: epicMetadata.epicKey, teams: epicMetadata.teams })
    .from(epicMetadata)
    .where(inArray(epicMetadata.epicKey, epicKeys))
    .all();

  for (const row of rows) {
    const parsed = safeJsonParse<unknown>(row.teams, [], "epic-metadata-teams");
    result.set(row.epicKey, sanitizeTeams(parsed));
  }
  return result;
}
