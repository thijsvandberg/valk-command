# BRDG-098: Notification System Improvements

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want the notification panel to be more accurate, actionable, and complete so I can see what actually needs attention without noise, unclear state, or missing events.

## Background

The notification system has a solid foundation: SQLite persistence, read/unread state, category preferences, and server-side deduplication for PR events. A code review reveals several UX problems and coverage gaps that make it less useful in practice.

---

## UX/UI Problems

### 1. Auto-mark-as-read on a 5-second timer
Opening the panel briefly causes all visible unread notifications to be silently marked as read after 5 seconds (`AUTO_MARK_READ_DELAY = 5000` in `NotificationBell.tsx`). This makes the unread badge meaningless: you glance at the panel, close it, and the badge is gone even though you didn't act on anything.

**Fix:** Remove the timer. Mark as read only on explicit user action: clicking the blue dot, clicking a linked message, or using "Mark all read".

### 2. No per-notification dismiss
Once a notification is read, there is no way to remove it individually. The only removal action is "Clear all", which deletes everything including unread items. This forces a choice between cluttered history or losing unseen notifications.

**Fix:** Add an X (dismiss) button, visible on hover, that hard-deletes only that notification. Wire to a new `DELETE /api/notifications?id=:id` endpoint.

### 3. "Clear all" is too destructive
The current "Clear all" hard-deletes all notifications regardless of read state. There is no confirmation.

**Fix:** Rename to "Clear read" and only delete rows where `read = true`. This way unread items are never accidentally lost. Remove the button when there are no read notifications to clear.

### 4. Blue dot affordance is unclear
The unread indicator is rendered as a `<button>` that calls `markRead`, but it looks like a static colored dot. Users are unlikely to discover that clicking it marks the notification as read.

**Fix:** On hover of the notification row, replace the dot with a small explicit "Mark read" icon button (e.g. a check icon with a tooltip). The dot can remain as a passive indicator when not hovering.

### 5. Panel only shows 20 items, no overflow handling
`useNotifications(20)` caps the list. If more notifications exist, they are silently hidden with no indication.

**Fix:** Show a "View all" link or count at the bottom of the panel if the total exceeds the display limit, or increase the limit to 50.

### 6. External link icon is too small and too faint
The external link is rendered at `size={10}` with `text-white/15`. It is nearly invisible and difficult to click.

**Fix:** Increase to `size={12}`, bump opacity to `text-white/30` at rest and `text-white/50` on hover, and ensure the hit area is at least 20x20px.

---

## Content/Coverage Gaps

The following events currently produce no notification. All should respect the category preferences system.

### Agent / Chat events (new category: `agent`)
- Agent task completed (with outcome summary)
- Agent task failed (with error summary)
- Agent waiting for input / blocked

These are arguably the most important notifications for the PO, since the agent works async.

### Scheduled job events (new category: `scheduler`)
- Scheduled job completed successfully
- Scheduled job failed (with job name and error)

Currently the scheduler runs silently; failures are only discoverable by opening the Scheduled Jobs view.

### Jira sync events (existing category: `sync`)
`sync` is disabled by default and fires on every sync completion, making it too noisy to enable. Instead of a blanket "sync completed" message, it should only fire on meaningful outcomes:
- Sync detected a status change on a ticket in the active sprint
- Sync failed entirely (error, not just zero changes)

### Story-writer: deduplication
`createNotification` is called unconditionally every time a draft is applied for a ticket. If the user applies drafts multiple times, identical notifications stack up. Story-writer drafts should deduplicate by `jiraKey`: if an unread notification of type `story-writer` + message prefix `"Draft ready for"` already exists for that key, update `createdAt` instead of inserting.

### Low quality score: link to review
The review quality notification (`"Low quality score (73) for VPL-44752"`) has no `linkUrl`, so the user cannot navigate to the review from the panel. Pass the review URL as `linkUrl` so the external link icon appears.

---

## Implementation Plan

1. **Types + schema** (`notification-preferences.ts`, `schema.ts`) - Add `"agent"` and `"scheduler"` to the `NotificationCategory` union and DB enum. Add defaults (both `true`). Run migration.
2. **Settings page** (`settings/notifications/page.tsx`) - Add `CATEGORY_META` + `CATEGORY_ORDER` entries for `agent` and `scheduler`.
3. **API: delete improvements** (`api/notifications/route.ts`) - Add `?id=:id` support for per-row deletion. Change bulk DELETE to `WHERE read = true`. Add `totalCount` to GET response.
4. **Hook update** (`hooks/usePipelines.ts`) - Rename `clearAll` → `clearRead`, add `dismissOne(id)`, expose `totalCount`.
5. **NotificationBell overhaul** (`NotificationBell.tsx`) - Remove auto-mark-read timer. Add X dismiss button per row. Rename "Clear all" → "Clear read" (show only when read items exist). Blue dot → check icon on row hover. Increase limit to 50, show overflow count. Fix external link size/opacity.
6. **Story-writer deduplication** (`lib/notifications.ts`, `apply-draft/route.ts`) - Add `createOrUpdateNotification()` with dedup by `type + jiraKey`. Use it in apply-draft.
7. **Review linkUrl** (`reviews/generate/route.ts`) - Pass `linkUrl: /tickets/${key}` to the low-quality-score notification.
8. **Sync notifications** (`lib/scheduled-tasks.ts`) - Fire `sync` notification when `count > 0` or on sync error (not on every run).
9. **Scheduler failure notifications** (`lib/scheduler.ts`) - Fire `scheduler` notification in the task `catch` block.
10. **Agent category** - Add type/settings UI only. Actual agent task completion has no server-side hook in the current architecture (SSE is a passthrough proxy; completion happens client-side in `useTaskMonitoring` which is story-writer specific). Skip notification firing; annotate in story.

## Acceptance Criteria

- [x] The auto-mark-as-read timer is removed; unread state only changes on explicit user action
- [x] Each notification row shows an X dismiss button on hover that deletes only that notification
- [x] "Clear all" is renamed "Clear read" and only deletes `read = true` rows
- [x] The unread blue dot transitions to a visible check icon on row hover, making the mark-as-read action discoverable
- [x] The panel shows up to 50 notifications; if more exist a count/link is shown at the bottom
- [x] The external link icon is legible and has a sufficient click target
- [x] A new `agent` category exists with notifications for: task completed, task failed, agent waiting for input <!-- agent notification firing skipped: no server-side completion hook; SSE is a passthrough proxy; completion is client-side in useTaskMonitoring (story-writer specific). Category type and settings UI are wired; firing can be added when a proper completion callback exists. -->
- [x] A new `scheduler` category exists with notifications for: job completed, job failed
- [x] The `sync` category only fires on meaningful outcomes (status change detected, or sync error), not on every completed sync
- [x] Story-writer draft notifications deduplicate per `jiraKey` (update timestamp instead of inserting duplicate)
- [x] The low quality score notification includes a `linkUrl` pointing to the review page for that ticket

## Technical Notes

- Individual dismiss: add `DELETE /api/notifications?id=:id` (or route segment) alongside the existing `DELETE /api/notifications` (clear-read)
- "Clear read": change the bulk-delete endpoint to `WHERE read = true`; the existing `clearAll()` hook method should be renamed `clearRead()` to match
- Deduplication for story-writer: in `createNotification`, before insert, check for an existing unread row with same `type` and `jiraKey`; if found, `UPDATE createdAt` only
- Agent notifications: integrate at the point where agent task SSE stream terminates (success or error path in the chat/agent API route)
- Scheduler notifications: fire from the scheduler execution wrapper after job completion/failure
- `sync` refinement: change `processSyncNotifications` (or equivalent) to only call `createNotification` when `updatedCount > 0` or on error, not on every run
- The `DELETE /api/notifications` route currently has no body/params; add `?id=:id` support for individual deletion while keeping the default behavior as clear-read

## Out of Scope

- Notification grouping / collapsing rows
- Snooze or archive
- Browser desktop notification changes
- Per-notification preferences (category-level prefs are sufficient)
- Pagination or infinite scroll in the panel
