# BRDG-354: New stories should land at the top of their sprint

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As the Product Owner, when I create a new story (from the Story Writer, the sprint board "create" flow, or an epic child) and place it in a sprint, I want it to appear at the **top** of that sprint's column, so I see and can act on what I just added without scrolling to the bottom.

Today a newly created ticket lands at the **bottom** of the sprint: Jira's Agile API places new issues at the end by default, and Bridge does not re-rank after creation. The ticket's local `jiraRank` stays `null` until the next sync, so it sorts last (the board sorts nulls last, then by `jiraRank` ascending — `src/app/api/tickets/route.ts:68-72`).

## Current Behaviour

- Tickets are created in Jira's backlog first, then moved into the sprint (`jiraClient.moveToSprint`) — Jira does not accept a sprint on create. After the move, no rank call is made, so the issue stays at the bottom.
- The rank-to-top mechanism already exists and is proven (used by drag-to-move-sprint with `position: "top"`): `jiraClient.rankToTopOfSprint(issueKeys, sprintId)` (`src/lib/jira-client.ts:1055-1060`). The move-sprint route also re-reads the sprint to refresh local `jiraRank` so the new position shows immediately (`src/app/api/jira/move-sprint/route.ts:121-143`).

## Creation Paths to Cover

There are three paths that can place a new ticket in a sprint; all should land at the top:

1. **Sprint board "create"** → `POST /api/tickets` → shared `createTicketWithJira()` in `src/lib/create-ticket.ts` (sprint move at line ~87). Also used by placeholder promotion and (shared) epic children.
2. **Story Writer global create** → `POST /api/story-writer/create` (`src/app/api/story-writer/create/route.ts`) — creates the issue directly via `jiraClient.createIssue()` with `sprintId`; does NOT go through `createTicketWithJira()`.
3. **Epic children create** → `POST /api/tickets/[key]/children` — `createIssue()` then `moveToSprint()` separately.

## Proposed Approach

Reuse the existing `rankToTopOfSprint` helper rather than inventing new ranking logic.

- In the shared `createTicketWithJira()` (`src/lib/create-ticket.ts`), right after the successful `moveToSprint`, call `jiraClient.rankToTopOfSprint([key], sprintIdNum)`. This covers the board create, placeholder promotion, and the shared epic-children path in one place.
- In `src/app/api/story-writer/create/route.ts`, add the same `rankToTopOfSprint` call after creating the issue when a `sprintId` was provided.
- Make the rank call **best-effort / non-fatal**: if it fails, the ticket is still in the sprint (just not re-ranked) — log a warning and continue, do not fail the create. This mirrors how `backfillUnknownSprints` swallows errors.
- Optionally refresh local `jiraRank` for the sprint after the rank call (as move-sprint does) so the top position shows without waiting for the next sync. If skipped, the position corrects on the next sprint sync.

## Open Questions

- Should this also apply when a ticket is created **without** a sprint (i.e. into the backlog)? Default assumption: only re-rank when a sprint is assigned; leave backlog creates as-is unless requested. (`rankToTopOfBacklog` exists if we want it.)
- Should "top" be the default for all creates, or configurable? Default assumption: always top for new creates (matches the request); revisit only if it conflicts with another flow.

## Implementation Plan

Reuse the existing `jiraClient.rankToTopOfSprint(issueKeys, sprintId)` helper. Add a best-effort (non-fatal, `logger.warn`) rank call in each creation path, gated on the sprint move having actually succeeded.

1. **`src/lib/create-ticket.ts`** (shared seam: board create + placeholder promotion). After the `moveToSprint` try/catch, in a **separate** try/catch gated on `assignedSprintId`, call `rankToTopOfSprint([key], sprintIdNum)`. A rank failure must not roll back `assignedSprintId`.
2. **`src/app/api/tickets/[key]/children/route.ts`** (epic child). Same pattern after its `moveToSprint` try/catch, gated on `assignedSprintId` (`sprintIdNum` already in scope).
3. **`src/app/api/story-writer/create/route.ts`** (Story Writer global create). This path currently passes `sprintId` to `createIssue`, but Jira Cloud silently ignores the sprint field on create (per the comments in the other two paths), and the route never writes `sprintName` locally. To make the AC genuinely hold, align it to the same pattern: after `createIssue`, when `sprintId` is given, `moveToSprint` then `rankToTopOfSprint`, set `assignedSprintId`, and write `sprintName`/`sprintIds` locally (+ `syncTicketSprints`). Skip ranking when no `sprintId`.
4. **"Reflect without manual refresh"**: rely on the existing `cache.invalidate(/^\/api\/tickets/)` + SWR revalidation + next Jira sync. Do NOT replicate the move-sprint local-rank-refresh: creates are not optimistic-reorder UI, so the extra per-create rank recompute is not worth the complexity. The AC explicitly allows "next sync".
5. **Tests**: new `src/lib/create-ticket.test.ts`; update `src/app/api/story-writer/create/route.test.ts` and `src/app/api/tickets/[key]/children/route.test.ts`. Mock `rankToTopOfSprint`/`moveToSprint` as `vi.fn()`. Cover: called with new key + sprint id when sprint assigned; not called when no sprint; a thrown rank call still creates the ticket.

Order: (1) create-ticket.ts + new test, (2) children route + test, (3) story-writer route + test.

## Acceptance Criteria

- [x] A story created via the Story Writer into a sprint appears at the top of that sprint's column.
- [x] A story/task created via the sprint board "create" flow into a sprint appears at the top.
- [x] An epic child created into a sprint appears at the top.
- [x] If the rank call fails, the ticket is still created and assigned to the sprint (no error surfaced to the user); a warning is logged.
- [x] The new position is reflected on the board without a manual refresh (either via local rank refresh or the next sync). <!-- relies on cache.invalidate + SWR revalidation + next Jira sync, per plan item 4 -->>

## Tests

- [x] Unit test for `createTicketWithJira`: when a `sprintId` is given and `moveToSprint` succeeds, `rankToTopOfSprint` is called with the new key and sprint id.
- [x] Unit test: a thrown `rankToTopOfSprint` does not fail the create.
- [x] Unit test for the Story Writer create route: `rankToTopOfSprint` is called when `sprintId` is provided and skipped when it is not.

## Follow-up fix (post-test)

First pass landed the rank call in the create paths but the story still appeared at the **bottom** when created via the Story Writer. Two gaps:

1. **Wrong path.** The Story Writer modal does not call `POST /api/story-writer/create`. It uses the **draft flow**: `create-draft` → background `syncDraftToJira()` (which creates the Jira issue) → `finalizeDraft()`. That path had no sprint assignment or ranking. Fixed in `src/lib/draft-sync.ts`: `syncDraftToJira` now assigns the sprint via `moveToSprint`, passes the sprint to `finalizeDraft`, and ranks to top; `finalizeDraft` now writes `sprintIds` + the `ticket_sprint` membership bridge so the story shows in the column.
2. **Local rank never set.** The board sorts by the local `jiraRank` (nulls last), so a freshly created ticket — whose `jiraRank` is null until the next full Jira sync — sorted to the bottom even though Jira had it at the top. Introduced `src/lib/sprint-rank.ts` → `landTicketAtTopOfSprint(key, sprintId)`, which does both layers: `jiraClient.rankToTopOfSprint` (survives the next sync) **and** sets the local `jiraRank` just below the sprint's current minimum (immediate board position). All four create paths now call this single helper.

Files: `src/lib/sprint-rank.ts` (new), `src/lib/draft-sync.ts`, `src/lib/create-ticket.ts`, `src/app/api/tickets/[key]/children/route.ts`, `src/app/api/story-writer/create/route.ts`. Tests: `src/lib/sprint-rank.test.ts` (new) + updated draft-sync / create-ticket / children / story-writer-create tests.

## Related

- [[BRDG-353-story-writer-wrapup-abort-new-story]] — same new-story-from-Story-Writer flow.
