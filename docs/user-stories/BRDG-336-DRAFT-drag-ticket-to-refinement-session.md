# BRDG-336: Drag a Ticket onto Another Refinement Session

**Status:** Refined
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-049 (sprint-board drag-and-drop), BRDG-281 (refinement overview side panel), BRDG-302 (refinement active row indicator)

> Open questions resolved on 2026-06-12 (see Decisions). Ready for build once approved.

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

## Implementation Plan

### Architecture

One new overview-level `DndContext` in `RefinementPageContent.tsx` wrapping session bar + ticket list + side panel, kept **separate** from the queue's existing sortable `DndContext` (inside `RefinementQueuePanel.tsx`) so the two never share draggables/droppables and gesture conflicts are impossible. A new hook `src/hooks/useRefinementDragDrop.ts` (mirrors `useSprintBoardDragDrop.ts`) owns sensors (PointerSensor distance 5 + KeyboardSensor), `activeDragKey`, `overSessionId`, collision detection (`pointerWithin` for `session:<id>` / `plan-session` droppables), and drag handlers that call injected `onMove` / `onCreateFromTicket` / `onDuplicate` callbacks.

Key facts from exploration:
- The queue IS the active session's `ticketKeys` (`useRefinementQueue`); `handleMoveToSession` in `RefinementPageContent.tsx` already removes from the active queue and appends to the target via `refinementSessionsApi.update` with optimistic `mutateSessions` — reuse it, extended with a `sourceSessionId` so a ticket dragged from a non-active session is also stripped from that source (true move semantics).
- PATCH `/api/refinement-sessions/[id]` already accepts `ticketKeys`; POST create accepts `{ name?, ticketKeys? }` — no new endpoints.
- `ChildIssueRow` already supports a `dragHandleSlot` prop (hover-revealed left-gutter handle, hidden during multiselect) — exact fit for the per-item drag handle decision.
- `SidePanel.tsx` is shared with the sprint board; it gets an optional `dragHandle?: React.ReactNode` prop so it stays dnd-agnostic. The refinement page supplies a `useDraggable` handle created under its own `DndContext`.
- Drag preview: `DragOverlay` with the existing `snapToPointer` modifier + `DragGhostOverlay` from the sprint board.

### Order

1. `useRefinementDragDrop.ts` (new hook) + unit tests
2. `SavedSessionList.tsx` — droppable session chips, drag-start base affordance + drag-over stronger highlight, completed sessions excluded
3. `RefinementTicketList.tsx` — per-row drag handle via `dragHandleSlot` + `useDraggable`
4. `RefinementPageContent.tsx` — DndContext + DragOverlay, move/duplicate/create wiring, "Plan session" droppable, toasts
5. `SidePanel.tsx` — optional `dragHandle` prop, supplied from the refinement page
6. Final verification

### Decisions taken during planning

- "Move" also strips the ticket from a non-active source session (carried via draggable `data.sourceSessionId`); for tickets in no session, move degenerates to add.
- Dropping on "Plan session" creates the session (no name, like Save-as-session) and stays on the current view with a toast; no auto-navigation.

## Acceptance Criteria

- [x] A ticket can be dragged from the select ticket list onto any active session in the session bar
- [x] A ticket can be dragged from the open right side panel onto any active session in the session bar
- [x] All valid drop zones become visually recognizable the moment a drag starts (not only on drag-over); drag-over adds a stronger highlight, and the dragged item shows a clear drag preview
- [x] Dropping **moves** the ticket: it is added to the target session and removed from its current session/queue (optimistic UI)
- [x] Dropping a ticket already in the target session is a no-op with subtle feedback
- [x] Completed sessions are not valid drop targets
- [x] Dropping onto the "Plan session" affordance creates a new session containing the dragged ticket
- [x] A toast confirms "Moved {KEY} to {session name}"
- [x] Keyboard / accessibility fallback retained (existing "move to session" action stays)
- [x] Works alongside the existing queue sortable DnD without gesture conflicts

## Decisions (PO, 2026-06-12)

- **Move, not copy:** dropping a ticket onto another session removes it from its current session/queue.
- **Drag handle per item:** each draggable ticket (list rows and the side panel) gets a dedicated drag handle per item, not a draggable panel header.
- **"Plan session" is a drop target:** dropping a ticket there creates a new session from it.
- **Drop zones must be immediately recognizable:** as soon as a drag starts, all valid drop targets get a visible affordance.

## Technical Notes

- DnD stack already present: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. Sprint board has working drag-and-drop in `useSprintBoardDragDrop.ts` / `DroppableSprintColumn.tsx`; the refinement queue already uses sortable (`SortableQueueItem.tsx`). Reuse these patterns rather than introducing a new library.
- Likely wrap the overview in a `DndContext` and make `SavedSessionList` rows `useDroppable`, ticket list rows + side-panel header `useDraggable`.
- Server side: assigning likely reuses the same path as `handleMoveToSession` / `refinementSessionsApi.update(sessionId, { ticketKeys })`. Confirm whether a dedicated add-ticket endpoint already exists.
- Relevant files: `src/components/refinement-session/RefinementPageContent.tsx`, `SavedSessionList.tsx`, `RefinementTicketList.tsx`, `RefinementQueuePanel.tsx`, `src/components/sprint-board/SidePanel.tsx`.

## Tests

- [x] Drop from ticket list moves ticket to target session (added to target, removed from source)
- [x] Drop from side panel moves ticket to target session
- [x] Drop onto a completed session is rejected
- [x] Drop onto "Plan session" creates a new session containing the ticket
- [x] Duplicate drop is a no-op
- [x] Existing menu-based "move to session" still works

## Dependencies

None blocking. Coordinate with existing refinement queue DnD to avoid gesture conflicts.
