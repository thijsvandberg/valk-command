# BRDG-393: Virtualize the remaining growable lists (Refinement queue, Inbox, Cleanup)

**Status:** To Do
**Priority:** Low

## Description

Follow-up to [BRDG-387](completed/BRDG-387-frontend-memory-guardrails.md). Three growable lists still render every row to the DOM:

- **Refinement queue** — [RefinementTicketList.tsx:196](src/components/refinement-session/RefinementTicketList.tsx#L196), plain `.map()`. **Caveat:** it drives a FLIP reorder animation via `useFlipReorder` ([RefinementTicketList.tsx:86](src/components/refinement-session/RefinementTicketList.tsx#L86)), which measures DOM nodes that windowing would remove. Reconciling virtualization with FLIP is the hard part of this story.
- **Inbox new-stories** — [inbox/page.tsx:87](src/app/(app)/inbox/page.tsx#L87), plain `.map()`. Low-risk `@tanstack/react-virtual` drop-in (no FLIP).
- **Cleanup candidates** — [cleanup/page.tsx](src/app/(app)/cleanup/page.tsx), plain `.map()`. Low-risk drop-in.

## Acceptance Criteria

- [ ] Inbox and Cleanup lists mount only visible rows plus overscan.
- [ ] The Refinement queue is virtualized OR the FLIP animation is reconciled with windowing (or consciously dropped for large lists), with no broken reorder animation.
- [ ] No visual or interaction regression on any of the three lists.

## Technical Notes

- Inbox/Cleanup first (mechanical). Treat RefinementTicketList + FLIP as a separate sub-task; if FLIP cannot coexist with windowing cheaply, gate virtualization to large lists only and keep FLIP for small ones.

## Testing

- Large datasets render a bounded number of row nodes for each list.
- Refinement reorder still animates (or degrades gracefully) without errors.
