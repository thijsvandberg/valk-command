# BRDG-223: Focus Mode (Hide Navigation)

**Status:** In Progress
**Priority:** Medium
**Type:** Enhancement

## Description

When using the Story Writer (or other detail-heavy views) on a smaller screen, the top nav bar and sidebar consume significant screen real estate. A "Focus Mode" toggle should hide both navigation areas, giving the content area the full viewport.

## User Story

As a PO working in the Story Writer on a laptop screen, I want to hide all navigation with a single click so that the draft preview and chat panels get maximum space.

## Requirements

### Toggle button
- Add a focus mode toggle button in the top nav bar (ViewHeader area)
- Icon: a diagonal expand/arrows icon or similar that communicates "maximize content"
- Tooltip: "Focus mode" when nav is visible, "Exit focus mode" when nav is hidden
- The button itself must remain accessible when focus mode is active (it moves into a small floating position)

### Behavior
- When activated: hide the Sidebar (left icon nav) and the ViewHeader (top bar) simultaneously
- Show a small floating button (top-left or top-right corner) to exit focus mode
- The content area expands to fill the freed space
- Keyboard shortcut: `Cmd+.` (Mac) / `Ctrl+.` (Windows) to toggle
- Focus mode state persists within the session (survives page navigation) but resets on full page reload

### Scope
- Applies globally to all views, not just Story Writer
- The floating exit button should have minimal visual footprint (small, semi-transparent, visible on hover)

### Components affected
- `Sidebar` (`src/components/Sidebar.tsx`): needs to respect focus mode state
- App layout (`src/app/(app)/layout.tsx`): orchestrates hiding/showing both nav areas, hosts the `#view-header-portal`
- `ViewHeader` (`src/components/shared/ViewHeader.tsx`): contains the toggle button, hidden when focus mode is active
- New: floating exit button (overlay when focus mode is active)

## Design Notes

- Animate the transition: sidebar slides out left, header slides up, content expands smoothly
- Only animate `transform` and `opacity` (no `transition-all`)
- The floating exit button should use a layered, low-opacity shadow to stay subtle

## Out of Scope

- Persisting focus mode across browser sessions (localStorage)
- Per-view focus mode settings
- Auto-activating focus mode based on screen size

## Implementation Plan

1. Create `src/hooks/useFocusMode.ts` - pure state + keyboard shortcut logic (`Cmd+.` / `Ctrl+.`)
2. Create `src/hooks/useFocusMode.test.ts` - validate logic in isolation
3. Create `src/contexts/FocusModeContext.tsx` - thin context wrapper around the hook
4. Create `src/components/FocusModeWrapper.tsx` - client boundary that wraps layout internals, animates sidebar/header, renders floating exit button
5. Modify `src/app/(app)/layout.tsx` - delegate inner structure to FocusModeWrapper
6. Modify `src/components/shared/ViewHeader.tsx` - add focus mode toggle button in actions area
7. Modify `src/lib/keyboard-shortcuts.ts` - document the new shortcut

Architecture: FocusModeProvider wraps layout children (server component stays server). Sidebar wrapper uses `translate-x` + `opacity` for slide-out; header portal uses `translate-y` + `opacity` for slide-up. Content expands via flex layout. Floating exit button appears with opacity fade after slide-out completes.

## Checklist

- [x] Create `useFocusMode` hook with state + keyboard shortcut (`Cmd+.` / `Ctrl+.`)
- [x] Add focus mode toggle button to ViewHeader
- [x] Update app layout to conditionally hide Sidebar and ViewHeader portal based on focus mode
- [x] Build floating exit-focus-mode button (shown only when focus mode is active)
- [x] Animate sidebar slide-out and header slide-up transitions
- [x] Ensure content area expands to fill freed space
- [ ] Verify focus mode persists across client-side navigations
- [ ] Verify all views work correctly with nav hidden (no layout breakage)
- [x] Tests for useFocusMode hook
- [ ] Manual test on small viewport (laptop-sized screen)
