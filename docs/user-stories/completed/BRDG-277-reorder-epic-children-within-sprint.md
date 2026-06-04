# BRDG-277: Drag-and-drop reorder of epic child issues within a sprint

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a PO, on the epic's Child Issues section (sprint-grouped view), I want to reorder a
child issue relative to the other children of that epic within the same sprint by dragging
it up or down, so I can express the order in which the epic's stories should be picked up.

The view is `EpicChildrenSection` → sprint-grouped mode via `EpicChildrenBySprint`. I only
ever need to order a story relative to a visible sibling of the same epic; I do not see (or
need to see) the other sprint items.

## Current behaviour

- The sprint-grouped epic view already supports dragging a child to **another** sprint
  (`EpicChildrenBySprint` uses `useDraggable` per row + `useDroppable` per group, calling
  `onMoveChild`). There is no way to reorder children **within** a sprint group.
- Epic children are not loaded or displayed in rank order: the query in
  `ticket-detail-builder.ts` (the `epicKey` `findMany`) has no `orderBy`, and the
  `EpicChild` type does not carry `jiraRank`. So the within-group order today is effectively
  DB order, not Jira rank.
- The sprint board already implements within-sprint rank reordering
  (`useSprintBoardDragDrop`): it calls `jira.rank({ rankBeforeKey | rankAfterKey, sprintId })`
  → `POST /api/jira/rank`, which calls Jira's Agile rank API and updates local `jiraRank`.

## Key design note

Jira stores a single global rank per issue (LexoRank), not a per-epic rank. Reordering two
epic children uses `rankBeforeKey`/`rankAfterKey` against the dragged-onto sibling, so the
epic's children end up in the intended relative order. Because we always rank relative to a
visible sibling, we never need the full sprint contents. Side effect to accept: the two
issues also move next to each other in the global sprint ranking, which is standard Jira
behaviour.

## Scope

1. **Load children in rank order.** Add `jiraRank` to `EpicChild` (type +
   `resolveEpicChildren` in `ticket-detail-builder.ts`) and sort the epic-children query by
   `jiraRank`, so the displayed order reflects the real rank.
2. **Reorder within a sprint group** in `EpicChildrenBySprint` (sprint view only). Wrap each
   group's rows in a `SortableContext` and make rows `useSortable`, keeping the existing
   cross-sprint drag-to-another-group behaviour intact.
3. **Persist to Jira.** On a same-group drop, call `jira.rank({ rankBeforeKey | rankAfterKey,
   sprintId })` with the dragged-onto sibling as the anchor (reuse the index/anchor logic
   from `useSprintBoardDragDrop`). Optimistic reorder with revert + error toast on failure.

## Approach

- Extend `EpicChild` with `jiraRank?: number | null`; populate it in `resolveEpicChildren`
  and add `orderBy: asc(jiraRank)` to the epic-children `findMany`.
- In `EpicChildrenBySprint`, run a single `DndContext` that supports both:
  - same-group reorder via `SortableContext` (vertical list) + `useSortable` rows, and
  - existing cross-group move (drop onto a different `DroppableGroup` → `onMoveChild`).
  On drag end, branch on whether source and target groups match: same group → rank reorder;
  different group → existing move path.
- Add an `onReorderChild` (or extend the parent handler) wired from `EpicChildrenSection`
  that calls `jira.rank()` and refetches, mirroring the sprint-board flow (optimistic update,
  revert + toast on error). Reuse `resolveMove` for the closed-sprint guard on cross-group
  drops.
- Keep the existing grip handle; clicks still open the ticket and the 8px pointer threshold
  still distinguishes click from drag.

## Out of scope

- Reordering in the flat list view (mixes sprints; order is ambiguous there).
- A per-epic ordering independent of Jira's global rank.
- Reordering subtasks (covered by the existing subtasks rank flow).
- Dropping into a closed sprint (already rejected by `resolveMove`).

## Implementation Plan

### 1. Data layer: add `jiraRank` to epic children
- `src/types/ticket.ts`: add `jiraRank: number | null` to `EpicChild` (required; forces fixtures to supply it).
- `src/lib/ticket-detail-builder.ts`: in `resolveEpicChildren`, pass `jiraRank: c.jiraRank ?? null`; add `orderBy` to the epic-children `findMany`: rank-null last, then `asc(jiraRank)`, then `asc(jiraKey)` as a deterministic tiebreaker.

### 2. Display + optimistic order (pure helpers)
- New `src/lib/epic-children-reorder.ts`:
  - `computeReorder(groupKeys, activeKey, overKey)` → `{ newOrder, rankBeforeKey?, rankAfterKey? } | null`. Up-drag (`oldIndex > overIndex`) sets `rankBeforeKey = overKey`; down-drag sets `rankAfterKey = overKey`. Null on noop / missing keys.
  - `applyLocalOrder(items, localOrder)` → reorders only the groups present in `localOrder` (stable; unknown/pending keys appended), leaves other groups untouched. Group key = `sprintName ?? UNSCHEDULED_GROUP_KEY`.
- Server returns rank-sorted `items`; `groupChildrenBySprint` preserves input order within a bucket, so display order follows server rank. Pending/locally-added items (no rank) land at the group end.

### 3. SortableContext + sortable rows (`EpicChildrenBySprint`)
- Wrap each group's rows in a per-group `SortableContext` (`verticalListSortingStrategy`, items = group key list).
- Convert `DraggableChildRow` from `useDraggable` to `useSortable`; apply `transform`/`transition` via `ChildIssueRow`'s `style` prop; keep grip as activator. Add `state: group.state` to row `data` so closed-sprint rejection works when dropping onto a row. Pending rows stay plain (non-sortable). Keep `DroppableGroup`, `DragOverlay`, `pointerWithin`, Pointer+Keyboard sensors.

### 4. Drag-end branching
- New prop `onReorderChild({ activeKey, groupKey, sprintName, newOrder, rankBeforeKey?, rankAfterKey? })`.
- In `handleDragEnd`, resolve whether `over.id` is a row key or a group key:
  - over = row, same group → `computeReorder` → `onReorderChild` (not move).
  - over = row, different group → existing `resolveMove` + `onMoveChild`/`onMoveError`.
  - over = group card → existing cross-group move (unchanged; preserves closed/backlog handling).

### 5. Parent reorder handler (`EpicChildrenSection`)
- Add `localOrder: Record<string, string[]>` state. Feed view with `applyLocalOrder(applyLocalMoves(filtered, localMoves), localOrder)`; also apply to `orderedVisibleKeys`.
- `handleReorderChild`: optimistic `setLocalOrder`, resolve sprint *id* from `sprintName` (like `createSprintId`; omit for Unscheduled/backlog), call `jira.rank({ issueKeys:[activeKey], rankBeforeKey, rankAfterKey, sprintId? })`, `onMutate()` on success, revert + `setJiraWarning` on error.
- Reconcile `useEffect` keyed on `items`: drop a group's override once the server rank-sorted group sequence matches it (mirror `localMoves` reconcile).

### 6. Tests
- `epic-children-reorder.test.ts`: `computeReorder` direction/noop/missing; `applyLocalOrder` group-scoped reorder.
- builder: `jiraRank` passthrough + rank-sorted query order (createTestDb + seedTicket).
- `EpicChildrenBySprint.test.tsx`: same-group drop → `onReorderChild`; cross-group drop → `onMoveChild`. Add `jiraRank` to fixtures.
- `EpicChildrenSection.test.tsx`: `handleReorderChild` optimistic+reconcile on success; revert+warning on failure.
- Fix any other `EpicChild` literal fixtures for the new field.

### 7. Risks
- Mixed sortable rows + droppable group cards in one DndContext: branch must disambiguate `over.id` row-vs-group.
- Rows need `state` in their dnd `data` to keep closed-sprint rejection.
- Reorder allowed within any group incl. closed/unscheduled (Jira rank is sprint-state independent); only cross-group moves into closed sprints are rejected.

## Checklist

- [x] Add `jiraRank` to `EpicChild` type, populate in `resolveEpicChildren`, sort epic-children query by rank
- [x] Add `SortableContext` + `useSortable` rows to `EpicChildrenBySprint` (sprint view), preserving cross-sprint move
- [x] Branch drag-end: same group -> rank reorder, different group -> existing move (extracted to pure `resolveDragEnd`)
- [x] Wire reorder handler in `EpicChildrenSection` calling `jira.rank()` with optimistic update + revert/error toast
- [x] Tests: children load in rank order; same-group drop calls `jira.rank` with correct anchor; cross-group drop still moves sprint; closed-sprint drop rejected
- [x] Update relevant docs in `/docs` (documented `/api/jira/rank` and `/api/jira/move-sprint` in api-routes.md)
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass
