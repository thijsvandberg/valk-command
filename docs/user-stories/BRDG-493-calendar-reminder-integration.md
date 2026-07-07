# BRDG-493: Calendar reminder integration

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description

The PO wants to set a reminder on any Jira ticket — either as a Bridge-native notification that
fires at a chosen time, or as a Google Calendar event for tickets that need a hard calendar
block. The feature covers two delivery modes that can be implemented independently:

1. **Bridge reminder** — schedule a notification via the existing internal alert system.
2. **Google Calendar export** — push a calendar event to the PO's Google Calendar.

This story is intentionally high-level. It is a placeholder to hold the idea; design details
will be resolved before implementation starts.

## Current Behaviour

- Bridge has a full notification system: `alert` table (schema in `src/db/schema.ts`), including
  an `eventAt` column designed for future-dated events, `createNotification()` in
  `src/lib/notifications.ts`, per-category preferences in
  `src/lib/notification-preferences.ts`, and a `NotificationBell` UI component.
- The lazy-cron scheduler (`src/lib/scheduler.ts` + `src/lib/scheduled-tasks.ts`) already runs
  background tasks on intervals triggered by client ticks (`POST /api/scheduler/tick`). It could
  be extended to fire `eventAt`-dated alerts.
- There is no Google Calendar integration. Existing integrations (Jira, Confluence, Bitbucket)
  use server-side env-var credentials — there is no per-user OAuth token infrastructure yet.
- The integrations settings page lives at `src/app/(app)/settings/integrations/page.tsx`.

## Proposed Approach

### Phase 1: Bridge-native reminder
1. Add a "Set reminder" action to the ticket row context menu and/or ticket detail panel.
2. Show a time picker (presets + custom datetime).
3. Persist the reminder as an `alert` row with the chosen `eventAt` timestamp.
4. Extend the scheduler to query for undelivered `eventAt` alerts past their due time and mark
   them as delivered (or rely on `NotificationBell` polling — to be decided).

### Phase 2: Google Calendar export
1. Add Google OAuth per-user flow: consent + token storage (new table keyed on Clerk userId).
2. Add a Google Calendar connect step to the integrations settings page.
3. On "Add to calendar" action on a ticket, call the Google Calendar API to create an event
   with the ticket key, title, and Jira URL in the description.
4. Optionally: after creating the event, also set a Bridge reminder so both sides are linked.

Non-goals for both phases: two-way sync, recurrence, invite attendees, Jira due-date write-back.

## Open Questions

- **UI entry point**: Where is the "Set reminder" / "Add to calendar" action surfaced? Options:
  ticket row context menu, ticket detail panel action bar, or both. Recommended default: both.
- **Reminder time presets**: What presets make sense for the PO? (e.g. "Tomorrow 9am",
  "Next Monday", "Custom"). Recommended default: Tomorrow / Next Monday / Custom.
- **Scheduler delivery for Bridge reminders**: fire via scheduler tick (background) or via
  `NotificationBell` polling on load? Recommended default: scheduler tick, consistent with
  existing background task pattern.
- **Google OAuth token storage**: store per-user Google tokens in a new `google_oauth_token`
  table keyed on Clerk userId, or in the existing `app_setting` table (single-user app so both
  work)? Recommended default: `app_setting` table with a new key, keeps schema lean.
- **Google Calendar event detail level**: just key + title + Jira URL, or include description
  and acceptance criteria? Recommended default: key + title + Jira URL only.

## Acceptance Criteria

### Phase 1: Bridge reminder
- [ ] A "Set reminder" action is available on a ticket (row menu and/or detail panel).
  <!-- ticket row context menu: src/components/board/BoardRow.tsx; detail panel: src/app/(app)/ticket/[key]/page.tsx or its action bar -->
- [ ] Clicking it opens a time picker with presets and a custom datetime option.
- [ ] Confirming saves an `alert` row with the selected `eventAt` and the ticket's Jira key.
  <!-- src/lib/notifications.ts createNotification(); alert table in src/db/schema.ts -->
- [ ] When `eventAt` is reached, the notification appears in `NotificationBell`.
  <!-- scheduler tick in src/lib/scheduler.ts or notification poll -->
- [ ] Reminder can be cancelled before it fires.

### Phase 2: Google Calendar export
- [ ] The integrations settings page shows a "Google Calendar" section with a Connect button.
  <!-- src/app/(app)/settings/integrations/page.tsx -->
- [ ] Connecting opens the Google OAuth consent flow; the resulting token is stored per user.
- [ ] An "Add to calendar" action on a ticket creates a Google Calendar event with key, title,
  and Jira URL.
- [ ] If the user is not connected to Google Calendar, the action prompts them to connect first.

## Tests

### Phase 1
- [ ] Unit: `createNotification()` with a future `eventAt` persists the alert correctly.
  <!-- src/lib/notifications.test.ts -->
- [ ] Unit: scheduler task fires overdue `eventAt` alerts and marks them delivered.
  <!-- src/lib/scheduled-tasks.test.ts -->

### Phase 2
- [ ] Unit: Google Calendar API call constructs the correct event payload (key, title, URL).
  <!-- new src/lib/google-calendar.test.ts -->
- [ ] Integration: OAuth token round-trip stores and retrieves the token for the correct user.

## Related

- `src/lib/notifications.ts` — existing notification creation helpers this builds on.
- `src/lib/scheduler.ts` + `src/lib/scheduled-tasks.ts` — scheduler pattern for Phase 1 delivery.
- `src/app/(app)/settings/integrations/page.tsx` — integration connect UI to extend for Phase 2.
- `docs/architecture/database-schema.md` — `alert` table definition incl. `eventAt` column.
