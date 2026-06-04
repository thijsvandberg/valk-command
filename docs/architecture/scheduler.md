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
    +-- deprecation-deep-scan (every 2m)
    +-- deprecation-staleness-scan (every 5m)
    +-- revalidate-deleted-tickets (every 10m)
    +-- deprecation-auto-enqueue (every 10m, opt-in)
    +-- cleanup-removed-tickets (every 24h)
    |
    v
Results returned to frontend -> SWR cache invalidation
```

## Components

### Task Registry (`src/lib/scheduler.ts`)

Central scheduler with task registration, persistence, and tick execution.

**`defineTask(name, label, description, intervalMs, handler, enabledByDefault = true)`**

Registers a task with the scheduler. If a task with the same name exists, it is updated. Each task has:
- `name`: Unique identifier
- `label`: Human-readable name for the settings UI
- `description`: Short description of what the task does
- `intervalMs`: Minimum time between runs
- `handler`: Async function that performs the work
- `enabledByDefault`: Whether the task runs when no persisted override exists (default `true`)

**Persisted enable/disable (Backlog Deprecation Review epic)**

A task's effective enabled state is the persisted override in `app_setting` under `scheduler:<name>:enabled` (`"true"`/`"false"`) if present, otherwise its `enabledByDefault`. The DB value is the source of truth and survives restarts (the old in-memory `enabled` flag was lost on every restart). Set it via the toggle API below.

**The three deprecation scans default OFF**: `deprecation-staleness-scan`, `deprecation-deep-scan`, and `deprecation-auto-enqueue` register with `enabledByDefault: false`. WHY: they run continuously and consume agent/scan budget, so the PO opts in from the Cleanup page rather than having them run out of the box. All other tasks keep defaulting to enabled. Once the PO enables a task via the toggle API, the persisted setting wins.

**`tick()`**

Iterates all registered tasks, checks each task's effective enabled state (persisted-or-default) and whether enough time has elapsed since the last run, then executes overdue, enabled tasks sequentially. Disabled tasks are skipped. Returns which tasks ran and their results.

- Concurrent tick prevention via `tickRunning` flag
- Last-run timestamps stored in `app_setting` as `scheduler:<name>:last_run`
- Last results stored as `scheduler:<name>:last_result`
- Failed tasks log to console but do not block other tasks

**`setTaskEnabled(name, enabled)`**

Persists a task's enabled override to `app_setting`. Returns `false` when `name` is not a registered task (so the toggle API can return 404 instead of writing orphan rows).

**`runTaskNow(name)`**

Runs a task immediately, bypassing both the interval check AND the enabled check. WHY: a manual trigger is an explicit PO action and must work even when the task is disabled (manual override). Returns the `TaskResult`, or `null` if no task with that name exists.

**`getTaskStatuses()`**

Returns current status of all tasks for the settings UI. The `enabled` field reflects the effective (persisted-or-default) value so the UI renders the toggle in its real state.

### Task Toggle API (`src/app/api/scheduler/tasks/route.ts`)

- `POST /api/scheduler/tasks` with body `{ name, enabled }` — validates the task name and persists the enabled override. Returns `{ name, enabled }`, or 404 for an unknown task, 400 for an invalid body.
- `GET /api/scheduler/tasks` — convenience read of `getTaskStatuses()` as `{ tasks }`. The canonical status feed remains `GET /api/scheduler/tick`.

### Manual Trigger API (`src/app/api/scheduler/run/[name]/route.ts`)

- `POST /api/scheduler/run/<name>` — runs the named task now via `runTaskNow`, regardless of its enabled state. Returns `{ ran: true, result }`, or `{ error: "Task not found" }` with 404.

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

#### Backlog Staleness Scan (every 5m)

Tier-1 of the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md) (BRDG-297). A cheap, local, no-AI pass that ranks how likely each backlog ticket is obsolete and records when it was last scanned. It only writes the local-only scan-state fields on `ticketMetadata` (`scanScores.staleness`, `scanOverall`, `scanRationale`, `lastScannedAt`); it never writes to Jira.

**Scope**: backlog tickets only — those with no sprint (`sprint_name = ''`, the canonical local backlog marker) and not removed from Jira. This covers both board backlogs.

**Scorer** (`src/lib/deprecation-staleness.ts`): pure, deterministic `scoreStaleness()` over four signals, returning a normalized 0..1 score plus a plain English rationale:

| Signal | Weight | Notes |
|--------|--------|-------|
| Age / inactivity | 0.50 | Ramped from 90-day floor to 540-day ceiling using **effective last activity** = `max(jiraUpdatedAt, lastCommentAt)`. A recently-commented ticket is not penalised for an old `jiraUpdatedAt`. |
| Never in a sprint | 0.25 | Fires when `sprintName` is empty/null. |
| Backlog-like status | 0.15 | Case-insensitive match against "backlog", "to do", etc. |
| Empty PO metadata | 0.10 | No readiness/score/notes/priority set. |

**Epic dampener**: if the ticket has a linked `epicKey` and that epic's effective last activity (also `max(epicJiraUpdatedAt, epicLatestComment)`) is within 180 days, the age component is reduced by up to `0.5 * 0.4 = 0.2`. WHY a cap at 40 %: epic activity is a soft, indirect signal — a large ongoing epic might simply never revisit its backlog children. The dampener nudges, never hides.

**Scorer inputs** (`StalenessInput`): `jiraUpdatedAt`, `sprintName`, `status`, `hasPoMetadata`, `lastCommentAt?`, `epicLastActivityAt?`. The last two are optional and degrade gracefully to `jiraUpdatedAt`-only when absent.

**Task flow**:
1. Loads in-scope backlog tickets joined with their metadata (including `epicKey`)
2. Selects the 25 with the oldest `lastScannedAt` (never-scanned first) via `selectScanBatch()` (`src/lib/deprecation-scan-batch.ts`)
3. Gathers comment + epic activity for the batch in two bulk `GROUP BY` queries (no N+1)
4. Scores each ticket passing the pre-computed `lastCommentAt` and `epicLastActivityAt`, and upserts the staleness fields, stamping `lastScannedAt = now` so the batch rotates to the back of the queue (continuous re-evaluation, wraps around)
5. Writes a rolling cursor to `app_setting` key `scheduler:deprecation-staleness-scan:cursor` (informational; the authoritative rotation state is each ticket's own `lastScannedAt`, so it resumes cleanly across restarts)
6. Logs a run summary to `activity_log` (`type = deprecation-scan`)

#### Backlog Deep Scan (every 2m)

Tier-2 of the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md) (BRDG-284). The orchestration backbone for the expensive, selective deep dive: it drains a persisted queue a small batch at a time and runs every registered topic scorer. The actual topic logic ships in BRDG-285..288; this task and the registry are topic-agnostic.

**Persisted queue** (`deprecation_scan_queue` table, helpers in `src/lib/deprecation-scan-queue.ts`): durable, observable, and resumes across restarts (unlike the in-memory revalidation queue). Status lifecycle `pending -> running -> done | error`. A unique index over a nullable `active_key` column (mirrors `jira_key` while pending/running, `NULL` once done/error) enforces idempotent enqueue: at most one active row per ticket, while completed rows can accumulate so a ticket can be re-queued later.

**Topic-scorer registry** (`src/lib/deprecation-topics.ts`) — the extension point:
- `DeprecationTopicScorer`: `{ key, label, weight?, maxContribution?, run(ticket, ctx) => Promise<{ score, evidence?, rationale? } | null> }`. Returning `null` abstains.
- `registerTopicScorer(scorer)` / `getTopicScorers()`. Each topic story registers itself at import time and never touches the runner.
- `runDeepScan(jiraKey, ctx?)`: loads the ticket, runs all registered scorers, merges each result into `scanScores[topicKey]` (preserving Tier-1 staleness), recomputes `scanOverall` via `combineTopicScores`, promotes `disposition` to `"candidate"` on threshold (`DEEP_SCAN_CANDIDATE_THRESHOLD = 0.6`, never downgrading a human confirmed/dismissed), and stamps `lastDeepScannedAt`.
- **Score combination**: weighted average where each topic's contribution to the numerator is capped at `maxContribution` (default = `weight`), divided by the sum of weights of topics that actually scored. WHY cap-then-normalize: a plain sum lets weak signals stack to a false-high; a plain max ignores corroboration. The per-topic cap is the hook subjective topics (e.g. relevance decay, BRDG-288) use so a single soft signal can never alone cross the candidate threshold.

**Task flow** (`runDeprecationDeepScan`):
1. Requeues any rows stuck in `running` from a prior crash back to `pending`
2. Claims up to 5 oldest `pending` rows (FIFO), marking them `running`
3. For each: skips and completes tickets whose dismiss cooldown (`disposition_until`) is still active; otherwise calls `runDeepScan` and marks `done`/`error`
4. Logs a batch summary to `activity_log` (`type = deprecation-scan`)

**Selection + enqueue** is done via `POST /api/cleanup/deep-scan` (methods `keys` | `worst-staleness` | `oldest`, idempotent), with `GET` returning queue-status counts for the /cleanup batch-progress indicator. Pure selection ordering lives in `src/lib/deprecation-deep-scan-selection.ts` (excludes dismissed tickets still in cooldown for the ranked methods).

#### Auto Background Deep Scan (every 10m, opt-in) (BRDG-290)

An optional hands-off policy that auto-enqueues up to N tickets per day without PO intervention. Off by default; toggled from the /cleanup view.

**Settings** (stored in `app_setting`):
- `deprecation-auto-scan:enabled` — `"true"` | `"false"` (default false)
- `deprecation-auto-scan:daily-count` — integer string (default 10)
- `deprecation-auto-scan:budget:<YYYY-MM-DD>` — per-day enqueue counter; resets naturally as the date suffix rolls over

**API**: `GET /api/cleanup/auto-scan-settings` and `POST /api/cleanup/auto-scan-settings` — read and update enabled + dailyCount.

**Two gates, one switch (BRDG-298).** Auto enqueue is gated by BOTH the scheduler task-enabled flag (`scheduler:deprecation-auto-enqueue:enabled`) and the `deprecation-auto-scan:enabled` setting above. To avoid two competing toggles in the UI, the /cleanup "Scans" popover shows ONE auto on/off and writes BOTH flags in lock-step (`scheduler.setTaskEnabled` + `autoScanSettings.update({ enabled })`). The displayed effective state reads from the scheduler task feed (`GET /api/scheduler/tasks`), which is the source of truth; the daily-count input remains backed by `auto-scan-settings`. Keeping both consistent means neither gate can silently block the other.

**Task flow** (`runAutoEnqueue` in `scheduled-tasks.ts`):
1. Reads `enabled`; returns immediately (skipped) if off
2. Reads `dailyCount` and today's budget counter
3. If budget already exhausted, returns skipped
4. Loads eligible backlog (same definition: no sprint, not removed)
5. Applies `worst-staleness` ordering via `selectDeepScanKeys()` from `deprecation-deep-scan-selection.ts` (the shared helper), capped at remaining budget
6. Enqueues idempotently with source `"auto"` via `enqueueDeepScan()`
7. Increments the day counter; logs to `activity_log`

**Why worst-staleness**: surfaces the most actionable candidates first — identical to what the PO would pick manually via the top-10 quick-action button — making auto mode immediately useful without extra tuning.

**UI**: On the /cleanup controls bar, a compact toggle pill + count input appear alongside the queue progress indicator. Status text reads "Auto: ON / N / day" (with brand-colored ON) or "Auto: off".

**Topic registration**: shipped topic scorers self-register via a side-effect barrel `src/lib/topics/index.ts`, imported once from `scheduled-tasks.ts` so every topic is in the registry before `runDeepScan` runs. Later topics add one import line there.

**Shipped topics:**

- **Replaced / obsolete area** (`replaced`, BRDG-285, `src/lib/topics/replaced-area-topic.ts`). The first real Tier-2 topic, weight 1, no cap (an AI-confirmed retired-area match is an objective signal that may promote on its own). Pipeline:
  1. Load the editable deprecated-area list from `deprecated_area_keyword` (managed at `/settings/deprecated-areas`, CRUD via `/api/cleanup/deprecated-areas`).
  2. **Keyword match** (`src/lib/deprecated-area-matcher.ts`, pure): case-insensitive, word-boundary matching over title/description/labels/components; alias-aware; short-term safe (no substring false hits). No match => `run()` abstains (returns `null`). Produces a base score (title hit > body-only hit) and records matched terms as evidence.
  3. **AI confirmation** (matched tickets only): asks the workspace agent to judge whether the ticket is genuinely ABOUT the retired area vs. an incidental mention, returning a one-line rationale. Uses the reusable blocking helper `runAgentTaskToCompletion()` (`src/lib/agent-task-result.ts`) — submit `POST /api/tasks`, poll `GET /api/tasks/:id` until `status === "completed"`, parse `output`. Confirmed => score lifts to >= 0.8; incidental => collapses to 0.15.
  4. **Graceful degradation**: if the agent is unavailable/errors the scorer keeps the matcher prior at reduced confidence (capped at 0.5, marked `degraded` in evidence) and never throws out of `run()`.
  - The `EXAMPLE_RETIRED_AREA_SCORER` stub in `deprecation-topics.ts` is superseded by this scorer (same `replaced` key) and remains only as a reference template; it is not registered in production.

`runAgentTaskToCompletion()` is the shared submit-then-poll pattern for any server-side topic that needs a completed (non-streamed) agent result; BRDG-286/287/288 reuse it.

#### Revalidate Deleted Tickets (every 10m)

Detects tickets deleted from Jira that the incremental sync cannot catch (deleted tickets do not appear in "updated since" queries). Uses a view-driven queue approach:

**Queue module** (`src/lib/revalidation-queue.ts`): In-memory queue that holds ticket keys for revalidation.

- **Enqueue**: When tickets are served via `/api/tickets` (list) or `/api/tickets/[key]` (detail), their keys are added to the queue. Keys checked within the last 24 hours are skipped (cooldown).
- **Dequeue**: The scheduled task takes the 25 oldest entries from the queue.

**Task flow**:
1. Dequeues up to 25 keys from the revalidation queue
2. Bulk-checks them with a single JQL `key in (...)` call
3. For any ticket missing from the results, confirms with an individual `getIssue` call
4. If Jira returns 404, sets `removed_from_jira_at` on the ticket
5. Marks checked keys with a 24h cooldown to avoid redundant rechecks

**Result includes `queueSize`** for monitoring in the settings UI.

Only tickets that users actually view are checked, avoiding unnecessary API calls for dormant tickets.

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
| `scheduler:<name>:enabled` | `"true"` \| `"false"` | Persisted enable/disable override; absent = use the task's `enabledByDefault` |
| `jira_sync_watermark` | ISO timestamp | Incremental sync position |

## Adding New Tasks

1. Create a handler function in `src/lib/scheduled-tasks.ts`
2. Call `defineTask()` in `registerScheduledTasks()`
3. The task will automatically run on the next tick after its interval elapses
