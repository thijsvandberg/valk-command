import { NextResponse } from "next/server";
import { db } from "@/db";
import { jiraComment, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-response";
import { emitTicketEvent, originFromRequest } from "@/lib/ticket-events";

/**
 * POST /api/jira/sync-comments?key=VPL-12345
 *
 * Fetches Jira comments for an issue, converts ADF bodies to markdown,
 * and upserts them into the jira_comment table.
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("sync");
  if (limited) return limited;

  // Suffix with a random token so two syncs in the same millisecond cannot
  // collide on the activity_log primary key (matches sync-sprints/sync-epics).
  const logId = `sync-comments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return errorResponse("key query parameter is required", 400);
    }

    await db.insert(activityLog).values({
      id: logId,
      type: "comment-sync",
      scope: key,
      status: "running",
      startedAt,
    });

    const controller = registerSync(logId);

    const comments = await jiraClient.getComments(key, controller.signal);
    let synced = 0;
    let changed = 0;

    for (const comment of comments) {
      const contentMarkdown = typeof comment.body === "string"
        ? comment.body
        : adfToMarkdown(comment.body);

      const authorName = comment.author?.displayName ?? "Unknown";
      const authorAvatar = comment.author?.avatarUrls?.["48x48"] ?? null;

      // Upsert by jiraCommentId
      const existing = await db.query.jiraComment.findFirst({
        where: (c, { eq: eqFn }) => eqFn(c.jiraCommentId, comment.id),
      });

      if (existing) {
        if (existing.content !== contentMarkdown) changed++;
        await db.update(jiraComment)
          .set({ content: contentMarkdown, authorName, authorAvatar })
          .where(eq(jiraComment.jiraCommentId, comment.id));
      } else {
        changed++;
        await db.insert(jiraComment).values({
          id: `jc-${comment.id}`,
          ticketKey: key,
          jiraCommentId: comment.id,
          authorName,
          authorAvatar,
          content: contentMarkdown,
          createdAt: comment.created,
        });
      }
      synced++;
    }

    // Fan the new/edited comments out to open views of this ticket. Origin is
    // the syncing tab so it does not re-highlight data it just loaded itself.
    if (changed > 0) {
      emitTicketEvent({ type: "ticket:changed", ticketKey: key, kinds: ["comment"], origin: originFromRequest(request) });
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "success",
      summary: `${synced} comments synced for ${key}`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    return NextResponse.json({ ok: true, key, count: synced });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("Sync cancelled", 499);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(activityLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(activityLog.id, logId));

    logger.error("jira", "Comment sync failed", message);
    return errorResponse("Comment sync failed", 500);
  } finally {
    unregisterSync(logId);
  }
}
