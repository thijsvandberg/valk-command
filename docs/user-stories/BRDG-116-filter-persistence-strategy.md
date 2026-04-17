# BRDG-116: Filter Persistence Strategy

**Status:** Open
**Priority:** Low

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

- [ ] Document the persistence strategy (which mechanism for which type of state)
- [ ] Migrate pipelines filters to follow the strategy
- [ ] Add filter persistence to activity log
- [ ] Align stakeholder view with the strategy
- [ ] Create shared usePersistedFilter hook if a common pattern emerges
- [ ] Verify filters survive page navigation as expected

## Impact

Establishes a single, consistent approach to filter persistence across the entire application. Users get predictable behavior (shareable URLs for important filters, remembered preferences across sessions) and developers get clear guidance on which mechanism to use for new views.
