# BRDG-363: Canonical `jira_user` table + sync population (people keyed on accountId)

**Status:** Not Started
**Priority:** Medium
**Type:** Tech debt / Data integrity

## Description

BRDG-360 made every ticket capture the stable Jira `accountId` for its reporter and assignee, but the person's label (display name, email, avatar) is still stored **denormalized on each ticket row**. That means a person renamed in Jira only updates wherever they happen to re-sync, and there is no single place that lists "all known Jira people".

This story introduces a canonical **`jira_user` table** keyed on `accountId`, populated during sync, as the single source of truth for a person's label. The `accountId` on the ticket becomes a foreign key into it; the resolver from BRDG-360 reads the table instead of the ticket's denormalized fields.

The cached display name on the ticket row is **kept as a fallback** (not dropped), because `accountId` is not guaranteed present — Jira privacy settings can hide it, external/deleted users may lack it, and legacy rows synced before capture have none. A missing accountId must never blank out a name.

## Current Behaviour

- `ticket.reporterAccountId` / `ticket.assigneeAccountId` hold the stable id (BRDG-360); `ticket.reporter` / `ticket.assignee` (+ avatar/email) hold the denormalized label.
- `resolveReporter` / `resolveAssignee` (`src/lib/person-ref.ts`) build a `PersonRef` purely from the ticket row's own columns.
- Person labels are also denormalized on `ticketSubtask`, `ticketLink`, and `jiraComment` rows.

## Proposed Approach

1. **Schema:** add `jira_user` table — `accountId` (PK), `displayName`, `email`, `avatar`, `updatedAt`. Generate the migration via `npm run db:generate`.
2. **Populate during sync** (`src/lib/upsert-issue.ts`): upsert every person seen on an issue into `jira_user` — reporter, assignee, comment authors, subtask assignees, and linked-issue assignees. A rename updates the single row.
3. **Resolver reads the table:** the canonical resolution becomes table-backed (read `jira_user` by `accountId` for the label; fall back to the ticket's cached name/avatar when the accountId is null or has no row yet). Keep the existing `resolveReporter`/`resolveAssignee` signatures usable so the BRDG-360 proof-of-concept consumer needs no output change.
4. **Keep the ticket's cached name** as the fallback layer; do not drop those columns.
5. **Backfill (run after this ships):** a full re-sync of all sprints + backlog fills both the ticket GUIDs and the `jira_user` table in one pass. No separate backfill script.

Broad re-keying of every display path (subtasks, links, comments, board cards) onto the table stays **incremental follow-up** — this story delivers the table, the sync population, the table-backed resolver, and keeps the one BRDG-360 consumer green, so it ships on its own.

## Acceptance Criteria

- [ ] A `jira_user` table exists, keyed on `accountId`, holding displayName/email/avatar.
- [ ] Sync upserts every person seen on an issue (reporter, assignee, comment author, subtask assignee, linked-issue assignee) into `jira_user`.
- [ ] A rename in Jira updates the single `jira_user` row; the new name resolves everywhere the resolver is used (demonstrated by a test).
- [ ] The resolver reads `jira_user` for the label and falls back to the ticket's cached name/avatar when the accountId is null or has no row — no blank names (demonstrated by a test).
- [ ] No regression: the BRDG-360 ticket-detail reporter consumer renders the same name/avatar as before.

## Tests

- [ ] Sync upserts a person into `jira_user`; a second sync with a changed display name updates the same row (one row, new name).
- [ ] Resolver returns the `jira_user` label by accountId.
- [ ] Resolver falls back to the ticket's cached name when the accountId is null/unknown (no blank).

## Related

- [[BRDG-360-stable-person-identifier-reporter-assignee]] — captured the accountId + added the resolver this story rehomes onto the table.
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — self-exclusion should be built directly on the accountId / this table instead of the planned name-matching interim.
- Follow-ups that re-key onto `jira_user`: favourite-users, `userTeamAssignment`, board Assignee filter.
