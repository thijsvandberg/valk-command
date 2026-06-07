# BRDG-306: Surface the next sprint as a drop zone while dragging in an epic

**Status:** Not Started
**Priority:** Medium
**Type:** Feature
**Related:** BRDG-305 (next-number derivation in the regular sprint series — shared logic), BRDG-268 (epic children drag-between-sprints — the view this extends), BRDG-267 ("By sprint" grouped view)

## Description

As a PO, in the "By sprint" view of an epic's children, when I start dragging a child I want
the **next regular sprint in the series** to appear as an extra drop zone — even when the epic
has no children in it yet — so I can plan a child one sprint forward without reaching for the
right-click menu.

Today the "By sprint" view only renders sprints that already hold children of this epic
(BRDG-267). Drag-and-drop (BRDG-268) can therefore only target those visible groups; moving a
child into a sprint the epic isn't in yet requires the right-click "Move to Sprint" menu. The
most common forward move — "push this one to the next sprint" — should be a direct drag.

So: if the highest regular sprint currently shown is `BT: 140`, then `BT: 141` should appear as
a drop zone during drag (only if that sprint actually exists). In the epic in the screenshot,
the highest regular sprint shown is `BT: 141`, so `BT: 142` should surface as the next drop
zone — and because it is a regular future sprint, it sorts up into the regular series (above any
trailing placeholder group such as `GXP: Backlog`), not at the bottom.

## Behaviour

### Which sprint surfaces

- The "next sprint" is the next number in the **regular sprint series** — the `PREFIX: <number>`
  shape (e.g. `BT: 138`, `BT: 139`). This is the **same series definition as BRDG-305**; reuse
  that logic, do not re-derive it.
- Look only at the sprint groups **currently visible** for this epic (the named groups with
  children). Among those, take the highest regular **numeric** sprint and compute `+1`.
  - Non-numeric / placeholder groups are ignored when finding the highest number — e.g.
    `GXP: Backlog`, `BT: TODO`, and the `Unscheduled` group never count.
  - The prefix comes from the visible regular sprints (here `BT`), not hardcoded. If the visible
    numeric sprints span more than one prefix, use the prefix of the highest-numbered one.
- Surface the candidate **only if a real sprint with that exact name exists** in the already
  plumbed `sprints: Sprint[]` list. If `<PREFIX>: <highest+1>` does not exist, show nothing
  extra. Strictly `+1` — do not skip a gap to `+2`.

### When and where it appears

- The extra group appears **only while a drag is active** (`activeDragKey !== null`). With no
  drag in progress the view is exactly as it is today — no empty future sprint shown.
- It renders as an **empty droppable sprint group** (zero items) using the same group card as the
  real groups, in its correct **chronological position**: as a `future` sprint it orders within
  the regular series (after `BT: 141`), which naturally places it above any trailing
  `backlog`-state placeholder group. This is the "moves up" behaviour the PO described.
- The empty group reads clearly as a drop target (e.g. a muted "Drop here to move to `BT: 142`"
  hint inside the empty body), so it is obvious why it appeared.

### Drop behaviour

- Dropping a child onto the next-sprint group moves it there via the existing path: it resolves
  to the sprint's id through `resolveMove` (the synthetic group carries the real `sprintName` and
  `state: "future"`), then runs `onMoveChild(key, targetSprintId)` with the same optimistic move,
  refetch, and revert-on-error handling as every other drop (BRDG-268).
- After the move and refetch the sprint now has a child, so it renders as a normal group; the
  synthetic empty group is no longer needed.
- If the drag ends anywhere else (or is cancelled), the empty group simply disappears with the
  rest of the drag state. Nothing is created or moved.

## Current state (where this plugs in)

- **Grouped view + drag-drop:** `src/components/ticket-detail/EpicChildrenBySprint.tsx`. Groups
  come from `groupChildrenBySprint(items, sprints)` (`src/lib/epic-children-grouping.ts`); each
  group renders as a `DroppableGroup`. Drag state is `activeDragKey` (set in `handleDragStart`,
  cleared in `handleDragEnd`/`handleDragCancel`). `groups` is built at render (~:304) and consumed
  by `groupCards` (~:432) and `resolveDragEnd`.
- **Move resolution:** `resolveMove` / `resolveDragEnd` in `src/lib/epic-children-move.ts` already
  turn a target group (`{ sprintName, state }`) into a `targetSprintId`, rejecting closed sprints
  and no-ops. A future empty group flows through this unchanged.
- **Sprint metadata:** the `Sprint[]` list (id, name, state, dateRange, startDate) is already
  passed into `EpicChildrenBySprint` as `sprints` — no new fetch. This is where we confirm the
  `+1` sprint exists and read its id/dates.
- **Series parsers (shared with BRDG-305):** `extractTeamPrefix` (`src/lib/sprint-utils.ts`) and
  the sprint-number regex (`src/app/api/velocity/route.ts:17`, `name.match(/[: ]\s*(\d+)/)`). These
  must be the single source of truth for "regular numeric sprint" across BRDG-305 and this story —
  extract a shared helper rather than copying the regex a third time.

## Implementation Plan

1. **Shared series helper (coordinate with BRDG-305).** Put the regular-series number logic in one
   place (`src/lib/sprint-utils.ts` or `sprint-dates.ts`): parse `PREFIX`/number from a sprint
   name, and given a set of names return the highest regular number + its prefix. BRDG-305 uses
   it to suggest the next sprint name on create; this story uses it to find the next-sprint group.
2. **Pure "next sprint group" function + test** — e.g. `nextRegularSprintGroup(visibleGroups, sprints)`
   in `epic-children-grouping.ts`:
   - From the visible **named** groups, find the highest regular numeric sprint (ignore
     non-numeric placeholders and Unscheduled) and its prefix (helper from step 1).
   - Build the candidate name `<PREFIX>: <highest+1>`; look it up in `sprints` by exact name.
   - Return a synthetic empty `ChildGroup` for it (items `[]`, `state`/`dateRange`/`isActive` from
     the matched sprint) **only if** it exists and is not already a visible group; else `null`.
3. **Render it only during drag.** In `EpicChildrenBySprint`, when `activeDragKey !== null` and the
   helper returns a group, append it to the `groups` used for rendering and for `resolveDragEnd`,
   so it is both droppable and a valid move target. Insert it so chronological ordering puts it in
   the regular series (reuse the grouping sort, or splice before backlog/Unscheduled).
4. **Empty-group affordance.** Render the synthetic group's empty body with a clear "drop here"
   hint and the standard hovered-group highlight. No create "+" composer behaviour change needed
   for this story (it is a drag-only affordance).
5. **Drop wiring.** Confirm `resolveDragEnd`/`resolveMove` produce the right `targetSprintId` for
   the synthetic group (future state → allowed; carries real `sprintName`). Reuse `onMoveChild`
   end-to-end — no new move path.
6. **Tests.** Unit: next-sprint derivation (highest numeric + prefix, placeholder/Unscheduled
   excluded, candidate must exist, strict `+1` with no gap-skipping, multi-prefix picks the
   highest one's prefix, returns null when none). Component: the empty group appears only during
   drag, in the regular-series position above a trailing backlog group, and dropping on it calls
   `onMoveChild` with the correct id; nothing shows when the `+1` sprint doesn't exist.

## Acceptance Criteria

- [ ] While dragging a child in the "By sprint" view, the next regular sprint in the series
      (`<PREFIX>: <highest visible number + 1>`) appears as an empty drop zone
- [ ] It appears **only if** that sprint actually exists in the sprint list; strictly `+1`, no
      skipping a missing number to the one after
- [ ] Non-numeric / placeholder groups (`GXP: Backlog`, `BT: TODO`, `Unscheduled`) are excluded
      when determining the highest number, and the prefix is taken from the visible regular
      sprints (not hardcoded)
- [ ] The empty next-sprint group sorts into the regular series (a future sprint above any
      trailing backlog-state placeholder group), matching the screenshot expectation that
      `BT: 142` surfaces above `GXP: Backlog`
- [ ] The empty group is shown only during an active drag; with no drag the view is unchanged
- [ ] Dropping a child onto the empty group moves it via the existing `onMoveChild` path
      (optimistic, refetch, revert-on-error) and the sprint then renders as a normal group
- [ ] Drag cancelled / dropped elsewhere removes the empty group with no side effect
- [ ] Regular-series number derivation is a single shared helper reused by BRDG-305 (not a copied
      regex)
- [ ] Tests cover derivation, drag-only visibility, ordering position, drop wiring, and the
      "next sprint does not exist" case

## Out of Scope

- Showing more than the single next sprint (only `+1`, never a range of future sprints).
- Creating a sprint that doesn't exist yet (this only surfaces sprints that already exist).
- The flat `list` view (unchanged — drag affordances live in "By sprint" only).
- The right-click "Move to Sprint" menu (already covers moving into hidden sprints; unchanged).
- Capacity / pencil planning (BRDG-303) and reordering within a sprint (already shipped).
</content>
</invoke>
