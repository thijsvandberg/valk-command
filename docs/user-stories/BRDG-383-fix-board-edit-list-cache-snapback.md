# BRDG-383: Fix board edit snap-back from list-cache optimistic patches

**Status:** Completed
**Priority:** High
**Type:** Bug — sprint board, optimistic updates

## Description

Filling in Business Value on the sprint board shows the value briefly, then it disappears,
and only reappears after a poll or manual refresh. This is the snap-back the pending-edits
overlay ([optimistic-updates.md](../architecture/optimistic-updates.md)) is supposed to prevent.

## Root cause

The board-row edit handlers register an overlay edit (correct), but the shared save helpers
`saveTicketMetadata` and `saveStoryPoints` *also* optimistically patch the SWR **list** cache
(`globalMutate(activeListKey, ..., { revalidate: false })`).

The board's self-heal effect clears a confirmed overlay edit as soon as the **list data**
reflects the value. The client-side list patch makes the list look like the server already
caught up, so the overlay is cleared early. The next revalidation (picker close = instant,
60s poll, focus, or sync) refetches `/api/tickets`, which serves the ~30s cached pre-write
snapshot (or Jira read-after-write lag), and the value snaps back. A later poll/refresh shows
it once the server truly catches up.

The architecture doc already names this anti-pattern: a client-side list patch "looks like the
server catching up and clears the overlay early, letting the next stale refetch win."

Affected fields (all routed through the two helpers on the single-sprint board): `businessValue`,
`guestimation`, `storyPoints`, `poStatus`, `readiness`. The other overlay handlers (jiraStatus,
assignee, epic, title, type, flagged, subtasks) call the API directly and never patch the list,
so they are already correct.

## Constraints

- `MultiSprintView` calls the same helpers but does **not** use the overlay (known follow-up); its
  BV/SP optimism relies entirely on the helpers' list patch. Removing the patch unconditionally
  would regress the multi-sprint view.
- `saveTicketMetadata` also serves non-overlay board indicators (`poNotes` notes dot,
  `qualityScore` badge) that render off the list and legitimately need the list patch.

## Approach

Add an opt-out `{ patchList?: boolean }` option (default `true`) to `saveTicketMetadata` and
`saveStoryPoints`. The board overlay handlers pass `patchList: false` (the overlay handles board
display); `MultiSprintView`, board poNotes, and any other caller keep the default. The detail-cache
patch stays in both helpers (the sidebar re-seed). No change to the overlay/self-heal logic itself.

## Acceptance Criteria

- [x] Entering Business Value on the single-sprint board sticks (survives picker-close revalidation,
      poll, focus, and sync) and never snaps back.
- [x] Story points, guestimation, poStatus and readiness on the single-sprint board likewise stick.
- [x] `MultiSprintView` BV/SP edits still update optimistically (its list patch is preserved).
- [x] The board notes indicator (poNotes) still updates immediately.

## Tests

- [x] `saveTicketMetadata` / `saveStoryPoints`: with `patchList: false` they do not patch the list
      cache but still patch the detail cache; default keeps patching the list.
- [x] `useTicketActions`: BV/SP/guestimation/poStatus/readiness handlers call the helpers with
      `patchList: false`.

## Related

- [[optimistic-updates]] — the overlay/self-heal design and the anti-pattern this fixes.
- BRDG-357 — generalized the overlay; BRDG-382 — wired sidebar edits + `patchTicketDetailCache`.
- Follow-up: migrate `MultiSprintView` to the overlay so it gets the same guarantee.
