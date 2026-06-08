# BRDG-302: Show the active (open-in-sidebar) row on the Refinement select list

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO refining tickets, when I click a ticket in the `/refinement` "Select tickets"
list and it opens in the detail sidebar, I want the corresponding row to show that it is
the **active** ticket (the one currently open in the sidebar). Today the row gives no
indication, so once the sidebar is open I cannot tell from the list which ticket I am
looking at.

This "active" state must be **visually distinct from the checkbox "checked" state**. The
checkbox marks a ticket as queued for the refinement session; the active state marks the
single ticket currently open in the sidebar. A ticket can be checked, active, both, or
neither.

This should work the same way as the **Sprint Board**, which already highlights the row
that is open in its side panel.

## Reference: how the Sprint Board does it

- `src/components/sprint-board/BoardRow.tsx` takes an `isSelected` prop (the row whose
  ticket key matches the open side-panel ticket).
- Active styling: brand-tinted background plus a left accent border
  (`bg-[var(--color-brand-600)]/12` + `border-l-[var(--color-brand-300)]`, 3px left border).
- This is stronger than the checked styling (`bg-[var(--color-brand-500)]/6`), so the two
  states read as clearly different.

## Current state on Refinement

- The row component is `src/components/ticket-detail/ChildIssueRow.tsx`, rendered by
  `src/components/refinement-session/RefinementTicketList.tsx`.
- The open-in-sidebar ticket is tracked as `previewTicketKey` in
  `RefinementPageContent.tsx` and passed down via the `onSelectTicket` callback, but it is
  **not passed back into the row** as a highlight.
- `ChildIssueRow` only styles the `isChecked` state (`bg-[var(--color-brand-500)]/[0.06]`).
  There is no prop for the active/open-in-sidebar state.

## Implementation Plan

1. Add an `isActive` prop to `ChildIssueRow` (open-in-sidebar state, independent of
   `isChecked`). Apply Sprint-Board-equivalent active styling: brand-tinted background +
   left accent border, ranked above the checked styling so active wins when a row is both
   active and checked.
2. Thread `previewTicketKey` through `RefinementTicketList` to each row: set
   `isActive={item.key === previewTicketKey}`.
3. Keep the checked styling unchanged so the two states remain visually distinct.
4. Reuse the exact brand tokens the Sprint Board uses so the two views stay consistent.

## Requirements

### 1. Active row indicator on click
- Clicking a ticket row opens the sidebar AND marks that row as active in the list.
- Only one row is active at a time (the one open in the sidebar).

### 2. Distinct from checked
- The active style is clearly different from the checkbox-checked style.
- A row that is both checked and active shows the active style (active takes precedence),
  and the checkbox still reads as checked.

### 3. Consistent with the Sprint Board
- The active styling matches the Sprint Board's open-in-side-panel row (same brand tokens:
  brand background tint + left accent border).

### 4. Clears correctly
- Closing the sidebar (or opening a different ticket) removes the active style from the
  previously active row and, where applicable, moves it to the new one.

## Testing

- Component test on `ChildIssueRow`: renders the active style when `isActive`, the checked
  style when `isChecked`, and active-wins styling when both are set.
- `RefinementTicketList` test: the row matching `previewTicketKey` is marked active; active
  moves when the selected key changes and clears when it is null.

## Checklist

- [x] Add `isActive` prop + active styling to `ChildIssueRow`
- [x] Pass `previewTicketKey` -> `isActive` through `RefinementTicketList`
- [x] Verify active vs checked vs both render distinctly
- [x] Tests for row and list
