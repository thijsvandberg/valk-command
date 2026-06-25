import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { resolveDraftKey } from "@/lib/draft-sync";
import { db } from "@/db";
import { storyWriterExecutionLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ key: string; taskId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { key: rawKey, taskId } = await params;
  const invalidKey = validatePathParam(rawKey);
  if (invalidKey) return invalidKey;
  const key = resolveDraftKey(rawKey);
  const invalidTaskId = validatePathParam(taskId);
  if (invalidTaskId) return invalidTaskId;

  const row = await db
    .select()
    .from(storyWriterExecutionLog)
    .where(eq(storyWriterExecutionLog.taskId, taskId))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  let log: unknown;
  try {
    log = JSON.parse(row.log);
  } catch (err) {
    logger.error("story-writer-logs", `malformed log data for task ${taskId}`, err);
    return NextResponse.json({ error: "Malformed log data" }, { status: 500 });
  }

  return NextResponse.json({
    id: row.id,
    taskId: row.taskId,
    conversationId: row.conversationId,
    ticketKey: row.ticketKey,
    createdAt: row.createdAt,
    log,
  });
}
