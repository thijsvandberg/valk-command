# BRDG-184: Refinement Overview Page Improvements

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want the refinement overview page to give quick access to session history and have a cleaner layout for creating new sessions, so that I can review past refinements and their comments without clutter.

## Implementation Plan

1. **Filter completed sessions out of SavedSessionList** - Pass only draft/in_progress sessions to the tab bar so completed ones only appear in history.
2. **Remove the "+" button from SavedSessionList** - Delete the Plus button and `handleCreate` callback from the session bar component.
3. **Add "New session" button + overflow menu to ViewHeader** - Create `handleCreateSession` in `RefinementPageContent`, add a "New session" button and a `RefinementOverflowMenu` component to the header actions slot.
4. **Create `RefinementOverflowMenu` component** - Dropdown with "Past refinements" link, using the same click-outside pattern as other menus.
5. **Create `/refinement/history` page route** - New page that fetches sessions and filters to completed ones.
6. **Create `RefinementHistoryList` component** - Renders completed sessions showing name, date, ticket count, and general comment.
7. **Update existing tests + add new tests** - Update SavedSessionList tests, add tests for overflow menu and history list.

## Acceptance Criteria

### 1. Move "Create session" button into the header bar
- [x] Remove the standalone "+" button from the session list area
- [x] Add a "New session" / "+" action in the refinement page header bar
- [x] If there are no refinement sessions yet, do not show the empty session bar (only the header action)

### 2. Refinement history via overflow menu
- [x] Add a "..." overflow menu on the refinement overview page
- [x] The menu contains a "History" or "Past refinements" link
- [x] The history page/view shows all completed refinement sessions
- [x] Each historical session shows: name, date, ticket count, and the general comment (from BRDG-183)

## Technical Notes

- Refinement overview page is in `src/components/refinement-session/RefinementPageContent.tsx`
- Session list is already fetched from the API; history view needs to include completed sessions
- Consider whether history is a separate page (`/refinement/history`) or a filtered view on the same page

## Dependencies

- BRDG-183 (refinement session lifecycle, provides general comment and session statuses)
