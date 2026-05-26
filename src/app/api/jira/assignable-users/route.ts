import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, favoriteUser, userTeamAssignment } from "@/db/schema";
import { isNotNull, sql } from "drizzle-orm";

/**
 * GET /api/jira/assignable-users
 *
 * Returns distinct assignees from local ticket data, enriched with
 * favorite status and team assignments for the AssigneePicker.
 */
export async function GET() {
  try {
    const rows = await db
      .selectDistinct({ assignee: ticket.assignee })
      .from(ticket)
      .where(isNotNull(ticket.assignee))
      .orderBy(sql`${ticket.assignee} COLLATE NOCASE`);

    const favRows = db.select().from(favoriteUser).all();
    const favSet = new Set(favRows.map((r) => r.displayName));

    const teamRows = db.select().from(userTeamAssignment).all();
    const teamMap = new Map<string, string[]>();
    for (const row of teamRows) {
      const list = teamMap.get(row.displayName) ?? [];
      list.push(row.team);
      teamMap.set(row.displayName, list);
    }

    const users = rows
      .map((r) => r.assignee)
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => {
        const parts = name.trim().split(/\s+/);
        const initials = parts.length === 1
          ? parts[0].slice(0, 2).toUpperCase()
          : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return {
          accountId: name,
          displayName: name,
          avatarUrl: null,
          initials,
          isFavorite: favSet.has(name),
          teams: teamMap.get(name) ?? [],
        };
      });

    return NextResponse.json({ users }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ users: [], error: message }, { status: 500 });
  }
}
