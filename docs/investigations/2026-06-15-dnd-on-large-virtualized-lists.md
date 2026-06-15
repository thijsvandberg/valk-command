# Investigation: Drag-and-drop on large (200+) virtualized sprint lists

**Date:** 2026-06-15
**Supports:** [BRDG-347](../user-stories/BRDG-347-drag-drop-on-large-virtualized-lists.md)
**Question:** How can we enable drag-and-drop on sprint lists with 200+ issues (e.g. `BT: Backlog`, ~348 tickets), where it is currently disabled?

## TL;DR

DnD is disabled above 40 tickets by **two coupled gates**, both keyed on the same threshold. The good news: the board's drag model is already virtualization-friendly (it uses a **null sorting strategy + an insert-line indicator + a `DragOverlay`**, so rows never transform during a drag). Two capabilities should be treated separately:

1. **Drag a row OUT to another sprint** (the reported need: move a backlog item onto a sprint tile). This only needs the dragged row plus the always-mounted drop targets. It is feasible on virtualized lists with low risk and is the recommended first step.
2. **Reorder within the list** on a 200+ list. Technically feasible with `@dnd-kit` + `@tanstack/react-virtual`, but collision detection only sees the mounted (visible + overscan) rows, so long-distance moves require drag-to-scroll, which is poor UX at 350 rows. Pair it with non-drag affordances (move to top/bottom, position input).

## Current state

Two independent gates, both at `tickets.length > 40`:

| Gate | File | What it disables above 40 |
|------|------|---------------------------|
| `jiraRankDndEnabled` | `src/components/sprint-board/useSprintBoardDragDrop.ts:19,51` (`VIRTUALIZE_THRESHOLD = 40`) | The parent `DndContext`, the `SprintDropZoneBar` (cross-sprint drop tiles), and `externalDnd` on the table |
| `enableVirtualization` | `src/components/sprint-board/TicketTable.tsx:98,375` (`VIRTUALIZE_THRESHOLD = 40`) | Renders `virtualizedTable` with **plain `BoardRow`** (no `SortableBoardRow`, no `SortableContext`) instead of the sortable `dndTable` |

Because both flip at 40, a 348-ticket backlog gets: no parent DnD context, no drop-zone bar, and non-draggable rows. Hence "no drag handles".

### How DnD is wired today (the parts that already help us)

- The list is virtualized with `@tanstack/react-virtual` v3 using **spacer rows** for offset (`paddingTop`/`paddingBottom` `<tr>` blocks, `TicketTable.tsx:486-504`), and `measureElement` for dynamic row heights (`TicketTable.tsx:387,494`). Rows stay in normal document flow — they are NOT absolutely positioned.
- When `externalDnd` is on, `SortableContext` uses `strategy={() => null}` (`TicketTable.tsx:560`): **rows do not shift during a drag**. Instead a 1px insert line is drawn on the hovered row (`insertLine` prop), and the dragged item is shown in a `DragOverlay` owned by `SprintBoard` (`SprintBoard.tsx:935-940`, `snapToPointer` modifier).
- The board's `DndContext` (`SprintBoard.tsx:935`) uses a custom `boardCollisionDetection` (`SprintBoardDragDrop.tsx`) that prioritises `pointerWithin` for the `sprint-slot:`/`group-zone:` drop zones and falls back to `closestCenter` for ticket rows.

The crucial point: because the existing model uses a **null sorting strategy + overlay**, there is no transform fight between `@dnd-kit` and the virtualizer's `measureElement`. The single biggest virtualization+DnD gotcha (rows jumping/disappearing because both libraries write transforms) is already avoided by design.

## Why virtualization and DnD conflict (in general)

- DnD needs draggable/droppable nodes **mounted** to register and to measure their rects. A virtualizer mounts only visible + overscan rows.
- Known failure modes (confirmed by community reports): the dragged row disappears when it scrolls out of the window (fixed by a `DragOverlay`, which we already use); and droppable rects go stale as rows mount/unmount during scroll (fixed by `MeasuringStrategy.Always`).
- `SortableContext` wants the full ordered list of item IDs. We already have all IDs (`ticketIds = tickets.map(t => t.key)`), so that part is cheap regardless of how many rows are mounted.

## Approaches

### A. Enable "drag a row OUT to a sprint/backlog" on large lists (recommended first)

Drop targets for a cross-sprint move are the `SprintDropZoneBar` tiles and group zones — these are **always mounted**, independent of the list size. The move only needs: (1) the dragged row to be a draggable, and (2) the parent `DndContext` + drop-zone bar to be active.

What it takes (no in-list reordering yet):
- Let the parent `DndContext` + `SprintDropZoneBar` render on large lists (loosen the `jiraRankDndEnabled` gate so it does not also depend on `<= 40`).
- Make virtualized rows draggable: render them as `SortableBoardRow` (or a thin draggable) so they register with the parent context. Only the ~visible+overscan rows are mounted, which is all we need — the dragged one is mounted, the targets are the tiles.

Risk: **low**. No long-distance measurement needed; the overlay already handles the dragged row leaving the viewport. This directly solves the original complaint (drag `VPL-xxxx` from `BT: Backlog` onto a sprint).

### B. In-list reorder on large lists (feasible, with a UX caveat)

Render the virtualized rows inside the existing `SortableContext` (all `ticketIds`, `strategy={() => null}`), keep the `DragOverlay`, and add to the parent `DndContext`:
- `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` so target rects refresh as rows mount/unmount on scroll.
- Verify `@dnd-kit` auto-scroll works against the **external** scroll container (`scrollContainerRef` / `contentScrollRef`, `TicketTable.tsx:379-389`); auto-scroll is what lets you reach an off-screen drop position.
- Compute the drop index from the `over` row id (already the pattern), not from a sorting-strategy transform.

Risk: **medium**, mostly UX. Collision detection only sees mounted rows, so to move row 5 below row 180 you must drag to the edge and wait for auto-scroll across ~hundreds of rows. That is tedious and error-prone at 348 rows regardless of implementation quality. Performance of the drag itself is fine (only visible rows mounted); the cost is re-measuring on scroll.

### C. Just raise / remove the threshold

Cheapest change, but it only moves the performance cliff and does nothing about approach B's long-distance UX problem. Only sensible after measuring real numbers (drag-start latency, scroll jank) on a 350-row list. Not recommended as a standalone solution.

### D. Non-drag affordances for precise placement (complement, not replacement)

For huge lists, dragging is the wrong tool for "put this at rank 137". Better, and cheap to add:
- "Move to top / move to bottom" (the move pipeline already supports `position: "top"`; a bottom variant is symmetric).
- A small "move to position / after ticket X" input.
- Keyboard move (the board already has keyboard nav scaffolding in `useSprintBoardShortcuts`).
These make 200+ lists usable even if free drag-reorder stays limited.

## Recommendation

Phase it:
1. **Approach A** — enable drag-OUT to a sprint on large lists. Highest value (the reported workflow), lowest risk, reuses the overlay model already in place.
2. **Approach D** — add move-to-top/bottom (and optionally a position input) so precise placement on big lists does not depend on dragging.
3. **Approach B** — only if, after A+D, there is still a clear need for free in-list reorder on big lists. Prototype behind the existing gate and measure before committing.

## Concrete pointers for implementation

- Decouple the two gates: `jiraRankDndEnabled` (`useSprintBoardDragDrop.ts:51-58`) currently bundles "rank sort + not a saved view + small list". For approach A, the cross-sprint drop capability should not require `<= 40`.
- `TicketTable.tsx:862` chooses `virtualizedTable` vs `dndTable`/`plainTable`. The virtualized branch needs to emit sortable/draggable rows and live inside the `SortableContext` for approach A/B.
- Add `MeasuringStrategy.Always` to the parent `DndContext` (`SprintBoard.tsx:935`) for approach B.
- The transform conflict is already avoided (`strategy={() => null}` + `DragOverlay`); preserve that — do NOT switch large lists to `verticalListSortingStrategy`, which would fight `measureElement`.
- Watch the spacer-row layout: the padding `<tr>` blocks (`TicketTable.tsx:486-504`) sit inside the same `<tbody>`; ensure `SortableContext` items map only to ticket rows, not spacers.

## Open questions for the PO

- Is the real need "move items out of the backlog into a sprint" (approach A) or genuine fine-grained reordering inside a 300-item backlog (approach B)?
- For precise placement, is "move to top/bottom" + a position input acceptable instead of free drag across hundreds of rows?

## Sources

- [dnd-kit — sorting strategy for virtualized grids (Discussion #411)](https://github.com/clauderic/dnd-kit/discussions/411)
- [TanStack/virtual — virtualized row disappears during drag (Issue #543)](https://github.com/TanStack/virtual/issues/543)
- [TanStack/table — drag-and-drop with virtualized rows (Discussion #5607)](https://github.com/TanStack/table/discussions/5607)
- [react-beautiful-dnd — virtual lists pattern](https://github.com/hufort/react-beautiful-dnd/blob/master/docs/patterns/virtual-lists.md)
