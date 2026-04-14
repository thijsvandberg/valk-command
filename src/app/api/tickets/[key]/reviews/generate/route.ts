import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedReview, ticketMetadata, storyVersion } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentFetch } from "@/lib/agent-fetch";
import { parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { logActivity } from "@/lib/activity-logger";

/**
 * POST /api/tickets/[key]/reviews/generate
 *
 * Submits a review-story-json task to the agent, polls for completion,
 * parses the result, and persists it as a StoredReview. Returns the
 * saved review or an error. Timeout after 3 minutes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let source: "ticket-detail" | "chat" | "bulk-action" = "ticket-detail";
  try {
    const body = await request.json();
    if (body?.source) source = body.source;
  } catch {
    // No body is fine, default to ticket-detail
  }

  // Submit task to agent
  const submitResult = await agentFetch<{ id: string }>("/api/tasks", {
    method: "POST",
    body: {
      skill: "review-story-json",
      args: { args: key },
      conversationId: `review-${key}-${Date.now()}`,
    },
    retries: 2,
  });

  if (!submitResult.ok) {
    return NextResponse.json(
      { error: submitResult.error.error, code: submitResult.error.code },
      { status: submitResult.status || 502 },
    );
  }

  const taskId = submitResult.data.id;

  // Poll for completion (max 3 minutes, check every 3 seconds)
  const maxAttempts = 60;
  let output: string | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollResult = await agentFetch<{ status: string; output?: string; error?: string }>(
      `/api/tasks/${taskId}`,
    );

    if (!pollResult.ok) continue;

    if (pollResult.data.status === "completed" && pollResult.data.output) {
      output = pollResult.data.output;
      break;
    }

    if (pollResult.data.status === "failed") {
      return NextResponse.json(
        { error: pollResult.data.error ?? "Agent review failed" },
        { status: 502 },
      );
    }
  }

  if (!output) {
    return NextResponse.json({ error: "Review timed out" }, { status: 504 });
  }

  // Parse agent output
  const agentData = parseReviewOutput(output);
  if (!agentData) {
    return NextResponse.json(
      { error: "Could not parse agent review output" },
      { status: 502 },
    );
  }

  const result = mapAgentReviewToResult(agentData);

  // Get current story version
  const versions = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key))
    .orderBy(desc(storyVersion.createdAt));

  const latestVersion = versions[0];
  const versionHash = latestVersion?.contentHash ?? "no-version";
  const versionNumber = versions.length;

  // Persist review
  const id = randomUUID();
  await db.insert(storedReview).values({
    id,
    ticketKey: key,
    source,
    storyVersionHash: versionHash,
    storyVersionNumber: versionNumber,
    overallScore: result.overallScore,
    dimensions: JSON.stringify(result.dimensions),
    summary: result.summary,
    suggestions: JSON.stringify(result.suggestions),
  });

  // Update qualityScore
  const existingMeta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
  });

  if (existingMeta) {
    await db
      .update(ticketMetadata)
      .set({ qualityScore: result.overallScore })
      .where(eq(ticketMetadata.jiraKey, key));
  } else {
    await db.insert(ticketMetadata).values({
      jiraKey: key,
      qualityScore: result.overallScore,
    } as typeof ticketMetadata.$inferInsert);
  }

  await logActivity({
    type: source === "bulk-action" ? "bulk-action" : "review",
    scope: key,
    summary: `Review score ${result.overallScore}/100 (${agentData.verdict})`,
  });

  const saved = await db.query.storedReview.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, id),
  });

  return NextResponse.json({
    ...saved,
    dimensions: JSON.parse(saved!.dimensions),
    suggestions: JSON.parse(saved!.suggestions),
  }, { status: 201 });
}
