import { db } from "@/db";
import { activityLog } from "@/db/schema";
import type { ActivityLogType } from "@/types/ticket";

/**
 * Logs a completed activity entry. For instant actions (not long-running),
 * creates a single entry with success status and duration.
 */
export async function logActivity(opts: {
  type: ActivityLogType;
  scope?: string | null;
  summary?: string | null;
}) {
  const now = new Date().toISOString();
  await db.insert(activityLog).values({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type,
    scope: opts.scope ?? null,
    status: "success",
    summary: opts.summary ?? null,
    durationMs: 0,
    startedAt: now,
    completedAt: now,
  });
}
