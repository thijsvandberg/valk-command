import { NextResponse } from "next/server";
import { db } from "@/db";
import { stakeholderAnalysis, conversation, message } from "@/db/schema";
import { randomUUID } from "crypto";
import { eq, desc, and } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { nextSequence } from "@/db/next-sequence";
import { errorResponse, agentErrorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintIdParam = searchParams.get("sprintId");
  if (!sprintIdParam) {
    return errorResponse("sprintId is required", 400);
  }
  const sprintId = parseInt(sprintIdParam, 10);
  if (isNaN(sprintId)) {
    return errorResponse("sprintId must be a number", 400);
  }

  const rows = await db
    .select()
    .from(stakeholderAnalysis)
    .where(eq(stakeholderAnalysis.sprintId, sprintId))
    .orderBy(desc(stakeholderAnalysis.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data as Record<string, unknown>;
  const sprintId = typeof b.sprintId === "number" ? b.sprintId : null;
  const sprintName = typeof b.sprintName === "string" ? b.sprintName : null;
  const type = b.type === "brief" || b.type === "deep-dive" ? b.type : null;
  const sprintData = typeof b.sprintData === "string" ? b.sprintData : null;
  const snapshotDonePoints = typeof b.snapshotDonePoints === "number" ? b.snapshotDonePoints : 0;
  const snapshotTodoCount = typeof b.snapshotTodoCount === "number" ? b.snapshotTodoCount : 0;

  if (!sprintId || !sprintName || !type || !sprintData) {
    return errorResponse("sprintId, sprintName, type, and sprintData are required", 400);
  }

  // Find or create conversation for this sprint
  const conversationTitle = `Stakeholder: ${sprintName}`;
  let existingConv = await db.query.conversation.findFirst({
    where: (c, { eq }) => eq(c.title, conversationTitle),
  });
  if (!existingConv) {
    const convId = randomUUID();
    await db.insert(conversation).values({
      id: convId,
      title: conversationTitle,
      createdAt: new Date().toISOString(),
      relatedTicket: null,
    });
    existingConv = await db.query.conversation.findFirst({
      where: (c, { eq }) => eq(c.id, convId),
    });
  }
  const conversationId = existingConv!.id;

  // Post user message to conversation
  const userMsgId = randomUUID();
  const typeLabel = type === "brief" ? "Status Brief" : "Sprint Insights";
  await db.insert(message).values({
    id: userMsgId,
    conversationId,
    role: "user",
    content: `Generate ${typeLabel} for ${sprintName}`,
    timestamp: new Date().toISOString(),
    status: "sent",
    sequence: nextSequence(conversationId),
  });

  // Create analysis record in "running" state
  const analysisId = randomUUID();
  const skillName = type === "brief" ? "stakeholder-briefing" : "stakeholder-deep-dive";

  // Submit workspace task
  const taskResult = await agentFetch("/api/tasks", {
    method: "POST",
    body: {
      skill: skillName,
      args: { sprintData },
      conversationId,
    },
    retries: 2,
  });

  if (!taskResult.ok) {
    return agentErrorResponse(taskResult.error, taskResult.status);
  }

  const workspaceTaskId = (taskResult.data as { id: string }).id;

  await db.insert(stakeholderAnalysis).values({
    id: analysisId,
    sprintId,
    sprintName,
    type,
    status: "running",
    workspaceTaskId,
    conversationId,
    snapshotDonePoints,
    snapshotTodoCount,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ id: analysisId, conversationId, taskId: workspaceTaskId }, { status: 201 });
}

export async function DELETE(request: Request) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  // Delete all analyses for a sprint (cleanup)
  const { searchParams } = new URL(request.url);
  const sprintIdParam = searchParams.get("sprintId");
  if (!sprintIdParam) return errorResponse("sprintId is required", 400);
  const sprintId = parseInt(sprintIdParam, 10);
  if (isNaN(sprintId)) return errorResponse("invalid sprintId", 400);

  await db.delete(stakeholderAnalysis).where(and(
    eq(stakeholderAnalysis.sprintId, sprintId),
  ));
  return NextResponse.json({ ok: true });
}
