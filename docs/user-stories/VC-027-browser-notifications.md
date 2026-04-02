# VC-027: Browser Notifications

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to receive a browser notification when a long-running action (story writer chat, regular chat) completes its response while I'm in another tab, so I don't have to keep watching the tab for results.

## Core Concepts

- **Page Visibility API**: Only fire notifications when the tab is not in focus
- **Permission prompt**: Request `Notification` permission on first interaction, not on page load
- **Toggle**: User can disable notifications via a setting (default: on)
- **Expandable**: Architecture should allow adding more notification triggers later without refactoring

## Acceptance Criteria

### Phase 1: Notification infrastructure
- [ ] `useNotification` hook that wraps the Notification API (permission request, send, focus-check)
- [ ] Persist notification preference in localStorage
- [ ] Settings toggle to enable/disable notifications

### Phase 2: Chat notifications
- [ ] Trigger notification when a chat response stream completes while tab is hidden
- [ ] Notification title: "Chat response ready" with a preview of the first line
- [ ] Clicking the notification focuses the VC tab

### Phase 3: Story Writer notifications
- [ ] Trigger notification when a story writer workspace response completes while tab is hidden
- [ ] Notification title: "Story Writer response ready" with ticket key context
- [ ] Clicking the notification focuses the VC tab and navigates to the relevant story writer session

## Out of Scope (for now)
- Custom notification sounds
- Notifications for other actions (Jira sync, scheduled jobs, etc.)
- Push notifications / service worker (browser-native `Notification` API is sufficient)
- Mobile / PWA support
