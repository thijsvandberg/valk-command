# BRDG-382: Ticket-detail sidebar edits must use the board's pending-edits overlay

**Status:** Done
**Priority:** High
**Type:** Bug — optimistic updates / board sync

## Description

Setting an epic on a story from the ticket-detail sidebar did not show the epic chip
on the sprint board immediately; it only appeared after a manual refresh. The root
cause is general: every field the sidebar edits that also renders on the board row used
a one-shot SWR cache patch (`patchTicketCaches`) instead of the durable pending-edits
overlay (`registerPendingEdit`) that the board's own row/bulk menus use. The reported
case was epic, but assignee, status, story points, and business value shared the same
defect.

## Current Behaviour (before fix)

The board refetches its ticket list constantly (60s poll, window focus, after a Jira
sync, and the moment a picker portal closes). The sidebar handlers in
[TicketMetaContent.tsx](../../src/components/ticket-detail/TicketMetaContent.tsx) only
called `patchTicketCaches(...)`, which patches the SWR cache **once**. The refetch that
fires when the epic picker closes returns pre-write data (Jira read-after-write lag plus
the ~30s server-side response cache) and overwrites the patch before the user perceives
it. The chip only reappeared once Jira caught up and the user refreshed.

The board's own handlers in
[useTicketActions.ts](../../src/components/sprint-board/useTicketActions.ts) never had
this problem: they register the edit in the `pendingTicketEdits` overlay, which
re-applies the value on top of the list **on every render** until the server confirms
it. The sidebar was simply never wired into that overlay. See
[optimistic-updates.md](../architecture/optimistic-updates.md).

## Proposed Solution

Wire the affected sidebar handlers into the same overlay the board uses, and stop them
patching the board **list** cache:

- `registerPendingEdit` before the API call, `confirmPendingEdit` on success,
  `clearPendingEdit` on failure — mirroring `useTicketActions`.
- Replace `patchTicketCaches` with a new `patchTicketDetailCache` that patches **only**
  the per-key detail cache. The sidebar's own pickers re-seed from the detail object
  (the reset effect at `TicketMetaContent.tsx:119-138`), so that still needs an
  immediate patch — but patching the list cache too would let the board's self-heal
  mistake the client patch for a real server read and clear the overlay early,
  reintroducing the snap-back.
- Unify the sidebar's assignee initials/color derivation with `userInitials`/`userColor`
  so the optimistic value matches the server shape and self-heal clears on first match.

Out of scope (no editor in the sidebar or not a board-overlay field): issue type, PO
notes, labels (still use `patchTicketCaches`), and sprint moves (own overlay).

## Tasks

- [x] Add `patchTicketDetailCache` (detail-key-only patch) to
  [ticket-cache.ts](../../src/lib/ticket-cache.ts)
- [x] Epic handler: overlay (`epic` + `epicKey`) + detail-only patch
- [x] Assignee handler: overlay + detail-only patch + unified initials/color
- [x] Jira status handler: overlay + detail-only patch
- [x] Story points handler: overlay + detail-only patch
- [x] Business value handler: overlay + detail-only patch
- [x] Tests asserting each edit registers a durable overlay edit that survives a stale
  refetch, and that only the detail cache is patched
- [x] Update [optimistic-updates.md](../architecture/optimistic-updates.md)

## Acceptance Criteria

- Setting/changing/clearing an epic from the sidebar shows the chip on the board row at
  once and it does not snap back on the next refetch.
- The same holds for assignee, status, story points, and business value.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.
