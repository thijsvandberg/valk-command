# BRDG-268: Move epic child issues between sprints — drag-and-drop + right-click menu

**Status:** Completed
**Priority:** Medium
**Type:** Feature
**Depends on:** BRDG-267 (the "By sprint" grouped view — already present in the codebase as `EpicChildrenBySprint`)

## Description

As a PO, in the "By sprint" grouped view of an epic's children, I want to reassign a child to another sprint directly from the epic detail — by dragging it onto another sprint group, or via a right-click menu — so I can re-plan an epic's roadmap without switching to the sprint board.

Drag-and-drop is the quick gesture between sprints that are already on screen. The right-click menu is the complete path: only sprints that currently hold children of this epic are shown as groups (empty sprints are hidden), so the menu — with its searchable list of all active/future sprints + Unscheduled — is how you move a child into a sprint the epic isn't in yet.

## Context

The grouped view this builds on already exists:
- `src/components/ticket-detail/EpicChildrenSection.tsx` has a `list` / `sprint` view toggle (`useLocalStorage("epic-children-view")`, :87) and renders `EpicChildrenBySprint` (:13, :483) in sprint mode.
- `src/components/ticket-detail/EpicChildrenBySprint.tsx` renders the per-sprint groups; grouping logic is in `src/lib/epic-children-grouping.ts`.
- The sprint list is already fetched here: `useJiraSprints()` + `mapJiraSprints()` (`EpicChildrenSection.tsx:17,89`), giving `Sprint[]` with `id`, `name`, `state` (active/future/closed/backlog), and date range. No new fetch needed.

The move operation already exists and is reusable as-is:
- Client: `jira.moveSprint(data)` → `src/lib/api-client.ts:480`.
- Route: `POST /api/jira/move-sprint` (`src/app/api/jira/move-sprint/route.ts`). Body `{ issueKeys: string[], targetSprintId: string }`. `targetSprintId` is the numeric Jira sprint id as a string, or the special `"__backlog__"` for Unscheduled. It writes to Jira (`moveToSprint` / `moveToBacklog`), updates the local DB `sprintName`, and invalidates the `/api/tickets` cache.

Drag-and-drop tooling is already in the app:
- `@dnd-kit/core` is the library. The sprint board's `useSprintBoardDragDrop.ts` and the ticket-detail `SubtasksSection.tsx` are existing dnd-kit usages to mirror (sensors: `PointerSensor` with `activationConstraint.distance: 8`, plus `KeyboardSensor`).

The right-click menu is largely reuse, not new UI:
- `src/components/sprint-board/ticket-action-menu.tsx` already provides an anchored portal menu (`AnchoredMenu`) with a `Move to Sprint` item and a searchable `SprintSubPanel` (:251) that lists eligible (active/future) sprints. The board wires it from a row via `onRowContextMenu(key, e)` (`TicketRow.tsx:624`).
- `src/components/sprint-board/useTicketActions.ts:128` (`handleMoveSprint(key, sprintId)`) performs the move with the same `jira.moveSprint` call (`sprintId ?? "__backlog__"`).

What's missing: `EpicChildrenBySprint` has no `DndContext`, no draggable rows, no droppable groups, no `onContextMenu` handler, and never calls `jira.moveSprint()`.

## Approach

Both interactions are scoped to the "By sprint" view only (the flat `list` view is unaffected), and both reuse the same `jira.moveSprint` move.

### Drag-and-drop (between visible sprint groups)
- Wrap the grouped list in a `DndContext` with the same sensors the board uses (`PointerSensor` distance 8 + `KeyboardSensor`).
- Make each child row (`ChildIssueRow`) draggable (`useDraggable`), carrying its `key` and current sprint.
- Make each rendered sprint group a droppable (`useDroppable`) keyed by sprint id, with `"__backlog__"` for the Unscheduled group.
- On drop, if the target sprint differs from the source: call `jira.moveSprint({ issueKeys: [key], targetSprintId })`, then `onMutate()` to refetch the epic's children so the row lands in the right group and every group's `GroupStatBar` totals recompute. Optimistically move the row to the target group first; on error, revert and show a warning (reuse the existing error-toast pattern in `EpicChildrenSection`).
- Drag targets are limited to the **sprint groups currently on screen** (which are active/future/closed sprints that already hold children, plus Unscheduled). Empty sprints are hidden in this view, so they are not drag targets — use the context menu to move into them (below). Dropping onto a closed sprint group is rejected (Jira disallows it).
- A drag overlay (`DragOverlay`) shows the row being dragged; highlight the hovered group.
- Keyboard-accessible via `KeyboardSensor` (pick up, move between groups, drop).

### Right-click context menu (move to any sprint, incl. ones not shown)
- Add an `onContextMenu` handler to each child row that opens the existing `ticket-action-menu` anchored at the cursor, mirroring the board's `onRowContextMenu` wiring.
- Reuse the `Move to Sprint` item + searchable `SprintSubPanel` (active/future sprints) and an Unscheduled/backlog option. This is the path to move a child into a sprint that has no children yet (and so isn't shown as a group).
- On select, call `jira.moveSprint({ issueKeys: [key], targetSprintId })` (or reuse `useTicketActions.handleMoveSprint`), then `onMutate()`; same optimistic + revert handling as drag.
- The menu can also surface the other row actions the board's menu already offers (status, readiness, etc.) if they fit here — keep to Move to Sprint for this story unless trivially included.

## Implementation Plan

1. **New pure util + test** — `src/lib/epic-children-move.ts` (+ `epic-children-move.test.ts`). Isolates the testable branch logic from React:
   - `BACKLOG_TARGET = "__backlog__"` constant.
   - `resolveTargetSprintId(group, sprints)` → `sprint.id` for a named group (matched by `sprintName === sprint.name`), or `"__backlog__"` for Unscheduled / unmatched.
   - `resolveMove({ childSprintName, targetGroup, sprints })` → `{ ok: true, targetSprintId }` | `{ ok: false, reason: "noop" | "closed" }` (no-op when target group's sprintName equals the child's current sprintName; rejected when target group `state === "closed"`).
   - `applyLocalMoves(items, localMoves)` → items with `sprintName` overridden per the map (tolerant of plain Subtasks).
2. **Extend `EpicChildrenBySprint` props** — add `onMoveChild(childKey, targetSprintId)` and `onMoveError(message)` (parent owns optimistic state + toast). Keeps the flat list view untouched (it never renders this component).
3. **Optimistic move state in `EpicChildrenSection`** — `localMoves: Record<childKey, sprintName|null>` override applied to the sprint-view items before grouping; `sprintById` lookup turns a `targetSprintId` back into a name (`"__backlog__"` → null). `handleMoveChild` does optimistic set → `jira.moveSprint` → `onMutate()`; on error reverts the entry and sets the amber `jiraWarning`. A `useEffect` on `items` reconciles overrides once the server `sprintName` matches. `GroupStatBar` totals follow automatically from the re-grouped items.
4. **DnD wrapper in `EpicChildrenBySprint`** — `DndContext` with `PointerSensor` (distance 8, mirrors the board) + `KeyboardSensor`. Each rendered group is a droppable keyed by `group.key` carrying `{ sprintName, state }`; each non-pending `ChildIssueRow` is draggable (`useDraggable`, data `{ sprintName }`) with a left grip handle for keyboard activation. `DragOverlay` shows the dragged title; hovered group highlighted. `onDragEnd` runs `resolveMove` → no-op / `onMoveError` (closed) / `onMoveChild`.
5. **Right-click context menu in `EpicChildrenBySprint`** — `rowMenu` state + reuse `CursorMenu` + `TicketActionMenuContent` (only `onMoveSprint` wired → "Move to Sprint" → `SprintSubPanel`, which lists all active/future sprints + Backlog, including sprints not currently shown as groups). Selecting flows through the same `onMoveChild`. Suppressed while a drag is active. Add an optional `onContextMenu` prop to `ChildIssueRow`.
6. **Tests** — util test (Step 1); `EpicChildrenBySprint.test.tsx` (drop calls `onMoveChild`, closed rejected, context menu suppressed during drag, context-menu move into a sprint with no current group); `EpicChildrenSection` optimistic revert on API error.

**Order:** 1 → (2 + 3) → (4 + 5 in parallel) → 6 alongside each.

## Requirements

### Drag-and-drop
- [x] Wrap `EpicChildrenBySprint` in a `DndContext` (sensors mirrored from the board) — active only in `sprint` view
- [x] Child rows draggable; the rendered sprint groups (incl. Unscheduled) droppable, keyed by sprint id / `"__backlog__"` <!-- droppables keyed by group key (sprint name / UNSCHEDULED); resolved to the sprint id / "__backlog__" in resolveMove on drop -->
- [x] On drop to a different sprint, call `jira.moveSprint({ issueKeys: [key], targetSprintId })` and `onMutate()` to refetch
- [x] Optimistic move with revert + warning toast on failure
- [x] Drag overlay + hovered-group highlight; keyboard-accessible drag
- [x] Dropping on the source group is a no-op; dropping on a closed-sprint group is rejected

### Right-click context menu
- [x] `onContextMenu` on each child row opens the existing `ticket-action-menu` at the cursor (reuse `CursorMenu` + `TicketActionMenuContent`/`SprintSubPanel`)
- [x] `Move to Sprint` lists active/future sprints (searchable) + an Unscheduled/backlog option, including sprints not currently shown as groups
- [x] Selecting a sprint calls `jira.moveSprint` + `onMutate()`, with the same optimistic + revert handling
- [x] Context menu does not fire while a drag is active (mirror `TicketRow.tsx:627`)

### Shared
- [x] `GroupStatBar` totals (items / Σ SP / Σ BV / status counts) update for both source and target groups after a move
- [x] No drag affordance and no context menu change in the flat `list` view (kept exclusive to the "By sprint" view; the list view passes no `onMoveChild`)
- [x] Tests: move computes the correct `targetSprintId` (incl. `"__backlog__"`), no-op on source group, closed sprints rejected, optimistic revert on API error, context-menu move into a sprint with no current children

## Decisions (resolved)
- **Two ways to move:** drag-and-drop between visible sprint groups, plus a right-click context menu — both in this story.
- **Empty sprints are hidden** in the "By sprint" view (only sprints with children of this epic render). Moving a child into a sprint that isn't shown is done via the context menu's searchable sprint list, not drag-and-drop.
- **Scope:** both interactions live only in the "By sprint" view; the flat list is untouched (pending the Open question below).
- **Move mechanism:** reuse `jira.moveSprint` / `POST /api/jira/move-sprint` exactly as the board does — no new endpoint. The context menu reuses `ticket-action-menu` / `SprintSubPanel`.
- **Drag targets:** the sprint groups currently on screen + Unscheduled; closed-sprint groups reject the drop.

## Open questions (need PO input)
- Should the flat `list` view also get the same right-click "Move to Sprint" menu, or keep it exclusive to the "By sprint" view?
- Should moving a child that has open subtasks warn, or just move (subtasks follow their parent's sprint in Jira)?
- Multi-select move (several children at once) now, or single-item for v1? (`moveSprint` already takes an array, so multi is cheap to add later.)

## Out of scope
- Reordering children within a sprint (ranking). This story only changes which sprint a child belongs to.
- Drag-and-drop in the horizontal roadmap (B) views — separate work.
- Capacity / penciled-in items (tracked separately, see BRDG-267 follow-ups).
