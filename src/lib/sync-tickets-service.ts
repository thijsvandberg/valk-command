import { db } from "@/db";
import { ticket, ticketMetadata, ticketScopeChange, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractSprint, extractEpicLink, JiraApiError, type JiraIssue } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { cache } from "@/lib/cache";
import { ensureSprintsCached } from "@/lib/sprint-cache";
import { logger } from "@/lib/logger";

const WATERMARK_KEY = "jira_sync_watermark";

/**
 * Backfill sprint metadata for any sprint ids seen during a sync that are not yet
 * in the cached sprint list. Best-effort: swallows errors so a backfill problem
 * never fails the ticket sync that triggered it.
 */
async function backfillUnknownSprints(sprintIds: Iterable<string>, signal?: AbortSignal): Promise<void> {
  try {
    await ensureSprintsCached(sprintIds, signal);
  } catch (err) {
    logger.warn("jira", "Sprint backfill failed", err instanceof Error ? err.message : String(err));
  }
}

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
    const seenSprintIds = new Set<string>();
    for (const key of ticketKeys) {
      try {
        const issue = await jiraClient.getIssue(key, controller.signal);
        const sprint = extractSprint(issue.fields);
        const sprintName = sprint ? String(sprint.id) : "";
        if (sprint) cacheSprintName(String(sprint.id), sprint.name);
        if (sprintName) seenSprintIds.add(sprintName);
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

    await backfillUnknownSprints(seenSprintIds, controller.signal);

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
    // The synced sprint itself, plus any sprint a ticket moves to below, may not be
    // in the cached sprint list yet; collect them for a backfill at the end.
    const discoveredSprintIds = new Set<string>([sprintId]);
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
          if (newSprintName) discoveredSprintIds.add(newSprintName);
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

    await backfillUnknownSprints(discoveredSprintIds, controller.signal);

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

export type GroupSyncKind = "sprint" | "epic";

export interface GroupSyncTarget {
  kind: GroupSyncKind;
  /** Sprint id (numeric string) or epic Jira key. */
  id: string;
}

function assertSprintId(id: string): number {
  const num = parseInt(id, 10);
  if (isNaN(num)) {
    throw new SyncValidationError("sprintId must be a number");
  }
  return num;
}

/**
 * Lightweight membership plan for a sprint or epic: the current Jira issue keys in
 * rank order. Cheap (a couple of paginated timestamp calls, no upserts) so the
 * client can split the work into tranches and show progress before syncing.
 */
export async function planGroupKeys(target: GroupSyncTarget, requestSignal?: AbortSignal): Promise<string[]> {
  if (!target.id) {
    throw new SyncValidationError(`${target.kind} id is required`);
  }
  if (target.kind === "sprint") {
    const sprintId = assertSprintId(target.id);
    const rows = await jiraClient.getSprintIssueTimestamps(sprintId, requestSignal);
    return rows.map((r) => r.key);
  }
  const rows = await jiraClient.getEpicIssueTimestamps(target.id, requestSignal);
  return rows.map((r) => r.key);
}

/**
 * Final pass of a tranched group sync. The tranches sync each ticket's own fields
 * (including its parent sprint/epic), so additions and field changes are already
 * handled; this step (a) restores rank order from the plan and (b) reconciles
 * tickets that have left the sprint/epic in Jira. Returns how many tickets left.
 */
export async function reconcileGroupMembership(
  target: GroupSyncTarget,
  currentKeys: string[],
  requestSignal?: AbortSignal,
): Promise<{ removed: number }> {
  if (!target.id) {
    throw new SyncValidationError(`${target.kind} id is required`);
  }

  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  await db.insert(activityLog).values({
    id: logId,
    // The activity_log.type CHECK constraint has no dedicated epic value, so epic
    // reconciles log as "ticket-sync" (matching the existing epic sync route); the
    // scope column carries the epic key for identification.
    type: target.kind === "epic" ? "ticket-sync" : "sprint-sync",
    scope: target.id,
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);
  requestSignal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    if (target.kind === "sprint") assertSprintId(target.id);

    // Restore rank order from the plan (tranche sync does not set rank).
    for (let i = 0; i < currentKeys.length; i++) {
      await db.update(ticket).set({ jiraRank: i }).where(eq(ticket.jiraKey, currentKeys[i]));
    }

    const currentSet = new Set(currentKeys);
    const membershipColumn = target.kind === "sprint" ? ticket.sprintName : ticket.epicKey;
    const localMembers = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(membershipColumn, target.id));

    const left = localMembers.filter((t) => !currentSet.has(t.jiraKey));

    let removedFromJira = 0;
    // For a sprint target, the synced sprint plus any sprint a departing ticket
    // moves to may be missing from the cached list; backfill them at the end.
    const discoveredSprintIds = new Set<string>(target.kind === "sprint" ? [target.id] : []);
    for (const { jiraKey: key } of left) {
      try {
        const issue = await jiraClient.getIssue(key, controller.signal);
        if (target.kind === "sprint") {
          const sprint = extractSprint(issue.fields);
          const newSprintName = sprint ? String(sprint.id) : "";
          if (sprint) cacheSprintName(String(sprint.id), sprint.name);
          if (newSprintName) discoveredSprintIds.add(newSprintName);
          await db.update(ticket).set({ sprintName: newSprintName }).where(eq(ticket.jiraKey, key));
        } else {
          const epicData = extractEpicLink(issue.fields);
          await db.update(ticket)
            .set({ epic: epicData?.name ?? null, epicKey: epicData?.key ?? null })
            .where(eq(ticket.jiraKey, key));
        }
      } catch (err) {
        if (err instanceof JiraApiError && err.status === 404) {
          await db.update(ticket)
            .set({ removedFromJiraAt: new Date().toISOString() })
            .where(eq(ticket.jiraKey, key));
          removedFromJira++;
        } else {
          throw err;
        }
      }
    }

    await backfillUnknownSprints(discoveredSprintIds, controller.signal);

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${target.kind} ${target.id}: ${currentKeys.length} in scope, ${left.length} left`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();
    cache.invalidate("/api/tickets");

    return { removed: left.length };
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
    logger.error("jira", "Group reconcile failed", errorMessage);
    throw new SyncValidationError("Group reconcile failed", 500);
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
