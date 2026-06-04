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
import { eq, inArray, and, isNotNull, isNull, lt, desc, notInArray } from "drizzle-orm";
import { FINISHED_STATUSES } from "@/lib/ticket-status";
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
import { logActivity } from "@/lib/activity-logger";
import {
  scoreStaleness, isPoMetadataEmpty, STALENESS_CANDIDATE_THRESHOLD,
} from "@/lib/deprecation-staleness";
import { selectScanBatch } from "@/lib/deprecation-scan-batch";
import {
  claimPendingBatch, markDone, markError, requeueStuckRunning, enqueueDeepScan,
} from "@/lib/deprecation-scan-queue";
import { runDeepScan } from "@/lib/deprecation-topics";
// Side-effect import: registers every Tier-2 topic scorer before runDeepScan runs.
import "@/lib/topics";
import {
  AUTO_SCAN_ENABLED_KEY,
  AUTO_SCAN_DAILY_COUNT_KEY,
  AUTO_SCAN_BUDGET_KEY_PREFIX,
  AUTO_SCAN_DEFAULT_DAILY_COUNT,
} from "@/lib/auto-scan-settings";
import {
  selectDeepScanKeys,
  type SelectableTicket,
} from "@/lib/deprecation-deep-scan-selection";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WATERMARK_KEY = "jira_sync_watermark";
const BATCH_LIMIT = 50;
const REMOVED_TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REVALIDATION_BATCH_SIZE = 25;

// Tier-1 deprecation staleness scan (BRDG-297).
const STALENESS_SCAN_BATCH_SIZE = 25;
// Rolling cursor: the highest lastScannedAt stamped by the most recent batch.
// State lives in app_setting so progress is observable and resumes across
// restarts; the authoritative rotation state is each ticket's own
// lastScannedAt, so this cursor is informational and never gates selection.
const STALENESS_SCAN_CURSOR_KEY = "scheduler:deprecation-staleness-scan:cursor";

// Tier-2 deep-dive runner (BRDG-284). Small batch per tick keeps agent load low
// per the epic's "small batches, never all at once" constraint.
const DEEP_SCAN_BATCH_SIZE = 5;

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
// Task: Tier-1 deprecation staleness scan (every 5 minutes)
// ---------------------------------------------------------------------------

/**
 * Scores a rotating batch of backlog tickets on local staleness heuristics and
 * records when each was last scanned. No AI, no Jira writes: it only fills the
 * local scan-state fields on ticketMetadata. Picks the oldest-scanned tickets
 * first (never-scanned first) and stamps them, so the queue rotates and wraps
 * for continuous re-evaluation.
 *
 * Backlog scope: a ticket is in scope when it has no sprint (sprintName is "" or
 * null, the canonical local backlog marker used by the sync service and tickets
 * API) and has not been removed from Jira. This covers both board backlogs.
 */
export async function runDeprecationStalenessScan(): Promise<TaskResult> {
  const startedAt = new Date().toISOString();

  // Finished tickets (DONE, DEPRECATED, etc.) are excluded because they are
  // irrelevant to deprecation review: the work was already resolved.
  const backlogTickets = await db
    .select({
      jiraKey: ticket.jiraKey,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
      sprintName: ticket.sprintName,
      status: ticket.status,
      lastScannedAt: ticketMetadata.lastScannedAt,
      scanScores: ticketMetadata.scanScores,
      readiness: ticketMetadata.readiness,
      poStatus: ticketMetadata.poStatus,
      qualityScore: ticketMetadata.qualityScore,
      effortScores: ticketMetadata.effortScores,
      poNotes: ticketMetadata.poNotes,
      poPriority: ticketMetadata.poPriority,
      businessValue: ticketMetadata.businessValue,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        eq(ticket.sprintName, ""),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.status, FINISHED_STATUSES as string[]),
      ),
    );

  if (backlogTickets.length === 0) {
    return { scanned: 0, candidates: 0, backlogSize: 0 };
  }

  const batch = selectScanBatch(backlogTickets, STALENESS_SCAN_BATCH_SIZE);
  const now = Date.now();
  const scannedAt = new Date(now).toISOString();

  let candidates = 0;
  for (const row of batch) {
    const result = scoreStaleness(
      {
        jiraUpdatedAt: row.jiraUpdatedAt,
        sprintName: row.sprintName,
        status: row.status,
        hasPoMetadata: !isPoMetadataEmpty(row),
      },
      now,
    );

    if (result.score >= STALENESS_CANDIDATE_THRESHOLD) candidates++;

    // Preserve any future deep-dive topic scores; only overwrite staleness.
    let scores: Record<string, unknown> = {};
    if (row.scanScores) {
      try {
        const parsed = JSON.parse(row.scanScores);
        if (parsed && typeof parsed === "object") scores = parsed;
      } catch {
        // Corrupt JSON is discarded; the scan recomputes from scratch.
      }
    }
    scores.staleness = { score: result.score, rationale: result.rationale };

    const fields = {
      scanScores: JSON.stringify(scores),
      scanOverall: result.score,
      scanRationale: result.rationale,
      lastScannedAt: scannedAt,
    };

    // The ticket may have no metadata row yet; upsert keyed on jiraKey.
    await db
      .insert(ticketMetadata)
      .values({ jiraKey: row.jiraKey, ...fields })
      .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: fields });
  }

  await upsertSetting(STALENESS_SCAN_CURSOR_KEY, scannedAt);

  await logActivity({
    type: "deprecation-scan",
    scope: `${batch.length} tickets`,
    summary: `Staleness scan: ${batch.length} scanned, ${candidates} candidate${candidates === 1 ? "" : "s"} (${backlogTickets.length} in backlog)`,
    startedAt,
  });

  return {
    scanned: batch.length,
    candidates,
    backlogSize: backlogTickets.length,
    cursor: scannedAt,
  };
}

// ---------------------------------------------------------------------------
// Task: Tier-2 deprecation deep scan (every 2 minutes)
// ---------------------------------------------------------------------------

/**
 * Drains the persisted deep-dive queue (BRDG-284) a small batch at a time. Each
 * tick recovers any rows stuck in `running` from a prior crash, claims up to
 * DEEP_SCAN_BATCH_SIZE pending rows, and runs runDeepScan on each. Tickets whose
 * dismiss cooldown (dispositionUntil) is still active are skipped without
 * scoring and marked done, so a snoozed false-positive is not re-evaluated until
 * its cooldown elapses. Because the queue lives in the DB, the runner resumes
 * across restarts. Writes one activity-log summary per non-empty batch.
 */
export async function runDeprecationDeepScan(): Promise<TaskResult> {
  const startedAt = new Date().toISOString();
  const recovered = await requeueStuckRunning();

  const batch = await claimPendingBatch(DEEP_SCAN_BATCH_SIZE);
  if (batch.length === 0) {
    return { scanned: 0, candidates: 0, errors: 0, skipped: 0, recovered };
  }

  const now = Date.now();
  let candidates = 0;
  let revivals = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of batch) {
    try {
      // Respect the dismiss cooldown: a ticket dismissed and still inside its
      // cooldown window is not deep-scanned. We complete the queue row so it
      // leaves the queue rather than looping forever.
      const meta = await db
        .select({
          disposition: ticketMetadata.disposition,
          dispositionUntil: ticketMetadata.dispositionUntil,
        })
        .from(ticketMetadata)
        .where(eq(ticketMetadata.jiraKey, row.jiraKey))
        .get();

      if (
        meta?.disposition === "dismissed" &&
        meta.dispositionUntil &&
        new Date(meta.dispositionUntil).getTime() > now
      ) {
        skipped++;
        await markDone(row.id);
        continue;
      }

      const result = await runDeepScan(row.jiraKey, { now });
      if (result.becameCandidate) {
        candidates++;
        // Notify the PO that a fresh deprecation candidate is ready to review
        // (BRDG-289). skipFollowCheck: backlog candidates are rarely followed,
        // but the PO still wants to know one surfaced. Links into /cleanup.
        createNotification(
          "deprecation-candidate",
          `New deprecation candidate: ${row.jiraKey} (score ${result.scanOverall.toFixed(2)})`,
          {
            category: "scheduler",
            jiraKey: row.jiraKey,
            linkUrl: "/cleanup",
            skipFollowCheck: true,
          },
        );
      }
      // Revival is the opposite conclusion (BRDG-298): a low-backlog ticket worth
      // pulling up because it fits recent/planned work. Distinct notification so
      // the PO can act on it separately from deprecation candidates. A ticket is
      // a revival candidate INSTEAD OF a deprecation candidate (runDeepScan
      // suppresses the deprecation promotion when revival wins), so the two
      // branches do not double-fire for the same ticket.
      if (result.becameRevivalCandidate) {
        revivals++;
        createNotification(
          "revival-candidate",
          `Backlog ticket worth pulling up: ${row.jiraKey} (revival ${result.revivalScore.toFixed(2)})`,
          {
            category: "scheduler",
            jiraKey: row.jiraKey,
            linkUrl: "/cleanup",
            skipFollowCheck: true,
          },
        );
      }
      await markDone(row.id);
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("scheduled-tasks", `Deep scan failed for ${row.jiraKey}:`, message);
      await markError(row.id, message);
    }
  }

  const processed = batch.length;
  await logActivity({
    type: "deprecation-scan",
    scope: `${processed} tickets`,
    summary: `Deep scan: ${processed} processed, ${candidates} new candidate${candidates === 1 ? "" : "s"}${revivals > 0 ? `, ${revivals} revival${revivals === 1 ? "" : "s"}` : ""}${skipped > 0 ? `, ${skipped} skipped (cooldown)` : ""}${errors > 0 ? `, ${errors} error${errors === 1 ? "" : "s"}` : ""}`,
    status: errors > 0 ? "failed" : "success",
    startedAt,
  });

  return { scanned: processed, candidates, revivals, errors, skipped, recovered };
}

// ---------------------------------------------------------------------------
// Task: Auto background deep-scan enqueue (every 10 minutes) (BRDG-290)
// ---------------------------------------------------------------------------

/**
 * Returns the UTC calendar date as YYYY-MM-DD, used to key the daily budget
 * counter in app_setting. UTC date is stable across timezones so the budget
 * resets consistently at midnight UTC rather than varying by server locale.
 */
export function utcDateKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Auto-enqueues tickets for deep scanning up to the remaining daily budget.
 *
 * When auto mode is disabled the task does nothing. When enabled it:
 *   1. Reads the enabled flag and daily-count setting from app_setting.
 *   2. Reads today's enqueue counter to determine remaining budget.
 *   3. Loads the eligible backlog (no sprint, not removed) and applies
 *      worst-staleness ordering (highest Tier-1 score first, unscored last)
 *      after excluding tickets still inside their dismiss cooldown.
 *   4. Enqueues up to (dailyCount - usedToday) tickets idempotently.
 *   5. Increments the day counter and logs the run.
 *
 * WHY worst-staleness as default: it surfaces the most actionable candidates
 * first — the same tickets the PO would manually pick via the top-10 button —
 * which makes the auto mode immediately useful without extra configuration.
 *
 * The budget counter key is `deprecation-auto-scan:budget:<YYYY-MM-DD>`. A
 * new key is created each day and old keys are never cleaned up (they are
 * small text rows and accumulate at one per day; negligible). Resets happen
 * naturally because the date suffix rolls over.
 */
export async function runAutoEnqueue(): Promise<TaskResult> {
  // Read enabled flag; bail out fast when off to avoid unnecessary DB reads.
  const enabledRow = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AUTO_SCAN_ENABLED_KEY))
    .get();
  const enabled = enabledRow?.value === "true";

  if (!enabled) {
    return { skipped: true, reason: "auto scan disabled" };
  }

  // Read daily count setting.
  const countRow = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AUTO_SCAN_DAILY_COUNT_KEY))
    .get();
  const dailyCount =
    countRow?.value !== undefined
      ? Math.max(1, parseInt(countRow.value, 10) || AUTO_SCAN_DEFAULT_DAILY_COUNT)
      : AUTO_SCAN_DEFAULT_DAILY_COUNT;

  // Read today's budget counter.
  const todayKey = `${AUTO_SCAN_BUDGET_KEY_PREFIX}:${utcDateKey()}`;
  const budgetRow = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, todayKey))
    .get();
  const usedToday = budgetRow?.value !== undefined ? parseInt(budgetRow.value, 10) || 0 : 0;

  const remaining = dailyCount - usedToday;
  if (remaining <= 0) {
    return { skipped: true, reason: "daily budget exhausted", usedToday, dailyCount };
  }

  // Load eligible backlog (same definition as the manual enqueue API).
  // Finished tickets are excluded for the same reason as the Tier-1 scan:
  // resolved work is not a deprecation candidate.
  const rows = await db
    .select({
      jiraKey: ticket.jiraKey,
      scanOverall: ticketMetadata.scanOverall,
      lastScannedAt: ticketMetadata.lastScannedAt,
      disposition: ticketMetadata.disposition,
      dispositionUntil: ticketMetadata.dispositionUntil,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        eq(ticket.sprintName, ""),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.status, FINISHED_STATUSES as string[]),
      ),
    );

  const eligible: SelectableTicket[] = rows.map((r) => ({
    jiraKey: r.jiraKey,
    scanOverall: r.scanOverall ?? null,
    lastScannedAt: r.lastScannedAt ?? null,
    disposition: r.disposition ?? null,
    dispositionUntil: r.dispositionUntil ?? null,
  }));

  const keys = selectDeepScanKeys("worst-staleness", eligible, remaining);
  if (keys.length === 0) {
    return { enqueued: 0, usedToday, dailyCount };
  }

  const startedAt = new Date().toISOString();
  const enqueuedKeys = await enqueueDeepScan(keys, "auto");
  const newUsedToday = usedToday + enqueuedKeys.length;

  // Persist updated budget counter for today.
  await db
    .insert(appSetting)
    .values({ key: todayKey, value: String(newUsedToday) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(newUsedToday) } });

  if (enqueuedKeys.length > 0) {
    await logActivity({
      type: "deprecation-scan",
      scope: `${enqueuedKeys.length} tickets`,
      summary: `Auto deep-scan: enqueued ${enqueuedKeys.length} ticket${enqueuedKeys.length === 1 ? "" : "s"} (${newUsedToday}/${dailyCount} today)`,
      startedAt,
    });
  }

  return { enqueued: enqueuedKeys.length, usedToday: newUsedToday, dailyCount };
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
    "deprecation-staleness-scan",
    "Backlog Staleness Scan",
    "Tier-1 of the Backlog Deprecation Review: scores a rotating batch of 25 backlog tickets on local staleness heuristics (age, never-in-sprint, backlog status, empty PO metadata) and records lastScannedAt. No AI and no Jira writes; oldest-scanned tickets first, looping for continuous re-evaluation.",
    5 * 60 * 1000,
    runDeprecationStalenessScan,
  );

  defineTask(
    "deprecation-deep-scan",
    "Backlog Deep Scan",
    "Tier-2 of the Backlog Deprecation Review: drains the persisted deep-dive queue 5 tickets per tick, running every registered topic scorer, recomputing the combined score, and promoting tickets to candidate on threshold. Respects the dismiss cooldown and resumes across restarts.",
    2 * 60 * 1000,
    runDeprecationDeepScan,
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

  defineTask(
    "deprecation-auto-enqueue",
    "Auto Background Deep Scan",
    "When enabled, automatically queues up to N tickets per day into the Tier-2 deep-dive queue using worst-staleness ordering. Respects the dismiss cooldown and the per-day budget. Configure on the Cleanup page.",
    10 * 60 * 1000,
    runAutoEnqueue,
  );
}
