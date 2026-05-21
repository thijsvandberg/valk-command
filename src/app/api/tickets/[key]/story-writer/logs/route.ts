import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { resolveDraftKey } from "@/lib/draft-sync";
import { db } from "@/db";
import { storyWriterSession, storyWriterExecutionLog } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ logs: [] });
  }

  const logs = await db
    .select({
      id: storyWriterExecutionLog.id,
      taskId: storyWriterExecutionLog.taskId,
      createdAt: storyWriterExecutionLog.createdAt,
    })
    .from(storyWriterExecutionLog)
    .where(eq(storyWriterExecutionLog.sessionId, session.id))
    .orderBy(desc(storyWriterExecutionLog.createdAt))
    .all();

  return NextResponse.json({ logs });
}
