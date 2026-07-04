# BRDG-467: Show and unset the "no test doc needed" marker in the review popup

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

A ticket marked "no test doc needed" (the skip/not-needed marker, `FileX2` board icon) is invisible inside the test doc review popup: opening the popup on such a ticket looks identical to a ticket that simply has no doc yet, and may even start generating. There is also no way to remove the marker at all — the only exits from the not-needed state are generating a doc or accepting one, which defeats the point of un-marking.

Decided behaviour:

- The popup clearly shows when a ticket carries the not-needed marker (with the date it was set), instead of the generic "No test documentation yet" empty state.
- Opening the popup on a not-needed ticket never auto-generates; generating stays possible but requires an explicit click.
- A new action in the popup removes the marker and returns the ticket to the neutral "no doc" state without generating anything. The board marker resets accordingly.

## Current Behaviour

- The explicit marker is stored as `ticketMetadata.testDocClassification = "not_stakeholder_relevant"` with `testDoc = null`, written by `PUT /api/tickets/[key]/test-doc` with `{ notNeeded: true }` (`src/app/api/tickets/[key]/test-doc/route.ts:124-148`). The route has no unset path: `notNeeded: false` falls through to the "markdown is required" error.
- `GET /api/tickets/[key]/test-doc` (`route.ts:25-85`) returns only `saved` and `draft`; the classification is embedded inside `saved` and absent when there is no doc — so the review popup cannot tell a not-needed ticket from a ticket with no doc.
- The review popup (`src/components/sprint-board/TestDocReviewModal.tsx` + `useTestDocReview.ts` + `TestDocReviewPane.tsx`) shows checking/idle/generating/ready/error states; a not-needed ticket lands in the idle "No test documentation yet." pane (`TestDocReviewPane.tsx:128`) and, with `autoGenerate` (the default), starts generating.
- The footer has "No test doc needed" (`TestDocReviewModal.tsx:202-209`, `handleNotNeeded`) to SET the marker, but no inverse.
- The board marker state comes from `deriveTestDocState` (`src/lib/test-doc.ts`): `not_needed` when the classification is set without a doc. Sync reconciliation (BRDG-466) never touches explicit not-needed markings.
- The sprint bundle lists not-needed tickets separately (`SprintTestDocsModal.tsx:420`) and the bulk flow pre-filters them with a confirm step (`useTestDocBoard.ts:146-153`) — those flows already know the state; only the per-ticket popup is blind.

## Proposed Approach

1. **API — expose and unset the marker.**
   - `GET /api/tickets/[key]/test-doc`: add `notNeeded: boolean` (and `notNeededAt` from `testDocUpdatedAt`) to the response, derived from `testDocClassification === "not_stakeholder_relevant" && !testDoc`.
   - `PUT` with `{ notNeeded: false }`: clear the marker — set `testDocClassification` and `testDocUpdatedAt` to null, only when the current state is the explicit marker (null `testDoc`); never touch an accepted doc, drafts, or Jira. Invalidate the same `/api/tickets` caches as the `notNeeded: true` branch.
2. **Popup — show the state.** In `useTestDocReview`, surface the flag from the GET payload as a distinct `notNeeded` state; suppress auto-generate for it. `TestDocReviewPane` renders a dedicated state ("Marked as not needed" + set date + explanation) instead of the generic empty pane. Reuse existing pane/empty-state styling; no new primitives.
3. **Popup — unset action.** When the state is `notNeeded`, the footer swaps "No test doc needed" for "Remove 'not needed' marker" calling the new unset API, then refreshes the same way `handleNotNeeded` does (SWR patch of board lists + marker), landing the popup in the normal idle state (Generate button available, not auto-started).

**Non-goals:**
- No delete action for an accepted doc (still a separate story if wanted).
- No changes to the bulk/sprint-bundle flows; they already display not-needed tickets separately.
- No Jira writes; the marker is Bridge-only.

## Acceptance Criteria

- [ ] Opening the review popup on a not-needed ticket shows a distinct "marked as not needed" state with the date, and does not auto-generate. <!-- useTestDocReview state + TestDocReviewPane -->
- [ ] The popup offers a "remove marker" action on not-needed tickets; clicking it returns the ticket to the neutral state without generating, and the board marker resets without a hard refresh. <!-- TestDocReviewModal footer + PUT notNeeded:false + SWR patch like handleNotNeeded -->
- [ ] Generating from a not-needed ticket remains possible via an explicit click and behaves as today. <!-- explicit Generate action in the notNeeded pane state -->
- [ ] `GET /api/tickets/[key]/test-doc` reports the marker (`notNeeded`, `notNeededAt`). <!-- GET handler -->
- [ ] `PUT { notNeeded: false }` clears only the explicit marker: a ticket with an accepted doc or a draft is left untouched (400 or no-op, decided in implementation). <!-- PUT handler unset branch -->

## Tests

- [ ] GET returns `notNeeded: true` + date for a marked ticket, `false` for no-doc and accepted-doc tickets. <!-- src/app/api/tickets/[key]/test-doc/route.test.ts -->
- [ ] PUT `notNeeded: false` clears the marker and caches; does not touch accepted docs or drafts. <!-- route.test.ts -->
- [ ] Modal shows the not-needed state, does not auto-generate, and the remove action lands in idle. <!-- TestDocReviewModal.test.tsx -->

## Related

- [[BRDG-466-jira-source-of-truth-test-doc-sync]] — sync reconciliation surfaced the invisible marker (phantom skip on VPL-46294); this story makes the marker visible and reversible.
- `docs/architecture/workspace-integration.md` / `docs/architecture/ui-primitives.md` — modal and pane conventions.
