# BRDG-100: Notification Panel Filter Bar

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want a fixed filter bar in the notification panel so I can quickly scope the list by notification type and team, with "Mark all read" and "Clear read" respecting the active filter.

## Background

The notification panel currently shows a flat list of all event types mixed together. As volume grows (PR events, deployments, agent completions, story-writer drafts) it becomes hard to focus on what matters. A filter bar with per-type counts gives an at-a-glance overview and lets the PO zero in on a specific signal.

Teams are derived from the `sprintName` display name: the prefix before `: ` (e.g., `BM` from `BM: 135`, `BT` from `BT: 136`). This maps naturally to the two active team sprints visible in the panel.

---

## Implementation Plan

1. **API route** (`src/app/api/notifications/route.ts`) — Add `{ ids: string[] }` branch to PATCH (batch mark-read) and body-based `{ ids: string[] }` to DELETE (filtered clear). Keep existing paths untouched.
2. **Hook** (`src/hooks/usePipelines.ts`) — Add `markFilteredRead(ids: string[])` and `clearFiltered(ids: string[])` methods to `useNotifications`.
3. **State + derived data** (`src/components/NotificationBell.tsx`) — Add `activeType`/`activeTeam` local state. Add `extractTeamPrefix()` helper. Derive `typeCounts`, `teamCounts`, `filteredNotifications`, `filteredUnreadIds`, `filteredReadIds` with `useMemo`.
4. **Type filter bar UI** — Fixed `<div>` between header and list, one icon button per type with count badge and active state.
5. **Team filter row UI** — Chip row below type bar, team names from `teamCounts`, toggle active state.
6. **Scoped bulk actions** — Wire "Mark all read" and "Clear read" to filtered IDs when a filter is active; fall back to existing `markAllRead()`/`clearRead()` when no filter is active.
7. **Filtered list + empty state** — Render `filteredNotifications` instead of `notifications`; add "No notifications for this filter" when filter returns zero results.
8. **Polish** — Hide `hiddenCount` footer when a filter is active (count refers to unloaded data, misleading when filtered).

**Commit sequence:** (1-2) API + hook → (3-7) all filter UI in NotificationBell → (8) polish

---

## Acceptance Criteria

### 1. Type filter bar

- [x] A fixed bar is added between the panel header and the notification list; it does not scroll with the list
- [x] The bar shows one icon button per notification type that has at least one notification in the current dataset (up to 50 loaded)
- [x] Each icon button shows the count of notifications of that type as a small badge (unread count preferred; falls back to total if all are read)
- [x] Notification types and their icons match the existing `notificationIcon()` mapping in `NotificationBell.tsx`:
  - `pr` — GitPullRequest (amber)
  - `pipeline` — GitBranch (brand color)
  - `deployment` — Rocket (violet)
  - `story-writer` — NotebookPen (sky)
  - `sync` — RefreshCw (emerald)
  - `agent` — Bot (purple)
  - `scheduler` — Timer (orange)
  - `system` — Info (white/40)
- [x] Clicking an active filter icon deactivates it (returns to "all")
- [x] Clicking a different icon switches to that type filter
- [x] When no filter is active the bar shows a subtle "all" state (no icon highlighted)
- [x] Type icons that have zero notifications in the current dataset are hidden (not grayed out)

### 2. Team filter

- [x] Below (or alongside) the type icons, show a row of team chips derived from `sprintName` display names
- [x] Team prefix is extracted by splitting `sprintName` on `": "` and taking the first part (e.g., `BM: 135` → `BM`)
- [x] Only teams that appear in the current notification dataset are shown
- [x] Each team chip shows the count of notifications for that team
- [x] Clicking a chip sets the team filter; clicking the active chip deactivates it
- [x] Notifications without a `sprintName` are not attributed to any team; they are visible when no team filter is active and hidden when a team filter is active
- [x] Type and team filters are independent and apply simultaneously (AND logic): when both are active, only notifications matching both are shown

### 3. Scoped bulk actions

- [x] "Mark all read" is only shown when there are unread notifications in the current (filtered) view
- [x] Clicking "Mark all read" marks as read only the unread notifications visible after applying the current type + team filter
- [x] "Clear read" is only shown when there are read notifications in the current (filtered) view
- [x] Clicking "Clear read" deletes only the read notifications visible after applying the current type + team filter
- [x] After a scoped bulk action the filter state remains unchanged; the list updates to reflect the new read/deleted state

### 4. Empty state

- [x] If the active filter combination produces zero results, show a compact empty message in the list area (e.g., "No notifications for this filter")
- [x] The filter bar remains visible so the user can deselect the filter

---

## Technical Notes

### Filter state
- Filter state is local to `NotificationBell.tsx` (`useState`): `activeType: string | null` and `activeTeam: string | null`
- No URL params or persistence needed; filters reset when the panel closes

### Team extraction
- `extractTeamPrefix(sprintName: string | null): string | null` — split on `": "`, return part before it, or `null` if no match
- Derive team list from `notifications.map(n => extractTeamPrefix(n.sprintName)).filter(Boolean)` with dedup

### Scoped "Mark all read"
- Derive the IDs of unread filtered notifications client-side
- Call existing `markRead(id)` for each, or extend the PATCH endpoint to accept `{ ids: string[] }` for a single round-trip
- Prefer the batch approach to avoid N separate network calls when there are many unread items
- API change: `PATCH /api/notifications` with `{ ids: string[] }` marks each listed ID as read

### Scoped "Clear read"
- Derive IDs of read filtered notifications client-side
- Extend `DELETE /api/notifications` to accept an optional `{ ids: string[] }` body; when present, delete only those rows; when absent, delete all read (existing behavior)
- Hook: add `clearFiltered(ids: string[])` alongside existing `clearRead()`

### Filter bar placement
- Insert the filter bar as a new `<div>` between the header `<div>` and the list `<div>` in `NotificationBell.tsx`
- Use `position: sticky` or simply place it before the scrollable list container
- Keep the bar compact (max ~40px height) to preserve vertical space for the list

### Count badges
- Compute per-type counts from the loaded notifications array (not an extra API call)
- Badge shows unread count for that type; if all are read, show total count with reduced opacity

---

## Out of Scope

- Multi-select (selecting multiple types simultaneously)
- Persisting filter state across panel open/close
- Server-side filtering (client-side filtering of 50 loaded notifications is sufficient)
- Filter by read/unread state (the existing unread dot already provides per-item visual distinction)
