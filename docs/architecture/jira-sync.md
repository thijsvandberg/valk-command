# Jira Sync Architecture

How valk-command reads data from Jira and keeps it fresh.

## Overview

Data flows one-directionally: Jira -> valk-command. The app syncs Jira data into a local SQLite database and serves it from there. PO metadata (readiness scores, notes, local edits) is stored locally alongside the synced Jira data but never pushed back to Jira.

## Sync Strategies

### Incremental Sync (primary)

Watermark-based background sync that runs automatically every 150 seconds while the app is active. Covers the entire VPL project, not limited to a single sprint.

**How it works:**
1. Reads a watermark (highest `updated` timestamp from the last sync) from `app_setting`
2. Queries Jira: `project = VPL AND updated > "{watermark}" ORDER BY updated ASC` with `fields=key,updated` (1 API call)
3. Compares returned timestamps with local `jiraUpdatedAt` to skip already-synced tickets
4. Fetches full data for stale tickets, capped at 50 per run (1 API call per 100 tickets)
5. Upserts each ticket via shared `upsertIssue()`, advancing the watermark after each success
6. If there are more than 50 stale tickets, the remainder is picked up in the next cycle

**Key properties:**
- Watermark advances progressively per ticket, so partial failures resume cleanly
- Cap of 50 per run protects against rate limits
- Server-side 120s cooldown prevents rapid re-fires; cooldown resets on failure so the next poll is not blocked
- Cancellable via the abort registry (same pattern as sprint/ticket sync)
- Only logs to activity_log when tickets are actually synced (count > 0)
- Status tracked client-side via `useIncrementalSync` hook and shown in SyncIndicator banner
- First sync requires a watermark set by a full sprint sync; without it returns `needsFullSync: true`

**Date format:** Jira JQL requires `"yyyy-MM-dd HH:mm"` format (minute precision only). The watermark (stored as ISO 8601) is converted before querying and shifted back by 1 minute to prevent missing tickets updated within the same minute as the watermark. The local timestamp comparison deduplicates any overlap.

**Sprint metadata refresh:** The incremental sync also refreshes sprint metadata (state, goal, dates) on a separate 5-minute cooldown (`jira_sprint_sync_watermark`). Uses `getSprintsLightweight()` which calls the Agile board endpoint (`/rest/agile/1.0/board/{boardId}/sprint?state=active,future`) for a single API call when boardId is configured, falling back to the JQL-based `getSprints()` otherwise. State transitions (e.g., future -> active) are detected and logged to `activity_log`. The response includes `sprintMetaRefreshed: boolean` so the client can revalidate the sprint list via SWR. Sprint refresh failures are non-blocking and never affect ticket sync.

### Sprint Sync (manual/on-demand)

Full sync of all tickets in a specific sprint. Used for initial data load and manual refresh.

**Bulk** (default): Single JQL query fetches all sprint issues with full fields. Simple, one round-trip. Best for small sprints or first sync.

**Timestamp-first**: Two passes. First fetches only `key` + `updated` for all sprint issues, compares against local `jiraUpdatedAt`. Second pass fetches full data only for changed issues. Better for large sprints with few changes.

Both strategies set the incremental sync watermark after completion, enabling automatic incremental sync going forward.

### Single-ticket Sync

Triggered on ticket detail open. `useTicketDetail` returns cached data immediately, then runs a background freshness check via `/api/jira/check-updated`. If stale, triggers a single-ticket sync.

## Components

### Jira Client (`src/lib/jira-client.ts`)

Low-level HTTP client for the Jira REST API v3 via the Atlassian API gateway (`api.atlassian.com`).

- Auth: Basic (email + API token), not Bearer
- Endpoint: `/rest/api/3/search/jql` with token-based pagination (`nextPageToken` + `isLast`)
- Rate limiting: max 10 concurrent requests via semaphore queue
- Retry: exponential backoff (1s / 2s / 4s) on 429 and 5xx, respects `Retry-After` header, max 3 retries
- Returns empty arrays when credentials are absent so the app can run without a Jira connection

**Key methods:**
- `getUpdatedSince(watermark)` -- project-wide query for tickets updated after watermark (incremental sync)
- `getSprintIssues(sprintId)` -- fetch all issues for a sprint via JQL
- `getSprintTimestamps(sprintId)` -- lightweight key+updated fetch for timestamp-first sync
- `getIssuesByKeys(keys[])` -- batch fetch by key list
- `searchIssues(jql, fields?, maxResults?)` -- ad-hoc JQL search, used by `GET /api/search/jira`
- `getSprintsLightweight()` -- fetch active+future sprints via Agile board endpoint (1 API call) with fallback to JQL
- `checkJiraHealth()` -- lightweight connectivity check (1-result search, no `/myself`)
- `updateSprint(id, fields)` / `createSprint(params)` / `closeSprint(id)` -- sprint write operations via the Agile API (`write:sprint:jira-software` scope). `closeSprint` PUTs `{ state: "closed" }`; the route then flips the cached sprint state to `closed` so the board updates without a full sync.

### Shared Upsert Logic (`src/lib/upsert-issue.ts`)

Extracted upsert function shared between sprint sync and incremental sync. Pre-reads current state, fetches changelog author outside the write path, then batches all DB writes in a single SQLite transaction. Handles:
- Ticket data upsert (insert or update)
- Metadata row creation
- Story version tracking (content hash comparison, changelog author lookup)
- Attachment metadata sync
- Subtask sync (replace all)
- Issue link sync (preserves locally-created links)
- Inline comment sync

### Sync Routes (`src/app/api/jira/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jira/sync-incremental` | POST | Watermark-based incremental sync (background, every 150s) |
| `/api/jira/sync-tickets` | POST | Sync all tickets for a sprint. Supports `?strategy=bulk\|timestamp-first` |
| `/api/jira/sync-sprints` | POST | Fetch and cache sprint list |
| `/api/jira/sprints/[id]/close` | POST | Close (finish) an active sprint; flips cached state to `closed` |
| `/api/jira/sync-comments` | POST | Sync comments for a ticket |
| `/api/jira/check-updated` | GET | Lightweight freshness check for a single ticket |
| `/api/jira/health` | GET | Verify Jira connectivity (lightweight search, not /myself) |

### Conflict Detection

When a user has local edits (`ticketLocalEdit` table) and the Jira version is newer than the edit's `baseJiraVersion`, a warning banner appears in the ticket detail view.

### ActivityContext (`src/contexts/ActivityContext.tsx`)

React Context that provides sync state to the entire app:

- `activityState`: idle / syncing / error (derived from activity log polling)
- `lastEntry`: most recent activity log entry
- `unacknowledgedErrors`: failed operations that haven't been dismissed
- `jiraOnline`: whether the health check is passing
- `incrementalSyncRemaining`: tickets still catching up (from useIncrementalSync)
- `incrementalSyncLastAt`: when the last incremental check ran
- `incrementalSyncLastCount`: how many tickets were synced in the last run
- `toasts`: new sync completions shown as toast notifications
- `triggerSync(type, scope)`: manually trigger a sync
- `acknowledgeError(id)`: dismiss a failed sync entry

### Incremental Sync Hook (`src/hooks/useIncrementalSync.ts`)

Client-side hook that drives the incremental sync polling:

- Calls `POST /api/jira/sync-incremental` every 150 seconds
- Runs immediately on mount, then on interval
- Pauses when tab is hidden; triggers an immediate sync on `visibilitychange` when the tab becomes visible again
- Returns `{ remaining, lastSyncAt, lastSyncCount }` for UI display
- Uses a stable ref for the callback to avoid effect re-mounting loops
- Revalidates SWR ticket caches when changes are found

### UI Components (`src/components/sync/`)

| Component | Location | Purpose |
|-----------|----------|---------|
| `SyncIndicator` | Sidebar footer | Shows sync state with three modes: checking (spinner), catching up (cloud icon + count), up to date (checkmark). Expandable panel with activity history. |
| `SyncToast` | Bottom-right overlay | Success toasts (3s auto-dismiss), error toasts (persist until dismissed) |
| `OfflineBanner` | Top of main content area | Shown when Jira health check fails, with retry button |

**SyncIndicator states:**
1. **Checking** (before first sync completes): spinning icon, "Checking..."
2. **Catching up** (remaining > 0): cloud download icon, "Catching up (N)", shows last sync time + count
3. **Up to date** (remaining = 0, checked): checkmark, "All clear", shows last check time + count
4. **Error**: warning triangle with badge count

### Activity Log

The `activity_log` table tracks sync operations:

| Column | Purpose |
|--------|---------|
| type | sprint-sync, ticket-sync, single-ticket, comment-sync, incremental-sync, ... |
| status | running, success, failed, cancelled |
| scope | What was synced (sprint ID, ticket key, ticket count) |
| summary | Human-readable result (e.g. "42 tickets synced, 155 remaining") |
| errorDetail | Error message on failure |
| durationMs | How long the sync took |
| acknowledged | Whether the user has dismissed a failure |

Incremental syncs only write to the log when tickets are actually synced (count > 0). No-op checks (everything up to date) are silent.

### SWR Hooks (`src/hooks/useSprintBoard.ts`)

| Hook | Endpoint | Interval |
|------|----------|----------|
| `useTickets(sprintId)` | `/api/tickets?sprintId=X` | 30s dedup |
| `useTicketDetail(key)` | `/api/tickets/{key}` | 30s dedup + background freshness check |
| `useJiraSprints()` | `/api/jira/sprints` | 30s dedup |
| `useActivityStatus(limit)` | `/api/activity-log?limit=N` | 10s polling |
| `useJiraHealth()` | `/api/jira/health` | 60s polling |

## Search

Sprint board search (BRDG-032) provides two search modes:

### Local search (`GET /api/search/local`)

Searches all tickets in the local SQLite database using [Fuse.js](https://www.fusejs.io/) fuzzy matching.

- Covers: `ticket`, `ticketMetadata`, `jiraComment`, `poComment`, `ticketLocalEdit` tables
- ADF descriptions and comments are stripped to plain text server-side before indexing
- Fuse.js `threshold: 0.35`, `includeMatches: true` for highlight ranges
- Field weights: `key` (1.0) > `summary` (0.8) > `localEditTitle` (0.7) > `notes/tags/labels` (0.5) > `assignee` (0.3) > `description` (0.15) > `jiraCommentBodies` (0.1)
- Returns top 25 results with `key`, `summary`, `status`, `priority`, `assignee`, `sprintName`, `labels`, `descriptionPreview` (250 chars), `score`, `matches` (character ranges for highlighting)

Used by:
- FilterBar inline search (filters current sprint table, client-side text match on key/title/assignee)
- SearchModal Local tab (full fuzzy DB search across all sprints)

### Jira search (`GET /api/search/jira`)

Queries live Jira data via `jiraClient.searchIssues()`.

- `?q=text` auto-generates: `project = VPL AND text ~ "text" ORDER BY updated DESC`
- `?jql=...` overrides the query entirely
- Returns up to 25 results: `key`, `summary`, `status`, `assignee`, `sprintName`, `url`
- Rate-limit guard: aborts previous in-flight request on new call

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `JIRA_CLOUD_ID` | Yes | Atlassian cloud instance ID |
| `JIRA_EMAIL` | Yes | Email for Basic auth |
| `JIRA_API_TOKEN` | Yes | API token for Basic auth |
| `JIRA_PROJECT_KEY` | No | Defaults to "VPL" |
| `NEXT_PUBLIC_JIRA_PROJECT_KEY` | No | Client-side copy of the project key (defaults to "VPL"). Used to linkify ticket references in descriptions (see below). |
| `JIRA_BOARD_ID` | No | Defaults to 233 |
| `JIRA_BASE_URL` | No | Fallback if JIRA_CLOUD_ID is not set |

### Ticket reference linkification in descriptions, comments, and chat

Ticket descriptions are converted from Jira ADF to a markdown string at sync time
(`src/lib/adf-to-markdown.ts`) and rendered by `renderMarkdown()`
(`src/components/ticket-detail/renderMarkdown.tsx`). When rendered on the ticket
detail page (`EditableDescription`, via `renderMarkdown(value, { linkifyRefs: true })`),
a bare project-key reference in **plain text** (e.g. `VPL-43237`) — and a full Jira
`/browse/<KEY>` link — becomes an interactive `TicketRefPill` (the elevated chip
style, `appearance="elevated"`) linking to `/tickets/<KEY>`, with ticket detail
fetched after mount (`GET /api/tickets/[key]`). The same elevated style is used for
the ticket-detail header pill. The prefix comes from `NEXT_PUBLIC_JIRA_PROJECT_KEY`.
References inside inline code, fenced code blocks, or emphasis (bold/italic/color)
are left untouched; references in plain text inside an expandable block are still
converted. Linkification is opt-in per render via the `linkifyRefs` flag.

Enabled surfaces (BRDG-247, BRDG-248, BRDG-253):

- Ticket description (`EditableDescription`) and the ticket-detail header pill.
- PO comments and Jira comments (`CommentsSection`).
- Refinement-session Jira comments (`SessionTicketView`).
- Chat message bodies (`ChatMessageParts` / `ChatMessage`).
- Version-history preview (`VersionPreview`).
- Related-stories panel (`RelatedStoriesPanel`).
- Story preview app (`StoryPreviewApp`) and draft preview app (`DraftPreviewApp`).
- Story-writer draft previews — chat draft expander + `DraftCard` (`ChatMessageParts`).

Intentionally left **off**:

- Diff pane (`DiffPane`) — pills would compete with the textual diff (BRDG-253 PO decision).
- Search results (`SearchResultParts`) — deferred to BRDG-252.
- The rich-text editor (TipTap): plain text while editing, pill when rendered. Inline
  pills while editing are intentionally not implemented (BRDG-248 PO decision).

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
    +-- getUpdatedSince(watermark) --> sync-incremental (background, 150s)
    +-- getSprintIssues(sprintId) --> sync-tickets (manual)
    +-- getIssue(key) ------------> check-updated (on ticket open)
    |
    v
upsert-issue.ts (shared)
    |
    | Upsert + snapshot + watermark advance
    v
SQLite (ticket, storyVersion, activity_log, app_setting, ...)
    |
    v
API Routes (/api/tickets, /api/activity-log)
    |
    | SWR polling + useIncrementalSync
    v
ActivityContext + UI Hooks
    |
    v
UI (SyncIndicator, SyncToast, OfflineBanner, SprintBoard, ...)
```
