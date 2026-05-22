# BRDG-155: Conversation List UX Improvements

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want a more flexible and organized conversation list that I can resize, collapse, search through, and that groups conversations logically, so I can manage a large volume of conversations efficiently without the sidebar dominating my screen.

## Current Behavior

- Sidebar has a fixed width, cannot be resized
- Sidebar is always visible on desktop (only collapsible on mobile via slide-over)
- Conversations are in a flat reverse-chronological list with no grouping
- No search/filter within conversation titles
- No way to pin important conversations

## Desired Behavior

### Collapsible sidebar

- A toggle button (collapse/expand icon) in the sidebar header
- Collapsed state shows only the conversation type icons (no titles), much narrower
- Collapsed state is persisted in localStorage
- Keyboard shortcut: `Cmd/Ctrl + B` to toggle

### Resizable sidebar

- A drag handle on the right edge of the sidebar
- Drag to resize between a minimum (200px) and maximum (500px) width
- Width is persisted in localStorage
- Double-click the drag handle to reset to default width

### Search

- A search input at the top of the conversation list (below filters from BRDG-153)
- Filters conversations by title match (case-insensitive substring)
- Shows "No results" state when nothing matches
- Search clears when the X button is clicked or Escape is pressed
- Debounced input (200ms) to avoid jank on large lists

### Date grouping

- Conversations are grouped by relative date: **Today**, **Yesterday**, **This week**, **This month**, **Older**
- Group headers are sticky within the scroll container
- Groups can be collapsed/expanded by clicking the header
- Collapsed group state is persisted in localStorage

### Pinned conversations

- Right-click or action menu option to pin/unpin a conversation
- Pinned conversations appear in a "Pinned" section at the top, above date groups
- Pin state is stored in the database (`pinned` boolean on conversation table)
- Maximum 10 pinned conversations

## Implementation Plan

1. **DB: Add `pinned` column** - Create migration `0049_conversation_pinned.sql`, update `schema.ts` conversation table with `pinned` boolean, update `Conversation` type in `types/chat.ts`.
2. **API: Extend PATCH** - Update `api/conversations/[id]/route.ts` PATCH handler to accept `pinned`, enforce max 10 pins (409 if exceeded).
3. **Collapsible sidebar** - Create `useSidebarState` hook (localStorage for collapsed/width, Cmd/Ctrl+B listener). Update `ChatLayout.tsx` sidebar to use dynamic width + collapse toggle. Update `ConversationList.tsx` to accept `collapsed` prop showing icon-only mode.
4. **Resizable sidebar** - Add drag handle div on sidebar right edge in `ChatLayout.tsx`. MouseDown/Move/Up handlers clamp width 200-500px. Double-click resets to default (288px).
5. **Search input** - Add search `<input>` in `ConversationList.tsx` header. Local state + debounced case-insensitive title filter. No-results empty state. Clear button + Escape handler. Composes with existing category filters.
6. **Date grouping** - Create `lib/date-groups.ts` utility. Render grouped sections in `ConversationList` with sticky headers. Collapsible groups stored in localStorage `bridge:sidebar-groups-collapsed`.
7. **Pinned conversations** - Context menu component for pin/unpin. Split conversations into pinned section (top) + date-grouped unpinned. `onTogglePin` callback from ChatLayout calls PATCH API. Optimistic update in useConversations.
8. **Tests** - Update `ConversationList.test.tsx` for new props/features. New test files for `date-groups.ts` and `useSidebarState.ts`.

### Design decisions
- Pinned items respect active category filters and search (consistent behavior)
- Collapsed/resizable sidebar disabled on mobile (keep existing slide-over)
- Pin ordering: by `createdAt` within pinned section (boolean column, no pinnedAt timestamp)
- Running task indicators remain visible in collapsed mode

## Acceptance Criteria

### Collapsible sidebar
- [x] Toggle button collapses/expands the sidebar
- [x] Collapsed state shows icons only
- [x] `Cmd/Ctrl + B` toggles the sidebar
- [x] Collapsed state persists across reloads

### Resizable sidebar
- [x] Drag handle on the right edge allows resizing
- [x] Width is constrained between 200px and 500px
- [x] Width persists across reloads
- [x] Double-click resets to default width

### Search
- [x] Search input filters conversations by title
- [x] Search is case-insensitive
- [x] "No results" state shown when nothing matches
- [x] Clear button and Escape reset the search
- [x] Search works in combination with type filters (BRDG-153)

### Date grouping
- [x] Conversations are grouped into relative date sections
- [x] Group headers are sticky
- [x] Groups can be collapsed/expanded
- [x] Collapsed state persists across reloads

### Pinned conversations
- [x] Conversations can be pinned/unpinned via context menu
- [x] Pinned section appears at the top of the list
- [x] Maximum 10 pins enforced
- [x] Pin state is stored in the database

## Technical Notes

### Collapsible sidebar
- Use a CSS transition on width for smooth collapse animation
- Collapsed width: ~48px (icon + padding)
- Store state in localStorage key `bridge:sidebar-collapsed`

### Resizable sidebar
- Implement with a mouse-down listener on the drag handle, tracking mouse-move to update width
- Consider using a library like `react-resizable-panels` if already in dependencies, otherwise a lightweight custom hook
- Store width in localStorage key `bridge:sidebar-width`

### Date grouping
- Compute groups client-side from `conversation.createdAt`
- Use `Intl.RelativeTimeFormat` or simple date math for group labels
- Store collapsed groups in localStorage key `bridge:sidebar-groups-collapsed` as `string[]`

### Database changes (pinned)

```sql
ALTER TABLE conversation ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
```

- `PATCH /api/conversations/[id]` already supports updates; extend to accept `pinned`

### Key files
- `src/components/chat/ConversationList.tsx` (main list component)
- `src/components/chat/ChatLayout.tsx` (sidebar container, layout)
- `src/hooks/useConversations.ts` (data fetching, add pin support)

## Related

- BRDG-153 (Filtering & Type Visibility) - search and date grouping complement filtering
- BRDG-154 (Read/Unread & Bulk Actions) - multiselect interacts with the list layout

## Out of Scope

- Drag-and-drop reordering of conversations
- Multiple sidebar panels or tabs
- Conversation folders or custom grouping
