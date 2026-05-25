# BRDG-168: Pin Conversations Discoverability

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want an obvious, visible way to pin and unpin conversations so I don't have to discover the right-click context menu to use this feature.

BRDG-155 added pin/unpin functionality via a right-click context menu on conversation items. This is not discoverable enough: most users won't try right-clicking, and there's no visual hint that pinning exists.

## Current Behavior

- Pinning only available via right-click context menu on a conversation item
- No visible pin/unpin affordance on hover or in the conversation row
- No indication in the UI that pinning is possible until you right-click

## Desired Behavior

### Visible pin action on hover
- [ ] Show a pin/unpin icon button on each conversation row on hover (next to the existing delete button)
- [ ] Pinned conversations show a subtle always-visible pin indicator in the row
- [ ] Pin button calls the existing `onTogglePin` handler (no backend changes needed)

### Three-dot overflow menu (alternative to context menu)
- [ ] Add a three-dot menu button on hover for each conversation row
- [ ] Menu contains: "Pin conversation" / "Unpin conversation" and "Delete conversation"
- [ ] This replaces the standalone delete button and context menu with a single overflow menu
- [ ] Keep the right-click context menu as a secondary access path

### Empty state hint
- [ ] When no conversations are pinned, show a subtle hint text below the search: "Right-click or use the menu to pin conversations"
- [ ] Hint disappears once at least one conversation is pinned

## Technical Notes

- The backend (PATCH `/api/conversations/[id]` with `pinned` field) and pin state in the DB already exist from BRDG-155
- The `onTogglePin` prop is already wired through from `ChatLayout` to `ConversationList`
- Only the conversation row UI in `ConversationList.tsx` needs to change
- Consider moving delete + pin into a shared overflow menu component

## Key Files
- `src/components/chat/ConversationList.tsx` (conversation row rendering)
- `src/components/chat/ChatLayout.tsx` (already has `handleTogglePin`)

## Related
- BRDG-155 (Conversation List UX Improvements) - parent feature that added pinning
