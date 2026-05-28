import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketScopeChange, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractSprint, JiraApiError, type JiraIssue } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const WATERMARK_KEY = "jira_sync_watermark";

const ticketKeysBodySchema = z.object({
  ticketKeys: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * POST /api/jira/sync-tickets
 *
 * Two modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets (max 100)
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  let sprintId = searchParams.get("sprintId");

  // Parse body: either { ticketKeys } for single-ticket mode or { sprintId } for sprint sync.
  // sprintId and strategy are accepted from the body as a fallback because the API client sends them there.
  let ticketKeys: string[] | undefined;
  let strategy = searchParams.get("strategy") ?? "bulk";
  try {
    const body = await request.json();
    if (body?.ticketKeys !== undefined) {
      const parsed = ticketKeysBodySchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "Invalid ticketKeys", 400);
      }
      ticketKeys = parsed.data.ticketKeys;
    } else {
      if (!sprintId && body?.sprintId) {
        sprintId = String(body.sprintId);
      }
      if (body?.strategy && typeof body.strategy === "string") {
        strategy = body.strategy;
      }
    }
  } catch {
    // No valid JSON body — URL params are the only source
  }

  if (ticketKeys) {
    return syncIndividualTickets(ticketKeys, request.signal);
  }

  if (sprintId === "__backlog__") {
    return syncBacklog(strategy, request.signal);
  }

  return syncSprint(sprintId, strategy, request.signal);
}

async function syncIndividualTickets(ticketKeys: string[], requestSignal?: AbortSignal) {
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
  requestSignal?.addEventListener("abort", () => controller.abort(), { once: true });

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
        if (sprint) cacheSprintName(String(sprint.id), sprint.name);
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

    return NextResponse.json({
      count: results.length,
      live: jiraClient.isLive,
      strategy: "individual",
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("Sync cancelled", 499);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Ticket sync failed", message);
    return errorResponse("Ticket sync failed", 500);
  } finally {
    unregisterSync(logId);
  }
}

async function syncSprint(sprintId: string | null, strategy: string, requestSignal?: AbortSignal) {
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
  requestSignal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    if (!sprintId) {
      return errorResponse("sprintId query parameter is required", 400);
    }

    const sprintIdNum = parseInt(sprintId, 10);
    if (isNaN(sprintIdNum)) {
      return errorResponse("sprintId must be a number", 400);
    }

    await db.update(activityLog).set({ scope: sprintId }).where(eq(activityLog.id, logId));

    let issues: JiraIssue[];
    // Complete set of keys Jira reports for this sprint (used for deletion detection)
    let allJiraKeys: Set<string> | null = null;
    // When using timestamp-first, rankMap holds the correct rank for ALL sprint issues
    let rankMap: Map<string, number> | null = null;

    if (strategy === "timestamp-first" && jiraClient.isLive) {
      const tsResult = await fetchTimestampFirst(sprintIdNum, controller.signal);
      issues = tsResult.issues;
      allJiraKeys = tsResult.allJiraKeys;
      rankMap = tsResult.rankMap;
    } else {
      issues = await jiraClient.getSprintIssues(sprintIdNum, controller.signal);
    }

    const results = [];
    const jiraKeys = new Set<string>(allJiraKeys ?? []);
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      jiraKeys.add(issue.key);
      // For timestamp-first, use the rank from the full lightweight fetch;
      // for full fetch, issues are already ordered by rank so index is correct.
      const rank = rankMap ? rankMap.get(issue.key) ?? i : i;
      const info = await upsertIssue(issue, sprintId, controller.signal, rank);
      results.push(info);
    }

    // When using timestamp-first, also update ranks for unchanged tickets
    // since Jira's rank order may have changed without updating the ticket itself.
    if (rankMap) {
      const changedKeys = new Set(issues.map((iss) => iss.key));
      for (const [key, rank] of rankMap) {
        if (!changedKeys.has(key)) {
          await db.update(ticket).set({ jiraRank: rank }).where(eq(ticket.jiraKey, key));
        }
      }
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

      // Record scope changes for burnup chart
      const removedTicketData = await db
        .select({ jiraKey: ticket.jiraKey, sp: ticket.storyPoints, bv: ticketMetadata.businessValue })
        .from(ticket)
        .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
        .where(inArray(ticket.jiraKey, removedKeys))
        .all();
      const now = new Date().toISOString();
      for (const t of removedTicketData) {
        db.insert(ticketScopeChange).values({
          id: `scope-${t.jiraKey}-rm-${Date.now()}`,
          ticketKey: t.jiraKey,
          sprintName: sprintId,
          action: "removed",
          storyPoints: t.sp ?? 0,
          businessValue: (t.bv != null && t.bv >= 1) ? t.bv : 0,
          changedAt: now,
        }).onConflictDoNothing().run();
      }

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
          if (sprint) cacheSprintName(String(sprint.id), sprint.name);
          await db.update(ticket)
            .set({ sprintName: newSprintName })
            .where(eq(ticket.jiraKey, key));
        } catch (err) {
          if (err instanceof JiraApiError && err.status === 404) {
            // Keep sprintName so the ticket stays visible in its last sprint view
            await db.update(ticket)
              .set({ removedFromJiraAt: new Date().toISOString(), sprintName: sprintId })
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
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("Sync cancelled", 499);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Ticket sync failed", message);
    return errorResponse("Ticket sync failed", 500);
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
 *
 * Returns both the changed issues (full data) and the complete set of keys
 * that Jira reports for the sprint, so the caller can detect deletions.
 */
/**
 * Sync backlog tickets (no sprint assigned).
 * Uses timestamp-first strategy to detect changed issues.
 */
async function syncBacklog(strategy: string, requestSignal?: AbortSignal) {
  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "sprint-sync",
    scope: "backlog",
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);
  requestSignal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    let issues: JiraIssue[];
    let allJiraKeys: Set<string>;
    let rankMap: Map<string, number>;

    if (strategy === "timestamp-first" && jiraClient.isLive) {
      const tsResult = await fetchBacklogTimestampFirst(controller.signal);
      issues = tsResult.issues;
      allJiraKeys = tsResult.allJiraKeys;
      rankMap = tsResult.rankMap;
    } else {
      const backlogIssues = await jiraClient.getBacklogIssues(controller.signal);
      issues = backlogIssues;
      allJiraKeys = new Set(backlogIssues.map((i) => i.key));
      rankMap = new Map(backlogIssues.map((i, idx) => [i.key, idx]));
    }

    const results = [];
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      allJiraKeys.add(issue.key);
      const rank = rankMap.get(issue.key) ?? i;
      const info = await upsertIssue(issue, "", controller.signal, rank);
      results.push(info);
    }

    // Update ranks for unchanged backlog tickets
    if (strategy === "timestamp-first" && rankMap.size > 0) {
      const changedKeys = new Set(issues.map((iss) => iss.key));
      for (const [key, rank] of rankMap) {
        if (!changedKeys.has(key)) {
          await db.update(ticket).set({ jiraRank: rank }).where(eq(ticket.jiraKey, key));
        }
      }
    }

    // Detect tickets that gained a sprint since last sync
    const localBacklogTickets = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.sprintName, ""));

    const leftBacklog = localBacklogTickets
      .filter((t) => !allJiraKeys.has(t.jiraKey));

    for (const { jiraKey: key } of leftBacklog) {
      try {
        const issue = await jiraClient.getIssue(key, controller.signal);
        const sprint = extractSprint(issue.fields);
        const newSprintName = sprint ? String(sprint.id) : "";
        if (sprint) cacheSprintName(String(sprint.id), sprint.name);
        await db.update(ticket)
          .set({ sprintName: newSprintName })
          .where(eq(ticket.jiraKey, key));
      } catch (err) {
        if (err instanceof JiraApiError && err.status === 404) {
          await db.update(ticket)
            .set({ removedFromJiraAt: new Date().toISOString() })
            .where(eq(ticket.jiraKey, key));
        }
      }
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `Backlog: ${results.length} tickets synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();
    cache.invalidate("/api/tickets");

    return NextResponse.json({
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("Sync cancelled", 499);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Backlog sync failed", message);
    return errorResponse("Backlog sync failed", 500);
  } finally {
    unregisterSync(logId);
  }
}

async function fetchBacklogTimestampFirst(signal?: AbortSignal): Promise<{ issues: JiraIssue[]; allJiraKeys: Set<string>; rankMap: Map<string, number> }> {
  const lightweight = await jiraClient.getBacklogIssueTimestamps(signal);
  if (lightweight.length === 0) return { issues: [], allJiraKeys: new Set(), rankMap: new Map() };

  const allJiraKeys = new Set(lightweight.map((item) => item.key));
  const rankMap = new Map(lightweight.map((item, idx) => [item.key, idx]));
  const allKeys = [...allJiraKeys];
  const localTickets = await db
    .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
    .from(ticket)
    .where(inArray(ticket.jiraKey, allKeys));

  const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));
  const changedKeys = lightweight
    .filter((item) => localMap.get(item.key) !== item.updated)
    .map((item) => item.key);

  if (changedKeys.length === 0) return { issues: [], allJiraKeys, rankMap };

  const issues = await jiraClient.getIssuesByKeys(changedKeys, signal, true);
  return { issues, allJiraKeys, rankMap };
}

async function fetchTimestampFirst(sprintIdNum: number, signal?: AbortSignal): Promise<{ issues: JiraIssue[]; allJiraKeys: Set<string>; rankMap: Map<string, number> }> {
  const lightweight = await jiraClient.getSprintIssueTimestamps(sprintIdNum, signal);
  if (lightweight.length === 0) return { issues: [], allJiraKeys: new Set(), rankMap: new Map() };

  const allJiraKeys = new Set(lightweight.map((item) => item.key));
  // lightweight is ordered by rank; build a rank map for all sprint issues
  const rankMap = new Map(lightweight.map((item, idx) => [item.key, idx]));
  const allKeys = [...allJiraKeys];
  const localTickets = await db
    .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
    .from(ticket)
    .where(inArray(ticket.jiraKey, allKeys));

  const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));

  const changedKeys = lightweight
    .filter((item) => localMap.get(item.key) !== item.updated)
    .map((item) => item.key);

  if (changedKeys.length === 0) return { issues: [], allJiraKeys, rankMap };

  const issues = await jiraClient.getIssuesByKeys(changedKeys, signal, true);
  return { issues, allJiraKeys, rankMap };
}
