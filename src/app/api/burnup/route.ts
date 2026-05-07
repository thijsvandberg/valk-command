import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketStatusChange, ticketScopeChange } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeStatus } from "@/lib/upsert-issue";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

export interface BurnupDataPoint {
  date: string;
  spDone: number;
  spPct: number;
  bvDone: number;
  bvPct: number;
  scopeSp: number;
  scopeBv: number;
}

export interface BurnupResponse {
  seeded: boolean;
  sprintStart: string;
  sprintEnd: string;
  totalSp: number;
  totalBv: number;
  points: BurnupDataPoint[];
}

/**
 * GET /api/burnup?sprintId=X
 *
 * Computes burnup chart data from status change and scope change history.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  if (!sprintId) {
    return NextResponse.json({ error: "sprintId is required" }, { status: 400 });
  }

  const cacheKey = `/api/burnup?sprintId=${sprintId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  try {
    // Get sprint dates from cached sprint list
    const sprintRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });

    let sprintStart: string | null = null;
    let sprintEnd: string | null = null;

    if (sprintRow) {
      const sprints = JSON.parse(sprintRow.value) as Array<{
        id: number; startDate: string | null; endDate: string | null;
      }>;
      const sprint = sprints.find((s) => String(s.id) === sprintId);
      if (sprint) {
        sprintStart = sprint.startDate ?? null;
        sprintEnd = sprint.endDate ?? null;
      }
    }

    // Fallback: fetch directly from Jira if local cache has no dates
    if (!sprintStart || !sprintEnd) {
      try {
        const jiraSprints = await jiraClient.getSprints();
        const jiraSprint = jiraSprints.find((s) => String(s.id) === sprintId);
        if (jiraSprint) {
          sprintStart = jiraSprint.startDate ?? null;
          sprintEnd = jiraSprint.endDate ?? null;
        }
      } catch {
        // Jira unavailable
      }
    }

    if (!sprintStart || !sprintEnd) {
      return NextResponse.json({ error: "Sprint dates not found" }, { status: 404 });
    }

    // Load current tickets for this sprint with their metadata
    const tickets = await db
      .select({
        jiraKey: ticket.jiraKey,
        storyPoints: ticket.storyPoints,
        status: ticket.status,
        bv: ticketMetadata.businessValue,
      })
      .from(ticket)
      .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
      .where(eq(ticket.sprintName, sprintId))
      .all();

    // Build value lookup: SP and BV per ticket (current values)
    const ticketValues = new Map<string, { sp: number; bv: number }>();
    let currentTotalSp = 0;
    let currentTotalBv = 0;

    for (const t of tickets) {
      const sp = t.storyPoints ?? 0;
      const bv = (t.bv != null && t.bv >= 1 && t.status !== "DEPRECATED") ? t.bv : 0;
      ticketValues.set(t.jiraKey, { sp, bv });
      if (t.status !== "DEPRECATED") currentTotalSp += sp;
      currentTotalBv += bv;
    }

    // Check if we have status change data
    const seededRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, `burnup_seeded_${sprintId}`),
    });
    const statusRows = await db
      .select()
      .from(ticketStatusChange)
      .where(eq(ticketStatusChange.sprintName, sprintId))
      .all();
    const scopeRows = await db
      .select()
      .from(ticketScopeChange)
      .where(eq(ticketScopeChange.sprintName, sprintId))
      .all();

    const seeded = !!seededRow || statusRows.length > 0;

    if (!seeded) {
      const result: BurnupResponse = {
        seeded: false,
        sprintStart,
        sprintEnd,
        totalSp: currentTotalSp,
        totalBv: currentTotalBv,
        points: [],
      };
      return NextResponse.json(result);
    }

    // Build a unified timeline of events
    type TimelineEvent =
      | { type: "status"; ticketKey: string; toStatus: string; changedAt: string }
      | { type: "scope"; ticketKey: string; action: "added" | "removed"; sp: number; bv: number; changedAt: string };

    const events: TimelineEvent[] = [];

    for (const row of statusRows) {
      events.push({ type: "status", ticketKey: row.ticketKey, toStatus: row.toStatus, changedAt: row.changedAt });
    }
    for (const row of scopeRows) {
      events.push({
        type: "scope",
        ticketKey: row.ticketKey,
        action: row.action as "added" | "removed",
        sp: row.storyPoints ?? 0,
        bv: row.businessValue ?? 0,
        changedAt: row.changedAt,
      });
    }

    events.sort((a, b) => a.changedAt.localeCompare(b.changedAt));

    // Walk through events chronologically
    const doneSet = new Set<string>();
    let runningSpDone = 0;
    let runningBvDone = 0;
    let runningScopeSp = 0;
    let runningScopeBv = 0;

    // Compute initial scope from scope events: tickets added before or at sprint start
    // If no scope events exist, assume all current tickets were there from the start
    const hasScopeData = scopeRows.length > 0;
    if (!hasScopeData) {
      runningScopeSp = currentTotalSp;
      runningScopeBv = currentTotalBv;
    }

    // Group events by day, tracking running state
    const startDay = sprintStart.slice(0, 10);
    const dayMap = new Map<string, { spDone: number; bvDone: number; scopeSp: number; scopeBv: number }>();
    dayMap.set(startDay, { spDone: 0, bvDone: 0, scopeSp: runningScopeSp, scopeBv: runningScopeBv });

    for (const event of events) {
      const day = event.changedAt.slice(0, 10);

      if (event.type === "scope") {
        if (event.action === "added") {
          runningScopeSp += event.sp;
          runningScopeBv += event.bv;
        } else {
          runningScopeSp -= event.sp;
          runningScopeBv -= event.bv;
        }
        dayMap.set(day, {
          spDone: runningSpDone,
          bvDone: runningBvDone,
          scopeSp: runningScopeSp,
          scopeBv: runningScopeBv,
        });
      } else {
        const normalized = normalizeStatus(event.toStatus);
        const vals = ticketValues.get(event.ticketKey);
        if (!vals) continue;

        if (normalized === "DONE" && !doneSet.has(event.ticketKey)) {
          doneSet.add(event.ticketKey);
          runningSpDone += vals.sp;
          runningBvDone += vals.bv;
        } else if (normalized !== "DONE" && doneSet.has(event.ticketKey)) {
          doneSet.delete(event.ticketKey);
          runningSpDone -= vals.sp;
          runningBvDone -= vals.bv;
        } else {
          continue;
        }

        dayMap.set(day, {
          spDone: runningSpDone,
          bvDone: runningBvDone,
          scopeSp: runningScopeSp,
          scopeBv: runningScopeBv,
        });
      }
    }

    // Add current state as the last point
    const now = new Date();
    const endDate = new Date(sprintEnd);
    const currentDay = (now < endDate ? now : endDate).toISOString().slice(0, 10);
    if (!dayMap.has(currentDay)) {
      dayMap.set(currentDay, {
        spDone: runningSpDone,
        bvDone: runningBvDone,
        scopeSp: hasScopeData ? runningScopeSp : currentTotalSp,
        scopeBv: hasScopeData ? runningScopeBv : currentTotalBv,
      });
    }

    // Use current scope totals for percentage calculations
    const totalSp = hasScopeData ? runningScopeSp : currentTotalSp;
    const totalBv = hasScopeData ? runningScopeBv : currentTotalBv;

    // Build sorted points array
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const points: BurnupDataPoint[] = sortedDays.map(([date, vals]) => ({
      date,
      spDone: vals.spDone,
      spPct: totalSp > 0 ? Math.round((vals.spDone / totalSp) * 1000) / 10 : 0,
      bvDone: vals.bvDone,
      bvPct: totalBv > 0 ? Math.round((vals.bvDone / totalBv) * 1000) / 10 : 0,
      scopeSp: vals.scopeSp,
      scopeBv: vals.scopeBv,
    }));

    const result: BurnupResponse = {
      seeded: true,
      sprintStart,
      sprintEnd,
      totalSp,
      totalBv,
      points,
    };

    cache.set(cacheKey, result, 60_000);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
