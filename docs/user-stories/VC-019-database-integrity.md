# VC-019: Database Integrity & Performance

**Status:** Not Started
**Priority:** High
**Estimate:** Medium
**Depends on:** VC-018

## Description

The database layer has several issues: missing indexes on all foreign keys (causing full table scans), a CHECK constraint mismatch that prevents saving "cancelled" sync status, N+1 query patterns, race conditions from missing transactions, and test helpers that don't use migrations.

## Context

The app uses SQLite + Drizzle ORM (`src/db/schema.ts`). The schema defines 11 tables with multiple foreign key relationships, but zero indexes are defined. The `sync_log` table has a CHECK constraint in the migration that doesn't include "cancelled" even though the schema enum does. Sprint slot updates delete and re-insert rows without a transaction.

## Acceptance Criteria

### Phase 1: Fix the "cancelled" CHECK constraint
- [x] The migration `drizzle/0004_slim_korvac.sql` creates `sync_log` with `CHECK(status IN ('running', 'success', 'failed'))` but `src/db/schema.ts:187` defines `enum: ["running", "success", "failed", "cancelled"]`
- [x] Create a new migration (0005) that rebuilds the `sync_log` table with `CHECK(status IN ('running', 'success', 'failed', 'cancelled'))`
- [x] Verify the cancel sync flow works end-to-end: POST to `/api/sync-log/[id]/cancel` should update status to "cancelled"

### Phase 2: Add database indexes
- [ ] Add indexes to `src/db/schema.ts` for all foreign key columns:
  - `message.conversation_id`
  - `ticket_metadata.jira_key`
  - `ticket_attachment.ticket_key`
  - `jira_comment.ticket_key`
  - `po_comment.ticket_key`
  - `story_version.jira_key`
  - `ticket_local_edit.ticket_key`
- [ ] Add useful query indexes:
  - `sync_log.started_at` (DESC, for recent-first listing)
  - `conversation.created_at` (DESC)
- [ ] Generate a Drizzle migration for the indexes
- [ ] Verify migration runs cleanly on existing database

### Phase 3: Fix N+1 queries
- [ ] `src/app/api/tickets/route.ts:47-70` - Replace the `Promise.all(rows.map(async ...))` pattern with a single LEFT JOIN query between `ticket` and `ticket_metadata`
- [ ] `src/lib/jira-client.ts:334-339` (fetchTimestampFirst) - Replace per-issue DB lookup loop with a batch query using `WHERE jiraKey IN (...)`
- [ ] Verify the ticket list API response matches the current shape (no breaking changes)

### Phase 4: Wrap sprint-slot updates in a transaction
- [ ] `src/app/api/sprint-slots/route.ts:43-54` - Wrap the delete-all + insert-all in a Drizzle transaction
- [ ] Use `db.transaction(async (tx) => { ... })` pattern
- [ ] Verify sprint slot saving still works in the UI

### Phase 5: Align test helpers with migrations
- [ ] `src/db/test-utils.ts:6-195` manually creates tables with raw SQL, duplicating the schema
- [ ] Refactor `createTestDb()` to run Drizzle migrations instead of manual CREATE TABLE statements
- [ ] Verify all existing tests still pass with the new approach

## Key Files

- `src/db/schema.ts` - schema definitions (add indexes here)
- `drizzle/` - migration folder
- `src/app/api/sprint-slots/route.ts` - sprint slot race condition
- `src/app/api/tickets/route.ts` - N+1 query
- `src/lib/jira-client.ts` - timestamp-first N+1 query
- `src/db/test-utils.ts` - test helper to refactor
- `drizzle.config.ts` - Drizzle config for generating migrations

## Verification

```bash
npx vitest run                    # all tests pass
npm run build                     # clean build
# Manual: trigger a sync, cancel it, verify "cancelled" status appears in sync log
# Manual: load sprint board with 50+ tickets, verify it loads fast
```
