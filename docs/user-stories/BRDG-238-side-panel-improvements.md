# BRDG-238: Sprint Board Side Panel Improvements

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the ticket side panel on the Sprint Board to scroll independently, use its width more intelligently, and surface subtasks and related issues, so that I can review and refine a ticket without losing my place in the backlog and without opening the full ticket view.

The side panel (`SidePanel`) currently uses a single vertical scroll for the whole panel, places the Story Points / Business Value cards prominently at the top, and does not show subtasks or linked/related issues (those only exist on the full ticket page). On wide panels the meta fields stay stacked below the description, wasting horizontal space.

## Requirements

### 1. Independent scroll for backlog list and side panel

- The backlog/ticket list (left column) and the side panel (right column) must scroll independently.
- Scrolling inside the side panel must never move the backlog list, and vice versa.
- Each column keeps its own scroll position; switching tickets should not reset the backlog scroll position.

### 2. Responsive two-column layout inside the panel

- Below a width threshold the panel keeps the current single-column layout (description, then meta below).
- At or above the threshold the panel splits into two columns: the main content (title, description, subtasks, related) on the left and a meta sidebar (scores, assignee, sprint, epic, labels, dates, PO metadata) on the right.
- The split must be driven by the actual panel width (the panel is user-resizable), not the viewport width.
- The threshold should be chosen so the two-column mode only kicks in when both columns remain comfortably readable.
- When in two-column mode, the meta sidebar and the main content should scroll together as one panel (single panel scroll is fine here); the requirement in section 1 is about list-vs-panel separation, not splitting the panel's own scroll.

### 3. Show subtasks and related/linked issues

- Show the ticket's subtasks in the panel (reuse `SubtasksSection`).
- Show linked/related issues in the panel (reuse `LinkedIssuesSection`).
- Hide each section when empty (no empty placeholders cluttering the panel).
- Subtask/related rows should link to their ticket the same way the full ticket page does.

### 4. Relocate Story Points / Business Value

- Move the SP and BV cards out of the prominent top position directly under the title.
- In two-column mode they belong in the meta sidebar with the other editable fields.
- In single-column mode they sit within the meta grid (near assignee/sprint/epic), not as the headline element above the description.
- SP and BV must remain inline-editable (keep `StoryPointPicker` / `BusinessValuePicker`).

## Out of scope

- Changes to the full ticket detail page (`/tickets/[key]`).
- Changes to the backlog/list rendering itself beyond the scroll-isolation fix.
- New data sources: subtasks and linked issues come from the existing ticket detail data.
- Redesigning the Confluence / Development footer sections.

## Technical notes

- Side panel: `src/components/sprint-board/SidePanel.tsx` (single scroll at the `overflow-y-auto` container, SP/BV `ScoreCard`s near the top).
- Board layout / column structure: `src/components/sprint-board/SprintBoard.tsx` (list column `flex min-w-0 flex-1 flex-col` and the `SidePanel` sibling inside the `flex min-h-0` row). Verify the `min-h-0` / height constraints so both columns get their own scroll container.
- Reusable sections already exist: `src/components/ticket-detail/SubtasksSection.tsx` and `src/components/ticket-detail/LinkedIssuesSection.tsx`.
- Panel width is tracked in `panelWidth` state (persisted under `sprintBoardPanelWidth`); use it to decide the responsive breakpoint for two-column mode.
- Ticket detail data (subtasks, linked issues) comes via `useTicketDetail(ticket.key)`.

## Checklist

- [ ] Isolate scroll so the backlog list and side panel scroll independently
- [ ] Add width-driven responsive two-column layout (content + meta sidebar) above a threshold
- [ ] Keep single-column layout below the threshold
- [ ] Add subtasks section to the panel (reuse `SubtasksSection`, hide when empty)
- [ ] Add linked/related issues section to the panel (reuse `LinkedIssuesSection`, hide when empty)
- [ ] Relocate SP/BV cards into the meta area (sidebar in two-column mode, meta grid in single-column)
- [ ] Verify SP/BV remain inline-editable after relocation
- [ ] Update/extend `SidePanel.test.tsx` for the new layout and sections
- [ ] Verify visually at narrow and wide panel widths
