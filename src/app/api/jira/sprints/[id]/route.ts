import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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
 * PUT /api/jira/sprints/[id]
 *
 * Updates sprint metadata (goal, dates) via the Jira Agile API,
 * then refreshes the local cache.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const sprintId = parseInt(id, 10);
  if (isNaN(sprintId)) {
    return errorResponse("Invalid sprint ID", 400);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const fields: Record<string, string> = {};
  if (body.goal !== undefined) fields.goal = body.goal as string;
  if (body.startDate !== undefined) fields.startDate = body.startDate as string;
  if (body.endDate !== undefined) fields.endDate = body.endDate as string;

  if (Object.keys(fields).length === 0) {
    return errorResponse("No fields to update", 400);
  }

  try {
    await jiraClient.updateSprint(sprintId, fields);

    // Update local sprint cache
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });

    if (row) {
      try {
        const sprints: StoredSprint[] = JSON.parse(row.value);
        const idx = sprints.findIndex((s) => s.id === sprintId);
        if (idx >= 0) {
          if (fields.goal !== undefined) sprints[idx].goal = fields.goal;
          if (fields.startDate !== undefined) sprints[idx].startDate = fields.startDate;
          if (fields.endDate !== undefined) sprints[idx].endDate = fields.endDate;
          await db.update(appSetting).set({ value: JSON.stringify(sprints) }).where(eq(appSetting.key, "jira_sprints"));
        }
      } catch {
        // Cache parse failure is non-critical
      }
    }

    cache.invalidate("/api/jira/sprints");

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 403) {
      return errorResponse("Insufficient permissions to update this sprint", 403);
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to update sprint", message);
    return errorResponse("Failed to update sprint", 500);
  }
}
