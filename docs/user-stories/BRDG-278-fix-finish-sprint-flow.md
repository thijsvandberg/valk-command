# BRDG-278: Fix finish sprint flow

**Status:** Backlog
**Priority:** High

## Description

As the PO, I want the "Finish sprint" action to actually close the sprint in Jira, so I can complete a sprint from the board without it failing.

## Problem

Clicking "Finish sprint" always fails with a generic "Failed to close sprint" error. The sprint is never closed in Jira.

Root cause: `closeSprint()` in `src/lib/jira-client.ts` sends only `{ state: "closed" }` to Jira's `PUT /rest/agile/1.0/sprint/{id}`. Jira's PUT is a *full* update: it rejects a body that omits `name` (400 "Sprint name is required") and nulls out any other omitted field. The sibling `updateSprint()` already documents and handles this by fetching the current sprint and merging the change on top, but `closeSprint()` never got the same treatment.

Secondary UX issue: when the close fails, `finishing` flips back to `false`, so the modal shows both the green "Everything is done. Ready to finish." banner *and* the red "Failed to close sprint" banner at the same time. This contradictory, sparse state is what makes the modal look half-empty/confusing.

## Implementation Plan

1. **Fix `closeSprint()`** (`src/lib/jira-client.ts`): mirror `updateSprint()` — `GET /rest/agile/1.0/sprint/{id}` via `jiraFetch`, then PUT a full merged payload built by explicit field selection (`{ name, state: "closed", startDate, endDate, goal }`) to avoid sending read-only fields (`completeDate`, `self`, `originBoardId`). Update the doc comment to describe GET-then-merge.
2. **Update `closeSprint` unit test** (`src/lib/jira-client.close-sprint.test.ts`): mock branches on `init.method` — GET returns the current sprint JSON, PUT returns 204. Assert 2 fetch calls (GET then PUT), both to the gateway URL, and the merged PUT body.
3. **Hide ready banner on error** (`FinishSprintModal.tsx`): fold `!finishError` into the `ready` memo (only the ready banner consumes it; the Finish button uses `blocked || finishing`, so retry stays possible).
4. **Improve ready confirmation block** (`FinishSprintModal.tsx`): turn the single-line banner into an intentional two-line block — keep "Everything is done. Ready to finish." plus a summary line (e.g. "All N stories complete"). Reuse existing CSS-var tokens; no raw Tailwind defaults.
5. **Update component tests** (`FinishSprintModal.test.tsx`): keep the existing ready-text assertion, add a summary-count assertion, and add a regression test that on close failure the error shows while the ready banner is gone.

Order: item 1 → its test → items 3+4 together → component tests. Lint + typecheck after each; one vitest at a time.

## In Scope

- [x] Fix `closeSprint()` to mirror `updateSprint()`: fetch the current sprint and merge `state: "closed"` onto a full payload (`name`, `startDate`, `endDate`, `goal`) before the PUT.
- [ ] In `FinishSprintModal.tsx`, hide the green "Ready to finish" banner whenever a `finishError` is present, so success and failure are never shown together.
- [ ] Improve the ready state so the modal does not look half-empty: present it as an intentional confirmation block with a short sprint summary (e.g. count of completed stories).
- [ ] Update/add tests: assert `closeSprint` sends the merged full payload; assert the modal hides the ready banner when an error is present.

## Out of Scope

- Changing the blocker logic for incomplete stories or open subtasks.
- Any change to how sprints are created or started.
- Redesigning the rest of the sprint board.

## Acceptance Criteria

- Clicking "Finish sprint" on an active sprint with everything done closes the sprint in Jira and shows the success toast.
- `closeSprint` sends the full sprint representation (current fields + `state: "closed"`), not a bare `{ state: "closed" }`.
- When closing fails, the modal shows only the error banner, never the "Ready to finish" banner at the same time.
- The ready state reads as an intentional confirmation, not an empty modal.
- All tests pass (`npm run test`) together with `npm run build`.
