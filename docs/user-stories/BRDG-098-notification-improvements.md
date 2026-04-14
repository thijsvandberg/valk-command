# BRDG-098: Notification System Improvements

**Status:** Todo
**Priority:** Medium

## Description

As the PO, I want the notification panel to be more useful and less noisy so I can quickly see what needs my attention without being distracted by duplicates or stale clutter.

## Background

The current notification panel has several usability problems visible in practice:

- Duplicate notifications appear for the same event (e.g. "Draft ready for VPL-44752" shown twice)
- There is no read/unread distinction, so every notification looks equally urgent whether it was just received or seen hours ago
- The only way to remove a notification is "Clear all", which discards everything including unseen items
- There is no way to dismiss a single notification

## Acceptance Criteria

- [ ] Duplicate notifications for the same entity and event type are deduplicated: only the most recent occurrence is kept
- [ ] Notifications have a visual read/unread state: unread items are visually distinct (e.g. a colored dot or stronger text weight)
- [ ] Clicking a notification marks it as read
- [ ] Each notification has an individual dismiss button (X icon) visible on hover, so the user can remove one item without clearing all
- [ ] "Clear all" removes all notifications regardless of read state
- [ ] A "Mark all as read" action is available in the panel header, separate from "Clear all"
- [ ] The bell icon badge in the top bar shows only the count of unread notifications (not total)
- [ ] When there are no unread notifications, the badge is hidden

## Technical Notes

- Deduplication key: combination of `type` + entity identifier (e.g. `jiraKey` or PR title). When a duplicate arrives, update the timestamp and keep only one entry.
- Read state should be persisted in the existing SQLite database (add a `read_at` column to the notifications table, or a separate `notification_reads` table if the notifications table is not owned by Bridge).
- If notifications are currently stored only in memory or local state, migrate them to the DB as part of this story.
- The individual dismiss should call a DELETE endpoint; "Mark all as read" should PATCH all unread rows.

## Out of Scope

- Notification preferences / per-type mute settings
- Push notifications or browser native notifications
- Notification grouping by type (e.g. collapsing multiple PRs into one row)
- Snooze functionality
