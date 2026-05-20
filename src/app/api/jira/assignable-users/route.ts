import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { isNotNull, sql } from "drizzle-orm";

/**
 * GET /api/jira/assignable-users
 *
 * Returns distinct assignees from local ticket data.
 * Uses already-synced data instead of calling the Jira API directly.
 */
export async function GET() {
  try {
    const rows = await db
      .selectDistinct({ assignee: ticket.assignee })
      .from(ticket)
      .where(isNotNull(ticket.assignee))
      .orderBy(sql`${ticket.assignee} COLLATE NOCASE`);

    const users = rows
      .map((r) => r.assignee)
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => {
        const parts = name.trim().split(/\s+/);
        const initials = parts.length === 1
          ? parts[0].slice(0, 2).toUpperCase()
          : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return { accountId: name, displayName: name, avatarUrl: null, initials };
      });

    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ users: [], error: message }, { status: 500 });
  }
}
