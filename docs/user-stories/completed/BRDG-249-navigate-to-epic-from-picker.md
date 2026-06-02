# BRDG-249: Navigate to the epic from the epic picker / pill

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

In the ticket detail sidebar the **Epic** field shows the selected epic as a pill (e.g. `ARIE`) and clicking it opens the epic picker dropdown to change the epic. There is currently **no way to open the epic itself**. As a PO I want to click through from the epic pill (and/or from a row in the picker) to the epic's ticket detail page, the same way I can already click through to a parent ticket.

## Context

- The epic pill is the `BasePicker.Trigger` inside `EpicPicker` (`src/components/shared/EpicPicker.tsx`, lines 226-234). Today its only behaviour is to open the picker popover; the trigger has no navigation.
- The picker is used as the Epic field's value in the sidebar (`src/components/ticket-detail/TicketSidebar.tsx`, around lines 387-395).
- Each epic carries a Jira-style `key` (e.g. `VPL-21150`) in both the selected value (`EpicOption.key`) and every list row (`EpicListItem.key`).
- The app already navigates to tickets via the dynamic route `/tickets/[key]` (`src/app/(app)/tickets/[key]/page.tsx`). The sidebar's **parent ticket** card uses exactly this pattern: a Next.js `<Link href={`/tickets/${parent.key}`}>` (`TicketSidebar.tsx` ~lines 397-420). Reuse that convention for consistency.

## The design decision

The pill is a single element that today opens the picker on click. We need to add navigation **without** breaking the "click to change epic" behaviour. Recommended approach:

- **Separate the affordance.** Keep the pill text/icon opening the picker (unchanged), and add a small dedicated "open epic" control (an arrow / external-link icon, e.g. `ArrowUpRight`) next to the pill, shown only when an epic is selected. That control is a `<Link href={`/tickets/${value.key}`}>`.
- This mirrors how `TicketRefPill` / the parent card already work and avoids ambiguity (one click = open picker, the arrow = go to epic). It also keeps Cmd/Ctrl-click "open in new tab" working on the link.

Alternative (lighter, no new icon): make the **picker rows** navigable. Each epic row already shows its `VPL-…` key on the right; that key could become a link to `/tickets/[key]` (Cmd/Ctrl-click to open in a new tab), leaving the row body to select the epic. This adds navigation in the dropdown but not on the pill itself.

**Decision (PO, revised):** keep the pill itself unchanged (click = open picker — no separate button beside it). Put navigation **only in the dropdown**: an "Open epic <name>" entry at the top of the list, plus the `VPL-…` key in each row as a link. (An earlier iteration added an arrow icon next to the pill; the PO rejected the separate button.)

## Implementation Plan (as shipped)

1. **`BasePicker.Item` — add opt-in `asDiv` prop.** `Item` is a shared `<button>` used by Assignee/Label/Sprint/Epic pickers. A nested `<a>` (the row key link) is invalid inside a `<button>`. Add an opt-in `asDiv` prop that renders the item as `<div role="button" tabIndex={0}>` with `onClick` + Enter/Space `onKeyDown`, preserving identical styling. Default (false) leaves every other picker unchanged. (`src/components/shared/BasePicker.tsx`)
2. **"Open epic" dropdown entry.** In `EpicPicker.tsx`, import `next/link` and `ArrowUpRight`. At the top of `BasePicker.List` (before "Remove epic"), when an epic is selected and there's no active query, render a `<Link href={/tickets/${value.key}}>` styled like a picker item, with `ArrowUpRight` icon, "Open epic <name>" label, and the key. `onClick={handleClose}` closes the popover; native `<a>` gives in-place nav + Cmd/Ctrl-click new-tab. The pill (`BasePicker.Trigger`) is left exactly as before.
3. **Picker-row key link.** Make each epic row use `asDiv`, and turn the `{epic.key}` span into a `<Link href={/tickets/${epic.key}}>` with `onClick={e => e.stopPropagation()}` so clicking the key navigates instead of selecting the epic. Same hover/focus/active states.
4. **Verify unchanged behaviour** — pill body still opens picker; select/remove/suggest/sync untouched; `stopPropagation` isolates the key link from row select.
5. **Tests** (`EpicPicker.test.tsx`) — add `next/link` mock + `ArrowUpRight` to lucide mock; assert the "Open epic" link appears in the open dropdown with the right href (and not when no epic / on the closed pill), row key links resolve to `/tickets/<key>`, clicking a key link does not call `onChange`, picker still opens.

## Requirements

1. When an epic is selected, the sidebar offers a clear way to navigate to that epic's detail page at `/tickets/[epicKey]`, using the same `<Link>`-based navigation as the parent-ticket card.
2. The existing "click pill to open picker" and "select / remove epic" behaviours must be unchanged.
3. The navigation control:
   - only appears when an epic is set (hidden in the empty "Select epic" state),
   - has hover / focus-visible / active states and `cursor: pointer` (per UI guardrails),
   - supports Cmd/Ctrl-click to open in a new tab (native `<a href>` behaviour),
   - has an accessible label / title (e.g. `Open VPL-21150`).
4. No restyling of the pill or picker beyond adding the navigation affordance.

## Decisions (PO)

- Navigation lives **only in the dropdown**. No separate control next to the pill; the pill click still opens the picker.
- Final dropdown header (variant E, refined): **"View epic"** (prominent epic-tinted button) and **"Unlink epic"** (muted) sit **side by side** above a divider, clearly separated from the searchable list. No VPL number on the action buttons (the key is still used in the `href`). Each row in the list keeps its `VPL-…` key as a link.
- Wording: **"Unlink epic"** instead of "Remove epic" — "Remove" implied deleting the epic; "Unlink" correctly means detaching this ticket from it.
- Navigation is **in-place** by default, with Cmd/Ctrl-click to open the epic in a new tab (matches the parent-ticket card).
- A temporary preview page (`/dev-epic-variants`) was used to compare separation variants; moved to `deleted/` after the choice.

## Out of scope

- Changing how epics are selected, suggested (AI), synced, or removed.
- The epic detail page itself (already exists as `/tickets/[key]`).

## Checklist

- [x] Add navigation affordance from the epic pill (and/or picker rows) to `/tickets/[epicKey]`
- [x] Hidden when no epic is selected; full hover/focus/active states + accessible label
- [x] Cmd/Ctrl-click opens in a new tab
- [x] Existing open-picker / select / remove behaviour verified unchanged
- [x] Tests for the new navigation (renders link with correct href, hidden when no epic, picker still opens)
