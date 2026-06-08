# BRDG-319: Redesign the Sprint Board views bar

**Status:** Draft
**Priority:** Medium
**Type:** Improvement
**Related:**
- `src/components/sprint-board/SprintSlots.tsx` (the views bar: All / saved views / sprint tabs / `+` / right-side tools)
- `src/components/sprint-board/SprintBoard.tsx` (renders `SprintSlots`, owns slot/sprint state and modals)
- `src/components/sprint-board/filter-bar-types.ts` (`SavedView` shape)
- `src/components/sprint-board/useSprintBoardFilters.ts` (saved views in localStorage, view click/save/delete)
- `src/components/sprint-board/SprintListModal.tsx` (full sprint list / pin-unpin — currently behind the header "…")
- `src/components/sprint-board/SprintDetailsPopover.tsx` (sprint overview/actions popover)
- `src/components/sprint-board/SortControls.tsx`, `BoardFieldToggle.tsx`, `GroupByDropdown.tsx` (right-side tools)
- Design reference: `/dev/exploration/board-tabs` (variant **D** chosen)

## Description

As the PO, I want the Sprint Board views bar to be clearer and smarter, so I can tell at a glance what
each item is and find the view I need without scanning a flat row of look-alike tabs.

Today the bar (`SprintSlots.tsx`) flattens four different kinds of thing into one undifferentiated row,
so nothing stands out and it doesn't scale as more teams/backlogs appear:

| Type | Examples | Nature |
|------|----------|--------|
| **Scopes** (structural views) | All, Backlog (unassigned), BT: Backlog | Permanent |
| **Sprints** (time boxes) | BT: 139 (active), 140, 141 | Rotating; one is current |
| **Bookmarks** (saved filters/labels) | To refine, Overall refinement | Grow over time, not daily destinations |
| **Dead** | BT: TODO | EOL |

## Decisions (resolved with PO)

- **Direction:** exploration variant **D (Hybrid)** — see `/dev/exploration/board-tabs`. No logomark in
  the bar (the `bridge_` wordmark already lives in the header above it).
- **Backlogs are detected by name, not by a per-sprint setting.** Reuse the existing convention already
  used in `epic-children-grouping.ts`: `isBacklogSprintName()` = `/(^|:\s*)backlog$/i`. Any sprint whose
  name ends in "Backlog" (`Backlog`, `BT: Backlog`, `GXP: Backlog`, `BO: Backlog`, …) plus the synthetic
  `__backlog__` row goes into the **Backlogs ▾** dropdown automatically. No DB migration, no settings UI;
  new team backlogs appear the moment they exist in Jira.
- **`Overall refinement`** is treated as a **preset filter**, not a sprint pill: a sprint whose name
  matches `/overall refinement/i` is pulled out of the pill row and offered under **Saved ▾** as a
  sprint-targeted filter (`filters.sprint = [thatSprintId]`).
- **`BT: TODO`** gets no special handling. It is an ordinary sprint the PO can unpin via the sprint
  overview; it is NOT force-removed.

## Goal

Reorganise the bar by type, following variant **D (Hybrid)**:

```
 All   [ Backlogs ▾ ]  │  ● BT:139   BT:140   BT:141   ⋯  │  🔖 Saved ▾        Cols  Sort  Filter
 └ All pill ┘ backlogs       └──── sprints (●=active) ────┘    saved filters     view tools (unchanged)
```

1. **All** — brand-tinted pill on the far left, default view.
2. **Backlogs ▾** — dropdown listing every backlog sprint (name-detected) + the synthetic `Backlog`,
   sourced from the full sprint list (not just pinned slots), so unpinned team backlogs are reachable.
   The active backlog is shown on the trigger when one is selected.
3. **Sprint pills** — only normal numbered sprints (not backlogs, not Overall refinement) stay as the
   existing draggable, pinnable pills; the active sprint keeps its glowing teal dot + underline.
4. **Saved ▾** — saved views/filters (To refine, Overall refinement, future presets) behind a bookmark
   menu, with the active one indicated and a "Save current view…" action.
5. **⋯ overflow** — Sprint overview (`SprintListModal`) + New sprint (`CreateSprintModal`).
6. Right-side tools (show/hide fields, sort, filter) stay as they are.

## Behaviour

- Thin dividers separate the zones (backlogs · sprints · saved) for legibility.
- **Backlogs ▾** selection sets the chosen backlog as the active sprint. Reuse the existing
  `ephemeralSprintId` path (clicking an unpinned sprint) so a backlog need not occupy a pinned slot.
- A backlog sprint that happens to be pinned in `sprint_slot` is filtered OUT of the pill row (it shows
  in the dropdown instead); slot persistence is left untouched (non-destructive) — freeing those slots
  is a possible follow-up.
- **Saved ▾** selection applies a view's filters/sort/columns exactly as `onViewClick` does today; the
  menu reflects the active view. Overall refinement is surfaced here as a sprint-targeted preset.
- **Sprint overview** opens `SprintListModal`; **New sprint** opens `CreateSprintModal` (unchanged
  modals, new entry point).

## Implementation Plan

### Phase 0 — Shared helpers
1. In `src/lib/sprint-utils.ts` (already home to `isRegularSprint`, `extractTeamPrefix`, `sprintNumber`)
   add + export `isBacklogSprintName(name)` = `/(^|:\s*)backlog$/i` and `isOverallRefinementSprint(name)`
   = `/overall refinement/i`.
2. In `src/lib/epic-children-grouping.ts` delete the local `isBacklogSprintName` and import it from
   `./sprint-utils` (pure refactor, call sites unchanged).

### Phase 1 — SprintBoard derivations
3. `backlogSprints` memo from the FULL `sprints` list: `id === "__backlog__" || isBacklogSprintName(name)`.
4. `activeBacklog` memo: when not All-view, find `activeSprintId` within `backlogSprints` (for trigger label).
5. Backlog selection reuses existing `handleSprintListSelect` (sets `ephemeralSprintId` + `navigateToSprint`).
6. `pillSlotSprints` memo = `slotSprints` filtered to exclude backlog-named + Overall-refinement sprints
   (display/dnd only; persistence untouched).
7. `presetViews` memo = synthetic "Overall refinement" SavedView (`filters.sprint=[id]`, id
   `__preset:overall-refinement__`) prepended to `f.savedViews` when such a sprint exists. Block
   delete/overwrite for `__preset:*` ids.

### Phase 2 — SprintSlots sub-components + layout
8. New props: `pillSlotSprints`, `backlogSprints`, `activeBacklogId`, `onBacklogSelect`, `onOpenSprintList`,
   `onOpenCreateSprint`, `onSaveCurrentView`.
9. `BacklogsDropdown` (mirrors `GroupByDropdown`; `useOutsideClick` = outside-click + Esc). Trigger shows
   active backlog name or "Backlogs"; renders null when empty.
10. Pill row iterates `pillSlotSprints` for render + `SortableContext`. Ephemeral tab guarded to not show
    backlog sprints.
11. `SavedViewsMenu` (Bookmark trigger, active-view dot, "Save current view…"); remove inline saved-view tabs.
12. `OverflowMenu` (⋯): Sprint overview → `onOpenSprintList`, New sprint → `onOpenCreateSprint`.
13. `BarDivider`s between zones; `cursor-pointer` + `focus-visible` on all new controls.
14. Right-side tools unchanged.

### Phase 3 — Wire SprintBoard → SprintSlots
15. Pass new props; add a second `SprintListModal` instance for the bar ⋯ (reuse handlers); keep header entry.

### Phase 4 — Tests
16. `sprint-utils.test.ts`: classification cases.
17. `SprintSlots.test.tsx`: backlog dropdown contents/selection, pills exclude backlog + Overall-refinement,
    Saved menu, All, ⋯ menu, Esc/outside-close.
18. `useSprintBoardFilters.test.ts`: SavedView with `filters.sprint` applies via `handleViewClick`.
19. SprintBoard derivation coverage (extract pure helper if full mount too heavy).

### Key risk
- **`activeSlot` is an index into persisted `slotSprints`, not the filtered pill array.** Switch the pill
  active/click/edit logic to be **id-based** (`slotSprints[activeSlot] === sprintId`, pass id to handlers)
  so filtering the pill row can't desync selection. Reorder math already works by id. This is the most
  error-prone change — cover with a test.

## Acceptance criteria

- [x] A reusable `isBacklogSprintName()` (or shared equivalent) classifies backlog sprints, covered by
      unit tests (`Backlog`, `BT: Backlog`, `GXP: Backlog` true; `BT: 139`, `BT: TODO` false).
- [ ] Backlog sprints (name-detected) + the synthetic `Backlog` appear in a **Backlogs ▾** dropdown,
      sourced from the full sprint list, not as numbered pills.
- [ ] Selecting a backlog from the dropdown shows that sprint's tickets and marks it active; the trigger
      reflects the active backlog.
- [ ] Normal numbered sprints remain one-click, draggable, pinnable pills with the active dot + underline.
- [ ] **Overall refinement** does not appear as a sprint pill; it is available as a sprint-targeted
      preset under **Saved ▾**.
- [ ] Saved views (To refine, etc.) are reachable from a **Saved ▾** menu, active one indicated;
      selecting one applies its filters/sort/columns as before.
- [ ] **All** is a one-click pill and remains the default view.
- [ ] **Sprint overview** and **New sprint** are reachable from a **⋯** menu in the bar.
- [ ] Right-side tools (fields / sort / filter) behave exactly as before.
- [ ] Menus close on outside click and Esc, with visible focus-visible states and `cursor: pointer`.
- [ ] No regression to saved-view persistence, sprint pinning/reordering, or the ephemeral-sprint tab.
- [ ] Tests cover: backlog classification, Backlogs dropdown contents + selection, saved-view menu apply,
      Overall-refinement preset, overflow menu opens sprint overview / create sprint.

## Open questions (deferred — not blocking)

- Should pinned backlog sprints be auto-unpinned from `sprint_slot` to reclaim the slot, or left as-is?
  (This story leaves them as-is; revisit if slots feel scarce.)
- Keep the board header "…" entry to `SprintListModal` as well, or move it exclusively into the bar's
  **⋯**? (This story keeps both.)

## Notes

- The aperture beeldmerk (`BridgeMark`) was explicitly rejected for this bar; lead with the `All` pill.
- Existing backlog convention lives in `src/lib/epic-children-grouping.ts` (`isBacklogSprintName`);
  prefer extracting/sharing it over duplicating the regex.
- A clickable, interactive mock of all four directions (D chosen) lives at `/dev/exploration/board-tabs`.
