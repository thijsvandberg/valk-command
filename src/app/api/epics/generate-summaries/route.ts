import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * POST /api/epics/generate-summaries
 *
 * Gathers all epics with their child ticket titles and submits
 * the summarize-epics skill to VRW. Returns a taskId for streaming.
 *
 * After the task completes, a background handler parses the output
 * and upserts summaries into the ticket table.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  const epicRows = await db
    .select({
      jiraKey: ticket.jiraKey,
      title: ticket.title,
      description: ticket.description,
    })
    .from(ticket)
    .where(eq(ticket.type, "epic"))
    .all();

  if (epicRows.length === 0) {
    return NextResponse.json({ error: "No epics found" }, { status: 404 });
  }

  // Gather child ticket titles per epic
  const childRows = await db
    .select({
      epicKey: ticket.epicKey,
      title: ticket.title,
    })
    .from(ticket)
    .where(sql`${ticket.epicKey} IS NOT NULL AND ${ticket.type} != 'epic'`)
    .all();

  const childMap = new Map<string, string[]>();
  for (const c of childRows) {
    if (!c.epicKey) continue;
    const list = childMap.get(c.epicKey) ?? [];
    list.push(c.title);
    childMap.set(c.epicKey, list);
  }

  const epicsPayload = epicRows.map((e) => ({
    key: e.jiraKey,
    name: e.title,
    description: e.description ?? null,
    childTickets: childMap.get(e.jiraKey) ?? [],
  }));

  const conversationId = `summarize-epics-${Date.now()}`;

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: "summarize-epics",
      conversationId,
      args: {
        epics: JSON.stringify(epicsPayload),
      },
    },
    retries: 2,
  });

  if (!result.ok) {
    logger.error("generate-summaries", "Failed to invoke summarize-epics skill", result.error.error);
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;
  const streamUrl = taskId ? `/api/workspace-tasks/${taskId}/stream` : null;

  // Background: poll for result and save summaries
  if (taskId) {
    after(async () => {
      try {
        await saveSummariesWhenComplete(taskId);
      } catch (err) {
        logger.error("generate-summaries", "Background save failed", err);
      }
    });
  }

  return NextResponse.json({ taskId, streamUrl }, { status: 202 });
}

async function saveSummariesWhenComplete(taskId: string) {
  const maxAttempts = 60;
  const pollIntervalMs = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const result = await agentFetch(`/api/tasks/${taskId}`);
    if (!result.ok) continue;

    const task = result.data as Record<string, unknown>;
    if (task.status === "completed" && typeof task.output === "string") {
      await parseSummariesAndSave(task.output);
      return;
    }
    if (task.status === "failed") {
      logger.error("generate-summaries", "Task failed", task.error);
      return;
    }
  }

  logger.error("generate-summaries", "Timed out waiting for task", taskId);
}

async function parseSummariesAndSave(output: string) {
  const match = output.match(/<json-output>([\s\S]*?)<\/json-output>/);
  if (!match) {
    logger.error("generate-summaries", "No <json-output> found in output");
    return;
  }

  let summaries: Array<{ key: string; summary: string }>;
  try {
    summaries = JSON.parse(match[1].trim());
  } catch {
    logger.error("generate-summaries", "Failed to parse JSON from output");
    return;
  }

  const now = new Date().toISOString();
  for (const s of summaries) {
    if (typeof s.key !== "string" || typeof s.summary !== "string") continue;
    await db
      .update(ticket)
      .set({ summary: s.summary, summaryUpdatedAt: now })
      .where(eq(ticket.jiraKey, s.key));
  }

  cache.invalidate("/api/epics");
  logger.info("generate-summaries", `Saved ${summaries.length} epic summaries`);
}
