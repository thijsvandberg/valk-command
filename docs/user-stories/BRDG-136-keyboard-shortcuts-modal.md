# BRDG-136: Keyboard Shortcuts Modal

**Status:** DONE
**Priority:** Low
**Estimate:** S

## Problem

The "Keyboard shortcuts" button in the user profile popover (`UserProfilePopover.tsx`) currently dispatches a synthetic `Cmd+K` event, which opens the Command Palette (search dialog). This is misleading: the user expects to see an overview of available keyboard shortcuts, not a search box.

## Goal

Replace the current behavior so that clicking "Keyboard shortcuts" opens a dedicated modal listing all keyboard shortcuts available in Bridge.

## Current Shortcuts to Display

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Cmd+K` | Open Command Palette | Global |
| `Cmd+Shift+K` | Open Ticket Search | Global |
| `R` | Refresh pipelines | Pipelines page |
| `F` | Cycle status filter | Pipelines page |
| `S` | Toggle sprint filter | Pipelines page |
| `Esc` | Close dialog / palette | Dialogs |
| `Arrow Up/Down` | Navigate results | Command Palette |
| `Enter` | Open selected result | Command Palette |

> This table should be kept in sync as new shortcuts are added to Bridge.

## Implementation Plan

1. Create `src/lib/keyboard-shortcuts.ts` with typed shortcut data registry grouped by scope
2. Create `src/components/shared/KeyboardShortcutsModal.tsx` using the existing `Modal` component, self-contained with custom event listener (`valk:openKeyboardShortcuts`)
3. Mount `<KeyboardShortcutsModal />` in `src/app/(app)/layout.tsx`
4. Update `src/components/sidebar/UserProfilePopover.tsx` to dispatch `valk:openKeyboardShortcuts` instead of faking `Cmd+K`
5. Add "Keyboard Shortcuts" action to `src/components/command-palette/useCommandPalette.ts`

## Acceptance Criteria

- [x] Create a `KeyboardShortcutsModal` component that renders a categorized list of all shortcuts
- [x] Group shortcuts by scope (Global, Command Palette, Pipelines, etc.)
- [x] Display each shortcut with a styled keyboard key indicator (e.g. `<kbd>` style) and a description
- [x] Clicking "Keyboard shortcuts" in the user profile popover opens this modal instead of the Command Palette
- [x] Modal can be closed with `Esc` or clicking outside
- [x] The modal should also be openable via the Command Palette as an action (e.g. searching "keyboard shortcuts")
- [x] Visually consistent with other Bridge modals/dialogs

## Technical Notes

- The menu item lives in `src/components/sidebar/UserProfilePopover.tsx` (lines 94-110)
- Currently simulates `Cmd+K` via `window.dispatchEvent(new KeyboardEvent(...))`
- Replace the action with opening the new modal (e.g. via state or a context)
- Consider a centralized shortcuts registry so the modal content stays in sync with actual shortcuts automatically
