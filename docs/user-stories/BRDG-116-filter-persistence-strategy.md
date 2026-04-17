# BRDG-116: Filter Persistence Strategy

**Status:** In Progress
**Priority:** Low

## Implementation Plan

1. **Document the strategy** - Create `docs/architecture/filter-persistence.md` covering the three-tier model (URL params, localStorage, no persistence), key naming convention (`bridge:<view>:<purpose>`), and hook usage guidance. Document that `usePersistedFilter` is not needed since `useLocalStorage` already covers all cases.

2. **Migrate pipelines page** - Replace the manual `useRef(loadFilters())` + `useEffect(saveFilters(...))` pattern in `pipelines/page.tsx` with `useLocalStorage`. Remove dead `loadFilters`/`saveFilters` functions from `pipeline-helpers.ts`. Keep `STORAGE_KEY` and type definitions.

3. **Add activity log persistence** - Replace bare `useState` for `selectedTypes` and `statusFilter` in `activity-log/page.tsx` with `useLocalStorage`. Store array form of types (convert to/from `Set` at usage boundary). `offset` and `expandedIds` remain ephemeral state.

4. **Align stakeholder view** - Replace inline `sessionGet`/`sessionSet` helpers (which already call `localStorage`, despite the misleading name) with `useLocalStorage`. Remove the `SESSION_KEY_TEAM`/`SESSION_KEY_SPRINT` constants and helper functions.

5. **No shared hook needed** - The existing `useLocalStorage` hook already provides everything needed. A wrapper would be indirection without value.

6. **Verify** - Manual navigation and cross-tab tests to confirm filters survive page navigation as expected.

## Description

Each view handles filter state persistence differently. This is confusing for users (some filters survive page navigation, others don't) and for developers (no clear guidance on which approach to use).

### Current inconsistency

**Pipelines page:** localStorage with custom saveFilters/loadFilters functions
- Location: [src/app/(app)/pipelines/page.tsx](../../src/app/(app)/pipelines/page.tsx) (search for "saveFilters")

**Activity log:** No persistence at all. Filters reset on every navigation.
- Location: [src/app/(app)/activity-log/page.tsx](../../src/app/(app)/activity-log/page.tsx)

**Stakeholder view:** sessionStorage (survives refresh but not tab close)
- Location: [src/app/(app)/stakeholder/page.tsx](../../src/app/(app)/stakeholder/page.tsx) (search for "sessionStorage")

**Sprint board:** URL search params via router + SWR cache
- Location: [src/components/sprint-board/SprintBoard.tsx](../../src/components/sprint-board/SprintBoard.tsx)

### Proposed strategy

- **URL params** for filters that should be shareable (sprint selection, ticket key, search query)
- **localStorage** for user preferences that should persist across sessions (column config, density, sort order)
- **No persistence** for ephemeral UI state (expanded/collapsed, hover, temporary selections)

## Acceptance Criteria

- [x] Document the persistence strategy (which mechanism for which type of state)
- [x] Migrate pipelines filters to follow the strategy
- [ ] Add filter persistence to activity log
- [ ] Align stakeholder view with the strategy
- [ ] Create shared usePersistedFilter hook if a common pattern emerges
- [ ] Verify filters survive page navigation as expected

## Impact

Establishes a single, consistent approach to filter persistence across the entire application. Users get predictable behavior (shareable URLs for important filters, remembered preferences across sessions) and developers get clear guidance on which mechanism to use for new views.
