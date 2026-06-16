import { NextResponse } from "next/server";
import { db } from "@/db";
import { favoriteUser, userTeamAssignment } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * GET /api/jira/watcher-candidates
 *
 * Returns users that can be added as watchers, sourced from Jira's assignable
 * users search so they carry real Jira accountIds (the add-watcher call needs
 * them; the local assignable-users source only has display names). Enriched
 * with favorite status and team assignments matched by the stable accountId
 * first and display name as fallback (BRDG-364), mirroring the AssigneePicker.
 */
export async function GET() {
  try {
    const jiraUsers = await jiraClient.getAssignableUsers(env.JIRA_PROJECT_KEY);

    const favRows = db.select().from(favoriteUser).all();
    const favByName = new Set(favRows.map((r) => r.displayName));
    const favByAccountId = new Set(favRows.map((r) => r.accountId).filter((id): id is string => !!id));

    const teamRows = db.select().from(userTeamAssignment).all();
    const teamByName = new Map<string, string[]>();
    const teamByAccountId = new Map<string, string[]>();
    for (const row of teamRows) {
      const byName = teamByName.get(row.displayName) ?? [];
      byName.push(row.team);
      teamByName.set(row.displayName, byName);
      if (row.accountId) {
        const byId = teamByAccountId.get(row.accountId) ?? [];
        byId.push(row.team);
        teamByAccountId.set(row.accountId, byId);
      }
    }

    const users = jiraUsers.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isFavorite: (u.accountId != null && favByAccountId.has(u.accountId)) || favByName.has(u.displayName),
      teams: (u.accountId != null ? teamByAccountId.get(u.accountId) : undefined) ?? teamByName.get(u.displayName) ?? [],
    }));

    return NextResponse.json({ users }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to fetch watcher candidates", message);
    return NextResponse.json({ users: [], error: message }, { status: 500 });
  }
}
