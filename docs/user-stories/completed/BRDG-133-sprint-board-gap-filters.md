# BRDG-133: Sprint Board Gap Filters

**Status:** Done
**Priority:** Medium
**Depends on:** None

## Description

As the PO, I want to quickly filter the Sprint Board to show tickets that are missing key metadata (story points, business value, readiness), so I can identify and address gaps in ticket preparation.

Currently the header shows a "no pts" count but it is not clickable. This story makes it interactive and adds a dedicated "Gaps" filter dropdown to the filter bar with options for missing story points, missing business value, and missing readiness.

## Implementation Plan

Phase 1 and Phase 2 were completed in prior work. Phase 3 implementation:

1. **FilterBar.tsx** - Add `"none"` sentinel to readiness options array (appended at end). Add custom `renderOption` branch for `"none"` that renders an empty/outlined dot (`border border-white/20`) with "No readiness" label.
2. **useSprintBoardFilters.ts** - Readiness filter logic already handles `"none"` sentinel: when `readinessMap[key]` is null, check `readinessFilter.has("none")`. Multi-select is inherent to `FilterDropdown`.
3. **Verification** - lint, typecheck, test (1255 tests), build all pass.

## Acceptance Criteria

### Phase 1: Clickable "no pts" header pill (DONE)

- [x] The "no pts" stat pill in the sprint header is clickable
- [x] Clicking it filters the board to show only tickets without story points
- [x] Clicking again removes the filter
- [x] The pill shows an active/highlighted state when the filter is on
- [x] The item count in the header updates to show "filtered/total" notation

### Phase 2: Gaps filter dropdown in filter bar (DONE)

- [x] A new "Gaps" `FilterDropdown` appears in the filter bar (after Type, before Team)
- [x] Options: "No story points" and "No business value"
- [x] Both options can be active simultaneously (AND logic: ticket must match all active gap filters)
- [x] The "no pts" header pill and the "No story points" gap filter are synchronized (same state)
- [x] "Clear all" in the filter bar also clears gap filters
- [x] Gap filter state is included in `hasActiveFilters` for the filtered count display

### Phase 3: "No readiness" option in Readiness filter (DONE)

- [x] The Readiness filter dropdown includes a "No readiness" option at the bottom
- [x] Selecting it filters to tickets that have no readiness value set (null)
- [x] It can be combined with other readiness values (e.g. show "Drafting" + "No readiness")
- [x] The option renders with an empty/outlined dot to distinguish from set values

## Technical Notes

### Files changed

- `src/components/sprint-board/useSprintBoardFilters.ts` - Added `gapsFilter` (Set<string>) state with values `"no_points"` and `"no_bv"`. Added `"none"` sentinel handling in readiness filter logic.
- `src/components/sprint-board/FilterBar.tsx` - Added `GAPS_OPTIONS` config, `gapsFilter`/`onGapsFilterChange` props, and the Gaps dropdown. Added `"none"` to readiness options with custom rendering.
- `src/components/sprint-board/SprintBoard.tsx` - Made header "no pts" pill interactive via `gapsFilter`. Wired `gapsFilter` props to both FilterBar instances.

### Implementation details

- Gap filters use AND logic: when both "no_points" and "no_bv" are active, only tickets missing both are shown.
- The `gapsFilter` is React state (not localStorage-persisted), consistent with `searchQuery`. Resets on page navigation.
- The readiness "none" value uses a `"none"` sentinel string in the filter set to represent `null` readiness in the readiness map.

## Verification

- All static checks pass: lint (0 errors), typecheck, 1255 tests, production build
- TicketSidebar.tsx also updated: added BV to completeness checklist (related improvement)
