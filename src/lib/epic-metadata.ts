import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { safeJsonParse } from "@/lib/api-validation";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { isPaletteColor } from "@/lib/epic-palette";

const TEAM_SET = new Set<string>(TEAMS);

// Accepts only curated-palette base hexes; anything else (off-palette, malformed)
// resolves to null so a bad value clears the color rather than persisting.
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return isPaletteColor(value) ? value : null;
}

// Batched read of PO-assigned colors for a set of epics. Epics with no color
// row are absent from the map (caller falls back to the derived default).
export function getEpicColorMap(epicKeys: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (epicKeys.length === 0) return result;

  const rows = db
    .select({ epicKey: epicMetadata.epicKey, color: epicMetadata.color })
    .from(epicMetadata)
    .where(inArray(epicMetadata.epicKey, epicKeys))
    .all();

  for (const row of rows) {
    if (row.color) result.set(row.epicKey, row.color);
  }
  return result;
}

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
