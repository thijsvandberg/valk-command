# BRDG-378: Speed up sync (N+1 Jira fetches → bulk)

**Status:** Not Started
**Priority:** Medium
**Type:** Performance — Jira sync

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
found that the dominant sync latency comes from per-ticket Jira round-trips inside loops, plus an
N+1 comment-sync pattern and a missing index. The read paths are already well batched; this story
brings the write/sync paths up to the same standard. Two agents independently flagged the per-key
fetch loops.

## Current Behaviour

- **Per-key `getIssue` loops.** [sync-tickets-service.ts:253-271](../../src/lib/sync-tickets-service.ts)
  (sprint removal), `:386-402` (backlog), `:528-553` (group reconcile): after computing which
  tickets "left" a sprint/epic/backlog, each is re-fetched with a separate
  `await jiraClient.getIssue(key)` in a `for` loop to find its new sprint. The client throttles
  globally (200/min, 100ms min gap), so a reshuffle dropping 30 tickets is 30 serialized
  round-trips. `getIssuesByKeys` (bulk, paginated) already exists and is used in
  `fetchTimestampFirst`; `getSprints` (`jira-client.ts:639-651`) already shows the parallel pattern.
- **N+1 comment sync.** [sync-comments/route.ts:50-80](../../src/app/api/jira/sync-comments/route.ts):
  for each Jira comment it runs a separate `db.query.jiraComment.findFirst({ where eq(jiraCommentId) })`
  then update/insert (~80 statements for a 40-comment ticket). `upsertIssue` already solved this by
  preloading a `Map` of existing comments once ([upsert-issue.ts:188-195](../../src/lib/upsert-issue.ts)).
- **Missing index.** [schema.ts:485-499](../../src/db/schema.ts): `jira_comment` is upserted/filtered
  on `jiraCommentId` but only indexed on `ticketKey`, so each lookup is a partial scan and there is
  no uniqueness guarantee (a race could double-insert a comment).
- **`getSprints` enrichment.** [jira-client.ts:639-651](../../src/lib/jira-client.ts): fires one
  Agile API call per sprint purely to fetch `goal`, uncached, even when `goal` is already present.

## Proposed Approach

1. **Replace the three per-key loops** with one `getIssuesByKeys(removedKeys)` call each; process
   results in memory. Preserve the 404 → `removedFromJiraAt` handling by diffing returned keys
   against requested keys.
2. **Batch comment sync** — preload existing comments for the ticket into a `Map` once, branch in
   memory, mirror the `upsertIssue` pattern; switch the writes to `onConflictDoUpdate`.
3. **Add a unique index** `jira_comment_jira_comment_id_idx` on `jiraComment.jiraCommentId`
   (nullable, so the local-flag comments that leave it null are unaffected) via a migration.
4. **Skip/short-cache `getSprints` enrichment** — skip the per-sprint `goal` call when `goal` is
   already present (e.g. from `getSprintsLightweight`), or short-TTL cache the lookup.

This changes sync timing/ordering internally but **not** the resulting mirror state; behaviour as
observed by the PO is unchanged (same tickets, same sprints, faster).

## Implementation Plan

### Phase A — Schema + migration (first; everything depends on the unique index)
1. Add `uniqueIndex("jira_comment_jira_comment_id_idx").on(table.jiraCommentId)` to the `jiraComment` table in `src/db/schema.ts`. `jiraCommentId` stays nullable; SQLite allows multiple NULLs under a unique index.
2. Generate the migration with `npx drizzle-kit generate` (next is `0086_*`). Critical: `createTestDb()` runs `migrate()` against `drizzle/`, not a schema push, so the index only exists in tests once the migration file is present.

### Phase B — sync-comments route (depends on A)
3. In `src/app/api/jira/sync-comments/route.ts`, preload one `Map(jiraCommentId -> content)` for the ticket (mirroring `upsert-issue.ts`). Drop the per-comment `findFirst`; compute `changed` from the Map; replace insert/update with a single `onConflictDoUpdate({ target: jiraComment.jiraCommentId, set: { content, authorName, authorAvatar } })`.

### Phase C — sync-tickets-service bulk fetch (independent of B)
4. `syncSprint` removedKeys loop (`:253-271`) → one `getIssuesByKeys(removedKeys)`; present → set sprint; absent (404) → `removedFromJiraAt` + `sprintName=sprintId`, `removedCount++`.
5. `syncBacklog` leftBacklog loop (`:386-402`) → one `getIssuesByKeys`; present → set sprint; absent → `removedFromJiraAt`.
6. `reconcileGroupMembership` left loop (`:528-553`) → one `getIssuesByKeys`; present + sprint kind → set sprint; present + epic kind → set epic/epicKey; absent → `removedFromJiraAt`, `removedFromJira++`. Non-404 HTTP errors now throw from the bulk call (equivalent to the old `else throw`).

### Phase D — getSprints micro-opt (independent)
7. In `src/lib/jira-client.ts` `getSprints` enrichment (`:651-665`), skip the per-sprint Agile `goal` fetch when `sp.goal` is already defined.

### Phase E — Tests
8. sync-comments: M-comment payload → one preload, same rows; duplicate `jiraCommentId` does not double-insert.
9. sync-tickets-service: multi-ticket departure → single `getIssuesByKeys`, correct per-key sprint; absent key (404) still sets `removedFromJiraAt`.
10. `npm run build` + full vitest green; verify the new migration applies in `createTestDb`.

### Optional cleanup
11. `upsert-issue.ts` comment writes already preload a Map (O(1)); switching to `onConflictDoUpdate` is optional symmetry, not required by ACs.

## Acceptance Criteria

- [x] A sprint/backlog/group reconcile that moves N tickets issues a bounded number of Jira calls
      (one bulk fetch), not N sequential `getIssue` calls.
- [x] Comment sync for a ticket runs O(1) DB lookups (one preloaded Map), not one per comment.
- [x] `jira_comment.jiraCommentId` is indexed and unique; comment writes use `onConflict`.
- [ ] `getSprints` does not re-fetch `goal` when it is already known.
- [ ] The synced mirror state is identical to before (departed tickets get the right new sprint,
      404s still mark `removedFromJiraAt`, comments match Jira).

## Tests

- [x] `sync-tickets-service` test: a multi-ticket departure triggers a single `getIssuesByKeys`
      and assigns correct new sprints; a 404 in the bulk result still sets `removedFromJiraAt`.
- [x] `sync-comments` test: an M-comment payload does one preload query and produces the same rows
      as the per-comment path did; a duplicate `jiraCommentId` does not double-insert.
- [ ] Migration test/check: the new unique index exists and `npm run build` is green.

## Open Questions

- **Ordering sensitivity.** The per-key loops may rely on incidental ordering; confirm the bulk
  path preserves any ordering the downstream sprint-assignment logic assumes (recommend asserting
  with a test before/after).

## Related

- [[2026-06-22-codebase-audit]] — source audit (Performance — sync efficiency).
- [[BRDG-376-harden-jira-sync-engine]] — sibling sync-layer story; `jira_comment` work overlaps `upsertIssue`.
- Touch points: `sync-tickets-service.ts`, `sync-comments` route, `schema.ts` (+ migration), `jira-client.ts`.
