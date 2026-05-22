import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting, activityLog } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { jiraClient, extractSprint } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/lib/api-validation";
import { refreshSprintMetadata } from "@/lib/refresh-sprint-metadata";

const WATERMARK_KEY = "jira_sync_watermark";
const COOLDOWN_KEY = "jira_sync_last_run";
const LAST_RESULT_KEY = "jira_sync_last_result";
const BATCH_LIMIT = 50;
const COOLDOWN_MS = 120_000;

// ---------------------------------------------------------------------------
// POST /api/jira/sync-incremental
// ---------------------------------------------------------------------------

/**
 * Watermark-based incremental sync with server-side cooldown.
 * Rejects requests within 120s of the last run to prevent rapid re-fires
 * regardless of client behavior.
 *
 * Also refreshes sprint metadata (state, goal, dates) on a separate
 * 5-minute cooldown, independent of the ticket sync cooldown.
 */
export async function POST() {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  if (!jiraClient.isLive) {
    return NextResponse.json({ ok: false, error: "Jira not configured" }, { status: 503 });
  }

  // Sprint metadata refresh runs on its own 5-minute cooldown,
  // independent of the ticket sync cooldown below.
  let sprintMetaRefreshed = false;
  try {
    sprintMetaRefreshed = await refreshSprintMetadata();
  } catch (err) {
    logger.warn("jira", "Sprint metadata refresh failed (non-blocking)",
      err instanceof Error ? err.message : String(err));
  }

  // Server-side cooldown: reject if last run was too recent
  const lastRunRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, COOLDOWN_KEY),
  });
  if (lastRunRow) {
    const elapsed = Date.now() - new Date(lastRunRow.value).getTime();
    if (elapsed < COOLDOWN_MS) {
      const lastResultRow = await db.query.appSetting.findFirst({
        where: (row, { eq: eqFn }) => eqFn(row.key, LAST_RESULT_KEY),
      });
      const lastResult = safeJsonParse<Record<string, unknown>>(lastResultRow?.value, {}, "sync-incremental");
      return NextResponse.json({
        ok: true,
        skipped: true,
        count: lastResult.count ?? 0,
        remaining: lastResult.remaining ?? 0,
        cooldownRemaining: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
        sprintMetaRefreshed,
      });
    }
  }

  const watermarkRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, WATERMARK_KEY),
  });

  if (!watermarkRow) {
    return NextResponse.json({
      ok: false,
      needsFullSync: true,
      error: "No watermark found. Run a full sprint sync first.",
      sprintMetaRefreshed,
    }, { status: 200 });
  }

  // Mark this run timestamp before doing any work
  await upsertSetting(COOLDOWN_KEY, new Date().toISOString());

  const syncId = `inc-sync-${crypto.randomUUID()}`;
  const controller = registerSync(syncId);
  const watermark = watermarkRow.value;

  try {
    const changed = await jiraClient.getUpdatedSince(watermark, controller.signal);

    if (changed.length === 0) {
      return NextResponse.json({ ok: true, count: 0, remaining: 0, watermark, sprintMetaRefreshed });
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
      return NextResponse.json({ ok: true, count: 0, remaining: 0, watermark: latestTimestamp, sprintMetaRefreshed });
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
    }

    // Advance watermark once after processing the entire batch (issues are
    // sorted by updated asc, so the last entry is the most recent).
    const lastUpdated = issues[issues.length - 1]?.fields.updated;
    if (lastUpdated) {
      await upsertSetting(WATERMARK_KEY, lastUpdated);
    }

    invalidateSearchCache();
    cache.invalidate("/api/tickets");

    await upsertSetting(LAST_RESULT_KEY, JSON.stringify({ count: results.length, remaining }));

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

    return NextResponse.json({
      ok: true,
      count: results.length,
      checked: changed.length,
      remaining,
      watermark: issues[issues.length - 1]?.fields.updated ?? watermark,
      tickets: results.map((r) => r.key),
      sprintMetaRefreshed,
    });
  } catch (err) {
    // Clear cooldown so the next poll isn't blocked after a failure
    await upsertSetting(COOLDOWN_KEY, new Date(0).toISOString());

    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Incremental sync failed", message);
    return NextResponse.json({ ok: false, error: "Incremental sync failed" }, { status: 500 });
  } finally {
    unregisterSync(syncId);
  }
}
