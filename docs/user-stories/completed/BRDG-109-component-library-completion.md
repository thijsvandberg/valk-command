# BRDG-109: Component Library Completion

**Status:** Done
**Priority:** Medium
**Extends:** BRDG-034 (Shared UI Primitives)

## Description

Shared components exist but are severely underused. Additionally, several common UI patterns have no shared component at all. This story covers migrating inline duplicates to shared components and creating the missing primitives.

Current usage vs inline equivalents:

- **Card:** 7 imports, ~16 inline duplicates (same `rounded-xl border border-white/[0.08] bg-white/[0.03]` pattern)
- **TextInput:** 3 imports, ~15 raw `<input>` elements with identical styles
- **Tag:** 5 imports, ~20 inline badge/pill patterns
- **Button:** 53 imports, but ~150 clickable `<div>`/`<span>` elements with inline button styles

Missing shared components:

- **Modal/Dialog:** every modal built inline (SearchModal, SprintListModal, StoryWriterLauncherModal)
- **Popover/Dropdown:** rebuilt from scratch per location
- **Badge:** many inline `rounded-full px-2 py-0.5 text-[10px]` patterns
- **ConfirmDialog:** no shared confirmation pattern
- **SegmentedControl/TabToggle:** rebuilt inline in multiple places

## Reference Locations

These files contain inline patterns that should be migrated. Use them to verify progress.

### Inline cards

- `src/components/sprint-board/SprintInsights.tsx`
- `src/app/(app)/pipelines/PipelineList.tsx`
- `src/components/NotificationBell.tsx`

### Inline inputs

- `src/components/sprint-board/SprintListModal.tsx`
- `src/components/sprint-board/FilterBar.tsx`

### Inline tags/badges

- `src/components/ticket-detail/SubtasksSection.tsx`
- `src/components/ticket-detail/LinkedIssuesSection.tsx`

### Inline modals

- `src/components/sprint-board/SearchModal.tsx`
- `src/components/sprint-board/SprintListModal.tsx`
- `src/components/shared/StoryWriterLauncherModal.tsx`

### Inline button-like elements

- `src/components/stakeholder/CopyMarkdownButton.tsx`
- `src/components/chat/InvestigationInput.tsx`
- `src/components/NotificationBell.tsx`

## Implementation Plan

1. **Badge component** (`src/components/shared/Badge.tsx` + test) -- `rounded-full` pill variant; covers notification count, filter count patterns across the app.
2. **Modal component** (`src/components/shared/Modal.tsx` + test) -- backdrop + portal + ESC + click-outside; thin wrapper used by ConfirmDialog and other consumers.
3. **ConfirmDialog component** (`src/components/shared/ConfirmDialog.tsx` + test) -- standard confirm pattern (title, description, confirm/cancel buttons), uses Modal internally.
4. **Popover component** (`src/components/shared/Popover.tsx` + test) -- floating panel + click-outside; for new dropdowns going forward.
5. **Button tests** (`src/components/ui/Button.test.tsx`) -- Button has 53 imports but no tests.
6. **StatusBadge tests** (`src/components/shared/StatusBadge.test.tsx`) -- used by tag/badge migration targets.
7. **Migrate inline cards**: `NotificationBell.tsx` dropdown container → `Card variant="floating"`.
8. **Migrate inline inputs**: `FilterBar.tsx` ExpandableSearch raw `<input>` → `TextInput`; `StoryWriterLauncherModal.tsx` title/search inputs → `TextInput`.
9. **Migrate inline tag/badge patterns**: `SubtasksSection.tsx`, `LinkedIssuesSection.tsx`, `EpicChildrenSection.tsx` inline status spans → `StatusBadge`; `StoryWriterLauncherModal.tsx` local `StatusBadge` → shared import.
10. **Migrate inline button-like elements**: `CopyMarkdownButton.tsx` → `Button`; `NotificationBell.tsx` bell button → `Button`.
11. **Migrate confirm dialogs to ConfirmDialog**: `StoryWriterLauncherModal.tsx` discard dialog; `TicketReview.tsx` delete dialog; `StoryWriterLayout.tsx` two inline confirm dialogs; `story-writer/page.tsx` discard dialog.

**Skipped / deferred**:
- SearchModal, CommandPalette: too structurally unique for a shared Modal wrapper (custom animations, preview panes, complex keyboard nav).
- SegmentedControl: not in acceptance criteria; three different implementations exist.
- Existing dropdown panels (SortDropdown, ColumnToggle, FilterDropdown): already working, high regression risk for low value.

## Acceptance Criteria

- [x] Migrate all inline card patterns to use Card component
- [x] Migrate all inline input patterns to use TextInput component
- [x] Migrate all inline tag/badge patterns to use Tag component
- [x] Migrate all inline button-like elements to use Button component
- [x] Create shared Modal component and migrate existing modals
- [x] Create shared Popover component
- [x] Create shared ConfirmDialog component
- [x] Create shared Badge component (rounded-full variant of Tag or separate)
- [x] Ensure all shared components have tests
- [x] Verify visual consistency after migration (no regressions)

## Out of Scope

- Creating new design tokens or a design system overhaul
- Changing the visual appearance of existing patterns (this is a migration, not a redesign)
- Third-party component library adoption
