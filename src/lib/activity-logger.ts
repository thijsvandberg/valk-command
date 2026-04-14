import { db } from "@/db";
import { activityLog } from "@/db/schema";
import type { ActivityLogType } from "@/types/ticket";

/**
 * Logs a completed activity entry. For instant actions (not long-running),
 * creates a single entry with the given status and optional error detail.
 *
 * Pass `durationMs` and `startedAt` when the caller measures the operation
 * duration (e.g. agent round-trips). Both default to zero/now when omitted.
 */
export async function logActivity(opts: {
  type: ActivityLogType;
  scope?: string | null;
  summary?: string | null;
  status?: "success" | "failed";
  errorDetail?: string | null;
  durationMs?: number;
  startedAt?: string;
}) {
  const now = new Date().toISOString();
  await db.insert(activityLog).values({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type,
    scope: opts.scope ?? null,
    status: opts.status ?? "success",
    summary: opts.summary ?? null,
    errorDetail: opts.errorDetail ?? null,
    durationMs: opts.durationMs ?? 0,
    startedAt: opts.startedAt ?? now,
    completedAt: now,
  });
}
