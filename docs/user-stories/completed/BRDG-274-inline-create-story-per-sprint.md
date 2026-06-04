# BRDG-274: Inline-create a child story directly into a sprint on the epic view

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I look at an epic's Child Issues in the sprint-grouped view, I want to create
a new child story **directly into a specific sprint** without first creating it and then
moving it. Today the only way to add a child is the global composer at the bottom of the
section, which always lands the new issue in the "Unscheduled" group; assigning it to a
sprint is a separate drag/move step.

The view in scope is the sprint-grouped Child Issues section on an epic
(`EpicChildrenSection` -> `EpicChildrenBySprint`), where children are grouped per sprint
card (BT: 138 Active, BT: 139 Future, etc.) plus an Unscheduled group.

## Current behaviour

- Child creation happens only via the single composer at the bottom of `EpicChildrenSection`
  (`handleCreate`, `createChildIssue`), which never sets a sprint. The optimistic placeholder
  is a `Subtask` with no `sprintName`, so it appears in the Unscheduled group.
- `jiraClient.createIssue` already accepts an optional `sprintId` (`jira-client.ts`), but the
  `POST /api/tickets/[key]/children` route and the `createChildIssue` api-client helper do not
  pass one through.
- Each sprint group is rendered as a `GroupCard` with a `GroupStatBar` header plus
  `headerExtras` (state chip + date range). There is no per-group create affordance.

## Scope

1. **Per-sprint "+" affordance.** Add a hover-revealed "+" button on each sprint group header,
   placed on the **right side** next to the state chip (`[ACTIVE]`/`[FUTURE]`) /
   date range. Reveal on group hover and keep it visible while that group's composer is open
   (same hover-reveal idiom as BRDG-272).
2. **Inline composer in the group.** Clicking "+" opens a composer row at the **bottom of that
   sprint card** (below the last child): a type selector (Story/Task/Bug) plus a text input.
   Enter creates, Escape closes. Only one group composer is open at a time.
3. **Sprint-targeted create.** Creating from a group composer calls child-create with the
   group's `sprintId`. The optimistic placeholder carries that group's `sprintName` so the new
   row appears in the correct sprint card immediately (not in Unscheduled). Show the existing
   success/error toast.
4. **Backend pass-through.** `createChildIssue` (api-client) and the `children` POST route
   accept an optional `sprintId` and forward it to `jiraClient.createIssue({ sprintId })`.
5. **Closed / Unscheduled handling.** No "+" on closed sprints (consistent with the drag-drop
   move rule that rejects closed sprints). The Unscheduled group's "+" creates a child with no
   sprint (current default behaviour), so the bottom composer stays redundant-but-harmless.

## Approach

- **api-client / route:** extend `createChildIssue(key, { title, issueType, sprintId? })` and
  the `POST /children` body schema with an optional `sprintId`, forwarded to
  `jiraClient.createIssue`. Backend keeps current behaviour when `sprintId` is absent.
- **EpicChildrenSection:** generalise `handleCreate` into a function that accepts an optional
  `{ sprintId, sprintName }`. The optimistic placeholder becomes an `EpicChild`-shaped object
  with `sprintName` set so `groupChildrenBySprint` places it in the right card. Pass an
  `onCreateChild(sprintId, sprintName, title, type)` callback down to `EpicChildrenBySprint`.
- **EpicChildrenBySprint:** track which group has its composer open (`openComposerKey`). Add
  the hover-revealed "+" into the group's `headerExtras` (right side), skipped for
  `group.state === "closed"`. Render the composer row at the bottom of the open group's
  `GroupCard` body, with its own type selector + input, wired to `onCreateChild` using the
  group's sprint. For the Unscheduled group, pass no `sprintId`.
- **Composer component:** extract a small shared inline-composer used by the group (type
  select + input + Enter/Escape), reusing the existing type config/labels from the section so
  Story/Task/Bug stay consistent with the bottom composer.

## Out of scope

- Changing the existing bottom composer's behaviour (it keeps creating Unscheduled children).
- Linking existing issues into a specific sprint (this story is create-only).
- Subtask creation per sprint (subtasks carry no sprint).
- Any change to sprint move/drag-drop rules or Jira sync.

## Implementation Plan

Derived from an Opus planning pass over the relevant files.

### Key findings
- **`sprintId` is not on `ChildGroup`** (it carries `sprintName` + `state`). Resolve it inside
  `EpicChildrenBySprint` from the `sprints` prop: `sprints.find(s => s.name === group.sprintName)?.id`.
  Unscheduled (`sprintName === null`) -> no sprint. Hide "+" for a named group with no matching
  sprint metadata (unknown/closed-and-absent), to avoid targeting an unresolvable sprint.
- **Optimistic placeholder must carry `sprintName`** so `groupChildrenBySprint` (buckets by
  `"sprintName" in child`) routes it into the right card. Shape it as an `EpicChild`-like object:
  `{ key: "pending-...", title, type, jiraStatus: "TO DO", assignee: null, sprintName, storyPoints: null,
  businessValue: null, subtaskCount: 0, readiness: null }` (cast to `EpicChild`, same as `applyLocalMoves`).
- **Type-selector reuse:** extract the bottom composer's type-dropdown + input + Enter/Escape into a
  shared `ChildIssueComposer` used by both the bottom composer and the per-group composer, so
  Story/Task/Bug stay consistent. The "Link existing" search affordance stays in `EpicChildrenSection`.
- **Hover-reveal anchor:** `GroupCard` header already declares `group/grouprow`; use
  `opacity-0 group-hover/grouprow:opacity-100` (matches `GroupStatBar`). Keep "+" visible while its
  composer is open. `e.stopPropagation()` so it does not toggle collapse. Auto-expand a collapsed group
  when its "+" is clicked.

### Order (each checkbox builds on the previous)
1. Backend pass-through: `createChildIssue` data type + `POST /children` body forward `sprintId` to
   `jiraClient.createIssue` (already supports it).
2. Extract `ChildIssueComposer`; rewire the existing bottom composer to it to prove parity.
3. Generalise `handleCreate(title, jiraType, target?: { sprintId, sprintName })`; sprint-aware placeholder.
4. Add `onCreateChild` prop, plumb from `EpicChildrenSection` into `EpicChildrenBySprint`.
5. Header "+" (right side, hover-reveal, hidden for closed) + single-open composer state + sprintId
   resolution + composer row at bottom of the open group.
6. Wire group composer create with the group's sprint (Unscheduled -> no sprint); reuse existing toasts.
7. Tests; then lint/typecheck/test/build.

### Notes
- Enter creates and keeps the composer open + focused (rapid entry into one sprint); Escape/blur closes.
- DB insert in the route does not set a sprint column; relies on `onMutate` refetch + optimistic row. Keep
  scoped unless the schema already has a sprint column.
- Visual verification surfaced that the type dropdown, opening downward at the card's bottom edge, was
  clipped by `GroupCard`'s `overflow-clip`. Fixed by a `dropUp` prop on `ChildIssueComposer` so the
  per-sprint composer opens its type menu upward.

## Checklist

- [x] Add optional `sprintId` to `createChildIssue` (api-client) and the `POST /children` route, forwarded to `jiraClient.createIssue`
- [x] Generalise `EpicChildrenSection.handleCreate` to accept a target sprint; optimistic placeholder carries `sprintName`
- [x] Pass an `onCreateChild` callback into `EpicChildrenBySprint`
- [x] Add hover-revealed "+" on the right of each sprint group header, hidden for closed sprints
- [x] Render an inline composer (type selector + input, Enter/Escape) at the bottom of the open group; one open at a time
- [x] Wire group composer to create with the group's `sprintId` (Unscheduled -> no sprint), with success/error toast
- [x] Tests: route forwards `sprintId`; group create calls api with right sprint + optimistic row lands in the correct group; "+" absent on closed sprints; Escape/Enter behaviour
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass
