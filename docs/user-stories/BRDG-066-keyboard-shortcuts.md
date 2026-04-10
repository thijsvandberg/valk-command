# BRDG-066: Keyboard Shortcuts System

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want global keyboard shortcuts for navigation and common actions so I can use the app efficiently without touching the mouse.

## Acceptance Criteria

### Phase 1: Shortcut system
- [ ] Global keyboard event listener in the app layout
- [ ] Shortcut registry: map key combinations to actions
- [ ] Prevent shortcuts from firing when focused on text inputs/editors
- [ ] Support single keys (e.g., "/") and key combos (e.g., "Cmd+K")

### Phase 2: Navigation shortcuts
- [ ] `G then D` - Go to Dashboard
- [ ] `G then S` - Go to Sprint Board
- [ ] `G then C` - Go to Chat
- [ ] `G then R` - Go to Refinement
- [ ] `G then T` - Go to Test Center
- [ ] `G then A` - Go to Activity Log
- [ ] `G then W` - Go to Story Writer (Settings)

### Phase 3: Action shortcuts
- [ ] `/` - Focus search (open search modal)
- [ ] `N` - New conversation (on Chat page)
- [ ] `Escape` - Close side panel, modal, or search
- [ ] `J` / `K` - Navigate up/down in ticket list
- [ ] `Enter` - Open selected ticket
- [ ] `R` - Refresh / trigger sync (on Sprint Board)

### Phase 4: Help overlay
- [ ] `?` - Toggle keyboard shortcuts help overlay
- [ ] Grouped by category: Navigation, Actions, Sprint Board
- [ ] Show current page-specific shortcuts prominently
- [ ] Dismiss with Escape or clicking outside

## Technical Notes

- Use a custom hook `useKeyboardShortcuts` with event delegation on `document`
- Two-key sequences (G then D): track first keypress with a timeout (500ms window)
- Suppress shortcuts when `event.target` is an input, textarea, or contentEditable element
- Store shortcut definitions in a central registry for the help overlay to read

## Out of Scope (for now)
- Custom shortcut remapping
- Vim-style modal shortcuts
- Macro recording
- Gamepad/controller support
