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
 * with favorite status and team assignments matched by display name, mirroring
 * the AssigneePicker data shape.
 */
export async function GET() {
  try {
    const jiraUsers = await jiraClient.getAssignableUsers(env.JIRA_PROJECT_KEY);

    const favRows = db.select().from(favoriteUser).all();
    const favSet = new Set(favRows.map((r) => r.displayName));

    const teamRows = db.select().from(userTeamAssignment).all();
    const teamMap = new Map<string, string[]>();
    for (const row of teamRows) {
      const list = teamMap.get(row.displayName) ?? [];
      list.push(row.team);
      teamMap.set(row.displayName, list);
    }

    const users = jiraUsers.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isFavorite: favSet.has(u.displayName),
      teams: teamMap.get(u.displayName) ?? [],
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
