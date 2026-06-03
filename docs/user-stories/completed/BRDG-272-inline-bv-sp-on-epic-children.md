# BRDG-272: Set BV/SP inline on epic child issues and confirm child creation

**Status:** In Progress
**Priority:** Medium
**Type:** Feature

## Description

As a PO, I want to set Business Value (BV) and Story Points (SP) directly on each child
issue in the epic's Child Issues section, including on items that have no value yet, so
that I can score work without leaving the epic. I also want a clear confirmation when I
create or link a child issue from the epic, because today nothing visibly happens.

The "epic page" here is the **Child Issues** section on an epic ticket
(`EpicChildrenSection` → list view and sprint-grouped view via `EpicChildrenBySprint`),
shown in the screenshot with sprint groups (BT: 138 Active, date ranges) and two metric
badges per row.

## Current behaviour

- BV/SP on epic children render as **static** `MetricBadge`s and only when a value already
  exists (`EpicChildrenSection.tsx` `renderMetadata`). Items without a value show nothing
  and cannot be scored from this view.
- Creating a child adds an optimistic row but shows no toast; in the sprint view the new
  row lands in the "Unscheduled" group at the bottom, often off-screen, so it reads as
  "nothing happened".
- On the sprint board, empty SP/BV cells show a persistent grey gauge/goal icon, which is
  visual noise on rows that have not been scored.

## Scope

1. **Inline BV/SP editing on epic children** (both list and sprint views). Replace the
   static badges with the existing `StoryPointPicker` / `BusinessValuePicker`. Persist via
   the existing endpoints (SP: `PATCH /api/tickets/[key]`, BV: `PUT /api/tickets/[key]/metadata`),
   then refetch. Only for real epic children (subtasks carry no BV/SP).
2. **Hover-reveal for empty metrics.** Items with a value: picker always visible. Items
   without a value: picker is hidden and reveals on row hover (and stays visible while its
   popover is open). This applies on the epic Child Issues rows **and** on the regular
   sprint board / backlog rows.
3. **Create/link confirmation.** Show a success toast on child create ("VPL-XXXX created")
   and link ("VPL-XXXX linked"), and an error toast on failure, using the shared
   `useToast` + `Toast`.

## Approach

- Add a `revealWhenEmpty` (+ `revealGroup` to pick `group` vs `group/row` scope) prop to
  `StoryPointPicker` and `BusinessValuePicker`. When the value is empty and the popover is
  closed, the trigger is wrapped so it is hidden until the enclosing row is hovered, via
  `group-hover` / `group-hover/row` opacity, kept visible on focus and while open.
- In `EpicChildrenSection.renderMetadata`, render the editable pickers (with
  `revealWhenEmpty`) instead of `MetricBadge`, wired to new `handleStoryPointsChange` /
  `handleBusinessValueChange` handlers that call the API and `onMutate()` (same pattern as
  the existing readiness handler). Stop click/pointer propagation so editing does not open
  the ticket or start a drag.
- In sprint-board `TicketRow`, pass `revealWhenEmpty` (row scope) to the SP and BV pickers.
- Mount `Toast` in `EpicChildrenSection` and call `showToast` from the create and link
  success/error paths.

## Out of scope

- Editing BV/SP on subtasks (they have no such fields).
- Changing the BV/SP color ramps, presets, or persistence/validation rules.
- Any Jira sync changes (SP already syncs; BV stays Bridge-only).

## Checklist

- [ ] Add `revealWhenEmpty` / `revealGroup` to `StoryPointPicker` and `BusinessValuePicker`
- [ ] Replace static BV/SP badges in `EpicChildrenSection.renderMetadata` with editable pickers (list + sprint views), empty items reveal on hover
- [ ] Wire `handleStoryPointsChange` / `handleBusinessValueChange` (persist + `onMutate`), only for epic children, with click/pointer propagation stopped
- [ ] Apply `revealWhenEmpty` to the SP/BV pickers on the sprint board `TicketRow`
- [ ] Add create/link confirmation + error toasts in `EpicChildrenSection`
- [ ] Tests: picker hidden-when-empty/revealed, epic child SP/BV edit calls the right API, toast on create/link
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass
