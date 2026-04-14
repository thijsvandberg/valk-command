# BRDG-085: Notification Relevance

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want notifications to only surface events that need my attention, so the notification bell becomes a useful signal rather than a noisy copy of the activity log. Routine operations (syncs, pushes, metadata updates) already live in the activity log and the sidebar "Recent Activity" widget. Notifications should be reserved for things I need to act on or be aware of: story writer completions and other high-signal events.

## Background

Currently the notification system and activity log have significant overlap. Sync operations create both an activity log entry AND a notification, resulting in a notifications panel filled with "Ticket sync completed" messages. The notification categories `pipeline`, `deployment`, and `pr` exist in the schema but are not used yet.

The activity log is the full audit trail. Notifications should be the curated "attention needed" layer on top.

## Implementation Plan

1. **Phase 1 (steps 1-3):** Remove `createNotification` calls from `src/app/api/jira/sync-tickets/route.ts` (4 calls: individual success, individual failure, sprint sync success, sprint sync failure). Update tests. Verify `sync-incremental` route has no calls.
2. **Phase 3 (steps 7-10):** Add preference check to `createNotification()` using `appSetting` key `notification_preferences` (JSON object per category). Create `GET/PUT /api/settings/notification-preferences`. Extend settings notifications page with category toggles. Defaults: `sync` OFF, all others ON.
3. **Phase 2 (steps 4-6):** Keep existing "Draft ready" notification unchanged. Add failure/timeout notification from `useTaskMonitoring.ts` via `POST /api/notifications` (client-side fire-and-forget, requires passing `ticketKey` to the hook). Add low-quality-score notification (score < 60) in `reviews/generate/route.ts`.

Note: Phase 3 goes before Phase 2 so new notifications are preference-gated from day one. Quality score threshold hardcoded as `QUALITY_ALERT_THRESHOLD = 60` constant. Story writer failure notifications fire client-side (only if tab is open when failure is detected).

## Acceptance Criteria

### Phase 1: Remove sync noise from notifications

- [x] Remove notification creation from the sync-tickets route (both sprint sync and individual ticket sync)
- [x] Remove notification creation from incremental sync
- [x] Sync successes and failures are still recorded in the activity log (no change there)
- [x] The sidebar "Recent Activity" widget continues to show sync activity (no change)

### Phase 2: Story writer notifications (keep and improve)

- [x] Keep the existing "Draft ready for {key}" notification on story writer completion
- [x] Add a notification when a story writer session fails or times out: "Story writer failed for {key}" with category `story-writer`
- [x] Add a notification when a story writer review completes with a score below the configured threshold (e.g. quality score < 60): "Low quality score ({score}) for {key}" with category `story-writer`

### Phase 3: Notification preferences

- [x] Add a notification preferences section in settings (or a small config object in the DB) that lets the user toggle notification categories on/off
- [x] Default: `story-writer` ON, `pipeline` ON, `pr` ON, `deployment` ON, `sync` OFF, `general` ON, `system` ON
- [x] Preferences are checked in `createNotification()` before inserting; if the category is disabled, the notification is silently skipped

## Technical Notes

- `src/lib/notifications.ts` is the single creation point. Phase 1 just removes calls to it from `src/app/api/jira/sync-tickets/route.ts`.
- The `alert` table schema already supports categories `pipeline`, `deployment`, `pr`. No migration needed.
- Phase 3 needs either a new `notificationPreferences` table or a JSON column in a settings table. A simple key-value approach with category as key and boolean as value would work.
- The `NotificationBell.tsx` component already renders category-specific icons and colors for all categories, so no UI changes are needed.

## Out of Scope

- Pipeline, PR, and deployment notifications (see BRDG-086)
- Notification grouping/batching (e.g. "3 PRs merged" instead of 3 separate notifications)
- Push notifications or browser Notification API
- Email/Slack notification delivery
- Changes to the activity log page or its filters
- Changes to the sidebar "Recent Activity" widget
