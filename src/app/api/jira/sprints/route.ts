import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

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

    let sprints: Array<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; completeDate: string | null; goal: string | null }>;

    if (sprintRow) {
      sprints = safeJsonParse(sprintRow.value, [], "jira-sprints");
    } else {
      const fetched = await jiraClient.getSprints();
      sprints = fetched.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
        completeDate: s.completeDate ?? null,
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
    logger.error("jira", "Failed to load sprints", message);
    return NextResponse.json({ error: "Failed to load sprints" }, { status: 500 });
  }
}

/**
 * PUT /api/jira/sprints
 *
 * Updates the hidden_sprints list.
 * Body: { hiddenIds: number[] }
 */
export async function PUT(request: NextRequest) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

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
    logger.error("jira", "Failed to update hidden sprints", message);
    return NextResponse.json({ error: "Failed to update hidden sprints" }, { status: 500 });
  }
}

interface StoredSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
}

/**
 * POST /api/jira/sprints
 *
 * Creates a new sprint in Jira and adds it to the local cache.
 * Body: { name: string; startDate?: string; endDate?: string; goal?: string }
 */
export async function POST(request: NextRequest) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  let body: { name?: string; startDate?: string; endDate?: string; goal?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Sprint name is required" }, { status: 400 });
  }

  const boardId = env.JIRA_BOARD_ID ? parseInt(env.JIRA_BOARD_ID, 10) : null;
  if (!boardId || isNaN(boardId)) {
    return NextResponse.json({ error: "JIRA_BOARD_ID is not configured" }, { status: 400 });
  }

  try {
    const created = await jiraClient.createSprint({
      name,
      originBoardId: boardId,
      ...(body.startDate ? { startDate: body.startDate } : {}),
      ...(body.endDate ? { endDate: body.endDate } : {}),
      ...(body.goal ? { goal: body.goal } : {}),
    });

    // Insert into local sprint cache
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });

    const newSprint: StoredSprint = {
      id: created.id,
      name: created.name,
      state: created.state ?? "future",
      startDate: created.startDate ?? null,
      endDate: created.endDate ?? null,
      completeDate: created.completeDate ?? null,
      goal: created.goal ?? null,
    };

    if (row) {
      try {
        const sprints: StoredSprint[] = JSON.parse(row.value);
        sprints.push(newSprint);
        await db.update(appSetting).set({ value: JSON.stringify(sprints) }).where(eq(appSetting.key, "jira_sprints"));
      } catch {
        // Cache parse failure is non-critical
      }
    }

    cache.invalidate("/api/jira/sprints");

    return NextResponse.json(newSprint, { status: 201 });
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 403) {
      return NextResponse.json(
        { error: "Insufficient permissions to create a sprint" },
        { status: 403 },
      );
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to create sprint", message);
    return NextResponse.json({ error: "Failed to create sprint" }, { status: 500 });
  }
}
