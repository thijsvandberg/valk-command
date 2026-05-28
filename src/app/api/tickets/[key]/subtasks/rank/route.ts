import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
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

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { movedKey?: string; rankBefore?: string; rankAfter?: string };

  const { movedKey, rankBefore, rankAfter } = body;

  if (!movedKey) {
    return errorResponse("movedKey is required", 400);
  }

  if (!rankBefore && !rankAfter) {
    return errorResponse("rankBefore or rankAfter is required", 400);
  }

  try {
    await jiraClient.rankIssues([movedKey], rankBefore, rankAfter);
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.error("subtask-rank", `Failed to rank subtask ${movedKey}: ${err}`);
    return errorResponse("Failed to rank in Jira", 502);
  }

  cache.invalidate(`/api/tickets/${key}`);

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Reordered subtask ${movedKey}`,
  });

  return NextResponse.json({ ok: true });
}
