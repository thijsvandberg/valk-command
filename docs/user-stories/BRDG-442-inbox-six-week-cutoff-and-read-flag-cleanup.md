# BRDG-442: Inbox 6-week age cutoff + auto-cleanup of read-flags

**Status:** To Do
**Priority:** Low
**Type:** Chore

## Description

The `/inbox` New stories view currently shows every unread, reviewable ticket
regardless of age. Two coupled changes:

1. **Inbox age filter** — only show stories created in the last 6 weeks. Stories
   older than that drop out of the inbox even if never read.
2. **Auto-cleanup of read-flags** — a scheduled task deletes `new_story_read`
   rows older than 6 weeks, mirroring the existing notification/activity-log
   cleanup tasks.

This is primarily about **hygiene**, not disk space. Today `new_story_read`
holds ~9010 rows for a single user (~1 MB on a 111 MB database), so the storage
win is negligible right now. The value grows with usage: the table accumulates
one row per ticket-marked-read **per user**, so with multiple Bridge users the
unbounded growth (rows = tickets x users) starts to matter, and an inbox that
never ages out old stories becomes noisy. This change bounds both.

### Why the two changes must ship together

Deleting read-flags **alone** would be actively harmful: the inbox query treats
"no `new_story_read` row" as *unread* (a `notExists` check), so wiping an old
read-flag would make that ticket **reappear** in the inbox. The age filter is
what makes deletion safe.

Keying both sides off the **same 6-week constant** makes the deletion provably
safe via a simple invariant: a read-flag is only deleted when `readAt < now-6w`,
and `readAt` is always >= the ticket's creation time (you cannot mark a ticket
read before it exists). Therefore any ticket whose read-flag is old enough to
delete was itself created more than 6 weeks ago, so it already fails the inbox
age filter and cannot reappear. (Equivalently: the cleanup retention window must
be `>=` the inbox age window; sharing one constant guarantees equality.)

## Current Behaviour

- **Inbox query** lives in `src/lib/new-stories-query.ts`. `newStoriesWhere(ctx)`
  builds the shared filter used by both `listNewStories` and `countNewStories`:
  unread for this user (`notExists` against `newStoryRead`), still present in
  Jira (`isNull(ticket.removedFromJiraAt)`), a reviewable status, a non-subtask
  type, and not authored by this user. There is **no age filter** today; results
  are ordered `desc(ticket.jiraCreatedAt)` but never bounded by it.
- **Read-flags** are stored in `new_story_read` (`src/db/schema.ts:401`), keyed
  `(user_id, ticket_key)` with a `read_at` timestamp (defaults to `datetime('now')`).
  Per-user since BRDG-359. No FK on `ticket_key`. Nothing prunes this table.
- **Ticket age** is `ticket.jiraCreatedAt` (`src/db/schema.ts:77`), nullable ISO
  text.
- **Scheduled cleanup pattern** lives in `src/lib/scheduled-tasks.ts`. Existing
  retention tasks `cleanupOldNotifications` (alerts > 30 days) and
  `cleanupActivityLog` (entries > 7 days) follow the exact shape needed here:
  compute an ISO cutoff, `db.delete(...).where(lt(column, cutoff))`, return a
  `TaskResult`, and register via `defineTask(name, label, description, intervalMs, handler)`.
  Tasks run lazily on the scheduler tick and appear in the System Tasks admin page.

## Proposed Approach

Introduce one shared constant for the 6-week window and use it on both sides.

**1. Inbox age filter (`src/lib/new-stories-query.ts`)**
Add an age bound to `newStoriesWhere` so it only returns tickets created within
the window. Because `listNewStories` and `countNewStories` both call
`newStoriesWhere`, the list and the badge count stay consistent automatically.
A plain `gte(ticket.jiraCreatedAt, cutoff)` is the right shape: it also hides
tickets with a null `jiraCreatedAt` (`NULL >= cutoff` is false in SQL), which is
the desired behaviour here (see Open Questions) — no `isNull` guard needed.

**2. Cleanup task (`src/lib/scheduled-tasks.ts`)**
Add `cleanupReadStoryFlags()` that deletes `new_story_read` rows where
`read_at < now-6w`, and register it with `defineTask` next to the other cleanup
tasks (hourly interval is fine; this is not time-critical).

**3. Shared constant**
Define the 6-week duration once and import it where both the query and the task
can reach it (e.g. a small exported constant in `new-stories-query.ts` or a
shared lib), so the two windows can never drift apart and break the safety
invariant above.

**Non-goals / out of scope**
- No change to how stories are marked read, or to the per-user read model.
- No backfill/migration; the cleanup task drains the existing ~9010 rows on its
  first eligible runs.
- The 6-week window is not user-configurable in this story.
- No change to other inbox groupings (Relevance) beyond the shared age filter.

## Open Questions

- **Tickets with a null `jiraCreatedAt` (resolved).** Decision: **hide them**
  from the inbox (treat undated as outside the window). Data check on the live DB
  found ~4843 such tickets, almost all real `VPL-*` rows in `TO DO`
  (story/spike/task) that are **date-less skeleton rows** — they have neither a
  created nor an updated date and were all bulk-synced on 2026-06-16 (low key
  numbers like VPL-79 confirm they are very old backlog, not new). Keeping them
  visible would mean exactly this old undated cruft never ages out of the inbox,
  defeating the filter. Hiding is also the simpler implementation (a bare `gte`
  drops nulls). The read-flag cleanup is unaffected either way since it keys on
  `new_story_read.read_at`, not on ticket age.
- **Follow-up (out of scope): backfill the missing dates.** The ~4843 null rows
  are a sync-gap artefact, not genuinely date-less tickets. A separate story
  could backfill `jira_created_at` / `jira_updated_at` from Jira for these so they
  are dated correctly rather than blanket-hidden. Not required for this story.

## Acceptance Criteria

- [ ] The `/inbox` New stories list excludes stories whose `jiraCreatedAt` is more than 6 weeks ago. <!-- newStoriesWhere in src/lib/new-stories-query.ts -->
- [ ] The inbox badge count matches the filtered list (no stale count for aged-out stories). <!-- countNewStories reuses newStoriesWhere -->
- [ ] Stories with a null `jiraCreatedAt` are excluded from the inbox (treated as outside the window). <!-- bare gte(ticket.jiraCreatedAt, cutoff) drops nulls -->
- [ ] A scheduled task deletes `new_story_read` rows older than 6 weeks and is registered in System Tasks. <!-- cleanupReadStoryFlags + defineTask in src/lib/scheduled-tasks.ts -->
- [ ] The inbox age window and the cleanup retention window are driven by a single shared 6-week constant. <!-- shared const imported by both files -->
- [ ] Deleting an aged-out read-flag does not cause its ticket to reappear in the inbox (the safety invariant holds). <!-- covered by the age filter -->

## Tests

- [ ] Inbox query hides a ticket created >6 weeks ago and keeps one created <6 weeks ago. <!-- src/lib/new-stories-query.test.ts -->
- [ ] Inbox query excludes a ticket with null `jiraCreatedAt`. <!-- src/lib/new-stories-query.test.ts -->
- [ ] `cleanupReadStoryFlags` deletes only rows with `read_at` older than the cutoff and leaves recent rows. <!-- src/lib/scheduled-tasks.test.ts -->
- [ ] Regression: after cleanup, an aged-out ticket is still absent from `listNewStories` (invariant proof). <!-- src/lib/new-stories-query.test.ts -->

## Related

- [[BRDG-359-per-user-new-story-read-state]] — introduced the per-user `new_story_read` table this story prunes.
- [[BRDG-356]] — original global read flag on `ticketMetadata.newStoryReadAt`, now deprecated.
- Builds on the scheduled-cleanup pattern: `cleanupOldNotifications` / `cleanupActivityLog` in `src/lib/scheduled-tasks.ts`.
