import { NextResponse } from "next/server";
import { db } from "@/db";
import { jiraComment, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { registerSync, unregisterSync } from "@/lib/sync-abort";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * POST /api/jira/sync-comments?key=VPL-12345
 *
 * Fetches Jira comments for an issue, converts ADF bodies to markdown,
 * and upserts them into the jira_comment table.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const logId = `sync-comments-${Date.now()}`;
  const startedAt = new Date().toISOString();

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "key query parameter is required" }, { status: 400 });
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
        await db.update(jiraComment)
          .set({ content: contentMarkdown, authorName, authorAvatar })
          .where(eq(jiraComment.jiraCommentId, comment.id));
      } else {
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
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
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
    return NextResponse.json({ ok: false, error: "Comment sync failed" }, { status: 500 });
  } finally {
    unregisterSync(logId);
  }
}
