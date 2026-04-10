import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractSprint, JiraApiError, type JiraIssue } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { createNotification } from "@/lib/notifications";

const WATERMARK_KEY = "jira_sync_watermark";

/**
 * POST /api/jira/sync-tickets
 *
 * Two modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

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
    // Batch-fetch existing tickets to avoid N+1 queries for removedFromJiraAt check
    const existingTickets = ticketKeys.length > 0
      ? await db.select({ jiraKey: ticket.jiraKey, removedFromJiraAt: ticket.removedFromJiraAt })
          .from(ticket).where(inArray(ticket.jiraKey, ticketKeys))
      : [];
    const removedMap = new Map(existingTickets.map((t) => [t.jiraKey, t.removedFromJiraAt]));

    const results = [];
    for (const key of ticketKeys) {
      try {
        const issue = await jiraClient.getIssue(key, controller.signal);
        const sprint = extractSprint(issue.fields);
        const sprintName = sprint ? String(sprint.id) : "";
        const info = await upsertIssue(issue, sprintName, controller.signal);

        if (removedMap.get(key)) {
          await db.update(ticket)
            .set({ removedFromJiraAt: null })
            .where(eq(ticket.jiraKey, key));
        }

        results.push(info);
      } catch (err) {
        if (err instanceof JiraApiError && err.status === 404) {
          await db.update(ticket)
            .set({ removedFromJiraAt: new Date().toISOString() })
            .where(eq(ticket.jiraKey, key));
          results.push({ key, removed: true });
        } else {
          throw err;
        }
      }
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${results.length} ticket${results.length === 1 ? "" : "s"} synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();
    cache.invalidate("/api/tickets");

    createNotification(
      "sync",
      `Ticket sync completed. ${results.length} ticket${results.length === 1 ? "" : "s"} updated.`,
      { category: "sync" },
    );

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

    createNotification("sync", `Jira sync failed: ${message}`, { category: "sync" });

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
    const jiraKeys = new Set<string>();
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      jiraKeys.add(issue.key);
      const info = await upsertIssue(issue, sprintId, controller.signal, i);
      results.push(info);
    }

    // Clear sprint assignment for tickets no longer in this sprint
    const localSprintTickets = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.sprintName, sprintId));

    const removedFromSprint = localSprintTickets
      .filter((t) => !jiraKeys.has(t.jiraKey));

    let removedCount = 0;
    if (removedFromSprint.length > 0) {
      const removedKeys = removedFromSprint.map((t) => t.jiraKey);
      await db.update(ticket)
        .set({ sprintName: "" })
        .where(inArray(ticket.jiraKey, removedKeys));

      // Check if removed tickets still exist in Jira (detect deletion)
      for (const key of removedKeys) {
        try {
          const issue = await jiraClient.getIssue(key, controller.signal);
          // Still exists: update with current Jira sprint
          const sprint = extractSprint(issue.fields);
          const newSprintName = sprint ? String(sprint.id) : "";
          await db.update(ticket)
            .set({ sprintName: newSprintName })
            .where(eq(ticket.jiraKey, key));
        } catch (err) {
          if (err instanceof JiraApiError && err.status === 404) {
            await db.update(ticket)
              .set({ removedFromJiraAt: new Date().toISOString() })
              .where(eq(ticket.jiraKey, key));
            removedCount++;
          }
        }
      }
    }

    const removedSuffix = removedCount > 0 ? `, ${removedCount} removed from Jira` : "";
    const clearedSuffix = removedFromSprint.length - removedCount > 0
      ? `, ${removedFromSprint.length - removedCount} left sprint`
      : "";

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${results.length} tickets synced${clearedSuffix}${removedSuffix}`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();
    cache.invalidate("/api/tickets");

    createNotification(
      "sync",
      `Sprint sync completed. ${results.length} ticket${results.length === 1 ? "" : "s"} updated.`,
      { category: "sync" },
    );

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

    createNotification("sync", `Jira sync failed: ${message}`, { category: "sync" });

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
