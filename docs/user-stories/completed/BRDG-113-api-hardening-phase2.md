# BRDG-113: API Route Hardening Phase 2

**Status:** Done
**Priority:** High
**Follows:** BRDG-020 (API Route Hardening, done)

## Description

Follow-up to BRDG-020. Several issues remain in the API layer that need to be addressed to ensure consistency, safety, and reliability across all routes.

## Issues

### 1. Inconsistent error response shapes

Mix of formats across routes:

- `{ error: "message" }`
- `{ error: "message", code: "CODE" }`
- `{ error: "message", errorDetail: "..." }`
- `{ ok: true }` vs `{ success: true }` for success responses

### 2. Missing Zod validation on 40% of POST/PUT routes

- `src/app/api/settings/column-config/route.ts` - basic type checks only
- `src/app/api/settings/column-widths/route.ts` - basic type checks only
- Several ticket routes use manual checks instead of schemas

### 3. Race conditions

- `src/app/api/followed-tickets/route.ts` - check-then-insert without atomicity
- `src/app/api/followed-sprints/route.ts` - same pattern
- `src/app/api/tickets/[key]/story-writer/route.ts` - session creation can race

### 4. Unbounded array inputs

- `src/app/api/jira/sync-tickets/route.ts` accepts unlimited ticketKeys array

### 5. Blocking route handler

- `src/app/api/tickets/[key]/reviews/generate/route.ts` polls synchronously for up to 3 minutes

### 6. Cleanup in GET handlers

- `src/app/api/activity-log/route.ts` runs retention cleanup on every GET
- `src/app/api/notifications/route.ts` runs cleanup on every GET

## Implementation Plan

1. **Error/success standardization** (`jira/sync-tickets/route.ts`, `story-writer/route.ts`, `tickets/[key]/page.tsx`)
   - Remove `ok: true/false` from sync-tickets responses; change `{ ok: false, error }` to `{ error }`
   - Update `tickets/[key]/page.tsx` which checks `data.ok` from syncTickets response
   - Change story-writer DELETE from `{ success: true }` to `{}`
   - Update existing sync-tickets tests

2. **Zod schemas + array length validators** (column-config, column-widths, followed-tickets, followed-sprints, story-writer PATCH, notifications POST/PATCH, jira/sync-tickets)
   - Add schemas matching existing pattern from `notification-preferences/route.ts`
   - `ticketKeys` in sync-tickets: `.max(100)` bound
   - `column-config` arrays: `.max(50)` each

3. **Race conditions** (followed-tickets, followed-sprints, story-writer POST, column-config, column-widths, upsert-setting, scheduler)
   - Add drizzle migration `0042_followed_ticket_unique.sql` to add UNIQUE index on `followed_ticket.ticket_key`
   - Update `src/db/schema.ts` followedTicket: change `index` to `uniqueIndex`
   - `followed-tickets` POST: replace check-then-insert with `onConflictDoNothing()`
   - `followed-sprints` POST: use `onConflictDoNothing()` (sprintName is already PK)
   - `story-writer` POST: wrap check-then-insert in `db.transaction()`
   - `column-config`, `column-widths`, `upsert-setting.ts`, `scheduler.ts`: use `onConflictDoUpdate()` for appSetting upserts

4. **Cleanup tasks to scheduler** (activity-log/route.ts, notifications/route.ts, scheduled-tasks.ts)
   - Add `cleanupActivityLog` task in scheduled-tasks.ts (every 5 min): marks stale running entries, prunes by age and count
   - Add `cleanupNotifications` task in scheduled-tasks.ts (every 60 min): deletes alerts older than 30 days
   - Remove cleanup logic from GET handlers

5. **Async review generation** (reviews/generate/route.ts, ticket-detail/TicketReview.tsx, sprint-board/ReviewPopover.tsx)
   - POST: submit to agent, use `after()` to run background processing via `captureTaskStream` + review processing, return `{ taskId }` (202)
   - Create `src/lib/review-capture.ts` for the review-specific background processing
   - Frontend components: open SSE stream via `useWorkspaceTask` hook, call `mutateReviews()` on completion

6. **Tests** for all changed routes (new test files for followed-tickets, followed-sprints, notifications, reviews/generate; updates to existing tests)

Dependencies: Step 3 migration must exist before step 3 routes run. Step 5 depends on step 1 (response shapes). Everything else is independent.

## Acceptance Criteria

- [x] Standardize all error responses to `{ error: string, code?: string }`
- [x] Standardize success responses to return data directly (no ok/success wrappers)
- [x] Add Zod schemas to all remaining POST/PUT/PATCH routes
- [x] Add max length validators on array inputs (e.g., ticketKeys max 100)
- [x] Fix race conditions with atomic upsert patterns
- [x] Move review generation to async pattern (return task ID, poll via SSE)
- [x] Move cleanup tasks from GET handlers to scheduler
- [x] Tests for all changed routes
