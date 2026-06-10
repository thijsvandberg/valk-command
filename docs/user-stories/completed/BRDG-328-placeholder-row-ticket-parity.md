# BRDG-328: Placeholder row reads and behaves like a real ticket row

**Status:** Completed
**Priority:** Medium
**Type:** Enhancement
**Follows:** [BRDG-304](BRDG-304-placeholder-tickets.md) (placeholder tickets)

## Description

Forward-planning placeholder rows render next to real ticket rows in the epic single
view. This story makes a placeholder row read and behave like a real ticket row, and makes
placeholders draggable in the epic view (reorder within their block + move between sprint
groups).

## Requirements & outcome

1. **Icon** — replaced `SquareDashed` with `BookDashed` (the dashed mirror of the Bookmark
   icon real story tickets use).
2. **Pill + alignment** — the leading cluster now matches `ChildIssueRow`/`TicketStatusPill`
   list geometry: a dashed bookmark icon + a reserved key column + a status-style
   "Placeholder" pill, plus a reserved selection-checkbox gutter, so the icon and title line
   up with real rows.
3. **Actions** — removed the **Edit** button (the title is already click-to-edit); kept
   **Convert to ticket + Delete**, moved all the way right.
4. **No width change on hover** — actions render in an absolute fade-in overlay
   (`ChildIssueRow.actionsSlot` pattern); the SP/BV cluster stays reachable on top (`z-20`).
5. **Draggable (epic view only)** — placeholders reorder within their block and move between
   sprint groups via drag. They have no Jira rank, so they are their own ordered block (below
   the rank-ordered real rows), ordered by a new `order_index`.

## Implementation

### Data
- `order_index` integer column on `placeholder_ticket` + migration `0075`. `createPlaceholder`
  appends to the end of the sprint group's order; `listPlaceholders` sorts by it; a
  cross-sprint move appends to the target group's order.

### API
- `POST /api/placeholders/reorder` (`{ orderedIds }`) → `reorderPlaceholders()` rewrites
  `order_index` to the supplied order. Cross-sprint move reuses `PATCH /:id` (`sprintId`).
- `usePlaceholders` gains an optimistic `reorder()`.

### UI
- `PlaceholderRow.tsx` — BookDashed, matched leading geometry, reserved checkbox gutter,
  Convert/Delete overlay, drag-handle/style/dndProps support.
- `EpicChildrenBySprint.tsx` — `SortablePlaceholderRow` wrapper + per-group `SortableContext`;
  `handleDragEnd` routes placeholder drags to reorder-within-group or cross-sprint move. The
  Sprint Board (`TicketTable`) stays non-draggable for placeholders.

## Tests
- `placeholder-service.test.ts`: orderIndex on create, list ordering, `reorderPlaceholders`,
  cross-sprint move appends.
- `placeholders/reorder/route.test.ts`: rewrites order; 400 on a non-array body.
- `PlaceholderRow.test.tsx`: BookDashed present, no Edit button, Convert+Delete fire.
- `EpicChildrenBySprint.test.tsx`: placeholder draggable when a reorder handler is wired;
  static otherwise.

## Checklist

- [x] `order_index` column + migration
- [x] reorder API + service + optimistic hook
- [x] BookDashed icon
- [x] leading geometry / pill / alignment parity with `ChildIssueRow`
- [x] remove Edit; Convert + Delete in an absolute overlay (no hover width change)
- [x] draggable placeholders in the epic view (reorder + cross-sprint move)
- [x] tests + docs

## Notes

- The "Placeholder" pill is wider than a short status like "TO DO", so a placeholder title
  can sit a few pixels right of a "TO DO" row's title (and in line with an "IN PROGRESS"
  row) — within the natural status-pill-width variance of real rows.
- Live-drag interaction was verified structurally (handle renders, dnd wiring, optimistic
  reorder) and via unit tests; synthetic browser drag of dnd-kit is not automated.
