# BRDG-050: Story Writer Pane System

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a flexible 1-3 pane layout in Story Writer where I can toggle between Chat, Editor, Diff, History, and Related Stories so I can customize my editing workspace.

## Acceptance Criteria

### Phase 1: Pane layout system
- [ ] Replace current fixed Story Writer layout with a configurable pane system
- [ ] Support 1, 2, or 3 visible panes side-by-side
- [ ] Available pane types: Chat, Editor, Diff, History, Related Stories
- [ ] Pane toggle buttons in the Story Writer header

### Phase 2: Pane management
- [ ] Click a pane toggle to add/remove it from the visible layout
- [ ] Panes distribute available width equally (e.g., 2 panes = 50/50, 3 panes = 33/33/33)
- [ ] Resizable dividers between panes (drag to resize)
- [ ] Minimum pane width: 300px; if viewport too small, limit max visible panes

### Phase 3: Pane persistence
- [ ] Remember last pane configuration per session (stored in session or localStorage)
- [ ] Default layout: Chat + Editor (2 panes)
- [ ] Quick presets: "Write" (Chat + Editor), "Review" (Editor + Diff), "Research" (Chat + Related + Editor)

### Phase 4: Pane content
- [ ] Chat pane: existing story writer chat interface
- [ ] Editor pane: existing rich editor
- [ ] Diff pane: existing diff viewer
- [ ] History pane: version picker + content viewer (from ticket history)
- [ ] Related Stories pane: existing related stories panel

## Technical Notes

- Use CSS Grid or Flexbox for pane layout
- Resizable dividers: simple mouse drag handler, store widths as percentages
- Each pane is a lazy-loaded component (only mount when visible)
- Pane state in a React context to allow cross-pane communication (e.g., selecting a version in History shows it in Diff)

## Out of Scope (for now)
- Floating/detachable panes
- Tab groups within panes
- Pane presets saved to database
- Full-screen single-pane mode
