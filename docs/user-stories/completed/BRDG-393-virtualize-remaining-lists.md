# BRDG-393: Virtualize the Cleanup candidate list

**Status:** Done
**Priority:** Low

## Outcome

The Cleanup candidate list is now virtualized. (Inbox and the Refinement queue were originally bundled into this story but were **not pursued** and are no longer tracked — the BRDG-387 LRU cap already bounds memory, so these were nice-to-haves rather than fixes.)

## What shipped

Follow-up to [BRDG-387](docs/user-stories/completed/BRDG-387-frontend-memory-guardrails.md). The Cleanup list ([cleanup/page.tsx](src/app/(app)/cleanup/page.tsx)) rendered every candidate row to the DOM. It now windows above 40 rows with `@tanstack/react-virtual`, mirroring the sprint board ([TicketTable.tsx](src/components/sprint-board/TicketTable.tsx)).

Wrinkle: each logical row is a `BoardRow` plus an optional rationale line (two `<tr>`s). Each logical row is wrapped in its own measured `<tbody>` so the virtualizer's total-size math includes both rows — measuring only the `BoardRow` `<tr>` would undercount the rationale rows and drift the scroll. Selection and bulk actions operate on the `rows` data array, so windowing does not affect them.

## Acceptance Criteria

- [x] The Cleanup list mounts only the visible rows plus overscan above the 40-row threshold; below it the plain list is unchanged.
- [x] No visual or interaction regression — unit tests cover windowing wiring, the below-threshold plain path, and selection surviving a row scrolling out of and back into the window; browser-verified at 280 candidates (windowed scroll, rationale lines stay paired with their rows, no layout breakage).

## Tests

- [cleanup/page.test.tsx](src/app/(app)/cleanup/page.test.tsx): windowed render mounts only the window; below-threshold renders all rows; selection survives scroll-out/scroll-in.
