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
 * POST /api/jira/sprints/[id]/close
 *
 * Closes (finishes) an active sprint via the Jira Agile API, then flips the
 * locally cached sprint state to "closed" so the board reflects it immediately
 * without waiting for the next full sync.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const sprintId = parseInt(id, 10);
  if (isNaN(sprintId)) {
    return errorResponse("Invalid sprint ID", 400);
  }

  try {
    await jiraClient.closeSprint(sprintId);

    // Flip the cached sprint state to "closed" so the UI updates immediately.
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });

    if (row) {
      try {
        const sprints: StoredSprint[] = JSON.parse(row.value);
        const idx = sprints.findIndex((s) => s.id === sprintId);
        if (idx >= 0) {
          sprints[idx].state = "closed";
          sprints[idx].completeDate = new Date().toISOString();
          await db.update(appSetting).set({ value: JSON.stringify(sprints) }).where(eq(appSetting.key, "jira_sprints"));
        }
      } catch {
        // Cache parse failure is non-critical; the next sync will reconcile.
      }
    }

    cache.invalidate("/api/jira/sprints");

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof JiraApiError && (err.status === 401 || err.status === 403)) {
      return errorResponse("Insufficient permissions to close this sprint", 403);
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to close sprint", message);
    return errorResponse("Failed to close sprint", 500);
  }
}
