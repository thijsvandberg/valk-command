/**
 * Scheduler task management API (Backlog Deprecation Review epic).
 *
 * POST persists a per-task enabled override in app_setting so the PO can turn
 * scheduled tasks (notably the three deprecation scans, which default OFF) on
 * and off, with the choice surviving restarts. GET returns the current effective
 * statuses for convenience; the canonical status feed remains GET
 * /api/scheduler/tick.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { setTaskEnabled, getTaskStatuses } from "@/lib/scheduler";
import { registerScheduledTasks } from "@/lib/scheduled-tasks";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

// Register all tasks on module load so the name validation in setTaskEnabled
// has the full registry to check against.
registerScheduledTasks();

const bodySchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean(),
});

export async function GET() {
  const tasks = await getTaskStatuses();
  return NextResponse.json({ tasks }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = bodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }
  const { name, enabled } = validation.data;

  const ok = await setTaskEnabled(name, enabled);
  if (!ok) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ name, enabled });
}
