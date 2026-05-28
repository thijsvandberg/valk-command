# BRDG-216: Extract useOutsideClick and useKeyboardNav Hooks

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

Several components reimplement click-outside detection and keyboard navigation (ArrowUp/Down, Home/End, Escape) instead of using shared hooks. Extracting these two patterns removes duplicated logic from 5+ files and makes future dropdowns/popovers simpler to build.

### Affected Components

| Component | Lines | Duplicated Logic |
|-----------|-------|-----------------|
| `NotificationBell.tsx` | 547 | Click-outside, positioning, Escape |
| `UserProfilePopover.tsx` | ~240 | Click-outside, keyboard nav (ArrowUp/Down/Home/End), positioning |
| `TicketStatusPill.tsx` | 737 | Two inline dropdown sub-components, each with click-outside + keyboard |
| `ConversationList.tsx` | - | Click-outside for context menu |

### Hooks to Extract

**`useOutsideClick(refs, onClose, enabled)`**
Attaches mousedown listener, checks if click target is outside all provided refs, calls onClose.

**`useKeyboardNav(items, onSelect, options?)`**
Handles ArrowUp/Down/Home/End/Escape for navigating a list. Returns `{ activeIndex, handlers }`.

## Implementation Plan

1. **Create `useOutsideClick` hook** (`src/hooks/useOutsideClick.ts`)
   - Accepts single ref or array of refs, `onClose` callback, and options (`enabled`, `escapeClose`)
   - Attaches `mousedown` listener on document, checks if click target is outside all refs
   - Optionally handles Escape key (`escapeClose` defaults to `true` to match 6/8 current consumers)
   - Replaces the existing `useClickOutside` in `Popover.tsx` (single-ref only, no Escape)

2. **Create `useKeyboardNav` hook** (`src/hooks/useKeyboardNav.ts`)
   - Manages `activeIndex` state, handles ArrowUp/Down/Home/End/Enter/Escape
   - Skips disabled indices, supports loop wrapping
   - Returns `{ activeIndex, setActiveIndex, handlers: { onKeyDown } }`
   - Only `UserProfilePopover.tsx` currently uses this pattern; hook is also for future use

3. **Write tests** for both hooks

4. **Migrate components** (in order of duplication removed):
   - `TicketStatusPill.tsx`: 4 identical click-outside+escape patterns (highest value)
   - `NotificationBell.tsx`: 2-ref click-outside (keep resize listener separate)
   - `UserProfilePopover.tsx`: click-outside + escape + keyboard nav (uses both hooks)
   - `ConversationList.tsx`: context menu click-outside (uses `click`/`contextmenu` events, migrate to `mousedown`)

5. **Update `Popover.tsx`**: Replace local `useClickOutside` with import from new hook

## Checklist

- [x] Implement `useOutsideClick` hook in `src/hooks/useOutsideClick.ts`
- [x] Implement `useKeyboardNav` hook in `src/hooks/useKeyboardNav.ts`
- [x] Write tests for both hooks
- [x] Migrate `NotificationBell.tsx` to use both hooks
- [x] Migrate `UserProfilePopover.tsx` to use both hooks
- [x] Migrate `TicketStatusPill.tsx` dropdowns to use both hooks
- [x] Migrate `ConversationList.tsx` context menu to use `useOutsideClick`
- [ ] All existing tests pass
