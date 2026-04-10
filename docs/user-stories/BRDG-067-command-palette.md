# BRDG-067: Command Palette

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a Cmd+K command palette that lets me search and jump to any page, ticket, conversation, or action so I have one fast entry point for everything.

## Acceptance Criteria

### Phase 1: Palette UI
- [ ] Modal overlay triggered by Cmd+K (Mac) / Ctrl+K (Windows)
- [ ] Search input with auto-focus
- [ ] Results list with keyboard navigation (arrow keys + Enter)
- [ ] Dismiss with Escape or clicking backdrop
- [ ] Smooth open/close animation (opacity + scale transform)

### Phase 2: Page navigation results
- [ ] All main pages searchable: Dashboard, Sprint Board, Chat, Refinement, Test Center, Activity Log, Settings
- [ ] Match by page name or alias (e.g., "board" matches Sprint Board)
- [ ] Results show page icon + name + keyboard shortcut hint

### Phase 3: Ticket search results
- [ ] Search tickets by key or title (uses existing search API)
- [ ] Results show: ticket key, title, status badge
- [ ] Select to navigate to ticket detail page
- [ ] Debounced search (300ms delay)

### Phase 4: Action results
- [ ] "Sync Jira" - trigger a manual sync
- [ ] "New Conversation" - create and navigate to new chat
- [ ] "Toggle Sidebar" - collapse/expand sidebar
- [ ] Actions show a lightning bolt icon to differentiate from navigation results
- [ ] Actions execute immediately on selection

### Phase 5: Conversation search
- [ ] Search conversations by title
- [ ] Results show conversation name + last message preview
- [ ] Select to navigate to conversation

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
