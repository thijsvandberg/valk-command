import { db } from "@/db";
import { ticket, ticketMetadata, ticketScopeChange, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractSprint, JiraApiError, type JiraIssue } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const WATERMARK_KEY = "jira_sync_watermark";

export interface SyncResult {
  count: number;
  live: boolean;
  strategy: string;
  tickets: unknown[];
}

export class SyncValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SyncValidationError";
    this.status = status;
  }
}

async function updateWatermark(value: string) {
  await upsertSetting(WATERMARK_KEY, value);
}

export async function syncIndividualTickets(ticketKeys: string[], requestSignal?: AbortSignal): Promise<SyncResult> {
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

    return {
      count: results.length,
      live: jiraClient.isLive,
      strategy: "individual",
      tickets: results,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SyncValidationError("Sync cancelled", 499);
    }
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: errorMessage,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Ticket sync failed", errorMessage);
    throw new SyncValidationError("Ticket sync failed", 500);
  } finally {
    unregisterSync(logId);
  }
}

export async function syncSprint(sprintId: string | null, strategy: string, requestSignal?: AbortSignal): Promise<SyncResult> {
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
      throw new SyncValidationError("sprintId query parameter is required");
    }

    const sprintIdNum = parseInt(sprintId, 10);
    if (isNaN(sprintIdNum)) {
      throw new SyncValidationError("sprintId must be a number");
    }

    await db.update(activityLog).set({ scope: sprintId }).where(eq(activityLog.id, logId));

    let issues: JiraIssue[];
    let allJiraKeys: Set<string> | null = null;
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
      const rank = rankMap ? rankMap.get(issue.key) ?? i : i;
      const info = await upsertIssue(issue, sprintId, controller.signal, rank);
      results.push(info);
    }

    if (rankMap) {
      const changedKeys = new Set(issues.map((iss) => iss.key));
      for (const [key, rank] of rankMap) {
        if (!changedKeys.has(key)) {
          await db.update(ticket).set({ jiraRank: rank }).where(eq(ticket.jiraKey, key));
        }
      }
    }

    const localSprintTickets = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.sprintName, sprintId));

    const removedFromSprint = localSprintTickets
      .filter((t) => !jiraKeys.has(t.jiraKey));

    let removedCount = 0;
    if (removedFromSprint.length > 0) {
      const removedKeys = removedFromSprint.map((t) => t.jiraKey);

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

      for (const key of removedKeys) {
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

    const latestUpdated = issues
      .map((i) => i.fields.updated)
      .filter(Boolean)
      .sort()
      .pop();
    if (latestUpdated) {
      await updateWatermark(latestUpdated);
    }

    return {
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    };
  } catch (err) {
    if (err instanceof SyncValidationError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SyncValidationError("Sync cancelled", 499);
    }
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: errorMessage,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Ticket sync failed", errorMessage);
    throw new SyncValidationError("Ticket sync failed", 500);
  } finally {
    unregisterSync(logId);
  }
}

export async function syncBacklog(strategy: string, requestSignal?: AbortSignal): Promise<SyncResult> {
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

    if (strategy === "timestamp-first" && rankMap.size > 0) {
      const changedKeys = new Set(issues.map((iss) => iss.key));
      for (const [key, rank] of rankMap) {
        if (!changedKeys.has(key)) {
          await db.update(ticket).set({ jiraRank: rank }).where(eq(ticket.jiraKey, key));
        }
      }
    }

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

    return {
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    };
  } catch (err) {
    if (err instanceof SyncValidationError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SyncValidationError("Sync cancelled", 499);
    }
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: errorMessage,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Backlog sync failed", errorMessage);
    throw new SyncValidationError("Backlog sync failed", 500);
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
