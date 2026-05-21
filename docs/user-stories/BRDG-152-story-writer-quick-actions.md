# BRDG-152: Story Writer Quick Actions

**Status:** Draft
**Priority:** Medium

## Description

As the PO, I want to be able to perform common ticket management actions directly from the story writer, so I don't have to navigate to the ticket detail page to change sprint, assignee, epic, or story points while I'm writing a story.

Currently the story writer header shows sprint and epic as read-only badges that link to their respective pages. All other metadata (assignee, story points, business value) is only accessible via the TicketSidebar on the ticket detail page. This forces a context switch mid-writing.

## Current Behavior

- Sprint badge in header: read-only, links to sprint board
- Epic badge in header: read-only, links to epic detail
- Assignee: not visible
- Story Points: not visible
- Business Value: not visible
- Flag: not available
- Status/readiness and issue type are already editable via `TicketStatusPill`

## Desired Behavior

The most important ticket metadata fields are accessible and editable directly from the story writer, without leaving the page.

## Actions to support

1. **Move to different sprint** - change the sprint assignment
2. **Change assignee** - assign/unassign team members
3. **Change epic** - move ticket to a different epic
4. **Set story points** - assign/change story point estimate
5. **Set business value** - assign/change business value score
6. **Flag/unflag** - toggle the flagged state

All picker components already exist (`SprintPicker`, `AssigneePicker`, `EpicPicker`, `StoryPointPicker`, `BusinessValuePicker`) and the API routes are in place. This is primarily a UI integration task.

## Open question: interaction pattern

The sprint and epic badges in the header currently serve as navigation links (sprint -> sprint board, epic -> epic detail). Making them clickable to open a picker creates a conflict: click to edit vs. click to navigate.

Options to explore:
- Click to edit, separate small link icon to navigate
- Hover menu with both "Change" and "Go to" options
- Right-click / long-press for edit, normal click for navigation
- Move the editable fields to a different location (toolbar, popover panel, sidebar)
- Keep badges as navigation, add separate edit affordances elsewhere

**This needs to be discussed before implementation.**

## Acceptance Criteria

- [ ] Sprint can be changed from within the story writer
- [ ] Assignee can be changed from within the story writer
- [ ] Epic can be changed from within the story writer
- [ ] Story points can be set from within the story writer
- [ ] Business value can be set from within the story writer
- [ ] Ticket can be flagged/unflagged from within the story writer
- [ ] Navigation to sprint board and epic detail remains possible
- [ ] Changes sync to Jira where applicable (sprint, assignee, epic)
- [ ] Changes are reflected immediately via optimistic updates
- [ ] Interaction pattern for edit vs. navigate is resolved

## Technical Notes

- **Existing pickers:** `SprintPicker`, `AssigneePicker`, `EpicPicker`, `StoryPointPicker`, `BusinessValuePicker` are all reusable components already used in `TicketSidebar`
- **Existing API routes:** `/api/jira/move-sprint`, `/api/jira/assign`, `PATCH /api/tickets/[key]` (epicKey, storyPoints, flagged), `PUT /api/tickets/[key]/metadata` (businessValue)
- **API client methods:** `jira.moveSprint()`, `jira.assign()`, `tickets.updateStoryPoints()`, `tickets.updateEpic()`, `tickets.updateMetadata()`, `tickets.toggleFlag()`
- **Key file:** `src/components/story-writer/StoryWriterLayout.tsx` (header bar with badges, lines 430-715)
- The `ticketData` and `mutateTicket` from `useTicketDetail` are already available in `StoryWriterLayout`

## Related

- BRDG-119 (Quick Actions Panel) - similar goal of reducing context switches, but from the sprint board
- BRDG-051 (Inline Editing) - inline editing on the sprint board

## Out of Scope

- Adding a full sidebar to the story writer (the pane system already handles layout)
- Bulk actions across multiple tickets
- Adding new fields not already in the TicketSidebar
