# BRDG-131: Epic Detail Interaction on Sprint Board

**Status:** Draft
**Priority:** Medium
**Depends on:** -

## Description

As the PO, I want to click on an epic label in the sprint backlog to see detailed information about that epic, filter tickets by epic, and change a ticket's epic assignment, so I can manage epics without leaving the sprint board context.

## Related work

- **BRDG-249** (shipped): the epic picker pill and each picker row in the ticket detail sidebar now link through to the epic's own ticket detail page (`/tickets/[epicKey]`), with Cmd/Ctrl-click for a new tab. This gives a basic "open the epic" path via the existing ticket detail page, and partially answers the "where should epic info appear" question below: the epic's full detail is reachable as a normal ticket page. The epic picker (Phase 3 below) already exists with search + Jira sync. What BRDG-131 still adds on top: epic interaction *from the sprint board pill* (not just the sidebar), inline epic stats/filtering without navigating away, and the epic-context sidebar.

## Resolved Decisions

These were the open questions; resolved with the PO:

- **Where should epic info appear?** In the regular sidebar (`SidePanel`), the same panel used to open a ticket from the board. Clicking an epic pill opens the epic in that sidebar exactly like opening a ticket. No new popover or dedicated panel.
- **Should epic description be editable?** Not the focus, but allowed. The epic's own fields (description, etc.) may be editable but it is not a goal. The **related section must be editable** (add/remove related tickets).
- **Do we need to sync epic data from Jira?** Show from cache for instant display, but trigger a background sync from Jira so the panel updates when fresh data arrives. Same cache-then-revalidate pattern already used by `EpicPicker`/`/api/epics`.
- **How does changing a ticket's epic propagate back to Jira?** The same way regular story field edits in the sidebar sync back to Jira. Reuse the existing sidebar-edit-to-Jira mechanism; no new sync path.

## Implementation Plan

**Key finding:** most epic-detail UI already exists. `SidePanel` renders via `useTicketDetailPage(key)` + `TicketTabContent`, which branches on `ticket.type === "epic"` to render `EpicChildrenSection` (add/remove children, status-filtered counts, per-child SP/BV, Jira persistence via `tickets.updateEpic`). Opening an epic key in the panel already covers most of Phase 1 + Phase 4. The story is mainly about wiring entry points.

1. **Phase 3 first (self-contained):** Extract a shared `AddEpicPill` (wraps `EpicPicker` with `value=null`, ghost styling, hover-reveal, `stopPropagation`). Use it in `BoardRow.tsx` (~line 415, when `tags.has("epic") && !hideEpic && !ticket.epic`) and `RefinementTicketList.tsx` (~line 202, `showEpic && !ticket.epic`). Wired to the existing `onEpicChange` prop → `useTicketActions.handleEpicChange` → PATCH `/api/tickets/[key]` → Jira. Verify the `/refinement` host passes `onEpicChange`; wire it if missing.
2. **Phase 1 + 4 together:** Make `EpicBadge` in `BoardRow.tsx` clickable → `onSelectTicket(ticket.epicKey)` with `stopPropagation`. `selectTicket()` is key-agnostic and `panelTicket` falls back to `useTicketDetail(key)`, so the epic opens in the panel and `EpicChildrenSection` renders. Add a small read-only stats strip at the top of `EpicChildrenSection` (panel/epic mode) computed client-side from already-loaded `epicChildren`: ticket count (open/closed), status distribution incl. **TEST** (current `statusCounts` omits TEST), and SP total/progress. No new endpoint.
3. **Phase 2 last:** Reuse the existing board epic filter (`f.epicFilter`/`f.setEpicFilter`, filters by epic **name** not key). Pass three callbacks from `SprintBoard.tsx` into `SidePanel`: `onFilterByEpic(name)` → `setEpicFilter(new Set([name]))`; `onShowEpicAcrossAllSprints(name)` → switch to All view then set filter; clear → `setEpicFilter(new Set())`. Epic name = `panelTicket.title`.

**Decisions baked in:** "Related tickets, editable" is satisfied by `EpicChildrenSection` (epics use children, not `LinkedIssuesSection`). Cache-then-revalidate is already handled by `useTicketDetailPage`.

## Acceptance Criteria

### Phase 1: Epic info display (in the sidebar)
- [x] Clicking an epic pill in the sprint backlog opens the epic in the regular sidebar (`SidePanel`), the same panel used for tickets
- [x] Click on the epic pill does NOT trigger row selection of the underlying ticket (`stopPropagation`)
- [x] Sidebar shows: epic name, ticket count (open/closed breakdown) <!-- epic name = panel header (ticket title); count = EpicStatsSummary -->
- [x] Sidebar shows status distribution of tickets in this epic (TO DO / IN PROGRESS / TEST / DONE) <!-- EpicStatsSummary, incl. TEST which the filter chips omit -->
- [x] Epic data renders immediately from cache, then refreshes when the background Jira sync completes (cache-then-revalidate, same pattern as `EpicPicker`/`/api/epics`) <!-- handled by useTicketDetailPage -->

### Phase 2: Filter integration
- [ ] "Show only this epic" action that sets the epic filter on the sprint board
- [ ] "Show across all sprints" action that switches to All view + filters by this epic
- [ ] Clear filter option to reset

### Phase 3: Epic assignment
- [x] Ability to change the epic for a ticket from the sprint board
- [x] Tickets **without** an epic show a placeholder/ghost "Add epic" pill on row hover. Clicking it opens the `EpicPicker` to choose an epic
- [x] The placeholder is subtle when idle (only appears or brightens on hover) so empty rows stay clean
- [x] Applies to all issue tables that show the epic pill: the sprint board in flat **and** grouped-by-sprint views (`BoardRow`), and the `/refinement` ticket list (`RefinementTicketList`). Excluded only when grouped by epic (the group header already conveys the epic)
- [x] Epic picker dropdown with search <!-- exists: EpicPicker (src/components/shared/EpicPicker.tsx), now also links through to the epic via BRDG-249 -->
- [x] Change syncs back to Jira via the same sidebar-edit-to-Jira path used for regular story field edits (no new sync mechanism)

### Phase 4: Epic sidebar context
- [x] When an epic is open in the sidebar, it shows epic-level context (reusing the ticket sidebar layout) <!-- TicketTabContent epic branch -->
- [x] Epic description shown from cache; refreshed by the background Jira sync. Editing the description is allowed but not a goal of this story <!-- existing description editor in TicketTabContent works for epics -->
- [x] Related tickets list with status indicators, **editable**: add/remove related tickets, reusing the existing `EpicChildrenSection` pattern (epics use children, not `LinkedIssuesSection`; it persists to Jira via `tickets.updateEpic`)
- [x] Story point total and progress <!-- EpicStatsSummary: SP done/total + progress bar -->

## Technical Notes

Epics are regular tickets (`type = 'epic'`) in the `ticket` table, so most sidebar machinery already applies.

- **Sidebar:** Reuse `SidePanel` (`src/components/sprint-board/SidePanel.tsx`). Opening is URL-driven via `selectTicket()` in `SprintBoard.tsx` (`window.history.pushState`); the epic pill should open the epic key through the same path.
- **Epic pill:** `EpicBadge` is rendered in `BoardRow.tsx` (~line 415) with no click handler today, and only when `ticket.epic` is set. Add an `onClick` that opens the epic in the sidebar and calls `stopPropagation` so it doesn't select the row.
- **Empty-epic placeholder:** Both issue tables render the epic chip only when `ticket.epic` is set, so empty-epic rows show nothing today:
  - `BoardRow.tsx` (~line 415): `tags.has("epic") && !hideEpic && ticket.epic`. `hideEpic` is already true only when grouping by epic, so reusing `!hideEpic` correctly covers flat + grouped-by-sprint.
  - `RefinementTicketList.tsx` (~line 202): `showEpic && ticket.epic`.
  Add a hover-revealed ghost "Add epic" pill in that slot for tickets without an epic, wired to the same `EpicPicker` / `onEpicChange` path already present in both components. Consider extracting a small shared `AddEpicPlaceholder` (or extending `EpicBadge`) so the two tables stay consistent.
- **Cache + background sync:** Epic data is already cached (`/api/epics`) and synced from Jira (`POST /api/jira/sync-epics`, watermark incremental sync). Render cached data immediately and trigger the background sync on open, then revalidate via SWR `mutate()`.
- **Related tickets (editable):** Reuse `LinkedIssuesSection` (`src/components/ticket-detail/LinkedIssuesSection.tsx`) which already supports add/remove with optimistic updates and Jira persistence via `tickets.linkIssue()` / `unlinkIssue()`.
- **Epic assignment to Jira:** Reuse the existing sidebar field-edit-to-Jira path used for regular stories (same mechanism the `EpicPicker` `onEpicChange` already triggers via `useTicketActions`). No new Jira sync route.
- **Epic description editing:** Allowed but out of scope; if added later, follow the same sidebar field-edit-to-Jira path.
