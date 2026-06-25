import { NextResponse, after } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logActivity } from "@/lib/activity-logger";
import { db } from "@/db";
import { conversation, message, workspaceTask } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { captureTaskStream } from "@/lib/task-stream-handler";
import { nextSequence } from "@/db/next-sequence";
import { withRequestLog } from "@/lib/request-log";

/**
 * Build a human-readable title for a task conversation based on skill + args.
 */
function buildConversationTitle(skillName: string, args: Record<string, unknown>): string {
  switch (skillName) {
    case "suggest-sprint-goal": {
      const sprintName = typeof args.sprintName === "string" ? args.sprintName : null;
      return sprintName ? `Sprint Goal: ${sprintName}` : "Sprint Goal Suggestion";
    }
    case "review-story":
    case "review-story-json": {
      const ticket = typeof args.args === "string" ? args.args.trim() : null;
      return ticket ? `Review: ${ticket}` : "Story Review";
    }
    case "investigate": {
      const query = typeof args.args === "string" ? args.args.trim() : null;
      if (query) {
        const short = query.length > 50 ? query.slice(0, 47) + "..." : query;
        return `Investigate: ${short}`;
      }
      return "Investigation";
    }
    case "chat": {
      const text = typeof args.args === "string" ? args.args.trim() : null;
      if (text) {
        const short = text.length > 50 ? text.slice(0, 47) + "..." : text;
        return `Chat: ${short}`;
      }
      return "Chat";
    }
    case "suggest-subtasks": {
      const ticketKey = typeof args.ticketKey === "string" ? args.ticketKey : null;
      return ticketKey ? `Suggest Subtasks: ${ticketKey}` : "Suggest Subtasks";
    }
    case "export-stakeholder-summary": {
      const sprintName = typeof args.sprintName === "string" ? args.sprintName : null;
      return sprintName ? `Stakeholder Export: ${sprintName}` : "Stakeholder Export";
    }
    default: {
      const pretty = skillName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return pretty;
    }
  }
}

/**
 * Build a user-facing prompt summary so the conversation shows what was requested.
 */
function buildPromptSummary(skillName: string, args: Record<string, unknown>): string {
  switch (skillName) {
    case "suggest-sprint-goal": {
      const sprintName = typeof args.sprintName === "string" ? args.sprintName : "unknown sprint";
      const sprintId = typeof args.sprintId === "string" ? args.sprintId : null;
      let ticketCount = 0;
      if (typeof args.tickets === "string") {
        try { ticketCount = JSON.parse(args.tickets).length; } catch { /* ignore */ }
      } else if (Array.isArray(args.tickets)) {
        ticketCount = args.tickets.length;
      }
      const sprintLabel = sprintId
        ? `[${sprintName}](/sprint-board?sprint=${sprintId})`
        : sprintName;
      return `Suggest a sprint goal for ${sprintLabel} based on ${ticketCount} ticket${ticketCount !== 1 ? "s" : ""}.`;
    }
    case "review-story":
    case "review-story-json": {
      const ticket = typeof args.args === "string" ? args.args.trim() : "ticket";
      return `Review story ${ticket} for sprint readiness.`;
    }
    case "investigate": {
      const query = typeof args.args === "string" ? args.args.trim() : "";
      return query || "Run investigation.";
    }
    case "chat": {
      const text = typeof args.args === "string" ? args.args.trim() : "";
      return text || "Chat message";
    }
    case "suggest-subtasks": {
      const ticketKey = typeof args.ticketKey === "string" ? args.ticketKey : "ticket";
      return `Suggest subtasks for ${ticketKey} based on description and acceptance criteria.`;
    }
    case "export-stakeholder-summary": {
      const sprintName = typeof args.sprintName === "string" ? args.sprintName : "selected work";
      let tickets: { key: string; summary: string; points?: number | null }[] = [];
      if (typeof args.tickets === "string") {
        try { tickets = JSON.parse(args.tickets); } catch { /* ignore */ }
      } else if (Array.isArray(args.tickets)) {
        tickets = args.tickets;
      }
      const totalPoints = tickets.reduce((sum, t) => sum + (t.points ?? 0), 0);
      const ticketLines = tickets
        .map((t) => `- **${t.key}**: ${t.summary}`)
        .join("\n");
      return [
        `Generate a stakeholder-friendly summary for **${sprintName}**`,
        totalPoints > 0 ? ` (${totalPoints} points, ${tickets.length} tickets)` : ` (${tickets.length} tickets)`,
        ":\n\n",
        ticketLines,
      ].join("");
    }
    default: {
      const argsStr = typeof args.args === "string" ? args.args : "";
      const pretty = skillName.replace(/-/g, " ");
      return argsStr ? `/${pretty} ${argsStr}` : `/${pretty}`;
    }
  }
}

async function createWorkspaceTask(request: Request) {
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  const b = body as Record<string, unknown>;
  // Accept both "skillName" and "skill" for compatibility
  const skillName = typeof b.skillName === "string" ? b.skillName : typeof b.skill === "string" ? b.skill : null;
  if (!skillName) {
    return errorResponse("skillName (string) is required", 400);
  }

  const conversationId = typeof b.conversationId === "string"
    ? b.conversationId
    : `auto-${Date.now()}`;

  const args = (typeof b.args === "object" && b.args !== null && !Array.isArray(b.args))
    ? b.args as Record<string, unknown>
    : typeof b.args === "string" ? { args: b.args } : {};

  // Ensure the conversation exists in Bridge's local DB so background handler can save messages
  const existing = await db.query.conversation.findFirst({
    where: (c, { eq: eq_ }) => eq_(c.id, conversationId),
  });
  if (!existing) {
    // Build metadata for sprint-goal conversations so the chat UI can offer actions
    let metadata: string | null = null;
    if (skillName === "suggest-sprint-goal") {
      const sprintId = typeof args.sprintId === "string" ? args.sprintId : null;
      const sprintName = typeof args.sprintName === "string" ? args.sprintName : null;
      let ticketKeys: string[] = [];
      try {
        const raw = typeof args.tickets === "string" ? JSON.parse(args.tickets) : args.tickets;
        if (Array.isArray(raw)) ticketKeys = raw.map((t: { key?: string }) => t.key).filter((k): k is string => Boolean(k));
      } catch { /* ignore */ }
      if (sprintId) {
        metadata = JSON.stringify({ sprintId, sprintName, ticketKeys });
      }
    }

    await db.insert(conversation).values({
      id: conversationId,
      title: buildConversationTitle(skillName, args),
      createdAt: new Date().toISOString(),
      relatedTicket: typeof b.relatedTicket === "string" ? b.relatedTicket : null,
      metadata,
    });

    // Save a user message so the conversation shows what was requested
    await db.insert(message).values({
      id: randomUUID(),
      conversationId,
      role: "user",
      content: buildPromptSummary(skillName, args),
      timestamp: new Date().toISOString(),
      sequence: nextSequence(conversationId),
    });
  } else if (existing.title === "New conversation" || existing.title === "New investigation") {
    // Update generic title to something meaningful based on the first skill invocation
    await db.update(conversation)
      .set({ title: buildConversationTitle(skillName, args) })
      .where(eq(conversation.id, conversationId));
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
    return agentErrorResponse(result.error, result.status);
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

async function listWorkspaceTasks(request: Request) {
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
    return agentErrorResponse(proxyResult.error, proxyResult.status);
  }

  return NextResponse.json(proxyResult.data, { status: proxyResult.status });
}

// One access-log line per request (BRDG-400); see src/lib/request-log.ts.
export const POST = withRequestLog(createWorkspaceTask);
export const GET = withRequestLog(listWorkspaceTasks);
