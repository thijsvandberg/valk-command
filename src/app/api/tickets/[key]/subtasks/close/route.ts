import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketSubtask } from "@/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import type { JiraStatus } from "@/types/ticket";

type RouteContext = { params: Promise<{ key: string }> };

const CLOSED_STATUSES: JiraStatus[] = ["DONE", "DEPRECATED"];

export async function POST(_request: Request, { params }: RouteContext) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (!CLOSED_STATUSES.includes(t.status as JiraStatus)) {
    return NextResponse.json(
      { error: "Subtasks can only be bulk-closed when the parent ticket is DONE or DEPRECATED" },
      { status: 400 },
    );
  }

  const openSubtasks = await db.select()
    .from(ticketSubtask)
    .where(
      and(
        eq(ticketSubtask.ticketKey, key),
        notInArray(ticketSubtask.status, ["DONE", "DEPRECATED"]),
      ),
    );

  if (openSubtasks.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  const results: { key: string; success: boolean; error?: string }[] = [];

  for (const sub of openSubtasks) {
    let jiraError: string | undefined;
    try {
      await jiraClient.transitionIssue(sub.subtaskKey, "DONE");
    } catch (err) {
      jiraError = err instanceof Error ? err.message : String(err);
      logger.warn("subtask-close", `Jira transition failed for ${sub.subtaskKey}: ${jiraError}`);
    }

    await db.update(ticketSubtask)
      .set({ status: "DONE" })
      .where(eq(ticketSubtask.id, sub.id));

    results.push({
      key: sub.subtaskKey,
      success: !jiraError,
      ...(jiraError ? { error: jiraError } : {}),
    });
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Closed ${results.length} subtask${results.length !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} Jira transition${failCount !== 1 ? "s" : ""} failed)` : ""}`,
  });

  return NextResponse.json({
    closed: results.length,
    results,
  });
}
