import { NextResponse } from "next/server";
import { db } from "@/db";
import { jiraClient } from "@/lib/jira-client";

/**
 * GET /api/jira/sprints
 *
 * Returns the cached sprint list from the app_setting table.
 * Falls back to fetching from Jira (or mock) if no cache exists.
 */
export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq }) => eq(r.key, "jira_sprints"),
    });

    if (row) {
      const sprints = JSON.parse(row.value);
      return NextResponse.json(sprints);
    }

    // No cache yet: fetch directly so the list is never empty
    const sprints = await jiraClient.getSprints();
    return NextResponse.json(
      sprints.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
      })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
