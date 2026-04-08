import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, activityLog, appSetting } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue } from "@/lib/upsert-issue";

const WATERMARK_KEY = "jira_sync_watermark";
const BATCH_LIMIT = 50;

/**
 * POST /api/jira/sync-incremental
 *
 * Watermark-based incremental sync. Fetches all tickets updated since the
 * last known watermark, upserts them, and advances the watermark progressively
 * per processed ticket (sorted by updated ASC). If no watermark exists, signals
 * the client that a full sync is needed first.
 */
export async function POST() {
  if (!jiraClient.isLive) {
    return NextResponse.json({ ok: false, error: "Jira not configured" }, { status: 503 });
  }

  const watermarkRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, WATERMARK_KEY),
  });

  if (!watermarkRow) {
    return NextResponse.json({
      ok: false,
      needsFullSync: true,
      error: "No watermark found. Run a full sprint sync first.",
    }, { status: 200 });
  }

  const watermark = watermarkRow.value;
  const logId = `inc-sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(activityLog).values({
    id: logId,
    type: "incremental-sync",
    scope: `since ${watermark}`,
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  try {
    // Pass 1: lightweight query for keys + updated timestamps
    const changed = await jiraClient.getUpdatedSince(watermark, controller.signal);

    if (changed.length === 0) {
      const durationMs = Date.now() - new Date(startedAt).getTime();
      await db.update(activityLog).set({
        status: "success",
        summary: "No changes since last sync",
        durationMs,
        completedAt: new Date().toISOString(),
      }).where(eq(activityLog.id, logId));

      return NextResponse.json({ ok: true, count: 0, watermark });
    }

    // Compare with local timestamps to skip tickets already up to date
    const changedKeys = changed.map((c) => c.key);
    const localTickets = await db
      .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
      .from(ticket)
      .where(inArray(ticket.jiraKey, changedKeys));

    const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));
    const staleItems = changed.filter((item) => localMap.get(item.key) !== item.updated);

    if (staleItems.length === 0) {
      // Timestamps matched but Jira reported them as updated (metadata-only changes).
      // Advance watermark to the latest timestamp we saw.
      const latestTimestamp = changed[changed.length - 1].updated;
      await setWatermark(latestTimestamp);

      const durationMs = Date.now() - new Date(startedAt).getTime();
      await db.update(activityLog).set({
        status: "success",
        summary: `${changed.length} checked, all up to date`,
        durationMs,
        completedAt: new Date().toISOString(),
      }).where(eq(activityLog.id, logId));

      return NextResponse.json({ ok: true, count: 0, watermark: latestTimestamp });
    }

    // Cap to BATCH_LIMIT per run; remaining items will be picked up next cycle
    const totalStale = staleItems.length;
    const batch = staleItems.slice(0, BATCH_LIMIT);
    const remaining = totalStale - batch.length;

    // Pass 2: fetch full data for stale tickets
    const staleKeys = batch.map((item) => item.key);
    const issues = await jiraClient.getIssuesByKeys(staleKeys, controller.signal);

    // Build a map for sprint resolution
    const existingTickets = await db
      .select({ jiraKey: ticket.jiraKey, sprintName: ticket.sprintName })
      .from(ticket)
      .where(inArray(ticket.jiraKey, staleKeys));
    const sprintMap = new Map(existingTickets.map((t) => [t.jiraKey, t.sprintName]));

    // Sort issues by updated ASC to match the watermark progression order
    issues.sort((a, b) => (a.fields.updated ?? "").localeCompare(b.fields.updated ?? ""));

    const results = [];
    for (const issue of issues) {
      const existingSprintName = sprintMap.get(issue.key) || "";
      const info = await upsertIssue(issue, existingSprintName, controller.signal);
      results.push(info);

      // Advance watermark after each successful upsert
      if (issue.fields.updated) {
        await setWatermark(issue.fields.updated);
      }
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    const remainingSuffix = remaining > 0 ? `, ${remaining} remaining` : "";
    await db.update(activityLog).set({
      status: "success",
      summary: `${results.length} ticket${results.length === 1 ? "" : "s"} synced${remainingSuffix}`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    invalidateSearchCache();

    return NextResponse.json({
      ok: true,
      count: results.length,
      checked: changed.length,
      remaining,
      watermark: issues[issues.length - 1]?.fields.updated ?? watermark,
      tickets: results.map((r) => r.key),
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

async function setWatermark(value: string) {
  const existing = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, WATERMARK_KEY),
  });
  if (existing) {
    await db.update(appSetting).set({ value }).where(eq(appSetting.key, WATERMARK_KEY));
  } else {
    await db.insert(appSetting).values({ key: WATERMARK_KEY, value });
  }
}
