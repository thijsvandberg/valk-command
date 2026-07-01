# BRDG-453: Also hide assignee, checkbox and ticket key on narrow board rows

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
Follow-up to [[BRDG-451-board-row-progressive-badge-hiding]]. That story progressively hides the four trailing metadata badges (refinement, BV, SP, epic) as the board list column narrows, but explicitly kept the selection checkbox and ticket key visible. The PO now wants the narrow-column degradation to go further and also drop, in order:

- **Assignee avatar** (trailing) — pure chrome when scanning a narrow column; editable in the detail panel.
- **Selection checkbox** (leading gutter).
- **Ticket key** (the `VPL-xxxxx` segment inside the status pill) — only at the very narrowest, to give the title the most room.

**Decided with PO:**
- **Checkbox:** hide whenever the column is narrow, *including* while a multiselect is active. (Trade-off accepted: multiselect via the checkbox is not available on a narrow column; widen the column to select.)
- **Ticket key:** hide only at the narrowest step. Key stays reachable in the detail panel and the pill's hover card.
- Assignee avatar: hide on narrow (straightforward).

This reverses the BRDG-451 non-goal that kept the checkbox/key always visible.

## Current Behaviour
- **Badges** already hide via staggered container-query gates on `@container/boardrow` (BRDG-451): refinement `@[40rem]`, BV `@[34rem]`, SP `@[30rem]`, epic `@[26rem]` (`src/components/sprint-board/BoardRow.tsx`).
- **Checkbox gutter** (`BoardRow.tsx:537-548`): a `div.w-3.5` flex item that always reserves space; the box inside fades in on hover / stays visible while `someChecked`. No width gating today.
- **Assignee** (`BoardRow.tsx:959-990`): a `div` wrapper (`ml-1.5 shrink-0`, plus opacity-fade classes when `hideAssignee`). Always occupies its 26px slot. No width gating.
- **Ticket key** (`src/components/shared/TicketStatusPill.tsx:1048-1082`): rendered inside the shared `TicketStatusPill` under `showKey`, wrapped in `<div className="relative flex shrink-0 ...">`. The pill is used across many views (board, inbox, refinement, detail), so the key cannot be gated unconditionally — it must be opt-in per usage.

## Proposed Approach
Extend the same display-gating pattern (`hidden` + `@[Xrem]/boardrow:*`) into one coherent drop ladder. Larger breakpoint drops earlier:

| Element | Gate | Where |
|---------|------|-------|
| Assignee avatar | `hidden @[44rem]/boardrow:block` | `BoardRow.tsx` assignee wrapper div |
| Refinement | `@[40rem]` (existing) | BRDG-451 |
| BV | `@[34rem]` (existing) | BRDG-451 |
| SP | `@[30rem]` (existing) | BRDG-451 |
| Epic | `@[26rem]` (existing) | BRDG-451 |
| Checkbox gutter | `hidden @[22rem]/boardrow:flex` | `BoardRow.tsx` checkbox gutter div |
| Ticket key | `hidden @[18rem]/boardrow:flex` | via new opt-in prop on `TicketStatusPill` |

Rationale: the right-hand cluster (avatar, badges) causes the overflow, so it sheds first. The leading checkbox and key are tiny and only trimmed at extreme narrow, keeping the ticket identifiable as long as possible. The status pill and issue-type icon always stay; the title keeps `min-w-0 flex-1 truncate` and yields first.

**Ticket key gating (shared component):** add an optional `keyGateClassName?: string` prop to `TicketStatusPill`, appended to the key wrapper div's className. Default undefined = key always shown (unchanged everywhere else). The board passes `keyGateClassName="hidden @[18rem]/boardrow:flex"`; the container-query variant only resolves inside the board's `@container/boardrow`, so other views are unaffected.

### Out of scope / non-goals
- Status pill (PROG/TODO/TEST), issue-type icon, and title stay at every width.
- Drag grip / external drag handle: absolutely positioned (no flex space), so they don't affect row width; left untouched.
- No overflow "…" chip; no change to width computation or the SidePanel width.
- Thresholds are tunable (visual calibration), like BRDG-451.

## Implementation Plan
1. **Checkbox gutter** (`BoardRow.tsx`): change the gutter div className `flex w-3.5 shrink-0 ...` -> `hidden w-3.5 shrink-0 ... @[22rem]/boardrow:flex`. Pure width gate (hides even while `someChecked`, per PO).
2. **Assignee** (`BoardRow.tsx`): prepend `hidden` and add `@[44rem]/boardrow:block` to the wrapper div's base className (keep the existing conditional opacity/focus-within classes for the terminal-ticket fade).
3. **Ticket key** (`TicketStatusPill.tsx`): add `keyGateClassName?: string` to props + destructure; append it to the key wrapper div (`:1050`). In `BoardRow.tsx` pass `keyGateClassName="hidden @[18rem]/boardrow:flex"` to the pill.
4. **Tests:** update the BRDG-451 checkbox test (it asserted no width gate — now reversed); add gate assertions for checkbox (22), avatar (44); add a `TicketStatusPill` test for `keyGateClassName` (present when passed, absent by default).

## Acceptance Criteria
- [x] Assignee avatar is hidden below ~44rem and reserves no space when hidden. <!-- BoardRow.tsx assignee wrapper: hidden @[44rem]/boardrow:block -->
- [x] Selection checkbox gutter is hidden below ~22rem, including while a selection is active. <!-- BoardRow.tsx checkbox gutter: hidden @[22rem]/boardrow:flex -->
- [x] Ticket key (`VPL-xxxxx`) is hidden below ~18rem on the board only; other views keep the key at all widths. <!-- TicketStatusPill keyGateClassName opt-in prop -->
- [x] Status pill, issue-type icon and title remain visible at every width; title still truncates first. <!-- unchanged -->
- [x] Full drop ladder is strictly staggered: avatar 44 > refinement 40 > BV 34 > SP 30 > epic 26 > checkbox 22 > key 18. <!-- gate thresholds -->

## Tests
- [x] `BoardRow.test.tsx`: checkbox gutter carries `hidden` + `@[22rem]/boardrow:flex`; assignee wrapper carries `hidden` + `@[44rem]/boardrow:block`. <!-- updated the old "never width-gates the checkbox" test -->
- [x] `TicketStatusPill.test.tsx`: key wrapper carries a passed `keyGateClassName`; without the prop the key has no `@[`/`hidden` gate. <!-- opt-in guard -->

## Related
- [[BRDG-451-board-row-progressive-badge-hiding]] — the badge ladder this extends; supersedes its "checkbox/key always visible" non-goal.
- `src/components/shared/TicketStatusPill.tsx` — shared pill; key gating is opt-in to avoid affecting other views.
