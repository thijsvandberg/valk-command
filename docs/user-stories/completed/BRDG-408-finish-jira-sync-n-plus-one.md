# BRDG-408: Finish the Jira sync N+1 cleanup (close out BRDG-378)

**Status:** Not Started
**Priority:** Medium
**Type:** Performance — Jira sync

## Description

The 2026-06-25 re-audit ([2026-06-25-refactor-reaudit.md](../investigations/2026-06-25-refactor-reaudit.md))
confirmed that [[BRDG-378-speed-up-sync-n-plus-one]] was substantially delivered (reconcile loops,
comment sync, the `jira_comment` unique index, and `getSprints` parallelization are all done) — but
one path was missed, and it is the **highest-traffic** one. This story closes the remainder.

## Current Behaviour

- **Tranche group-sync still fetches one issue per key (High, perf).**
  [sync-tickets-service.ts:89-96](../../src/lib/sync-tickets-service.ts) (`syncIndividualTickets`),
  reached from [group-sync.ts:92-97](../../src/lib/group-sync.ts) via
  `POST /api/jira/sync-tickets`. `syncGroupInTranches` sends tranches of up to 25 keys, and
  `syncIndividualTickets` loops `await jiraClient.getIssue(key)` one serialized Jira round-trip per
  key. A 100-ticket sprint sync = ~100 sequential Jira calls instead of ~4 bulk calls. This is the
  dominant cost and rate-limit exposure of every sprint/epic sync — the same anti-pattern BRDG-378
  fixed everywhere except its most-run path.
- **`getIssuesByKeys` builds one unbounded `key in (...)` JQL (Medium, stability).**
  [jira-client.ts:930-952](../../src/lib/jira-client.ts) (and `getIssueLinksByKeys:957`) joins all
  keys into a single JQL clause. Most callers chunk, but the reconcile callers
  (`sync-tickets-service.ts:255,392,541`) and the reconcile route (up to 2000 keys) do not, so a
  large departed set produces an oversized JQL/URL Jira rejects → the reconcile throws.
- **`rank` route refreshes timestamps one key at a time (Medium, perf).**
  [rank/route.ts:44-46](../../src/app/api/jira/rank/route.ts) → [sync-jira-timestamp.ts:13-24](../../src/lib/sync-jira-timestamp.ts):
  after ranking, it loops `getIssue(k)` per moved key just to read back `fields.updated`.
- **Burnup seed fetches changelog per ticket (Low, perf).**
  [burnup/seed/route.ts:150-152](../../src/app/api/burnup/seed/route.ts): per-ticket
  `getBurnupChangelog(key)` in a loop (on-demand seed, so lower priority).

## Proposed Approach

1. **Bulk the tranche path.** In `syncIndividualTickets`, when `ticketKeys.length > 1`, fetch via
   `jiraClient.getIssuesByKeys(ticketKeys, signal, true)` once, build a key→issue map, then loop
   `upsertIssue` over the results; fall back to per-key `getIssue` only to confirm 404s for keys
   absent from the bulk result (mirror the reconcile pattern already in the same file). Preserve the
   `removedFromJiraAt` reset behaviour.
2. **Chunk inside `getIssuesByKeys`** (slices of ~100, concat results) so every caller is safe
   regardless of input size — this also de-risks step 1.
3. **Bulk the rank timestamp refresh** — one `getIssuesByKeys(issueKeys)` then update `jiraUpdatedAt`
   per returned issue in one transaction (or fold it into the existing local reindex transaction).
4. **Burnup seed** — fetch with `expand=changelog` in bulk and parse locally, or bound concurrency
   with the `mapWithConcurrency` worker pattern already used in `pipeline-sync.ts`.

This changes sync timing/ordering internally but **not** the resulting mirror state.

## Acceptance Criteria

- [ ] A tranche/group sync of N tickets issues a bounded number of Jira calls (bulk), not N
      sequential `getIssue` calls; 404s still mark `removedFromJiraAt`.
- [ ] A large reconcile (hundreds of departed keys) no longer fails on an oversized JQL/URL.
- [ ] The `rank` route refreshes timestamps with a bounded number of calls.
- [ ] The synced mirror state is identical to before (same tickets, sprints, comments).
- [ ] BRDG-378's checklist is reconciled to reflect what is delivered vs. what this story closes.

## Tests

- [ ] `syncIndividualTickets` multi-key test triggers a single `getIssuesByKeys` and upserts correct
      results; a key absent from the bulk result is treated as 404 (`removedFromJiraAt`).
- [ ] `getIssuesByKeys` chunking test: >100 keys produces multiple bounded queries and concatenated
      results.
- [ ] `rank` route test: timestamp refresh issues one bulk fetch, not one per key.
- [ ] Existing sync / rank / burnup tests stay green.

## Open Questions

- **Ordering sensitivity.** Confirm the bulk path preserves any ordering the downstream
  sprint-assignment logic assumes (assert with a before/after test).

## Related

- [[2026-06-25-refactor-reaudit]] — source audit (Finish Jira sync N+1).
- [[BRDG-378-speed-up-sync-n-plus-one]] — the parent story this closes out.
- Touch points: `sync-tickets-service.ts`, `group-sync.ts`, `jira-client.ts`, `rank` route,
  `sync-jira-timestamp.ts`, `burnup/seed` route.
