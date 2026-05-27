import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";

type RouteContext = { params: Promise<{ key: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: { movedKey?: string; rankBefore?: string; rankAfter?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { movedKey, rankBefore, rankAfter } = body;

  if (!movedKey) {
    return NextResponse.json({ error: "movedKey is required" }, { status: 400 });
  }

  if (!rankBefore && !rankAfter) {
    return NextResponse.json({ error: "rankBefore or rankAfter is required" }, { status: 400 });
  }

  try {
    await jiraClient.rankIssues([movedKey], rankBefore, rankAfter);
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.error("subtask-rank", `Failed to rank subtask ${movedKey}: ${err}`);
    return NextResponse.json({ error: "Failed to rank in Jira" }, { status: 502 });
  }

  cache.invalidate(`/api/tickets/${key}`);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Reordered subtask ${movedKey}`,
  });

  return NextResponse.json({ ok: true });
}
