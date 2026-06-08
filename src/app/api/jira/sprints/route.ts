import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { appSetting, ticket } from "@/db/schema";
import { eq, and, ne, notInArray, sql } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { ensureSprintsCached } from "@/lib/sprint-cache";
import { env } from "@/lib/env";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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
/**
 * Backfill full metadata for any sprint a ticket references but that is missing or only partially
 * known in `jira_sprints`. Runs detached from the response (after it flushes) so it never adds
 * latency, and best-effort so it never breaks the read. Reuses the single `ensureSprintsCached`
 * path, which decides per id what needs fetching, dedups, and prunes 404'd sprints.
 */
function scheduleSprintBackfill() {
  after(async () => {
    try {
      const rows = await db
        .selectDistinct({ sprintId: ticket.sprintName })
        .from(ticket)
        .where(ne(ticket.sprintName, ""))
        .all();
      const ids = rows.map((r) => r.sprintId).filter((id): id is string => !!id);
      if (ids.length > 0) await ensureSprintsCached(ids);
    } catch (err) {
      logger.warn("jira", "read-path sprint backfill failed", err instanceof Error ? err.message : String(err));
    }
  });
}

export async function GET() {
  // Enrich partially-known sprints (e.g. old closed sprints with only a name) in the background so
  // their dates/state appear on the next revalidate, across every surface that reads this endpoint.
  scheduleSprintBackfill();

  const CACHE_KEY = "/api/jira/sprints";
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  try {
    const [sprintRow, hiddenIds, backlogCountResult] = await Promise.all([
      db.query.appSetting.findFirst({
        where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
      }),
      getHiddenIds(),
      db.select({ count: sql<number>`COUNT(*)` })
        .from(ticket)
        .where(and(
          eq(ticket.sprintName, ""),
          notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]),
          notInArray(ticket.type, ["subtask", "epic"]),
        )),
    ]);

    const backlogCount = backlogCountResult[0]?.count ?? 0;

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

    const payload = { sprints: result, backlogCount };
    cache.set(CACHE_KEY, payload, 300_000);

    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to load sprints", message);
    return errorResponse("Failed to load sprints", 500);
  }
}

/**
 * PUT /api/jira/sprints
 *
 * Updates the hidden_sprints list.
 * Body: { hiddenIds: number[] }
 */
export async function PUT(request: NextRequest) {
  const limited = await applyRateLimit("write");
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
    return errorResponse("Failed to update hidden sprints", 500);
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
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const name = (body.name as string | undefined)?.trim();
  if (!name) {
    return errorResponse("Sprint name is required", 400);
  }

  const boardId = env.JIRA_BOARD_ID ? parseInt(env.JIRA_BOARD_ID, 10) : null;
  if (!boardId || isNaN(boardId)) {
    return errorResponse("JIRA_BOARD_ID is not configured", 400);
  }

  try {
    const created = await jiraClient.createSprint({
      name,
      originBoardId: boardId,
      ...(body.startDate ? { startDate: body.startDate as string } : {}),
      ...(body.endDate ? { endDate: body.endDate as string } : {}),
      ...(body.goal ? { goal: body.goal as string } : {}),
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
    if (err instanceof JiraApiError && (err.status === 401 || err.status === 403)) {
      const detail = err.status === 401
        ? "Jira API credentials lack permission to create sprints"
        : "Insufficient permissions to create a sprint";
      return errorResponse(detail, err.status);
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to create sprint", message);
    return errorResponse(message, 500);
  }
}
