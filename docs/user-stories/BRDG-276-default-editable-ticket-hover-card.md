# BRDG-276: Ticket hover card is editable by default everywhere

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I hover a ticket pill anywhere in Bridge and the details card opens, I want
to edit the ticket directly from that card (Story Points, Business Value, Sprint, Epic,
Assignee, follow, Run Review) the same way I can on the Sprint Board. Editing should be the
**default** behaviour of the hover card, not something each screen has to wire up. Turning
editing off should be the rare exception.

The trigger was the epic single view: hovering a child story's pill shows a read-only card.

## Current behaviour

- `TicketHoverCard` (in `TicketStatusPill.tsx`) already renders inline editors for SP, BV,
  Sprint, Epic, Assignee, follow and Run Review, **but only when the parent passes the
  matching `onXChange` callbacks**. Only the Sprint Board (`BoardRow`, sprint-board
  `TicketRow`) wires them.
- Every other context renders the card read-only: epic children (`ChildIssueRow` via
  `EpicChildrenSection`/`EpicChildrenBySprint`), link search results, the shared
  `TicketRefPill` (chat / description refs / suggestion chips), the refinement queue, the
  finish-sprint modal.
- `buildTicketHoverData` deliberately drops `sprintId`, `qualityScore`, `notes`,
  `readiness` and `editState`, so even the read-only reference cards under-report.

## Scope

1. **Default editing baked into the card.** A new `useHoverCardEdits(ticketKey)` hook,
   called inside `TicketHoverCard` (which mounts lazily, one at a time, on hover, so there
   is no per-row cost), provides standard handlers wired to the existing API client. Each
   handler optimistically patches every ticket SWR cache (board list, sprint lists, per-key
   detail), persists, then revalidates. The card uses an explicit `onXChange` prop when the
   parent passes one; otherwise it falls back to these defaults.
2. **Opt-out, not opt-in.** New `hoverCardEditable` prop on `TicketStatusPill` (default
   `true`). Defaults are also force-disabled for `removedFromJira` (deleted) tickets so a
   deleted ticket never becomes editable.
3. **Richer hover data.** `buildTicketHoverData` now carries `sprintId`, `qualityScore`,
   `notes`, `readiness` and `editState`, so reference cards (incl. epic children) show the
   full signal set and the Sprint picker pre-selects correctly.

## Approach

- `useHoverCardEdits`: reads `useJiraSprints` + `useFollowedTickets`/`useFollowTicket`,
  returns `{ sprints, isFollowed, onStoryPointsChange, onBusinessValueChange,
  onSprintChange, onEpicChange, onAssigneeChange, onToggleFollow, onRunReview }`. Sprint
  null = backlog (`__backlog__`). Run Review dynamic-imports `bulkReviewStories` to keep it
  out of the shared bundle.
- `TicketHoverCard`: add `editable` prop; compute effective handlers as
  `explicit ?? (editable ? default : undefined)`; effective `sprints`/`followed` likewise.
- `TicketStatusPill`: add `hoverCardEditable` (default true); pass
  `editable={hoverCardEditable && !removedFromJira}` to the card.
- Epic children get editing automatically through the card defaults (no per-row wiring).
  The existing inline SP/BV pickers in `renderMetadata` are unchanged.

## Out of scope

- Readiness stays editable via the pill's readiness icon (already wired on epic children),
  not via the card row.
- Per-context optimistic list state for card edits (defaults rely on cache patch +
  revalidate). The board and the epic inline pickers keep their own optimism.
- Disabling editing in any specific screen (none identified today; the prop exists for it).

## Checklist

- [x] Add `useHoverCardEdits` hook (handlers + optimistic cache patch + revalidate)
- [x] Wire default handlers into `TicketHoverCard` with an `editable` prop (explicit props win)
- [x] Add `hoverCardEditable` to `TicketStatusPill`; force-off for `removedFromJira`
- [x] Enrich `buildTicketHoverData` (sprintId, qualityScore, notes, readiness, editState)
- [x] Tests: default handlers persist + revalidate; explicit props override defaults; removed/opt-out stays read-only; enriched hover data
- [x] `npm run lint`, `npm run test`, `npm run build` all pass
