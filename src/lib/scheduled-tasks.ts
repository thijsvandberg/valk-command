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
import { jiraClient, extractSprint } from "@/lib/jira-client";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertSetting } from "@/lib/upsert-setting";
import { defineTask, type TaskResult } from "@/lib/scheduler";
import { logger } from "@/lib/logger";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WATERMARK_KEY = "jira_sync_watermark";
const BATCH_LIMIT = 50;
const REMOVED_TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Task: Incremental Jira Sync (every 120s)
// ---------------------------------------------------------------------------

async function runIncrementalSync(): Promise<TaskResult> {
  if (!jiraClient.isLive) {
    return { skipped: true, reason: "Jira not configured" };
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
    const issues = await jiraClient.getIssuesByKeys(staleKeys, controller.signal);

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
    150_000,
    runIncrementalSync,
  );

  defineTask(
    "cleanup-removed-tickets",
    "Cleanup Removed Tickets",
    24 * 60 * 60 * 1000,
    cleanupRemovedTickets,
  );

  defineTask(
    "cleanup-activity-log",
    "Activity Log Cleanup",
    5 * 60 * 1000,
    cleanupActivityLog,
  );

  defineTask(
    "cleanup-notifications",
    "Notification Cleanup",
    60 * 60 * 1000,
    cleanupOldNotifications,
  );
}
