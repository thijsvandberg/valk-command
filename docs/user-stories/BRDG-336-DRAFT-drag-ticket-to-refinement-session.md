# BRDG-336: Drag a Ticket onto Another Refinement Session

**Status:** Placeholder
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-049 (sprint-board drag-and-drop), BRDG-281 (refinement overview side panel), BRDG-302 (refinement active row indicator)

> Placeholder / draft story. Scope is sketched but not yet refined. Details to be discussed before any implementation.

## Description

As the PO, on the Refinement overview page I want to drag a ticket and drop it directly onto another refinement session shown in the session bar, so I can re-assign or queue a ticket into a different session without opening menus.

Today tickets are moved into a session via the queue panel's "move to session" action (`onMoveToSession` / `handleMoveToSession`). This story adds direct drag-and-drop as a faster, more spatial alternative.

## Drag sources

Two drag origins, both on the overview page (`RefinementPageContent`):

1. **Select ticket list** (`RefinementTicketList`) - the left-column list of available tickets.
2. **Right side panel** (`SidePanel`) - the open ticket's detail panel (the "right sidebar"); dragging its header/ticket key should pick up that ticket.

## Drop target

- The **session bar** at the top of the left column (`SavedSessionList`) - each session row/chip that is "ready" (status `draft` or `in_progress`, not `completed`) becomes a drop target.
- Dropping a ticket onto a session adds its key to that session's `ticketKeys`.

## Acceptance Criteria (draft - to refine)

- [ ] A ticket can be dragged from the select ticket list onto any active session in the session bar
- [ ] A ticket can be dragged from the open right side panel onto any active session in the session bar
- [ ] Valid drop targets highlight on drag-over; the dragged item shows a clear drag preview
- [ ] Dropping adds the ticket to the target session (reuse existing move/add logic, optimistic UI)
- [ ] Dropping a ticket already in the target session is a no-op with subtle feedback
- [ ] Completed sessions are not valid drop targets
- [ ] A toast confirms "Added {KEY} to {session name}"
- [ ] Keyboard / accessibility fallback retained (existing "move to session" action stays)
- [ ] Works alongside the existing queue sortable DnD without gesture conflicts

## Open questions (discuss before build)

- Move vs. copy: does dropping onto another session **move** the ticket out of the current queue/session, or **add** it (ticket can live in multiple sessions, per `ticketSessionMap`)?
- Should dragging from the side panel be the whole panel header or a dedicated drag handle?
- Do we also allow dropping onto the "Plan session" affordance to create a new session from the dragged ticket?

## Technical Notes

- DnD stack already present: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. Sprint board has working drag-and-drop in `useSprintBoardDragDrop.ts` / `DroppableSprintColumn.tsx`; the refinement queue already uses sortable (`SortableQueueItem.tsx`). Reuse these patterns rather than introducing a new library.
- Likely wrap the overview in a `DndContext` and make `SavedSessionList` rows `useDroppable`, ticket list rows + side-panel header `useDraggable`.
- Server side: assigning likely reuses the same path as `handleMoveToSession` / `refinementSessionsApi.update(sessionId, { ticketKeys })`. Confirm whether a dedicated add-ticket endpoint already exists.
- Relevant files: `src/components/refinement-session/RefinementPageContent.tsx`, `SavedSessionList.tsx`, `RefinementTicketList.tsx`, `RefinementQueuePanel.tsx`, `src/components/sprint-board/SidePanel.tsx`.

## Tests

- [ ] Drop from ticket list adds ticket to target session
- [ ] Drop from side panel adds ticket to target session
- [ ] Drop onto a completed session is rejected
- [ ] Duplicate drop is a no-op
- [ ] Existing menu-based "move to session" still works

## Dependencies

None blocking. Coordinate with existing refinement queue DnD to avoid gesture conflicts.
