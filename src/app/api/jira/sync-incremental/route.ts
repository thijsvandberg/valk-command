import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue } from "@/lib/upsert-issue";

const WATERMARK_KEY = "jira_sync_watermark";
const BATCH_LIMIT = 50;

/**
 * POST /api/jira/sync-incremental
 *
 * Watermark-based incremental sync. Lightweight background operation that
 * does NOT write to the activity log (status is tracked client-side via
 * the useIncrementalSync hook and shown in the SyncIndicator banner).
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

  try {
    const changed = await jiraClient.getUpdatedSince(watermark);

    if (changed.length === 0) {
      return NextResponse.json({ ok: true, count: 0, remaining: 0, watermark });
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
      await setWatermark(latestTimestamp);
      return NextResponse.json({ ok: true, count: 0, remaining: 0, watermark: latestTimestamp });
    }

    const totalStale = staleItems.length;
    const batch = staleItems.slice(0, BATCH_LIMIT);
    const remaining = totalStale - batch.length;

    const staleKeys = batch.map((item) => item.key);
    const issues = await jiraClient.getIssuesByKeys(staleKeys);

    const existingTickets = await db
      .select({ jiraKey: ticket.jiraKey, sprintName: ticket.sprintName })
      .from(ticket)
      .where(inArray(ticket.jiraKey, staleKeys));
    const sprintMap = new Map(existingTickets.map((t) => [t.jiraKey, t.sprintName]));

    issues.sort((a, b) => (a.fields.updated ?? "").localeCompare(b.fields.updated ?? ""));

    const results = [];
    for (const issue of issues) {
      const existingSprintName = sprintMap.get(issue.key) || "";
      const info = await upsertIssue(issue, existingSprintName);
      results.push(info);

      if (issue.fields.updated) {
        await setWatermark(issue.fields.updated);
      }
    }

    invalidateSearchCache();

    const remainingSuffix = remaining > 0 ? `, ${remaining} remaining` : "";
    await db.insert(activityLog).values({
      id: `inc-sync-${crypto.randomUUID()}`,
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
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
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
