# BRDG-357: Board edits no longer snap back to stale data

**Status:** Done
**Priority:** High
**Type:** Bug / Tech debt

## Description

As the Product Owner, when I make a change on the sprint board (set a status to Done,
change an assignee, scores, readiness, epic, ...), the change must **stay shown** until
the data is actually up to date. It must never briefly apply and then "snap back" to the
old value a moment later.

This was a recurring, cross-cutting bug: almost every kind of local edit could revert
for a few seconds (often up to a minute) before correcting itself, forcing me to babysit
each change and re-check it landed.

## Root Cause

The board list is refetched constantly (60s poll, on window focus / when a picker closes,
and after a background Jira sync). Each refetch replaces the whole list with server data.
Right after a local write the server often has not caught up yet (Jira read-after-write
lag, or the ~30s `/api/tickets` response cache serving a pre-write snapshot), so the
refetch overwrites the optimistic value and the row snaps back.

The per-handler optimistic updates only patched the SWR cache **once**
(`optimisticData` / `mutate(revalidate:false)`), which survives exactly one revalidation
cycle - the next refetch reverted it. Only the "sprint" field was immune, because it used
a separate render-time overlay (`pendingSprintMoves.ts`).

## What Was Done

Generalized the proven sprint-move overlay into a single field-agnostic mechanism so a
snap-back is structurally impossible regardless of which refetch fires.

- **New `src/components/sprint-board/pendingTicketEdits.ts`** - a render-time overlay
  store: `registerPendingEdit` / `confirmPendingEdit` / `clearPendingEdit`,
  `applyPendingEdits` (merge), `hasPendingEdit`, structural `valuesMatch`, and a 30s TTL
  safety net. The overlay re-applies each live edit on top of the list on every render
  until the server confirms it (self-heal) or the TTL expires.
- **`useTicketActions.ts`** - every edit handler now registers an edit, calls the API,
  then confirms on success / clears (reverts) on failure: status, assignee, epic, type,
  title, flagged, business value, guestimation, story points, close-subtasks, plus bulk
  status/flag/readiness. The fragile per-handler cache patches were removed.
- **PO-local map fields** (poStatus, readiness) reuse the same store:
  `syncFromApiTickets` skips reconciling a field while `hasPendingEdit` is true.
- **`SprintBoard.tsx`** - applies `applyPendingEdits` to the list (next to
  `applyPendingMoves`) and runs a self-heal effect that clears a confirmed edit once the
  server data matches it.

## Prevention / Documentation

- New architecture doc: `docs/architecture/optimistic-updates.md`, with a checklist for
  adding any new editable board field. Linked from `docs/index.md` and `CLAUDE.md` with a
  "read this before adding/changing an editable board field" note, so it is the standard
  going forward.

## Tests

- `src/components/sprint-board/pendingTicketEdits.test.ts` - overlay survives a stale
  refetch, self-clears past TTL, multi-field merge, object values, store primitives,
  `valuesMatch`.
- `src/components/sprint-board/useTicketActions.test.ts` - handlers register/confirm/clear
  edits; the demonstrated "set to Done then a stale refetch returns TO DO -> row stays
  Done" case is asserted directly; failure path reverts.
- Full sprint-board suite (570 tests) green.

## Checklist

- [x] Generic pending-edits overlay store
- [x] Route all edit handlers through the overlay
- [x] Wire overlay + self-heal into SprintBoard
- [x] Cover poStatus/readiness map fields via the same store
- [x] Automated tests (store + handlers)
- [x] Architecture doc + CLAUDE.md/index links

## Follow-up

- `MultiSprintView.tsx` keeps its own duplicated optimistic maps and does not yet use the
  overlay; migrate it so the multi-column view gets the same guarantee.
