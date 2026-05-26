# BRDG-152: Story Writer Quick Actions

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to be able to perform common ticket management actions directly from the story writer, so I don't have to navigate to the ticket detail page to change sprint, assignee, epic, or story points while I'm writing a story.

## Current State (updated 2026-05-26)

- Epic picker: already in header (added in a72b011)
- TicketStatusPill: already handles status, readiness, issue type
- Sprint badge in header: read-only link to sprint board
- Assignee, Story Points, Business Value, Labels, Creator: not visible
- Flag: not available

## Design Decision (resolved)

Three interaction zones:

### 1. Header badges (quick access)
- **Sprint picker** as a badge (same pattern as EpicPicker: click to open picker, empty badge when unassigned)
- **Story Points** as a compact badge (click to open picker)
- **Business Value** as a compact badge (click to open picker)
- Epic picker (already done)

### 2. "..." dropdown menu
- **Flag/unflag** toggle added to existing dropdown

### 3. New "Meta" pane tab
- A new tab in the pane bar (alongside Chat, Editor, Diff, History, etc.)
- Opens a sidebar-ish pane with full metadata overview:
  - Assignee (picker)
  - Creator (read-only)
  - Labels (editable)
  - Sprint, Epic, SP, BV (also shown here as full overview)

## Acceptance Criteria

- [x] Sprint picker badge in header (replaces read-only link)
- [x] Story points badge in header (click to change)
- [x] Business value badge in header (click to change)
- [ ] Flag/unflag toggle in "..." dropdown menu
- [ ] New "Meta" pane tab with: assignee, creator, labels, and full metadata overview
- [ ] Changes sync to Jira where applicable (sprint, assignee, epic)
- [ ] Changes are reflected immediately via optimistic updates

## Implementation Plan

1. **Extend WriterContext** with `ticketDetail` (full Ticket & TicketDetail) and mutation callbacks (onAssigneeChange, onSprintChange, onStoryPointsChange, onBusinessValueChange, onLabelsChange, onFlagChange, mutateTicket)
2. **Add handler functions** in StoryWriterLayout for all mutations (optimistic state + API calls + SWR revalidation)
3. **Sprint picker badge** in header (replace read-only link with SprintPicker; may need variant/style prop)
4. **Story points badge** in header (StoryPointPicker with size="lg")
5. **Business value badge** in header (add size="lg" variant to BusinessValuePicker first, then integrate)
6. **Flag/unflag toggle** in "..." dropdown menu
7. **Register "meta" PaneAppId** (PaneContext, ApplicationListBar, PaneArea)
8. **Create MetaApp pane** with: assignee picker, creator (read-only), labels, sprint, epic, SP, BV overview

## Technical Notes

- **Existing pickers:** `SprintPicker`, `AssigneePicker`, `EpicPicker`, `StoryPointPicker`, `BusinessValuePicker` are all reusable components
- **Existing API routes:** `/api/jira/move-sprint`, `/api/jira/assign`, `PATCH /api/tickets/[key]` (epicKey, storyPoints, flagged), `PUT /api/tickets/[key]/metadata` (businessValue)
- **API client methods:** `jira.moveSprint()`, `jira.assign()`, `tickets.updateStoryPoints()`, `tickets.updateEpic()`, `tickets.updateMetadata()`, `tickets.toggleFlag()`
- **Key file:** `src/components/story-writer/StoryWriterLayout.tsx` (header with badges and pane system)
- The `ticketData` and `mutateTicket` from `useTicketDetail` are already available in `StoryWriterLayout`

## Related

- BRDG-119 (Quick Actions Panel) - similar goal of reducing context switches, but from the sprint board
- BRDG-051 (Inline Editing) - inline editing on the sprint board

## Out of Scope

- Bulk actions across multiple tickets
- Adding new fields not already in the TicketSidebar
