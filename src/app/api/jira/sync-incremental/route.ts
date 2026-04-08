import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, appSetting, activityLog } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { invalidateSearchCache } from "@/lib/search-index-cache";
import { upsertIssue } from "@/lib/upsert-issue";

const WATERMARK_KEY = "jira_sync_watermark";
const COOLDOWN_KEY = "jira_sync_last_run";
const BATCH_LIMIT = 50;
const COOLDOWN_MS = 120_000;

/**
 * POST /api/jira/sync-incremental
 *
 * Watermark-based incremental sync with server-side cooldown.
 * Rejects requests within 120s of the last run to prevent rapid re-fires
 * regardless of client behavior.
 */
export async function POST() {
  if (!jiraClient.isLive) {
    return NextResponse.json({ ok: false, error: "Jira not configured" }, { status: 503 });
  }

  // Server-side cooldown: reject if last run was too recent
  const lastRunRow = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, COOLDOWN_KEY),
  });
  if (lastRunRow) {
    const elapsed = Date.now() - new Date(lastRunRow.value).getTime();
    if (elapsed < COOLDOWN_MS) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        cooldownRemaining: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
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
    }, { status: 200 });
  }

  // Mark this run timestamp before doing any work
  await upsertSetting(COOLDOWN_KEY, new Date().toISOString());

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
      await upsertSetting(WATERMARK_KEY, latestTimestamp);
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
        await upsertSetting(WATERMARK_KEY, issue.fields.updated);
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

async function upsertSetting(key: string, value: string) {
  const existing = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, key),
  });
  if (existing) {
    await db.update(appSetting).set({ value }).where(eq(appSetting.key, key));
  } else {
    await db.insert(appSetting).values({ key, value });
  }
}
