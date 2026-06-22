# BRDG-369: Default quick-move options in move menus

**Status:** Completed
**Priority:** Medium
**Type:** UX / Sprint board
**Related:** Consumes the placement rule from [BRDG-370](BRDG-370-unified-sprint-placement-policy.md). Reuses the create-sprint flow from [BRDG-309](completed/BRDG-309-epic-create-sprint-drop-zone.md) / [CreateSprintModal](../../src/components/sprint-board/CreateSprintModal.tsx).

## Description

Moving tickets between sprints is a frequent action (carry-over, replanning), but today
it takes several clicks: open the move menu, choose **Move to Sprint**, then hunt for the
right sprint in the searchable list. We want one-click shortcuts for the destinations a PO
reaches for constantly.

Everywhere a sprint move is offered, show up to **three default quick-move options** above
the existing **Move to Sprint** entry, each labelled with the real destination name:

1. **Move to next sprint** — `<PREFIX>: <N+1>` relative to the selection's current sprint
   (e.g. **Move to "BT: 140"** when the selection is in `BT: 139`).
2. **Move to the active sprint** — the current active sprint, tagged with a small **active**
   marker.
3. **Move to the backlog** — the team backlog (the configurable backlog drop target,
   default `BT: Backlog`; see [BRDG-346](completed/BRDG-346-configurable-backlog-drop-target.md)).

The options are ordered **low-to-high by sprint number** (so the active sprint sits at the
top in the common case), with the backlog last (post-launch tweak).

### Visibility rules

General rule: **never offer a destination the selection is already entirely in.**

- **Move to active sprint** — hidden when all selected items are already in the active
  sprint.
- **Move to backlog** — hidden when all selected items are already in that backlog.
- **Move to next sprint** — shown only when the selection shares **one** regular numbered
  sprint (`<PREFIX>: <N>`); if the selection spans multiple sprints, or is in the
  backlog / a sprint without a parsable number, the relative "next" is ambiguous, so
  **hide it**.
- **De-duplicate:** when two options resolve to the same destination sprint (e.g. the
  selection is in `BT: 139` and `BT: 140` is both "next" and the active sprint), show a
  single option, not two identical rows.

When shown, each label uses the resolved destination sprint's actual name.

### Auto-create the next sprint when it does not exist

(Reverses the original "hide it" rule for a missing next sprint.) If the computed next
sprint (`<PREFIX>: <N+1>`) does **not** yet exist in Jira, still show **Move to next
sprint**. Selecting it opens the [CreateSprintModal](../../src/components/sprint-board/CreateSprintModal.tsx)
**prefilled** with the computed name, exactly like the epic page's "plan next sprint"
drop zone ([EpicChildrenSection](../../src/components/ticket-detail/EpicChildrenSection.tsx)
`handlePlanNextSprint` → `handlePlanSprintCreated`). After the sprint is created, the
selected items are moved into it (with the BRDG-370 placement rule) and a toast confirms.
Cancelling the modal leaves the selection untouched.

## Where it appears

All entry points share `TicketActionMenuContent`, so the menu items live there and each
parent passes in the resolved targets:

- **Single-row right-click menu** — [ticket-action-menu.tsx](../../src/components/sprint-board/ticket-action-menu.tsx)
  (`TicketActionMenuContent`, near the existing `Move to Sprint` / `Move to top` /
  `Move to bottom` items).
- **Bulk action bar** (multi-select) — [BulkActionBar.tsx](../../src/components/sprint-board/BulkActionBar.tsx)
  (`UpdateDropdown`).
- **Epic children menu** — [EpicChildrenSection.tsx](../../src/components/ticket-detail/EpicChildrenSection.tsx)
  (`CursorMenu` wrapping `TicketActionMenuContent`).

## Approach

- **Resolve the targets in the parent**, not the menu. Each parent already knows the
  selected ticket keys and has the sprint list (`useJiraSprints`) plus a sprint-name map.
  Compute, from the selection, a small `quickMoves` descriptor and pass it to
  `TicketActionMenuContent`:
  1. **active sprint** — `sprints.find(s => s.state === "active")` matching the selection's
     team prefix; included unless every selected item is already in it.
  2. **next sprint** — the set of distinct current sprint ids across selected items
     (`ticket.sprintId` / `EpicChild.sprintName`); if that is a single regular sprint,
     derive `<PREFIX>: <N+1>` and resolve it to an existing sprint id, or mark it
     `needsCreate` with the computed name when absent.
  3. **backlog** — the configured backlog drop target; included unless every selected item
     is already in it.
- **Reuse existing helpers** in [sprint-utils.ts](../../src/lib/sprint-utils.ts):
  `isRegularSprint`, `sprintNumber`, `isBacklogSprintName`, and the `<PREFIX>: <N>` parsing
  already used by `nextSprintName` / `latestRegularSprint`. Add a small
  `nextSprintNameFrom(currentName)` (next relative to a given sprint, not the global latest).
- **Render** the quick-move `MenuItem`s above the existing `Move to Sprint` entry, each
  shown only when its target is present.
- **Wire the move** to the existing handler — no new move API. It reuses
  `jira.moveSprint({ issueKeys, targetSprintId, topKeys })` →
  [POST /api/jira/move-sprint](../../src/app/api/jira/move-sprint/route.ts), the same path as
  `handleBulkMoveSprint`. Optimistic board update and toast follow the existing patterns
  (see [optimistic-updates.md](../architecture/optimistic-updates.md)).
- **Wire the auto-create** to `jira.createSprint({ name })` →
  `POST /api/jira/sprints`, via `CreateSprintModal`, then dispatch the move with the
  returned sprint id (mirror `handlePlanSprintCreated`). The board context (SprintBoard /
  EpicChildrenSection) owns the modal state, so the menu only signals "create + move".

## Ranking on move

Each quick move uses the unified placement rule from
[BRDG-370](BRDG-370-unified-sprint-placement-policy.md): a regular sprint lands items at the
**bottom** (In Progress / Testing at the top), the backlog lands them at the **top**. The
action computes `topKeys` via the BRDG-370 helper; it adds no ranking logic of its own.

## Open questions

- **Active sprint with multiple teams.** When sprints from several teams are active at once
  (e.g. `BT: 140` and `GXP: 22`), "the active sprint" should resolve per the selection's
  team prefix. Confirm behaviour when a selection spans teams (likely: hide the active-sprint
  option, like the multi-sprint next-sprint case).
- **Backlog target.** Use the per-account `sprint_board_backlog_drop_target` setting
  (default `BT: Backlog`); if it is unset/unresolved, hide the backlog quick option.

## Implementation Plan

All decision logic lives in one pure module so both parents and the tests share it.

### 1. `nextSprintNameFrom(currentName)` — [sprint-utils.ts](../../src/lib/sprint-utils.ts)
`"<prefix>: <N+1>"` when `isRegularSprint(currentName)`, else `""` (reuse `extractTeamPrefix`/`sprintNumber`). +tests.

### 2. New pure module `src/lib/quick-moves.ts`
```
QuickMoveOption = { id: "next"|"active"|"backlog"; label; targetSprintId: string|null; createName?: string }
computeQuickMoves({ currentSprintNames: (string|null)[], sprints, backlogTargetName }): QuickMoveOption[]
```
Order: next, active, backlog. Rules:
- **next** — only when the selection shares exactly ONE current sprint that `isRegularSprint`; `nextName = nextSprintNameFrom(it)`; resolve to existing id, else `createName: nextName`.
- **active** — only when the selection has exactly ONE team prefix; the active-state sprint of that prefix; omit if all items already in it.
- **backlog** — resolve `backlogTargetName`→id; omit if unresolved or all items already in it. (Uses the named backlog's real id, not the `__backlog__` sentinel.)
- **de-dup** by resolved `targetSprintId` (keep earliest); `createName` options never collide.
Label = `Move to ${name}`. +full unit-test matrix (single/multi-sprint, multi-team, already-there hiding, dedup, missing-next createName, unresolved backlog, empty).

### 3. `TicketActionMenuContent` — [ticket-action-menu.tsx](../../src/components/sprint-board/ticket-action-menu.tsx)
New optional props `quickMoves?: QuickMoveOption[]`, `onQuickMove?: (opt) => void`. Render a `MenuItem` per option ABOVE "Move to Sprint", fenced by a divider. Each item: `onQuickMove(opt); close()`. Backward-compatible.

### 4. Thread props
`BulkActionBar` + its `UpdateDropdown` gain `quickMoves`/`onQuickMove` and forward to the menu. SprintBoard passes them to the bulk bar and row menu; EpicChildrenSection to its bulk + row menus.

### 5. SprintBoard wiring
- `quickMovesFor(targets)` — map each key→current sprint NAME (`sprintNameMap[t.sprintId] ?? null`), call `computeQuickMoves` (`backlogTargetName` already in scope).
- `handleQuickMove(opt, targets)` — `createName` → open new `quickCreate:{name,targets}` modal; else `handleBulkMoveSprint(opt.targetSprintId!, targets)` (BRDG-370 placement already inside).
- Second `CreateSprintModal` for `quickCreate`: on created → fire the move into `String(sprint.id)` then `handleSprintCreated` (slot + navigate); cancel = no-op.

### 6. EpicChildrenSection wiring
- Add `useBacklogDropTarget`. `quickMovesFor(targets)` reads each item's `sprintName` from the local-moves-overlaid list. Dispatch via its own `handleBulkMoveSprint`. Auto-create via a parallel `quickCreate:{name,keys}` modal that injects the sprint into the cache then bulk-moves.

### 7. Tests
`sprint-utils.test` (`nextSprintNameFrom`), new `quick-moves.test` (the matrix), `ticket-action-menu.test` (renders/hides/dedup/divider/click), plus a render-level auto-create check where practical.

### Risks
- **SprintBoard auto-create navigation race:** fire the move before/independently of `navigateToSprint`; pending-move overlay keeps rows visible. (Epic page doesn't navigate.)
- `nextSprintNameFrom("BT: 130 - Align")` → `"BT: 131"` (suffix dropped, consistent with `sprintNumber`).
- Adding `useBacklogDropTarget` to EpicChildrenSection: hook falls back to default `BT: Backlog` if its fetch is unmocked in tests.

## Checklist

- [x] Add `nextSprintNameFrom(currentName)` helper + tests in `sprint-utils.ts`
- [x] Compute a `quickMoves` descriptor (active / next / backlog targets + `needsCreate`) from the selection in `SprintBoard` and `EpicChildrenSection`
- [x] Add the quick-move `MenuItem`s to `TicketActionMenuContent`, de-duplicated, each shown only when its target resolves
- [x] Hide each option when the selection is already entirely in that destination; hide "next" for multi-sprint / backlog / non-numbered selections
- [x] Auto-create: when the next sprint is absent, open `CreateSprintModal` prefilled, then move the selection into the created sprint (reuse the epic-page `handlePlanSprintCreated` flow)
- [x] Wire all three through the bulk action bar (`UpdateDropdown`) and the epic-children menu
- [x] Apply the BRDG-370 placement rule (`topKeys`) on every quick move
- [x] Tests: helper; visibility (already-there hiding, multi-sprint, de-dup); active/next/backlog dispatch; auto-create-then-move
- [x] `lint`, `typecheck`, `test`, `build` pass

**Implementation notes:**
- Shared pure logic in [quick-moves.ts](../../src/lib/quick-moves.ts) (`computeQuickMoves`) +
  [nextSprintNameFrom](../../src/lib/sprint-utils.ts); both parents call `quickMovesFor(targets)`
  and a `handleQuickMove(opt, targets)` dispatcher.
- The backlog quick-move uses the configured backlog's **real sprint id** (not the
  `__backlog__` sentinel), so the move + BRDG-370 placement + toast name all resolve correctly.
- **Auto-create dispatch** is covered by the `computeQuickMoves` `createName` case + the menu
  test asserting `onQuickMove` fires with that option; a full-board mount test of the modal-open
  path was judged too costly for the marginal coverage and skipped.
- SprintBoard auto-create fires the move before `handleSprintCreated` navigates, so the
  pending-move overlay keeps the rows visible.
