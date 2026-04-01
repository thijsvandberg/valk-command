# VC-011: Real Jira Integration (Read-Only) - Implementation Plan

## Context

All UI components consume mock data from `src/components/sprint-board/mock-data.ts` and `src/components/story-diff/mock-versions.ts`. The API layer and DB schema partially exist but are incomplete. The goal is to make everything API-driven with real Jira data, add version history, smart fetching, conflict detection, sync feedback, and an audit log.

**22 files import from mock-data.ts or mock-versions.ts** (types + data). These must all be rewired.

## Phase 0: Schema Extension + Migration

Extend `src/db/schema.ts` with missing columns and new tables.

**Extend `ticket` table:**
- `type` (text) - task/bug/story/subtask
- `epic` (text, nullable)
- `flagged` (integer, boolean, default false)
- `reporter` (text, nullable)
- `description` (text, nullable) - markdown-converted
- `acceptanceCriteria` (text, nullable)
- `jiraCreatedAt` (text, nullable)
- `jiraUpdatedAt` (text, nullable) - critical for smart fetch
- `assigneeAvatar` (text, nullable)
- `components` (text, nullable) - JSON array

**New `syncLog` table:**
- `id`, `type` (sprint-sync/ticket-sync/single-ticket/comment-sync/webhook), `scope`, `status` (running/success/failed), `summary`, `errorDetail`, `durationMs`, `startedAt`, `completedAt`, `acknowledged` (boolean)

**Files:** `src/db/schema.ts`, `src/db/test-utils.ts`, new Drizzle migration

**Verify:** typecheck, build, existing tests pass

---

## Phase 1: ADF-to-Markdown + Enhanced Sync

### 1a. ADF Converter
Create `src/lib/adf-to-markdown.ts` - pure function `(adfNode: unknown) => string`. Handles: paragraph, heading, bulletList, orderedList, listItem, codeBlock, blockquote, table, inline marks (strong, em, code, link, strike). Unknown nodes degrade to text content.

Test: `src/lib/adf-to-markdown.test.ts`

### 1b. Enhance sync-tickets route
`src/app/api/jira/sync-tickets/route.ts`:
- Populate all new ticket columns (type, epic, flagged, reporter, jiraCreatedAt, jiraUpdatedAt, etc.)
- Convert ADF description to markdown via converter, store in `ticket.description`
- Add pagination (loop with `startAt` when `total > issues.length`)
- Write syncLog entries (running -> success/failed with duration + summary)

### 1c. Sync-sprints pagination
`src/app/api/jira/sync-sprints/route.ts`: loop with `startAt` if `isLast === false`

### 1d. Comment sync
New `src/app/api/jira/sync-comments/route.ts` (POST): fetch comments for a ticket, convert ADF bodies, upsert into `jiraComment` table

### 1e. Attachment sync
Extend sync-tickets to also upsert attachment metadata into `ticketAttachment` (no file download, metadata only)

**Verify:** sync a sprint, check all new columns populated in DB, tests pass

---

## Phase 2: API Response Shaping + New Hooks

### 2a. Health check
New `src/app/api/jira/health/route.ts` (GET): calls `/rest/api/3/myself`, returns `{ ok, user, live }` or `{ ok: false, error, cachedDataAvailable }`

### 2b. Extract shared types
Create `src/types/ticket.ts` with: `IssueType`, `JiraStatus`, `POStatus`, `Ticket`, `TicketDetail`, `Assignee`, `Sprint`, `StoryVersion`, plus constants `EPIC_COLORS`, `PO_STATUS_OPTIONS`, `JIRA_STATUS_COLORS`

This is done BEFORE rewiring UI to avoid a massive single commit.

### 2c. Enrich GET /api/tickets
`src/app/api/tickets/route.ts`: join ticket + ticketMetadata, return data shaped to match `Ticket` interface (key, title, type, epic, jiraStatus, storyPoints, assignee object, flagged, poStatus, qualityScore, qualityStale, notes, sprintId)

### 2d. Enrich GET /api/tickets/[key]
Return full `TicketDetail`-compatible shape including description, reporter, labels, components, priority, createdAt, updatedAt, attachments, jiraComments

### 2e. New SWR hooks
Add to `src/hooks/useSprintBoard.ts`:
- `useTickets(sprintId)` - GET /api/tickets?sprintId=X (30s cache)
- `useTicketDetail(key)` - GET /api/tickets/{key} (lazy)
- `useTicketComments(key)` - GET /api/tickets/{key}/comments
- `useTicketAttachments(key)` - GET /api/tickets/{key}/attachments
- `useSyncStatus()` - GET /api/sync-log?limit=10 (10s poll)
- `useJiraHealth()` - GET /api/jira/health (60s interval)

### 2f. Sync log API
New `src/app/api/sync-log/route.ts` (GET): recent entries, `?unacknowledged=true` filter
New `src/app/api/sync-log/[id]/acknowledge/route.ts` (POST)

**Verify:** API responses match UI type shapes, hooks return correct data, tests pass

---

## Phase 3: Wire UI to API (Remove Mock Data) -- DONE

All sub-steps completed. 19 files changed, 0 remaining mock imports.

### 3a. Update imports to shared types -- DONE
All type/constant imports switched from `mock-data.ts`/`mock-versions.ts` to `@/types/ticket`.
Files: StatusBadge, Avatar, IssueTypeIcon, EpicLabel, SprintAnalytics, SprintSlots, BulkActionBar, FilterBar, TicketTable, SidePanel, StoryDiffPanel, SprintBoard, SprintInsights, MultiSprintView, tickets/[key]/page, chat/page, diff-preview/page.

### 3b. Wire sprint board family -- DONE
- `SprintBoard.tsx`: uses `useTickets(activeSprintId)` + `useJiraSprints()` + `mapJiraSprints()` helper. Loading spinner. Refresh calls `mutateTickets()`. PO statuses synced from API data.
- `SprintSlots.tsx`: receives `sprints` prop from SprintBoard (no direct API call).
- `SidePanel.tsx`: uses `useTicketDetail(key)` for description, `useTicketVersions(key)` for history (no mock fallback).
- `SprintInsights.tsx`: receives `tickets` prop.
- `MultiSprintView.tsx`: receives `sprints` prop, uses `useTickets(sprintId)` per panel.

### 3c. Wire ticket detail page -- DONE
Uses `useTicketDetail(key)` for ticket + detail data, `useJiraSprints()` for breadcrumb. Loading spinner. HistorySection fetches versions from API. Review history starts empty (no mock reviews).

### 3d. Wire chat page -- DONE
`TicketContextSidebar` uses `useTicketDetail(ticketKey)` directly by key from URL param.

### 3e. Wire diff preview -- DONE
Uses `useTicketVersions(ticketKey)` from URL `?ticket=` param. Falls back to sample data when no ticket provided. Wrapped in Suspense for `useSearchParams()`.

### 3f. Delete mock files -- DONE
- `mock-data.ts` moved to `deleted/`
- `mock-versions.ts` moved to `deleted/`
- ~300 lines of mock data removed from `jira-client.ts` (MOCK_SPRINTS, MOCK_ISSUES, mockUser). Unconfigured mode returns empty arrays.
- `jira-client.test.ts` updated: tests expect empty arrays / throw when not configured.
- `page.test.tsx` (sprint board) updated: mocks SWR hooks instead of relying on mock data.

---

## Phase 4: Smart Fetching + Conflict Detection

### 4a. Single-ticket freshness check
New `src/app/api/jira/check-updated/route.ts` (GET `?key=X`): fetch only `updated` from Jira, compare with local `jiraUpdatedAt`, return `{ stale, localUpdated, remoteUpdated }`

### 4b. Smart fetch on ticket open
In `useTicketDetail`: after returning cached data, background call to check-updated. If stale, trigger single-ticket sync and store new snapshot in storyVersion.

### 4c. Sprint refresh strategy
Add `?strategy=bulk|timestamp-first` to sync-tickets route.
- **Bulk:** single JQL, all fields (current behavior)
- **Timestamp-first:** first fetch only `key,updated` (lightweight), compare locally, then fetch full data only for changed issues

### 4d. Visual freshness indicator
Add computed `freshness` field to ticket API response. UI shows subtle dot/timestamp.

### 4e. Conflict detection on edit
On entering edit mode: background check-updated call. If Jira version is newer than `ticketLocalEdit.baseJiraVersion`, show warning + diff between local draft and latest Jira version (reusing StoryDiff component).

**Files:** new check-updated route, modify sync-tickets, modify useTicketDetail hook, modify SidePanel + ticket detail page

**Verify:** open stale ticket -> indicator shows, edit ticket that changed remotely -> warning appears, sprint refresh with timestamp-first works

---

## Phase 5: Sync Feedback UI + Webhook + Polish

### 5a. SyncContext
New `src/contexts/SyncContext.tsx`: provides syncState, lastSync, unacknowledgedErrors, triggerSync(), acknowledgeError(). Wraps app layout.

### 5b. Sync indicator
New `src/components/sync/SyncIndicator.tsx`: compact widget in sidebar showing current sync state, last result, error badge. Clickable to expand sync history.

Modify `src/components/Sidebar.tsx` to include SyncIndicator.

### 5c. Sync toasts
New `src/components/sync/SyncToast.tsx`: success toasts auto-dismiss (3s), error toasts persist until dismissed.

### 5d. Offline banner
When `useJiraHealth()` returns ok: false, show persistent banner "Jira unavailable, showing cached data" with retry button. Lives in app layout.

### 5e. Webhook receiver
New `src/app/api/jira/webhook/route.ts` (POST): validate signature (`JIRA_WEBHOOK_SECRET`), parse event type, dedup on event ID via syncLog, trigger targeted sync for affected ticket. Return 200 immediately.

### 5f. Rate limiting + retry
Enhance `src/lib/jira-client.ts`: request queue (max 10 concurrent), exponential backoff (1s/2s/4s, max 3 retries) on 429/5xx, respect Retry-After header.

### 5g. Audit log panel
New `src/app/(app)/sync-log/page.tsx` (or modal from sync indicator): paginated table of all syncLog entries, filterable by type and status.

**Verify:** sync indicator shows live status, failed sync shows persistent error, webhook triggers sync, rate limiting works, audit log displays history

---

## Phase Dependency Graph

```
Phase 0 (Schema)
    |
Phase 1 (ADF + Enhanced Sync)
    |
Phase 2 (API Shaping + Hooks + Types)
    |
Phase 3 (Wire UI, Remove Mocks)  <-- biggest phase, split into sub-PRs
    |
Phase 4 (Smart Fetch + Conflicts)
    |
Phase 5 (Sync UI + Webhooks + Polish)
```

Each phase is independently testable. Phase 3 is the riskiest (touches 15+ UI files). Sub-PRs recommended: 3a (types), 3b (sprint board), 3c (ticket detail), 3d+3e (chat+diff), 3f (delete mocks).

## Key Decisions

1. **Types extracted before mock deletion** - prevents massive single commit
2. **API routes shape data, not UI** - components receive ready-to-render objects
3. **ADF conversion at sync time** - stored as markdown in SQLite, UI never sees ADF
4. **SyncContext over state library** - simple enough for React Context
5. **Webhooks trigger re-sync, not direct ingestion** - single data path, consistency guaranteed
6. **Mock data kept until Phase 3f** - UI works throughout Phases 0-2
