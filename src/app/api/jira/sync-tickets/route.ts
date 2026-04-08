import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractSprint, type JiraIssue } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";

const WATERMARK_KEY = "jira_sync_watermark";

/**
 * POST /api/jira/sync-tickets
 *
 * Two modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  // Check body for single-ticket mode
  let ticketKeys: string[] | undefined;
  if (!sprintId) {
    try {
      const body = await request.json();
      if (Array.isArray(body?.ticketKeys) && body.ticketKeys.length > 0) {
        ticketKeys = body.ticketKeys;
      }
    } catch {
      // No valid JSON body
    }
  }

  if (ticketKeys) {
    return syncIndividualTickets(ticketKeys);
  }

  return syncSprint(sprintId, searchParams.get("strategy") ?? "bulk");
}

async function syncIndividualTickets(ticketKeys: string[]) {
  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const scope = ticketKeys.join(",");

  await db.insert(activityLog).values({
    id: logId,
    type: "ticket-sync",
    scope,
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  try {
    const results = [];
    for (const key of ticketKeys) {
      const issue = await jiraClient.getIssue(key, controller.signal);
      const existing = await db.query.ticket.findFirst({
        where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
      });
      const info = await upsertIssue(issue, existing?.sprintName ?? "", controller.signal);
      results.push(info);
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${results.length} ticket${results.length === 1 ? "" : "s"} synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();
    return NextResponse.json({
      ok: true,
      count: results.length,
      live: jiraClient.isLive,
      strategy: "individual",
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    unregisterSync(logId);
  }
}

async function syncSprint(sprintId: string | null, strategy: string) {
  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "sprint-sync",
    scope: "",
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  try {
    if (!sprintId) {
      return NextResponse.json(
        { error: "sprintId query parameter is required" },
        { status: 400 },
      );
    }

    const sprintIdNum = parseInt(sprintId, 10);
    if (isNaN(sprintIdNum)) {
      return NextResponse.json(
        { error: "sprintId must be a number" },
        { status: 400 },
      );
    }

    await db.update(activityLog).set({ scope: sprintId }).where(eq(activityLog.id, logId));

    let issues: JiraIssue[];

    if (strategy === "timestamp-first" && jiraClient.isLive) {
      issues = await fetchTimestampFirst(sprintIdNum, controller.signal);
    } else {
      issues = await jiraClient.getSprintIssues(sprintIdNum, controller.signal);
    }

    const results = [];
    for (const issue of issues) {
      const info = await upsertIssue(issue, sprintId, controller.signal);
      results.push(info);
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${results.length} tickets synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();

    // Advance the incremental sync watermark to the latest updated timestamp
    const latestUpdated = issues
      .map((i) => i.fields.updated)
      .filter(Boolean)
      .sort()
      .pop();
    if (latestUpdated) {
      await updateWatermark(latestUpdated);
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    unregisterSync(logId);
  }
}

async function updateWatermark(value: string) {
  await upsertSetting(WATERMARK_KEY, value);
}

/**
 * Timestamp-first strategy: lightweight first pass fetches only key+updated,
 * then fetches full data only for issues changed since last local sync.
 */
async function fetchTimestampFirst(sprintIdNum: number, signal?: AbortSignal): Promise<JiraIssue[]> {
  const lightweight = await jiraClient.getSprintIssueTimestamps(sprintIdNum, signal);
  if (lightweight.length === 0) return [];

  const allKeys = lightweight.map((item) => item.key);
  const localTickets = await db
    .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
    .from(ticket)
    .where(inArray(ticket.jiraKey, allKeys));

  const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));

  const changedKeys = lightweight
    .filter((item) => localMap.get(item.key) !== item.updated)
    .map((item) => item.key);

  if (changedKeys.length === 0) return [];

  return jiraClient.getIssuesByKeys(changedKeys, signal);
}
