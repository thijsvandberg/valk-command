import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * POST /api/jira/move-sprint
 *
 * Moves one or more issues to a different sprint in Jira, then updates
 * the local sprintName field so the UI reflects the change immediately.
 *
 * Body:
 *   issueKeys:     string[] - keys to move
 *   targetSprintId: string  - destination sprint ID
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  let body: { issueKeys?: string[]; targetSprintId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { issueKeys, targetSprintId } = body;

  if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
    return NextResponse.json({ ok: false, error: "issueKeys must be a non-empty array" }, { status: 400 });
  }
  if (!targetSprintId || typeof targetSprintId !== "string") {
    return NextResponse.json({ ok: false, error: "targetSprintId is required" }, { status: 400 });
  }

  const sprintIdNum = parseInt(targetSprintId, 10);
  if (isNaN(sprintIdNum)) {
    return NextResponse.json({ ok: false, error: "targetSprintId must be a number" }, { status: 400 });
  }

  try {
    await jiraClient.moveToSprint(issueKeys, sprintIdNum);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to move issues", message);
    return NextResponse.json({ ok: false, error: "Failed to move issues" }, { status: 500 });
  }

  // Update local sprint assignment
  await db
    .update(ticket)
    .set({ sprintName: targetSprintId })
    .where(inArray(ticket.jiraKey, issueKeys));

  cache.invalidate("/api/tickets");

  return NextResponse.json({ ok: true, movedCount: issueKeys.length });
}
