# Jira Sync Architecture

How valk-command reads data from Jira and keeps it fresh.

## Overview

Data flows one-directionally: Jira -> valk-command. The app syncs Jira data into a local SQLite database and serves it from there. PO metadata (readiness scores, notes, local edits) is stored locally alongside the synced Jira data but never pushed back to Jira.

## Components

### Jira Client (`src/lib/jira-client.ts`)

Low-level HTTP client for the Jira REST API v3 via the Atlassian API gateway (`api.atlassian.com`).

- Auth: Basic (email + API token), not Bearer
- Endpoint: `/rest/api/3/search/jql` with token-based pagination (`nextPageToken` + `isLast`)
- Rate limiting: max 10 concurrent requests via semaphore queue
- Retry: exponential backoff (1s / 2s / 4s) on 429 and 5xx, respects `Retry-After` header, max 3 retries
- Returns empty arrays when credentials are absent so the app can run without a Jira connection

### Sync Routes (`src/app/api/jira/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jira/sync-tickets` | POST | Sync all tickets for a sprint. Supports `?strategy=bulk\|timestamp-first` |
| `/api/jira/sync-sprints` | POST | Fetch and cache sprint list |
| `/api/jira/sync-comments` | POST | Sync comments for a ticket |
| `/api/jira/check-updated` | GET | Lightweight freshness check for a single ticket |
| `/api/jira/health` | GET | Verify Jira connectivity (lightweight search, not /myself) |

Every sync operation writes to the `syncLog` table (running -> success/failed) with duration and summary.

### Sync Strategies

**Bulk** (default): Single JQL query fetches all sprint issues with full fields. Simple, one round-trip. Best for small sprints or first sync.

**Timestamp-first**: Two passes. First fetches only `key` + `updated` for all sprint issues, compares against local `jiraUpdatedAt`. Second pass fetches full data only for changed issues. Better for large sprints with few changes.

### Smart Fetching

- Each ticket stores `jiraUpdatedAt` from Jira
- On ticket open: `useTicketDetail` returns cached data immediately, then runs a background freshness check via `/api/jira/check-updated`
- If stale: triggers a single-ticket sync and revalidates the SWR cache
- Freshness shown as amber dot in TicketTable and "stale" badge in SidePanel

### Conflict Detection

When a user has local edits (`ticketLocalEdit` table) and the Jira version is newer than the edit's `baseJiraVersion`, a warning banner appears in the ticket detail view.

### SyncContext (`src/contexts/SyncContext.tsx`)

React Context that provides sync state to the entire app:

- `syncState`: idle / syncing / error (derived from syncLog polling)
- `lastSync`: most recent syncLog entry
- `unacknowledgedErrors`: failed syncs that haven't been dismissed
- `jiraOnline`: whether the health check is passing
- `toasts`: new sync completions shown as toast notifications
- `triggerSync(type, scope)`: manually trigger a sync
- `acknowledgeError(id)`: dismiss a failed sync entry

### UI Components (`src/components/sync/`)

| Component | Location | Purpose |
|-----------|----------|---------|
| `SyncIndicator` | Sidebar footer | Shows sync state, error badge, expandable mini-history |
| `SyncToast` | Bottom-right overlay | Success toasts (3s auto-dismiss), error toasts (persist until dismissed) |
| `OfflineBanner` | Top of main content area | Shown when Jira health check fails, with retry button |

### Sync Log

The `syncLog` table tracks every sync operation:

| Column | Purpose |
|--------|---------|
| type | sprint-sync, ticket-sync, single-ticket, comment-sync, webhook |
| status | running, success, failed |
| scope | What was synced (sprint ID, ticket key) |
| summary | Human-readable result (e.g. "42 tickets synced") |
| errorDetail | Error message on failure |
| durationMs | How long the sync took |
| acknowledged | Whether the user has dismissed a failure |

API: `GET /api/sync-log` (supports `?type=`, `?status=`, `?offset=`, `?limit=`, `?unacknowledged=true`)

Full audit log page at `/sync-log` with type/status filters and pagination.

### SWR Hooks (`src/hooks/useSprintBoard.ts`)

| Hook | Endpoint | Interval |
|------|----------|----------|
| `useTickets(sprintId)` | `/api/tickets?sprintId=X` | 30s dedup |
| `useTicketDetail(key)` | `/api/tickets/{key}` | 30s dedup + background freshness check |
| `useJiraSprints()` | `/api/jira/sprints` | 30s dedup |
| `useSyncStatus(limit)` | `/api/sync-log?limit=N` | 10s polling |
| `useJiraHealth()` | `/api/jira/health` | 60s polling |
| `useConflictCheck(key)` | `/api/jira/check-updated?key=X` | 60s dedup |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `JIRA_CLOUD_ID` | Yes | Atlassian cloud instance ID |
| `JIRA_EMAIL` | Yes | Email for Basic auth |
| `JIRA_API_TOKEN` | Yes | API token for Basic auth |
| `JIRA_PROJECT_KEY` | No | Defaults to "VPL" |
| `JIRA_BOARD_ID` | No | Defaults to 233 |
| `JIRA_BASE_URL` | No | Fallback if JIRA_CLOUD_ID is not set |

## Data Flow Diagram

```
Jira Cloud
    |
    | REST API v3 (Basic auth)
    | Rate limited (max 10 concurrent)
    | Retry on 429/5xx
    v
jira-client.ts
    |
    v
Sync Routes (/api/jira/sync-*)
    |
    | Upsert + snapshot
    v
SQLite (ticket, storyVersion, syncLog, ...)
    |
    v
API Routes (/api/tickets, /api/sync-log)
    |
    | SWR polling
    v
SyncContext + UI Hooks
    |
    v
UI (SyncIndicator, SyncToast, OfflineBanner, SprintBoard, ...)
```
