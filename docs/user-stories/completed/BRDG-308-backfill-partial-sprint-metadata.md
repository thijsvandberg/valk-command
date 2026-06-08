# BRDG-308: Async backfill of partially-known sprint metadata

**Status:** Done
**Priority:** Medium

## Description

As a PO, when Bridge surfaces a sprint whose name it knows but whose full details it does not
(start/end date, state, goal), I want Bridge to fetch the rest of that sprint's info from Jira
automatically in the background, so that every sprint shown in the app appears complete (dates +
state) without me having to trigger a manual sprint-history sync.

Concretely: opening an epic like **VPL-9642** (Valk Giftcard) and grouping child issues *By sprint*
shows some groups fully (e.g. `BT: 137 · 8 May – 21 May · CLOSED`) but others as a bare name with
no dates and no state chip (e.g. `VP Sprint 66 Angels`, `BT: TODO`). `VP Sprint 66 Angels` is a
very old but already-finished sprint, so it *should* show a start/end date and a CLOSED chip. The
name is resolved, but the rest of the metadata is missing.

## Background

There is no dedicated sprint table. Sprint state lives in two places:

- `appSetting["jira_sprints"]` — the canonical list of `StoredSprint` objects
  (`id`, `name`, `state`, `startDate`, `endDate`, `completeDate`, `goal`). This is what supplies
  dates/state. (`src/lib/sprint-cache.ts`, `src/app/api/jira/sync-sprints/route.ts`)
- `sprintNameCache` (table) — maps `sprintId → displayName` only. This is the "the title is
  fetched" part: the name resolves even when full metadata is absent.
  (`src/lib/upsert-issue.ts` `cacheSprintName`)

The *By sprint* grouping (`src/lib/epic-children-grouping.ts`) buckets children by their
`sprintName` string, then matches each bucket name against `jira_sprints` **by name** to attach
`state` + `dateRange`. When a sprint is not present in `jira_sprints`, the group falls through to
`state: null` / `dateRange: null` and renders as a bare label.

Why old closed sprints are missing from `jira_sprints`:
- Routine syncs only refresh **active + future** sprints into `jira_sprints`
  (`refreshSprintMetadata` via `getSprintsLightweight`). Closed sprints only enter via an explicit
  `scope=history` sync (`POST /api/jira/sync-sprints?scope=history`) or via the on-demand
  ID-based backfill below.
- An on-demand backfill **already exists**: `ensureSprintsCached(sprintIds)`
  (`src/lib/sprint-cache.ts`) fetches each missing id via `jiraClient.getSprint(id)`, merges full
  metadata into `jira_sprints`, and invalidates `/api/jira/sprints`. It is best-effort
  (failures are logged, never throw).
- **But it only runs inside the ticket-sync passes** (`src/lib/sync-tickets-service.ts`, three
  call sites). The epic-children read path (`GET /api/epics/[key]/tickets`) and the ticket-detail
  builder (`src/lib/ticket-detail-builder.ts`) never trigger it. So a closed sprint that no recent
  sync touched stays name-only until a full history sync happens to pick it up.

Key wrinkle: grouping matches by **name**, but the backfill works by **sprint id**. The ticket
already carries its sprint ids (`ticket.sprintIds`, JSON array; primary in `ticket.sprintName`), so
the ids needed to backfill are available on the read path.

## The gap

The name-resolution path (`cacheSprintName` / `ticket.sprintName`) and the full-metadata path
(`jira_sprints`) are decoupled. We can resolve a sprint's *name* without ever fetching its
*details*. The user's ask: at the point where we already know the name, fetch all relevant info too.

## Decisions

- **Async, best-effort.** The read request does not block on the backfill. Bridge returns
  immediately with whatever it has (name-only is acceptable for one render); the full metadata is
  fetched in the background and appears on the next `/api/jira/sprints` revalidate. Matches the
  existing `ensureSprintsCached` pattern.
- **Deleted-in-Jira ⇒ remove on our side.** If `jiraClient.getSprint(id)` returns a definitive
  **404 / not found**, the sprint no longer exists in Jira, so Bridge removes its own cached copy:
  delete the entry from `jira_sprints` and its `sprintNameCache` row. This doubles as the
  negative-cache answer — once removed there is no partially-known name left to re-resolve, so we
  stop re-fetching it. (Stale `ticket.sprintName` references are cleared by the normal ticket
  re-sync; out of scope here.)
- **Only 404 deletes; transient errors are skipped.** A network error, timeout, 401/403, or 5xx is
  *not* treated as "deleted" — it is logged and left untouched, to avoid discarding good data on a
  temporary Jira hiccup.
- **Broad scope, hooked at the source.** Rather than patching one view, the backfill is tied to the
  point where a sprint's name is resolved into the cache (`cacheSprintName` / a wrapper around it),
  so name and full metadata never stay decoupled. This covers every surface that renders a sprint
  (epic *By sprint* view, sprint board, stakeholder view, sprint switcher) in one place.
- **Fire-and-forget + dedup.** Because name resolution can be hit many times per request, the
  backfill must dedup in-flight ids (don't fan out N identical `getSprint` calls) and run detached
  from the response so it never adds latency. Reuses `ensureSprintsCached`, extended with the
  404-cleanup behaviour above.

## Implementation Plan

Verified facts: `ticket.sprintName` stores the sprint **id** (`String(sprint.id)`,
`sync-tickets-service.ts:77`), not a name. All four surfaces read metadata from
`GET /api/jira/sprints`, so that is the single hook point. 404 is `err instanceof JiraApiError &&
err.status === 404` (precedent `sync-tickets-service.ts:90`). Fire-and-forget uses `after()` from
`next/server` (already used in `sync-epics/route.ts`).

1. **Extend `ensureSprintsCached` (`src/lib/sprint-cache.ts`)** — the single backfill path:
   - Module-level in-flight `Map<string, Promise<...>>` so concurrent calls for the same id issue
     one `getSprint`. Wrapper returns a discriminated outcome (`found` / `missing` / `error`) so the
     404 vs transient decision is shared across dedup callers.
   - Treat a cached sprint as needing no fetch only when it is **complete**; a closed sprint with no
     `endDate` is incomplete and gets re-fetched (covers partial metadata). Active/future/backlog
     entries stay complete (no churn; future sprints legitimately lack dates).
   - On a definitive **404**, remove the id from `jira_sprints` AND delete its `sprintNameCache` row.
   - Transient errors are logged and leave the cache intact (existing behaviour).
   - Merge by id (replace-or-add), so a re-fetched partial entry is replaced, not duplicated.
   - Persist + `cache.invalidate("/api/jira/sprints")` when anything was fetched or deleted. Return
     count of fetched sprints (unchanged signature).
2. **Read-path trigger (`src/app/api/jira/sprints/route.ts` GET)** — schedule via `after()` a job
   that selects distinct numeric `ticket.sprintName` ids and calls `ensureSprintsCached(ids)`.
   Runs detached (post-response, zero added latency), on both cache hit and miss; wrapped in
   try/catch + `logger.warn` so it never breaks the response.
3. **Tests**: `sprint-cache.test.ts` (404 deletes from both caches; transient leaves intact;
   cross-call dedup issues one `getSprint`; partial closed sprint re-fetched + merged, not
   duplicated). `sprints/route.test.ts` (GET schedules backfill with the referenced ids; `after`
   mocked to run synchronously).
4. **Docs**: `docs/architecture/jira-sync.md` — read-path enrichment section.

## Acceptance Criteria

- [x] Opening an epic and switching child issues to *By sprint* shows a date range and a state chip
      for every group whose sprint exists in Jira, including old **closed** sprints
      (e.g. `VP Sprint 66 Angels` shows its real dates + CLOSED), without a manual history sync.
- [x] When Bridge encounters a sprint it can name but whose full metadata
      (`startDate`/`endDate`/`state`/`goal`) is missing from `jira_sprints`, it fetches the full
      record from Jira and persists it into `jira_sprints`.
- [x] Backfill is async and best-effort: it never blocks or breaks the surrounding request/render;
      transient failures (network/timeout/401/403/5xx) are logged and the cached copy is left intact.
- [x] When `getSprint` returns a definitive **404**, the sprint is removed from both `jira_sprints`
      and `sprintNameCache` on our side, so a sprint deleted in Jira disappears from Bridge and is
      not re-fetched on every subsequent view.
- [x] Backfill is hooked at the name-resolution source (not a single view), so the same fix applies
      across the epic *By sprint* view, sprint board, stakeholder view, and sprint switcher.
- [x] Concurrent resolutions of the same sprint id do not produce duplicate `getSprint` calls
      (in-flight dedup), and the backfill never adds latency to the triggering request.
- [x] `/api/jira/sprints` is invalidated/revalidated after a successful backfill so the new
      dates/state appear in the UI.
- [x] Tests cover: read-path collects sprint ids and triggers backfill; a missing closed sprint is
      fetched and merged; failures are swallowed; an already-cached sprint is not re-fetched.
- [x] Docs updated: `docs/architecture/jira-sync.md` (where/when partial sprints get backfilled).

## Phase 2 — legacy name-only sprints + live app refresh

**Found in testing on VPL-9642.** Phase 1's id-based backfill does not fix the reported sprint.
`VPL-13088` stores the literal sprint **name** `"VP Sprint 66 Angels"` in `ticket.sprint_name`
(not an id), with empty `sprint_ids`, and that name no longer exists in Jira (it was renamed; the
surviving sprint is `Sprint 78 - Angels`, id 589). These legacy rows come from the on-demand fetch
path (`ticket-detail-builder.ts:299` passes `sprint?.name`, and `__on_demand__` placeholders).
Because there is no id, the sprint endpoint backfill skips it, so the group stays name-only.

Also, Phase 1 only invalidated the **server** sprint cache; the **open page never refreshed**, so
even resolvable sprints required a manual reload.

Decision (confirmed with PO): re-sync the affected child ticket(s) from Jira. That rewrites
`sprint_name` to the current sprint id (via `syncIndividualTickets`, which uses `String(sprint.id)`
and runs `ensureSprintsCached`), after which the sprint resolves with full metadata. The displayed
name may change to the current Jira name (e.g. `Sprint 78 - Angels`).

Plan:
1. **Detect** (`buildTicketDetail` / `resolveEpicChildren`, `src/lib/ticket-detail-builder.ts`):
   collect epic-child keys whose raw `sprint_name` is non-empty and **non-numeric** (legacy name or
   `__on_demand__`) — these need a ticket re-sync. Return them from `buildTicketDetail` and set a
   `resyncingSprints: true` flag on the response.
2. **Re-sync in background** (`GET /api/tickets/[key]`): when there are unresolved child keys,
   schedule via `after()` → `syncIndividualTickets(keys)`, then invalidate the parent detail cache
   (`/api/tickets/${key}`) and `/api/jira/sprints` so the next read rebuilds fresh.
3. **Live refresh** (`useTicketDetail`, `src/hooks/useSprintBoard.ts`): when the response has
   `resyncingSprints`, revalidate the ticket detail and the sprints list on a short, bounded poll
   until the flag clears, so the open page updates itself once the data arrives.

### Phase 2 Acceptance Criteria

- [x] An epic child whose `sprint_name` is a legacy **name** (or `__on_demand__`) with no id is
      detected on the read path and re-synced from Jira, rewriting it to the current sprint id.
- [x] After the background re-sync, the open ticket-detail page **refreshes itself** (no manual
      reload) and the sprint group shows its real dates + state.
- [x] The background re-sync invalidates the parent ticket-detail cache and `/api/jira/sprints`, and
      is best-effort (a failure never breaks the response).
- [x] The client revalidation is bounded (no infinite polling) and stops once the sprint resolves.
- [x] Tests: builder returns unresolved (non-numeric) child sprint keys; route schedules the re-sync
      + cache invalidation and sets the flag; client effect revalidates while flagged and stops when
      cleared.

## Notes

- Reuse `ensureSprintsCached` rather than introducing a second backfill path.
- Phase 1 is read-path enrichment; do not change how `sprintName` / `sprintIds` are written during
  sync. Phase 2 deliberately re-syncs whole tickets (the approved way to repair legacy name-only
  rows), which updates `sprint_name` as a side effect of a normal sync.
