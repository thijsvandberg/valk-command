import { NextResponse } from "next/server";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

/**
 * Watchers are not persisted locally (decided in BRDG-264): they are fetched
 * on demand for the open ticket and written straight through to Jira, which
 * owns watcher state and notification delivery.
 */

/**
 * GET /api/jira/watchers?issueKey=VPL-100
 *
 * Returns the current watchers of an issue.
 */
export async function GET(request: Request) {
  const issueKey = new URL(request.url).searchParams.get("issueKey");
  if (!issueKey) {
    return errorResponse("issueKey is required", 400);
  }

  try {
    const watchers = await jiraClient.getWatchers(issueKey);
    return NextResponse.json({ watchers }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to fetch watchers", message);
    return errorResponse("Failed to fetch watchers", 500);
  }
}

/**
 * POST /api/jira/watchers
 *
 * Adds a watcher to an issue.
 *
 * Body:
 *   issueKey:  string - the ticket key
 *   accountId: string - Jira accountId of the user to add
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { issueKey, accountId } = parsed.data as { issueKey?: string; accountId?: string };

  if (!issueKey || typeof issueKey !== "string") {
    return errorResponse("issueKey is required", 400);
  }
  if (!accountId || typeof accountId !== "string") {
    return errorResponse("accountId is required", 400);
  }

  try {
    await jiraClient.addWatcher(issueKey, accountId);
    await syncJiraTimestamp(issueKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to add watcher", message);
    return errorResponse("Failed to add watcher", 500);
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/jira/watchers?issueKey=VPL-100&accountId=abc
 *
 * Removes a watcher from an issue.
 */
export async function DELETE(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const issueKey = params.get("issueKey");
  const accountId = params.get("accountId");

  if (!issueKey) {
    return errorResponse("issueKey is required", 400);
  }
  if (!accountId) {
    return errorResponse("accountId is required", 400);
  }

  try {
    await jiraClient.removeWatcher(issueKey, accountId);
    await syncJiraTimestamp(issueKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("jira", "Failed to remove watcher", message);
    return errorResponse("Failed to remove watcher", 500);
  }

  return NextResponse.json({ ok: true });
}
