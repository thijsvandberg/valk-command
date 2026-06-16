# BRDG-356: Review newly created stories ("New stories" inbox)

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As the Product Owner, I want a single place to **see stories that were recently created** (by anyone) so I can keep an eye on what the teams are adding, and **tick them off** once I have looked at them. It works like an inbox: new stories show up, I review them, and I **mark them as read / dismiss** them so they leave my "needs a look" list.

I want this as a **table (default list view)** with one row per story and the columns I care about: **Title, Author, Sprint, Epic, SP, Assignee, Created date**. Rows should be **grouped by created date** (Today / Yesterday / Earlier this week / Older) so the freshest work is obvious at a glance.

I want **multi-select** so I can mark several stories as read in one go, not one by one.

Finally, because I mostly care about my own team's work, I want stories to be **grouped/ordered by team with my own team(s) at the top**, so I do not have to scan past other teams to find what is mine.

## Current Behaviour

- There is no "newly created" feed for tickets. New stories only appear inside the relevant sprint or the backlog; nothing flags them as "new" or "unseen" to the PO, and there is no way to acknowledge that I have reviewed one.
- Tickets already carry everything this view needs:
  - `ticket.reporter` (the **author** / creator), surfaced on the API as `reporter` (`src/app/api/tickets/route.ts:141`).
  - `ticket.jiraCreatedAt` (the **created date**, `src/db/schema.ts:69`).
  - `assignee`, `storyPoints`, `epicKey`/`epic`, `sprintId` are all already on the ticket payload (`src/app/api/tickets/route.ts:136-141`).
- **Teams** are not on the ticket directly. Team membership is derived from the **person**: `userTeamAssignment` maps a display name to a fixed team (BT/BM/BO/GXP/HT) (`src/db/schema.ts:980`), exposed via `GET /api/settings/user-teams`. "My team" is the dedicated **Default team** setting (`GET/PUT /api/settings/default-team`, `useDefaultTeam`), managed on Settings -> General.
- Bridge-local PO state about a ticket lives in `ticketMetadata` (e.g. `poNotes`, and the proposed `bookmarkedAt` in BRDG-355). Read/seen state belongs here too.
- Multi-select + bulk read/unread already has prior art for chat (BRDG-154) and for board rows (BRDG-273 epic children, BRDG-271 bulk move) — reuse the established multi-select toolbar pattern rather than inventing one.

## Decisions (confirmed)

- **Surface:** a **dedicated new route** (its own view), not a nav flip-view or board preset.
- **What's in the list:** **unread / unmarked only** — every ticket that has not yet been marked read, with no recency window. Once marked read it leaves the list. (An optional undo path is via the toast immediately after dismiss; we do not keep read items in the list.)
- **Issue types:** **Story, Bug, Task, Epic, Spike** — **excluding sub-tasks**.
- **Team source:** resolved from the **author (reporter)**, via the existing **People settings** that couple a person to a team — `userTeamAssignment` (`src/app/(app)/settings/people/page.tsx`, `GET /api/settings/user-teams`). No new team data.
- **"My team":** the PO's own team comes from the dedicated **Default team** account setting (`GET/PUT /api/settings/default-team`, managed on Settings -> General, `useDefaultTeam`). When unset, the view falls back to plain date grouping with no team priority.

## Proposed Approach

A story is **"new / unread"** when it has been created (we have a `jiraCreatedAt`) and the PO has **not yet marked it as read**. "Mark as read" is durable, per-PO state, so it lives in `ticketMetadata` as a timestamp — same shape as the bookmark in BRDG-355.

### Storage
- Add one column to `ticketMetadata`: `newStoryReadAt: text("new_story_read_at")` (ISO timestamp; `null` = unread / still in the inbox). A timestamp (not a boolean) lets us show *when* it was acknowledged and audit later. New Drizzle migration.
- No new "team" storage: team is resolved at read time by joining the ticket's **`reporter`** display name to `userTeamAssignment` (the People settings mapping).

### What counts for the inbox
- The inbox lists **only unread** tickets (`newStoryReadAt IS NULL`) of type Story / Bug / Task / Epic / Spike (no sub-tasks), ordered by `jiraCreatedAt` desc. No recency window — marking read is what removes a row.

### API
- New read endpoint `GET /api/new-stories` returning unread, non-sub-task tickets with the columns the table needs (key, title, author/reporter, sprint name, epic, storyPoints, assignee, `jiraCreatedAt`, and the resolved team), ordered by created date desc. Reuses the existing ticket/metadata join.
- Extend `UpdateMetadataInput` with `newStoryRead?: boolean` so `updateTicketMetadata` sets `newStoryReadAt = datetime('now')` when `true` and `null` when `false` (un-dismiss). Keep the public input a boolean; the timestamp is internal — identical to the bookmark approach.
- A **bulk** mark-as-read endpoint (or accept an array of keys on the metadata route) so multi-select can acknowledge many tickets in one request, mirroring the chat bulk read/unread route (BRDG-154).

### UI
1. **Surface** — a dedicated **"New stories" route/view**. The table is wide (7 columns) so it gets its own page. A small **unread count badge** in the nav advertises how many stories are waiting.
2. **Table (default list view)** — one row per story with columns: **Title** (as `TicketRefPill` + title, click opens the ticket side panel), **Author**, **Sprint**, **Epic**, **SP**, **Assignee**, **Created date**.
3. **Grouping** — primary grouping by **team** (my own team(s) first, then others), and within/across that a **date grouping** (Today / Yesterday / This week / Older). The two groupings need a clear precedence — default assumption: **team first, date second** (so "my team, today" is the very top). Collapsible group headings (reuse BRDG-300).
4. **Mark as read** — a per-row action (checkbox column + an explicit "Mark as read" / dismiss control). Optimistic toggle consistent with other instant-UI mutations (BRDG-334). An undo affordance (toast) after dismiss.
5. **Multi-select** — checkbox selection with a **bulk action toolbar** ("Mark N as read") reusing the established multi-select toolbar (BRDG-212/BRDG-273). Read rows leave the unread list (or grey out when "Unread only" is off).
6. Every clickable element needs hover / focus-visible / active + `cursor: pointer`.

## Dependencies

- **Default team setting** — the PO's own team comes from the dedicated **Default team** account setting (`GET/PUT /api/settings/default-team`, `useDefaultTeam`, Settings -> General), which is being built separately. This view consumes it to sort own-team stories to the top; when unset, it falls back to plain date grouping with no team priority. Wire the team sort to that setting.

Resolved (see Decisions above): surface = dedicated route; list = unread-only, no recency window; types = Story/Bug/Task/Epic/Spike, no sub-tasks; team source = author via People settings; my-team via Default team setting; authors with no team mapping go in an "Unassigned team" bucket sorted last. Read state is stored in `ticketMetadata` (DB), so it is shared across devices — consistent with the single-user app.

## Implementation Plan

1. **Schema + migration** — add `newStoryReadAt` to `ticketMetadata` (`src/db/schema.ts`); generate Drizzle migration.
2. **Service** — extend `UpdateMetadataInput` with `newStoryRead?: boolean`; in `updateTicketMetadata` translate to `newStoryReadAt` set/clear (`src/services/ticket-service.ts`). Add a bulk variant for multiple keys. Validate inputs.
3. **Read endpoint** — `GET /api/new-stories` returning the table rows (author, sprint, epic, SP, assignee, created date) + resolved team, filtered to unread (`newStoryReadAt IS NULL`) and types Story/Bug/Task/Epic/Spike (no sub-tasks), ordered by `jiraCreatedAt` desc.
4. **Team resolution** — join the ticket's **`reporter`** to `userTeamAssignment` (People settings); resolve "my team" from the **Default team** setting (`useDefaultTeam` / `GET /api/settings/default-team`) so the view can sort it to the top; unmapped authors fall into an "Unassigned team" bucket sorted last.
5. **Table UI** — new view/route with the 7 columns, team-then-date grouping, collapsible group headings (BRDG-300), `TicketRefPill` titles that open the side panel.
6. **Mark-as-read UI** — per-row toggle (optimistic, BRDG-334) + undo toast (BRDG-241 shared toast).
7. **Multi-select** — selection state + bulk "Mark as read" toolbar reusing the multi-select toolbar (BRDG-212), calling the bulk endpoint.
8. **Nav badge** — unread count surfaced in the nav (reuse the count pattern from notifications/chat).
9. **Cache/invalidations** — mark-as-read invalidates `/api/new-stories` and the ticket's keys so the list and any badge refresh without manual reload.
10. **Tests** — see below.

## Acceptance Criteria

- [ ] I can open a "New stories" view that lists recently created stories as a table with columns: Title, Author, Sprint, Epic, SP, Assignee, Created date.
- [ ] Rows are grouped by created date (Today / Yesterday / This week / Older), and groups are collapsible.
- [ ] Stories are ordered so my own team's stories appear at the top, ahead of other teams.
- [ ] I can mark a single story as read; it leaves the unread list immediately (optimistic) and stays read across reloads.
- [ ] I can multi-select several stories and mark them all as read in one action.
- [ ] "Read" state persists in the Bridge database (shared across devices), not just localStorage.
- [ ] Clicking a story's title/pill opens the ticket (side panel) without losing my place in the list.
- [ ] An unread count is visible in the nav so I know when new stories are waiting; it updates after I mark stories as read.

## Tests

- [ ] Service test: `updateTicketMetadata({ newStoryRead: true })` sets `newStoryReadAt`; `{ newStoryRead: false }` clears it to `null`; the bulk variant marks multiple keys; non-boolean is rejected.
- [ ] `GET /api/new-stories` returns only unread tickets, excludes sub-tasks (includes Story/Bug/Task/Epic/Spike), is ordered by created date desc, and includes author, sprint, epic, SP, assignee and resolved team.
- [ ] Team ordering: a ticket whose **reporter** belongs to "my team" sorts ahead of one from another team; a ticket whose reporter has no team mapping lands in the "Unassigned team" bucket sorted last.
- [ ] Marking read invalidates the new-stories cache (and unread count) so the list/badge update without manual refresh.
- [ ] Component test: table renders the 7 columns and date group headings; multi-select + bulk "Mark as read" fires the bulk update and removes the rows optimistically; undo toast restores them.

## Related

- [[BRDG-355-bookmark-story-for-reference]] — same `ticketMetadata` timestamp pattern (`bookmarkedAt`) for durable per-PO ticket state.
- [[BRDG-154-chat-read-unread-bulk-actions]] — prior art for read/unread + multi-select bulk actions.
- **Default team setting** (`/api/settings/default-team`, `useDefaultTeam`, Settings -> General) — source of truth for "my team" so own-team stories sort to the top.
- [[BRDG-185-favorite-users-and-teams]] — adjacent favourites work for users/teams.
- [[BRDG-330-recently-viewed-tickets]] — adjacent "quick access" surface; this is the inbox of new work rather than what I have viewed.
- [[BRDG-300-collapsible-section-headings]] — collapsible group headings for the date/team groups.
- [[BRDG-241-shared-toast-component]] — undo-after-dismiss toast.
