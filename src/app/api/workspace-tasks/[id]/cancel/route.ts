import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceTask, message } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { agentFetch } from "@/lib/agent-fetch";
import { validatePathParam } from "@/lib/api-validation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  // Best-effort: try to cancel on the agent side
  try {
    await agentFetch(`/api/tasks/${id}`, { method: "DELETE", retries: 0 });
  } catch {
    // Agent may be unreachable or task already done
  }

  // Update workspace_task row if it exists in Bridge DB (regular chat tasks)
  const task = await db.query.workspaceTask.findFirst({
    where: (t, { eq: eq_ }) => eq_(t.id, id),
  });

  if (task) {
    if (task.status === "completed") {
      return NextResponse.json({ ok: false, reason: "already_completed" });
    }
    if (task.status !== "cancelled") {
      await db.update(workspaceTask)
        .set({ status: "cancelled", completedAt: new Date().toISOString() })
        .where(eq(workspaceTask.id, id));
    }
  }

  // Mark assistant messages linked to this task as cancelled
  await db.update(message)
    .set({ cancelled: true })
    .where(eq(message.workspaceTaskId, id));

  // Find the conversation from either the task row or from a linked message
  const conversationId = task?.conversationId
    ?? (await db.select({ cid: message.conversationId })
        .from(message)
        .where(eq(message.workspaceTaskId, id))
        .limit(1)
        .then((rows) => rows[0]?.cid ?? null));

  // Mark the last user message in the conversation as cancelled
  if (conversationId) {
    const lastUserMsg = await db
      .select()
      .from(message)
      .where(
        and(
          eq(message.conversationId, conversationId),
          eq(message.role, "user"),
          eq(message.cancelled, false),
        ),
      )
      .orderBy(desc(message.timestamp))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (lastUserMsg) {
      await db.update(message)
        .set({ cancelled: true })
        .where(eq(message.id, lastUserMsg.id));
    }
  }

  return NextResponse.json({ ok: true });
}
