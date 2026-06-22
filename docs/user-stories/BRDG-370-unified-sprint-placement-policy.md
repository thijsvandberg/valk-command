# BRDG-370: Unified placement rule for moving tickets into a sprint

**Status:** To Do
**Priority:** Medium
**Type:** UX / Sprint board
**Related:** move-sprint API, BulkActionBar, ticket-action-menu, MultiSprintView (drag), EpicChildrenSection. Foundation for [BRDG-369](BRDG-369-move-to-next-sprint-quick-action.md) and [BRDG-371](BRDG-371-create-story-sprint-placement.md).

## Description

Today every way of moving a ticket into a sprint ranks it differently:

- The **Move to Sprint** menu picker (single / bulk / epic children) passes **no `position`**,
  so Jira decides placement ([SprintBoard.tsx:689](../../src/components/sprint-board/SprintBoard.tsx#L689),
  [EpicChildrenSection.tsx:878](../../src/components/ticket-detail/EpicChildrenSection.tsx#L878)).
- **Drag onto a sprint** lands at the **top** ([move-sprint/route.ts:41-43](../../src/app/api/jira/move-sprint/route.ts#L41),
  [MultiSprintView.tsx:380](../../src/components/sprint-board/MultiSprintView.tsx#L380)).

We want one consistent rule for "where does a ticket land when it enters a sprint",
applied to **all** move paths.

## The rule

When a ticket is moved into a destination:

- **Backlog destination** (a named backlog like `BT: Backlog`, recognised by
  `isBacklogSprintName`, or the generic `__backlog__`) → **top**.
- **Regular numbered sprint** (`isRegularSprint`, e.g. `BT: 140`) → **bottom**.
- **Status exception:** a ticket whose status is **In Progress** or **Testing**
  (`IN PROGRESS` / `TEST` after `normalizeStatus`) always lands at the **top**, even into a
  regular sprint. In a mixed batch, only those go to the top; the rest follow the
  destination rule (so into a regular sprint: in-flight tickets on top, the others at the
  bottom). Into a backlog everything is top anyway, so the exception changes nothing there.

**Out of scope / unchanged:** the explicit **Move to top** / **Move to bottom** actions
remain manual overrides and keep working exactly as they do now.

## Scope (all move-into-sprint paths)

1. **Move to Sprint picker** — single-row menu, bulk action bar, and epic-children menu
   (all via `TicketActionMenuContent` → `handleBulkMoveSprint`).
2. **Drag onto a sprint** — `MultiSprintView` drop handler and any board drag-to-sprint
   zone. Replaces the current always-top behaviour. Dragging **between two specific rows**
   (an explicit drop position) still honours that exact position — the rule only applies
   to dropping onto a sprint/zone with no in-between target.
3. **The "Move to next sprint" quick action** ([BRDG-369](BRDG-369-move-to-next-sprint-quick-action.md))
   consumes the same policy (its destination is always a regular sprint → bottom, with the
   status exception applying per ticket).

## Approach

- **Shared classifier.** Add a helper that, given the destination sprint name/id and a
  ticket's status, returns `"top" | "bottom"`. Reuse `isBacklogSprintName` /
  `isRegularSprint` ([sprint-utils.ts](../../src/lib/sprint-utils.ts)) and add an
  in-flight status check (`IN PROGRESS`, `TEST`) alongside the existing
  `FINISHED_STATUSES` in [ticket-status.ts](../../src/lib/ticket-status.ts), e.g.
  `IN_FLIGHT_STATUSES` / `isInFlightStatus`.
- **API: allow a split batch.** `POST /api/jira/move-sprint` currently takes one
  `position` for the whole batch. Extend it so a single move can place some keys at the
  top and the rest at the bottom in one operation (e.g. accept `topKeys` / `bottomKeys`,
  or `position: "split"` plus the top subset). The local `jiraRank` reorder block
  ([move-sprint/route.ts:121-143](../../src/app/api/jira/move-sprint/route.ts#L121)) must
  reflect the split so the optimistic board does not snap back. Keep the rank calls
  best-effort / non-fatal, as today.
- **Callers compute the split** from the selection's statuses using the shared helper and
  pass it down. For a backlog destination, all keys → top.
- **Optimistic update** follows the existing pending-edits / `pendingSprintMoves` pattern
  (see [optimistic-updates.md](../architecture/optimistic-updates.md)).

## Open questions

- Drag-between-two-rows: confirmed kept as an explicit position (rule only governs
  drop-onto-zone). Flagging in case any drag path should also force the status exception.

## Implementation Plan

### API body shape for the split

Extend `POST /api/jira/move-sprint` with an optional `topKeys: string[]`, keeping
`position?: "top" | "bottom"` for backward compatibility:

```
{ issueKeys: string[], targetSprintId: string, position?: "top"|"bottom", topKeys?: string[] }
```

Resolution precedence: if `topKeys` is present → **split mode** (`topKeys ∩ issueKeys`
go top, the rest go bottom); else fall back to the existing `position` branch unchanged.
This needs zero changes to the existing `position`-only callers (`handleRankToEdge`,
single-move `handleSprintChange`).

### Local jiraRank reorder (one pass, two groups)

Generalize the reorder block (route.ts ~121-143): partition moved rows into `topRows`
(in `topKeys`, in `issueKeys` order), `bottomRows` (remaining moved keys), and `middle`
(untouched sprint rows in existing rank order); `reordered = [...topRows, ...middle,
...bottomRows]`; reindex `jiraRank` only where changed. `position:"top"/"bottom"` collapse
to this (one group empty). Jira rank calls stay best-effort/non-fatal: rank bottom subset
first, then top subset, so the top subset wins the head of the list.

### `placementForMove` helper

New file `src/lib/sprint-placement.ts` (needs both `sprint-utils` and `ticket-status`):

```
placementForMove(destSprintName: string | null, status: string | null | undefined): "top" | "bottom"
```

- `destSprintName === null` → `top` (backlog sentinel resolved to null by callers)
- `isBacklogSprintName(destSprintName)` → `top`
- `isInFlightStatus(status)` → `top` (status exception)
- `isRegularSprint(destSprintName)` → `bottom`
- any other non-regular named destination → `top` (safe default; never bury a ticket in an unrecognized column)

### Per-caller split computation

| Caller | File / fn | Dest NAME | Status source |
|---|---|---|---|
| Board bulk move | `useTicketActions.ts` `handleBulkMoveSprint` | `sprintNameMap[id]` (new dep), `__backlog__`→null | `apiTickets[].jiraStatus` |
| Board single move | `useTicketActions.ts` `handleSprintChange` | same | the one `moved.jiraStatus` (send `position`) |
| Board drag-onto-zone | `useSprintBoardDragDrop.ts` (slot ~150, group-zone ~194) | `sprintNameMap[id]` (already present) | `apiTickets[].jiraStatus` |
| Epic children | `EpicChildrenSection.tsx` `handleBulkMoveSprint` | `sprintNameForTarget(id, sprints)` (already called) | `mergedItems[].jiraStatus` |
| MultiSprintView drag | `MultiSprintView.tsx` cross-column (~380), only when NO `targetOverKey` | `sprints.find(...)?.name` (already resolved) | `ticketsToMove[].jiraStatus` |

`useTicketActions` gains `sprintNameMap` in `TicketActionsDeps` (passed from `SprintBoard`,
which already builds it).

### Steps (dependency order)

1. `ticket-status.ts`: `IN_FLIGHT_STATUSES` + `isInFlightStatus` (+tests).
2. `sprint-placement.ts` (new): `placementForMove` (+tests).
3. `move-sprint/route.ts`: `topKeys` split mode + generalized reorder (+route.test.ts).
4. `useTicketActions.ts`: add `sprintNameMap` dep; split in `handleBulkMoveSprint`;
   rule in `handleSprintChange`. Pass `sprintNameMap` from `SprintBoard.tsx`.
5. `useSprintBoardDragDrop.ts`: split in slot + group-zone drops (keep cross-group-onto-ticket
   and intra-group reorder as explicit-position, unchanged).
6. `MultiSprintView.tsx`: split in the no-`targetOverKey` cross-column branch (keep the
   `targetOverKey` + `jira.rank` branch unchanged).
7. `EpicChildrenSection.tsx`: split in `handleBulkMoveSprint`.
8. Verify `handleRankToEdge` and drag-between-rows untouched; run lint/typecheck/test/build.

### Risks

- **Behavior change:** a single TO DO/DONE ticket moved into a regular sprint now lands at
  the **bottom** (was top). Intended.
- Optimistic caches inject moved rows at the top; bottom-bound rows show a transient
  top placement until revalidation re-reads server `jiraRank`. Self-heals.
- `useTicketActions.test.ts` / `useSprintBoardDragDrop.test.ts` assert the old
  `position:"top"` payloads and need updating to the `topKeys` shape.

## Checklist

- [x] Add `isInFlightStatus` (`IN PROGRESS`, `TEST`) + `IN_FLIGHT_STATUSES` to `ticket-status.ts` (+ tests)
- [x] Add shared `placementForMove(destSprintName, status)` helper using `isBacklogSprintName` / `isRegularSprint` (+ tests)
- [x] Extend `move-sprint` API to place a top subset and a bottom subset in one batch; reflect in local `jiraRank` reorder (+ route tests)
- [x] Apply policy in `handleBulkMoveSprint` (board + epic children) — compute split from selection statuses
- [x] Apply policy to drag-onto-sprint (`MultiSprintView` / board zones), replacing always-top
- [x] Verify Move to top / Move to bottom and drag-between-rows are unchanged
- [ ] `lint`, `typecheck`, `test`, `build` pass
