# BRDG-184: Refinement Overview Page Improvements

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want the refinement overview page to give quick access to session history and have a cleaner layout for creating new sessions, so that I can review past refinements and their comments without clutter.

## Acceptance Criteria

### 1. Move "Create session" button into the header bar
- [ ] Remove the standalone "+" button from the session list area
- [ ] Add a "New session" / "+" action in the refinement page header bar
- [ ] If there are no refinement sessions yet, do not show the empty session bar (only the header action)

### 2. Refinement history via overflow menu
- [ ] Add a "..." overflow menu on the refinement overview page
- [ ] The menu contains a "History" or "Past refinements" link
- [ ] The history page/view shows all completed refinement sessions
- [ ] Each historical session shows: name, date, ticket count, and the general comment (from BRDG-183)

## Technical Notes

- Refinement overview page is in `src/components/refinement-session/RefinementPageContent.tsx`
- Session list is already fetched from the API; history view needs to include completed sessions
- Consider whether history is a separate page (`/refinement/history`) or a filtered view on the same page

## Dependencies

- BRDG-183 (refinement session lifecycle, provides general comment and session statuses)
