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
import { safeJsonParse } from "@/lib/api-validation";
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
  /**
   * The enabled state to use when no persisted override exists in app_setting.
   * WHY: the deprecation scans (Backlog Deprecation Review epic) must NOT run
   * out of the box — they cost agent time and the PO wants them off until
   * explicitly turned on. Those tasks register with `enabledByDefault: false`;
   * everything else defaults to true so existing behavior is unchanged.
   */
  enabledByDefault: boolean;
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

/**
 * Compact, one-line outcome for a task run, used in the per-task scheduler log.
 * A task that returned `{ skipped: true, reason }` (the convention in
 * scheduled-tasks.ts) is reported as `skipped:<reason>`; a task that returned
 * `{ error }` as `error`; everything else as `ran`. WHY a summary instead of
 * dumping the whole result: a slow or silently-skipped task was invisible
 * before (BRDG-402), and the raw result objects are large and noisy.
 */
function summariseResult(result: TaskResult): string {
  if (result.skipped === true) {
    const reason = typeof result.reason === "string" ? result.reason : "unspecified";
    return `skipped:${reason}`;
  }
  if (typeof result.error === "string") return "error";
  return "ran";
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
  enabledByDefault = true,
) {
  const existing = tasks.find((t) => t.name === name);
  if (existing) {
    existing.label = label;
    existing.description = description;
    existing.intervalMs = intervalMs;
    existing.handler = handler;
    existing.enabledByDefault = enabledByDefault;
    return;
  }
  tasks.push({ name, label, description, intervalMs, handler, enabledByDefault });
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

/**
 * Effective enabled state for a task: the persisted override in app_setting
 * (key "scheduler:<name>:enabled" = "true"/"false") if present, otherwise the
 * task's `enabledByDefault`. WHY persisted: in-memory `enabled` was lost on
 * every restart, so the PO's on/off choice never stuck. The DB value is the
 * source of truth and survives restarts.
 */
async function isTaskEnabled(task: ScheduledTaskDef): Promise<boolean> {
  const row = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, settingKey(task.name, "enabled")),
  });
  if (row?.value === "true") return true;
  if (row?.value === "false") return false;
  return task.enabledByDefault;
}

/**
 * Persist a task's enabled override. Returns false when the task name is not
 * registered so callers (the toggle API) can return a 404 instead of silently
 * creating orphan settings rows.
 */
export async function setTaskEnabled(name: string, enabled: boolean): Promise<boolean> {
  const task = tasks.find((t) => t.name === name);
  if (!task) return false;
  const key = settingKey(name, "enabled");
  const value = enabled ? "true" : "false";
  await db.insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
  return true;
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
  let skippedDue = 0;

  try {
    for (const task of tasks) {
      if (!(await isTaskEnabled(task))) continue;

      const lastRun = await getLastRun(task.name);
      const elapsed = Date.now() - lastRun;

      if (elapsed >= task.intervalMs) {
        await setLastRun(task.name);
        // Date.now() bounds the run; this is normal app code so a wall clock is
        // fine here. The duration turns a "the sync stalled" report from guesswork
        // into a number that is greppable per task (BRDG-402).
        const startedAtMs = Date.now();
        try {
          const result = await task.handler();
          ran.push(task.name);
          results[task.name] = result;
          await setLastResult(task.name, result);
          logger.info("scheduler", `task "${task.name}" ${summariseResult(result)}`, {
            event: "scheduler_task_ran",
            task: task.name,
            durationMs: Date.now() - startedAtMs,
            outcome: summariseResult(result),
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          logger.error("scheduler", `task "${task.name}" failed:`, err);
          logger.info("scheduler", `task "${task.name}" error`, {
            event: "scheduler_task_ran",
            task: task.name,
            durationMs: Date.now() - startedAtMs,
            outcome: "error",
          });
          await setLastResult(task.name, { error: errMsg });
          createNotification(
            "scheduler",
            `Scheduled task "${task.label}" failed: ${errMsg}`,
            { category: "scheduler" },
          );
        }
      } else {
        skippedDue++;
      }
    }
  } finally {
    tickRunning = false;
  }

  // One debug line per tick so the cadence is observable without flooding info
  // when nothing is due (the common case): how many tasks were checked, how many
  // actually ran, how many were not yet due.
  logger.debug("scheduler", "tick complete", {
    event: "scheduler_tick",
    checked: tasks.length,
    ran: ran.length,
    notDue: skippedDue,
  });

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
    // Mirror tick()'s catch (BRDG-401): a manually triggered run that fails must
    // leave a server-side trace, not just a stored error result the route used to
    // report back as a 200 "ran:true".
    logger.error("scheduler", `task "${task.name}" failed on manual run:`, err);
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
      // Report the effective (persisted-or-default) value so the UI renders the
      // toggle in its real state, not the transient in-memory flag.
      enabled: await isTaskEnabled(task),
      lastRunAt: lastRunRow?.value ?? null,
      lastResult: safeJsonParse<TaskResult | null>(lastResultRow?.value, null, "scheduler"),
    });
  }

  return statuses;
}
