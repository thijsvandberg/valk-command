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
 */
export async function GET() {
  const { getTaskStatuses } = await import("@/lib/scheduler");
  const statuses = await getTaskStatuses();
  return NextResponse.json({ tasks: statuses });
}
