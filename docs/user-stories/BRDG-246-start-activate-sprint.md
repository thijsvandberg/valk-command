# BRDG-246: Start / Activate a Sprint from Bridge

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want to start (activate) a `future` sprint directly from Bridge, so that I can begin a sprint without switching to Jira. Starting a sprint is the natural counterpart to finishing one ([BRDG-245](completed/BRDG-245-finish-close-sprint.md)). Jira only accepts activating a sprint when it has a valid **start date and end date with a time**, so the start action must guarantee both are set before it fires. This is the moment where the sprint **time** actually matters (during editing it stays optional, see the date-time picker work).

## Context

- Sprints carry a `state` of `"active" | "future" | "closed" | "backlog"` (`src/types/ticket.ts`). Only a `future` sprint can be started.
- **No `startSprint()` / `activateSprint()` exists yet.** Bridge can currently create (`BRDG-162`), update, and close (`BRDG-245`) sprints, but not activate one.
  - `jira-client.ts` already has `updateSprint` (`:1049`), `closeSprint` (`:1066`), and `createSprint` (`:1080`) — `startSprint` mirrors these.
  - The Jira Agile API activates a sprint via `PUT /rest/agile/1.0/sprint/{id}` with `{ state: "active", startDate, endDate }`. **startDate and endDate are mandatory** for the activation call; Jira rejects it otherwise.
- **Jira allows only one active sprint per board** (on most board configs). Starting a future sprint while another is already `active` will be rejected by Jira; Bridge must handle/surface this rather than failing silently.
- Date entry already exists: the shared `DateTimePicker` (`src/components/shared/DateTimePicker.tsx`) plus the conventional sprint-end suggestion (`sprintEndFromStart` in `src/lib/sprint-dates.ts`, "first Thursday after +1 week, 17:00"). Reuse both so the PO can fill valid dates+times in one place. Time is **optional** in those pickers in general, but **required** for the start action.
- The close flow's structure is the template to follow:
  - Affordance + dropdown action: `SprintBoardHeader.tsx`, `SprintDetailsPopover.tsx`, wired in `SprintBoard.tsx`.
  - Confirmation modal: `FinishSprintModal.tsx` (structural template), built on `Modal.tsx`, using `mutate("/api/jira/sprints")` and the `showToast` pattern.
  - Backend: `POST /api/jira/sprints/[id]/close/route.ts` + `closeSprint` in `jira-client.ts` + `jira.closeSprint` in `api-client.ts`.

## Requirements

### 1. "Start sprint" affordance for a future sprint

- Surface a **Start sprint** action for a `future` sprint, in `SprintDetailsPopover` (and/or near the sprint header when a future sprint is selected — see open question).
- Visible only for `future` sprints. Not shown for `active`, `closed`, or `backlog`.
- Clicking it opens the start confirmation modal (section 2).

### 2. Start confirmation modal

The modal must guarantee Jira's preconditions before enabling the start action.

- **Start = now (not editable).** The start datetime is set to the current time at the moment of starting, mirroring Jira's own Start Sprint dialog. The PO does not pick it; a sprint cannot start in the past or the future. Show it read-only ("Starts now") for confirmation. This sidesteps any question of whether Jira accepts a past start date.
- **End date+time is required.** Show an end date field (reuse `DateTimePicker`); it must have a date **and** a time before the sprint can start (this is where time stops being optional).
  - Pre-fill from the sprint's existing `endDate` if present.
  - Offer the conventional end suggestion (`sprintEndFromStart`, 17:00) as a one-click fill, consistent with the create/edit modals.
- **Validation:** end must be after "now". The **Start sprint** button is disabled with a short reason until the end is valid.
- **Another active sprint:** if a sprint is already `active`, starting another is not allowed. Detect this up front (the board already knows the active sprint) and either block with a clear explanation ("Finish the current sprint first") or surface Jira's rejection gracefully — see open question.
- **On confirm:** call the new start endpoint with the chosen start/end datetimes, then refresh sprint state so the board reflects the now-`active` sprint. Transient success/error feedback via the existing toast pattern.
- Loading and error states for the start call (including the "already active" / scope / permission errors).

### 3. Backend: start-sprint capability

- Add `startSprint(sprintId, { startDate, endDate }, signal?)` to `src/lib/jira-client.ts`, using `PUT /rest/agile/1.0/sprint/{id}` with `{ state: "active", startDate, endDate }`, routed through `jiraPut` (consistent with `updateSprint`/`closeSprint`).
- Add `POST /api/jira/sprints/[id]/start/route.ts` that validates the id, requires `endDate` in the body, sets `startDate` to the current server time (start is always "now"), calls `startSprint`, flips the cached `jira_sprints` row to `state: "active"` (and persists the dates), then `cache.invalidate("/api/jira/sprints")`. Handle Jira 401/403 (scope) and the "sprint already active" rejection distinctly from a generic 500.
- Add `jira.startSprint(id, { startDate, endDate })` to `src/lib/api-client.ts`.
- Verify the scoped Jira token can activate sprints (it can create/update/close; activating must be confirmed end-to-end, mirroring the BRDG-169 / BRDG-245 verification note).

## Decisions (resolved)

- **Start is always "now".** The start datetime is fixed to the current time at activation (not editable, no past, no future), matching Jira's own Start Sprint behaviour. Because Bridge always sends "now", whether Jira would accept a past start date is moot and does not need a (risky, side-effecting) live test.

## Open questions (need PO input)

- **Affordance placement:** dropdown action only (`SprintDetailsPopover`), or also a prominent button when a future sprint is selected on the board?
- **Already-active behavior:** hard-block in Bridge with "Finish the current sprint first", or let the PO attempt it and surface Jira's rejection? (Bridge does not auto-finish the current sprint.)
- **End date default:** when a future sprint has no end date yet, pre-fill with the conventional suggestion (now + the Thursday rule, 17:00), or leave it empty and force the PO to choose?

## Out of scope

- Finishing/closing a sprint ([BRDG-245](completed/BRDG-245-finish-close-sprint.md)) and creating a sprint ([BRDG-162](completed/BRDG-162-create-sprint-from-bridge.md)).
- Moving issues into the sprint before starting, or auto-populating the sprint.
- Re-opening a closed sprint, or supporting multiple concurrent active sprints.

## Checklist

- [ ] Add `startSprint(sprintId, { startDate, endDate })` to `jira-client.ts` (`PUT /sprint/{id}` state=active + dates via gateway) + test
- [ ] Add `POST /api/jira/sprints/[id]/start` endpoint (activates + re-syncs state, sets startDate=now, requires endDate, distinct handling for already-active / scope errors) + test
- [ ] Add `jira.startSprint(...)` to `api-client.ts`
- [ ] Add "Start sprint" action for `future` sprints (placement per open question)
- [ ] Build the start confirmation modal: read-only "Starts now" + end `DateTimePicker` with required time, end-after-now validation, conventional-end suggestion
- [ ] Gate "Start sprint": disabled until valid end date+time (and no other active sprint, per decision), with reason shown
- [ ] Confirm + start flow: success/error toast, refresh board to show `active` state
- [ ] Loading / error states (including already-active and token-scope errors)
- [ ] Verify end-to-end against real Jira (token scope for activating sprints; single-active-sprint constraint)
- [ ] Update relevant docs in `/docs` (`api-routes.md`, `jira-sync.md`)
</content>
