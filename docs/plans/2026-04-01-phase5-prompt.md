# Phase 5 Session Prompt: Sync Feedback UI + Webhook + Polish

## Context

VC-011 (Real Jira Integration) phases 0-4 are complete and committed on `dev`. The Jira connection works end-to-end with real data.

**Read these files first:**
- `docs/user-stories/VC-011-real-jira-integration.md` (story with checkboxes)
- `docs/user-stories/shimmering-prancing-panda.md` (implementation plan, Phase 5 section)

## What exists

- Jira client (`src/lib/jira-client.ts`): REST API v3 via Atlassian API gateway, Basic auth, token-based pagination
- Sync routes: `POST /api/jira/sync-tickets`, `POST /api/jira/sync-sprints`, `POST /api/jira/sync-comments`
- Check freshness: `GET /api/jira/check-updated?key=X`
- Health check: `GET /api/jira/health` (lightweight search, not /myself)
- Sync log: `GET /api/sync-log`, `POST /api/sync-log/:id/acknowledge` (syncLog table in SQLite)
- SWR hooks in `src/hooks/useSprintBoard.ts`: useTickets, useTicketDetail (with background staleness check), useJiraSprints, useSyncStatus, useJiraHealth, useConflictCheck
- Freshness UI: amber dot in TicketTable, "stale" badge in SidePanel
- Conflict detection: warning banner in ticket detail when Jira changed during local edits

## Phase 5 tasks

### 5a. SyncContext
New `src/contexts/SyncContext.tsx`: provides syncState, lastSync, unacknowledgedErrors, triggerSync(), acknowledgeError(). Wraps app layout.

### 5b. Sync indicator
New `src/components/sync/SyncIndicator.tsx`: compact widget in sidebar showing current sync state, last result, error badge. Clickable to expand sync history.
Modify `src/components/Sidebar.tsx` to include SyncIndicator.

### 5c. Sync toasts
New `src/components/sync/SyncToast.tsx`: success toasts auto-dismiss (3s), error toasts persist until dismissed.

### 5d. Offline banner
When `useJiraHealth()` returns ok: false, show persistent banner "Jira unavailable, showing cached data" with retry button. Lives in app layout (`src/app/(app)/layout.tsx`).

### 5e. Webhook receiver
New `src/app/api/jira/webhook/route.ts` (POST): validate signature (`JIRA_WEBHOOK_SECRET`), parse event type, dedup on event ID via syncLog, trigger targeted sync for affected ticket. Return 200 immediately.

### 5f. Rate limiting + retry
Enhance `src/lib/jira-client.ts`: request queue (max 10 concurrent), exponential backoff (1s/2s/4s, max 3 retries) on 429/5xx, respect Retry-After header.

### 5g. Audit log panel
New `src/app/(app)/sync-log/page.tsx` (or modal from sync indicator): paginated table of all syncLog entries, filterable by type and status.
Add route to `src/app/routes.test.tsx`.

## Key technical details

- Board ID: 233 (env var `JIRA_BOARD_ID`)
- Custom fields: sprint (`customfield_10007`), story points (`customfield_10016`), epic link (`customfield_10008`)
- API gateway: `https://api.atlassian.com/ex/jira/{JIRA_CLOUD_ID}`
- Auth: Basic (email:token), NOT Bearer
- Search endpoint: `/rest/api/3/search/jql` (NOT the deprecated `/rest/api/3/search`)
- Pagination: token-based (`nextPageToken` + `isLast`), NOT offset-based (`startAt` + `total`)
- DB: SQLite via Drizzle ORM, auto-migrates on first connection (`src/db/index.ts`)
- SyncLog table already exists with: id, type, scope, status, summary, errorDetail, durationMs, startedAt, completedAt, acknowledged

## Verification checklist

- [ ] Sync indicator in sidebar shows live status (syncing/idle/error)
- [ ] Failed sync shows persistent error toast until dismissed
- [ ] Jira offline shows banner with retry button
- [ ] Webhook receives POST, validates signature, triggers targeted sync
- [ ] Rate limiting prevents > 10 concurrent Jira requests
- [ ] Retry with backoff on 429/5xx
- [ ] Audit log page shows filterable sync history
- [ ] All tests pass, build succeeds
- [ ] Update VC-011 story checkboxes
