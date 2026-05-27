# BRDG-208: Unified Child Issues Component

**Status:** Done
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want a single shared component for rendering child issue lists so that subtasks and epic children have a consistent look, feel, and feature set instead of being maintained as two separate 800+ line components.

Currently `SubtasksSection.tsx` (869 lines) and `EpicChildrenSection.tsx` (541 lines) implement nearly identical patterns independently:

| Feature | EpicChildren | Subtasks |
|---------|:---:|:---:|
| Status filter (All / To Do / In Progress / Done) | yes | yes |
| Field visibility toggles (FieldFilterPopover) | yes | partial (keys only) |
| Inline creation | yes (with type picker) | yes |
| Item row: icon + key + summary + status | yes | yes |
| Click to navigate / preview | yes | yes |
| Optimistic local additions | yes | yes |
| Pending placeholder row | yes | yes |
| Drag-and-drop reorder | no | yes |
| Inline rename | no | yes |
| Undo-able delete | no | yes |
| Link existing (search) | yes | no |
| AI suggestions panel | no | yes |
| Story points / sprint / subtask count columns | yes | no |

Despite different feature flags, the core list rendering, status filtering, header layout, and item row structure are duplicated.

## Goal

Extract a shared `ChildIssueList` base component that:

1. Renders the section header with count badge and filter popover
2. Implements status tab filtering (All / To Do / In Progress / Done) with counts
3. Renders item rows with configurable columns (icon, key, summary, metadata, status badge)
4. Handles field visibility toggles via FieldFilterPopover + useSectionVisibility
5. Provides slots/callbacks for section-specific features (creation row, search, AI suggestions, drag handles)

Then rewire both `SubtasksSection` and `EpicChildrenSection` to compose on top of this base.

## Subtask filter parity

Subtasks currently only toggle issue key visibility. After this refactoring, subtasks should support the same field visibility filter pattern as epic children. Available fields for subtasks:

- Issue key (toggle)
- Status badge (toggle)
- Assignee (toggle, if data available)

This brings the filter UX in line between both sections.

## Shared item row

Both sections should render items using a shared `ChildIssueRow` component:

- Issue type icon
- **Issue pill** (replaces plain issue key): clickable pill that links to Jira, styled consistently with our existing pill/badge patterns. This replaces the old "issue key" text + separate "open in Jira" button.
- Summary text (truncated)
- Configurable metadata slots (story points, sprint, subtask count for epics)
- Status badge (right-aligned)
- Optional drag handle (left side, subtasks only)

## Issue pill replaces issue key + external link

The current subtask rows show a plain text issue key on the left and a separate "open externally" icon button in a controls area on the right. Replace both with a single **issue pill**: a compact, clickable badge (like `VPL-45966`) that opens the Jira ticket in a new tab. This removes the need for the external link icon entirely.

## Subtask row controls cleanup

Current subtask rows show controls on the right side (status badge, delete icon, external link icon), causing empty whitespace when not hovered. New behavior:

- **Remove** the "open externally" button (replaced by the issue pill, see above)
- **Delete button**: only show on hover, styled like the AI suggestions decline action: text label "Delete" (not just an icon), with a destructive/red color. This replaces the current trash icon that is always allocated space.
- This removes the persistent empty space on the right side of each row.

## Approach

1. Extract a `ChildIssueRow` component for the individual item row
2. Extract a `ChildIssueListHeader` for the section header (title, count badge, filter popover)
3. Extract a `ChildIssueStatusFilter` for the tab bar (All / To Do / In Progress / Done with counts)
4. Create a `ChildIssueList` composite component that assembles header + filter + row list
5. Rewire `SubtasksSection` to use the shared components, keeping subtask-specific features (drag-and-drop, inline rename, undo delete, AI suggestions) as composition
6. Rewire `EpicChildrenSection` to use the shared components, keeping epic-specific features (type picker, link existing search, extra metadata columns) as composition
7. Bring subtask field filter up to parity with epic children

## Implementation Plan

### Phase 1: Extract shared primitives (can be done in parallel)

1. **`ChildIssueRow.tsx`** (new) - `forwardRef` row component accepting `Subtask | EpicChild`. Uses `TicketKeyPill` for issue key. Props: `item`, `isPending`, `showTypeIcon`, `showKey`, `onSelect`, inline edit props, `metadataSlot` (ReactNode), `actionsSlot` (ReactNode), `dragHandleSlot` (ReactNode), `style`. DnD stays in parent via ref forwarding.
2. **`ChildIssueStatusFilter.tsx`** (new) - Inline tab bar extracted from SubtasksSection lines 801-826.
3. **`ChildIssueListHeader.tsx`** (new) - Wraps SectionHeader + filter popover trigger pattern.

### Phase 2: Composite wrapper

4. **`ChildIssueList.tsx`** (new) - Thin shell: header + filter + bordered list wrapper + empty state + inline input slot. Does NOT own DnD, API calls, or section-specific logic.

### Phase 3: Migrate both sections

5. **`EpicChildrenSection.tsx`** (modify) - Replace row markup with `ChildIssueRow`, pass metadata columns as `metadataSlot`. Replace header with `ChildIssueListHeader`. ~541 lines -> ~350.
6. **`SubtasksSection.tsx`** (modify) - Thin `SortableSubtaskRow` wrapper calls `useSortable`, renders `ChildIssueRow` with ref + drag handle. Remove ExternalLink button (replaced by pill). Restyle delete as text "Delete" button. Switch `hideKeys` to `useSectionVisibility`. Replace inline filter tabs with `ChildIssueStatusFilter`. ~885 lines -> ~550.

### Phase 4: Tests + barrel exports

7. Update `index.ts`, create `ChildIssueRow.test.tsx`, `ChildIssueStatusFilter.test.tsx`, update `EpicChildrenSection.test.tsx`.

### DnD strategy
`ChildIssueRow` is `forwardRef`. The `useSortable` hook stays in SubtasksSection's `SortableSubtaskRow`. Transform/transition styles + drag handle passed as props. Same pattern as sprint board's `TicketRow`.

### TicketKeyPill integration
`ChildIssueRow` renders `<TicketKeyPill ticketKey={item.key} />` when `showKey` is true and item is not pending. This replaces both the plain text key and the "open externally" link.

## Checklist

- [x] Design the shared component API (props, slots, generics)
- [x] Extract `ChildIssueRow` with configurable columns/metadata slots
- [x] Implement issue pill (clickable badge linking to Jira) to replace plain issue key text
- [x] Extract `ChildIssueListHeader` (title, count, filter popover trigger)
- [x] Extract `ChildIssueStatusFilter` (tab bar with counts)
- [ ] Create `ChildIssueList` composite that assembles header + filter + rows <!-- skipped: both sections have too many behavioral differences (DnD, search, type picker) for a thin composite to add value; both use the three primitives directly instead -->
- [x] Migrate `EpicChildrenSection` to compose on `ChildIssueList`
- [x] Migrate `SubtasksSection` to compose on `ChildIssueList`
- [x] Remove "open externally" button from subtask rows (replaced by issue pill)
- [x] Restyle subtask delete: hover-only, text label "Delete" with destructive color (like AI suggestions decline)
- [x] Add field visibility toggles to subtasks (parity with epic children)
- [x] Verify all existing EpicChildrenSection features still work (create, link, search, field toggles)
- [x] Verify all existing SubtasksSection features still work (create, drag-and-drop, rename, delete, AI suggestions)
- [x] Update/migrate existing tests for both sections
- [x] All tests pass, lint clean, build succeeds

## Out of scope

- Adding new features to either section (e.g. drag-and-drop for epic children)
- Changing the data model or API routes
- Modifying the FieldFilterPopover component itself
