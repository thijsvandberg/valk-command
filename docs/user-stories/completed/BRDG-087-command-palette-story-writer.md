# BRDG-087: Command palette entry points for Story Writer

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to open a new Story Writer session or jump to an existing one directly from the command palette (Cmd+K), so that I don't need to navigate to the sprint board first to find a ticket and click through to its write page.

## Background

The command palette currently has a "Story Writer" page shortcut that navigates to the Story Writer index view, but it offers no way to start writing immediately. The `SplitStoryPicker` modal (used inside Story Writer) already has the right two modes: create a new Jira story (title + sprint) or link to an existing ticket (key input). The command palette should expose the same flows inline, without requiring a separate modal.

Story Writer sessions are already searchable via the `conversations` result group in the palette, but they surface as plain chat conversations with no visual indication that they are Story Writer sessions.

## Implementation Plan

1. **Phase 2 first** (types + story writer result group): Extend `ResultCategory` with `"story-writer"`, add `StoryWriterResult` type, add `"story-writer"` to `CATEGORY_LABELS`. Fetch active sessions via `/api/story-writer/active-sessions` on palette open. Filter client-side by query (simple includes). Insert between tickets and conversations in `allResults`. Add `StoryWriterResult` cases to `ResultIcon` and `ResultLabel` (emerald accent, ticket key badge, "Story Writer" pill). Update `executeResult` to navigate to `/tickets/[key]/write`.

2. **Phase 1** (New Story action + sub-flow): Add `SubFlowState` discriminated union and `SprintSlot` interface. Add optional `description?` and `opensSubFlow?` fields to `ActionResult`. Add "New Story" action with `opensSubFlow: true`; its `execute` callback sets sub-flow state instead of navigating. Update `executeResult` action case to skip `handleClose()` when `opensSubFlow` is true. Add `useEffect` for lazy sprint fetch (fires only when `subFlow.kind === "new-story"` and `loadingSprints === true`). Modify `handleKeyDown`: when sub-flow is active, Enter calls `handleSubFlowConfirm`, Escape resets sub-flow without closing palette. Render: replace search input row with a back-button breadcrumb; replace results area with mode toggle + form (title+sprint for "create", key input for "existing"). Import `Plus`, `Link`, `ChevronDown`, `ChevronLeft` from lucide-react. API calls: "create" → `POST /api/story-writer/create`, "existing" → `GET /api/tickets/[key]`.

3. **Phase 3** (active session indicator): Import `usePathname` from `next/navigation`. Derive `currentWriterKey` with a useMemo regex match on the pathname. Pass `currentWriterKey` into the "New Story" action's `description` field. In `filteredStoryWriterSessions`, when no query and `currentWriterKey` is set, surface only the current session first. Include `filteredStoryWriterSessions` in the empty-query `allResults` path (after pages + actions).

4. **Tests**: Update `next/navigation` mock to include `usePathname`. Add tests: "New Story" appears in default results; Escape from sub-flow returns to palette (not closes); story writer sessions appear in dedicated group; sessions with `relatedTicket` navigate to `/write`; active session indicator shows current key.

5. **No new API routes needed**: `/api/story-writer/create` (POST), `/api/story-writer/active-sessions` (GET), `/api/sprint-slots` (GET), and `/api/tickets/[key]` (GET) all exist.

## Acceptance Criteria

### Phase 1: "New Story" action in the command palette

- [x] A "New Story" action appears in the Actions group (aliases: "write", "story", "create story", "new story")
- [x] Selecting it transitions the palette into a contextual sub-flow without closing it
- [x] The sub-flow shows the same two-mode toggle as `SplitStoryPicker`: **Create new** / **Use existing**
- [x] **Create new mode:** title field (auto-focused) + sprint selector; confirm with Enter or a "Create" button
  - On confirm, calls the existing story creation API, then navigates to `/tickets/[newKey]/write`
  - Sprint selector is populated from `/api/sprint-slots`, pre-selects the first active sprint
- [x] **Use existing mode:** ticket key input (auto-focused, auto-uppercased); confirm with Enter or an "Open" button
  - On confirm, navigates to `/tickets/[key]/write`
  - Shows an inline error if the ticket is not found locally
- [x] Escape cancels the sub-flow and returns to the normal palette state (not closes the palette entirely)
- [x] Loading state shown while the API call is in progress

### Phase 2: Story Writer sessions in search results

- [x] When the query matches a story writer session, those results appear in a dedicated **Story Writer** result group (above Conversations)
- [x] Each result shows: ticket key badge, story title, and a "Story Writer" label/icon to distinguish it from plain chat
- [x] Selecting a result navigates to `/tickets/[key]/write` and restores the existing session
- [x] Sessions without an associated ticket key are excluded from this group (edge case)
- [x] The group only appears when there are matching results; it does not show an empty state

### Phase 3: Active session indicator

- [x] If a Story Writer session is currently open (i.e., the user is already on `/tickets/[key]/write`), the "New Story" action in the palette shows a secondary hint: "Currently editing [key]"
- [x] The current ticket's session appears first in the Story Writer results group when there is no query

## Technical Notes

- The sub-flow state (mode, field values) should live inside `CommandPalette.tsx` as local state, cleared on close or Escape.
- Reuse `SplitStoryPicker`'s confirm logic (API call + navigation) but inline, not as a separate modal. Extract the shared API call into a helper if needed to avoid duplication.
- Story Writer sessions can be identified by filtering the conversations list for those with a `ticketKey` field set. The conversations API already returns this data.
- The sprint list fetch should happen lazily when the sub-flow opens, not on palette mount.
- Keep palette width unchanged; the sub-flow replaces the results area, it does not expand the palette.

## Out of Scope

- Bulk session management (deleting multiple sessions from the palette)
- Creating a story on an external system other than Jira
- Keyboard shortcut dedicated to "New Story" (outside of the palette)
- Changing the `SplitStoryPicker` modal itself
