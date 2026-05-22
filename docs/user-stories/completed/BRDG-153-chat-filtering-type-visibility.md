# BRDG-153: Chat Conversation Filtering & Type Visibility

**Status:** Done
**Priority:** High

## Description

As the PO, I want to filter conversations by type and see at a glance what kind of conversation each item is, so I can quickly find what I need in a growing list. Currently all conversations look nearly identical: a small icon and a text title. With 50+ conversations, finding a specific Stakeholder report or Investigation among dozens of Task conversations is tedious.

## Current Behavior

- All conversations render with the same styling; only distinction is a subtle icon (MessageCircle vs Search)
- No filter controls exist
- Conversation titles often start with a type prefix ("Task:", "Story Writer:", "Stakeholder:") but these are plain text with no visual emphasis
- Running-task dot is the only visual indicator beyond the title

## Desired Behavior

### Type-specific visual treatment

Each conversation type gets a distinct color accent and icon so you can scan the list visually without reading every title:

| Type | Color accent | Icon |
|------|-------------|------|
| Chat (general) | Neutral/default | MessageCircle |
| Task | Amber | Zap / Play |
| Story Writer | Purple | Pen |
| Stakeholder | Teal | Users |
| Investigation | Blue | Search |
| Sprint Goal | Green | Target |

The accent appears as a left border or subtle background tint on the list item, not just on the icon.

### Filter bar

A compact filter bar above the conversation list with toggleable type pills:

- Each pill shows the type name and a count badge
- Clicking a pill toggles that type on/off
- Multiple types can be active simultaneously (additive filter)
- "All" resets filters
- Active filters are visually distinct (filled vs outlined)

### Filter persistence

- Active filters are stored in `localStorage` so they survive page reloads and navigation
- Key: `bridge:chat-filters`

### Type detection

Conversations should have a derived or stored `category` beyond the current `type` field ("chat" | "investigation"). The category should be determined from:

- `relatedTicket` presence + workspace task skill name (e.g., "story-writer", "stakeholder-analysis", "suggest-sprint-goal")
- Conversation title prefix as fallback
- Explicit `type` field for "investigation"

## Implementation Plan

1. **Category model** (`src/lib/conversation-category.ts`): Define `ConversationCategory` union type, `CATEGORY_CONFIG` with label/icon/color per category, and `deriveCategory()` pure function that detects category from title prefix + type field. Add unit tests.
2. **Filter hook** (`src/hooks/useConversationFilters.ts`): Hook using `useLocalStorage` for persistence. Returns `activeFilters`, `toggleFilter`, `clearFilters`, `categoryCounts`, and `filteredConversations`. Filtering via `useMemo`, client-side only. Add tests.
3. **Filter bar component** (`src/components/chat/ConversationFilterBar.tsx`): Toggleable pills with category icon, label, and count badge. Follows `EpicFilterChips` pattern. Only shows categories with count > 0. Includes "All" reset pill.
4. **Update ConversationList**: Replace generic icons with per-category icons and color accents (left border + colored icon). Accept filter props and render `ConversationFilterBar`. Add "No matching conversations" empty state when filters yield zero results. Update existing tests.
5. **Wire in ChatLayout**: Use `useConversationFilters` hook, pass filtered conversations + filter state to `ConversationList`. Keep `activeConv` lookup on unfiltered list. Update header icon to use category config.
6. **Polish**: Verify all 8 acceptance criteria, run lint/typecheck/test/build.

## Acceptance Criteria

- [x] Each conversation type has a distinct color accent and icon in the list
- [x] A filter bar with type pills is shown above the conversation list
- [x] Each pill shows a count of conversations of that type
- [x] Filters are toggleable; multiple can be active at once
- [x] Active filters persist in localStorage across reloads
- [x] Filtering is instant (client-side, no API call)
- [x] When all filters are off, all conversations are shown (not none)
- [x] Conversation category is reliably derived from skill name, title prefix, or type field

## Technical Notes

- **Key file:** `src/components/chat/ConversationList.tsx` (the sidebar list component)
- **Type field:** `conversation.type` is currently "chat" | "investigation". Rather than migrating the DB, derive category client-side from title prefix + workspace task data
- **Workspace task link:** `workspace_task.skillName` contains values like "story-writer", "suggest-sprint-goal", "stakeholder-analysis" and is linked via `conversationId`
- Consider adding a `GET /api/conversations` query param or a dedicated lightweight endpoint that returns conversation IDs with their resolved category, to avoid N+1 queries
- **localStorage key:** `bridge:chat-filters` storing `string[]` of active type slugs

## Out of Scope

- Full-text search within conversation messages (see BRDG-155)
- Changing conversation types after creation
- Custom user-defined categories
