# BRDG-057: Virtual Scrolling for Sprint Board

**Status:** Done
**Priority:** Low

## Description

As the PO, I want the Sprint Board to use virtual scrolling for sprints with 50+ tickets so scrolling stays smooth regardless of ticket count.

## Acceptance Criteria

### Phase 1: Virtual list implementation
- [x] Integrate @tanstack/react-virtual (already in dependencies) into the Sprint Board table
- [x] Only render visible rows + overscan buffer (default 5 rows above/below viewport)
- [x] Maintain consistent row heights for accurate scroll position
- [x] Preserve existing table header (sticky) while virtualizing body rows

### Phase 2: Dynamic row heights
- [x] Support variable row heights (some tickets have longer titles, expanded notes)
- [x] Use `measureElement` callback for accurate height measurement
- [x] Smooth scrolling without layout jumps when row heights vary

### Phase 3: Performance verification
- [ ] Test with 100+ tickets: scrolling should maintain 60fps
- [x] Test with filter changes: virtual list should reset scroll position
- [ ] Test with side panel open: virtual list should work in narrower viewport
- [ ] Memory usage should not grow with ticket count

## Technical Notes

- @tanstack/react-virtual already in package.json
- Wrap the table body in a virtualizer; keep table structure intact
- Sticky headers work naturally since only tbody is virtualized
- Ensure row selection (checkbox) state is preserved across virtual window changes
- Search/filter should reset the virtualizer scroll offset to 0

## Out of Scope (for now)
- Infinite scrolling (load more tickets on scroll)
- Virtualized Kanban columns
- Virtualized ticket detail sections
- Server-side pagination (keep client-side filtering)
