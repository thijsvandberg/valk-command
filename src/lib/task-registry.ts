/**
 * Registry for independent lazy-cron tasks.
 *
 * Tasks that run outside the shared scheduler (to avoid blocking each other)
 * register here so the System Tasks admin page can discover and display them
 * automatically. Each task provides a status fetcher that returns its current
 * state from the DB.
 */

import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface IndependentTaskStatus {
  name: string;
  label: string;
  intervalMs: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: Record<string, unknown> | null;
}

interface TaskRegistration {
  name: string;
  label: string;
  intervalMs: number;
  lastRunKey: string;
  lastResultKey: string;
}

const registry: TaskRegistration[] = [];

/**
 * Register an independent lazy-cron task so it appears in System Tasks.
 * Call this at module level in the task's tick route or lib file.
 */
export function registerIndependentTask(task: TaskRegistration) {
  if (registry.some((t) => t.name === task.name)) return;
  registry.push(task);
}

/**
 * Get status of all registered independent tasks.
 * Called by the scheduler status endpoint to merge with shared tasks.
 */
export function getIndependentTaskStatuses(): IndependentTaskStatus[] {
  return registry.map((task) => {
    const lastRunRow = db
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, task.lastRunKey))
      .get();
    const lastResultRow = db
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, task.lastResultKey))
      .get();

    return {
      name: task.name,
      label: task.label,
      intervalMs: task.intervalMs,
      enabled: true,
      lastRunAt: lastRunRow?.value ?? null,
      lastResult: lastResultRow ? JSON.parse(lastResultRow.value) : null,
    };
  });
}
