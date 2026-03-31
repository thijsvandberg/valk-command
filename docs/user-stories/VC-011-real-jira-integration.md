# VC-011: Real Jira Integration (Read-Only)

**Status:** Not Started
**Priority:** High
**Blocked:** Jira credentials needed

## Description

Replace all mock/stub Jira data with live Jira API reads. One-directional: Jira -> valk-command only. All mock data must be removed.

## Acceptance Criteria

### Core Connection
- [ ] Configure Jira credentials (API token via env vars)
- [ ] Health check endpoint to verify Jira connectivity
- [ ] Graceful fallback when Jira is unreachable (cached data + banner)

### Data Sync (Jira -> valk-command)
- [ ] Remove all mock/stub data from sprint board, ticket detail, and related API routes
- [ ] Fetch sprints, tickets, statuses, assignees from Jira REST API v3
- [ ] Map Jira ADF (Atlassian Document Format) to rendered markdown/HTML
- [ ] Handle Jira custom fields (story points, sprint, epic link, labels, etc.)
- [ ] Sync comments (display + threading)
- [ ] Sync ticket history / changelog
- [ ] Fetch attachments and generate thumbnails
- [ ] Pagination support for large boards (100+ tickets)

### Issue Version History
- [ ] On each sync where `updated` changed: store a snapshot of the issue state in SQLite
- [ ] Snapshots include all synced fields (description, status, assignee, story points, comments, etc.)
- [ ] Browse previous versions in ticket detail History tab
- [ ] Diff between any two stored versions (integrates with existing diff view)
- [ ] Retain history even if issue is deleted/archived in Jira

### Local Editing & Conflict Resolution
- [ ] Local draft layer per issue: edits stored in SQLite, separate from synced Jira data
- [ ] Draft indicator on issues that have unpushed local changes
- [ ] On entering edit mode: background check against Jira `updated` timestamp, show warning/badge if remote is newer
- [ ] On sync: fetch latest Jira version and store as new snapshot in history (never overwrite local draft)
- [ ] If Jira version is newer than draft basis: show warning "remote version changed since your edit"
- [ ] Diff view between local draft and latest Jira version
- [ ] Manual merge flow: user decides which changes to keep

### Smart Fetching
- [ ] Store Jira `updated` timestamp per issue locally
- [ ] On issue open: compare local timestamp with Jira `updated`, only fetch full data if changed
- [ ] Sprint refresh strategy: evaluate two approaches and pick fastest
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
- [ ] Sync history: last N sync results accessible (timestamp + status + summary)
- [ ] Failed syncs stay visible until acknowledged by user
- [ ] Sync audit log: persistent trail of all sync operations (timestamp, type, scope, result, duration, error details) viewable in a dedicated panel

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
