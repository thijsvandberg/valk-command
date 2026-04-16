import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting, sprintNameCache } from "@/db/schema";
import { isNotNull, ne, and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export interface FilterOptionsResponse {
  assignees: string[];
  sprints: { id: string; name: string }[];
}

export async function GET() {
  try {
    const [assigneeRows, sprintSetting, sprintCacheRows] = await Promise.all([
      db
        .selectDistinct({ assignee: ticket.assignee })
        .from(ticket)
        .where(and(isNotNull(ticket.assignee), ne(ticket.assignee, "")))
        .all(),
      db.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get(),
      db.select().from(sprintNameCache).all(),
    ]);

    const assignees = assigneeRows
      .map((r) => r.assignee!)
      .filter((a) => a.trim() !== "")
      .sort((a, b) => a.localeCompare(b));

    let sprints: { id: string; name: string }[] = [];

    if (sprintSetting) {
      try {
        const parsed = JSON.parse(sprintSetting.value) as { id: number; name: string }[];
        sprints = parsed
          .map((s) => ({ id: String(s.id), name: s.name }))
          .sort((a, b) => parseInt(b.id) - parseInt(a.id));
      } catch {
        // Fall through to sprintNameCache
      }
    }

    if (sprints.length === 0 && sprintCacheRows.length > 0) {
      sprints = sprintCacheRows
        .map((r) => ({ id: r.sprintId, name: r.displayName }))
        .sort((a, b) => parseInt(b.id) - parseInt(a.id));
    }

    return NextResponse.json({ assignees, sprints } satisfies FilterOptionsResponse);
  } catch (err) {
    logger.error("search-filter-options", "GET failed", err);
    return NextResponse.json({ error: "Failed to load filter options" }, { status: 500 });
  }
}
