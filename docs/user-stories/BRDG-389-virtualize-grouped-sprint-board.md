# BRDG-389: Virtualize the grouped Sprint Board

**Status:** To Do
**Priority:** Medium

## Description

Follow-up to [BRDG-387](completed/BRDG-387-frontend-memory-guardrails.md). The flat Sprint Board virtualizes lists over 40 rows ([TicketTable.tsx:384](src/components/sprint-board/TicketTable.tsx#L384) via `@tanstack/react-virtual`), but the **grouped** view (by sprint/epic) renders every row of every group to the DOM. The code documents why: a virtualizer's uniform row-index math is incompatible with multiple `<tbody>` group sections. On a large grouped board this mounts hundreds of rich `BoardRow` components at once, the single largest DOM contributor to the heavy Sprint Board tab observed in BRDG-387.

## Why it was deferred

`TicketTable.tsx` is a ~1000-line component that also owns drag-and-drop (`SortableContext`), group collapse state, pinned sprints, and the flat-composer special case (which itself disables virtualization). Virtualizing across groups needs either a flattened single index space with sticky group-header rows, or a per-group virtualizer with shared scroll math. High risk of regressing DnD and the optimistic overlay, so it warrants its own story with focused testing.

## Acceptance Criteria

- [ ] The grouped Sprint Board mounts only the visible rows plus a small overscan, regardless of total ticket count.
- [ ] Group headers, collapse/expand, pinned sprints, and drag-and-drop reorder/move all still work under virtualization.
- [ ] The optimistic pending-edit/move overlay still applies correctly to virtualized rows.
- [ ] Scroll position is stable across group collapse/expand and refetches.

## Technical Notes

- Primary file: [TicketTable.tsx](src/components/sprint-board/TicketTable.tsx) (grouped path ~L247/L673; flat virtualization ~L384, `VIRTUALIZE_THRESHOLD=40`).
- Consider a flattened row model (group-header rows + ticket rows in one index space) feeding a single `rowVirtualizer`, with sticky headers.

## Testing

- Large grouped dataset renders a bounded number of row nodes.
- DnD within and across groups still reorders/moves; overlay survives.
