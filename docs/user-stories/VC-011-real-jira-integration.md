# VC-011: Real Jira Integration (Read-Only)

**Status:** In Progress
**Priority:** High
**Blocked:** Jira credentials needed

## Description

Replace all mock/stub Jira data with live Jira API reads. One-directional: Jira -> valk-command only. All mock data must be removed.

## Acceptance Criteria

### Core Connection
- [ ] Configure Jira credentials (API token via env vars)
- [x] Health check endpoint to verify Jira connectivity (`GET /api/jira/health`)
- [ ] Graceful fallback when Jira is unreachable (cached data + banner)

### Data Sync (Jira -> valk-command)
- [ ] Remove all mock/stub data from sprint board, ticket detail, and related API routes
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
- [ ] On entering edit mode: background check against Jira `updated` timestamp, show warning/badge if remote is newer
- [ ] On sync: fetch latest Jira version and store as new snapshot in history (never overwrite local draft)
- [ ] If Jira version is newer than draft basis: show warning "remote version changed since your edit"
- [ ] Diff view between local draft and latest Jira version
- [ ] Manual merge flow: user decides which changes to keep

### Smart Fetching
- [x] Store Jira `updated` timestamp per issue locally (`jiraUpdatedAt` column)
- [ ] On issue open: compare local timestamp with Jira `updated`, only fetch full data if changed
- [x] Sprint refresh strategy: both bulk and timestamp-first implemented (`?strategy=bulk|timestamp-first`)
  - **A) Bulk fetch:** single JQL query fetching all sprint issues with full fields. Simple, one round-trip, but transfers unchanged data. Better for small sprints or first sync.
  - **B) Timestamp-first:** first call fetches only `key` + `updated` for all sprint issues (minimal fields, fast response). Compare against local timestamps. Second call fetches full data only for issues where remote `updated` > local `updated`. Two round-trips but transfers less data. Better for large sprints with few changes.
  - **Decision criteria:** measure both against real Jira instance with varying sprint sizes (10, 30, 80+ issues) and change ratios (10%, 50%, 90% changed). Pick default strategy, allow override per sync.
- [ ] Visual indicator when local data is stale vs fresh

### Real-time Inbound Updates
- [ ] Webhook receiver (`POST /api/jira/webhook`) for ticket changes, comments, status transitions
- [ ] Webhook signature validation
- [ ] Deduplication of webhook events vs polling data

### Sync Feedback (app-level)
- [ ] Persistent sync indicator visible across all views (sidebar or topbar)
- [ ] Show active sync state: what is syncing (sprint / single ticket / full refresh)
- [ ] Show result after completion: success (with count) or failure (with reason)
- [x] Sync history: last N sync results accessible (`GET /api/sync-log`)
- [ ] Failed syncs stay visible until acknowledged by user
- [x] Sync audit log: syncLog table + API (`GET /api/sync-log`, `POST /api/sync-log/:id/acknowledge`)

### Error Handling & Resilience
- [ ] Rate limiting / throttling for Jira API calls
- [ ] Retry with exponential backoff on transient failures
- [ ] User-facing error toasts on sync failures

## Technical Notes

- Extend existing `src/lib/jira-client.ts` with real implementation
- Jira REST API v3 (read-only scopes)
- Env vars: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- ADF-to-markdown: `@atlaskit/adf-utils` or custom lightweight mapper
- PO metadata (readiness scores, notes, review) stays local in SQLite, only Jira fields come from API

## Dependencies

- Jira API credentials (blocked)
