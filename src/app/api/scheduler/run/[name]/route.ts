import { NextResponse } from "next/server";
import { runTaskNow } from "@/lib/scheduler";
import { registerScheduledTasks } from "@/lib/scheduled-tasks";
import { runIndependentTaskNow } from "@/lib/task-registry";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

// Ensure all tasks are registered
registerScheduledTasks();

// A run is honest about failure (BRDG-401): runTaskNow swallows the handler error
// and returns it as a stored { error } result, so the route used to answer 200
// "ran:true" for a failed run. Treat a result carrying a non-empty `error` string
// as a 500 so the caller (and any monitoring) sees the failure.
function resultFailed(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    typeof (result as { error?: unknown }).error === "string" &&
    (result as { error: string }).error.length > 0
  );
}

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
  const limited = await applyRateLimit("workspace");
  if (limited) return limited;

  const { name } = await params;
  const invalid = validatePathParam(name);
  if (invalid) return invalid;

  // Force-import independent task routes so they register themselves
  await import("@/app/api/pipelines/tick/route");

  // Try shared scheduler tasks first
  const sharedResult = await runTaskNow(name);
  if (sharedResult !== null) {
    const status = resultFailed(sharedResult) ? 500 : 200;
    return NextResponse.json({ ran: true, result: sharedResult }, { status });
  }

  // Try independent tasks
  const independentResult = await runIndependentTaskNow(name);
  if (independentResult !== null) {
    const status = resultFailed(independentResult) ? 500 : 200;
    return NextResponse.json({ ran: true, result: independentResult }, { status });
  }

  return NextResponse.json({ error: "Task not found" }, { status: 404 });
}
