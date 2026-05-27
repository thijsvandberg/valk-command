/**
 * Scheduled task definitions for the lazy-cron scheduler.
 *
 * Import this module once (e.g., from the tick API route) to register
 * all system tasks. Each task is a self-contained unit with its own
 * interval and handler.
 */

import { db } from "@/db";
import {
  ticket, activityLog, alert, appSetting,
  ticketMetadata, ticketSubtask, ticketLink, ticketAttachment,
  ticketLocalEdit, poComment, jiraComment, storyVersion, storedReview,
  storyWriterSession,
} from "@/db/schema";
import { eq, inArray, and, isNotNull, lt, desc, notInArray } from "drizzle-orm";
import { jiraClient, JiraApiError, extractSprint } from "@/lib/jira-client";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertSetting } from "@/lib/upsert-setting";
import { defineTask, type TaskResult } from "@/lib/scheduler";
import { logger } from "@/lib/logger";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { createNotification } from "@/lib/notifications";
import { refreshSprintMetadata } from "@/lib/refresh-sprint-metadata";
import { dequeue, markChecked, remove as removeFromQueue, stats as queueStats } from "@/lib/revalidation-queue";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WATERMARK_KEY = "jira_sync_watermark";
const BATCH_LIMIT = 50;
const REMOVED_TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REVALIDATION_BATCH_SIZE = 25;

// ---------------------------------------------------------------------------
// Task: Incremental Jira Sync (every 120s)
// ---------------------------------------------------------------------------

async function runIncrementalSync(): Promise<TaskResult> {
  if (!jiraClient.isLive) {
    return { skipped: true, reason: "Jira not configured" };
  }

  // Sprint metadata refresh on its own 5-minute cooldown
  try {
    await refreshSprintMetadata();
  } catch (err) {
    logger.warn("scheduled-tasks", "Sprint metadata refresh failed (non-blocking)",
      err instanceof Error ? err.message : String(err));
  }

  const watermarkRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, WATERMARK_KEY),
  });

  if (!watermarkRow) {
    return { skipped: true, needsFullSync: true };
  }

  const syncId = `inc-sync-${crypto.randomUUID()}`;
  const controller = registerSync(syncId);
  const watermark = watermarkRow.value;

  try {
    const changed = await jiraClient.getUpdatedSince(watermark, controller.signal);

    if (changed.length === 0) {
      return { count: 0, remaining: 0, watermark };
    }

    const changedKeys = changed.map((c) => c.key);
    const localTickets = await db
      .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
      .from(ticket)
      .where(inArray(ticket.jiraKey, changedKeys));

    const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));
    const staleItems = changed.filter((item) => localMap.get(item.key) !== item.updated);

    if (staleItems.length === 0) {
      const latestTimestamp = changed[changed.length - 1].updated;
      await upsertSetting(WATERMARK_KEY, latestTimestamp);
      return { count: 0, remaining: 0, watermark: latestTimestamp };
    }

    const totalStale = staleItems.length;
    const batch = staleItems.slice(0, BATCH_LIMIT);
    const remaining = totalStale - batch.length;

    const staleKeys = batch.map((item) => item.key);
    const issues = await jiraClient.getIssuesByKeys(staleKeys, controller.signal, true);

    issues.sort((a, b) => (a.fields.updated ?? "").localeCompare(b.fields.updated ?? ""));

    const results = [];
    for (const issue of issues) {
      const sprint = extractSprint(issue.fields);
      const sprintName = sprint ? String(sprint.id) : "";
      if (sprint) cacheSprintName(String(sprint.id), sprint.name);
      const info = await upsertIssue(issue, sprintName, controller.signal);
      results.push(info);

      if (issue.fields.updated) {
        await upsertSetting(WATERMARK_KEY, issue.fields.updated);
      }
    }

    invalidateSearchCache();

    const remainingSuffix = remaining > 0 ? `, ${remaining} remaining` : "";
    await db.insert(activityLog).values({
      id: syncId,
      type: "incremental-sync",
      scope: `${results.length} tickets`,
      status: "success",
      summary: `${results.length} ticket${results.length === 1 ? "" : "s"} synced${remainingSuffix}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Notify only when tickets were actually updated — not on no-op runs
    if (results.length > 0) {
      const suffix = remaining > 0 ? ` (${remaining} more pending)` : "";
      createNotification(
        "sync",
        `Jira sync: ${results.length} ticket${results.length === 1 ? "" : "s"} updated${suffix}`,
        { category: "sync" },
      );
    }

    return {
      count: results.length,
      checked: changed.length,
      remaining,
      watermark: issues[issues.length - 1]?.fields.updated ?? watermark,
      tickets: results.map((r) => r.key),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "Sync cancelled" };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("scheduled-tasks", "Incremental sync failed:", message);
    createNotification("sync", `Jira sync failed: ${message}`, { category: "sync" });
    return { error: message };
  } finally {
    unregisterSync(syncId);
  }
}

// ---------------------------------------------------------------------------
// Task: Cleanup removed tickets (every 24h)
// ---------------------------------------------------------------------------

async function cleanupRemovedTickets(): Promise<TaskResult> {
  const cutoff = new Date(Date.now() - REMOVED_TICKET_TTL_MS).toISOString();

  const expired = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .where(
      and(
        isNotNull(ticket.removedFromJiraAt),
        lt(ticket.removedFromJiraAt, cutoff),
      ),
    );

  if (expired.length === 0) {
    return { deleted: 0 };
  }

  const keys = expired.map((t) => t.jiraKey);

  for (const key of keys) {
    db.transaction((tx) => {
      tx.delete(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).run();
      tx.delete(ticketSubtask).where(eq(ticketSubtask.ticketKey, key)).run();
      tx.delete(ticketLink).where(eq(ticketLink.ticketKey, key)).run();
      tx.delete(ticketAttachment).where(eq(ticketAttachment.ticketKey, key)).run();
      tx.delete(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, key)).run();
      tx.delete(poComment).where(eq(poComment.ticketKey, key)).run();
      tx.delete(jiraComment).where(eq(jiraComment.ticketKey, key)).run();
      tx.delete(storyVersion).where(eq(storyVersion.jiraKey, key)).run();
      tx.delete(storedReview).where(eq(storedReview.ticketKey, key)).run();
      tx.delete(storyWriterSession).where(eq(storyWriterSession.ticketKey, key)).run();
      tx.delete(ticket).where(eq(ticket.jiraKey, key)).run();
    });
  }

  invalidateSearchCache();

  return { deleted: keys.length, keys };
}

// ---------------------------------------------------------------------------
// Task: Revalidate deleted tickets (every 10 minutes)
// ---------------------------------------------------------------------------

export async function revalidateDeletedTickets(): Promise<TaskResult> {
  if (!jiraClient.isLive) {
    return { skipped: true, reason: "Jira not configured", ...queueStats() };
  }

  const keysToCheck = dequeue(REVALIDATION_BATCH_SIZE);

  if (keysToCheck.length === 0) {
    return { checked: 0, removed: 0, ...queueStats() };
  }

  try {
    // Single bulk JQL call returns only tickets that still exist
    const found = await jiraClient.getIssuesByKeys(keysToCheck);
    const foundKeys = new Set(found.map((issue) => issue.key));
    const missingKeys = keysToCheck.filter((k) => !foundKeys.has(k));

    // Keys that exist are confirmed alive
    const aliveKeys = keysToCheck.filter((k) => foundKeys.has(k));
    markChecked(aliveKeys);

    let removedCount = 0;
    const removedKeys: string[] = [];

    // Confirm each missing ticket individually (could be permissions, not deletion)
    for (const key of missingKeys) {
      try {
        await jiraClient.getIssue(key);
        markChecked([key]);
      } catch (err) {
        if (err instanceof JiraApiError && err.status === 404) {
          await db.update(ticket)
            .set({ removedFromJiraAt: new Date().toISOString() })
            .where(eq(ticket.jiraKey, key));
          removedKeys.push(key);
          removedCount++;
          logger.info("scheduled-tasks", `Ticket ${key} confirmed deleted from Jira`);
        }
      }
    }

    if (removedCount > 0) {
      removeFromQueue(removedKeys);
      invalidateSearchCache();
      createNotification(
        "sync",
        `Deletion check: ${removedCount} ticket${removedCount === 1 ? "" : "s"} removed from Jira`,
        { category: "sync" },
      );
    }

    return { checked: keysToCheck.length, removed: removedCount, ...queueStats() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("scheduled-tasks", "Ticket revalidation failed:", message);
    return { error: message, ...queueStats() };
  }
}

// ---------------------------------------------------------------------------
// Task: Cleanup activity log (every 5 minutes)
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 7;
const RETENTION_MAX_ENTRIES = 200;

export async function cleanupActivityLog(): Promise<TaskResult> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Mark stale running entries as failed and delete entries beyond retention window
  const [staleResult] = await Promise.all([
    db.update(activityLog).set({
      status: "failed",
      errorDetail: "Sync timed out (no response after 5 minutes)",
      completedAt: new Date().toISOString(),
    }).where(and(eq(activityLog.status, "running"), lt(activityLog.startedAt, cutoff))),
    db.delete(activityLog).where(lt(activityLog.startedAt, retentionCutoff)),
  ]);

  // Keep at most RETENTION_MAX_ENTRIES entries by deleting the oldest
  const recentIds = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .orderBy(desc(activityLog.startedAt))
    .limit(RETENTION_MAX_ENTRIES);
  const keepSet = recentIds.map((r) => r.id);
  if (keepSet.length === RETENTION_MAX_ENTRIES) {
    await db.delete(activityLog).where(notInArray(activityLog.id, keepSet));
  }

  const markedStale = (staleResult as { changes?: number })?.changes ?? 0;
  return { markedStale };
}

// ---------------------------------------------------------------------------
// Task: Cleanup old notifications (every 60 minutes)
// ---------------------------------------------------------------------------

const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function cleanupOldNotifications(): Promise<TaskResult> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_MS).toISOString();
  await db.delete(alert).where(lt(alert.createdAt, cutoff));
  return { cutoff };
}

// ---------------------------------------------------------------------------
// Register all tasks
// ---------------------------------------------------------------------------

export function registerScheduledTasks() {
  defineTask(
    "incremental-sync",
    "Jira Incremental Sync",
    "Syncs recently updated tickets from Jira using watermark-based incremental fetching. Processes up to 50 tickets per run and creates notifications for changes. Also refreshes sprint metadata (state, goal, dates) every 5 minutes.",
    150_000,
    runIncrementalSync,
  );

  defineTask(
    "revalidate-deleted-tickets",
    "Revalidate Deleted Tickets",
    "Checks a rotating batch of 25 local tickets against Jira to detect deletions. Uses a cursor to cycle through all tickets over time. Marks confirmed 404s as removed.",
    10 * 60 * 1000,
    revalidateDeletedTickets,
  );

  defineTask(
    "cleanup-removed-tickets",
    "Cleanup Removed Tickets",
    "Permanently deletes tickets removed from Jira more than 7 days ago, including all related data (comments, metadata, attachments, reviews).",
    24 * 60 * 60 * 1000,
    cleanupRemovedTickets,
  );

  defineTask(
    "cleanup-activity-log",
    "Activity Log Cleanup",
    "Marks stale running entries as failed after 5 minutes, removes entries older than 7 days, and caps the log at 200 entries.",
    5 * 60 * 1000,
    cleanupActivityLog,
  );

  defineTask(
    "cleanup-notifications",
    "Notification Cleanup",
    "Removes read and unread notifications older than 30 days to keep the notification list manageable.",
    60 * 60 * 1000,
    cleanupOldNotifications,
  );
}
