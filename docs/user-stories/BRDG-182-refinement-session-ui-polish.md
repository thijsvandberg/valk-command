# BRDG-182: Refinement Session UI Polish

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want the refinement session fullscreen mode to feel polished and consistent so that the interface is intuitive and visually aligned with the rest of Bridge.

## Acceptance Criteria

### 1. Move "Exit" into a "..." overflow menu
- [ ] Replace the visible "Exit" button in the refinement header with a three-dot overflow menu (far right)
- [ ] The overflow menu contains an "Exit session" action
- [ ] On exit, prompt the user: "Save session for later?" with Save / Discard options
- [ ] If saved, the session can be resumed from the refinement overview

### 2. Issue pill: match ticket single view styling
- [ ] The issue pill in the refinement header should match the size and style of the ticket detail view pill (currently it is smaller)
- [ ] Add the PO status badge to the refinement header pill (currently missing; ticket detail view has it)

### 3. Move info button ("i") into the sidebar
- [ ] Remove the standalone "i" icon button from the header action area
- [ ] Add an "Info" tab/item in the right sidebar (alongside Chat, Subtasks, Notes)
- [ ] Clicking "Info" opens the ticket info panel inside the sidebar

### 4. Story point picker: clearer labeling and larger open state
- [ ] Replace the small dot indicators with a clearer visual that communicates "story points" (e.g., a label or number badge)
- [ ] When the story point picker is expanded/opened, render it at a larger size similar to the estimate card shown in the standalone estimate component
- [ ] The collapsed state does not have to be a dot; any compact indicator that reads as "story points" is fine

### 5. Sidebar visual polish and default width
- [ ] Increase the default sidebar width (currently too narrow; content feels cramped)
- [ ] Polish the sidebar styling: spacing, alignment, and visual consistency with the rest of the app
- [ ] Ensure the sidebar content area has proper padding and structure

### 6. Sidebar tab selection: support multiple panels and fix active state
- [ ] Fix the issue where all sidebar tabs appear selected/highlighted simultaneously
- [ ] Only the currently active tab should have the selected visual state
- [ ] Investigate whether multiple sidebar panels can be open at the same time (stacked vertically), or if it should remain single-panel with correct tab switching

## Technical Notes

- Refinement session components are in `src/components/refinement-session/`
- The session page is at `src/app/(app)/refinement/[sessionId]/session/`
- The sidebar and header are part of `RefinementPageContent.tsx`
- Context provider: `src/contexts/RefinementSessionContext.tsx`

## Dependencies

- BRDG-178 (refinement session header redesign)
- BRDG-179 (refinement session nav and completion)
