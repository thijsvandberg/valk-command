import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { safeJsonParse } from "@/lib/api-validation";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { isPaletteColor } from "@/lib/epic-palette";

const TEAM_SET = new Set<string>(TEAMS);

// The placement markers SprintPlacementMenu / create-in-jira use. Inlined here
// (like create-in-jira/route.ts) so this server helper does not import the
// client-only menu component just for two string constants.
const BACKLOG_PLACEMENT = "__backlog__";
const DEFAULT_PLACEMENT = "__default__";

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

// The epic's default child placement (BRDG-500 #1). Accepts the two placement
// markers or a concrete numeric sprint id; anything else (malformed, off-shape)
// resolves to null so a bad value clears the setting rather than persisting.
export function sanitizeChildPlacement(value: unknown): string | null {
  if (value !== BACKLOG_PLACEMENT && value !== DEFAULT_PLACEMENT) {
    // A concrete sprint id is a positive integer string (Jira sprint ids), the
    // same shape create-in-jira parses with Number.parseInt before moving.
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  }
  return value;
}

// The epic's stored child placement, or null when unset (each card's
// Create-in-Jira then keeps today's full dropdown).
export function getEpicChildPlacement(epicKey: string): string | null {
  const row = db
    .select({ childPlacement: epicMetadata.childPlacement })
    .from(epicMetadata)
    .where(eq(epicMetadata.epicKey, epicKey))
    .get();
  return sanitizeChildPlacement(row?.childPlacement ?? null);
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
