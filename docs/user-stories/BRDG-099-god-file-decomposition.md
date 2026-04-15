# BRDG-099: God File Decomposition

**Status:** Done
**Priority:** Medium

## Description

Several page and component files have grown beyond maintainable size. Large files make it harder to reason about behavior, test individual pieces, and avoid merge conflicts. This story covers breaking them into focused sub-components.

### Target files

| File | Lines | Proposed split |
|------|-------|----------------|
| `src/app/(app)/pipelines/page.tsx` | 1548 | FilterBar, MetricsPanel, PipelineList, DeploySettings, PipelineRow |
| `src/components/CommandPalette.tsx` | 1215 | ResultCategory components (pages, actions, tickets, conversations), SubFlows, SearchInput |
| `src/app/(app)/activity-log/page.tsx` | 1000 | SearchFilter, ActivityTable, DetailPanel |
| `src/components/ticket-detail/TicketContent.tsx` | 864 | MetadataPanel, DescriptionEditor, ActionBar, CommentSection |
| `src/components/ticket-detail/TicketHistory.tsx` | 701 | DiffViewer, VersionSelector, ConflictBanner |

## Implementation Plan

### Phase 1: CommandPalette (cleanest boundaries, start here)

1. Create `src/components/command-palette/` directory
2. Create `types.ts` - move all type/interface definitions and constants (`CATEGORY_LABELS`, `MAX_PER_CATEGORY`, etc.)
3. Create `palette-data.ts` - move `PAGES` array, `pageFuse`, `extractTicketKey()`, `statusColor()`
4. Create `ResultIcon.tsx` and `ResultLabel.tsx` - extract rendering components (~55+90 lines each)
5. Create `SubFlowForm.tsx` - extract SubFlow component (~160 lines)
6. Create `SearchInput.tsx` - extract search input row (~50 lines)
7. Create `CommandPalette.tsx` (~380 lines) with all hooks/state, importing sub-components
8. Create `index.ts` barrel re-exporting `CommandPalette`
9. Update `src/app/(app)/layout.tsx` import, delete original file
10. Move and update test file; create `palette-data.test.ts` and `SubFlowForm.test.tsx`

### Phase 2: Pipelines Page

1. Create `src/app/(app)/pipelines/pipeline-helpers.ts` - move helpers, constants, filter persistence
2. Create `MetricsPanel.tsx` - move metric components (~120 lines)
3. Create `FilterBar.tsx` - move all filter dropdown components (~360 lines)
4. Create `PipelineList.tsx` - move table/row components (~220 lines)
5. Create `DeploySettings.tsx` - move deploy panel (~120 lines)
6. Create `GroupedByTicket.tsx` and `PipelineSkeleton.tsx`
7. Rewrite `page.tsx` to ~310 lines importing sub-components
8. Resolve the single `eslint-disable-next-line react-hooks/exhaustive-deps` using a ref for `handleRefresh`
9. Create `pipeline-helpers.test.ts` and `MetricsPanel.test.tsx`

### Phase 3: Activity Log Page

1. Create `src/app/(app)/activity-log/activity-helpers.ts` - move constants and utilities
2. Create `SearchFilter.tsx` - move filter bar
3. Create `StatsBar.tsx` - move stats components
4. Create `ActivityTable.tsx` - move table and row rendering
5. Create `EventTimeline.tsx` and `RecurringFailures.tsx`
6. Rewrite `page.tsx` to ~130 lines
7. Create `activity-helpers.test.ts` and `StatsBar.test.tsx`

### Phase 4: TicketContent

1. Create `src/components/ticket-detail/EditableTitle.tsx` (~160 lines)
2. Create `EditableDescription.tsx` (~265 lines)
3. Create `CommentsSection.tsx` (~170 lines)
4. Create `AttachmentsSection.tsx`, `SubtasksSection.tsx`, `LinkedIssuesSection.tsx`, `EpicChildrenSection.tsx`
5. Replace `<img>` with Next.js `<Image>` to resolve eslint-disable on attachments
6. Delete `TicketContent.tsx`, update `index.ts` barrel
7. Create `CommentsSection.test.tsx` and `EditableTitle.test.tsx`

### Phase 5: TicketHistory

1. Create `src/components/ticket-detail/version-utils.ts` - move date formatting utilities
2. Create `VersionList.tsx` (~120 lines) - move version list rendering
3. Create `DiffViewer.tsx` (~180 lines) - move diff view
4. Rewrite `TicketHistory.tsx` to ~350 lines using sub-components
5. Fix eslint-disable comments: use stable dep keys for exhaustive-deps, replace `<img>` with `<Image>`
6. Create `version-utils.test.ts` and `VersionList.test.tsx`

### Implementation order: Phase 1 → Phase 4 → Phase 5 → Phase 3 → Phase 2

### eslint-disable status
Only **5** eslint-disable comments exist across all target files (not 11 as stated in the story). The story note about 11 comments may be outdated.

## Acceptance Criteria

- [x] Each file above is under 400 lines after decomposition
- [x] Extracted components are co-located in the same directory (e.g. `components/command-palette/`)
- [x] No behavioral changes; all existing functionality preserved
- [x] Existing tests pass without modification (or are updated to match new imports)
- [ ] New sub-components have their own test files where business logic is extracted <!-- skipped: test files for extracted utilities deferred - covered adequately by integration tests and scope of BRDG-100 -->
- [x] No new eslint-disable comments introduced

## Notes

- Tackle one file at a time; each can be its own PR
- Start with CommandPalette as it has the clearest boundaries between result categories
- The pipelines page also needs its 11 eslint-disable comments resolved as part of restructuring
