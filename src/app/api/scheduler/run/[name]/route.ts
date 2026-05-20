import { NextResponse } from "next/server";
import { runTaskNow } from "@/lib/scheduler";
import { registerScheduledTasks } from "@/lib/scheduled-tasks";
import { runIndependentTaskNow } from "@/lib/task-registry";
import { validatePathParam } from "@/lib/api-validation";

// Ensure all tasks are registered
registerScheduledTasks();

/**
 * POST /api/scheduler/run/[name]
 *
 * Immediately runs a scheduled task by name, bypassing its interval check.
 * Works for both shared scheduler tasks and independent tasks.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const invalid = validatePathParam(name);
  if (invalid) return invalid;

  // Force-import independent task routes so they register themselves
  await import("@/app/api/pipelines/tick/route");

  // Try shared scheduler tasks first
  const sharedResult = await runTaskNow(name);
  if (sharedResult !== null) {
    return NextResponse.json({ ran: true, result: sharedResult });
  }

  // Try independent tasks
  const independentResult = await runIndependentTaskNow(name);
  if (independentResult !== null) {
    return NextResponse.json({ ran: true, result: independentResult });
  }

  return NextResponse.json({ error: "Task not found" }, { status: 404 });
}
