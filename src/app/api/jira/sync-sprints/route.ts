import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";

/**
 * POST /api/jira/sync-sprints
 *
 * Fetches the sprint list from Jira (or mock) and caches it in app_setting
 * as a JSON blob keyed by "jira_sprints".
 */
export async function POST() {
  try {
    const sprints = await jiraClient.getSprints();

    const payload = JSON.stringify(
      sprints.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
      })),
    );

    const existing = await db.query.appSetting.findFirst({
      where: (row, { eq }) => eq(row.key, "jira_sprints"),
    });

    if (existing) {
      await db
        .update(appSetting)
        .set({ value: payload })
        .where(eq(appSetting.key, "jira_sprints"));
    } else {
      await db.insert(appSetting).values({ key: "jira_sprints", value: payload });
    }

    return NextResponse.json({
      ok: true,
      count: sprints.length,
      live: jiraClient.isLive,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
