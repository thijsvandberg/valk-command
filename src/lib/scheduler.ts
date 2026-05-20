/**
 * Lazy-cron scheduler: runs registered tasks when they are due.
 *
 * Instead of real cron jobs, the frontend calls POST /api/scheduler/tick
 * on every page load / navigation / periodic interval. The server checks
 * which tasks are overdue and runs them. This way scheduled work happens
 * automatically during normal app usage without background processes.
 *
 * Task last-run timestamps are stored in app_setting with keys like
 * "scheduler:<task-name>:last_run".
 */

import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskResult {
  [key: string]: unknown;
}

export interface ScheduledTaskDef {
  name: string;
  /** Human-readable label for the settings UI */
  label: string;
  /** Short description of what this task does */
  description: string;
  /** Interval between runs in milliseconds */
  intervalMs: number;
  /** The work to perform */
  handler: () => Promise<TaskResult>;
  /** Whether this task is currently enabled */
  enabled: boolean;
}

export interface TaskStatus {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: TaskResult | null;
}

export interface TickResult {
  ran: string[];
  results: Record<string, TaskResult>;
  checked: number;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const tasks: ScheduledTaskDef[] = [];

export function defineTask(
  name: string,
  label: string,
  description: string,
  intervalMs: number,
  handler: () => Promise<TaskResult>,
) {
  const existing = tasks.find((t) => t.name === name);
  if (existing) {
    existing.label = label;
    existing.description = description;
    existing.intervalMs = intervalMs;
    existing.handler = handler;
    return;
  }
  tasks.push({ name, label, description, intervalMs, handler, enabled: true });
}

export function getRegisteredTasks(): ScheduledTaskDef[] {
  return [...tasks];
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function settingKey(taskName: string, suffix: string): string {
  return `scheduler:${taskName}:${suffix}`;
}

async function getLastRun(taskName: string): Promise<number> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, settingKey(taskName, "last_run")),
  });
  return row ? new Date(row.value).getTime() : 0;
}

async function setLastRun(taskName: string): Promise<void> {
  const key = settingKey(taskName, "last_run");
  const value = new Date().toISOString();
  await db.insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
}

async function setLastResult(taskName: string, result: TaskResult): Promise<void> {
  const key = settingKey(taskName, "last_result");
  const value = JSON.stringify(result);
  await db.insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
}

// ---------------------------------------------------------------------------
// Tick: check all tasks and run overdue ones
// ---------------------------------------------------------------------------

// Prevent concurrent tick execution
let tickRunning = false;

export async function tick(): Promise<TickResult> {
  if (tickRunning) {
    return { ran: [], results: {}, checked: tasks.length };
  }

  tickRunning = true;
  const ran: string[] = [];
  const results: Record<string, TaskResult> = {};

  try {
    for (const task of tasks) {
      if (!task.enabled) continue;

      const lastRun = await getLastRun(task.name);
      const elapsed = Date.now() - lastRun;

      if (elapsed >= task.intervalMs) {
        await setLastRun(task.name);
        try {
          const result = await task.handler();
          ran.push(task.name);
          results[task.name] = result;
          await setLastResult(task.name, result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          logger.error("scheduler", `task "${task.name}" failed:`, err);
          await setLastResult(task.name, { error: errMsg });
          createNotification(
            "scheduler",
            `Scheduled task "${task.label}" failed: ${errMsg}`,
            { category: "scheduler" },
          );
        }
      }
    }
  } finally {
    tickRunning = false;
  }

  return { ran, results, checked: tasks.length };
}

// ---------------------------------------------------------------------------
// Status: get status of all tasks (for settings UI)
// ---------------------------------------------------------------------------

export async function runTaskNow(name: string): Promise<TaskResult | null> {
  const task = tasks.find((t) => t.name === name);
  if (!task) return null;

  await setLastRun(task.name);
  try {
    const result = await task.handler();
    await setLastResult(task.name, result);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    const errResult = { error: errMsg };
    await setLastResult(task.name, errResult);
    return errResult;
  }
}

export async function getTaskStatuses(): Promise<TaskStatus[]> {
  const statuses: TaskStatus[] = [];

  for (const task of tasks) {
    const lastRunRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, settingKey(task.name, "last_run")),
    });
    const lastResultRow = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, settingKey(task.name, "last_result")),
    });

    statuses.push({
      name: task.name,
      label: task.label,
      description: task.description,
      intervalMs: task.intervalMs,
      enabled: task.enabled,
      lastRunAt: lastRunRow?.value ?? null,
      lastResult: lastResultRow ? JSON.parse(lastResultRow.value) : null,
    });
  }

  return statuses;
}
