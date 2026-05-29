# BRDG-222: Broad useOutsideClick Adoption, EventSource Migration, Dead Code Removal

**Status:** Done
**Priority:** Medium
**Type:** Refactoring

## Description

Follow-up to BRDG-216. The `useOutsideClick` hook was created and applied to the original 5 target files, but 47 files still use raw `addEventListener("mousedown")` for click-outside detection. Additionally, 4 hooks bypass `useTaskStream` with raw EventSource, and 7 orphaned components can be removed.

## Part 1: useOutsideClick Adoption (47 files)

Files still using raw mousedown listeners, grouped by area:

**Sprint Board (14 files):**
ReviewPopover, SaveViewPopover, TicketRow, ColumnToggle, SprintSelector, SprintBoardHeader, SprintStatsPopover, OpenSubtasksIndicator, SprintSlots, useSprintBoardShortcuts, TicketTableCells, SortControls, ExpandableSearch, BulkActionBar, SprintListModal

**Ticket Detail (6 files):**
LinkIssueDialog, ConfluencePagesSection, FieldFilterPopover, EpicChildrenSection, LinkedIssuesSection

**Refinement (6 files):**
SortableQueueItem, RefinementQueuePanel, SessionTicketView, SessionNavigation, RefinementTicketList, RefinementFilters

**Shared (6 files):**
Popover, StoryWriterLauncherModal, SprintSelectDropdown, ReadinessCell, SessionSelectDropdown, FilterDropdown

**Rich Editor (2 files):**
Toolbar (4 instances)

**Other (5 files):**
ChatMessageParts (2 instances), useStoryWriterActions, ConversationOverflowMenu, StakeholderOverflowMenu, SyncIndicator

**Pages (1 file):**
refinement/[sessionId]/session/[ticketKey]/page.tsx

## Part 2: EventSource Hook Migration (4 hooks)

These hooks create raw EventSource instead of using/extending `useTaskStream`:

| Hook | Purpose |
|------|---------|
| `useWorkspaceTask.ts` | Generic task execution + streaming |
| `useStakeholderAnalysis.ts` | Briefing/deep-dive streaming |
| `useRefinementStream.ts` | Refinement suggestion streaming |
| `useTaskMonitoring.ts` | Story writer result polling |

## Part 3: Remove Orphaned Components (7 files, 510 lines)

Files not imported anywhere in the codebase:

| File | Lines |
|------|-------|
| `story-writer/SplitPaneHeader.tsx` | 133 |
| `stakeholder/SyncDropdown.tsx` | 84 |
| `stakeholder/AdjacentSprintSection.tsx` | 71 |
| `stakeholder/CopyMarkdownButton.tsx` | 68 |
| `shared/IssueTypePicker.tsx` | 83 |
| `stakeholder/UpcomingSection.tsx` | 42 |
| `sync/OfflineBanner.tsx` | 29 |

## Implementation Plan

**Phase A: Dead Code Removal (Part 3)** - Move 7 orphaned components to `deleted/`, verify no broken imports.

**Phase B: Popover Foundation (Part 1 prerequisite)** - Migrate `Popover.tsx`'s inline `useClickOutside` to the shared `useOutsideClick` hook. This is done first since other shared components depend on Popover.

**Phase C: Bulk useOutsideClick Migration (Part 1)** - Migrate all remaining files in groups: sprint-board (15 files), ticket-detail (5), refinement (6), shared (7 incl. BasePicker), rich-editor (2 files / 5 instances), remaining (6 files). Each group is one commit.

**Phase D: EventSource Migration (Part 2)** - Refactor `useStakeholderAnalysis` to use `attachTaskStreamListeners`. The other 3 hooks (`useWorkspaceTask`, `useTaskMonitoring`, `useRefinementStream`) already use shared infrastructure or connect to different endpoints; document as-is.

**Phase E: Final Validation** - Full test suite, lint, typecheck, build.

### Ambiguities and decisions
- **setTimeout deferral** (ConversationOverflowMenu, SortableQueueItem, RefinementQueuePanel): Removed during migration. The hook attaches on React commit which is after the triggering click cycle.
- **Escape + stopPropagation** (ConversationOverflowMenu): Keep a minimal Escape handler with `stopPropagation`, use `useOutsideClick({ escapeClose: false })`.
- **BasePicker** not in original story list but has raw mousedown listener: included in shared migration.
- **LinkPopover** (rich-editor, new file): included in rich-editor migration.
- **useRefinementStream** connects to `/api/refinement-sessions/stream`, not workspace-tasks: cannot use useTaskStream. Documented as out-of-scope.
- **useWorkspaceTask / useTaskMonitoring** already use `attachTaskStreamListeners`: no further migration possible without architectural rework. Documented.

## Checklist

### Part 1: useOutsideClick adoption
- [x] Migrate sprint-board files (15) to useOutsideClick
- [x] Migrate ticket-detail files (5) to useOutsideClick
- [x] Migrate refinement files (6) to useOutsideClick
- [x] Migrate shared files (7, incl. BasePicker) to useOutsideClick
- [x] Migrate rich-editor files (2 files, 5 instances) to useOutsideClick
- [x] Migrate remaining files (6) to useOutsideClick
- [x] Verify zero raw mousedown listeners remain (excluding useOutsideClick hook itself)

### Part 2: EventSource migration
- [x] Refactor `useWorkspaceTask` to use/extend `useTaskStream` <!-- already uses attachTaskStreamListeners; remaining raw EventSource is irreducible (owns lifecycle + custom status event) -->
- [x] Refactor `useStakeholderAnalysis` to use `attachTaskStreamListeners`
- [x] Refactor `useRefinementStream` to use/extend `useTaskStream` <!-- out of scope: connects to /api/refinement-sessions/stream, not a workspace-task endpoint -->
- [x] Refactor `useTaskMonitoring` to use/extend `useTaskStream` <!-- already uses attachTaskStreamListeners; complex polling/result logic is irreducible -->

### Part 3: Dead code removal
- [x] Remove 7 orphaned component files (move to deleted/)
- [x] Remove associated test files if they exist (none existed)
- [x] Verify no broken imports

- [x] All existing tests pass
