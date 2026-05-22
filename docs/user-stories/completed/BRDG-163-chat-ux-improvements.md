# BRDG-163: Chat UX Improvements

**Status:** Done
**Priority:** High

## Description

As the PO, I want the chat interface to feel polished and consistent with the story writer, so that I have a unified, pleasant experience across all conversation types.

## Current Behavior

- Conversation titles are read-only; no way to rename after creation
- Conversation type filters (All / Chat / Task / etc.) are always visible, taking up space
- Conversation list items have heavy colored left borders that look cluttered
- The chat input is a bare textarea + button, while the story writer has a polished contained input with resize handle
- Message rendering code is duplicated between chat and story writer
- Creating a new conversation causes a visible loading flash

## Desired Behavior

### 1. Fix new conversation navigation flash
- [x] Eliminate the visible loading flash when creating a new conversation by using optimistic local state

### 2. Editable conversation title in header
- [x] Click the title in the header to enter inline edit mode
- [x] Enter or blur saves, Escape cancels
- [x] Subtle pencil icon on hover to indicate editability
- [x] Calls PATCH endpoint and refreshes conversation list

### 3. Filters behind toggle button
- [x] Hide conversation type filters behind a filter icon button in the sidebar header
- [x] Show a small dot indicator when filters are active
- [x] Clicking the button toggles filter bar visibility

### 4. Cleaner conversation list design
- [x] Remove heavy colored left borders from list items
- [x] Use colored category icon as sole type indicator
- [x] Active item gets a subtle brand-colored left accent
- [x] Better spacing and refined hover states

### 5. Unified ChatInput component
- [x] Create shared ChatInput component used by regular chat and investigation chat
- [x] Contained visual style (rounded container) as default
- [x] Optional feature slots for model switcher, codebase toggle, quick actions, etc.
- [x] Optional resize handle

### 6. Unified ChatMessage component
- [x] Create shared ChatBubble component for message bubble styling
- [x] Used by regular chat MessageList for consistent bubble rendering
- [x] Shared timestamp formatting extracted to `src/lib/format-timestamp.ts`
- [x] Extension slots for context-specific features (copy actions, draft cards, etc.)

## Technical Notes

- PATCH `/api/conversations/[id]` already supports title updates
- `useConversations` hook already has optimistic creation
- Story writer's `StoryWriterChat.tsx` has the target input design
- `ChatMessageParts.tsx` has the richer message rendering to align with

## Acceptance Criteria

- [x] All 6 improvements implemented and tested
- [x] `npm run typecheck && npm run lint && npm run test && npm run build` pass
- [x] No regressions in existing chat or story writer functionality
