# BRDG-209: Epic Search in Command Palette

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to search for epics via the command palette (Cmd+K) so I can quickly navigate to an epic detail page without leaving the keyboard. Additionally, Cmd+Shift+K should open the palette pre-filtered to epics only, giving instant access to the epic list.

## Implementation Plan

1. **types.ts** - Add `"epic"` to `ResultCategory` union, add `EpicResult` interface, extend `PaletteResult` union
2. **palette-data.ts** - Add `epic: "Epics"` to `CATEGORY_LABELS`
3. **useCommandPalette.ts** - Add `epicMode` state, `epicResults` state, fetch epics on open via `epics.list()`, create Fuse.js index on `[key, name]`, filter epics in `allResults` memo (epic-only in epic mode, query-matched in normal mode), add `Cmd+Shift+K` handler to open in epic mode, modify `Cmd+K` handler to switch from epic mode to normal mode, add `"epic"` case to `executeResult`, expose `epicMode` in return interface
4. **GlobalSearch.tsx** - Remove `Cmd+Shift+K` keyboard handler (keep `valk:openGlobalSearch` event listener)
5. **keyboard-shortcuts.ts** - Update `Cmd+Shift+K` label from "Open Ticket Search" to "Search Epics"
6. **ResultItem.tsx** - Add `"epic"` case to `ResultIcon` (using `Layers` icon with `--color-icon-epic` purple), add `"epic"` case to `ResultLabel` (key + name + status badge + child count + optional summary line)
7. **CommandPalette.tsx** - Destructure `epicMode`, change placeholder to "Search epics..." in epic mode, add visual "Epics" badge indicator, update footer hints

## Acceptance Criteria

### Phase 1: Epic result category in command palette
- [x] New `ResultCategory` value `"epic"` added to `types.ts`
- [x] New `EpicResult` interface with: `key`, `name`, `status`, `childCount`, `summary`
- [x] Epic results fetched from `GET /api/epics` (existing route, already cached)
- [x] Epics searchable by name and key (fuzzy match via Fuse.js, same as tickets)
- [x] Epic results shown in their own "Epics" group in the palette
- [x] Max 5 epic results displayed (consistent with other categories)
- [x] Each result shows: epic key, name, status badge, child count indicator
- [x] Selecting an epic navigates to `/tickets/[key]` (epic detail page)

### Phase 2: Cmd+Shift+K shortcut for epic-only mode
- [x] Cmd+Shift+K (Mac) / Ctrl+Shift+K (Windows) opens the command palette in "epic mode"
- [x] In epic mode, palette only shows epic results (no pages, actions, tickets, conversations)
- [x] Placeholder text changes to "Search epics..." (instead of the default)
- [x] Visual indicator that the palette is in epic-only mode (subtle label or different header)
- [x] Pressing Escape in epic mode closes the palette entirely (same as normal mode)
- [x] Cmd+K while in epic mode switches back to normal mode (full search)
- [x] Epic mode state resets when the palette is closed

### Phase 3: Epic result rendering
- [x] Status shown as colored dot or small badge matching the sprint board status colors
- [x] Child count shown as muted text (e.g., "12 issues")
- [x] If the epic has an AI summary, show a truncated single line below the name
- [x] Epic icon distinct from ticket icon to visually differentiate results

## Technical Notes

- Reuse the existing `GET /api/epics` endpoint; it returns `EpicListItem[]` with key, name, status, childCount, summary
- The endpoint is already cached (300s), so palette performance should be fine
- Epic data can be fetched once when the palette opens and filtered client-side (the list is typically small, <50 epics)
- Add the `Shift` key check to the existing keydown handler in `useCommandPalette.ts` (line 191 already excludes `!e.shiftKey`)
- Consider adding `"epic"` to `CATEGORY_LABELS` in `palette-data.ts`
- Fuse.js config should index both `key` and `name` fields for epic search

## Out of Scope
- Creating new epics from the command palette
- Inline epic actions (assign, change status) from palette results
- Epic search in the global search bar (separate from command palette)
