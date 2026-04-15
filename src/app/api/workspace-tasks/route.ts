import { NextResponse, after } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logActivity } from "@/lib/activity-logger";
import { db } from "@/db";
import { conversation, workspaceTask } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { captureTaskStream } from "@/lib/task-stream-handler";

export async function POST(request: Request) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  // Accept both "skillName" and "skill" for compatibility
  const skillName = typeof b.skillName === "string" ? b.skillName : typeof b.skill === "string" ? b.skill : null;
  if (!skillName) {
    return NextResponse.json({ error: "skillName (string) is required" }, { status: 400 });
  }

  const conversationId = typeof b.conversationId === "string"
    ? b.conversationId
    : `auto-${Date.now()}`;

  // Ensure the conversation exists in Bridge's local DB so background handler can save messages
  const existing = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, conversationId),
  });
  if (!existing) {
    await db.insert(conversation).values({
      id: conversationId,
      title: `Task: ${skillName}`,
      createdAt: new Date().toISOString(),
      relatedTicket: typeof b.relatedTicket === "string" ? b.relatedTicket : null,
    });
  }

  // Normalise body for the agent: ensure skill is set and provide conversationId
  const agentBody = {
    ...b,
    skill: skillName,
    conversationId,
  };

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: agentBody,
    retries: 2,
  });

  if (!result.ok) {
    await logActivity({
      type: "story-writer",
      scope: null,
      status: "failed",
      summary: `Agent task failed (skill: ${skillName}): ${result.error.code}`,
      errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: result.status, retryCount: result.retryCount, skill: skillName }),
    });
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  const taskData = result.data as Record<string, unknown>;
  const taskId = typeof taskData.id === "string" ? taskData.id : null;

  // Spawn server-side background stream handler so the result is captured
  // even if the browser disconnects before the task completes
  if (taskId) {
    after(async () => {
      await captureTaskStream({
        taskId,
        skillName,
        conversationId,
        relatedTicket: typeof b.relatedTicket === "string" ? b.relatedTicket : null,
      });
    });
  }

  return NextResponse.json({ ...taskData, conversationId }, { status: result.status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filterConversationId = url.searchParams.get("conversationId");
  const filterStatus = url.searchParams.get("status");

  // Query Bridge's local workspace_task table when filters are provided
  if (filterConversationId) {
    const conditions = [eq(workspaceTask.conversationId, filterConversationId)];
    if (filterStatus) {
      const validStatuses = ["queued", "running", "completed", "failed"] as const;
      if (validStatuses.includes(filterStatus as typeof validStatuses[number])) {
        conditions.push(eq(workspaceTask.status, filterStatus as typeof validStatuses[number]));
      }
    }
    const rows = db
      .select()
      .from(workspaceTask)
      .where(and(...conditions))
      .all();
    return NextResponse.json(rows);
  }

  // Fallback: proxy to VRW for status without filters
  const proxyResult = await agentFetch("/api/tasks");

  if (!proxyResult.ok) {
    return NextResponse.json(
      { error: proxyResult.error.error, code: proxyResult.error.code },
      { status: proxyResult.status || 502 },
    );
  }

  return NextResponse.json(proxyResult.data, { status: proxyResult.status });
}
