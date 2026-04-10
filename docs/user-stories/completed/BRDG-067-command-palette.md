# BRDG-067: Command Palette

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want a Cmd+K command palette that lets me search and jump to any page, ticket, conversation, or action so I have one fast entry point for everything.

## Acceptance Criteria

### Phase 1: Palette UI
- [x] Modal overlay triggered by Cmd+K (Mac) / Ctrl+K (Windows)
- [x] Search input with auto-focus
- [x] Results list with keyboard navigation (arrow keys + Enter)
- [x] Dismiss with Escape or clicking backdrop
- [x] Smooth open/close animation (opacity + scale transform)

### Phase 2: Page navigation results
- [x] All main pages searchable: Dashboard, Sprint Board, Chat, Refinement, Test Center, Activity Log, Settings
- [x] Match by page name or alias (e.g., "board" matches Sprint Board)
- [x] Results show page icon + name + keyboard shortcut hint

### Phase 3: Ticket search results
- [x] Search tickets by key or title (uses existing search API)
- [x] Results show: ticket key, title, status badge
- [x] Select to navigate to ticket detail page
- [x] Debounced search (300ms delay)

### Phase 4: Action results
- [x] "Sync Jira" - trigger a manual sync
- [x] "New Conversation" - create and navigate to new chat
- [x] "Toggle Sidebar" - collapse/expand sidebar
- [x] Actions show a lightning bolt icon to differentiate from navigation results
- [x] Actions execute immediately on selection

### Phase 5: Conversation search
- [x] Search conversations by title
- [x] Results show conversation name + last message preview
- [x] Select to navigate to conversation

## Technical Notes

- Fuzzy matching using existing fuse.js dependency
- Result types: pages (static list), tickets (API call), conversations (API call), actions (static list)
- Show pages and actions immediately; show ticket/conversation results after debounce
- Limit to 5 results per category, 15 total
- Portal rendering for proper z-index stacking

## Out of Scope (for now)
- Plugin/extension commands
- Recent actions history
- Command arguments (e.g., "sync sprint 42")
- Nested sub-menus
