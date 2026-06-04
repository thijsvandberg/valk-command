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

#### Backlog Staleness Scan (every 5m)

Tier-1 of the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md) (BRDG-282). A cheap, local, no-AI pass that ranks how likely each backlog ticket is obsolete and records when it was last scanned. It only writes the local-only scan-state fields on `ticketMetadata` (`scanScores.staleness`, `scanOverall`, `scanRationale`, `lastScannedAt`); it never writes to Jira.

**Scope**: backlog tickets only — those with no sprint (`sprint_name = ''`, the canonical local backlog marker) and not removed from Jira. This covers both board backlogs.

**Scorer** (`src/lib/deprecation-staleness.ts`): pure, deterministic `scoreStaleness()` over `jiraUpdatedAt` (age ramp), sprint membership (never scheduled), backlog-like status, and empty PO metadata. Returns a normalized 0..1 score plus a plain English rationale.

**Task flow**:
1. Loads in-scope backlog tickets joined with their metadata
2. Selects the 25 with the oldest `lastScannedAt` (never-scanned first) via `selectScanBatch()` (`src/lib/deprecation-scan-batch.ts`)
3. Scores each and upserts the staleness fields, stamping `lastScannedAt = now` so the batch rotates to the back of the queue (continuous re-evaluation, wraps around)
4. Writes a rolling cursor to `app_setting` key `scheduler:deprecation-staleness-scan:cursor` (informational; the authoritative rotation state is each ticket's own `lastScannedAt`, so it resumes cleanly across restarts)
5. Logs a run summary to `activity_log` (`type = deprecation-scan`)

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
| `jira_sync_watermark` | ISO timestamp | Incremental sync position |

## Adding New Tasks

1. Create a handler function in `src/lib/scheduled-tasks.ts`
2. Call `defineTask()` in `registerScheduledTasks()`
3. The task will automatically run on the next tick after its interval elapses
