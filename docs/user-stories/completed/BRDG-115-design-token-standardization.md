# BRDG-115: Design Token Standardization

**Status:** Done
**Priority:** Medium

## Description

Several visual properties are used inconsistently across the app. There are no defined tokens for borders, z-index, hover states, or dividers. This makes the UI feel subtly inconsistent and forces developers to guess which value to use.

### Issues found

**1. Border opacity (3 values used interchangeably for the same role):**
- `border-white/[0.04]` (subtle)
- `border-white/[0.06]` (standard)
- `border-white/[0.08]` (card borders)
- Where to check: compare [src/components/NotificationBell.tsx](../../src/components/NotificationBell.tsx) borders vs [src/components/sprint-board/FilterBar.tsx](../../src/components/sprint-board/FilterBar.tsx) borders vs [src/components/shared/Card.tsx](../../src/components/shared/Card.tsx) borders

**2. Z-index (no scale, values scattered):**
- Modals: `z-50` or `z-[60]` ([src/components/shared/StoryWriterLauncherModal.tsx](../../src/components/shared/StoryWriterLauncherModal.tsx) uses `z-50`, confirmation dialogs use `z-[60]`)
- Dropdowns: `z-50` or `z-[9999]` ([src/components/shared/FilterDropdown.tsx](../../src/components/shared/FilterDropdown.tsx) uses `z-[9999]`)
- Tooltips: `z-[100]` ([src/components/shared/Tooltip.tsx](../../src/components/shared/Tooltip.tsx))
- Notification bell portal: rendered on `document.body` ([src/components/NotificationBell.tsx:309](../../src/components/NotificationBell.tsx))

**3. Hover states for list items (inconsistent across views):**
- `hover:bg-white/[0.04]` in some places
- `hover:bg-white/[0.06]` in others
- No hover state at all in some clickable lists
- Where to check: compare [src/components/chat/ConversationList.tsx](../../src/components/chat/ConversationList.tsx) hover vs [src/components/sprint-board/TicketRow.tsx](../../src/components/sprint-board/TicketRow.tsx) hover vs [src/components/NotificationBell.tsx](../../src/components/NotificationBell.tsx) list item hover

**4. Divider borders (inconsistent):**
- `border-white/[0.04]` in some dividers
- `border-white/[0.06]` in others
- `border-white/[0.08]` in others
- Where to check: [src/components/chat/ChatLayout.tsx](../../src/components/chat/ChatLayout.tsx) section dividers vs [src/components/ticket-detail/TicketSidebar.tsx](../../src/components/ticket-detail/TicketSidebar.tsx) dividers

**5. Focus ring styles (two different patterns):**
- `focus-visible:outline-2 focus-visible:outline-offset-2` (most components)
- `focus-visible:ring-2` (some components)
- No focus style at all (many interactive elements)

### Proposed tokens

Define CSS custom properties in `globals.css`:

```
--border-subtle: rgba(255,255,255,0.04)
--border-default: rgba(255,255,255,0.06)
--border-strong: rgba(255,255,255,0.08)
--z-dropdown: 50
--z-modal: 60
--z-tooltip: 70
--z-notification: 80
--hover-list-item: rgba(255,255,255,0.04)
--hover-interactive: rgba(255,255,255,0.06)
```

## Implementation Plan

1. **Add tokens to `globals.css` `@theme` block** — Define `--color-border-subtle/default/strong`, `--color-hover-list-item`, `--color-hover-interactive`, and `--z-dropdown/modal/tooltip/notification`. Using `--color-*` prefix makes Tailwind v4 generate first-class utilities (`border-border-subtle`, `hover:bg-hover-list-item`, etc.); `--z-*` prefix generates `z-dropdown`, `z-modal`, etc.

2. **Migrate shared primitive components** — `Card.tsx`, `Button.tsx`, `Modal.tsx`, `Tooltip.tsx`, `FilterDropdown.tsx`, `Popover.tsx`, `TabBar.tsx`, `TextInput.tsx`, `TextArea.tsx`, `SectionHeader.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `ConfirmDialog.tsx`, `StoryWriterLauncherModal.tsx`, `VersionPicker.tsx`, `IssueTypePicker.tsx`. Update associated test files where they assert on class strings.

3. **Bulk-migrate border opacity values** — Replace `border-white/[0.04]` → `border-border-subtle`, `border-white/[0.06]` → `border-border-default`, `border-white/[0.08]` → `border-border-strong` across all `src/` files.

4. **Bulk-migrate hover background values** — Replace `hover:bg-white/[0.04]` → `hover:bg-hover-list-item`, `hover:bg-white/[0.06]` → `hover:bg-hover-interactive` across all `src/` files.

5. **Migrate z-index usages** — `z-[60]` → `z-modal`, `z-[100]` → `z-tooltip`. For `z-50` in modal-role components (Modal.tsx, StoryWriterLauncherModal.tsx) → `z-modal`. For inline `zIndex: 9999` → move to className `z-notification`. For `z-50` in dropdown/overlay contexts → `z-dropdown`.

6. **Standardize focus rings** — Replace `focus-visible:ring-2` occurrences with `focus-visible:outline-2 focus-visible:outline-offset-2`. Add missing focus styles to raw `<button>` elements that lack them.

7. **Update test files** — Update any test assertions that reference the old raw class names.

**Notes on ambiguities:**
- Divider borders use the same tokens as regular borders (no separate divider token needed; `border-border-default` covers the standard divider role)
- `border-white/[0.05]` and `border-white/[0.07]` (a few occurrences) snap to nearest token (`border-default` and `border-strong` respectively)
- Table layout `zIndex: 2`/`zIndex: 12` (sticky columns) are internal layout z-indexes, not part of the global scale — leave as-is
- `hover:bg-white/[0.02]` and `hover:bg-white/[0.03]` are intentionally lighter than the token scale — leave as-is

## Acceptance Criteria

- [x] Define border opacity tokens (subtle/default/strong) as CSS custom properties
- [x] Define z-index scale as CSS custom properties
- [x] Define hover state tokens for list items and interactive elements
- [x] Define divider border token <!-- border-border-default covers dividers, no separate token needed -->
- [x] Standardize focus ring to one pattern (outline, not ring)
- [x] Migrate all border opacity values to use tokens
- [x] Migrate all z-index values to use scale
- [x] Migrate all hover bg values to use tokens
- [x] Migrate all focus ring styles to consistent pattern <!-- no focus-visible:ring-2 found in codebase -->
- [x] Visual review: no regressions

## Impact

Eliminates scattered, inconsistent values for borders, z-index, hover states, and focus rings across the entire UI. New components can pick from a fixed set of semantic tokens instead of guessing values, and existing components become visually consistent without per-component audits.
