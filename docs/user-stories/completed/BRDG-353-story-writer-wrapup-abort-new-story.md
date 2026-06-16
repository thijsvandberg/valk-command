# BRDG-353: "This operation was aborted" when wrapping up a brand-new story

**Status:** Done
**Priority:** High
**Type:** Bug

## Description

As the Product Owner, when I create a new (even empty) story in the Story Writer and press **Wrap up**, I want the save/close to succeed without an error, so I am not left with a red "This operation was aborted" banner and an "Action failed" toast while wondering whether my story was saved.

Observed: creating a new story `test` (VPL-46566) and pressing Wrap up showed a red banner **"This operation was aborted"** and a toast **"Action failed: This operation was aborted"**. The ticket did not appear in the board's TODO column immediately, but showed up about a minute later — meaning the create/push actually succeeded server-side while the client saw a failure.

## Root Cause

The error string **"This operation was aborted."** (capital "This") is Node's default `DOMException` reason produced when `AbortController.abort()` is called with no argument. That happens in the Jira client's request-timeout helper `makeTimeoutSignal` (`src/lib/jira-client.ts:330`) when a Jira request exceeds `REQUEST_TIMEOUT_MS` (10s).

The push-to-Jira flow for a **brand-new Bridge ticket** triggered that timeout unnecessarily:

- A ticket created via Bridge starts with `jiraUpdatedAt = null`.
- In `pushToJira` (`src/services/ticket-service.ts`), the guard `if (localTicket.jiraUpdatedAt !== remoteUpdated)` was always **true** for a new ticket (`null` vs a real Jira timestamp), so it entered the conflict-check branch and ran `await syncIndividualTickets([key])`.
- That sync hits Jira again (issue fetch + sprint backfill via `ensureSprintsCached`), which can exceed the 10s request timeout and abort.
- Crucially, the conflict check that the sync feeds was **already skipped for new tickets** (`if (localTicket.jiraUpdatedAt !== null)`), so the slow sync's result was discarded. The new ticket paid for throwaway work that could fail the whole wrap-up.

The abort propagated as `JiraOperationError` → HTTP error with `detail = "This operation was aborted."` → the Story Writer wrap-up banner and the failed activity-log toast.

## Fix

Only run the conflict-check sync when there is a baseline to compare against. The `syncIndividualTickets` call and the conflict check were merged into a single guard:

```ts
if (localTicket.jiraUpdatedAt !== null && localTicket.jiraUpdatedAt !== remoteUpdated) {
  await syncIndividualTickets([key]);
  // ... content-hash conflict check ...
}
```

Brand-new tickets (`jiraUpdatedAt === null`) now skip the throwaway sync entirely and go straight to the Jira update, eliminating the timeout/abort on the first wrap-up. Existing tickets are unaffected: they still sync and conflict-check exactly as before.

`src/services/ticket-service.ts` — `pushToJira`.

## Acceptance Criteria

- [x] Wrapping up a newly created (incl. empty) story no longer shows "This operation was aborted".
- [x] The new ticket is saved/pushed and the editor closes as expected.
- [x] Existing tickets still run the conflict-check sync and still surface real conflicts.
- [x] Tests cover that the throwaway sync is skipped for tickets with no baseline.

## Tests

`src/services/ticket-service.test.ts` — the "skips conflict check for newly created tickets with no sync baseline" case now also asserts `syncIndividualTickets` is **not** called for a ticket with no `jiraUpdatedAt` baseline. All 45 tests pass.

## Related

- [[BRDG-351-orphaned-sprint-refetch-loop]] — same Jira sprint-backfill path (`ensureSprintsCached`) is the slow work that was timing out here.
