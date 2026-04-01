# VC-011: Real Jira Integration (Read-Only)

**Status:** In Progress (Phase 5 done, remaining items are nice-to-have / future work)
**Priority:** High

## Description

Replace all mock/stub Jira data with live Jira API reads. One-directional: Jira -> valk-command only. All mock data must be removed.

## Acceptance Criteria

### Core Connection
- [x] Configure Jira credentials (API token via env vars)
- [x] Health check endpoint to verify Jira connectivity (`GET /api/jira/health`)
- [x] Graceful fallback when Jira is unreachable (cached data + banner)

### Data Sync (Jira -> valk-command)
- [x] Remove all mock/stub data from sprint board, ticket detail, and related API routes
- [x] Fetch sprints, tickets, statuses, assignees from Jira REST API v3
- [x] Map Jira ADF (Atlassian Document Format) to rendered markdown/HTML
- [x] Handle Jira custom fields (story points, sprint, epic link, labels, etc.)
- [x] Sync comments (display + threading) via `POST /api/jira/sync-comments`
- [x] Sync ticket history / changelog (storyVersion snapshots on content change)
- [x] Fetch attachments and generate thumbnails (metadata sync, no file download)
- [x] Pagination support for large boards (100+ tickets)

### Issue Version History
- [x] On each sync where `updated` changed: store a snapshot of the issue state in SQLite
- [x] Snapshots include all synced fields (description, status, assignee, story points, comments, etc.)
- [ ] Browse previous versions in ticket detail History tab
- [ ] Diff between any two stored versions (integrates with existing diff view)
- [x] Retain history even if issue is deleted/archived in Jira

### Local Editing & Conflict Resolution
- [x] Local draft layer per issue: edits stored in SQLite, separate from synced Jira data
- [ ] Draft indicator on issues that have unpushed local changes
- [x] On entering edit mode: background check against Jira `updated` timestamp, show warning/badge if remote is newer
- [ ] On sync: fetch latest Jira version and store as new snapshot in history (never overwrite local draft)
- [x] If Jira version is newer than draft basis: show warning "remote version changed since your edit"
- [ ] Diff view between local draft and latest Jira version
- [ ] Manual merge flow: user decides which changes to keep

### Smart Fetching
- [x] Store Jira `updated` timestamp per issue locally (`jiraUpdatedAt` column)
- [x] On issue open: compare local timestamp with Jira `updated`, only fetch full data if changed
- [x] Sprint refresh strategy: both bulk and timestamp-first implemented (`?strategy=bulk|timestamp-first`)
  - **A) Bulk fetch:** single JQL query fetching all sprint issues with full fields. Simple, one round-trip, but transfers unchanged data. Better for small sprints or first sync.
  - **B) Timestamp-first:** first call fetches only `key` + `updated` for all sprint issues (minimal fields, fast response). Compare against local timestamps. Second call fetches full data only for issues where remote `updated` > local `updated`. Two round-trips but transfers less data. Better for large sprints with few changes.
  - **Decision criteria:** measure both against real Jira instance with varying sprint sizes (10, 30, 80+ issues) and change ratios (10%, 50%, 90% changed). Pick default strategy, allow override per sync.
- [x] Visual indicator when local data is stale vs fresh

### Real-time Inbound Updates
Moved to VC-016 (nice to have). The app works fully without webhooks via polling and manual sync triggers.
- [ ] Webhook receiver (`POST /api/jira/webhook`) for ticket changes, comments, status transitions (see VC-016)
- [ ] Webhook signature validation (see VC-016)
- [ ] Deduplication of webhook events vs polling data (see VC-016)

### Sync Feedback (app-level)
- [x] Persistent sync indicator visible across all views (sidebar or topbar)
- [x] Show active sync state: what is syncing (sprint / single ticket / full refresh)
- [x] Show result after completion: success (with count) or failure (with reason)
- [x] Sync history: last N sync results accessible (`GET /api/sync-log`)
- [x] Failed syncs stay visible until acknowledged by user
- [x] Sync audit log: syncLog table + API (`GET /api/sync-log`, `POST /api/sync-log/:id/acknowledge`)
- [x] Dedicated sync log page with filtering (`/sync-log`)

### Error Handling & Resilience
- [x] Rate limiting / throttling for Jira API calls (max 10 concurrent)
- [x] Retry with exponential backoff on transient failures (1s/2s/4s, max 3 retries on 429/5xx)
- [x] User-facing error toasts on sync failures (persist until dismissed)

## Technical Notes

- Jira client uses Atlassian API gateway (`api.atlassian.com`) with `JIRA_CLOUD_ID`, not direct instance URL
- REST API v3 only (no Agile API), uses `search/jql` endpoint with token-based pagination
- OAuth token scopes: `read:jira-work`, `write:jira-work`
- Custom field IDs aligned with jira-mcp: sprint (`customfield_10007`), story points (`customfield_10016`), epic link (`customfield_10008`)
- Env vars: `JIRA_CLOUD_ID`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` (fallback), `JIRA_BOARD_ID`, `JIRA_PROJECT_KEY`
- ADF-to-markdown: custom lightweight mapper (`src/lib/adf-to-markdown.ts`)
- PO metadata (readiness scores, notes, review) stays local in SQLite, only Jira fields come from API
- Default board ID: 233 (BT board in Jira sprint field data)
- Freshness computation in `/api/tickets` (5-min threshold), shown as amber dot in table + "stale" badge in side panel

## Completed Work

### Phase 0: Schema Extension + Migration
- Extended `ticket` table with type, epic, flagged, reporter, description, acceptanceCriteria, jiraCreatedAt, jiraUpdatedAt, assigneeAvatar, components
- New `syncLog` table for sync audit trail
- Drizzle migrations 0003 + 0004

### Phase 1: ADF-to-Markdown + Enhanced Sync
- ADF converter (`src/lib/adf-to-markdown.ts`) with tests
- Enhanced sync-tickets route with all new columns, ADF conversion, pagination, syncLog entries
- Sprint sync with pagination
- Comment sync route
- Attachment metadata sync

### Phase 2: API Response Shaping + New Hooks
- Health check endpoint
- Shared types (`src/types/ticket.ts`)
- Enriched GET `/api/tickets` and `/api/tickets/[key]`
- SWR hooks: useTickets, useTicketDetail, useTicketVersions, useTicketComments, useTicketAttachments, useSyncStatus, useJiraHealth
- Sync log API with acknowledge endpoint

### Phase 3: Wire UI to API (Remove Mock Data)
- All 19 UI files migrated from mock imports to API hooks
- Mock data files moved to `deleted/`
- Tests updated to mock SWR hooks

### Phase 4: Smart Fetching + Conflict Detection
- `GET /api/jira/check-updated?key=X` route: lightweight freshness check against Jira
- `useTicketDetail` hook: background staleness check on ticket open, auto-resyncs stale tickets
- Freshness indicators: amber dot in TicketTable for stale tickets, "stale" badge in SidePanel
- Conflict detection: when local edits exist and Jira version is newer, shows warning banner in ticket detail
- `useConflictCheck` hook: SWR-based conflict detection for edit mode

### Phase 5: Sync Feedback UI + Polish
- SyncContext provider (`src/contexts/SyncContext.tsx`): centralized sync state, toast management, health monitoring
- SyncIndicator in sidebar: shows live sync state (idle/syncing/error), error badge with count, expandable mini-history panel
- SyncToast notifications: success toasts auto-dismiss after 3s, error toasts persist until dismissed/acknowledged
- OfflineBanner: persistent banner when Jira is unreachable with retry button
- Rate limiting in jira-client: max 10 concurrent requests via semaphore queue
- Retry with exponential backoff: 1s/2s/4s delays, max 3 retries on 429/5xx, respects Retry-After header
- Sync log page (`/sync-log`): paginated table with type and status filters
- Enhanced sync-log API: added type, status, and offset query parameters
- Sidebar: added Sync Log nav item
- Webhook receiver moved to separate VC-016 (nice to have)

### Auth + Config Fix (2026-04-01)
- Switched to Atlassian API gateway with JIRA_CLOUD_ID (matching jira-mcp auth pattern)
- Replaced Agile API with REST API v3 search/jql (OAuth scope compatibility)
- Migrated from deprecated /rest/api/3/search to /search/jql with token-based pagination
- Aligned custom field IDs with jira-mcp config
- Fixed health check (lightweight search instead of /myself)
- Fixed DB migration state mismatch (0003/0004)
- Board ID corrected to 233

## Dependencies

- ~~Jira API credentials (blocked)~~ Resolved: using shared OAuth token from jira-mcp
