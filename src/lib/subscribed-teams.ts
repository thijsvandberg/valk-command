import "server-only";
import { db } from "@/db";
import { appSetting, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SUBSCRIBED_TEAMS_KEY = "subscribed_teams";

export type SubscribedTeamsPreference = {
  teams: string[];
};

export function getSubscribedTeams(): string[] {
  const row = db
    .select()
    .from(appSetting)
    .where(eq(appSetting.key, SUBSCRIBED_TEAMS_KEY))
    .get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as SubscribedTeamsPreference;
    return Array.isArray(parsed.teams) ? parsed.teams : [];
  } catch {
    return [];
  }
}

export function setSubscribedTeams(teams: string[]): void {
  const payload = JSON.stringify({ teams });
  const existing = db
    .select()
    .from(appSetting)
    .where(eq(appSetting.key, SUBSCRIBED_TEAMS_KEY))
    .get();
  if (existing) {
    db.update(appSetting)
      .set({ value: payload })
      .where(eq(appSetting.key, SUBSCRIBED_TEAMS_KEY))
      .run();
  } else {
    db.insert(appSetting)
      .values({ key: SUBSCRIBED_TEAMS_KEY, value: payload })
      .run();
  }
}

// Returns all distinct team prefixes from sprint name cache (e.g. "BT", "HT", "BM")
export function getAvailableTeams(): string[] {
  const rows = db.select({ displayName: sprintNameCache.displayName }).from(sprintNameCache).all();
  const teams = new Set<string>();
  for (const row of rows) {
    const idx = row.displayName.indexOf(": ");
    if (idx > 0) teams.add(row.displayName.slice(0, idx));
  }
  return [...teams].sort();
}
