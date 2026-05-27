# BRDG-201: Extract BasePicker Component

**Status:** Not Started
**Priority:** High
**Type:** Refactoring

## Description

As a developer, I want a shared `BasePicker` component (or `usePicker` hook) so that picker logic is centralized and new pickers can be built without duplicating portal, positioning, search, and keyboard handling code.

Currently there are 8 picker components in `src/components/shared/` that each reimplement:
- `useState` for open/closed state and search query
- `useRef` for trigger, popover, and search input elements
- `useEffect` for position calculation on open
- `useEffect` for click-outside detection and keydown (Escape) handling
- Portal rendering with absolute positioning
- Search/filter logic
- Item selection + onChange callback

Total duplicated code: ~1,966 lines across 8 pickers.

### Affected Files

| Picker | Lines | Notes |
|--------|-------|-------|
| `EpicPicker.tsx` | 489 | Also has SSE streaming for AI suggestions |
| `StoryPointPicker.tsx` | 348 | Grid layout variant |
| `AssigneePicker.tsx` | 273 | Avatar rendering |
| `VersionPicker.tsx` | 204 | Multi-select support |
| `BusinessValuePicker.tsx` | 189 | Simple value grid |
| `SprintPicker.tsx` | 183 | Sprint-specific filtering |
| `LabelPicker.tsx` | 177 | Color-coded labels |
| `IssueTypePicker.tsx` | 103 | Simplest picker |

Additionally, `SessionStoryPointPicker.tsx`, `SplitStoryPicker.tsx`, and `ConversationTypePicker.tsx` outside `shared/` follow the same pattern.

## Approach

**Compound component (`<BasePicker>`)** for maximum uniformity. All pickers share the same structure (trigger, popover, search, item list) with customizable slots for item rendering.

Phased rollout:
1. Build `BasePicker` component
2. Create a **picker showcase page** (`/dev/pickers`) that renders each picker side-by-side: current implementation (left) vs BasePicker version (right). This allows visual comparison and fine-tuning before replacing the originals.
3. Once approved per picker, swap the original for the BasePicker version.

## Implementation Plan

### Audit Summary

The 11 pickers fall into 4 categories:

**Category A -- Portal dropdown with search (4):** AssigneePicker, LabelPicker, SprintPicker, EpicPicker. Identical boilerplate: open/query/pos state, trigger/popover/search refs, updatePosition/handleOpen/handleClose callbacks, click-outside + Escape + scroll effects, createPortal.

**Category B -- Portal dropdown, grid layout, no search (2):** StoryPointPicker, BusinessValuePicker. Same portal/positioning/event pattern but grid buttons instead of searchable list.

**Category C -- Relative dropdown, no search (3):** IssueTypePicker, ConversationTypePicker, VersionPicker. containerRef with relative positioning, simpler click-outside.

**Category D -- NOT dropdown pickers (2):** SessionStoryPointPicker (inline expand/collapse), SplitStoryPicker (modal dialog). Excluded from migration.

### Component Design

**BasePicker compound component** (`src/components/shared/BasePicker.tsx`):
- `BasePicker.Root` -- context provider, manages open/close/query/position state
- `BasePicker.Trigger` -- button that toggles open/close
- `BasePicker.Popover` -- floating panel (portal or relative)
- `BasePicker.Search` -- optional search input row
- `BasePicker.List` -- scrollable item container
- `BasePicker.Item` -- standard item row with selected state
- `BasePicker.Empty` -- empty/loading message
- `BasePicker.Section` -- section header (for grouped items)

**`usePickerState` hook** -- exported separately for grid-layout pickers (StoryPointPicker, BusinessValuePicker) that need positioning/events but not the list structure.

### Key Decisions
- BasePicker does NOT own selection state; each picker manages its own value/onChange
- Multi-select (LabelPicker) works because BasePicker does not auto-close on item click
- SplitStoryPicker and SessionStoryPointPicker are excluded (not dropdown pickers)
- Only ConversationTypePicker migrates from the 3 feature-specific pickers

## Checklist

### Phase 1: Foundation
- [x] Audit all 11 picker implementations and document their shared vs unique logic
- [x] Build `BasePicker` compound component with: trigger slot, popover container, search input, item list, keyboard nav, portal, click-outside, Escape key
- [x] Write tests for `BasePicker`

### Phase 2: Showcase page
- [x] Create `/dev/pickers` page (dev-only route, excluded from production build)
- [x] Add before/after for `IssueTypePicker` (simplest, proof of concept)
- [x] Add before/after for `AssigneePicker` (avatar rendering)
- [x] Add before/after for `LabelPicker` (color-coded items)
- [x] Add before/after for `StoryPointPicker` (grid layout variant)
- [x] Add before/after for `EpicPicker` (complex: SSE streaming for AI suggestions)
- [x] Add before/after for remaining pickers (SprintPicker, BusinessValuePicker, VersionPicker)
- [x] Fine-tune BasePicker styling and behavior based on showcase review

### Phase 3: Migration
- [ ] Replace `IssueTypePicker` with BasePicker version
- [ ] Replace `AssigneePicker` with BasePicker version
- [ ] Replace `LabelPicker` with BasePicker version
- [ ] Replace `StoryPointPicker` with BasePicker version
- [ ] Replace `SprintPicker` with BasePicker version
- [ ] Replace `BusinessValuePicker` with BasePicker version
- [ ] Replace `VersionPicker` with BasePicker version
- [ ] Replace `EpicPicker` with BasePicker version
- [ ] Migrate 3 feature-specific pickers (SessionStoryPointPicker, SplitStoryPicker, ConversationTypePicker)
- [ ] All existing picker tests pass
- [ ] Remove `/dev/pickers` showcase page (or keep as living documentation)
