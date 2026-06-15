# BRDG-347: Drag-and-Drop on Large (Virtualized) Sprint Lists

**Status:** Not Started
**Priority:** Medium
**Type:** Investigation + Feature

## Description

As a Product Owner, I want to drag-and-drop tickets within and out of large lists such as `BT: Backlog` (currently 348 tickets), so that I can reorder and move work from the team backlog the same way I can in a small sprint.

Today drag-and-drop (drag handles, in-list reordering, and the drop-zone bar) is silently disabled on any single-sprint view with more than 40 tickets. So on a busy team backlog there are no drag handles at all: you cannot reorder within it, and you cannot drag a row out of it onto another sprint. You can still drag a ticket *into* it from a small sprint, which is asymmetric and confusing.

This story is first an **investigation** into whether DnD can be enabled on large, virtualized lists without a performance regression, then the implementation of whatever approach that investigation validates.

> Investigation done: [docs/investigations/2026-06-15-dnd-on-large-virtualized-lists.md](../investigations/2026-06-15-dnd-on-large-virtualized-lists.md).
>
> **PO decision (2026-06-15): both are in scope** — (A) dragging a row OUT to another sprint AND (B) reordering within a large (200+) sprint. Long-distance drags rely on drag-to-edge auto-scroll; move-to-top/bottom may be added later as a convenience but the primary ask is working drag reorder on big lists.

## Background

The limit comes from `jiraRankDndEnabled` in `src/components/sprint-board/useSprintBoardDragDrop.ts`:

```ts
const VIRTUALIZE_THRESHOLD = 40;
const jiraRankDndEnabled = (
  sortField === "rank" &&
  !activeViewId &&
  (
    (!isAllView && tickets.length <= VIRTUALIZE_THRESHOLD) ||
    (isAllView && groupBy === "sprint")
  )
);
```

Above 40 tickets the single-sprint view is virtualized (only the visible rows are mounted), and `@dnd-kit` needs the draggable/droppable nodes mounted to track them — hence DnD is turned off rather than rendering against a partial DOM. The drop-zone bar (`SprintDropZoneBar`) is also gated on `jiraRankDndEnabled`, so even cross-sprint drops are unavailable while a large list is the active view.

Measured context (live): `BT: Backlog` returns 348 tickets and the list GET takes ~2s; this is the kind of list where virtualization matters most.

## Investigation questions (do these first)

- [x] Does `@dnd-kit` support dragging within a virtualized list (e.g. `@dnd-kit` + the board's virtualizer) without mounting all rows? What is the accepted pattern (measuring droppable rects on scroll, a custom collision detector, auto-scroll while dragging)?
- [x] Can we decouple the two capabilities: keep **cross-sprint drops** (the drop-zone bar / dragging a row *out*) working on large lists even if **in-list reordering** stays disabled? Dragging out only needs the dragged row mounted, not every target.
- [x] What is the real performance cost of raising or removing the 40 threshold on a 350+ ticket list (drag start latency, scroll jank, re-render volume)? Establish numbers before deciding.
- [x] Is rank reorder even meaningful at 350 rows, or should large lists offer a different affordance (e.g. "move to top/bottom", a position input, or keyboard move) instead of free drag?

## Implementation Plan

Derived from the investigation; both drag-out and in-list reorder are in scope, plus move-to-top/bottom and filter-correct reorder.

1. **Decouple the DnD gate from the 40-row threshold** (`useSprintBoardDragDrop.ts`): `jiraRankDndEnabled` no longer requires `tickets.length <= 40`. This lights up the parent `DndContext`, the `SprintDropZoneBar`, and `externalDnd` on the table for large lists. Keep `TicketTable`'s own virtualization threshold (perf).
2. **Sortable virtualized rows** (`TicketTable.tsx`): when `externalDnd`, the `virtualizedTable` renders `SortableBoardRow` inside `SortableContext items={ticketIds} strategy={() => null}`, composing the sortable `setNodeRef` with the virtualizer `measureElement` ref (+ `data-index`). Spacer rows stay outside the item set. Enables drag-out AND in-list reorder on big lists.
3. **Measuring + auto-scroll** (`SprintBoard.tsx`): add `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` to the parent `DndContext` so target rects refresh as rows mount/unmount during scroll; verify auto-scroll against the external scroll container.
4. **Filter-correct optimistic reorder** (`useSprintBoardDragDrop.ts`, intra-group branch): rebuild the optimistic order against the FULL `apiTickets` list (anchored on the visible `over` neighbour), not the filtered `tickets` array, so hidden tickets are preserved. Server rank is already neighbour-relative (correct).
5. **`rankToBottomOfSprint` / `rankToBottomOfBacklog`** (`jira-client.ts`): mirror the existing top variants with `ORDER BY rank DESC` + `rankIssues(..., rankAfterIssue)`.
6. **`position: "bottom"`** in the move-sprint route (`move-sprint/route.ts`): add the bottom branch. Move-to-top/bottom within a sprint reuses this route with `targetSprintId = current sprint` + `position` (whole-sprint, filter-independent); no rank-route change needed.
7. **Move to top / Move to bottom row actions**: add menu items to the row context menu and handlers (`SprintBoard.tsx`, owns `activeSprintId`) that optimistically re-rank to top/bottom of the full list and call `jira.moveSprint({ targetSprintId: activeSprintId, position })`.
8. **Tests** for: the decoupled gate, sortable virtualized rows above the threshold, filter-correct reorder preserving hidden rows, `rankToBottom*`, the `position: "bottom"` route branch, and the menu actions.

## Acceptance Criteria

### Investigation
- [x] A short written finding (in `docs/investigations/`) answering the questions above, with a recommended approach and its performance trade-offs.

### Implementation (scope confirmed by the investigation)
- [x] On a large single-sprint/backlog view, the user can drag a row OUT to another sprint (the drop-zone bar appears).
- [x] In-list reordering is enabled on large lists and ranking persists correctly to Jira (long jumps via auto-scroll; precise jumps via move-to-top/bottom).
- [x] The DnD enablement no longer depends on the 40-ticket threshold; virtualization stays for perf and the virtualized rows are drag-enabled.
- [x] **Move to top / Move to bottom** row actions rank a ticket to the top/bottom of the whole sprint (filter-independent), via the row context menu.
- [x] **Filter-correct reorder**: reordering with a filter active (only part of the sprint visible) never drops the hidden tickets; the moved row lands relative to the visible neighbour.

### Tests
- [x] Tests cover: DnD available above the old threshold, filter-correct reorder preserving hidden rows, the `position: "bottom"` route branch, and the move-to-top/bottom menu actions. (`rankToBottom*` Jira-client methods mirror the existing top variants and are exercised via the move-sprint route test.)

## Technical Notes
- The gate to change is `jiraRankDndEnabled` / `VIRTUALIZE_THRESHOLD` in `useSprintBoardDragDrop.ts`; the drop-zone bar render gate is in `SprintBoard.tsx` (`dnd.jiraRankDndEnabled && dnd.boardActiveDragId`).
- Reuse the existing move/rank plumbing (`jira.moveSprint` with `position: "top"`, `jira.rank`) — this story is about enabling the *gesture* on large lists, not changing what a move does.
- Relates to the move-to-top and pending-move-overlay work on the sprint board (same move pipeline).
