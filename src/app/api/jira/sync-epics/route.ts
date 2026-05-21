import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { activityLog, ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { jiraClient, ISSUE_FIELDS } from "@/lib/jira-client";
import { upsertIssue } from "@/lib/upsert-issue";
import { applyRateLimit } from "@/lib/rate-limiter";
import { agentFetch } from "@/lib/agent-fetch";
import { cache } from "@/lib/cache";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * POST /api/jira/sync-epics
 *
 * One-time sync: fetches all epics from Jira and upserts them into the local DB.
 * Called when the EpicPicker opens and the local epic list is empty or stale.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const logId = `sync-epics-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "ticket-sync",
    scope: "all-epics",
    status: "running",
    startedAt,
  });

  try {
    const jql = `project = ${env.JIRA_PROJECT_KEY} AND issuetype = Epic ORDER BY updated DESC`;
    const fields = ISSUE_FIELDS.split(",");
    const epics = await jiraClient.searchIssues(jql, fields, 200, request.signal);

    let upserted = 0;
    for (const epic of epics) {
      await upsertIssue(epic, "", request.signal);
      upserted++;
    }

    cache.invalidate("/api/epics");
    cache.invalidate(/^\/api\/tickets/);

    await db.update(activityLog).set({
      status: "success",
      summary: `Synced ${upserted} epics from Jira`,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    // Auto-regenerate stale summaries in the background
    after(async () => {
      try {
        const staleEpics = await db
          .select({ jiraKey: ticket.jiraKey })
          .from(ticket)
          .where(sql`${ticket.type} = 'epic' AND ${ticket.summary} IS NOT NULL AND (${ticket.summaryUpdatedAt} IS NULL OR ${ticket.jiraUpdatedAt} > ${ticket.summaryUpdatedAt})`)
          .all();

        if (staleEpics.length > 0) {
          logger.info("sync-epics", `${staleEpics.length} stale epic summaries, triggering regeneration`);
          // Fire-and-forget: call our own generate-summaries endpoint logic
          await agentFetch("/api/tasks", {
            method: "POST",
            body: { skill: "summarize-epics", args: await buildSummarizeArgs() },
            retries: 1,
          });
        }
      } catch (err) {
        logger.warn("sync-epics", "Auto-summary regeneration failed (non-critical)", err);
      }
    });

    return NextResponse.json({ count: upserted });
  } catch (err) {
    logger.error("sync-epics", "POST failed", err);

    await db.update(activityLog).set({
      status: "failed",
      summary: `Epic sync failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ error: "Epic sync failed" }, { status: 500 });
  }
}

async function buildSummarizeArgs(): Promise<{ epics: string }> {
  const epicRows = await db
    .select({ jiraKey: ticket.jiraKey, title: ticket.title, description: ticket.description })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();

  const childRows = await db
    .select({ epicKey: ticket.epicKey, title: ticket.title })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL AND ${ticket.type} != 'epic'`)
    .all();

  const childMap = new Map<string, string[]>();
  for (const c of childRows) {
    if (!c.epicKey) continue;
    const list = childMap.get(c.epicKey) ?? [];
    list.push(c.title);
    childMap.set(c.epicKey, list);
  }

  const payload = epicRows.map((e) => ({
    key: e.jiraKey,
    name: e.title,
    description: e.description ?? null,
    childTickets: childMap.get(e.jiraKey) ?? [],
  }));

  return { epics: JSON.stringify(payload) };
}
