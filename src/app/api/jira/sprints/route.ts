import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

async function getHiddenIds(): Promise<Set<string>> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, "hidden_sprints"),
  });
  if (!row) return new Set();
  try {
    const ids = JSON.parse(row.value) as number[];
    return new Set(ids.map(String));
  } catch {
    return new Set();
  }
}

/**
 * GET /api/jira/sprints
 *
 * Returns the cached sprint list with a `hidden` boolean per sprint.
 * Falls back to fetching from Jira if no cache exists.
 */
export async function GET() {
  const CACHE_KEY = "/api/jira/sprints";
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  try {
    const [sprintRow, hiddenIds] = await Promise.all([
      db.query.appSetting.findFirst({
        where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
      }),
      getHiddenIds(),
    ]);

    let sprints: Array<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal: string | null }>;

    if (sprintRow) {
      sprints = JSON.parse(sprintRow.value);
    } else {
      const fetched = await jiraClient.getSprints();
      sprints = fetched.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
        goal: s.goal ?? null,
      }));
    }

    const result = sprints.map((s) => ({
      ...s,
      hidden: hiddenIds.has(String(s.id)),
    }));

    cache.set(CACHE_KEY, result, 300_000);

    return NextResponse.json(result, {
      headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/jira/sprints
 *
 * Updates the hidden_sprints list.
 * Body: { hiddenIds: number[] }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const hiddenIds: number[] = body.hiddenIds ?? [];
    const payload = JSON.stringify(hiddenIds);

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "hidden_sprints"),
    });

    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, "hidden_sprints"));
    } else {
      await db.insert(appSetting).values({ key: "hidden_sprints", value: payload });
    }

    return NextResponse.json({ ok: true, count: hiddenIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
