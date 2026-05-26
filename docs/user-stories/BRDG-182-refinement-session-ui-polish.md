# BRDG-182: Refinement Session UI Polish

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want the refinement session fullscreen mode to feel polished and consistent so that the interface is intuitive and visually aligned with the rest of Bridge.

## Implementation Plan

### Step 1: Fix Sidebar Tab Selection (AC #5) -- prerequisite for all sidebar work
- Replace three independent booleans (`notesCollapsed`, `subtasksPaneOpen`, `chatPaneOpen`) with a single `activeSidebarPanel: "chat" | "subtasks" | "notes" | "info" | null` in `RefinementSessionContext.tsx`
- Replace three toggle functions with one `toggleSidebarPanel(panel)` action
- Update session page to use new unified panel state for both rendering and button active styling
- Decision: single-panel only (stacked panels would require significant layout rework for marginal benefit)

### Step 2: Move Info Button into Sidebar (AC #2) -- depends on Step 1
- Remove standalone Info button from header left section
- Add Info toggle button in the right-side toggle group (alongside Chat, Subtasks, Notes)
- Export `SessionMetadataPanel` from `SessionTicketView.tsx`
- Render metadata panel in sidebar when `activeSidebarPanel === "info"`
- Remove `metadataExpanded` state and prop

### Step 3: Issue Pill Styling (AC #1) -- independent
- Add `size="lg"` to `TicketStatusPill` in refinement header to match ticket detail view
- Add `onReadinessChange` handler so readiness segment is always visible and interactive

### Step 4: Story Point Picker Enhancement (AC #3) -- independent
- Add `size?: "sm" | "lg"` prop to shared `StoryPointPicker`
- `size="lg"` collapsed: pill-shaped "SP 3" label instead of bare dot
- `size="lg"` expanded: larger buttons (h-10 w-10), "Story Points" heading in popover
- Use `size="lg"` in refinement header

### Step 5: Sidebar Visual Polish (AC #4) -- depends on Steps 1-2
- Increase `DEFAULT_PANE_WIDTH` from 340 to 400, `MIN_PANE_WIDTH` from 280 to 320
- Wrap Notes panel in `SubtasksPaneResizable` (currently hardcoded w-72)
- Consistent heading styles across all sidebar panels

### Files touched
- `src/contexts/RefinementSessionContext.tsx` (Steps 1, 2)
- `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` (Steps 1-5)
- `src/components/shared/StoryPointPicker.tsx` (Step 4)
- `src/components/refinement-session/SessionTicketView.tsx` (Step 2)

## Acceptance Criteria

### 1. Issue pill: match ticket single view styling
- [x] The issue pill in the refinement header should match the size and style of the ticket detail view pill (currently it is smaller)
- [x] Add the PO status badge to the refinement header pill (currently missing; ticket detail view has it)

### 2. Move info button ("i") into the sidebar
- [x] Remove the standalone "i" icon button from the header action area
- [x] Add an "Info" tab/item in the right sidebar (alongside Chat, Subtasks, Notes)
- [x] Clicking "Info" opens the ticket info panel inside the sidebar

### 3. Story point picker: clearer labeling and larger open state
- [x] Replace the small dot indicators with a clearer visual that communicates "story points" (e.g., a label or number badge)
- [x] When the story point picker is expanded/opened, render it at a larger size similar to the estimate card shown in the standalone estimate component
- [x] The collapsed state does not have to be a dot; any compact indicator that reads as "story points" is fine

### 4. Sidebar visual polish and default width
- [ ] Increase the default sidebar width (currently too narrow; content feels cramped)
- [ ] Polish the sidebar styling: spacing, alignment, and visual consistency with the rest of the app
- [ ] Ensure the sidebar content area has proper padding and structure

### 5. Sidebar tab selection: support multiple panels and fix active state
- [x] Fix the issue where all sidebar tabs appear selected/highlighted simultaneously
- [x] Only the currently active tab should have the selected visual state
- [x] Investigate whether multiple sidebar panels can be open at the same time (stacked vertically), or if it should remain single-panel with correct tab switching <!-- Decision: single-panel mode. Stacked panels require significant layout rework for marginal benefit. The new unified activeSidebarPanel state naturally enforces single-select. -->

## Technical Notes

- Refinement session components are in `src/components/refinement-session/`
- The session page is at `src/app/(app)/refinement/[sessionId]/session/`
- The sidebar and header are part of `RefinementPageContent.tsx`
- Context provider: `src/contexts/RefinementSessionContext.tsx`

## Dependencies

- BRDG-178 (refinement session header redesign)
- BRDG-179 (refinement session nav and completion)
