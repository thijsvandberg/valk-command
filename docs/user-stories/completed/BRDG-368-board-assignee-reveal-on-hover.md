# BRDG-368: Sprint board hides the assignee avatar by default, reveals it on hover

**Status:** Not Started
**Priority:** Medium
**Type:** UI

## Description

As the Product Owner, I want the assignee avatar on the **sprint board** rows to be hidden in the cases where it adds visual noise rather than information, and to appear only when I hover the row, so the board reads cleaner while the assignee stays one hover (and one click) away.

The board today always renders the assignee column on every row. Two situations make that column pure noise:

1. **Terminal tickets (DONE / DEPRECATED).** Who is assigned to a finished or dropped ticket is no longer actionable, so the avatar just adds clutter to the busiest part of the board.
2. **Unassigned tickets.** An empty/placeholder avatar communicates nothing and still occupies the eye.

In both cases the avatar should be hidden by default and revealed on **row hover**. Assigned tickets in an active status keep showing the avatar exactly as today.

This applies to the **sprint board only** (`BoardRow`), not other hosts of the shared row (inbox, epic children, etc.) unless they opt in.

## Scope

- File: [src/components/sprint-board/BoardRow.tsx](../../src/components/sprint-board/BoardRow.tsx) — the `tags.has("assignee")` block (around line 762).
- Terminal-status detection reuses the canonical mapping in [src/lib/epic-filters.ts](../../src/lib/epic-filters.ts) (`normalizeEpicStatus` → `DONE` / `DEPRECATED`) so "Closed"/"Resolved" collapse to DONE consistently.
- The assignee must remain fully **editable** (the `AssigneePicker`) when revealed; hiding is purely a default-visibility concern, not a read-only change.

## Behaviour matrix

| Ticket state | Default | On row hover |
|---|---|---|
| Active status (TO DO / IN PROGRESS / TEST) + assigned | avatar visible | avatar visible (unchanged) |
| Active status + unassigned | hidden | reveal picker (empty avatar / add-assignee affordance) |
| DONE or DEPRECATED + assigned | hidden | reveal avatar |
| DONE or DEPRECATED + unassigned | hidden | reveal picker |

## Implementation Plan

1. **Add the opt-in prop to `BoardRow`** (`src/components/sprint-board/BoardRow.tsx`): add `hideAssigneeUntilHover?: boolean` to `BoardRowBaseProps` (grouped with the host-behaviour flags like `hideCheckbox`), destructure it with a `= false` default so other hosts keep current behaviour.
2. **Compute terminal state via `normalizeEpicStatus`**: import it from `@/lib/epic-filters`; near the existing derived flags compute `isTerminal = ["DONE","DEPRECATED"].includes(normalizeEpicStatus(ticket.jiraStatus))`, `isUnassigned = !ticket.assignee`, and the single gate `hideAssignee = hideAssigneeUntilHover && (isTerminal || isUnassigned)`. Leave `isDeprecated` (SP/BV logic) untouched.
3. **Gate the assignee block via opacity** (lines ~762-784): keep the inner branch tree (AssigneePicker / Avatar / empty-span) exactly as-is so the revealed assignee stays clickable and inline. Add to the wrapping `div` (which already reserves width through its 26px children) `opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100` when `hideAssignee`, else always visible. No `transition-all`; no `HoverRevealSlot` (its `display:none` would drop the reserved width).
4. **Keep the avatar revealed while its picker popover is open**: add a small `assigneePickerOpen` state and wire it to `AssigneePicker`'s `onOpenChange`, OR-ing it into the visible condition so moving the cursor off the row into the open dropdown does not fade the trigger (mirrors the existing `metaPickerOpen` pattern).
5. **Wire the prop through the sprint-board host only** (`src/components/sprint-board/TicketTable.tsx`): add `hideAssigneeUntilHover: true` to `makeRowProps` (static literal, no dep-array change). Reaches every render path. Inbox/story-writer render `BoardRow` directly and pass nothing, so they stay unchanged.
6. **Tests** (`BoardRow.test.tsx`): cover the four matrix cells plus a default-prop (omitted) regression guard; assert on the assignee wrapper `div`'s className (`opacity-0`, `group-hover/row:opacity-100`, `focus-within:opacity-100`, `transition-opacity`, not `transition-all`). Do not modify non-board host tests.

Order: 1 -> 2 -> 3 -> 4 (BoardRow) then 5 (turn on for board) then 6 (tests).

## Acceptance Criteria

- [x] On the sprint board, rows in **DONE** or **DEPRECATED** status do not show the assignee avatar until the row is hovered.
- [x] **Unassigned** rows (any status) do not show an avatar/placeholder until the row is hovered.
- [x] Active-status, assigned rows are **unchanged** — avatar always visible.
- [x] On hover, the revealed assignee is still clickable and opens the `AssigneePicker` inline (when the board is in editable mode), exactly as today.
- [x] The assignee column **reserves its width even when the avatar is hidden**, so revealing on hover does not shift the rest of the row (no horizontal jump). This builds on the existing reserved-width placeholder (BRDG-325).
- [x] Reveal/hide animates `opacity` only (no `transition-all`), consistent with the existing hover overlays on the row.
- [x] Keyboard / focus-visible reaches the picker too (hover-only must not strip keyboard access for an editable board).
- [x] Behaviour is confined to `BoardRow` as used by the sprint board; the inbox and epic-children hosts are not visually changed unless they opt in via the same prop.
- [x] No change to non-board hosts' tests.

## Implementation notes

- Likely add a small prop (e.g. `hideAssigneeUntilHover` or derive from a `host`/context already passed to `BoardRow`) so other hosts keep current behaviour by default. Confirm whether `BoardRow` already knows its host before adding a new prop.
- Reveal can follow the existing `group-hover/row:opacity-100` pattern already used for the clear-session and subtask overlays in this file.
- Compute terminal state from `ticket.jiraStatus` via `normalizeEpicStatus` rather than string-matching inline.

## Tests

- [x] `BoardRow` test: DONE/DEPRECATED row hides the avatar by default; assertion that it becomes visible under the hover class / when hovered.
- [x] `BoardRow` test: unassigned active row hides the avatar by default, reveals picker on hover.
- [x] `BoardRow` test: active assigned row shows the avatar with no hover dependency (regression guard).
- [x] `BoardRow` test: column width is reserved in the hidden state (no layout shift).
- [x] `npm run verify` + `npm run build` green.

## Out of scope

- Other row hosts (inbox, epic children) changing their assignee visibility.
- Any change to read-only/stakeholder views beyond what falls out of the shared component.
