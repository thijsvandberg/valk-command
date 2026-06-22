# BRDG-373: Inbox row context menu + full bulk actions

**Status:** Not Started
**Priority:** Medium
**Type:** Feature / UX — Inbox

## Description

The `/inbox` page renders the same `BoardRow` as the Sprint Board, but it is the only
surface where the row actions are missing: there is **no right-click context menu**, and
the multi-select bar offers **only "Mark as read"**. The PO wants the inbox to expose the
same actions as the board, **with the move actions as the headline use case** (triaging a
new story usually means parking it in the right sprint or the backlog).

Rather than build an inbox-specific subset, **reuse the board's full action set**. Subsetting
the shared menu would be *more* work than wiring it whole, and it gives the PO every action
in one place. "Mark as read" stays the prominent, inbox-specific action alongside the reused
ones.

## Current Behaviour

[src/app/(app)/inbox/page.tsx](../../src/app/(app)/inbox/page.tsx):

- Maps `NewStoryRow[]` through `rowToTicket()` into lightweight `Ticket`s and renders
  `BoardRow` in a flat `<table>`. **`onRowContextMenu` is never passed**, so right-click does
  nothing.
- The bottom bar (lines ~399–443) is a **bespoke inline bar**: select-all, an "X/Y selected"
  counter, **Mark as read**, and Clear. It does **not** use the shared `BulkActionBar`.
- `rowToTicket()` hardcodes `readiness: null`, `poStatus: null`, `businessValue: null`,
  `flagged: false`, `notes: ""`, and stores the **sprint name in `sprintId`** (the inbox has
  no real sprint ids). PO metadata (readiness/poStatus/notes) is already saved via
  `saveTicketMetadata` from the side panel.

The board, by contrast, already has the full surface:

- **Right-click menu** — `SprintBoard` keeps `rowMenu: { x, y, targets }` state, sets it from
  `BoardRow`'s `onRowContextMenu`, and renders
  [`CursorMenu`](../../src/components/sprint-board/ticket-action-menu.tsx) wrapping
  `TicketActionMenuContent`.
- **Bulk bar** — [`BulkActionBar`](../../src/components/sprint-board/BulkActionBar.tsx) with
  an Update dropdown (status, readiness, epic, quick-moves, move-to-sprint, assignee, labels,
  flag), AI Assist (review, generate subtasks), Copy List, Refresh, Add to Refinement.
- **Dispatch** — [`useTicketActions`](../../src/components/sprint-board/useTicketActions.ts)
  owns the per-row and bulk handlers (`handleBulkSetStatus`, `handleBulkMoveSprint`,
  `handleBulkUpdateAssignee`, …) with optimistic edits via `pendingTicketEdits` /
  `pendingSprintMoves` (see [optimistic-updates.md](../architecture/optimistic-updates.md)).
- **Quick-moves (BRDG-369)** — `computeQuickMoves` ([quick-moves.ts](../../src/lib/quick-moves.ts))
  needs the live sprint list (`useJiraSprints`) and the backlog target
  (`useBacklogDropTarget`); auto-create uses `CreateSprintModal`.

## Proposed Approach

Reuse the board's presentation components and dispatch hook on the inbox; add the wiring that
only `SprintBoard` has today.

1. **Right-click menu.** Add `rowMenu` state + a `handleRowContextMenu(key, e)` to the inbox,
   pass it as `onRowContextMenu` to `BoardRow`, and render `CursorMenu` + `TicketActionMenuContent`
   exactly like `SprintBoard` does. Targets = the current selection if the right-clicked row is
   in it, otherwise just that row (mirror the board).
2. **Bulk bar.** Replace the bespoke inline bar with the shared `BulkActionBar`, and **add a
   "Mark as read" action** to it (the board's `BulkActionBar` has no such action today — see
   Open Questions on whether to add it as a first-class prop or render it as an inbox extra).
   Keep the existing optimistic-drop + undo toast.
3. **Dispatch.** Drive both surfaces with `useTicketActions`. **Caveat:** the hook expects
   `apiTickets: Ticket[]` + `mutateTickets: KeyedMutator<Ticket[]>`, but the inbox cache is
   `NewStoriesResponse` (`{ rows: NewStoryRow[] }`). This shape mismatch is the integration
   cost of this story and the reason [[BRDG-374-extract-shared-row-actions-module]] exists. If
   374 lands first, the inbox consumes the generalised module directly; if this ships first,
   adapt here with a `Ticket[]` view + a mutator that maps edits back into `NewStoriesResponse`.
4. **Move targets.** Fetch `useJiraSprints` + `useBacklogDropTarget` on the inbox; add
   `quickMovesFor(targets)` + `handleQuickMove` + a `CreateSprintModal` for auto-create,
   reusing the board pattern. Move dispatch is `jira.moveSprint({ issueKeys, targetSprintId,
   topKeys })` — it only needs issue keys, so the inbox's lack of real sprint ids is fine.
5. **Stay-in-inbox semantics.** Moving a story to a sprint is **not** the same as reading it:
   moved rows stay in the inbox (still unread) with their sprint chip updated. Only "Mark as
   read" removes a row. Confirm this is the intended behaviour.

## Implementation Plan

Decided after an Opus plan + codebase verification. **Key deviation from the initial plan:**
do NOT drive the inbox through the board's `useTicketActions`. That hook is bound to the
board's `Ticket[]` caches: `saveTicketMetadata(key, patch, activeListKey)` does
`globalMutate(activeListKey, (cur: Ticket[]) => cur.map(...))` and `handleBulkMoveSprint`
injects into `/api/tickets?sprintId=...` — so reusing it from the inbox would optimistically
patch the **board's own caches** (an AC #8 violation) or throw on the `NewStoriesResponse`
shape. Instead mirror the **self-contained action layer in `EpicChildrenSection`** (which
deliberately does NOT use `useTicketActions`): a `runBulk` + local optimistic overlay +
`mutateList()` pattern that touches nothing the board reads. This duplication is the explicit
cost of shipping BRDG-373 before [[BRDG-374-extract-shared-row-actions-module]], which collapses it.

**A. New co-located hook `src/app/(app)/inbox/useInboxRowActions.ts`** (mirrors EpicChildrenSection's
handlers, adapted to `NewStoryRow[]` + `mutateList`). Owns: `useJiraSprints`/`mapJiraSprints`,
`useBacklogDropTarget`, `useSprintSlots` (pinned order), `localMoves` overlay (key -> new sprint
name) + self-heal effect, `rowMenu` state + `handleRowContextMenu` (targets = selection-if-in-it-
else-single, AC #6), `rowMenuFlagState` (`"mixed"` — `NewStoryRow` carries no `flagged`),
`refine`/`quickCreate`/`pendingPlanSprintName` state, and the dispatch handlers `handleBulkStatus`
(`apiFetch .../status`), `handleBulkReadiness`/`handleBulkEpic`/`handleBulkLabels`
(`tickets.updateMetadata`/`updateEpic`/`updateLabels`, label "add" reads via `tickets.get`),
`handleBulkAssignee`/`handleBulkFlag` (`jira.assign`/`tickets.toggleFlag`), `handleBulkMoveSprint`
(`localMoves` + `topKeysForMove` + `jira.moveSprint` + `mutateList`, revert on error),
`quickMovesFor`/`handleQuickMove` (`computeQuickMoves` + `CreateSprintModal` auto-create),
`handleBulkReview`/`handleBulkGenerate`/`handleCopySelected`/`openRefine`.

**B. Stay-in-inbox semantics (AC #7).** A move records `localMoves[key] = destName`; `rowToTicket`
applies it (`sprintId`/`sprintDisplayName = localMoves[key] ?? row.sprintName`) so the chip updates
and the row stays. `sprintNameMap` gains real sprint `id -> name` entries (from `useJiraSprints`)
on top of the existing `name -> name` identity, so the chip resolves both pre- and post-move. The
self-heal effect drops the override once a revalidated row reports the new `sprintName`. Only
mark-as-read removes a row.

**C. Shared `BulkActionBar` gets an additive optional `onMarkRead?: () => void` + `markReadCount?: number`**
rendering a prominent leading primary "Mark N as read" button only when provided. Backward
compatible: the board and epic children pass nothing, so their bar renders byte-identically
(same pattern as the existing optional `onRefine`/`onCopyToClipboard`). This keeps one coherent
bar instead of duplicating the counter/checkbox/clear.

**D. `inbox/page.tsx` wiring.** Consume `useInboxRowActions`; pass `onRowContextMenu` +
`isContextTarget={rowMenu?.targets.has(row.key) ?? false}` + `sprints`/`onSprintChange` to each
`BoardRow`; apply `localMoves` in `rowToTicket`; replace the bespoke bottom bar with
`<BulkActionBar onMarkRead={() => markRead([...checkedKeys])} markReadCount={checkedKeys.size} ...the
reused actions... />`; render `<CursorMenu><TicketActionMenuContent/></CursorMenu>`,
`<AddToRefinementModal>`, and the `quickCreate` `<CreateSprintModal>`. Omit board-only
`onMoveToTop`/`onMoveToBottom` (no rank context on the inbox). Keep `markRead`/`undoMarkRead`
(AC #5) unchanged.

**Tests.** `useInboxRowActions.test.tsx` (renderHook; mock the sprint sub-hooks + `@/lib/api-client`)
covers dispatch + AC #2/#3/#6/#7: each handler fires the right call; a move sets `localMoves`
(row stays) and does not remove it; quick-moves compute/auto-create; right-click target logic.
`page.test.tsx` extended: right-click opens the menu (AC #1); the bulk bar shows "Mark N as read"
alongside the reused actions (AC #4); existing mark-as-read + undo tests still pass (AC #5).
Existing board/epic/`BulkActionBar` tests must stay green (AC #8).

**Known limitation (noted, in scope per AC #3):** `rowToTicket` has no `flagged`/`readiness`/`businessValue`
on `NewStoryRow`, so the menu's flag/readiness actions are write-through (they fire correctly) but
don't reflect current state; flag-state is `"mixed"`. Enriching `NewStoryRow` is out of scope here.

## Acceptance Criteria

- [x] Right-clicking an inbox row opens the same context menu as the Sprint Board, positioned
      at the cursor.
- [x] The menu offers the move actions (quick-moves: next / active / backlog, plus Move to
      Sprint) and they actually move the story in Jira.
- [x] The menu also offers status, readiness, epic, assignee, labels, and flag, plus AI Assist
      (review, generate subtasks) and Add to Refinement — the same set as the board.
- [x] The multi-select bar is the shared `BulkActionBar` with the same actions, **plus a
      prominent "Mark as read"**; bulk actions apply to all selected rows.
- [x] "Mark as read" keeps its optimistic drop + undo toast.
- [x] Right-click on a row that is part of the current selection acts on the whole selection;
      otherwise it acts on just that row.
- [x] Moving a story updates its sprint chip but leaves it in the inbox; only "Mark as read"
      removes it.
- [x] The Sprint Board's own menu/bulk bar are unaffected.

## Tests

- [x] Right-click renders the context menu; selecting a move action dispatches `jira.moveSprint`
      with the right keys/target.
- [x] Quick-moves compute correctly from the inbox selection (hidden when not applicable,
      auto-create when the next sprint is absent).
- [x] Bulk status / readiness / epic / assignee / label / flag dispatch the right calls and
      optimistically reflect on the rows.
- [x] "Mark as read" (row + bulk) still fires the existing endpoints, drops rows optimistically,
      and undo restores them.
- [x] A moved row stays in the list with an updated sprint chip.

## Open Questions

- **Sequencing vs. BRDG-374.** Recommended: land [[BRDG-374-extract-shared-row-actions-module]]
  first so this story is a near drop-in. Decide before starting.
- **Mark-as-read placement.** Add it as a first-class `onMarkRead` prop on `BulkActionBar`
  (cleaner, but touches the board's bar) vs. render it as an inbox-only extra next to the bar.
- **Stale row metadata.** `rowToTicket` hardcodes `readiness`/`poStatus`/`businessValue`/
  `flagged` to empty. Flag-toggle and "current value" indicators in the menu need the real
  values — either enrich `NewStoryRow` with them, or accept the menu as a write-only setter for
  those fields on the inbox. Confirm scope.

## Related

- [[BRDG-374-extract-shared-row-actions-module]] — the refactor that makes this a clean drop-in.
- [[BRDG-357-new-story-inbox-reuse-board-table]] — established the inbox-on-`BoardRow` pattern.
- [[BRDG-369-move-to-next-sprint-quick-action]] — the quick-move logic reused here.
- [[BRDG-370-unified-sprint-placement-policy]] — placement rule applied on every move.
- Components: `TicketActionMenuContent`, `CursorMenu`, `BulkActionBar`, `useTicketActions`,
  `computeQuickMoves`.
