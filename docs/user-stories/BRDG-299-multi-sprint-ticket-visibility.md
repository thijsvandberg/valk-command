# BRDG-299: Multi-sprint ticket visibility

**Status:** Not Started
**Priority:** High

## Description

As a PO, I want a ticket that belongs to multiple Jira sprints to appear in every one of those
sprint columns on the sprint board, and to show its active sprint on the ticket card, so that a
ticket carried across sprints no longer silently disappears from the backlog I'm looking at.

Today Bridge stores only one sprint per ticket and the sync blindly takes the *last* sprint in
Jira's array. For VPL-29223 that resolved to "Sprint 115 - BT" (a closed sprint), so the ticket
vanished from the active sprint board even though it is in the active sprint in Jira.

## Background

- Jira's sprint custom field is an **array** when an issue is in multiple sprints.
- `extractSprint()` (`src/lib/jira-client.ts`) returns `sprintList[sprintList.length - 1]` — an
  arbitrary pick that can land on an old/closed sprint.
- `sprint_name` (`src/db/schema.ts`) is a single text column; the board filter
  (`src/app/api/tickets/route.ts`) and grouping (`useGroupBy.ts`) match on exact equality.
- Moving a ticket from within Bridge already sets a single sprint in Jira
  (`moveToSprint` -> `{ [SPRINT_FIELD]: sprintId }` replaces the field), so multi-sprint state only
  arises from Jira-side actions outside Bridge.

## Decisions

- **Manual moves stay single-sprint.** A move from within Bridge results in exactly one sprint
  (already the case in Jira); local state is updated to reflect a single sprint too. No write-back
  cleanup and no warning flag.
- **Board shows all sprints.** A multi-sprint ticket appears in every matching sprint column.
- **Ticket card shows the primary sprint**, chosen as: active > future > most recently closed.

## Implementation Plan

Architecture decisions (verified against the code):
- **`sprint_ids` is derived inside `upsertIssue`** from `extractSprints(issue.fields)`, not threaded through
  call sites. Safe because `ISSUE_FIELDS` always includes `SPRINT_FIELD`, so every fetch path
  (`getSprintIssues`, `getIssue`, `getIssuesByKeys`, `getBacklogIssues`) carries the full sprint array.
- **`sprint_name` (primary) stays driven by the existing param flow.** `extractSprint` is changed to return
  the active>future>most-recent-closed primary, which the main refresh paths (individual sync,
  incremental sync, ticket detail) already call — so the card shows the active sprint. Sprint/backlog
  sync keep passing their context id (unchanged reconciliation behaviour); the board no longer depends on
  this for visibility because membership now uses `sprint_ids`.
- **Storage:** `sprint_ids` = JSON array of string ids (e.g. `["1779","1802"]`); `null` for backlog.
- Migrations auto-apply on DB connect (`src/db/index.ts`) and in tests (`src/db/test-utils.ts`).

Steps (in order):
1. `src/lib/jira-client.ts`: add `selectPrimarySprint()` (active > future > closed-by-completeDate/endDate/startDate desc);
   rewrite `extractSprint` to use it; add `extractSprints()` returning the full array deduped by id.
2. `src/db/schema.ts`: add `sprintIds: text("sprint_ids")` to `ticket`; generate Drizzle migration.
3. `src/lib/upsert-issue.ts`: compute `sprintIds` JSON from `extractSprints(fields)`, add to `ticketData`;
   minimal parent/subtask rows set `sprint_ids = null` (corrected on their own primary sync).
4. `src/types/ticket.ts`: add `sprintIds?: string[]` to `Ticket` (primary stays `sprintId`).
5. `src/app/api/tickets/route.ts`: sprint filter via `json_each` membership (with `IS NOT NULL` guard);
   backlog stays `sprintName === ""`; map `sprintIds` into the response; display-name join stays on primary.
6. Board: `useGroupBy.ts` pushes a ticket into every sprint group in its membership set;
   `useSprintBoardFilters.ts` (`sprintOptions`, `teamOptions`, `scopeFiltered`) match ANY membership sprint;
   `SprintBoard.tsx` `editSprintTickets`/`finishSprintTickets` use membership.
7. `src/app/api/jira/move-sprint/route.ts`: set `sprint_ids = [target]` (null for backlog) alongside `sprint_name`.
8. Re-sync VPL-29223 (post-change) and verify in `sqlite.db`.
9. Tests (jira-client primary/extractSprints, upsert sprint_ids, tickets membership filter, grouping,
   filters, move reset) + update `extractSprints` in shared/partial mocks.
10. Docs: `database-schema.md`, `jira-sync.md`.

Resolved ambiguities: (1) param flow left untouched, primary correctness via `extractSprint`;
(2) backlog signalled by `sprint_name === ""`, `sprint_ids = null`; (3) minimal rows get `sprint_ids = null`;
(4) `json_each` EXISTS scan is acceptable at current ticket volume (a junction table would be needed only at scale).

## Acceptance Criteria

- [x] New `sprint_ids` column on `ticket` (JSON array of all sprint IDs the ticket belongs to);
      DB migration added
- [x] `sprint_name` remains the single **primary** sprint used by ticket card / hover, selected via
      active > future > most recently closed
- [x] Sync extracts **all** sprints from Jira's sprint array and stores them in `sprint_ids`, plus
      the primary in `sprint_name` (`extractSprint` updated / `extractSprints` added,
      `sync-tickets-service.ts` and `upsert-issue.ts` updated)
- [x] `GET /api/tickets` sprint filter matches on **membership** in `sprint_ids` (ticket is in the
      requested sprint), not exact equality on `sprint_name`
- [x] Backlog filter still works (ticket has no sprints)
- [x] Sprint board grouping (`useGroupBy.ts`) places a multi-sprint ticket in **every** matching
      sprint group/column; no duplicate within a single group
- [x] Sprint board filters (`useSprintBoardFilters.ts`) match a ticket if **any** of its sprints
      matches the selected sprint id/state
- [x] After a move from Bridge, the ticket immediately leaves the old column and shows in the target
      sprint only (local `sprint_ids` set to `[targetSprintId]`)
- [x] Re-sync run so VPL-29223 is corrected and appears in its active sprint
- [x] Tests: `extractSprint`/`extractSprints` primary selection (active/future/closed combinations),
      `/api/tickets` membership filter, multi-sprint grouping, board filter matching, move resets to
      single sprint
- [x] Docs updated: `docs/architecture/jira-sync.md`, `docs/architecture/database-schema.md`

## Technical Notes

- `sprint_ids` stored as a JSON array string; SQLite membership via `json_each` (or a delimited
  `LIKE` if simpler) in the tickets query.
- Primary-sprint selection needs the sprint `state` (and `startDate`/`endDate` for "most recent"),
  available on `JiraSprint` (`state: "active" | "future" | "closed"`, `startDate`, `endDate`) and in
  the cached `/api/jira/sprints` list.
- Keep `sprint_name` populated so single-sprint contexts (card, hover, default group) are unchanged.
- A ticket appearing in multiple columns must keep a stable, non-duplicated identity per column.

## Out of Scope

- Writing back to Jira to remove a ticket from extra sprints (no cleanup write-back).
- A "ticket is in multiple sprints" warning badge.
