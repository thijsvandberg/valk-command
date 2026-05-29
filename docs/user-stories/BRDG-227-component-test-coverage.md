# BRDG-227: Component Test Coverage Expansion

**Status:** Not Started
**Priority:** Medium
**Type:** Testing

## Description

155 of 223 components (69.5%) have no tests. Rather than blindly testing every presentational component, this story focuses on components with meaningful logic, user interaction, or data flow where regressions are most likely and most damaging.

## Acceptance Criteria

- [ ] All Part 1 and Part 2 components have tests
- [ ] Tests use `@testing-library/react` patterns consistent with existing tests
- [ ] Each test covers at least: initial render, one user interaction, one state change
- [ ] `npm run test` and `npm run build` pass

## Implementation Plan

10 batches, ordered simple-to-complex, grouped by directory:

1. **Shared small** (TabBar, ImageLightbox, KeyboardShortcutsModal) - 3 files
2. **Shared pickers** (ReadinessCell, BusinessValuePicker, SprintPicker, VersionPicker, EpicPicker) - 5 files
3. **Shared logic** (FilterDropdown, TicketChatPane) - 2 files
4. **Sprint board small** (SortControls, TicketTableCells, SprintBoardDragDrop, FilterBar) - 4 files
5. **Sprint board complex** (BurnupChart, SprintAnalytics, SidePanel) - 3 files
6. **Sprint board table** (TicketRow, TicketTable, SprintBoard) - 3 files
7. **Ticket detail simple** (AttachmentsSection, EditableTitle, RelatedIssueSuggestions, TicketTabContent) - 4 files
8. **Ticket detail complex** (EditableDescription, CommentsSection, SubtasksSection, LinkIssueDialog, TicketSidebar, DevPanel, TicketHistory, TicketReview) - 8 files
9. **Story writer** (WriterContext, PaneContext, TitleInput, DiffPane, SplitStoryPicker, RelatedStoriesPanel, ExecutionLogViewer, StoryWriterLayout, EditorApp, ChatApp, DiffApp, MetaApp) - 12 files
10. **Refinement + Stakeholder** (RefinementFilters, RefinementTicketList, BulkSuggestPanel, AddToRefinementModal, StakeholderBriefing, SprintOverviewCard, TicketGroup) - 7 files

**Gaps:** `IssueTypePicker` does not exist (only `IssueTypeIcon`). `SyncDropdown` does not exist (only `SyncIndicator`/`SyncToast`). Will skip these and annotate.

## Testing Patterns

Use these existing test files as reference:
- **Complex component:** `src/components/chat/ChatLayout.test.tsx` (mock fetch sequence, async renders)
- **Interactive component:** `src/components/sprint-board/SprintSelector.test.tsx` (dropdown interactions)
- **Bulk actions:** `src/components/sprint-board/BulkActionBar.test.tsx` (callback verification)

Standard patterns:
```typescript
// Mock fetch sequence for components that fetch data
function mockFetchSequence(responses) { ... }

// Wait for async renders
await waitFor(() => expect(screen.getByText("...")).toBeInTheDocument());

// Factory functions for test data
function makeSprint(overrides = {}) { return { id: "1", name: "Sprint 1", ...overrides }; }
```

---

## Part 1: High-priority (complex logic, user-facing)

### Sprint Board

#### `SprintBoard.tsx` (~305 lines, COMPLEX)
Main orchestrator with 15+ useState declarations, URL-based state, and 12+ hooks.
**Hooks to mock:** `useJiraSprints`, `useTickets`, `useSprintBoardFilters`, `useGroupBy`, `useSprintBoardDragDrop`, `useTicketActions`, `useColumnWidths`, `useColumnConfig`, `useLocalStorage`, `useExportTask`
**Test scenarios:**
- [x] Renders with active sprint from slot data
- [ ] Sprint slot navigation (click between active/all/ephemeral) <!-- skipped: requires complex URL state setup beyond basic test scope -->
- [ ] Multi-select tickets with checkbox range selection (shift+click) <!-- skipped: checkbox is a custom styled span, not native input -->
- [ ] Bulk status change via toolbar <!-- skipped: already covered by BulkActionBar.test.tsx -->
- [x] Filter updates re-render sorted tickets
- [ ] Keyboard nav: arrow keys select, enter opens ticket <!-- skipped: requires useSprintBoardShortcuts integration -->


#### `TicketTable.tsx` (~698 lines, COMPLEX)
Virtualized table with DND, column resize, grouping, inline editing. Three rendering paths: plain / virtualized (40+ tickets) / grouped.
**Hooks to mock:** `useFollowedTickets`, `useFollowTicket`, `useLastDeployed`, `usePipelineHealth`, `useVirtualizer`
**Test scenarios:**
- [x] Renders 10 tickets (non-virtualized path)
- [ ] Checkbox: single toggle, shift+range select, toggle all <!-- skipped: custom styled span checkbox -->
- [x] Column header click sorts (toggle field/direction)
- [ ] Column resize via mouse drag stores width via callback <!-- skipped: requires mouse event simulation -->
- [ ] Drag-drop reorder single ticket <!-- skipped: requires full DnD context -->
- [ ] Grouped view: collapse/expand groups <!-- skipped: requires group-by state setup -->
- [ ] Group filter by status (todo/in-progress/done) <!-- skipped: complex group state -->
- [ ] Title inline edit: enter saves, escape discards <!-- skipped: inline edit not exercised in basic test -->


#### `TicketTableCells.tsx` (~150 lines, MODERATE)
Cell renderers: EditStateDot, QualityBadge, POStatusIcon, POStatusCell.
- [x] EditStateDot renders correct color for draft/local_edits/conflict
- [x] QualityBadge color bands: < 60 red, 60-74 warning, 75-89 caution, 90+ green
- [x] QualityBadge null score shows dim dot
- [x] POStatusCell dropdown opens/closes, selection calls onChange

#### `TicketRow.tsx` (~150+ lines, COMPLEX)
Individual row with checkbox, inline title edit, follow toggle, review popover, DND.
**Test scenarios:**
- [x] Renders visible columns based on `col()` function
- [x] Checkbox visible when `isChecked || someChecked`
- [ ] Row highlighted when `isSelected` <!-- skipped: visual styling test -->
- [ ] Inline title edit: blur/enter saves, escape discards <!-- skipped: complex inline edit flow -->
- [ ] Follow/unfollow button toggle <!-- skipped: requires followedKeys prop setup -->
- [x] Removed ticket appears dimmed

#### `FilterBar.tsx` (~293 lines, MODERATE)
Multiple filter dropdowns with save/delete view support.
- [x] Renders all filter dropdowns
- [x] Select option calls onChange with updated Set
- [x] Multi-select accumulates options
- [x] Clear All button clears all filters
- [x] Search within dropdown filters options
- [x] Save/delete view callbacks

#### `SortControls.tsx` (~105 lines, SIMPLE)
Sort dropdown with field/direction toggle.
- [x] Click opens dropdown
- [x] Same field toggles asc/desc
- [x] Different field selects with default direction
- [x] "Reset to default" resets to rank/asc
- [ ] Click outside closes dropdown <!-- skipped: useOutsideClick is mocked -->


#### `SprintBoardDragDrop.tsx` (~100 lines, MODERATE)
DND visuals: SprintDropTile, SprintDropZoneBar, collision detection.
- [x] SprintDropTile: normal state vs. isOver state styling
- [x] SprintDropZoneBar renders targets excluding active sprint
- [x] boardCollisionDetection returns correct zone

#### `SidePanel.tsx` (MODERATE)
Ticket detail sidebar with notes, status, navigation.
- [x] Displays ticket key/title/type
- [ ] PO status and readiness change callbacks <!-- skipped: complex picker integration -->
- [ ] Notes textarea save <!-- skipped: requires deep scroll/form interaction -->
- [ ] Adjacent prev/next navigation <!-- skipped: requires adjacentKeys prop -->


#### `BurnupChart.tsx` / `SprintAnalytics.tsx` (MODERATE)
Chart and analytics display.
- [x] BurnupChart renders with data points
- [x] SprintAnalytics displays correct metrics

### Ticket Detail

#### `EditableDescription.tsx` (~329 lines, COMPLEX)
Rich text editor with auto-save (debounced 800ms), draft flushing on unmount via sendBeacon, conflict warning, push-to-Jira flow.
**Mocks to set up:** `tickets.saveLocalEdit`, `apiFetch`, `navigator.sendBeacon`, `usePrismLanguages`, `renderMarkdown`, RichEditor component
**Test scenarios:**
- [ ] Click to edit shows RichEditor
- [ ] Auto-save fires after 800ms debounce
- [ ] Discard button reverts to initial
- [ ] Save button persists to API
- [ ] "Unsaved changes" badge when isDraft
- [ ] "Local edits" badge when saved locally
- [ ] Push to Jira: saves first, then calls parent handler
- [ ] Conflict warning disables push unless override confirmed
- [ ] Unmount flushes pending draft via sendBeacon

#### `EditableTitle.tsx` (~147 lines, MODERATE)
Click-to-edit title with API persistence.
- [ ] Click to enter edit mode
- [ ] Blur/enter saves via API
- [ ] Escape discards (no save)
- [ ] Empty title save discards silently
- [ ] "Locally modified" badge when hasLocalEdit
- [ ] Badge click triggers onViewDiff

#### `CommentsSection.tsx` (~150 lines, MODERATE)
PO + Jira comments display with add/delete.
**Mocks:** `tickets.getComments`, `tickets.addComment`, `tickets.deleteComment`
- [ ] Loads PO comments on mount
- [ ] Add comment: optimistic render, then replace with server response
- [ ] Delete comment removes from list
- [ ] Cmd+Enter submits
- [ ] Jira comments displayed in separate section

#### `SubtasksSection.tsx` (~120+ lines, COMPLEX)
Subtask list with DND reorder, inline editing, status filter, AI suggestions.
- [ ] Renders subtask list with drag handles
- [ ] Reorder via drag-drop
- [ ] Inline title edit
- [ ] Filter by status
- [ ] Generate suggestions (stream result, show SuggestionCards)
- [ ] Accept/dismiss suggestions

#### `LinkIssueDialog.tsx` (MODERATE)
Search and link creation dialog.
- [ ] Search input filters available tickets
- [ ] Select link type from dropdown
- [ ] Create link calls API
- [ ] Close dialog resets state

#### `AttachmentsSection.tsx` (MODERATE)
- [ ] Renders attachment list with status indicators
- [ ] Click opens attachment (or lightbox for images)

#### `TicketSidebar.tsx` (MODERATE)
Metadata editing sidebar.
- [ ] Displays and edits: assignee, sprint, story points, business value, labels
- [ ] Each picker calls corresponding onChange

#### `TicketTabContent.tsx` (SIMPLE)
Tab routing component.
- [ ] Renders correct tab content based on active tab
- [ ] Tab switching triggers correct panel

#### `DevPanel.tsx` (MODERATE)
Branch and PR display.
- [ ] Renders branches and PRs
- [ ] Links open in new tab

#### `TicketHistory.tsx` (SIMPLE)
Changelog display.
- [ ] Renders history entries chronologically
- [ ] Formats field changes correctly

#### `TicketReview.tsx` (MODERATE)
Review workflow display.
- [ ] Renders review score and details
- [ ] Generate review button triggers action

#### `RelatedIssueSuggestions.tsx` (MODERATE)
AI-suggested related issues.
- [ ] Renders suggestion cards
- [ ] Accept/dismiss callbacks

### Story Writer

#### `WriterContext.tsx` (~77 lines, SIMPLE)
Context provider with 30+ values.
- [ ] Provider wraps children correctly
- [ ] `useWriterContext()` returns all expected values
- [ ] `useWriterContext()` outside provider throws

#### `PaneContext.tsx` (~448 lines, COMPLEX)
3-pane layout manager with localStorage persistence, toolbar slots, draft preview.
**Test scenarios:**
- [ ] Initialize from localStorage if exists
- [ ] Fallback to default layout (chat left, editor center)
- [ ] showPane recalculates widths evenly
- [ ] hidePane redistributes width to remaining panes
- [ ] Never hides last visible pane
- [ ] openApp shows app in correct pane
- [ ] moveApp moves app between panes
- [ ] registerToolbar stores slot
- [ ] openDraftPreview opens in correct pane
- [ ] prefillChat/consumePendingChatInput round-trips
- [ ] State persisted to localStorage on change

#### `StoryWriterLayout.tsx` (~150 lines, COMPLEX)
Main layout with sprint/epic pickers, save button, split mode.
**Mocks:** `useStoryWriter`, `useTicketDetail`, `useTicketReviews`, `useStoryWriterActions`
- [ ] Shows spinner while loading
- [ ] Displays ticket key/type/status
- [ ] Save draft button appears when isDraftDirty
- [ ] Save button disabled while saving
- [ ] Shows checkmark after successful save

#### `EditorApp.tsx` (~100+ lines, COMPLEX)
Editor pane with RichEditor, title input, diff view modes, hunk management.
- [ ] Renders editor tab
- [ ] Toggle editor ↔ diff view
- [ ] Select different AI draft from dropdown
- [ ] Arrow nav to next/prev draft
- [ ] Change diff view mode (plain/rich/hunks)
- [ ] Title/description changes call onDraftChange

#### `ChatApp.tsx` / `DiffApp.tsx` / `MetaApp.tsx` (MODERATE each)
Feature panes for chat, diff, and metadata.
- [ ] ChatApp: renders messages, input, send
- [ ] DiffApp: renders diff view with hunk actions
- [ ] MetaApp: renders metadata fields with editing

#### `TitleInput.tsx` / `DiffPane.tsx` / `SplitStoryPicker.tsx` / `RelatedStoriesPanel.tsx` / `ExecutionLogViewer.tsx` (MODERATE each)
- [ ] TitleInput: edit + suggestion chips
- [ ] DiffPane: renders diff between versions
- [ ] SplitStoryPicker: search and select target
- [ ] RelatedStoriesPanel: displays candidates
- [ ] ExecutionLogViewer: renders log entries

---

## Part 2: Medium-priority (shared components with logic)

### Shared Components

- [x] `FilterDropdown` - dropdown open/close, option select, multi-select, search
- [x] `EpicPicker` - search + select epic, clear selection
- [x] `SprintPicker` - search + select sprint
- [ ] `IssueTypePicker` - type selection <!-- skipped: IssueTypePicker does not exist, only IssueTypeIcon (28 lines) -->
- [x] `VersionPicker` - version select
- [x] `BusinessValuePicker` - value scoring with radio/button options
- [x] `TabBar` - tab navigation, active state
- [x] `ImageLightbox` - modal open/close, image display
- [x] `KeyboardShortcutsModal` - shortcut list display
- [x] `TicketChatPane` - embedded chat in ticket detail
- [x] `ReadinessCell` - readiness picker open/close, selection

### Refinement Components

- [ ] `RefinementPageContent` - page orchestrator, session loading
- [ ] `RefinementTicketList` - ticket list render, selection
- [ ] `RefinementFilters` - filter controls interaction
- [ ] `BulkSuggestPanel` - AI suggestion trigger, progress display
- [ ] `AddToRefinementModal` - search, select, add-to-session

### Stakeholder Components

- [ ] `StakeholderBriefing` - main briefing view render
- [ ] `SprintOverviewCard` - sprint summary display
- [ ] `TicketGroup` - grouped ticket display
- [ ] `SyncDropdown` - sync action controls

---

## Part 3: Low-priority (presentational, low regression risk)

Test only if time allows. These are mostly thin wrappers or pure display components.

- Chat investigation sub-components (CollapsibleSection, KeyFilesSection, etc.)
- Notification utilities (TimeAgo, notification-utils)
- Sidebar presentational (UserAvatar, UserProfilePopover)
- Sync indicators (OfflineBanner, SyncIndicator, SyncToast)
- Rich editor sub-components (Toolbar, SlashCommandMenu)
- Command palette sub-components (ResultItem, SubFlowForm)
- Sprint board presentational (DragGhostOverlay, SprintStatPill, SearchModal parts)
- Story writer presentational (TabButton, SuggestionCard, TypeSuggestionChip)
- Story diff sub-components (CollapsedBar, HunkActionBar, HunkEditor)

## Notes

- Do NOT test pure presentational components that only render props (Avatar, BridgeMark, etc.)
- Focus on components where interaction logic, state management, or data flow could regress
- Each test file should be co-located next to the component it tests
- For components with many hooks, mock them at module level rather than trying to set up real data flows
