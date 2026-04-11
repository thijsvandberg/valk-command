# BRDG-050: Story Writer Pane System

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a flexible pane layout in Story Writer where I can toggle between Chat, Editor, Diff, History, and Related Stories panels so I can customize my editing workspace.

## Core Concepts

- **Pane toggle bar**: Horizontal bar at the top with toggle buttons for each pane
- **Pane types**: Chat, Editor, Diff, History, Related Stories, Preview
- **Layout modes**: 1-pane (full width), 2-pane (split), 3-pane (triple split)
- **Resizable**: Drag dividers between panes to resize
- **Persistent**: Remember which panes were open and their sizes per session
- **Responsive**: On smaller screens, stack panes vertically or limit to 2

## Acceptance Criteria

### Phase 1: Pane toggle bar
- [ ] Horizontal toolbar at the top of the Story Writer layout with toggle buttons for each pane type
- [ ] Each toggle button shows the pane name and a relevant Lucide icon
- [ ] Active panes have a visually distinct pressed/active state
- [ ] At least one pane must always be active (prevent toggling off the last pane)
- [ ] Toggle bar is sticky and remains visible when scrolling within panes
- [ ] Pane count indicator shows how many panes are currently active

### Phase 2: 1-pane and 2-pane layouts
- [ ] Single pane takes full width of the content area
- [ ] Toggling a second pane splits the layout into a 50/50 side-by-side view
- [ ] Smooth CSS transition when switching between 1-pane and 2-pane
- [ ] Each pane renders its self-contained component (Chat, Editor, Diff, History, Related, Preview)
- [ ] Pane components receive the current story session context as props
- [ ] Toggling off a pane redistributes space to the remaining pane(s)

### Phase 3: 3-pane layout
- [ ] Toggling a third pane splits the layout into equal thirds
- [ ] Maximum of 3 visible panes at once (toggle bar disables additional toggles when 3 are active)
- [ ] Layout uses CSS Grid with `grid-template-columns` for clean distribution
- [ ] Panes maintain their content state when hidden and re-shown
- [ ] Smooth transition when adding or removing the third pane

### Phase 4: Resizable dividers
- [ ] Vertical drag handles between adjacent panes
- [ ] Dragging a handle resizes the panes on either side proportionally
- [ ] Minimum pane width of 280px to prevent unusable sizes
- [ ] Drag handle shows a visible grip indicator on hover
- [ ] Double-click a divider to reset panes to equal widths
- [ ] Resize uses pointer events (no external resize library)
- [ ] Cursor changes to `col-resize` when hovering over a divider

### Phase 5: Persistence
- [ ] Save active pane configuration (which panes are open) to localStorage
- [ ] Save pane widths to localStorage
- [ ] Configuration keyed per story session ID so different stories can have different layouts
- [ ] Restore layout on Story Writer load
- [ ] Fallback to default layout (Editor + Chat, 50/50) if no saved configuration exists
- [ ] Clear saved layout when a story session is deleted

### Phase 6: Responsive behavior
- [ ] Below 1024px viewport width, limit to maximum 2 panes
- [ ] Below 768px viewport width, limit to maximum 1 pane with a pane switcher
- [ ] On small screens, pane toggle bar becomes a dropdown or segmented control
- [ ] Pane dividers are hidden on single-pane mobile layout
- [ ] Vertical stacking option for 2-pane layout on narrow viewports

## Technical Notes

- Current Story Writer layout is a fixed linear arrangement in `StoryWriterLayout.tsx`
- Replace with a pane management system using CSS Grid
- Pane state stored in localStorage keyed by session ID
- Each pane is a self-contained component that receives the session context
- Resize handles use pointer events for cross-browser compatibility (no external library needed)
- Minimum pane width of 280px prevents content from becoming unreadable
- Consider memoizing pane components to avoid re-renders when resizing adjacent panes

## Out of Scope (for now)

- Custom pane order drag-and-drop (panes always appear in a fixed order)
- Pane presets/templates (e.g. "review mode", "writing mode")
- Floating/detached panes
- Pane tabs within a single pane slot
- Vertical split option (top/bottom instead of left/right)
