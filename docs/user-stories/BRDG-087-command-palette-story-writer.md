# BRDG-087: Command palette entry points for Story Writer

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to open a new Story Writer session or jump to an existing one directly from the command palette (Cmd+K), so that I don't need to navigate to the sprint board first to find a ticket and click through to its write page.

## Background

The command palette currently has a "Story Writer" page shortcut that navigates to the Story Writer index view, but it offers no way to start writing immediately. The `SplitStoryPicker` modal (used inside Story Writer) already has the right two modes: create a new Jira story (title + sprint) or link to an existing ticket (key input). The command palette should expose the same flows inline, without requiring a separate modal.

Story Writer sessions are already searchable via the `conversations` result group in the palette, but they surface as plain chat conversations with no visual indication that they are Story Writer sessions.

## Acceptance Criteria

### Phase 1: "New Story" action in the command palette

- [ ] A "New Story" action appears in the Actions group (aliases: "write", "story", "create story", "new story")
- [ ] Selecting it transitions the palette into a contextual sub-flow without closing it
- [ ] The sub-flow shows the same two-mode toggle as `SplitStoryPicker`: **Create new** / **Use existing**
- [ ] **Create new mode:** title field (auto-focused) + sprint selector; confirm with Enter or a "Create" button
  - On confirm, calls the existing story creation API, then navigates to `/tickets/[newKey]/write`
  - Sprint selector is populated from `/api/sprint-slots`, pre-selects the first active sprint
- [ ] **Use existing mode:** ticket key input (auto-focused, auto-uppercased); confirm with Enter or an "Open" button
  - On confirm, navigates to `/tickets/[key]/write`
  - Shows an inline error if the ticket is not found locally
- [ ] Escape cancels the sub-flow and returns to the normal palette state (not closes the palette entirely)
- [ ] Loading state shown while the API call is in progress

### Phase 2: Story Writer sessions in search results

- [ ] When the query matches a story writer session, those results appear in a dedicated **Story Writer** result group (above Conversations)
- [ ] Each result shows: ticket key badge, story title, and a "Story Writer" label/icon to distinguish it from plain chat
- [ ] Selecting a result navigates to `/tickets/[key]/write` and restores the existing session
- [ ] Sessions without an associated ticket key are excluded from this group (edge case)
- [ ] The group only appears when there are matching results; it does not show an empty state

### Phase 3: Active session indicator

- [ ] If a Story Writer session is currently open (i.e., the user is already on `/tickets/[key]/write`), the "New Story" action in the palette shows a secondary hint: "Currently editing [key]"
- [ ] The current ticket's session appears first in the Story Writer results group when there is no query

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
