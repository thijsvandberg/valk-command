# BRDG-137: Ticket Sidebar Redesign

**Status:** In Progress
**Priority:** Medium
**Depends on:** -

## Description

As a Product Owner, I want the ticket detail sidebar to be visually polished and have better UX, so I can quickly scan and manage ticket metadata without unnecessary clutter or confusion.

The current sidebar (`TicketSidebar.tsx`) has several UX issues:
- **PO Metadata box feels disconnected**: Readiness and Business Value are wrapped in a separate "PO Metadata" card, but they are core ticket properties that belong inline with the rest of the sidebar content
- **Notes vs PO Comments confusion**: "Notes" inside the PO Metadata box looks like a duplicate of the PO Comments thread on the detail page, but they serve different purposes (see Design Decisions below)
- **Empty sections take up space**: Confluence and Development sections show placeholder text ("No pages linked yet", "No development activity...") even when empty, wasting vertical space
- **Collapse button is minimal**: The sidebar collapse/expand toggle (small `>` circle on the left edge) is hard to discover and looks disconnected from the sidebar
- **No resize capability**: The sidebar has a fixed 320px width with no way to resize it
- **Visual polish**: The sidebar could benefit from better spacing, typography hierarchy, and visual grouping

## Design Decisions

### Notes vs PO Comments: keep both, reframe Notes

Notes (`poNotes` in `ticketMetadata`) and PO Comments (`poComment` table) are separate concepts in the data model:
- **Notes** = single text field, quick personal annotation, edited in-place (max 5,000 chars)
- **PO Comments** = threaded conversation with author + timestamp per entry (max 10,000 chars each)

**Decision:** Keep both, but reframe Notes as **"PO Note"** (singular). Position it as a sticky, always-visible short annotation near the top of the sidebar (near Readiness/BV), not buried in a card. Think of it as a Post-it on the ticket: "Blocked on API contract" or "Discuss scope in refinement". The PO Comments section stays as the threaded discussion log on the detail page. This makes Notes feel like metadata (which it is) rather than a mini-comments box.

### Collapse button: header toggle + double-click edge

**Decision:** Place a visible collapse/expand icon button in the sidebar header (primary affordance). Additionally, support double-click on the resize edge as a power-user shortcut to collapse/expand (like macOS Finder column resize). This gives both discoverability for new users and efficiency for power users. Remove the floating circle button.

## Implementation Plan

**Order of execution:**

1. **P1: Resize infrastructure** (steps 3-4) - Add drag-to-resize with min/max constraints. Uses `getBoundingClientRect()` for accurate width calculation. Persist via localStorage.
2. **P1: Structure refactor** (steps 1-2) - Remove PO Metadata card, inline Readiness/BV as DetailRows, reframe Notes as "PO Note" positioned after BV.
3. **P3: Collapse UX** (steps 8-11) - Remove floating circle, add header bar with collapse toggle, thin collapsed strip (36px) with expand icon, double-click resize edge, smooth width+opacity transitions.
4. **P3: Keyboard shortcut** (step 12) - `[` key toggles sidebar (guarded against input focus).
5. **P2: Empty state handling** (steps 5-7) - Confluence/Dev sections collapse when empty, show count always, global per-section localStorage preference.
6. **P4: Visual polish** (steps 13-17) - Spacing tokens, section dividers, abbreviated readiness labels, quality score pill, relative timestamps with hover.

**Design decisions for gaps:**
- Collapsed sidebar shows 36px strip with expand icon (option A)
- Resize uses `getBoundingClientRect()` (not `innerWidth`)
- Section collapse is global preference per section type (not per-ticket)
- Keep width-based animation + add opacity on content wrapper
- Extract shared `relativeDate` to `src/lib/date-utils.ts`

**Files touched:**
- `src/components/ticket-detail/TicketSidebar.tsx` (primary)
- `src/components/ticket-detail/ConfluencePagesSection.tsx` (empty state)
- `src/components/ticket-detail/DevPanel.tsx` (empty state)
- `src/lib/date-utils.ts` (new, shared utility)
- `src/lib/keyboard-shortcuts.ts` (add shortcut entry)

## Acceptance Criteria

### Phase 1: Structure and Layout

- [x] Remove the "PO Metadata" card/box. Integrate Readiness and Business Value as regular sidebar fields (same style as Status, Points, Sprint, etc.)
- [x] Reframe "Notes" as "PO Note" (singular). Move it out of the PO Metadata card and position it as a compact, always-visible annotation field near the top of the sidebar (after Readiness/BV fields). Keep it as a simple inline textarea, visually distinct from the threaded PO Comments
- [x] Make the sidebar resizable by dragging the left edge (like the sprint board SidePanel already supports). Persist width in localStorage
- [x] Set a sensible min-width (280px) and max-width (50% of viewport)

### Phase 2: Empty State Handling

- [x] Confluence section: when no pages are linked, collapse by default. Show a subtle collapsed header with "Confluence (0)" or similar indicator. Expandable on click to reveal the "Link Confluence page" action
- [x] Development section: when no activity exists, collapse by default. Show a subtle collapsed header with "Development (0)". Expandable on click
- [x] When sections have content, show them expanded by default with a count indicator

### Phase 3: Collapse/Expand UX

- [x] Remove the floating circle `>` button
- [x] Add a collapse/expand icon button in the sidebar header (top-right area, next to other action buttons)
- [x] Support double-click on the resize edge to toggle collapse/expand (power-user shortcut)
- [x] Smooth transition animation for collapse/expand (transform + opacity only)
- [x] Keyboard shortcut support (e.g., `[` to toggle sidebar)

### Phase 4: Visual Polish

- [x] Improve spacing and visual hierarchy between sections (use consistent spacing tokens)
- [x] Better section headers (subtle dividers or grouped backgrounds instead of heavy labels)
- [x] Readiness bar: ensure segments are clearly labeled even at narrow widths (no truncated "Descript...")
- [x] Quality score: align styling with the rest of the details (currently says "Run review" as a link, make this more intentional)
- [x] Timestamps (Created/Updated): use relative time ("2 hours ago") with full date on hover

## Technical Notes

- The sprint board `SidePanel.tsx` already has drag-to-resize logic with localStorage persistence. Reuse this pattern for `TicketSidebar.tsx`
- The sidebar currently uses `w-80` (320px) fixed. Replace with dynamic width via CSS variable or inline style
- Empty state collapsing should remember user preference per-section (localStorage)
- Readiness and Business Value components (`ReadinessSelector`, `BusinessValuePicker`) can be extracted from the PO Metadata card and rendered inline without wrapper
- Keep the Completeness indicator (READINESS bar at top) as-is since it provides useful at-a-glance progress
- The `poNotes` field and API endpoint (`/api/tickets/[key]/metadata`) remain unchanged. Only the UI label and positioning change

## Additional Changes (post-review feedback)

- Collapsed sidebar is now fully hidden (returns null), with an expand button in the page header
- Sprint picker: clickable sprint name opens dropdown to move ticket to another sprint (uses existing `jira.moveSprint` API)
- Readiness row shows label text (e.g. "Drafting") alongside the icon picker
- Styled tooltips on Created/Updated dates (using Tooltip component instead of native title)
- Shared `relativeDate` utility extracted to `src/lib/date-utils.ts`
- SprintPicker component created at `src/components/shared/SprintPicker.tsx`
- Assignee picker deferred: requires new Jira API endpoint for user assignment (separate story needed)
