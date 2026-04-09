# VC-009: Remaining Items & E2E Findings

**Status:** Not Started
**Priority:** Medium

## Description

Remaining open items from VC-008, plus new issues and improvements discovered during e2e verification on 2026-03-31.

## Remaining from VC-008 (not yet built)

### Sprint Board
- [ ] Burndown/burnup mini chart
- [ ] Velocity comparison with previous sprints
- [ ] Sprint transitions (start/complete, requires Jira write)
- [ ] Sprint planning mode (drag between sprints)
- [ ] Sprint retrospective summary
- [ ] Ticket movement tracking between sprints
- [ ] Virtual scrolling for large sprints (50+ tickets)

### Ticket Detail
- [ ] Real-time collaboration (WebSocket)
- [ ] Optimistic UI updates
- [ ] Conflict detection (local vs Jira)
- [ ] Batch review mode
- [ ] Refinement notes per ticket
- [ ] Link to refinement view with pre-loaded stories

### Diff & History
- [ ] Syntax-aware diff for structured content
- [ ] Diff annotations (PO comments on specific changes)
- [ ] Restore to previous version

### Agent Integration
- [ ] Agent access to full ticket context (description, history, notes, comments)
- [ ] Chat responses referencing ticket fields
- [ ] Actions from chat (update PO status, add notes, trigger review)
- [ ] Daily digest (sprint changes since yesterday)
- [ ] Risk detection (low quality + close to sprint end)

### Technical Debt
- [ ] Integration tests for full page flows
- [ ] E2e tests with Playwright
- [ ] Visual regression tests
- [ ] Type-safe API layer with shared types

## E2E Findings (2026-03-31)

### Working Well
- Sprint board: tabs, filters, sort, columns, drag-and-drop, analytics, compare view
- Side panel: resizable, full width, diff view, description, PO metadata
- Ticket detail: 4 tabs (Content, History, Review, Refinement), all functional
- Diff: unified + side-by-side modes, version navigation, export
- Review: 4 dimension sliders, agent review, overall score
- Refinement: team estimation, readiness checklist
- Shared components: StatusBadge, Avatar, EpicLabel, IssueTypeIcon
- SWR caching, debounce, lazy loading

### Issues Discovered

1. **History tab version count mismatch**: Badge shows different count depending on whether API or mock fallback is used. When DB is empty, mock fallback may have fewer versions than the badge initially suggested.

2. **Filter persistence across sprint switches**: When switching sprint tabs, the active filters remain from the previous sprint. Some filter values (e.g. specific assignees) may not exist in the new sprint, showing 0 results.

3. **Drag-and-drop priority not synced to API**: PO priority from drag reordering is stored in localStorage only. Should also persist via API so it survives across devices.

4. **Sprint Insights component not visible**: The SprintInsights component was created but may not be integrated into the main SprintBoard layout yet. Verify and wire up.

5. **VC-006 Phase 4 still open**: Rich text editor (TipTap) is built but not integrated into ticket detail description editing or PO notes. Current editors are still plain textareas.

## Improvements Identified

1. **Responsive design**: Sprint board table is not optimized for smaller screens. Consider a card view for mobile/tablet.

2. **Accessibility**: Keyboard navigation exists but screen reader support (aria-labels, roles) needs audit.

3. **Error handling**: API calls don't show user-friendly error messages on failure. Add toast notifications for errors.

4. **Undo support**: PO status changes, notes edits, and review saves have no undo. Consider adding an undo toast ("Changed status to Ready. Undo?").

5. **Search in ticket table**: The filter bar has filter dropdowns but no free-text search for ticket titles/descriptions. Add a search input.

6. **Export sprint data**: Export current sprint view as CSV or PDF for stakeholder reporting.

7. **Dark/light theme toggle**: Currently dark-only. Some users may prefer light mode.

## Dependencies

- Jira API credentials (for real data integration)
- valk-agent workspace (for full agent integration)
- WebSocket infrastructure (for real-time features)
- VC-006 completion (for rich editor integration)
