# BRDG-347: Drag-and-Drop on Large (Virtualized) Sprint Lists

**Status:** Not Started
**Priority:** Medium
**Type:** Investigation + Feature

## Description

As a Product Owner, I want to drag-and-drop tickets within and out of large lists such as `BT: Backlog` (currently 348 tickets), so that I can reorder and move work from the team backlog the same way I can in a small sprint.

Today drag-and-drop (drag handles, in-list reordering, and the drop-zone bar) is silently disabled on any single-sprint view with more than 40 tickets. So on a busy team backlog there are no drag handles at all: you cannot reorder within it, and you cannot drag a row out of it onto another sprint. You can still drag a ticket *into* it from a small sprint, which is asymmetric and confusing.

This story is first an **investigation** into whether DnD can be enabled on large, virtualized lists without a performance regression, then the implementation of whatever approach that investigation validates.

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

- [ ] Does `@dnd-kit` support dragging within a virtualized list (e.g. `@dnd-kit` + the board's virtualizer) without mounting all rows? What is the accepted pattern (measuring droppable rects on scroll, a custom collision detector, auto-scroll while dragging)?
- [ ] Can we decouple the two capabilities: keep **cross-sprint drops** (the drop-zone bar / dragging a row *out*) working on large lists even if **in-list reordering** stays disabled? Dragging out only needs the dragged row mounted, not every target.
- [ ] What is the real performance cost of raising or removing the 40 threshold on a 350+ ticket list (drag start latency, scroll jank, re-render volume)? Establish numbers before deciding.
- [ ] Is rank reorder even meaningful at 350 rows, or should large lists offer a different affordance (e.g. "move to top/bottom", a position input, or keyboard move) instead of free drag?

## Acceptance Criteria

### Investigation
- [ ] A short written finding (in `docs/investigations/`) answering the questions above, with a recommended approach and its performance trade-offs.

### Implementation (scope confirmed by the investigation)
- [ ] On a large single-sprint/backlog view, the user can at minimum drag a row OUT to another sprint (the drop-zone bar appears), or a clearly-equivalent affordance is provided.
- [ ] If in-list reordering is enabled on large lists, dragging stays smooth (no visible jank) on a 350+ ticket list, and ranking persists correctly to Jira.
- [ ] If full DnD is NOT enabled, the UI no longer looks broken: it does not silently omit drag handles with no explanation; an affordance or hint communicates how to move/reorder on large lists.
- [ ] The 40-ticket threshold is either raised with evidence it is safe, made adaptive, or replaced by a virtualization-aware DnD implementation.

### Tests
- [ ] Tests cover the chosen behaviour: that DnD (or the alternative affordance) is available on a list above the old threshold, and that ranking/move still persists.

## Technical Notes
- The gate to change is `jiraRankDndEnabled` / `VIRTUALIZE_THRESHOLD` in `useSprintBoardDragDrop.ts`; the drop-zone bar render gate is in `SprintBoard.tsx` (`dnd.jiraRankDndEnabled && dnd.boardActiveDragId`).
- Reuse the existing move/rank plumbing (`jira.moveSprint` with `position: "top"`, `jira.rank`) — this story is about enabling the *gesture* on large lists, not changing what a move does.
- Relates to the move-to-top and pending-move-overlay work on the sprint board (same move pipeline).
