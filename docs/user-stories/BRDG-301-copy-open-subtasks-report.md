# BRDG-301: Copy open-subtasks report from Finish Sprint modal

**Status:** Done
**Priority:** Medium

## Description

As a PO, when I am finishing a sprint and the Finish Sprint modal lists the done stories that still
carry open subtasks, I want a copy button that puts that list on my clipboard as plain text, so I
can paste it into one message and ask the team to wrap up the remaining subtasks.

## Output format

One block per listed story, in the order the modal shows them:

```
Update gift card transaction code to 904-102 (DONE) - https://new-story.atlassian.net/browse/VPL-46187 (Frank)
 - Finalize story (TODO) - https://new-story.atlassian.net/browse/VPL-46336
Next story title (DONE) - https://new-story.atlassian.net/browse/VPL-46500 (Anna)
 - Another open subtask (TODO) - https://new-story.atlassian.net/browse/VPL-46512
```

Rules:
- Parent line: `{title} ({STATUS}) - {url} ({assignee})`. Assignee in parentheses; omit ` (...)` if unassigned.
- Subtask line: one leading space + `- {title} ({STATUS}) - {url}`. Only the **still-open** subtasks are listed.
- Status labels: uppercase, `TO DO` rendered as `TODO`, `DONE`/`IN PROGRESS` as-is.
- URLs built with the existing `getJiraUrl(key)` helper (`src/lib/jira-url.ts`).
- Subtask lines show no assignee (matches the requested format).

## Scope

- Lives in the **Finish Sprint modal** (`src/components/sprint-board/FinishSprintModal.tsx`).
- Covers exactly the "Blocker B" set already shown there: stories that are `DONE`/`DEPRECATED`
  but still have open subtasks. This data is already fetched client-side in the modal
  (`blockerBStories`, `subtasksByStory`, `openSubtasksFor`), so no new fetching is needed.
- "Open" reuses the modal's existing `isDone` / `DONE_STATUSES` definition, and honours subtasks
  closed in-session via `closedSubKeys` (a story that is resolved while the modal is open drops out
  of the copied text).

## Placement

- Add a small "Copy list" button in the amber Blocker B section header, next to the existing
  "Close all" button (the row that reads "N open subtasks").
- Disable it when there is nothing to copy (`totalOpenSubtasks === 0`, i.e. all cleared).

## Acceptance Criteria

- [x] A "Copy list" button appears in the Blocker B section header, beside "Close all"
- [x] Clicking it writes the formatted list (see format above) to the clipboard
- [x] Only stories with one or more still-open subtasks are included; resolved/cleared stories are excluded
- [x] Each block lists only the open subtasks of that story (closed ones omitted)
- [x] Parent line shows title, status label, Jira URL, and assignee display name (assignee omitted if none)
- [x] Subtask lines are indented with a single leading space and show title, status label, and Jira URL
- [x] A toast confirms the copy and reports how many stories were copied (reuse the modal's `showToast`)
- [x] Button only renders while there are open subtasks to copy (the section header hides it once cleared)
- [x] Tests for: formatter output (parent + open subtasks, status mapping, unassigned, closed-subtask exclusion) and the copy action

## Technical Notes

- Put the pure formatting in a tested helper (e.g. `src/lib/open-subtasks-report.ts`) that takes
  `{ parent, openSubtasks }[]` and returns the text block; keep the React/clipboard glue in the modal thin.
- The modal already computes the exact inputs: iterate `blockerBStories`, take `openSubtasksFor(story.key)`
  for each, skip stories where that array is empty.
- Parent assignee comes from the board `Ticket` (`story.assignee`); subtask status from the fetched
  `SubtaskItem.status`.
- Use `navigator.clipboard.writeText` and surface the result via the existing `showToast` prop.

## Dependencies

None. Builds entirely on data the Finish Sprint modal already loads.
