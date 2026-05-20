import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketStatusChange, ticketScopeChange } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, SPRINT_FIELD } from "@/lib/jira-client";
import { normalizeStatus } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * POST /api/burnup/seed?sprintId=X
 *
 * Backfills status change AND scope change history from Jira changelog
 * for all tickets that were ever in the sprint.
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

    // Resolve sprint name and start date
    const sprintRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });
    let sprintName: string | null = null;
    let sprintStartDate: string | null = null;
    if (sprintRow) {
      const sprints = JSON.parse(sprintRow.value) as Array<{ id: number; name: string; startDate: string | null }>;
      const s = sprints.find((sp) => String(sp.id) === sprintId);
      if (s) {
        sprintName = s.name;
        sprintStartDate = s.startDate ?? null;
      }
    }

    // Fallback: fetch sprint dates from Jira
    if (!sprintStartDate && jiraClient.isLive) {
      try {
        const jiraSprints = await jiraClient.getSprints();
        const js = jiraSprints.find((s) => String(s.id) === sprintId);
        if (js) {
          sprintStartDate = js.startDate ?? null;
          if (!sprintName) sprintName = js.name;
        }
      } catch { /* ignore */ }
    }

    // Find all tickets: current local DB + Jira live sprint + JQL historical
    const ticketKeys = new Set<string>();
    const currentTicketKeys = new Set<string>();
    const jiraCurrentKeys = new Set<string>();

    // Current tickets from local DB
    const localTickets = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.sprintName, sprintId))
      .all();
    for (const t of localTickets) {
      ticketKeys.add(t.jiraKey);
      currentTicketKeys.add(t.jiraKey);
    }

    // Fetch current sprint issues from Jira to detect removals
    if (jiraClient.isLive) {
      try {
        const jiraIssues = await jiraClient.getSprintIssues(parseInt(sprintId, 10));
        for (const issue of jiraIssues) {
          jiraCurrentKeys.add(issue.key);
          ticketKeys.add(issue.key);
          currentTicketKeys.add(issue.key);
        }
      } catch { /* Jira unavailable */ }
    }

    // Historical tickets via JQL "sprint was {name}"
    if (jiraClient.isLive && sprintName) {
      try {
        const jqlResults = await jiraClient.searchIssues(
          `sprint was "${sprintName}"`,
          ["summary", SPRINT_FIELD],
          100,
        );
        for (const issue of jqlResults) ticketKeys.add(issue.key);
      } catch { /* JQL fallback */ }
    }

    if (ticketKeys.size === 0) {
      await upsertSetting(`burnup_seeded_${sprintId}`, new Date().toISOString());
      return NextResponse.json({ seeded: true, changeCount: 0, message: "No tickets found" });
    }

    // Load SP/BV for all known tickets
    const allKeys = Array.from(ticketKeys);
    const ticketData = await db
      .select({
        jiraKey: ticket.jiraKey,
        storyPoints: ticket.storyPoints,
        bv: ticketMetadata.businessValue,
      })
      .from(ticket)
      .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
      .where(inArray(ticket.jiraKey, allKeys))
      .all();
    const valueMap = new Map(ticketData.map((t) => [t.jiraKey, {
      sp: t.storyPoints ?? 0,
      bv: (t.bv != null && t.bv >= 1) ? t.bv : 0,
    }]));

    // Existing changes to avoid duplicates
    const existingStatusChanges = await db
      .select({ ticketKey: ticketStatusChange.ticketKey, changedAt: ticketStatusChange.changedAt })
      .from(ticketStatusChange)
      .where(eq(ticketStatusChange.sprintName, sprintId))
      .all();
    const existingStatusSet = new Set(existingStatusChanges.map((c) => `${c.ticketKey}:${c.changedAt}`));

    const existingScopeChanges = await db
      .select({ ticketKey: ticketScopeChange.ticketKey, changedAt: ticketScopeChange.changedAt, action: ticketScopeChange.action })
      .from(ticketScopeChange)
      .where(eq(ticketScopeChange.sprintName, sprintId))
      .all();
    const existingScopeSet = new Set(existingScopeChanges.map((c) => `${c.ticketKey}:${c.changedAt}`));

    // Track which tickets have an explicit "added" event from changelog
    const ticketsWithAddEvent = new Set(
      existingScopeChanges.filter((c) => c.action === "added").map((c) => c.ticketKey),
    );

    let changeCount = 0;

    for (const key of allKeys) {
      try {
        const { statusChanges, sprintChanges } = await jiraClient.getBurnupChangelog(key);
        const vals = valueMap.get(key) ?? { sp: 0, bv: 0 };

        // Status changes
        const statusRows = statusChanges
          .map((change) => ({
            id: `sc-${key}-${new Date(change.changedAt).getTime()}`,
            ticketKey: key,
            fromStatus: change.fromStatus ? normalizeStatus(change.fromStatus) : null,
            toStatus: normalizeStatus(change.toStatus),
            changedAt: change.changedAt,
            sprintName: sprintId,
          }))
          .filter((row) => !existingStatusSet.has(`${row.ticketKey}:${row.changedAt}`));

        // Sprint field changes: detect when ticket joins/leaves this sprint
        const scopeRows: Array<{
          id: string; ticketKey: string; sprintName: string;
          action: "added" | "removed"; storyPoints: number; businessValue: number;
          changedAt: string;
        }> = [];

        for (const sc of sprintChanges) {
          const fromNames = sc.fromSprints ?? "";
          const toNames = sc.toSprints ?? "";
          const wasInSprint = sprintName ? fromNames.includes(sprintName) : false;
          const isInSprint = sprintName ? toNames.includes(sprintName) : false;

          if (!wasInSprint && isInSprint) {
            ticketsWithAddEvent.add(key);
            const scopeKey = `${key}:${sc.changedAt}`;
            if (!existingScopeSet.has(scopeKey)) {
              scopeRows.push({
                id: `scope-${key}-add-${new Date(sc.changedAt).getTime()}`,
                ticketKey: key,
                sprintName: sprintId,
                action: "added",
                storyPoints: vals.sp,
                businessValue: vals.bv,
                changedAt: sc.changedAt,
              });
            }
          } else if (wasInSprint && !isInSprint) {
            const scopeKey = `${key}:${sc.changedAt}`;
            if (!existingScopeSet.has(scopeKey)) {
              scopeRows.push({
                id: `scope-${key}-rm-${new Date(sc.changedAt).getTime()}`,
                ticketKey: key,
                sprintName: sprintId,
                action: "removed",
                storyPoints: vals.sp,
                businessValue: vals.bv,
                changedAt: sc.changedAt,
              });
            }
          }
        }

        if (statusRows.length > 0 || scopeRows.length > 0) {
          db.transaction((tx) => {
            for (const row of statusRows) {
              tx.insert(ticketStatusChange).values(row).onConflictDoNothing().run();
            }
            for (const row of scopeRows) {
              tx.insert(ticketScopeChange).values(row).onConflictDoNothing().run();
            }
          });
          changeCount += statusRows.length + scopeRows.length;
        }
      } catch {
        // Individual ticket failures should not stop the batch
      }
    }

    // Synthesize "added" events at sprint start for tickets that are currently
    // in the sprint but have no explicit "added" changelog entry.
    // These are tickets that were part of the sprint from the beginning.
    if (sprintStartDate) {
      const syntheticRows: Array<{
        id: string; ticketKey: string; sprintName: string;
        action: "added"; storyPoints: number; businessValue: number;
        changedAt: string;
      }> = [];

      for (const key of currentTicketKeys) {
        if (ticketsWithAddEvent.has(key)) continue;
        const vals = valueMap.get(key) ?? { sp: 0, bv: 0 };
        syntheticRows.push({
          id: `scope-${key}-add-synthetic`,
          ticketKey: key,
          sprintName: sprintId,
          action: "added",
          storyPoints: vals.sp,
          businessValue: vals.bv,
          changedAt: sprintStartDate,
        });
      }

      if (syntheticRows.length > 0) {
        db.transaction((tx) => {
          for (const row of syntheticRows) {
            tx.insert(ticketScopeChange).values(row).onConflictDoNothing().run();
          }
        });
        changeCount += syntheticRows.length;
      }
    }

    // Detect tickets removed from the sprint: they have an "added" event
    // but are NOT in Jira's current sprint contents.
    if (jiraCurrentKeys.size > 0) {
      const removedRows: Array<{
        id: string; ticketKey: string; sprintName: string;
        action: "removed"; storyPoints: number; businessValue: number;
        changedAt: string;
      }> = [];

      for (const key of ticketsWithAddEvent) {
        if (jiraCurrentKeys.has(key)) continue;
        // This ticket was added but is no longer in the sprint
        const vals = valueMap.get(key) ?? { sp: 0, bv: 0 };
        // Find the latest Sprint changelog entry for this ticket to get removal time
        // If not available, use current timestamp
        const existingRemoval = await db.query.ticketScopeChange.findFirst({
          where: (r, { eq: eqFn, and: andFn }) =>
            andFn(eqFn(r.ticketKey, key), eqFn(r.sprintName, sprintId), eqFn(r.action, "removed")),
        });
        if (!existingRemoval) {
          removedRows.push({
            id: `scope-${key}-rm-detected-${Date.now()}`,
            ticketKey: key,
            sprintName: sprintId,
            action: "removed",
            storyPoints: vals.sp,
            businessValue: vals.bv,
            changedAt: new Date().toISOString(),
          });
        }
      }

      if (removedRows.length > 0) {
        db.transaction((tx) => {
          for (const row of removedRows) {
            tx.insert(ticketScopeChange).values(row).onConflictDoNothing().run();
          }
        });
        changeCount += removedRows.length;
      }
    }

    // Mark as seeded
    await upsertSetting(`burnup_seeded_${sprintId}`, new Date().toISOString());

    // Invalidate burnup cache
    cache.invalidate(`/api/burnup?sprintId=${sprintId}`);

    return NextResponse.json({ seeded: true, changeCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("burnup-seed", "Failed to seed burnup data:", message);
    return NextResponse.json({ error: "Failed to seed burnup data" }, { status: 500 });
  }
}
