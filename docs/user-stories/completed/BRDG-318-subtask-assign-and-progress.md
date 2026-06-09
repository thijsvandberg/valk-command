# BRDG-318: Make subtask assignee and status editable inline

**Status:** Draft
**Priority:** Medium
**Type:** Improvement
**Related:**
- `src/components/ticket-detail/SubtasksSection.tsx` (subtask list, assignee avatar + edit/delete wiring)
- `src/components/ticket-detail/ChildIssueRow.tsx` (row layout: `metadataSlot` avatar vs. `actionsSlot` hover overlay)
- `src/components/shared/Avatar.tsx` (current display-only avatar)
- `src/components/shared/AssigneePicker.tsx` (existing assignee picker used elsewhere)
- `src/components/shared/TicketStatusPill.tsx` (status pill, already supports inline status + assignee changes via its hover card)

## Description

As the PO, I want to assign a subtask and move it to **In Progress** directly from the Subtasks list,
without opening the subtask, so I can triage work quickly during refinement and standup.

Today this is effectively blocked. In the Subtasks section each row shows the assignee avatar on the
right. The per-row **Edit** and **Delete** actions render as a hover overlay anchored to the same
right edge, with a gradient background that covers the avatar the moment the row is hovered. So the
avatar is never clickable in practice. The avatar is also display-only: there is no assignee picker
wired to it.

Status is partly there already (the status pill supports changing status), but the overall goal is
that both **assign** and **set progress** are obvious, one-or-two-click actions on every subtask row.

## Problem (root cause)

- `ChildIssueRow.tsx` renders `actionsSlot` (Edit/Delete) as an absolutely-positioned overlay on the
  row's right edge that appears on hover (`group-hover/row:opacity-100`) with a gradient fade. The
  assignee `metadataSlot` (the avatar) sits in normal flow at that same right edge, so the overlay
  visually and interactively covers it.
- In `SubtasksSection.tsx` the assignee is passed as a plain `<Avatar />` with no change handler;
  `onAssigneeChange` is not wired to the row, so even uncovered the avatar does nothing.

## Goal

1. The assignee on a subtask row can be changed inline (open a picker, pick a person / unassign).
2. A subtask can be moved to In Progress (and other statuses) inline.
3. The Edit/Delete hover actions no longer obscure the assignee control.

## Behaviour (proposed — to confirm)

- The assignee avatar becomes an interactive control: clicking it opens the existing `AssigneePicker`,
  and selecting a user (or "Unassigned") updates the subtask. Reuse the assignee-change path the
  status pill already exposes (`onAssigneeChange`) rather than adding a second code path.
- Status change stays on the status pill (already inline-editable); confirm it is discoverable enough,
  or surface a quick "Start" affordance.
- Resolve the overlap so the assignee control and the Edit/Delete actions can both be reached. Options
  to decide during build:
  - Fold Edit/Delete into an overflow (`…`) menu so the right edge holds the avatar + a single menu
    button, or
  - Lay the actions out in-flow (reserve space) instead of as an overlay, or
  - Move the avatar to the left of the actions with guaranteed hit area.

## Implementation Plan

### Decisions
- Scope to Subtasks only (not Child Issues / EpicChildrenSection) for now.
- Make the row's assignee avatar an interactive `AssigneePicker variant="avatar"` (obvious one-click assign), reusing the existing `jira.assign` path.
- Status change stays on the existing inline-editable status pill (AC #2 already satisfied; verify + add a test).
- Persistence follows the existing `onMutate()` refetch pattern used by `handleJiraStatusChange` (no second optimistic system).

### Steps
1. **`ChildIssueRow.tsx` — overlap fix.** Wrap `{metadataSlot}` in `<span className="relative z-20 shrink-0">` with `onClick` stopPropagation so the avatar sits above the actions overlay and its clicks never trigger row-select. Reposition the actions overlay (start it to the left of the avatar / clear it) so Edit and Delete stay reachable while the avatar remains clickable on hover.
2. **`SubtasksSection.tsx` — assignee handler.** Import `jira` from `@/lib/api-client` and `AssignableUser` from `AssigneePicker`. Add `handleAssigneeChange(childKey, user)` mirroring `handleJiraStatusChange`: `jira.assign({ issueKey, accountId: user?.accountId ?? null, name: user?.displayName ?? null })` then `onMutate()`, with try/catch setting `jiraWarning`.
3. **`SubtasksSection.tsx` — interactive avatar.** Replace the display-only `<Avatar>` metadataSlot in both render paths (`SortableSubtaskRow` and the plain `ChildIssueRow`) with `AssigneePicker variant="avatar" avatarSize={22}`. Thread an `onAssigneeChange` prop into `SortableSubtaskRow`. Guard pending rows (`pending-*` keys) to keep the plain non-interactive avatar.
4. **Tests.** `ChildIssueRow.test.tsx`: overlap/reachability test (both slots present, avatar click does not call onSelect). `SubtasksSection.test.tsx`: add `jira.assign` to the api-client mock, render metadataSlot in the mocked row, mock `AssigneePicker`, test assign + unassign wiring, status-to-In-Progress wiring, and pending-row guard. Keep existing create/rename/delete/reorder tests green.
5. **Verify** status-to-In-Progress still works.

### Implementation order
ChildIssueRow overlap fix → SubtasksSection handler + avatar → tests → manual verify.

## Acceptance criteria

- [x] On a subtask row, the assignee can be changed inline (assign + unassign) and persists to Jira.
- [x] On a subtask row, the status can be set to In Progress inline.
- [x] Hovering a row never makes the assignee control unclickable; Edit and Delete remain reachable.
- [x] No regression to the existing optimistic create/rename/delete/reorder flows in `SubtasksSection`.
- [x] Tests cover: assignee change wiring, status change, and that actions do not block the assignee.

## Open questions (deferred — to answer later)

- Should Edit/Delete move into an overflow `…` menu, or should the actions render in-flow instead of
  as an overlay? (affects whether this is also a small visual restyle of the row)
- Should the same inline-assign treatment apply to Child Issues (`EpicChildrenSection`), which has the
  identical avatar + actions-overlay pattern, or scope this to Subtasks only for now?
- Do we want a one-click "Start" shortcut (To Do → In Progress) in addition to the status pill, or is
  the pill sufficient?
- Should assignee be editable when the field is hidden via the section's field-visibility filter, or
  only when the assignee column is shown?

## Out of scope

- Bulk assign / bulk status across multiple subtasks.
- Any change to the Jira sync mechanics beyond reusing existing assignee/status update endpoints.
