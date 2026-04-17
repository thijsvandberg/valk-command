import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import type { JiraStatus } from "@/types/ticket";

type RouteContext = { params: Promise<{ key: string }> };

const VALID_STATUSES: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

export async function PUT(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let body: { status?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = body.status as JiraStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!existing) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  try {
    await jiraClient.transitionIssue(key, status);
  } catch (err) {
    logger.error("ticket-status", `Jira transition failed for ${key}:`, err);
    return NextResponse.json(
      { error: "Failed to transition issue in Jira" },
      { status: 502 },
    );
  }

  await db.update(ticket).set({ status }).where(eq(ticket.jiraKey, key));

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Changed status to ${status}`,
  });

  return NextResponse.json({ status });
}
