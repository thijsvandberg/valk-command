# Scheduler Architecture

Lazy-cron scheduling system that executes background tasks during normal app usage.

## Overview

Instead of real cron jobs or background processes, the scheduler uses a "lazy-cron" pattern: the frontend triggers a tick endpoint on a regular interval, and the server checks which tasks are overdue and runs them. This ensures scheduled work happens automatically without long-running background processes.

```
Browser (useSchedulerTick)
    |
    | POST /api/scheduler/tick  (every 30s + on tab focus)
    v
Scheduler (src/lib/scheduler.ts)
    |
    | Check each registered task: elapsed >= intervalMs?
    |
    +-- incremental-sync (every 150s)
    +-- cleanup-removed-tickets (every 24h)
    |
    v
Results returned to frontend -> SWR cache invalidation
```

## Components

### Task Registry (`src/lib/scheduler.ts`)

Central scheduler with task registration, persistence, and tick execution.

**`defineTask(name, label, intervalMs, handler)`**

Registers a task with the scheduler. If a task with the same name exists, it is updated. Each task has:
- `name`: Unique identifier
- `label`: Human-readable name for the settings UI
- `intervalMs`: Minimum time between runs
- `handler`: Async function that performs the work

**`tick()`**

Iterates all registered tasks, checks if enough time has elapsed since the last run, and executes overdue tasks sequentially. Returns which tasks ran and their results.

- Concurrent tick prevention via `tickRunning` flag
- Last-run timestamps stored in `app_setting` as `scheduler:<name>:last_run`
- Last results stored as `scheduler:<name>:last_result`
- Failed tasks log to console but do not block other tasks

**`getTaskStatuses()`**

Returns current status of all tasks for the settings UI.

### Task Definitions (`src/lib/scheduled-tasks.ts`)

Self-contained task implementations. Imported once by the tick API route to register all system tasks.

#### Incremental Jira Sync (every 150s)

See [jira-sync.md](jira-sync.md) for details. Key behavior:
- Skips if Jira is not configured
- Requires a watermark from a prior full sync
- Fetches changed tickets since watermark, compares with local state
- Syncs up to 50 stale tickets per run
- Advances watermark per ticket for crash resilience
- Logs to `activity_log` only when tickets are actually synced

#### Cleanup Removed Tickets (every 24h)

Deletes tickets that have been absent from Jira for more than 7 days:
1. Finds tickets where `removed_from_jira_at` is older than 7 days
2. Deletes all related data (metadata, subtasks, links, attachments, edits, comments, versions, reviews) in a transaction
3. Invalidates search cache

### Tick API Route (`src/app/api/scheduler/tick/route.ts`)

- `POST`: Calls `tick()` and returns results
- `GET`: Returns `getTaskStatuses()` for the settings UI
- Imports `registerScheduledTasks()` at module load to ensure tasks are registered

### Client Hook (`src/hooks/useSchedulerTick.ts`)

Drives the scheduler from the browser:
- Posts to `/api/scheduler/tick` every 30 seconds
- Pauses when the tab is hidden, triggers immediately on focus
- Prevents concurrent ticks with a `runningRef` flag
- Parses incremental sync results to expose `remaining`, `lastSyncAt`, `lastSyncCount`
- Invalidates SWR caches (`/api/tickets`, `/api/activity-log`) when sync finds changes
- Calls `onSyncComplete` callback for downstream consumers

## Persistence

All scheduler state is stored in the `app_setting` table:

| Key Pattern | Value | Purpose |
|-------------|-------|---------|
| `scheduler:<name>:last_run` | ISO timestamp | When the task last executed |
| `scheduler:<name>:last_result` | JSON | Result of the last execution |
| `jira_sync_watermark` | ISO timestamp | Incremental sync position |

## Adding New Tasks

1. Create a handler function in `src/lib/scheduled-tasks.ts`
2. Call `defineTask()` in `registerScheduledTasks()`
3. The task will automatically run on the next tick after its interval elapses
