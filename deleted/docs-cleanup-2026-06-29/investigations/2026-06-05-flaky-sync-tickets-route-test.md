# Flaky / failing test: `api/jira/sync-tickets/route.test.ts`

**Date:** 2026-06-05
**Found during:** BRDG-300 final verification (full `npx vitest run`)

## Observation

`src/app/api/jira/sync-tickets/route.test.ts` fails independently of any
working-tree changes:

- In the full suite run: **3 failures**.
- Run in isolation: **4 failures** (`syncs tickets for a sprint`, `creates
  ticket rows in the database`, `creates ticket_metadata rows`, `creates
  story_version rows`).
- The failure count differing between full-suite and isolated runs points to
  test-ordering / shared SQLite state, i.e. flakiness rather than a hard bug.

Confirmed **pre-existing**: with the entire working tree stashed (clean `HEAD`,
no BRDG-300 changes, no other in-progress work), the isolated run still fails
4/10. So it is not caused by BRDG-300 or the parallel frontend work currently in
the tree.

## Failure shape

Assertions like `expect(rows.length).toBeGreaterThan(0)` get `0` — the sync does
not appear to insert ticket/metadata/version rows into the test DB. Likely a
test-DB seeding/migration or mock-setup issue in this suite rather than a
product regression.

## Suggested follow-up

Investigate the test's DB setup (migrations applied to the in-memory/test DB,
mock of the Jira client, and whether state leaks between cases). Not addressed
here because it is out of scope for BRDG-300 and unrelated to the change.
