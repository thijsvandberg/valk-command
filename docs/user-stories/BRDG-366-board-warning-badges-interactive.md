# BRDG-366: Make board warning badges legible and actionable

**Status:** Completed
**Priority:** Medium
**Type:** UX / Sprint board

## Description

The estimate-hygiene warnings on the sprint board (shown via the group header warning
lens) read poorly and could not be acted on from the board:

1. The amber/orange warning chips had **too little contrast** against the row.
2. The **open-subtasks indicator** ("⚠ N") was always visible on Done/Deprecated rows,
   adding noise outside the warning lens.
3. The **"No subtasks"** warning was informational only — fixing it meant opening the
   ticket.
4. On **hover**, the planning placeholders (Add epic / SP / BV) revealed to the right of
   the warning chips, shrinking the flex-1 title and sliding the chips left out from
   under the cursor, so they could not be clicked.

## Changes

- **Contrast.** Warning chips now mix the status-warning colour toward the primary text
  colour with a stronger background tint; the subtask popover/indicator amber was bumped
  to match ([WarningBadge.tsx](../../src/components/sprint-board/WarningBadge.tsx),
  [OpenSubtasksIndicator.tsx](../../src/components/sprint-board/OpenSubtasksIndicator.tsx)).
- **Open subtasks folded into the warning lens.** The always-on "⚠ N" indicator was
  removed from the board row. In warning-lens mode the **"Closed with open subtasks"**
  chip is the clickable trigger that opens the existing subtask popover (list + "Close all
  subtasks").
- **"No subtasks" is actionable.** In warning-lens mode the chip opens an
  [AddSubtasksModal](../../src/components/sprint-board/AddSubtasksModal.tsx) that mirrors the
  inline subtask-create flow from the ticket detail / refinement views (a bordered list with
  a "Create subtask..." row): type a title, press Enter, the subtask appears in the list and
  the input stays focused for the next. Each is created immediately via
  `POST /api/tickets/[key]/subtasks`. The badge clears as soon as the first is created: the
  optimistic-edit overlay registers `totalSubtaskCount` (`handleSubtasksAdded` in
  [useTicketActions.ts](../../src/components/sprint-board/useTicketActions.ts)) so the
  warning recomputes before the list refetch lands. See
  [optimistic-updates.md](../architecture/optimistic-updates.md).
- **Stable hover order.** The warning chips now render **after** the hover-revealed
  planning placeholders in the row, so revealing those placeholders opens them to the
  chips' left and the chips stay put under the cursor
  ([BoardRow.tsx](../../src/components/sprint-board/BoardRow.tsx)).

## Implementation notes

- `BoardRow` now takes `warnings: WarningKind[]` (was `warningLabels: string[]`); it
  derives label text and decides which kinds are interactive. New `onSubtasksAdded`
  prop threads through `TicketTable` → `SprintBoard` (`ta.handleSubtasksAdded`).
- `totalSubtaskCount` added to `EditableField` in
  [pendingTicketEdits.ts](../../src/components/sprint-board/pendingTicketEdits.ts); the
  generic self-heal effect clears it once the server reflects the count.
- The add-subtasks modal is mounted only while open (fresh state each time), so it needs
  no reset effect (React Compiler forbids setState-in-effect).

## Checklist

- [x] Bump warning-chip / subtask-popover contrast
- [x] Remove always-on open-subtasks indicator; trigger popover from the warning chip
- [x] Add-subtasks modal with add-row list, immediate creation, optimistic badge update
- [x] Reorder placeholders so warning chips stay put on hover
- [x] Tests: `WarningBadge`, `AddSubtasksModal`, updated `BoardRow` / `TicketTable` warning tests
- [x] `lint`, `typecheck`, `test`, `build` pass
