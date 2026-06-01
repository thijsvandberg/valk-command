# BRDG-245: Finish / Close a Sprint from Bridge

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want to close (finish) the active sprint directly from Bridge, so that I can wrap up a sprint without switching to Jira. When the sprint's end date has passed, Bridge should nudge me with a clear "Finish" affordance; I should also be able to close a sprint early from the sprint details dropdown. Before the sprint actually closes, I want to see any unfinished work and resolve it, because a sprint can only be finished when it is clean: Jira rejects closing a sprint while subtasks are still open, and an incomplete (non-DONE) story should block the finish entirely.

## Context

- Sprints carry a `state` of `"active" | "future" | "closed" | "backlog"` (`src/types/ticket.ts`). Only an `active` sprint can be finished.
- The progress bar with the "last day" / day-of-sprint indicator lives in `SprintCompletionBar` (`src/components/sprint-board/SprintStatPill.tsx`); end-date logic is already computed there. This is the natural home for the date-passed "Finish" affordance (Image #1).
- The sprint details dropdown is `SprintDetailsPopover` (`src/components/sprint-board/SprintDetailsPopover.tsx`), currently showing date range, goal, and "Edit details". The early-close action belongs here (Image #2).
- Open-subtask detection and a "Close all subtasks" action already exist per ticket in `OpenSubtasksIndicator` (`src/components/sprint-board/OpenSubtasksIndicator.tsx`), backed by `GET /api/tickets/[key]/subtasks` and the existing `onCloseSubtasks` handler (which transitions subtasks to DONE). Reuse these primitives in the confirmation modal.
- **No `closeSprint()` exists yet.** The Jira Agile API closes a sprint via `PUT /rest/agile/1.0/sprint/{id}` with `{ state: "closed" }`. The scoped token already gained `write:sprint:jira-software` for create (see [BRDG-169](completed/... )); closing should use the same scope but must be verified end-to-end.

## Requirements

### 1. "Finish sprint" affordance when the end date has passed

- When the active sprint's end date is in the past (or it is the last day, matching the existing "last day" logic), surface a **Finish** button near the sprint progress bar / time indicator (Image #1).
- Visible only for the `active` sprint. Not shown for `future`, `closed`, or `backlog` sprints.
- Clicking it opens the close confirmation modal (section 3). No early-close warning here (the date has passed, so closing is expected).

### 2. Early close from the sprint details dropdown

- Add a **Close sprint** action to `SprintDetailsPopover`, available for the `active` sprint regardless of date.
- If the end date has **not** yet passed, clicking it first shows an inline warning/notice that the sprint is being closed early (before its end date) and asks the PO to confirm intent before proceeding to the modal.
- If the end date has passed, it goes straight to the confirmation modal (same as the Finish button).

### 3. Close confirmation modal

Opening the modal immediately fetches and shows the sprint's **unfinished work**, split into two blocker categories. A sprint can only be finished when both are clear.

**Blocker A - Incomplete stories (hard block, not resolvable from Bridge):**
- List any parent issue in the sprint whose own status is not DONE (status not in the done set `DONE`, `DEPRECATED`, `Done`, `Closed`).
- These cannot be closed from this modal - they must be completed or moved out on the board / in Jira first. Show them as a clear blocking warning with a disabled state, not as a closeable list.

**Blocker B - Open subtasks (resolvable here):**
- Grouped by story/parent issue: list each story that still has open subtasks, and under it the open subtasks (key + title + status).
- Provide actions to close them:
  - **Close** a single subtask (per item).
  - **Close all** open subtasks (across all listed stories) in one action.
  - Reuse the existing subtask-close mechanism (transition to DONE) from `OpenSubtasksIndicator` / its API rather than building a parallel path.
- Jira rejects closing a sprint while subtasks are open, so these must be cleared before finishing.

**Finish action:**
- The **Finish sprint** button is **disabled** while any incomplete story (Blocker A) or any open subtask (Blocker B) remains, with a short explanation of what is blocking.
- It becomes enabled only when there are zero incomplete stories and zero open subtasks.
- On confirm: call the new close-sprint endpoint, then refresh sprint state so the board reflects the now-`closed` sprint. Show transient success/error feedback (reuse the existing toast pattern; see [BRDG-241]).
- Loading, ready ("everything is done - ready to finish"), and error states for both the unfinished-work fetch and the close call.

### 4. Backend: close-sprint capability

- Add `closeSprint(sprintId)` to `src/lib/jira-client.ts` using `PUT /rest/agile/1.0/sprint/{id}` with `{ state: "closed" }`, routed through the API gateway (`jiraPut`), consistent with how `updateSprint` already works.
- Add an endpoint (e.g. `POST /api/jira/sprints/[id]/close`) that calls it, then triggers a sprint sync so cached state updates to `closed`.
- Verify the scoped Jira token can actually close sprints (it can update and create; closing must be confirmed). If it fails with a scope/permission error, capture it the same way BRDG-169 documented the create-scope fix.

## Decisions (resolved)

- **Incomplete stories block the finish.** If the sprint contains any non-DONE parent story, finishing is disabled and a warning is shown. These are not closeable from Bridge - the PO resolves them on the board / in Jira first. Bridge does not move or auto-complete incomplete stories.
- **Open subtasks must be cleared first.** Jira does not accept closing a sprint with open subtasks, so finishing is blocked until they are all closed. The modal is where the PO closes them (per item or all).
- Net effect: a sprint can only be finished from Bridge when it is fully clean (all stories DONE, all subtasks DONE).

## Out of scope

- Starting/activating a sprint, or moving issues between sprints (already covered elsewhere).
- Sprint retrospective/report generation (see BRDG-043).
- Re-opening a closed sprint.

## Implementation Plan

### Key findings
- **Both blocker categories are computed client-side from `allTickets`** already loaded by the board (`/api/tickets?sprintId=X` via `useTickets`). No new "unfinished work" endpoint needed. Pass `allTickets` + `activeSprint` into the modal as props.
  - Incomplete stories: `tickets.filter(t => t.jiraStatus !== "DONE" && t.jiraStatus !== "DEPRECATED")`.
  - Stories with open subtasks: `tickets.filter(t => (t.openSubtaskCount ?? 0) > 0)`. Individual subtasks fetched lazily via `GET /api/tickets/[key]/subtasks` → `{ key, title, status }[]`.
- **`closeSprint`** mirrors `updateSprint` (`jira-client.ts:1049-1059`): guard `isConfigured()`, then `jiraPut(\`/rest/agile/1.0/sprint/${id}\`, { state: "closed" }, signal)`. Gateway URL + scoped token already wired.
- **Close-all subtasks** reuse: `ta.handleCloseSubtasks` (`useTicketActions.ts`) → `POST /api/tickets/[key]/subtasks/close` (requires parent DONE/DEPRECATED). **No single-subtask close path exists** — must add one for "per item".
- **Toast**: `showToast(message, durationMs = 3000, opts?: { loading?: boolean })` in `SprintBoard.tsx`.
- **Modal primitive**: `src/components/shared/Modal.tsx`; `CreateSprintModal.tsx` is the structural template (uses `mutate("/api/jira/sprints")` from swr).

### Steps
1. `closeSprint(sprintId, signal?)` in `src/lib/jira-client.ts` + `jira-client.close-sprint.test.ts` (mirror create-sprint test: gateway URL, PUT, body `{state:"closed"}`).
2. `POST /api/jira/sprints/[id]/close/route.ts` — rate-limit "write", validate id, `closeSprint`, flip cached `jira_sprints` row to `state:"closed"` + `completeDate`, `cache.invalidate("/api/jira/sprints")`, 403 on JiraApiError 401/403, 500 generic. + route test.
3. `POST /api/tickets/[key]/subtasks/[subtaskKey]/close/route.ts` — transition single subtask to DONE (no parent-DONE guard), update `ticketSubtask` row, invalidate. + test. (Needed for "per item" close.)
4. api-client helpers: `jira.closeSprint(id)` and `tickets.closeSubtask(key, subtaskKey)`.
5. `FinishSprintModal.tsx` — two blocker sections (incomplete stories = warning/disabled; open subtasks = per-item + close-all), gated Finish button with reason, early-close warning, confirm flow (`closeSprint` → `mutate("/api/jira/sprints")` → toast → `onFinished`), loading/ready/error states. + test.
6. Date-passed "Finish" affordance in `SprintBoardHeader.tsx` (active + endDate passed) — opener lifted to `SprintBoard.tsx`.
7. "Close sprint" action in `SprintDetailsPopover.tsx` (active only, new `onCloseSprint` prop); `earlyClose` flag set by whether endDate passed.
8. Wire modal state + props in `SprintBoard.tsx`.
9. Docs: `api-routes.md`, `jira-sync.md`.

### Notes
- Per the story, "per item / all" is required → single-subtask close endpoint added (step 3).
- `endDate` may be null on active sprints; treat unknown/not-passed as early-close (show warning).
- Close-all route's parent-DONE guard is consistent with gating (a non-DONE parent is itself a Blocker A).

## Checklist

- [x] Add `closeSprint()` to `jira-client.ts` (`PUT /sprint/{id}` state=closed via gateway) + test
- [x] Add `POST /api/jira/sprints/[id]/close` endpoint (closes + re-syncs state) + test
- [ ] Add date-passed "Finish" affordance near the sprint progress bar (active sprint only)
- [ ] Add "Close sprint" action to `SprintDetailsPopover` with early-close warning when date not passed
- [ ] Build the close confirmation modal with two blocker sections (incomplete stories + open subtasks)
- [ ] Incomplete stories: blocking warning / disabled state, not closeable from Bridge
- [ ] Open subtasks: per-subtask close + "Close all" (reusing existing subtask-close path)
- [ ] Gate "Finish sprint": disabled until zero incomplete stories and zero open subtasks, with reason shown
- [ ] Confirm + close flow: success/error toast, refresh board to show `closed` state
- [ ] Loading / ready / error states for unfinished-work fetch and close call
- [ ] Verify end-to-end against real Jira (token scope for closing sprints)
- [ ] Update relevant docs in `/docs` (workspace/jira integration as needed)
</content>
</invoke>
