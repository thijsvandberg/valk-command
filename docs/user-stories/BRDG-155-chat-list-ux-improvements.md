# BRDG-155: Conversation List UX Improvements

**Status:** Draft
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

## Acceptance Criteria

### Collapsible sidebar
- [ ] Toggle button collapses/expands the sidebar
- [ ] Collapsed state shows icons only
- [ ] `Cmd/Ctrl + B` toggles the sidebar
- [ ] Collapsed state persists across reloads

### Resizable sidebar
- [ ] Drag handle on the right edge allows resizing
- [ ] Width is constrained between 200px and 500px
- [ ] Width persists across reloads
- [ ] Double-click resets to default width

### Search
- [ ] Search input filters conversations by title
- [ ] Search is case-insensitive
- [ ] "No results" state shown when nothing matches
- [ ] Clear button and Escape reset the search
- [ ] Search works in combination with type filters (BRDG-153)

### Date grouping
- [ ] Conversations are grouped into relative date sections
- [ ] Group headers are sticky
- [ ] Groups can be collapsed/expanded
- [ ] Collapsed state persists across reloads

### Pinned conversations
- [ ] Conversations can be pinned/unpinned via context menu
- [ ] Pinned section appears at the top of the list
- [ ] Maximum 10 pins enforced
- [ ] Pin state is stored in the database

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
