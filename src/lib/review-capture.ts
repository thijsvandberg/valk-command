import "server-only";
import { db } from "@/db";
import { storedReview, ticketMetadata, storyVersion, workspaceTask } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { logActivity } from "@/lib/activity-logger";
import { createNotification } from "@/lib/notifications";
import { captureTaskStream } from "@/lib/task-stream-handler";
import { logger } from "@/lib/logger";

const QUALITY_ALERT_THRESHOLD = 60;

/**
 * Processes the agent output of a completed review task:
 * parses the JSON result, persists the review, and updates ticket quality score.
 */
async function processReviewOutput(
  ticketKey: string,
  output: string,
  source: "ticket-detail" | "chat" | "bulk-action",
): Promise<void> {
  const agentData = parseReviewOutput(output);
  if (!agentData) {
    logger.warn("review-capture", "Could not parse agent review output", { ticketKey });
    return;
  }

  const result = mapAgentReviewToResult(agentData);

  const versions = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, ticketKey))
    .orderBy(desc(storyVersion.createdAt));

  const latestVersion = versions[0];
  const versionHash = latestVersion?.contentHash ?? "no-version";
  const versionNumber = versions.length;

  const id = randomUUID();
  await db.insert(storedReview).values({
    id,
    ticketKey,
    source,
    storyVersionHash: versionHash,
    storyVersionNumber: versionNumber,
    overallScore: result.overallScore,
    dimensions: JSON.stringify(result.dimensions),
    summary: result.summary,
    suggestions: JSON.stringify(result.suggestions),
  });

  const existingMeta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, ticketKey),
  });

  if (existingMeta) {
    await db
      .update(ticketMetadata)
      .set({ qualityScore: result.overallScore })
      .where(eq(ticketMetadata.jiraKey, ticketKey));
  } else {
    await db.insert(ticketMetadata).values({
      jiraKey: ticketKey,
      qualityScore: result.overallScore,
    } as typeof ticketMetadata.$inferInsert);
  }

  await logActivity({
    type: source === "bulk-action" ? "bulk-action" : "review",
    scope: ticketKey,
    summary: `Review score ${result.overallScore}/100 (${agentData.verdict})`,
  });

  if (result.overallScore < QUALITY_ALERT_THRESHOLD) {
    createNotification(
      "story-writer",
      `Low quality score (${result.overallScore}) for ${ticketKey}`,
      { category: "story-writer", jiraKey: ticketKey, linkUrl: `/tickets/${ticketKey}` },
    );
  }
}

/**
 * Background handler for review generation: captures the agent SSE stream,
 * then processes the review output once the task completes.
 * Designed to run inside after() from the generate route.
 */
export async function captureReviewGeneration(
  taskId: string,
  conversationId: string,
  ticketKey: string,
  source: "ticket-detail" | "chat" | "bulk-action",
): Promise<void> {
  await captureTaskStream({
    taskId,
    skillName: "review-story-json",
    conversationId,
    relatedTicket: ticketKey,
  });

  // After captureTaskStream completes, read the output from the workspaceTask row
  const task = await db.query.workspaceTask.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, taskId),
  });

  if (task?.status === "completed" && task.output) {
    await processReviewOutput(ticketKey, task.output, source);
  }
}
