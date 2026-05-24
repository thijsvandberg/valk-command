# BRDG-179: Refinement Session Navigation and Completion Rework

**Status:** Not Started
**Priority:** Medium

## Description

As a PO, I want simplified ticket navigation in the refinement session header and a reworked completion flow, so navigating between tickets is lightweight and the session ends with a useful summary.

## Current Issues

- "Done, next ticket" button in the header is heavyweight: it marks completion, updates readiness, and navigates. Navigation should be simple.
- Previous button takes up space in the left section of the header. Navigation belongs near the progress indicator.
- Clicking "Exit" briefly flashes the session summary before navigating away, because `endSession()` sets `sessionActive = false` (triggering the summary render) and then `router.push` immediately replaces it.
- `markComplete` tracking is not very useful; the session summary data it feeds could be derived differently.

## Acceptance Criteria

- [ ] **Compact prev/next arrows**: Add small `<` and `>` navigation buttons directly next to the progress dots (center section of the header). `<` on the left of the dots, `>` on the right. Icon-only, no label.
- [ ] **Remove old navigation buttons**: Remove the "Previous" button from the left header section and the "Done, next ticket" / "End Session" button from the right header section.
- [ ] **Auto-readiness on SP entry**: When story points are filled in (via the StoryPointPicker in the header), automatically update readiness. This should happen on SP change, not on navigation. Remove the readiness update from the navigation handler.
- [ ] **Remove markComplete tracking**: Remove the `markComplete` calls from the navigation handler. Completion tracking per ticket is not needed.
- [ ] **Session summary on finish**: Show the session summary screen when:
  - Clicking `>` on the last ticket (instead of advancing past the queue)
  - Clicking "Exit" at any point
  - Fix the current bug where Exit briefly flashes the summary before navigating: Exit should show the summary and stay there, not immediately navigate away.
- [ ] **Summary close navigates back**: The session summary should have a clear "Close" or "Back to refinement" button that navigates to `/refinement` or the saved session URL.

## Technical Notes

- Navigation arrows: small ghost/icon-only buttons using `ChevronLeft` / `ChevronRight` (size 14), placed in the center section alongside the progress dots and queue dropdown.
- `handleExitSession`: should set session as ended (triggering summary view) but NOT call `router.push`. Navigation happens from the summary screen.
- `handleDoneAndNext`: simplify to just call `nextTicket()`. On last ticket, show summary instead of advancing.
- Auto-readiness: move the readiness update logic into `handleStoryPointsChange` (or fire it as a side effect of SP save success).
- `SessionSummary` component may need a navigation prop/callback for the "close" action.
- Components involved:
  - `src/app/(app)/refinement/session/page.tsx`
  - `src/components/refinement-session/SessionSummary.tsx`
  - `src/contexts/RefinementSessionContext.tsx` (if markComplete is removed from context)

## Dependencies

BRDG-178 (completed)
