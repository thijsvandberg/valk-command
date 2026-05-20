import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";

type RouteContext = { params: Promise<{ key: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: { title?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required and must be non-empty" }, { status: 400 });
  }

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!existing) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  await db.update(ticket).set({ title }).where(eq(ticket.jiraKey, key));

  // Push to Jira in the background; failure does not block the response
  let jiraError: string | undefined;
  try {
    await jiraClient.updateIssue(key, { summary: title });
  } catch (err) {
    jiraError = err instanceof Error ? err.message : String(err);
    logger.warn("ticket-summary", `Jira summary update failed for ${key}: ${jiraError}`);
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Renamed to "${title}"${jiraError ? " (Bridge only — Jira update failed)" : ""}`,
  });

  return NextResponse.json({ title, ...(jiraError ? { jiraWarning: "Jira update failed" } : {}) });
}
