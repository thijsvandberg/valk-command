# BRDG-313: Warning filter is a toggleable mode with per-row issue labels

**Status:** To Do
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-133 (sprint board gap filters), BRDG-310 (width-gated row badges), BRDG-259 (group filter), warning-filter.ts / GroupStatBar.tsx

## Description

The group header shows a warning triangle that lists hygiene issues for the group (e.g.
"2 stories without a story point estimate", deprecated tickets that still carry points, closed
stories with open subtasks). Clicking it already narrows the board to the offending tickets.

As a PO, when I click the warning I want two things to improve:

1. While the warning filter is active, **each visible row should show a small label spelling out
   what is wrong with that specific ticket** (e.g. "No story point estimate"), so I can see the
   reason per item instead of inferring it. The label should only appear when the row has
   **enough horizontal width**; on narrow rows it is suppressed (no truncation, no layout break).
2. Clicking the **same warning a second time should restore the filter to exactly what it was
   before** I clicked it (not just remove the one criterion), and the per-row issue labels should
   disappear.

In short: the warning becomes a self-contained, toggleable "show me the problems" mode that
remembers and restores the prior filter state.

## Current behaviour

- `GroupStatBar.tsx` renders the warning triangle and toggles the `unpointed` criterion
  (`toggle("unpointed")`). In `SprintBoard.tsx` this maps to toggling the `no_points` gaps filter;
  in `TicketTable.tsx` it sets a per-group `activeCriterion` that filters via `matchesWarningFilter`.
- `matchesWarningFilter(ticket, isActiveSprint)` already defines the exact problem set:
  unpointed stories (active sprint only), deprecated-with-points, and closed-with-open-subtasks.
- Clicking again only clears that single criterion. It does **not** snapshot/restore whatever
  other filters (status, epic, assignee, readiness, etc.) were active beforehand.
- There are **no per-row labels** describing why a ticket is in the warning set.

## Proposed behaviour

### Toggle = enter / exit warning mode

- **First click** on the warning triangle: snapshot the current filter state, then narrow the
  group to the warning set (`matchesWarningFilter`). The triangle shows its active background
  (already implemented).
- **Second click** on the same warning: restore the snapshotted filter state exactly as it was
  (including status / epic / assignee / readiness / gaps and any group filter) and clear the
  per-row labels.
- Changing filters manually while in warning mode exits the mode (the snapshot is consumed), so a
  later warning click snapshots fresh state rather than restoring something stale.

### Per-row issue labels

- Only rendered for rows **while the warning mode is active**.
- Each label states the concrete issue for that ticket, derived from the same conditions as
  `matchesWarningFilter`:
  - unpointed story -> "No story point estimate"
  - deprecated ticket still carrying points -> "Deprecated but still has story points"
  - closed story with open subtasks -> "Closed with open subtasks"
  - Wording is the starting point; shorten during implementation if it does not fit cleanly.
- A ticket can match more than one condition; show each applicable label.
- **Width-gated:** the label cluster only renders when the row is wide enough to fit it without
  pushing/truncating existing content. On narrow rows it is omitted entirely (no ellipsis, no
  wrap, no reserved gap). Reuse the width/visibility approach already used for board-row badges
  (see BRDG-310), e.g. a container query or responsive breakpoint on the row.
- Styling: small, low-emphasis pill in the warning colour tokens
  (`--color-status-warning` / `--color-status-warning-subtle`), consistent with the triangle.

## Scope

- Applies to the sprint board list (`BoardRow.tsx`) in both the multi-slot sprint view
  (`SprintBoard.tsx`) and the grouped `TicketTable.tsx` path.
- Keep the warning set logic in `warning-filter.ts` as the single source of truth; add a helper
  there that returns the list of human-readable issue labels for a ticket so the row labels and
  the header tooltip stay in lockstep.

## Implementation Plan

Two rendering paths both end at `BoardRow`: the FLAT single-sprint view (`groups.length === 0`,
header built by `SprintBoard.singleSprintHeader`, table from the `tickets` prop) and the GROUPED
view (`TicketTable` renders one `GroupStatBar` per group with its own transient `groupFilter`).

1. **`warning-filter.ts` (single source, req 7).** Add `WarningKind`, `ticketWarnings(ticket,
   isActiveSprint): WarningKind[]`, `WARNING_LABELS`, and `ticketWarningLabels(...)`. Refactor
   `matchesWarningFilter` to `ticketWarnings(...).length > 0`.
2. **`BoardRow.tsx` (req 4/5/6).** Add `warningLabels?: string[]`. When non-empty, render a
   width-gated label cluster after the title: `hidden @[52rem]/boardrow:inline-flex`, `shrink-0`,
   warning tokens (`text-[var(--color-status-warning)]` / `bg-[var(--color-status-warning-subtle)]`).
   Not hover-gated; only shows because the parent only sets it while the mode is active.
3. **`GroupStatBar.tsx` (req 7 lockstep).** Derive the tooltip count tallies from `ticketWarnings`
   (pass `isActive` as `isActiveSprint`) so labels and tooltip share the kind set.
4. **`TicketTable.tsx`.** Grouped path: pass `warningLabels = activeCriterion === "unpointed" ?
   ticketWarningLabels(ticket, isActiveSprintGroup) : undefined`. Add a `filterSignature?` prop and
   `useEffect(() => setGroupFilter(null), [filterSignature])` (req 3 parity). Flat path: add
   `warningLensActive?` + `warningLensActiveSprint?` props; flat rows pass `warningLabels` from them.
   Merge `warningLabels` at the call sites, not inside `makeRowProps` (keeps memoization clean).
5. **`SprintBoard.tsx` (req 1/2/3, flat path).** Transient `warningLensActive` state (no persistent
   mutation -> snapshot/restore is trivial). Decouple `singleSprintHeader`'s `activeCriterion` from
   `gapsFilter`; the warning click toggles `warningLensActive`. Derive `displayTickets` (narrow to
   the warning set only in the flat view while active; leave `tickets`/`groups`/DnD untouched) and
   pass it to `TicketTable`. Add an effect that exits the mode when a `filterSignature` (from
   `currentFiltersSnapshot()` + view identity) changes.
6. **Tests (req 8).** Extend `warning-filter.test.ts` (per-condition + multi-condition labels;
   `matchesWarningFilter === ticketWarnings.length > 0`), extend `BoardRow.test.tsx` (label text
   present with prop, absent without; gating class applied), and cover toggle/restore + exit-on-
   filter-change at the TicketTable level (jsdom can't evaluate container queries, so width-gating
   is asserted via the applied class).

Order: 1 -> 2 -> 3 -> 4 -> 5 -> 6. Risk notes: keep the label cluster `shrink-0` and after the
truncating title so the title yields space first; shorten "Deprecated but still has story points"
if visual review shows crowding.

## Requirements

- [x] First warning click snapshots the current filter state and filters the group to the warning set
- [x] Second warning click restores the exact prior filter state and removes the per-row labels
- [x] Manually changing any filter while in warning mode exits the mode (no stale restore)
- [x] While active, each visible row shows a label per applicable issue, with correct wording
- [x] Row labels are width-gated: shown only with enough width, fully suppressed on narrow rows
      (no truncation, wrap, or reserved space)
- [x] Row labels use warning colour tokens and only appear while the mode is active
- [x] A single helper in `warning-filter.ts` produces both the per-row labels and the header tooltip lines
- [ ] Tests cover: snapshot/restore on double click, mode-exit on manual filter change, the label
      text per condition (and multi-condition rows), and the width-gated visibility

## Out of Scope

- Adding new hygiene checks beyond the three already in `matchesWarningFilter`.
- The dense `TicketRow` column table (`/compare`, epics list) — it is intentionally column-aligned.
- Persisting the warning mode across reloads (it is a transient, in-session toggle).
- Changing the warning tooltip content or the metric pills.
