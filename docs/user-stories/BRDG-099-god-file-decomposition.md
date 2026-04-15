# BRDG-099: God File Decomposition

**Status:** Open
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

## Acceptance Criteria

- [ ] Each file above is under 400 lines after decomposition
- [ ] Extracted components are co-located in the same directory (e.g. `components/command-palette/`)
- [ ] No behavioral changes; all existing functionality preserved
- [ ] Existing tests pass without modification (or are updated to match new imports)
- [ ] New sub-components have their own test files where business logic is extracted
- [ ] No new eslint-disable comments introduced

## Notes

- Tackle one file at a time; each can be its own PR
- Start with CommandPalette as it has the clearest boundaries between result categories
- The pipelines page also needs its 11 eslint-disable comments resolved as part of restructuring
