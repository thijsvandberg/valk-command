# Pre-existing test failures (discovered during BRDG-305)

**Date:** 2026-06-07
**Context:** Final verification for BRDG-305 ran `npm run verify`. 5 tests failed in 2 files. Confirmed these also fail on the parent commit (`4c4bb2d7`, BRDG-307) and in isolation, so they are **unrelated to BRDG-305**.

## Failing tests

- `src/app/api/jira/sync-tickets/route.test.ts` (4 failures)
  - `syncs tickets for a sprint`
  - `creates ticket rows in the database`
  - `creates ticket_metadata rows`
  - `creates story_version rows` — `expected 0 to be greater than 0`
- `src/components/ticket-detail/TicketSidebar.test.tsx` (1 failure)
  - `displays Jira status`

## Observations

The sync-tickets failures all assert that rows were written to the test DB (`rows.length > 0`) but the DB is empty after the POST. This points at the route's persistence path or the test fixture/mock setup no longer producing inserts, not at a flaky timing issue (they fail deterministically in isolation). The TicketSidebar failure is a separate rendering assertion.

## Status

Not investigated further (out of scope for BRDG-305). Flagged so the red suite is not mistaken for a regression from this story. Worth a dedicated bugfix story if these are not already known.
