# BRDG-115: Design Token Standardization

**Status:** Open
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

## Acceptance Criteria

- [ ] Define border opacity tokens (subtle/default/strong) as CSS custom properties
- [ ] Define z-index scale as CSS custom properties
- [ ] Define hover state tokens for list items and interactive elements
- [ ] Define divider border token
- [ ] Standardize focus ring to one pattern (outline, not ring)
- [ ] Migrate all border opacity values to use tokens
- [ ] Migrate all z-index values to use scale
- [ ] Migrate all hover bg values to use tokens
- [ ] Migrate all focus ring styles to consistent pattern
- [ ] Visual review: no regressions

## Impact

Eliminates scattered, inconsistent values for borders, z-index, hover states, and focus rings across the entire UI. New components can pick from a fixed set of semantic tokens instead of guessing values, and existing components become visually consistent without per-component audits.
