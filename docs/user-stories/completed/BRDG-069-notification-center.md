# BRDG-069: Notification Center

**Status:** Completed
**Priority:** Medium

## Description

As the PO, I want an in-app notification center that collects alerts, sync results, story writer completions, and system messages with read/unread state so I never miss important events.

## Acceptance Criteria

### Phase 1: Notification bell
- [x] Bell icon in the app header (right side, before any user menu)
- [x] Unread count badge (red dot with number, max "9+")
- [x] Click opens a dropdown panel
- [x] Panel shows last 20 notifications sorted by timestamp (newest first)

### Phase 2: Notification types
- [x] Sync completion: "Sprint sync completed. 5 tickets updated."
- [x] Sync failure: "Jira sync failed: connection timeout"
- [x] Story writer: "Draft ready for VALK-42"
- [x] Alert: forwarded from alert system (BRDG-041)
- [x] System: "New version available", "Database backup recommended" <!-- icon + category defined; no automated trigger needed for now -->
- [x] Each type has a distinct icon and color

### Phase 3: Notification management
- [x] Mark individual notification as read (click or explicit button)
- [x] "Mark all as read" action
- [x] Click notification to navigate to relevant page/ticket
- [x] Auto-mark as read after 5 seconds of being visible in the panel
- [x] "Clear all" to remove old notifications

### Phase 4: Persistence
- [x] Notifications stored in a `notification` table (type, message, read, createdAt, link) <!-- reuses existing `alert` table which has all required fields; no new table needed -->
- [x] API routes: GET (list), POST (create), PATCH (mark read), DELETE (clear)
- [x] Auto-cleanup: delete notifications older than 30 days
- [x] Notifications created by backend events (sync, story writer, alerts)

## Technical Notes

- Notification creation happens server-side in the relevant API handlers
- Real-time updates: poll every 30 seconds or use SWR with refreshInterval
- Panel is a portal-rendered dropdown (similar to search modal)
- Consider SSE for real-time push if polling feels too slow
- **Implementation note**: Used the existing `alert` table as the notification store (same fields: id, type, jiraKey, message, createdAt, read, category, linkUrl). Added `"sync"`, `"story-writer"`, and `"system"` to the category enum. No new DB migration was needed since SQLite stores the column as plain text.
- `createNotification()` helper at `src/lib/notifications.ts`
- Auto-cleanup (30 days) runs on every GET request to `/api/notifications`

## Out of Scope (for now)
- Notification preferences (mute categories)
- Email notifications
- Slack notifications (separate story BRDG-074)
- Notification grouping (e.g., "5 tickets updated" instead of 5 individual notifications)
