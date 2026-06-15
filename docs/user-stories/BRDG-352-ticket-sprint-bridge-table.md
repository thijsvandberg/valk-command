# BRDG-352: Make sprint-membership filtering indexable via a ticket↔sprint bridge table

**Status:** Not Started
**Priority:** Medium
**Type:** Performance / Tech debt

## Description

As the Product Owner, I want the sprint board's ticket list to load fast and stop flooding the log with `slow-query` warnings, so that the board feels responsive and the logs are usable for spotting real problems.

In production, `GET /api/tickets` logs hundreds of `[slow-query]` lines (100ms to ~1900ms). The data is correct (it reads from local SQLite, not live Jira), but the sprint-membership filter cannot use an index, so every request full-scans and JSON-parses all ~6,400 ticket rows. This story replaces the un-indexable JSON-array filter with a proper, indexed **ticket↔sprint bridge table**.

## Root Cause

Sprint membership is stored as a JSON array in a single column, `ticket.sprint_ids` (e.g. `["6361","1779"]`) — `src/db/schema.ts:61-65`. The board filters with a containment query against that array — `src/app/api/tickets/route.ts:49-52`:

```sql
(sprint_ids IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(sprint_ids) WHERE value = ?))
OR (sprint_ids IS NULL AND sprint_name = ?)
```

A B-tree index indexes the **whole cell value** (the literal string `'["6361","1779"]'`), not the individual elements inside it. "Does this array contain X" is a multi-valued containment query, which no standard index can answer — and SQLite cannot build an index over a table-valued function like `json_each` (only over fixed scalar extracts such as `json_extract(..., '$[0]')`, which does not cover "any element = X"). So the engine must open every row, parse the JSON, and compare element-by-element across the full table on every request. The existing `ticket_sprint_name_idx` (`src/db/schema.ts:77`) is on the single `sprint_name` column and the `json_each` branch does not use it.

This is a **data-model limitation, not a missing index**: a many-to-many relationship (a ticket can belong to several sprints) is packed into one JSON column instead of being normalised.

### Why the bridge-table approach

Current data: **6,393 of 6,431 tickets are in exactly one sprint; only 38 are in more than one.** The JSON-array machinery runs on the entire table to serve a capability that 0.6% of rows use. A normalised bridge table makes membership an indexed lookup for all rows while still fully supporting multi-sprint tickets.

## Approach: `ticket_sprint` bridge table

- New table `ticket_sprint(ticket_key TEXT, sprint_id TEXT)`, one row per (ticket, sprint) membership, with an index on `sprint_id` (and a composite/unique on `(sprint_id, ticket_key)` to serve the board's "tickets in sprint X" query directly).
- The board's sprint filter becomes an indexed join / `IN` against `ticket_sprint` instead of the `json_each` EXISTS scan.
- The bridge table is **derived data** kept in sync from the existing `sprint_ids` write path — it does not replace `sprint_ids` (which still drives card labels etc.); it is the indexed projection of it.

## Context

- **Canonical write site:** `src/lib/upsert-issue.ts:63` already parses `sprintIdList` before serialising it to `sprintIdsJson` (`:187`). This is the single place to also write the bridge rows (delete existing rows for the ticket, insert the current set) so they never drift from `sprint_ids`.
- **Other writers of `sprint_ids`** to keep consistent: `src/lib/create-ticket.ts`, `src/lib/sync-tickets-service.ts`, `src/lib/ticket-cache.ts`, `src/app/api/jira/move-sprint/route.ts`. Prefer funnelling membership writes through one shared helper so every path maintains the bridge table.
- **The filter to replace:** `memberOfSprint` in `src/app/api/tickets/route.ts:49-52`, plus the `sprintKeySubquery` (`:62-65`) that re-runs the same filter for local-edits, story-versions, and subtask-counts.
- **Backfill:** the migration must populate `ticket_sprint` from existing `ticket.sprint_ids` for all current rows (and fall back to `sprint_name` for legacy rows where `sprint_ids` is null, matching the current OR-branch).
- **Scope note:** the separate cause of request *volume* (multiple components polling `/api/tickets` every 60s + focus revalidation, `src/hooks/useSprintBoard.ts:51-79`) is **out of scope** here; this story only removes the per-request scan cost. The slow-query threshold itself is 100ms (`src/lib/query-timer.ts`).

## Implementation Plan

1. **`ticket_sprint` table** (`src/db/schema.ts`, after the `ticket` table): columns `ticketKey text("ticket_key")` (FK → `ticket.jiraKey`, `onDelete: cascade`) and `sprintId text("sprint_id")`, both `notNull`. Composite PK `(ticketKey, sprintId)` (natural dedupe + covering index for per-ticket delete). Separate `index("ticket_sprint_sprint_id_idx").on(sprintId)` — this is the index the board read needs (`WHERE sprint_id = ?`) and the whole point of the story. Export `TicketSprintRow` / `NewTicketSprintRow` types.
2. **Migration** (`npm run db:generate` → `0078_*.sql`, then hand-append backfill): the generated `CREATE TABLE`/`CREATE INDEX` first, then two idempotent `INSERT OR IGNORE` backfill statements (separated by `--> statement-breakpoint`):
   - A: `INSERT OR IGNORE INTO ticket_sprint (ticket_key, sprint_id) SELECT t.jira_key, je.value FROM ticket t, json_each(t.sprint_ids) je WHERE t.sprint_ids IS NOT NULL;` (the `IS NOT NULL` guard avoids `json_each(NULL)` errors).
   - B (legacy fallback): `INSERT OR IGNORE INTO ticket_sprint (ticket_key, sprint_id) SELECT t.jira_key, t.sprint_name FROM ticket t WHERE t.sprint_ids IS NULL AND t.sprint_name IS NOT NULL AND t.sprint_name != '';` (`!= ''` excludes backlog). `OR IGNORE` covers idempotency + theoretical duplicate ids.
3. **Shared helper** `src/lib/sprint-membership.ts`: synchronous `syncTicketSprints(executor, ticketKey, sprintIds, sprintName)` accepting both `db` and a transaction `tx` (better-sqlite3 calls are synchronous). Resolves the id set: `sprintIds` wins when non-null (deduped); else `[sprintName]` if non-empty; else none. Delete-then-insert (convergent). The legacy `sprint_name` fallback now lives at write/backfill time, not query time.
4. **Wire into all writers**: `upsert-issue.ts` (inside the existing `tx` transaction, after the ticket upsert, using `sprintIdList`); `create-ticket.ts` (after the insert); `move-sprint/route.ts` (one `db.transaction` looping the batch of `issueKeys`, each with the single target sprint). `sync-tickets-service.ts` needs no change (routes through `upsertIssue`).
5. **Rewrite the route** (`src/app/api/tickets/route.ts`): replace `memberOfSprint` with `inArray(ticket.jiraKey, db.select(...).from(ticketSprint).where(eq(ticketSprint.sprintId, sprintId)))`. The `OR sprint_name` branch is dropped (now in the bridge data). Backlog branch, no-`sprintId` branch, `sprintKeySubquery` reuse, ordering, response mapping, and the 30s cache are all unchanged. `sprint_ids` stays on the ticket row for the response.
6. **Tests**: new `src/lib/sprint-membership.test.ts` (resolution + convergence + dedupe); extend `src/app/api/tickets/route.test.ts` (seed helper writes bridge rows; `sprint_ids` wins over `sprint_name`; legacy fallback); extend `src/lib/upsert-issue.test.ts` (bridge mirrors `sprintIdList`, re-sync removes stale rows, backlog → 0 rows); extend `src/app/api/jira/move-sprint/route.test.ts` (collapse + backlog + multi-key batch); a focused backfill-SQL test (migrate sees no data, so exercise the two statements directly).

## Acceptance Criteria

### Core
- [x] A `ticket_sprint` bridge table exists with an index on `sprint_id` (and a composite covering `(sprint_id, ticket_key)`), defined in `src/db/schema.ts` with a Drizzle migration.
- [x] `GET /api/tickets` resolves sprint membership via the indexed bridge table; the `json_each` containment scan in `route.ts` is removed (including from the `sprintKeySubquery` reused by the satellite queries).
- [x] Multi-sprint tickets (the 38 currently in >1 sprint) still appear in **every** sprint they belong to — no regression versus the JSON-array behaviour.
- [x] Legacy rows with `sprint_ids IS NULL` still resolve via `sprint_name` (preserve the current OR-branch semantics). <!-- Fallback now folded into the bridge at write/backfill time; the route is a plain indexed lookup. -->
- [x] The board's ticket list returns identical rows to the current implementation for the same sprint (verified by comparison, not just spot check). <!-- Existing route tests reseeded through the bridge keep asserting the same rows; added sprint_ids-wins-over-sprint_name case. -->

### Data integrity / sync
- [x] Every path that writes `ticket.sprint_ids` also updates `ticket_sprint` in the same operation (membership cannot drift). Ideally via one shared helper. <!-- syncTicketSprints wired into upsert-issue (in-tx), create-ticket, move-sprint (batch tx). sync-tickets-service routes through upsert-issue. -->
- [x] A migration backfills `ticket_sprint` from existing `ticket.sprint_ids` (and `sprint_name` fallback) for all current rows.
- [x] `sprint_ids` is retained on the ticket row (still used for labels/card rendering); the bridge table is an additional indexed projection, not a replacement.

### Performance
- [x] After the change, a sprint-filtered `GET /api/tickets` no longer full-scans the ticket table for membership; the `[slow-query] GET /api/tickets` warnings drop substantially under normal board use (confirmed via logs). <!-- Membership is now an index-driven IN-subquery on ticket_sprint_sprint_id_idx; no json_each scan. Live-log confirmation belongs to deploy. -->

### Tests
- [x] Test: filtering by a sprint returns exactly the tickets whose membership includes that sprint, including multi-sprint tickets appearing in each of their sprints.
- [x] Test: a legacy ticket with `sprint_ids = NULL` but a matching `sprint_name` is still returned.
- [x] Test: upserting/moving a ticket's sprints updates `ticket_sprint` (rows added and removed correctly); the bridge stays consistent with `sprint_ids`.
- [x] Test: the backfill migration populates `ticket_sprint` correctly from representative existing data.

## Technical Notes
- Keep `sprint_ids` as the source of truth for membership; treat `ticket_sprint` as derived. Rebuild-from-`sprint_ids` should be straightforward (a maintenance task can regenerate it), which also de-risks drift.
- Funnel membership writes through a single helper invoked by `upsert-issue.ts` and the other writers, rather than duplicating delete+insert logic per call site.
- Local-only: this is purely a local DB/schema change. No Jira writes (consistent with the platform's read-only-Jira posture).
- Out of scope: reducing `/api/tickets` request frequency (polling/SWR refetch intervals) and the 100ms slow-query threshold tuning — separate concerns.
