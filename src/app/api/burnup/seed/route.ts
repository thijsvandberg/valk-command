import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketStatusChange } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { normalizeStatus } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";

/**
 * POST /api/burnup/seed?sprintId=X
 *
 * Backfills status change history from Jira changelog for all tickets in a sprint.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  if (!sprintId) {
    return NextResponse.json({ error: "sprintId is required" }, { status: 400 });
  }

  try {
    // Check if already seeded
    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, `burnup_seeded_${sprintId}`),
    });
    if (existing) {
      return NextResponse.json({ seeded: true, changeCount: 0, message: "Already seeded" });
    }

    // Load all tickets for this sprint
    const tickets = await db
      .select({ jiraKey: ticket.jiraKey, jiraCreatedAt: ticket.jiraCreatedAt, status: ticket.status })
      .from(ticket)
      .where(eq(ticket.sprintName, sprintId))
      .all();

    if (tickets.length === 0) {
      return NextResponse.json({ seeded: true, changeCount: 0, message: "No tickets in sprint" });
    }

    // Load existing status changes to avoid duplicates
    const existingChanges = await db
      .select({ ticketKey: ticketStatusChange.ticketKey, changedAt: ticketStatusChange.changedAt })
      .from(ticketStatusChange)
      .where(eq(ticketStatusChange.sprintName, sprintId))
      .all();
    const existingSet = new Set(existingChanges.map((c) => `${c.ticketKey}:${c.changedAt}`));

    let changeCount = 0;

    for (const t of tickets) {
      try {
        const changelog = await jiraClient.getStatusChangelog(t.jiraKey, request.signal);

        const rows = changelog
          .map((change) => ({
            id: `sc-${t.jiraKey}-${new Date(change.changedAt).getTime()}`,
            ticketKey: t.jiraKey,
            fromStatus: change.fromStatus ? normalizeStatus(change.fromStatus) : null,
            toStatus: normalizeStatus(change.toStatus),
            changedAt: change.changedAt,
            sprintName: sprintId,
          }))
          .filter((row) => !existingSet.has(`${row.ticketKey}:${row.changedAt}`));

        if (rows.length > 0) {
          db.transaction((tx) => {
            for (const row of rows) {
              tx.insert(ticketStatusChange).values(row).onConflictDoNothing().run();
            }
          });
          changeCount += rows.length;
        }
      } catch {
        // Individual ticket failures should not stop the batch
      }
    }

    // Mark as seeded
    await upsertSetting(`burnup_seeded_${sprintId}`, new Date().toISOString());

    // Invalidate burnup cache
    cache.invalidate(`/api/burnup?sprintId=${sprintId}`);

    return NextResponse.json({ seeded: true, changeCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
