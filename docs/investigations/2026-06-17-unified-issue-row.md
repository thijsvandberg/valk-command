# Sharing one row component between the sprint board and the epic-children list

**Date:** 2026-06-17
**Story:** BRDG-347 (investigation only, no production code changes)
**Goal:** Make the epic-children list (`EpicChildrenSection`) render through the **shared** sprint-board row component, with small tweaks so the epic page keeps its own features — instead of maintaining a separate row (`ChildIssueRow`) that has to be hand-synced with the board.

## TL;DR

**Recommendation: reuse the existing `BoardRow` as the shared row for the epic-children list, and keep the epic page's behaviour at the *section* level (composition).** The board's row is already a reused, battle-tested shared component (it renders the sprint board, the Story Writer landing and the New-story inbox). The epic-children list should become a fourth host of that same row rather than keeping its own `ChildIssueRow`.

The epic page does **not** lose its identity: almost everything that makes the epic list special lives in `EpicChildrenSection` (status filter, field-visibility toggles, inline create rows, link-existing search, AI suggestions, by-sprint grouping, bulk bar). Those stay exactly where they are. Only the per-row rendering swaps to `BoardRow`, plus a handful of small row-level tweaks.

This is the higher-value version of what BRDG-347 originally asked. The earlier "extract just a class helper" idea is the fallback if reusing the full row turns out too invasive.

## What the components are today

Both rows are **already shared, separately-evolved components**. The real question is whether the epic list can drop its own row and adopt the board's.

| | `BoardRow` (~814 lines) | `ChildIssueRow` (~286 lines) |
|---|---|---|
| Reuse model | Fat row, ~40 optional props that self-hide when absent | Thin shell, host fills `metadataSlot` / `actionsSlot` / `dragHandleSlot` |
| Container element | `<tr><td><div>` (table row) | plain `<div>` (flex list item) |
| Memoised | `memo(forwardRef(...))`, perf-critical | plain function component |
| Data in | full `Ticket` | `Subtask`/`EpicChild` + separate props |
| Live hosts | Sprint board (`TicketTable`), Story Writer landing, New-story inbox | `EpicChildrenSection`, `SubtasksSection`, `LinkedIssueRow`, `EpicChildrenBySprint`, `RefinementTicketList`, cleanup page |

The `<tr>` vs `<div>` split is structural: the board uses a `<table>` because its virtualizer (`measureElement` on the `<tr>` in `SortableBoardRow`) needs it. The inbox shows the lightweight reuse pattern though — `BoardRow` works fine in a tiny standalone table:

```
<table className="w-full table-fixed border-collapse">
  <tbody>
    <BoardRow ticket={lightTicket} ... />
  </tbody>
</table>
```

## `TicketRow.tsx` scope (AC)

**Legacy, excluded.** `TicketRow.tsx` (~686 lines) is imported only by `DroppableSprintColumn.tsx` -> `MultiSprintView.tsx` (the Compare view), which the project memory flags as being phased out. The epic page's `EpicTicketList.tsx` has its *own* tiny inline row also named `TicketRow` — unrelated, separate file. Neither should fold into the shared core now.

## The epic-children list is already a mini sprint board

`EpicChildrenSection.tsx` (~1297 lines) and its `EpicChildrenBySprint.tsx` variant (~925 lines) already import and mirror board machinery: `BulkActionBar`, the ticket action menu, `CreateSprintModal`, forward-planning mode, used-points meter, field-visibility (`storyPoints`, `businessValue`, `sprint`, `subtaskCount`). They render `ChildIssueRow` with a hand-built `metadataSlot` (SP/BV/sprint/subtask-count). So the *section* is already board-shaped; only the *row* is a different component.

This is exactly why adopting `BoardRow` is low-friction: the surrounding features already exist and stay put.

## Feature / state comparison matrix

### Surface state machine (background + accent + fades)

Precedence in both, highest first: **selected/active > context-target > checked > flagged > focus > hover**, with independent opacity fades for removed / deprecated / inflight.

| State | `BoardRow` | `ChildIssueRow` |
|---|---|---|
| selected / active | bg `brand-600/12` + `border-l brand-300` | bg `brand-600/12` + `inset 3px shadow brand-300` |
| context-target | same as selected | **missing** |
| checked | bg `brand-500/6`, hover `/10` + `border-l brand-300` | bg `brand-500/6` (no accent) |
| flagged | bg `error/6`, hover `/8` + `border-l error` | bg `error/6`, hover `/8` + `inset 3px shadow error` |
| focused (keyboard) | `outline brand-500/40` | **missing** |
| hover (resting) | bg `overlay-subtle` + `border-l brand-400/25` | bg `overlay-subtle` (no accent) |
| deprecated | `opacity-60` | `opacity-60` |
| removed-from-jira | `opacity-50` | **missing** |
| inflight / pending | `opacity-70` | `opacity-50` |
| live-pulse (BRDG-338) | `live-pulse` class | **missing** |
| insert-line (DnD) | `inset` top/bottom `brand-500` | handled by parent |
| last-in-card rounding | `rounded-b-[11px]` | `rounded-b-[11px]` |

**Accent mechanism:** `BoardRow` uses a real `border-l-[3px]`; `ChildIssueRow` uses `box-shadow: inset 3px 0`. Adopting `BoardRow` simply inherits the board's border accent.

### Gutters, content, actions

| Aspect | `BoardRow` | `ChildIssueRow` (epic-children today) |
|---|---|---|
| Drag grip | grip in left gutter, whole row is activator; `useSortable` in `SortableBoardRow` (via `dragListeners`/`dragAttributes`/`rowStyle` props) | grip wraps host `dragHandleSlot`; `useSortable` in a `SortableChildRow` wrapper (via `dndProps`/`style`/`dragHandleSlot` props) |
| Checkbox gutter | built-in, `hideCheckbox` to drop | `selectable` + `onCheckboxClick` + `inlineCheckbox` |
| Leading pill | `TicketStatusPill` (full) | `TicketStatusPill` with show-toggles |
| Title | `text-primary`, textarea inline edit | `text-secondary`, single-line inline edit |
| Metadata | hardcoded ordered cluster (epic chip, SP/BV pickers + hover placeholders, sprint chip, quality, assignee, ...) | host-built `metadataSlot`: `ChildEstimateCell` (SP+guess), `BusinessValuePicker`, `SubtaskCountBadge` (open/total), sprint chip, `Avatar` |
| Actions overlay | built-in `onDiscard` / `onMarkRead`, fade from `surface-elevated` | generic `actionsSlot` (not used by the epic hosts), fade from `surface-base` |
| Click | cmd/ctrl new tab; `onActivate`/`onSelectTicket`; hover prefetch | cmd/ctrl new tab; `onSelect(key, e)`; lazy prime |

### Deep-dive findings (verified in the two epic files)

These correct a few earlier assumptions and set the real scope:

- **The flat list view (`EpicChildrenSection`) has NO drag-and-drop.** Rows are static `<div>`s inside a bordered `<div>` list. This is the *easy* migration target.
- **Only the by-sprint view (`EpicChildrenBySprint`) has DnD**, and it is the rich kind: cross-sprint drag with a custom `epicChildrenCollisionDetection`, `DroppableGroup` zones, a next-sprint create zone, and backlog zones. The `useSortable` wrapper is `SortableChildRow` (id = `child.key`, `data: { type: "child", sprintName, state }`).
- **Neither view renders rows in a `<table>`** today — both are `<div>` flex lists. Adopting `BoardRow` (`<tr>`) means wrapping each card's rows in a small `<table><tbody>`, exactly as the inbox already does.
- **Inline create uses `ChildIssueComposer`, not `PlaceholderRow`.** `PlaceholderRow` (a separate `<div>` row, *not* a `BoardRow`) appears only in the by-sprint view for forward-planning placeholders, and would need the same surface alignment as the rows around it.
- **The epic `metadataSlot` overlaps almost entirely with `BoardRow`'s built-in cluster** (SP via `EstimatePicker`, BV via `BusinessValuePicker`, sprint chip via `showSprint`, assignee via `AssigneePicker`). The one genuine gap is the **open/total subtask-count chip** (`SubtaskCountBadge`) — `BoardRow` only has the "open subtasks on a done ticket" warning indicator, which is different. That chip is the main row-level *tweak* to add.
- **`actionsSlot` is not used by the epic hosts** (actions go through the right-click menu), so no actions-overlay reconciliation is needed.
- **The drag-prop shapes differ**: `SortableBoardRow` feeds the row via `dragListeners`/`dragAttributes`/`rowStyle`; `SortableChildRow` feeds it via `dndProps`/`style`/`dragHandleSlot`. The by-sprint DnD wrapper has to be re-pointed at `SortableBoardRow`, but the section-level collision/droppable logic is unaffected.

## Answers to the six questions

1. **Shared vs view-specific (row level).** Shared and gained for free by adopting `BoardRow`: surface state machine, grip + checkbox gutters, leading pill, title + inline edit, actions overlay, click handling, SP/BV pickers, epic chip, assignee picker, quality badge, flagged tint. View-specific stays at the **section** level (filters, create rows, AI, link-existing, by-sprint grouping) — not in the row, so it is unaffected.
2. **Single shared row with slots?** Yes, and it already exists: `BoardRow` is slot-like through its ~40 optional props that self-hide. The epic list passes the props it needs; everything else stays inert. The few genuinely epic-specific row bits become small tweaks (below).
3. **State model once?** Adopting `BoardRow` means the epic list inherits the board's surface state machine verbatim — so the cited drift (flagged tint, selected highlight) disappears by construction.
4. **Data shape.** `BoardRow` takes `Ticket`; the epic list has `EpicChild` (carries key, title, jiraStatus, type, storyPoints, businessValue, sprintId, assignee, readiness). Adapter cost is small: build a lightweight `Ticket` per child (the inbox already does exactly this), or widen the accepted type. No data-model change.
5. **Risk.** The flat list view is low risk: no DnD, just an adapter + a `<table><tbody>` wrapper + the subtask-count tweak. The by-sprint view is the real risk: its cross-sprint DnD (custom collision detection, droppable zones, next-sprint/backlog targets) must be re-pointed from `SortableChildRow` to `SortableBoardRow`, and `PlaceholderRow` must keep matching the row surface. React Compiler constraints are already met by `BoardRow`. Performance is a non-issue: epic children are dozens of rows, not the board's hundreds.
6. **Effort & payoff.** Low for the flat list view, medium-high for the by-sprint view (because of its DnD). Payoff: the epic list permanently tracks the board, `ChildIssueRow` is retired from these two hosts, and the row-implementation count shrinks.

## Recommendation: adopt `BoardRow`, keep epic features at section level — phased

Do it in two phases, lowest-risk first, so the adapter and tweaks are proven before the DnD rework.

**Phase 1 — flat list view (`EpicChildrenSection`, no DnD):**
1. **Data** — add an `epicChildToTicket(child)` adapter producing a lightweight `Ticket` (the inbox already does this for its own rows). No API or schema change.
2. **Row** — render each child with `BoardRow` inside a small `<table><tbody>` per card, mirroring the inbox.
3. **Tweak** — add an optional open/total subtask-count chip to `BoardRow` as a narrow prop, inert on the board.
4. **Section features stay** — status filter, field-visibility, inline `ChildIssueComposer`, link-existing search, AI suggestions, bulk bar all remain in `EpicChildrenSection` untouched.

**Phase 2 — by-sprint view (`EpicChildrenBySprint`, cross-sprint DnD):**
5. Re-point the `SortableChildRow` wrapper at `SortableBoardRow` (feed `dragListeners`/`dragAttributes`/`rowStyle` instead of `dndProps`/`dragHandleSlot`). Keep the section-level collision detection, droppable groups, next-sprint and backlog zones as they are.
6. Align `PlaceholderRow`'s surface with the now-`BoardRow` rows (or render placeholders through the same shared surface).
7. Retire `ChildIssueRow` from both epic hosts. Re-evaluate its other four hosts (subtasks, linked issues, refinement list, cleanup) separately — out of scope here.

**Fallback** if full-row adoption proves too invasive (most likely a snag in Phase 2's DnD): extract only the surface state machine into a shared `rowSurfaceClasses(state, { accent })` helper used by both rows, plus a drift-guard test. This removes the styling drift without the structural rework, but does not give the epic list the board's richer row behaviour.

## Proposed follow-up stories (draft)

> Captured as **BRDG-367** (`docs/user-stories/BRDG-367-epic-children-adopt-board-row.md`), which carries both phases plus the clean-tree / no-parallel-process / PO-confirmation guardrails.

**BRDG-XXX (Phase 1): Render the epic-children flat list with the shared `BoardRow`**

- [ ] Add an `epicChildToTicket()` adapter (lightweight `Ticket` from `EpicChild`)
- [ ] Render `EpicChildrenSection` rows with `BoardRow` inside a per-card `<table><tbody>` (inbox pattern)
- [ ] Add an optional open/total subtask-count chip prop to `BoardRow` (inert on the board)
- [ ] Keep section features working: status filter, field-visibility, `ChildIssueComposer`, link-existing, AI suggestions, bulk bar
- [ ] Remove `ChildIssueRow` from `EpicChildrenSection`
- [ ] `npm run verify` + `npm run build` green; visual check of the epic page

**BRDG-XXX (Phase 2): Render the by-sprint epic view with `SortableBoardRow`**

- [ ] Re-point `SortableChildRow` at `SortableBoardRow` (drag-prop shape change)
- [ ] Preserve cross-sprint DnD: custom collision detection, droppable groups, next-sprint + backlog zones
- [ ] Align `PlaceholderRow`'s surface with the `BoardRow` rows
- [ ] Remove `ChildIssueRow` from `EpicChildrenBySprint`
- [ ] `npm run verify` + `npm run build` green; visual + drag check of the by-sprint view

Out of scope: migrating `ChildIssueRow`'s other hosts, changing the data model/API, touching the Compare view's legacy `TicketRow`.

## Out of scope (confirmed, no code changed in this story)

- Implementing the migration (the draft above)
- Making the epic list *visually identical* to the board (goal is shared component, not pixel parity)
- Changing the data model, API routes, or any shared primitive
