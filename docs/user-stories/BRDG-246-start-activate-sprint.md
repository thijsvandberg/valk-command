# BRDG-246: Start / Activate a Sprint from Bridge

**Status:** Done
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

### 1. "Start sprint" entry points (future sprints only)

Three entry points, all leading to the Edit Sprint modal, which is the single place the start actually fires (the PO sees the full sprint — name, dates, goal — before starting):

- **Header button** (`SprintBoardHeader`): a prominent "Start sprint" button next to the sprint title, shown once the sprint's start day is within reach — **tomorrow or earlier**, including an already-passed start — and kept from then on until the sprint is started.
- **Details dropdown** (`SprintDetailsPopover`): a "Start sprint" action alongside "Edit details", always shown for a `future` sprint (mirrors the "Close sprint" action's placement for active sprints).
- All entry points open the Edit Sprint modal (`onStartSprint` → `setEditModalOpen(true)`).
- None of these are shown for `active`, `closed`, or `backlog` sprints.

### 2. Start from the Edit Sprint modal

- The modal carries a **Start sprint** button in its footer (left side), shown only for `future` sprints. Save becomes the secondary action there.
- **End date+time is required.** The button is disabled, with a short inline reason, until the end date has both a date **and** a time and lies in the future (this is where time stops being optional). If the end is empty, the PO fills it right here — the conventional end suggestion (`sprintEndFromStart`, 17:00) is the existing one-click fill.
- **Start date prefers the planned day.** We send the sprint's existing start date (often a past Friday) so the sprint keeps it. If Jira rejects that start as invalid, the backend retries once with "now" — so starting always succeeds, keeping the planned day when Jira allows it.
- **No hard block on a concurrent active sprint.** The board routinely runs multiple active sprints, so Bridge does not block on an already-active sprint; Jira is the source of truth.
- **On start:** any pending field edits are persisted first (so the started sprint reflects the form), then the start endpoint is called. The SWR sprints cache is patched directly to flip the sprint to `active` with the accepted dates, and a toast confirms.
- Loading and error states for the start call (scope/permission errors surfaced via toast).

### 3. Backend: start-sprint capability

- Add `startSprint(sprintId, { startDate, endDate }, signal?)` to `src/lib/jira-client.ts`, using `PUT /rest/agile/1.0/sprint/{id}` with `{ state: "active", startDate, endDate }`, routed through `jiraPut` (consistent with `updateSprint`/`closeSprint`).
- Add `POST /api/jira/sprints/[id]/start/route.ts` that validates the id, requires `endDate` in the body, sets `startDate` to the current server time (start is always "now"), calls `startSprint`, flips the cached `jira_sprints` row to `state: "active"` (and persists the dates), then `cache.invalidate("/api/jira/sprints")`. Handle Jira 401/403 (scope) and the "sprint already active" rejection distinctly from a generic 500.
- Add `jira.startSprint(id, { startDate, endDate })` to `src/lib/api-client.ts`.
- Verify the scoped Jira token can activate sprints (it can create/update/close; activating must be confirmed end-to-end, mirroring the BRDG-169 / BRDG-245 verification note).

## Decisions (resolved)

- **Start time = planned day at 12:00, or "now" if earlier.** The start timestamp anchors to the planned start day at noon (12:00 local, `sprintStartDateTime`), but never later than the actual moment of starting: starting before that noon (early on the start day, or a day ahead) uses the current time, so a sprint never appears to start in the future. A past planned day keeps its noon.
- **Start prefers the planned start date, falling back to "now" only on rejection.** Bridge sends the computed planned start (which may be in the past); if Jira were to reject it, `startSprint` retries once with "now". **Verified:** Jira accepts a past start date, so the planned day is kept and the rejection-fallback is not exercised in practice.
- **Affordance placement:** both a prominent header button (gated on start day ≤ tomorrow) and an always-on action in the details dropdown. Both open the Edit Sprint modal, where the actual Start button lives.
- **Already-active behavior:** no hard block. Multiple active sprints are normal here, so Bridge does not block; Jira remains the source of truth.
- **End date default:** the modal pre-fills from the sprint's existing end date; when empty, the PO sets it in the modal (the conventional `sprintEndFromStart` one-click fill is available). The Start button stays disabled until a valid end date+time is present.

## Out of scope

- Finishing/closing a sprint ([BRDG-245](completed/BRDG-245-finish-close-sprint.md)) and creating a sprint ([BRDG-162](completed/BRDG-162-create-sprint-from-bridge.md)).
- Moving issues into the sprint before starting, or auto-populating the sprint.
- Re-opening a closed sprint, or supporting multiple concurrent active sprints.

## Checklist

- [x] Add `startSprint(sprintId, { startDate, endDate })` to `jira-client.ts` (`PUT /sprint/{id}` state=active + dates via gateway, prefer existing start with fallback to now) + test
- [x] Add `POST /api/jira/sprints/[id]/start` endpoint (activates + re-syncs cached state, requires endDate, forwards preferred startDate, scope-error handling) + test
- [x] Add `jira.startSprint(...)` to `api-client.ts`
- [x] Add "Start sprint" entry points for `future` sprints: header button (start day ≤ tomorrow) + details dropdown action, both opening the Edit Sprint modal
- [x] Add the Start button to the Edit Sprint modal footer (future-only), reusing the existing end `DateTimePicker` + conventional-end suggestion
- [x] Gate "Start sprint": disabled until a valid end date+time in the future, with reason shown (no concurrent-active block, per decision)
- [x] Start flow: persist pending edits, success/error toast, patch SWR cache to `active`
- [x] Loading / error states (token-scope errors surfaced)
- [x] Verify end-to-end against real Jira: confirmed a sprint with a **past** planned start date (5 Jun, started on 8 Jun) activates and keeps that start day. Jira accepts the past start, so the now-fallback is a safety net that is not exercised in this config.
- [x] Update relevant docs in `/docs` (`api-routes.md`)
</content>
