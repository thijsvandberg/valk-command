# VC-023: Rename Sync Log to Activity Log

**Status:** In Progress
**Priority:** Medium

## Description

The current sync-log is scoped to Jira sync operations only. It should become a central activity log that tracks all user and system actions. This enables full auditability and, in the future, filtering by action type.

## Scope

### 1. Database rename

- [x] Rename table `sync_log` to `activity_log`
- [x] Expand the `type` enum to include all action categories:
  - Existing: `sprint-sync`, `ticket-sync`, `single-ticket`, `comment-sync`, `webhook`
  - New: `review`, `metadata-update`, `local-edit`, `push-to-jira`, `bulk-action`
- [x] Generate and verify Drizzle migration (ALTER TABLE RENAME)
- [x] Update all schema types and exports

### 2. API route rename

- [x] Move `/api/sync-log` to `/api/activity-log` (GET, cancel, acknowledge endpoints)
- [x] Update all internal fetch calls to use new route
- [x] Keep old route as redirect or remove (decide based on external consumers)

### 3. UI rename

- [x] Rename page route from `/sync-log` to `/activity-log`
- [x] Update nav sidebar label
- [x] Update page title and breadcrumbs
- [x] Update EXPECTED_ROUTES manifest in `routes.test.tsx`

### 4. Context and hooks rename

- [x] Rename `SyncContext` / `SyncProvider` to `ActivityContext` / `ActivityProvider`
- [x] Rename `useSyncStatus` hook
- [x] Update all consumer components

### 5. Log all actions

- [ ] Quality reviews (from ticket detail, chat, bulk action) write an activity log entry with type `review`
- [ ] PO metadata updates (status, notes) write an activity log entry with type `metadata-update`
- [ ] Local edits write an activity log entry with type `local-edit`
- [ ] Push-to-Jira writes an activity log entry with type `push-to-jira`
- [ ] Bulk actions write a single summary entry with type `bulk-action`

### 6. Filter support (UI)

- [ ] Add a type filter dropdown to the activity log page (multi-select, default: all)
- [ ] Pass filter as query param to GET `/api/activity-log?type=review,sync`
- [ ] API supports comma-separated type filter

## Acceptance Criteria

- [ ] All references to "sync-log" / "SyncLog" are renamed to "activity-log" / "ActivityLog"
- [ ] Existing sync entries continue to display correctly after migration
- [ ] Quality reviews appear in the activity log with ticket key, score, and source
- [ ] The activity log page has a working type filter
- [ ] All tests pass after rename (no broken imports or routes)

## Technical Notes

- The rename touches ~30 files across schema, API routes, hooks, context, components, and tests
- SQLite supports `ALTER TABLE RENAME TO` so the migration is straightforward
- Consider doing the rename and the "log all actions" in two commits for easier review
- The activity log entry for reviews should include: ticket key in `scope`, score in `summary`, duration

## Dependencies

- None (can be done independently)
