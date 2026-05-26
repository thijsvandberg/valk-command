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

  // Look up the task in Bridge's local DB
  const task = await db.query.workspaceTask.findFirst({
    where: (t, { eq: eq_ }) => eq_(t.id, id),
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Skip if already completed
  if (task.status === "completed") {
    return NextResponse.json({ ok: false, reason: "already_completed" });
  }

  // Skip if already cancelled
  if (task.status === "cancelled") {
    return NextResponse.json({ ok: true });
  }

  // Best-effort: try to cancel on the agent side
  try {
    await agentFetch(`/api/tasks/${id}`, { method: "DELETE", retries: 0 });
  } catch {
    // Agent may be unreachable or task already done
  }

  // Mark workspace task as cancelled in Bridge DB
  await db.update(workspaceTask)
    .set({ status: "cancelled", completedAt: new Date().toISOString() })
    .where(eq(workspaceTask.id, id));

  // Mark related messages as cancelled
  if (task.conversationId) {
    // Mark assistant message(s) linked to this task
    await db.update(message)
      .set({ cancelled: true })
      .where(eq(message.workspaceTaskId, id));

    // Mark the user message that triggered this task (the last user message before the assistant reply)
    const lastUserMsg = await db
      .select()
      .from(message)
      .where(
        and(
          eq(message.conversationId, task.conversationId),
          eq(message.role, "user"),
        ),
      )
      .orderBy(desc(message.timestamp))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (lastUserMsg && !lastUserMsg.cancelled) {
      await db.update(message)
        .set({ cancelled: true })
        .where(eq(message.id, lastUserMsg.id));
    }
  }

  return NextResponse.json({ ok: true });
}
