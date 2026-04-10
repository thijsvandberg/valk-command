import { NextResponse } from "next/server";
import { tick } from "@/lib/scheduler";
import { registerScheduledTasks } from "@/lib/scheduled-tasks";

// Register all system tasks on module load
registerScheduledTasks();

/**
 * POST /api/scheduler/tick
 *
 * Lazy-cron endpoint: the frontend calls this on every page load,
 * navigation, and periodically (every 30s). The scheduler checks
 * which tasks are overdue and runs them.
 */
export async function POST() {
  const result = await tick();
  return NextResponse.json(result);
}

/**
 * GET /api/scheduler/tick
 *
 * Returns status of all registered tasks (for the settings page).
 * Merges shared scheduler tasks with independently registered tasks
 * so the admin UI discovers everything automatically.
 */
export async function GET() {
  const { getTaskStatuses } = await import("@/lib/scheduler");
  const { getIndependentTaskStatuses } = await import("@/lib/task-registry");

  // Force-import tick routes so their registerIndependentTask() calls execute
  await import("@/app/api/pipelines/tick/route");

  const shared = await getTaskStatuses();
  const independent = getIndependentTaskStatuses();
  return NextResponse.json({ tasks: [...shared, ...independent] });
}
