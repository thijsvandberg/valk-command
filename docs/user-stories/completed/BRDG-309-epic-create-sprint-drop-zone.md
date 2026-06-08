# BRDG-309: Create-the-next-sprint drop zone in the epic view

**Status:** Not Started
**Priority:** Medium
**Type:** Feature
**Related:** BRDG-306 (the existing-sprint drop zone this complements), BRDG-305 (next sprint name + date prediction, reused here), BRDG-162 (create sprint from Bridge), BRDG-268 (epic children drag-between-sprints)

## Description

As a PO, when I drag a child in an epic's "By sprint" view and the **next regular sprint doesn't
exist yet**, I want a drop zone that lets me **create that next sprint and move the child into it**
in one flow — so I can plan a story into a sprint that isn't on the board yet without leaving the
epic to create the sprint by hand first.

This is the companion to BRDG-306. BRDG-306 surfaces the next sprint as a drop zone **only when it
already exists**; when it doesn't (e.g. epic VPL-43142 tops out at `BT: 141` and `BT: 142` has not
been created), BRDG-306 correctly shows nothing. This story fills that gap with a **visually
distinct "create" drop zone**. Dropping onto it does **not** create the sprint silently: it opens
the existing **Create Sprint modal** prefilled with the predicted name and dates, where the PO
confirms (or tweaks) them. On confirm, the sprint is created and the child is moved into it, with a
clear confirmation when it finishes. The modal is the confirm/edit step, so the drop zone itself can
stay lightweight.

The two zones are **mutually exclusive** for the same next-sprint slot: if the next sprint exists,
the BRDG-306 plain "move here" zone shows; if it does not, this BRDG-309 "create + move here" zone
shows instead.

## Behaviour

### When this zone appears (instead of BRDG-306's)

- Only while a drag is active in the "By sprint" view (same gating as BRDG-306).
- Compute the next regular sprint **name** from the visible regular groups (reuse BRDG-305's
  `nextSprintName`, same series rules: `PREFIX: <highest visible number + 1>`, placeholders and
  Unscheduled ignored, prefix from the data).
- If a sprint with that name **already exists** → BRDG-306 shows its plain drop zone (this story is
  inert).
- If that sprint **does not exist** but a next-number could be derived → show **this** create zone.
- If no regular sprint is visible at all → show nothing (no name to predict, same as BRDG-306).

### What the zone shows (lightweight, clearly a create)

- It must be **unmistakably different** from the plain BRDG-306 drop zone — this opens a create flow,
  not a plain move. Use a distinct "create / new sprint" treatment (e.g. dashed accent border, a
  `Plus`/sparkle motif, a "New sprint" label), not the same muted ring.
- It stays **lightweight**: it signals that a new sprint will be created and may hint the predicted
  name (e.g. *"Create new sprint `BT: 142`…"*), but it does **not** need to lay out the full dates
  inline — the modal shows and lets the PO confirm/edit the name + dates. This is the simplification
  the modal buys us.

### Drop behaviour: open the Create Sprint modal, then move

- On drop onto this zone, **do not create silently**. Capture the dragged child's key, then open the
  existing **`CreateSprintModal`** prefilled with BRDG-305's prediction — exactly the props
  `SprintBoard` already passes:
  - `suggestedName` = `nextSprintName(sprints)`
  - `suggestedStartDate` = `startDateFromPreviousEnd(latestRegularSprint(sprints).sprint.endDate)`
  - `previousSprintName` / `previousSprintEndIso` from `latestRegularSprint(...)`
  - The modal already derives the end date from the start (`sprintEndFromStart`) and lets the PO edit
    name + dates and confirm. Graceful date fallback (no previous end → blank dates) is the modal's
    existing behaviour, so no special-casing here.
- The modal **is** the confirm + edit step. Cancelling it does nothing: no sprint created, no move,
  the child stays put.
- On the modal's `onCreated(newSprint)`: **move** the dragged child into it via
  `jira.moveSprint({ issueKeys: [key], targetSprintId: String(newSprint.id) })`, then **refetch** the
  children and sprint list so the new sprint renders as a normal group with the child inside it (and
  BRDG-306 takes over for subsequent drags).
- **Clear completion confirmation:** the modal already toasts that the sprint was created; after the
  move lands, show a clear follow-up confirmation (shared toast, BRDG-241), e.g.
  *"Moved VPL-46256 into `BT: 142`."* — so the PO sees both that the sprint was created and that the
  child was moved.
- **Failure handling:** sprint-create failure is handled inside the modal (its existing error path);
  no move is attempted. If create succeeds but the subsequent move fails, surface that clearly (the
  sprint exists, the child did not move) so the state is honest.

## Current state (where this plugs in)

- **Drop zones live in:** `src/components/ticket-detail/EpicChildrenBySprint.tsx`. BRDG-306 injects a
  synthetic empty group during drag via `nextRegularSprintGroup` (`src/lib/epic-children-grouping.ts`)
  and renders it as a `DroppableGroup` with a "Drop here…" body. This story adds a second synthetic
  variant for the not-yet-created case, rendered with the distinct create treatment.
- **Prediction helpers (BRDG-305, already wired in `SprintBoard.tsx`):** `nextSprintName`,
  `latestRegularSprint` (`src/lib/sprint-utils.ts`); `startDateFromPreviousEnd`, `sprintEndFromStart`
  (`src/lib/sprint-dates.ts`). Reuse exactly as `SprintBoard` does for the Create Sprint modal.
- **Create Sprint modal (reused as-is):** `src/components/sprint-board/CreateSprintModal.tsx`. Props
  `suggestedName`, `suggestedStartDate`, `previousSprintName`, `previousSprintEndIso`, `onCreated`,
  `onClose`, `showToast`. `SprintBoard.tsx` (~:108-111, :620) already wires these from
  `nextSprintName` / `latestRegularSprint` / `startDateFromPreviousEnd` — copy that wiring. The modal
  calls `jira.createSprint(...)` itself and reports the created sprint via `onCreated`.
- **Move:** `jira.moveSprint(...)` → `src/lib/api-client.ts:518`; route `POST /api/jira/move-sprint`.
- **Optimistic move + toast plumbing:** `EpicChildrenSection` already owns `onMoveChild`, the
  optimistic `localMoves` overlay, `onMoveError`, and the amber `jiraWarning`. This story adds a
  small "pending create-and-move" state: the dragged child key is stashed when the create zone is
  dropped on, the modal opens, and `onCreated` triggers the move + confirmation.

## Implementation Plan

1. **Pure predicate util + test** — `canPlanNextSprint(visibleGroups, sprints)` in
   `epic-children-grouping.ts` (or a small sibling): returns the candidate **name** (string) when a
   next regular sprint can be derived **and** that sprint does not yet exist; else null. Returns null
   when no regular sprint is visible, or when the candidate already exists (that case belongs to
   BRDG-306). Reuses `nextSprintName`; never re-implements the series logic. (The dates are the
   modal's job via the existing prediction props, so this util only needs the name + existence check.)
2. **Render the create zone during drag** — in `EpicChildrenBySprint`, when `canPlanNextSprint`
   returns a name (and BRDG-306's `nextRegularSprintGroup` is therefore null), inject a synthetic
   "create" group in the same chronological slot. Render it with the distinct create design and a
   lightweight body ("Create new sprint `<name>`…"). No create "+" composer on it (drag-only).
3. **Drop wiring → open modal** — add an `onPlanNextSprint?(childKey)` prop (or surface it through the
   existing drag-end resolution). On drop onto the create zone, stash the child key and open
   `CreateSprintModal` with the BRDG-305 prediction props (copy `SprintBoard`'s wiring). Cancel = no-op.
4. **On created → move + confirm** — in the modal's `onCreated(newSprint)`: `moveSprint(child →
   newSprint.id)` → `onMutate` + sprint refetch → follow-up confirmation toast. Honest failure path if
   the move fails after create.
5. **Tests** —
   - Unit: `canPlanNextSprint` returns the candidate name when absent; null when it exists (BRDG-306
     owns it) or when no regular sprint is visible.
   - Component: the create zone appears only during drag and only when the next sprint is absent; it is
     visually the create variant (distinct from BRDG-306's zone); carries no "+" create button;
     dropping on it opens the `CreateSprintModal` prefilled with the predicted name (assert the
     suggested name passed in).
   - Handler: the modal's `onCreated` triggers `moveSprint` with the new id, then refetch + follow-up
     confirmation; move-after-create failure surfaces clearly; cancelling the modal moves nothing.

## Requirements

- [x] During a drag in the "By sprint" view, when the next regular sprint does **not** exist, a
      **create** drop zone appears in the next-sprint slot (mutually exclusive with BRDG-306's zone)
- [x] The zone is **visually distinct** from BRDG-306's plain "move here" zone and clearly reads as a
      create action ("create new sprint", not just "move here"); it stays lightweight (may hint the
      predicted name, full dates live in the modal)
- [x] Dropping onto the zone opens the existing **Create Sprint modal**, prefilled with the predicted
      name + start date (BRDG-305 prediction), where the PO confirms or edits name + dates
- [x] Cancelling the modal does nothing (no sprint created, no move)
- [x] On confirm/create, the dragged child is **moved into the new sprint**, then children + sprint
      list refetch so it renders as a normal group
- [x] A **clear confirmation** is shown: the modal's own "sprint created" toast plus a follow-up
      "moved VPL-XXXX into `<name>`" confirmation after the move lands
- [x] Honest failure handling: create-failure (handled by the modal) attempts no move; create-success
      + move-failure is reported as such (no silent partial state)
- [x] No create zone when no regular sprint is visible, or when the next sprint already exists
- [x] The flat `list` view is unchanged; the zone is drag-only and "By sprint" only
- [x] Tests cover the predicate (absent → name, exists → null, none → null), drag-only + absent-only
      visibility, the distinct create design, the modal opening prefilled, and the
      on-created → move → confirm + move-failure paths

## Decisions (resolved)

- **Use the Create Sprint modal as the confirm/edit step** rather than creating silently on drop. The
  drop opens `CreateSprintModal` prefilled with the prediction; this doubles as the pre-create confirm
  and the place to tweak name/dates, and keeps the drop zone lightweight.
- **Goal field:** created with no goal by default (consistent with the modal when left blank).

## Open questions

- **Confirmation copy:** the modal already toasts on create; is a separate follow-up "moved … into …"
  toast wanted, or should the single create toast be enough? Default proposed: show the brief
  follow-up so the move is explicitly confirmed.

## Out of Scope

- Creating more than the single next sprint (only `+1`, like BRDG-306).
- Changing BRDG-305's name/date prediction logic (reused as-is).
- Changing how moves work for sprints that already exist (BRDG-306 / BRDG-268 path is unchanged).
- The sprint board's own drag-and-drop (this is the epic "By sprint" view only).
</content>
