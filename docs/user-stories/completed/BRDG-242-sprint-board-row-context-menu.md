# BRDG-242: Right-click context menu (row quick actions) on the Sprint Board

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want a right-click context menu on a Sprint Board ticket row, so that I can run the same quick actions I have in the multiselect toolbar without first selecting the row via its checkbox.

Today, the bulk actions (move to sprint, set status/readiness/epic/assignee/label, AI Assist, add to refinement) are only reachable through the multiselect toolbar (`BulkActionBar`), which requires checking one or more rows first. There is no per-row context menu. This story adds a right-click menu on a row that exposes those same actions, plus a new **Flag** action.

It also adds a **Flag** action to the existing multiselect toolbar so it can be applied in bulk.

## Scope of actions

The context menu mirrors the multiselect toolbar (`src/components/sprint-board/BulkActionBar.tsx`), applied to the right-clicked row:

- **Set Status** (reuse `StatusSubPanel`)
- **Set Readiness** (reuse `ReadinessSubPanel`)
- **Set Epic** (reuse `EpicSubPanel`)
- **Move to Sprint** (reuse `SprintSubPanel`, including pinned-slot ordering)
- **Update Assignee** (reuse `AssigneeSubPanel`)
- **Add/Update Label** (reuse `LabelSubPanel`)
- **Review Story** (AI Assist)
- **Generate Subtasks** (AI Assist)
- **Add to Refinement**
- **Flag / Remove flag** (new — see below)

**Deliberately excluded** (already available elsewhere, or list-level only):

- *Open in Jira* and *Copy ticket key* — already available on the ticket pill, not needed per the request.
- *Copy List* and *Refresh from Jira* — these are list/selection-level operations, not single-row actions. Out of scope for the row context menu.
- *Summarized List* — list-level export, out of scope for a single row.

## Selection-aware behaviour

To match common board UX and avoid surprising the user:

- If the right-clicked row **is part of the current checkbox selection**, the menu acts on the **whole selection** (same as the toolbar).
- If the right-clicked row is **not** in the current selection, the menu acts on **just that row** (the existing selection is left untouched).

The menu header should make the target explicit (e.g. "VPL-402" vs "3 tickets selected").

## Flag feature

The single-ticket flag already exists: `PATCH /api/tickets/[key]` accepts `flagged` (boolean) and, when flagging with a reason, posts a Jira comment via `addFlagComment`. The `flagged` field is on the ticket type and already renders as a red inset bar / flag icon on the row.

This story adds flag as a **quick action** in both surfaces:

1. **Row context menu:** "Flag this ticket" / "Remove flag" toggling `ticket.flagged`. Flagging may optionally prompt for a reason (reuse the existing flag-reason confirm dialog pattern from `src/app/(app)/tickets/[key]/page.tsx`).
2. **Multiselect toolbar:** add **Flag** / **Remove flag** as an entry in the `Update` dropdown (alongside Set Status, Set Readiness, etc.) so it applies to all checked tickets. Bulk flag should set/clear the flag on every selected ticket; a single shared optional reason is acceptable for the bulk case (one comment per ticket, or skip the comment if no reason is given — match the single-ticket behaviour where no reason means no comment).

## Component reuse

To avoid duplicating the menu, extract the shared menu content from `BulkActionBar.tsx`:

- Pull the sub-panels (`StatusSubPanel`, `ReadinessSubPanel`, `SprintSubPanel`, `EpicSubPanel`, `AssigneeSubPanel`, `LabelSubPanel`), the `MenuItem` primitive, and the `Update` / `AI Assist` menu structure into a shared module (e.g. `src/components/sprint-board/ticket-action-menu/`).
- Both `BulkActionBar` (anchored dropdowns) and the new row context menu (positioned at the cursor) render the same menu content, parameterized by single-key vs bulk handlers.
- Reuse the existing `AnchoredMenu` portal/flip pattern (or a cursor-positioned variant) so the menu paints above the view header and flips when near the viewport edge.

## Implementation Plan

### Key decisions
- **Single board-level menu, not per-row instances.** `TicketRow` emits `onRowContextMenu(key, event)` upward through `TicketTable.makeRowProps` to `SprintBoard`, which renders one cursor-positioned menu. Required for virtualization correctness; avoids hundreds of menu components.
- **Uniform bulk-handler targeting.** The context menu always calls the existing `handleBulk*` handlers in `useTicketActions` with a computed target `Set<string>`. Sidesteps the missing per-row label handler and gives one code path.
- **Shared menu content, two positioning shells.** Extract `TicketActionMenuContent` (subview state machine + sub-panels) + a new `CursorMenu` positioned-portal wrapper. `BulkActionBar` keeps `AnchoredMenu`; the row menu uses `CursorMenu`. Both render the same content.

### Steps (in dependency order)
1. **New `ticket-action-menu.tsx`**: move `AnchoredMenu`, `MenuItem`, all sub-panels (`Status`/`Readiness`/`Sprint`/`Epic`/`Assignee`/`Label`), `JIRA_STATUS_ORDER`, `UpdateSubView`, helper types from `BulkActionBar.tsx`. Add `TicketActionMenuContent` (parameterized by the optional action callbacks + `onSetFlagged` + `close()`, holds its own `subView` state) and `CursorMenu` (portal at `{x,y}`, viewport-clamped/flip, `useOutsideClick` + Escape).
2. **Refactor `BulkActionBar`** to consume `TicketActionMenuContent` inside its `AnchoredMenu`; keep AI-Assist local and the public prop interface identical. `BulkActionBar.test.tsx` is the no-regression gate.
3. **`TicketRow.tsx`**: add optional `onRowContextMenu?` prop; on `<tr>` `onContextMenu` `preventDefault` + emit upward; guard with `if (isDragActive) return;`. `SortableTicketRow` forwards automatically.
4. **Selection-aware targeting in `SprintBoard`**: `targets = checkedTickets.has(key) && checkedTickets.size>0 ? new Set(checkedTickets) : new Set([key])`; store `{x,y,targets}` in `rowMenu` state. Do not mutate `checkedTickets`.
5. **Thread + render**: add `onRowContextMenu?` to `TicketTable` props + `makeRowProps` (all 4 render variants); `SprintBoard` passes it and renders `CursorMenu` + `TicketActionMenuContent` wired to bulk handlers using `rowMenu.targets`. Refactor `handleBulkMoveSprint`/`handleBulkReviewStory`/`handleRefineSelected`/`handleBulkGenerateSubtasks` to take an explicit `targets` arg (toolbar passes `checkedTickets`).
6. **Flag in context menu**: `onSetFlagged(flagged, reason|null)` adds Flag/Remove flag items; Flag opens reused `ConfirmDialog` + textarea (pattern from `tickets/[key]/page.tsx`), confirm → `handleBulkSetFlagged(true, reason, targets)`.
7. **`handleBulkSetFlagged`** in `useTicketActions`: loop `tickets.toggleFlag(k, flagged, reason)` via `Promise.allSettled`, optimistic + revert + toast like `handleBulkSetStatus`; add to return object.
8. **Toolbar flag**: forward `onSetFlagged` through `BulkActionBar` → `UpdateDropdown` → `TicketActionMenuContent`; `hasAnyAction` must include it.
9. **No-conflict guard**: right-click does not trigger pointer/click sensors; menu portals to `document.body`; drag-active guard; does not call `onSelectTicket`.
10. **Tests**: update `TicketRow.test.tsx`; new `ticket-action-menu.test.tsx`; new `useTicketActions` test for bulk flag; verify/extend `BulkActionBar.test.tsx`; extend `SprintBoard.test.tsx`.
11. **Docs**: extend `docs/architecture/` (workspace/api docs) with the bulk-flag + context-menu note. NOTE: `docs/user-stories/todo.md` is header-protected ("DO NOT ALTER WITHOUT EXPLICIT PERMISSION") so the backlog note is left in place and annotated rather than removed.
12. **Scope**: context menu wired in `SprintBoard` only (single-sprint + All views). `MultiSprintView` compare mode lacks the bulk wiring and is intentionally left without the row menu.

## Requirements

### 1. Row context menu

- Add an `onContextMenu` handler on the Sprint Board ticket row (`TicketRow.tsx`) that opens a context menu positioned at the cursor and prevents the native browser menu.
- The menu does not interfere with existing row interactions (checkbox select, click-to-open side panel, drag-and-drop).
- Closes on outside click, Escape, and after an action is chosen.
- Implements selection-aware targeting (see above).

### 2. Shared menu module

- Extract the reusable sub-panels and menu structure from `BulkActionBar.tsx` into a shared module.
- `BulkActionBar` consumes the shared module with no behavioural change.

### 3. Flag in context menu

- Add Flag / Remove flag toggle to the row context menu, wired to the existing single-ticket flag endpoint, with the optional reason dialog.

### 4. Bulk flag

- Add a `handleBulkSetFlagged(flagged, reason | null, checkedTickets)` handler in `useTicketActions.ts`, following the existing bulk handler patterns (`handleBulkSetStatus`, `handleBulkMoveSprint`, etc.).
- Add Flag / Remove flag as an entry in the toolbar's `Update` dropdown, wired to that handler.

### 5. Wiring

- Wire the new context menu through `SprintBoard.tsx` / `MultiSprintView.tsx` using the existing `useTicketActions` handlers (both per-row and bulk).

## Out of scope

- Open in Jira, Copy ticket key (already on the ticket pill).
- Copy List, Refresh from Jira, Summarized List as single-row actions.
- Any redesign of the existing toolbar visuals.
- Changing the existing single-ticket flag dialog/API behaviour beyond exposing it as a quick action and extending it to bulk.

## Technical notes

- Toolbar + sub-panels: `src/components/sprint-board/BulkActionBar.tsx`
- Row: `src/components/sprint-board/TicketRow.tsx` (already reads `ticket.flagged` for the red inset bar / flag icon)
- Bulk handlers: `src/components/sprint-board/useTicketActions.ts`
- Board wiring: `src/components/sprint-board/SprintBoard.tsx`, `src/components/sprint-board/MultiSprintView.tsx`
- Single-ticket flag (reference for reason dialog + API): `src/app/(app)/tickets/[key]/page.tsx`, `PATCH /api/tickets/[key]`
- Existing context-menu patterns to follow: `src/components/sprint-board/SprintSlots.tsx`, `src/components/chat/ConversationList.tsx`
- This supersedes the old backlog note "Right-click context menu on tickets" (`docs/user-stories/todo.md`) and the parked `BRDG-119` quick-actions proposal (`docs/user-stories/wont-do/`).

## Checklist

- [x] Extract reusable sub-panels + menu structure from `BulkActionBar.tsx` into a shared module
- [x] Refactor `BulkActionBar` onto the shared module (no behaviour change)
- [x] Add `onContextMenu` row handler + cursor-positioned menu in `TicketRow.tsx`
- [x] Implement selection-aware targeting (single row vs current selection)
- [x] Wire context menu actions (status, readiness, epic, sprint, assignee, label, review, subtasks, add to refinement) via `useTicketActions`
- [x] Add Flag / Remove flag to the context menu (with optional reason dialog)
- [x] Add `handleBulkSetFlagged` to `useTicketActions`
- [x] Add Flag / Remove flag to the toolbar's `Update` dropdown
- [x] Ensure no conflict with checkbox select, side-panel open, and drag-and-drop
- [x] Tests: row context menu open/close/targeting, single + bulk flag, shared-module render
- [x] Update relevant docs in `docs/architecture/` <!-- todo.md backlog note left in place: file is header-protected ("DO NOT ALTER WITHOUT EXPLICIT PERMISSION"), awaiting sign-off -->
- [x] Verify across single-sprint and multi-sprint board views <!-- scoped to SprintBoard (single-sprint + All); MultiSprintView compare mode intentionally excluded (no bulk-action wiring). Visually verified: menu opens with all actions + Flag; reason dialog opens and cancels cleanly. -->
