# BRDG-303: Forward sprint planning — pencil capacity + ticket guestimations

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a PO planning several sprints ahead, I want a lightweight "pencil" planning layer on
top of the real Jira data so I can rough out which work lands in which future sprint
before the team has refined anything.

Two new estimates, both purely a PO judgement that stays in Bridge (never synced to Jira):

1. **Per-sprint pencil capacity** — for each sprint I can fill in an estimated story-point
   capacity ("how much I think this sprint can hold"). This is the denominator for a
   fullness meter.
2. **Ticket guestimation** — on a story that has **no real SP yet**, I can enter my own
   guess on the same Fibonacci scale and in the same way as SP. It is a PO placeholder
   until the work is refined with the team.

A **fullness meter** on the per-sprint card header (in both the epic view grouped by
sprint and the sprint board grouped by sprint) then shows roughly how full each sprint is,
so I can see at a glance where the next piece of work can go.

This planning layer is **off by default** and only appears when I switch it on per view,
so it never clutters the normal board for day-to-day work.

## Key behaviours (from the request)

- **Guestimation is technically identical to SP**: same Fibonacci scale (1, 2, 3, 5, 8),
  same picker interaction and keyboard entry. The difference is purely meaning (PO guess
  vs refined estimate) and appearance.
- **Guestimation must never read as SP.** When set, it must look clearly different from a
  real SP value so no one mistakes a guess for a refined estimate.
- **A guestimation never sits in the SP slot.** It does not populate or fake the SP field.
- **SP wins and resets the guess.** The moment a real SP is set on a ticket, its
  guestimation is silently cleared. SP and guestimation are never both present.
- **Hidden unless turned on.** Sprint capacity, the fullness meter, and guestimation
  pickers are only visible when planning mode is enabled — and that toggle is **per view**
  (sprint board and epic view each have their own switch).

## Decisions (confirmed)

- **Toggle scope:** per-view. The sprint board and the epic-children-by-sprint view each
  have their own "Planning" toggle, persisted per view.
- **Reset behaviour:** silent auto-clear. Setting a real SP wipes the guestimation with no
  prompt.
- **Guestimation appearance:** a distinct "pencil" motif in a muted hue (dashed / outline
  badge), clearly different from SP's solid green gauge. Reinforces "in pencil / provisional".

## How "fullness" is computed

For a sprint group:

- **Effective points** of a ticket = real `storyPoints` if present, otherwise its
  `guestimation`, otherwise 0.
- **Used** = sum of effective points across the tickets in that sprint group.
- **Capacity** = the sprint's pencil capacity (if the PO has entered one).
- **Fullness** = `used / capacity`. With no capacity set, show the used total only (no
  ratio/meter fill), so the PO can still see accumulation.

The meter colour-codes the ratio (healthy → approaching → over capacity).

## Current state (where this plugs in)

Grounded in the existing SP/BV pattern so the new field mirrors what already works.

- **SP** lives on `ticket.storyPoints` (`src/db/schema.ts:60`), edited via
  `StoryPointPicker` (`src/components/shared/StoryPointPicker.tsx`, Fibonacci `[1,2,3,5,8]`,
  `Gauge` icon), written through `updateTicketFields()` in
  `src/lib/ticket-detail-builder.ts:364` (which also syncs to Jira and auto-advances
  readiness).
- **BV** lives on `ticketMetadata.businessValue` (`src/db/schema.ts:106`), Bridge-local
  only (no Jira sync), edited via `BusinessValuePicker.tsx`, written through
  `updateTicketMetadata()` in `src/services/ticket-service.ts:513`. BV is visually
  distinguished from SP by a different icon (`Goal` vs `Gauge`) and colour ramp
  (`src/types/ticket.ts`). **This is the exact pattern the guestimation should follow.**
- **Inline pickers** render on `src/components/sprint-board/BoardRow.tsx` (SP ~457, BV ~468)
  and `src/components/ticket-detail/EpicChildrenSection.tsx` (`renderMetadata`, SP ~687,
  BV ~704).
- **Sprint group card headers** are rendered by `GroupStatBar`
  (`src/components/sprint-board/GroupStatBar.tsx`) wrapped in `GroupCard.tsx`, used by both
  the sprint board grouped view (`SprintBoard.tsx`) and the epic-children-by-sprint view
  (`EpicChildrenBySprint.tsx`, header around line 446). `GroupStatBar` already computes
  `totalPoints` from ticket SP (~136). The meter slots in here.
- **Sprint-level metadata:** there is currently **no** per-sprint capacity/planning field.
  Sprint state today is name, state, dateRange, goal (`Sprint` interface,
  `src/types/ticket.ts:251`). A new store is needed for pencil capacity.

## Implementation Plan

### Data

1. Add a `guestimation` column to `ticketMetadata` (Bridge-local, no Jira sync), mirroring
   `businessValue`. Integer on the Fibonacci scale. Migration in `drizzle/`.
2. Add a per-sprint planning store keyed by Jira sprint id (e.g. a `sprintPlanning` table:
   sprint id + `pencilCapacity` real). Bridge-local, no Jira sync. Follow the existing
   sprint-keyed table conventions (`sprintSlot`, `sprintNameCache`, `src/db/schema.ts:238`).

### API

3. Extend `updateTicketMetadata()` (`src/services/ticket-service.ts`) to read/write
   `guestimation` (validate: null or one of the Fibonacci values).
4. In `updateTicketFields()` (`src/lib/ticket-detail-builder.ts:364`), when a real,
   non-zero `storyPoints` is saved, **clear `guestimation`** in the same operation (silent).
5. Add an endpoint to read/write a sprint's pencil capacity.

### UI — guestimation picker

6. Create `GuestimationPicker.tsx` (copy of `BusinessValuePicker`/`StoryPointPicker`):
   - Same Fibonacci options and keyboard entry as SP.
   - **Distinct pencil motif:** dashed/outline badge, `Pencil` icon, muted hue (not SP's
     solid green gauge, not BV's amber goal). Add a `getGuestimationColor()` +
     palette in `src/types/ticket.ts` alongside the SP/BV ramps.
7. Render the guestimation picker inline on `BoardRow.tsx` and
   `EpicChildrenSection.tsx` (`renderMetadata`), **only when** that ticket has no real SP
   **and** planning mode is on for the view. When a real SP exists, show SP only.

### UI — per-view planning toggle

8. Add a "Planning" toggle to the sprint board grouped view and to the
   epic-children-by-sprint view, persisted independently per view (localStorage, following
   the existing view-preference pattern). When off: no capacity field, no meter, no
   guestimation pickers — the view looks exactly as it does today.

### UI — capacity input + fullness meter

9. In `GroupStatBar.tsx`, when planning mode is on:
   - Show an editable **pencil capacity** input in the sprint card header.
   - Render a **fullness meter** = used (effective points) / capacity, colour-coded, placed
     near the existing SP/BV totals. With no capacity set, show the used total without a
     fill ratio.
10. Compute "used" as effective points (real SP, else guestimation) so the meter reflects
    both refined and penciled work.

### Tests

11. Cover: guestimation read/write + validation; SP-set silently clears guestimation;
    effective-points calculation (SP vs guestimation vs none); meter ratio + colour bands;
    per-view toggle hides/shows all planning UI; guestimation picker hidden when a real SP
    is present.

## Requirements

### 1. Per-sprint pencil capacity
- The PO can set/edit an estimated SP capacity per sprint, only when planning mode is on.
- Bridge-local; never written to Jira.

### 2. Ticket guestimation
- Available only on tickets with no real SP, only when planning mode is on.
- Same Fibonacci scale and entry as SP.
- Bridge-local; never written to Jira; never occupies the SP slot.

### 3. Visually distinct from SP
- Guestimation uses a pencil motif in a muted hue, clearly not the SP gauge. A guess is
  never mistakable for a refined estimate.

### 4. SP supersedes guestimation
- Setting a real, non-zero SP silently clears that ticket's guestimation. The two are never
  both present.

### 5. Fullness meter on sprint card headers
- Shown on the sprint group card header in both the epic view grouped by sprint and the
  sprint board grouped by sprint, only when planning mode is on.
- Fill = effective points (real SP, else guestimation) / pencil capacity, colour-coded.
- With no capacity set, show the used total without a ratio.

### 6. Off by default, per-view toggle
- All planning UI (capacity, meter, guestimation pickers) is hidden until the view's
  Planning toggle is on. The sprint board and epic view toggle independently.

## Testing

- Unit: guestimation validation; SP-set clears guestimation; effective-points and fullness
  ratio.
- Component: `GuestimationPicker` renders the pencil/muted style distinct from SP; hidden
  when a real SP is present.
- Component: `GroupStatBar` renders capacity input + meter with correct colour band, and
  hides them when planning mode is off.
- View: per-view toggle persists and independently controls each view.

## Checklist

- [ ] `guestimation` column on `ticketMetadata` + migration
- [ ] per-sprint pencil-capacity store + migration
- [ ] API: read/write guestimation (validated) and sprint pencil capacity
- [ ] SP-set silently clears guestimation in `updateTicketFields`
- [ ] `GuestimationPicker` with distinct pencil/muted styling + colour helper
- [ ] Inline guestimation picker on board rows and epic-children rows (SP-absent + planning on)
- [ ] Per-view "Planning" toggle (sprint board + epic view), persisted independently
- [ ] Capacity input + fullness meter in `GroupStatBar` (effective points / capacity)
- [ ] Tests for all of the above
- [ ] Update relevant docs in `/docs`
