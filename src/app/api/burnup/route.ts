import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketStatusChange, appSetting } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { normalizeStatus } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";

export interface BurnupDataPoint {
  date: string;
  spDone: number;
  spPct: number;
  bvDone: number;
  bvPct: number;
  scopeSp: number;
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
 * Computes burnup chart data from status change history.
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

    if (!sprintStart || !sprintEnd) {
      return NextResponse.json({ error: "Sprint dates not found" }, { status: 404 });
    }

    // Load tickets for this sprint with their metadata
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

    // Build value lookup: SP and BV per ticket
    const ticketValues = new Map<string, { sp: number; bv: number }>();
    let totalSp = 0;
    let totalBv = 0;

    for (const t of tickets) {
      const sp = t.storyPoints ?? 0;
      const bv = (t.bv != null && t.bv >= 1 && t.status !== "DEPRECATED") ? t.bv : 0;
      ticketValues.set(t.jiraKey, { sp, bv });
      if (t.status !== "DEPRECATED") totalSp += sp;
      totalBv += bv;
    }

    // Check if we have status change data
    const seededRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, `burnup_seeded_${sprintId}`),
    });
    const changeRows = await db
      .select()
      .from(ticketStatusChange)
      .where(eq(ticketStatusChange.sprintName, sprintId))
      .all();

    const seeded = !!seededRow || changeRows.length > 0;

    if (!seeded) {
      const result: BurnupResponse = {
        seeded: false,
        sprintStart,
        sprintEnd,
        totalSp,
        totalBv,
        points: [],
      };
      return NextResponse.json(result);
    }

    // Sort changes chronologically
    const changes = changeRows.sort((a, b) => a.changedAt.localeCompare(b.changedAt));

    // Walk through changes and build cumulative done values per day
    const doneSet = new Set<string>();
    let runningSpDone = 0;
    let runningBvDone = 0;

    // Group by day
    const dayMap = new Map<string, { spDone: number; bvDone: number }>();

    // Start point: sprint start with 0 done
    const startDay = sprintStart.slice(0, 10);
    dayMap.set(startDay, { spDone: 0, bvDone: 0 });

    for (const change of changes) {
      const normalized = normalizeStatus(change.toStatus);
      const vals = ticketValues.get(change.ticketKey);
      if (!vals) continue;

      if (normalized === "DONE" && !doneSet.has(change.ticketKey)) {
        doneSet.add(change.ticketKey);
        runningSpDone += vals.sp;
        runningBvDone += vals.bv;
      } else if (normalized !== "DONE" && doneSet.has(change.ticketKey)) {
        // Regression: moved out of DONE
        doneSet.delete(change.ticketKey);
        runningSpDone -= vals.sp;
        runningBvDone -= vals.bv;
      } else {
        continue;
      }

      const day = change.changedAt.slice(0, 10);
      dayMap.set(day, { spDone: runningSpDone, bvDone: runningBvDone });
    }

    // Also add current state as the last point (today or sprint end)
    const now = new Date();
    const endDate = new Date(sprintEnd);
    const currentDay = (now < endDate ? now : endDate).toISOString().slice(0, 10);
    if (!dayMap.has(currentDay)) {
      dayMap.set(currentDay, { spDone: runningSpDone, bvDone: runningBvDone });
    }

    // Build sorted points array
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const points: BurnupDataPoint[] = sortedDays.map(([date, vals]) => ({
      date,
      spDone: vals.spDone,
      spPct: totalSp > 0 ? Math.round((vals.spDone / totalSp) * 1000) / 10 : 0,
      bvDone: vals.bvDone,
      bvPct: totalBv > 0 ? Math.round((vals.bvDone / totalBv) * 1000) / 10 : 0,
      scopeSp: totalSp,
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
