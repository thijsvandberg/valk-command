# BRDG-393: Virtualize the remaining growable lists (Refinement queue, Inbox, Cleanup)

**Status:** To Do
**Priority:** Low

## Description

Follow-up to [BRDG-387](completed/BRDG-387-frontend-memory-guardrails.md). Three growable lists still render every row to the DOM:

- **Refinement queue** — [RefinementTicketList.tsx:196](src/components/refinement-session/RefinementTicketList.tsx#L196), plain `.map()`. **Caveat:** it drives a FLIP reorder animation via `useFlipReorder` ([RefinementTicketList.tsx:86](src/components/refinement-session/RefinementTicketList.tsx#L86)), which measures DOM nodes that windowing would remove. Reconciling virtualization with FLIP is the hard part of this story.
- **Inbox new-stories** — [inbox/page.tsx:87](src/app/(app)/inbox/page.tsx#L87), plain `.map()`. Low-risk `@tanstack/react-virtual` drop-in (no FLIP).
- **Cleanup candidates** — [cleanup/page.tsx](src/app/(app)/cleanup/page.tsx), plain `.map()`. Low-risk drop-in.

## Implementation Plan (this slice: Cleanup only; Inbox + Refinement deferred)

Opus-planned against the real code. `@tanstack/react-virtual@3.13.23` matches what [TicketTable.tsx](src/components/sprint-board/TicketTable.tsx) already uses in production (the pattern to copy: `VIRTUALIZE_THRESHOLD=40`, `overscan=20`, `ROW_HEIGHT_ESTIMATE=44`, spacer rows, `measureElement`, `scrollMargin`).

1. **Cleanup — GO.** [cleanup/page.tsx](src/app/(app)/cleanup/page.tsx) renders a single flat `rows` array in one `<tbody>`. Virtualize it with the TicketTable pattern, gated above 40 rows so small lists stay byte-for-byte unchanged. Wrinkle: a logical row can be two `<tr>`s (BoardRow + optional rationale line); make each logical row its own measured unit so the virtualizer's total size includes the rationale height (no scroll drift). Reset scroll to top on sort/filter change. Selection/bulk actions operate on the `rows` data array, not the DOM, so they are unaffected by windowing.
2. **Tests.** A >40-row render mounts only a window of `BoardRow`s while the total count badge stays full; a ≤40-row list renders all rows (threshold gate); select-all + bulk actions still cover the full filtered set with only a window mounted.

### Deferred (stay open in this story)
- **Inbox — DEFER.** It renders nested `GroupCard` + per-group `<table><tbody>` blocks. A single virtualizer cannot span multiple `<tbody>` sections with interleaved collapsible headers — the same limitation TicketTable documents for its own grouped view. Needs a flatten-then-virtualize rewrite; pair with BRDG-389's row migration.
- **Refinement queue — DEFER.** Conflicts with the `useFlipReorder` FLIP animation (windowing removes the DOM nodes FLIP measures). Needs a spike to gate virtualization to large lists while keeping FLIP for small ones.

## Acceptance Criteria

- [ ] Inbox and Cleanup lists mount only visible rows plus overscan. <!-- partial: Cleanup done (per-row <tbody> window, threshold 40, tests for windowing + selection-survival). Inbox deferred (nested GroupCard/per-group <tbody> blocks cannot share one virtualizer; needs a flatten-then-virtualize rewrite). -->
- [ ] The Refinement queue is virtualized OR the FLIP animation is reconciled with windowing (or consciously dropped for large lists), with no broken reorder animation. <!-- skipped: conflicts with useFlipReorder (windowing removes the DOM nodes FLIP measures); needs a gating spike. Stays open. -->
- [x] No visual or interaction regression on the Cleanup list (verified: unit tests + browser scroll check; Inbox/Refinement unchanged from before).

## Technical Notes

- Inbox/Cleanup first (mechanical). Treat RefinementTicketList + FLIP as a separate sub-task; if FLIP cannot coexist with windowing cheaply, gate virtualization to large lists only and keep FLIP for small ones.

## Testing

- Large datasets render a bounded number of row nodes for each list.
- Refinement reorder still animates (or degrades gracefully) without errors.
