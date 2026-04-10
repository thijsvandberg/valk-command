# BRDG-069: Notification Center

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want an in-app notification center that collects alerts, sync results, story writer completions, and system messages with read/unread state so I never miss important events.

## Acceptance Criteria

### Phase 1: Notification bell
- [ ] Bell icon in the app header (right side, before any user menu)
- [ ] Unread count badge (red dot with number, max "9+")
- [ ] Click opens a dropdown panel
- [ ] Panel shows last 20 notifications sorted by timestamp (newest first)

### Phase 2: Notification types
- [ ] Sync completion: "Sprint sync completed. 5 tickets updated."
- [ ] Sync failure: "Jira sync failed: connection timeout"
- [ ] Story writer: "Draft ready for VALK-42"
- [ ] Alert: forwarded from alert system (BRDG-041)
- [ ] System: "New version available", "Database backup recommended"
- [ ] Each type has a distinct icon and color

### Phase 3: Notification management
- [ ] Mark individual notification as read (click or explicit button)
- [ ] "Mark all as read" action
- [ ] Click notification to navigate to relevant page/ticket
- [ ] Auto-mark as read after 5 seconds of being visible in the panel
- [ ] "Clear all" to remove old notifications

### Phase 4: Persistence
- [ ] Notifications stored in a `notification` table (type, message, read, createdAt, link)
- [ ] API routes: GET (list), POST (create), PATCH (mark read), DELETE (clear)
- [ ] Auto-cleanup: delete notifications older than 30 days
- [ ] Notifications created by backend events (sync, story writer, alerts)

## Technical Notes

- Notification creation happens server-side in the relevant API handlers
- Real-time updates: poll every 30 seconds or use SWR with refreshInterval
- Panel is a portal-rendered dropdown (similar to search modal)
- Consider SSE for real-time push if polling feels too slow

## Out of Scope (for now)
- Notification preferences (mute categories)
- Email notifications
- Slack notifications (separate story BRDG-074)
- Notification grouping (e.g., "5 tickets updated" instead of 5 individual notifications)
