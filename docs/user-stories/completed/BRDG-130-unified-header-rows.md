# BRDG-130: Unified Header Rows

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want all horizontal header bars (tab bars, filter bars, toolbars, stat bars) to follow a single consistent design system so the UI feels cohesive instead of stitched together from different patterns.

## Problem

The app has at least 8 distinct header bar patterns, each with its own height, padding, font size, border treatment, and background color. This creates a visually fragmented experience where every view feels slightly different.

### Current inventory

| Bar | Location | Height | H-Padding | Border | BG |
|-----|----------|--------|-----------|--------|----|
| Sprint tab bar | `SprintSlots.tsx` | h-[50px] | px-3.5 | border-border-default | transparent |
| Sprint filter bar | `FilterBar.tsx` | h-[50px] | px-5 | border-border-default | transparent |
| Sprint summary bar | `GroupStatBar.tsx` | implicit | gap-2 | none | transparent |
| Ticket column headers | `TicketTable.tsx` | implicit (py-2) | pr-3 | border-border-default | surface-base |
| Ticket detail tabs | `tickets/[key]/page.tsx` | h-[50px] | px-3.5 | border-border-default | transparent |
| App list bar | `ApplicationListBar.tsx` | h-9 (36px) | px-3 | border-border-default | surface-base |
| Pane toolbar | `AppToolbar.tsx` | h-[42px] | px-3 | border-border-default | surface-base |
| Chat sub-tabs | `ChatApp.tsx` | implicit (py-1) | px-2 | none | inline |
| Bulk action bar | `BulkActionBar.tsx` | implicit (py-2.5) | px-5 | border-t border-border-default | brand-600/8 |
| Pipeline filter bar | `pipelines/FilterBar.tsx` | implicit | varies | varies | transparent |

### Key inconsistencies

- **Heights**: 36px, 42px, 50px, and implicit (content-driven) all in use
- **Horizontal padding**: px-3, px-3.5, px-5 mixed across bars at the same nesting level
- **Text color**: inactive tabs use white/30 in some bars, white/35 in others; active uses white/70 or white/90
- **Border opacity**: border-border-default in most, but border-white/[0.06] and border-white/[0.09] elsewhere
- **Gap values**: gap-0.5, gap-1, gap-1.5, gap-2 with no clear rationale per bar type
- **Background**: some bars set bg-surface-base, some transparent, some inline

## Design Decision

**Standard bar height: 44px** (`h-11`). This applies to all bars, no tier system needed. 44px gives 6-8px breathing room around md buttons (28px) and search inputs (32px), while being noticeably tighter than the current 50px bars.

**Tab items** must be resized to fit within 44px. Current tab items use `py-3` (~48px effective height, taller than the bar itself). Reduce to `py-2` with `text-xs` to comfortably fit within 44px while keeping legible click targets.

## Implementation Plan

1. **Create shared primitives** (`src/components/shared/BarContainer.tsx`)
   - `BarContainer`: flex container, `h-11` (44px), `border-b border-border-default`, accepts `padding` ("default" = `px-4`, "compact" = `px-3`), `border` (boolean, default true), `borderPosition` ("bottom" | "top"), `className` escape hatch
   - `BarDivider`: `h-4 w-px shrink-0 bg-white/[0.08]`

2. **Update TabBar.tsx**
   - Wrap in `BarContainer` internally
   - Reduce tab item classes: `py-3 text-sm` -> `py-2 text-xs`
   - Standardize colors: active `text-white/90`, inactive `text-white/35`, hover `hover:text-white/60`

3. **Migrate bars** (each independent):
   - `SprintSlots.tsx`: `h-[50px]` -> BarContainer, tab buttons `py-3 text-sm` -> `py-2 text-xs`
   - `FilterBar.tsx`: `h-[50px]` -> BarContainer, dividers -> BarDivider
   - `GroupStatBar.tsx`: no wrapping (lives in table cell), parent `<tr>` gets `h-11`
   - `TicketTable.tsx` thead: `<tr>` gets `h-11`
   - `tickets/[key]/page.tsx`: inner div `h-[50px]` -> `h-11`
   - `ApplicationListBar.tsx`: `h-9` -> BarContainer compact
   - `AppToolbar.tsx`: `h-[42px]` -> `h-11`
   - `ChatApp.tsx`: no direct changes (toolbar rendered via AppToolbar)
   - `BulkActionBar.tsx`: `py-2.5` -> BarContainer with `borderPosition="top"`, dividers -> BarDivider
   - `pipelines/FilterBar.tsx`: N/A (exports inline filter components, no bar container)

4. **Polish sprint tab bar** (per user request): improve visual refinement

## Acceptance Criteria

### Phase 1: Define the bar token system

- [x] Set a single bar height of **44px** (`h-11`) as the standard for all header bars
- [x] Reduce tab item padding from `py-3` to `py-2` and font from `text-sm` to `text-xs` so tabs fit within the 44px bar
- [x] Standardize horizontal padding (pick one of px-3 or px-4, applied everywhere) <!-- px-4 default, px-3 compact for split panes -->
- [x] Standardize text color tokens for active, inactive, and hover states across all tab bars <!-- active: text-white/90, inactive: text-white/35, hover: text-white/60 -->
- [x] Standardize border-bottom treatment (single token, single opacity) <!-- border-b border-border-default -->
- [x] Document the chosen values in a comment block or design-tokens file <!-- BarContainer.tsx header comment -->

### Phase 2: Create shared bar primitives

- [x] Create a `BarContainer` component (or equivalent) that accepts a `tier` prop and applies the correct height, padding, border, and background
- [x] Ensure `TabBar.tsx` (already exists) uses the shared container and serves as the standard for all tab-style bars
- [x] Create a `BarDivider` component for vertical separators within bars (consistent height and opacity)

### Phase 3: Migrate existing bars

- [x] Sprint tab bar (`SprintSlots.tsx`) uses the shared bar container
- [x] Sprint filter bar (`FilterBar.tsx`) uses the shared bar container
- [x] Sprint summary bar (`GroupStatBar.tsx`) uses the shared bar container <!-- N/A: lives inside table <td>, no standalone bar to wrap -->
- [x] Ticket column headers (`TicketTable.tsx`) use the shared bar container or at minimum match the standardized height/padding <!-- h-11 on <tr> -->
- [x] Ticket detail tabs (`tickets/[key]/page.tsx`) uses the shared bar container
- [x] Application list bar (`ApplicationListBar.tsx`) uses the shared bar container
- [x] Pane toolbar (`AppToolbar.tsx`) uses the shared bar container <!-- h-11 directly, complex multi-pane layout -->
- [x] Chat sub-tabs (`ChatApp.tsx`) uses the shared bar container <!-- satisfied transitively via AppToolbar -->
- [x] Bulk action bar (`BulkActionBar.tsx`) uses the shared bar container
- [x] Pipeline filter bar (`pipelines/FilterBar.tsx`) uses the shared bar container <!-- N/A: exports inline filter components, no bar container -->

### Phase 4: Visual verification

- [x] All header bars across the app are exactly 44px tall
- [x] Tab items fit within the 44px bar without overflow or clipping
- [x] Active/inactive tab text colors are identical everywhere
- [x] Border-bottom lines align seamlessly when bars are stacked vertically
- [x] No visual regression in responsive/narrow layouts

## Technical Notes

- Key files to modify: `SprintSlots.tsx`, `FilterBar.tsx`, `GroupStatBar.tsx`, `TicketTable.tsx`, `tickets/[key]/page.tsx`, `ApplicationListBar.tsx`, `AppToolbar.tsx`, `ChatApp.tsx`, `BulkActionBar.tsx`, `pipelines/FilterBar.tsx`
- `TabBar.tsx` already provides a reusable tab pattern with active underline; extend this as the canonical tab bar implementation
- Single height simplifies the system: one `--bar-height: 44px` token or `h-11` everywhere
- Tab items: reduce `py-3 text-sm` to `py-2 text-xs` to fit within the 44px bar
- Vertical dividers within bars currently use different heights and opacities; standardize these too

## Out of Scope

- Changing the ViewHeader (top app navigation bar), which is a global chrome element with its own design
- Redesigning the content inside bars (filter dropdowns, stat pills, etc.)
- Changing functional behavior of any bar (sorting, filtering, DnD)
