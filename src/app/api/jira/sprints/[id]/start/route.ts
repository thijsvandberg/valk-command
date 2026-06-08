import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";

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
 * POST /api/jira/sprints/[id]/start
 *
 * Starts (activates) a future sprint via the Jira Agile API, then flips the
 * locally cached sprint state to "active" (with the accepted dates) so the
 * board reflects it immediately without waiting for the next full sync.
 *
 * Jira requires both a start and end date to activate. The end date is taken
 * from the request body (mandatory); the start date is the sprint's preferred
 * start (often its existing planned start, which may be in the past). The Jira
 * client falls back to "now" if Jira rejects that start, so the response
 * reports the date that was actually applied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const sprintId = parseInt(id, 10);
  if (isNaN(sprintId)) {
    return errorResponse("Invalid sprint ID", 400);
  }

  let body: { startDate?: string | null; endDate?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  if (!body.endDate) {
    return errorResponse("An end date is required to start a sprint", 400);
  }

  try {
    const applied = await jiraClient.startSprint(sprintId, {
      startDate: body.startDate ?? null,
      endDate: body.endDate,
    });

    // Flip the cached sprint state to "active" so the UI updates immediately.
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });

    if (row) {
      try {
        const sprints: StoredSprint[] = JSON.parse(row.value);
        const idx = sprints.findIndex((s) => s.id === sprintId);
        if (idx >= 0) {
          sprints[idx].state = "active";
          sprints[idx].startDate = applied.startDate;
          sprints[idx].endDate = applied.endDate;
          await db.update(appSetting).set({ value: JSON.stringify(sprints) }).where(eq(appSetting.key, "jira_sprints"));
        }
      } catch {
        // Cache parse failure is non-critical; the next sync will reconcile.
      }
    }

    cache.invalidate("/api/jira/sprints");

    return NextResponse.json({ ok: true, ...applied });
  } catch (err) {
    if (err instanceof JiraApiError && (err.status === 401 || err.status === 403)) {
      return errorResponse("Insufficient permissions to start this sprint", 403);
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to start sprint", message);
    return errorResponse("Failed to start sprint", 500);
  }
}
