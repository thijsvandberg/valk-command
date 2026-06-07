# BRDG-282: Sync a Sprint or Epic from the Backlog Header, in Tranches

**Status:** Complete
**Priority:** Medium
**Type:** Feature

## Description

As a PO on the **Sprint Backlog**, I want a **Sync** action in each group header's "..." menu
so I can pull the latest Jira state for **that sprint (or epic) on demand**, without refreshing
the whole board. When a group has many tickets, the sync must run **in tranches** (batches) with
**visible progress**, so a large sprint/epic syncs reliably instead of stalling on one long
request.

I also want the "..." menu **reorganised**. Today it opens straight onto sprint settings
(dates, goal, Edit details). Instead the menu should open on **two top-level options — Sync and
Settings** — and only show the dates/goal/edit/close block after I pick **Settings**.

## Decisions (agreed with PO)

- **Scope:** sprints **and** epics. Epics already appear as groups when the board is grouped by
  epic; both group types get the Sync action. The Backlog and "No epic" buckets have no Jira
  container, so they get no Sync action.
- **Thoroughness:** **full reconcile.** The sync detects tickets added to, changed in, and
  removed from the sprint/epic in Jira (not just a refresh of what is already shown).
- **Two-level menu:** level 1 = **Sync** + **Settings**; **Settings** drills into the existing
  dates / goal / Edit details / Close sprint block, with a **Back** affordance. For **epics**
  (no goal/dates/edit) the menu shows **Sync only**. When no sync action is available (isolated
  cases), settings render directly, so there is never a pointless one-item menu.

## How it works

Client-orchestrated tranching (`src/lib/group-sync.ts`), one uniform flow for sprint and epic:

1. **Plan** — `POST /api/jira/sync-tickets?mode=plan&sprintId=X|&epicKey=Y` returns the current
   Jira membership keys in rank order (lightweight: a couple of timestamp calls, no upserts).
2. **Tranches** — the client splits those keys into batches of **25** and syncs each batch via
   `POST /api/jira/sync-tickets` with `{ ticketKeys }`. Each batch is a short request; the menu
   shows a live "Syncing X of Y" counter. Additions and field changes are handled here, because
   each ticket is upserted from its own Jira fields.
3. **Reconcile** — `POST /api/jira/sync-tickets?mode=reconcile&...` + body `{ keys }` restores
   rank order from the plan and re-fetches tickets that are locally in the group but no longer in
   Jira's membership (moved sprint / changed epic / deleted), updating them accordingly.

### Unknown-sprint backfill

While syncing, a ticket may reference a sprint that is not yet in the Bridge sprint cache (a
brand-new future sprint, or a sprint a ticket just moved into). `ensureSprintsCached`
(`src/lib/sprint-cache.ts`) collects the sprint ids seen during a sync, fetches any that are
missing via the new `jiraClient.getSprint(id)` (`/rest/agile/1.0/sprint/{id}`), and merges them
into the cached `jira_sprints` list so the group shows full metadata (state/dates/goal) instead
of a bare numeric fallback. It is best-effort and side-channel: a fetch failure is logged and
skipped, never failing the surrounding sync. Wired into `syncIndividualTickets` (the tranche
path), `syncSprint`, and `reconcileGroupMembership`.

## Checklist

- [x] `jira-client`: `getEpicIssueTimestamps(epicKey)` (`parent = EPIC ORDER BY rank ASC`)
- [x] `sync-tickets-service`: `planGroupKeys` + `reconcileGroupMembership` (sprint + epic)
- [x] `sync-tickets` route: `?mode=plan` and `?mode=reconcile` (sprint or epic)
- [x] `group-sync.ts`: tranched orchestration with progress reporting
- [x] `SprintDetailsPopover`: two-level menu (Sync | Settings) + sync progress/result/error
- [x] `GroupStatBar` + `TicketTable`: per-group sync target wiring (sprint and epic)
- [x] `SprintBoard`: `handleSyncGroup` (runs the flow, refreshes tickets, toasts the result)
- [x] `jira-client`: `getSprint(id)` + `sprint-cache.ts` `ensureSprintsCached` (backfill unknown sprints during sync)
- [x] Header spinner on the group card while a sync runs (progress in its tooltip)
- [x] Tests: orchestration, plan, reconcile, sprint backfill, popover two-level + sync states, group menu + header spinner
- [x] Docs: `api-routes.md` updated

## Notes

- The `activity_log.type` CHECK constraint has no `epic-sync` value, so epic reconciles log as
  `ticket-sync` with the epic key in `scope` (matching the existing epic sync route). Adding a
  dedicated type would require recreating the table; not worth it for this feature.
- Pre-existing, unrelated test failure observed during this work:
  `TicketSidebar.test.tsx > displays Jira status` (fails in isolation, untouched by this change).
