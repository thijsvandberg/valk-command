# BRDG-131: User Profile Menu

**Status:** Done
**Priority:** Medium

## Description

Replace the standalone logout icon at the bottom of the sidebar with a user profile menu. The current logout button is a bare icon that offers no context about who is signed in and no access to user-level actions. A profile popover anchored to a user avatar gives the PO a single entry point for account actions, preferences, and quick settings without cluttering the sidebar navigation.

The profile menu appears as a small avatar/icon at the bottom of the sidebar. Clicking it opens a popover with the user's name and email (sourced from Clerk), followed by grouped menu items.

---

## Implementation Plan

1. **Create `src/components/sidebar/UserAvatar.tsx`** -- Circular avatar button using Clerk `useUser()`. Shows profile image or initials. Displays first name when sidebar is expanded. Hover/focus/active states matching sidebar style.
2. **Create `src/components/sidebar/UserProfilePopover.tsx`** -- Portal-based popover anchored above trigger (bottom of sidebar). Uses `getBoundingClientRect()` for positioning (same pattern as FilterDropdown). Click-outside dismissal checks both trigger and popover refs. Escape key closes. Keyboard nav with arrow keys. Menu items: Theme (disabled/coming soon, no light mode CSS exists), Notification preferences, Keyboard shortcuts (dispatches Cmd+K), Settings, divider, Sign out.
3. **Modify `src/components/Sidebar.tsx`** -- Remove Settings from navItems, remove standalone sign-out button, add UserAvatar + UserProfilePopover in footer, add `useUser` import.
4. **Update `src/components/Sidebar.test.tsx`** -- Mock `useUser`, update nav item assertions (8 items, remove Settings href), add tests for profile menu open/close.
5. **Decisions**: Theme toggle rendered as disabled with "Coming soon" since no light mode CSS variables exist. Keyboard shortcuts item dispatches synthetic Cmd+K to open the existing command palette.

---

## Acceptance criteria

### Profile trigger
- [x] The standalone "Sign out" button at the bottom of the sidebar is removed
- [x] A user avatar button replaces it, showing the Clerk user's initials (or profile image if available)
- [x] In collapsed sidebar mode, only the avatar circle is visible; in expanded mode the user's first name appears next to it
- [x] The avatar has hover, focus-visible, and active states consistent with the rest of the sidebar

### Popover menu
- [x] Clicking the avatar opens a popover menu anchored above/beside it (direction adapts to available space)
- [x] The popover header shows: user avatar, full name, and email address (read from Clerk session)
- [x] The popover closes on outside click, Escape key, or selecting a menu item
- [x] The popover works correctly in both collapsed and expanded sidebar states

### Menu items
- [x] **Theme** toggle: switch between dark and light mode (persisted in localStorage). Icon indicates current theme. <!-- Rendered as disabled with "Coming soon" label: no light mode CSS variables exist yet -->
- [x] **Notification preferences**: navigates to `/settings/notifications`
- [x] **Keyboard shortcuts**: opens the existing command palette shortcut reference (or a dedicated shortcuts overlay)
- [x] **Settings**: navigates to `/settings`
- [x] Divider line
- [x] **Sign out**: triggers the existing Clerk sign-out flow (clear dev bypass cookie + `signOut()` + redirect to `/login`)

### Responsive behavior
- [x] On mobile (sidebar as overlay), the profile menu remains functional and the popover does not overflow the viewport
- [x] Menu items that navigate (Settings, Notification preferences) also close the mobile sidebar

### General
- [x] Remove the `Settings` entry from the main sidebar `navItems` array since it is now accessible via the profile menu
- [x] The Sync indicator and collapse toggle in the sidebar footer remain unchanged
- [x] All menu items have appropriate icons (lucide-react, consistent with the rest of the app)
- [x] Keyboard navigation works within the popover (arrow keys, Enter to select, Escape to close)

---

## Technical notes

- Clerk provides `useUser()` for name, email, and `imageUrl`; use `useClerk()` for `signOut()`
- Consider using Radix UI `Popover` or `DropdownMenu` primitive for accessible popover behavior (check if already in dependencies, otherwise a lightweight custom implementation is fine)
- Theme toggle state can use a `data-theme` attribute on `<html>` plus a localStorage key; CSS variables already exist for both modes if defined
- The existing sign-out logic in `Sidebar.tsx` (lines 210-224) moves into the menu's sign-out handler unchanged

---

## Out of scope

- Full user profile editing (name, avatar upload) -- Clerk hosted profile handles that
- Role-based menu items (single-user app)
- Nested sub-menus within the popover
