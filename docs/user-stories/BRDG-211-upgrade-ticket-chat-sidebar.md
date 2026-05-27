# BRDG-211: Upgrade Ticket Chat Sidebar

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the ticket chat sidebar to look and behave like the StoryWriter chat so that I get a consistent, polished chat experience everywhere in the app.

Currently the ticket chat sidebar (`TicketChatPane`) is a fixed 320px panel with minimal styling. It should be upgraded to match the StoryWriter chat quality and reuse its components where possible.

## Requirements

### 1. Reuse StoryWriter chat styling and components

- Match the StoryWriter chat look and feel: same bubble styling, spacing, typography, and markdown rendering
- Reuse `ChatBubble` and `ChatInput` with the same configuration as StoryWriter (resizable textarea, consistent sizing)
- Match streaming/progress indicator styling
- Keep the empty state illustration but align its visual style with StoryWriter

### 2. Resizable sidebar

- The chat sidebar should be horizontally resizable by dragging its left edge (same pattern as `TicketPreviewPanel`)
- Persist width in localStorage (key: `ticket-chat-width`)
- Default width: 400px, min: 320px, max: 600px
- Resize handle should show `col-resize` cursor with a subtle visual indicator on hover
- Smooth drag experience (no jitter, no text selection during drag)

### 3. "Open in Story Writer" button

- Add a button in the chat pane header to open the current ticket in Story Writer
- Uses the existing Story Writer navigation (same as the "Story writer" button in the ticket toolbar)
- Visually: small icon button (e.g. `ExternalLink` or `PenSquare` icon) next to the close button
- Tooltip: "Open in Story Writer"

## Out of scope

- Model switcher / codebase research toggle (StoryWriter-specific features)
- Quick action chips
- Token usage display
- Related stories inline display
- Multi-pane system

## Technical notes

- The resize pattern already exists in `TicketPreviewPanel` (`src/components/ticket-detail/TicketPreviewPanel.tsx`) and can be adapted
- The chat sidebar container lives in `src/app/(app)/tickets/[key]/page.tsx` (line ~963)
- `TicketChatPane` lives at `src/components/shared/TicketChatPane.tsx`
- StoryWriter chat reference: `src/components/story-writer/StoryWriterChat.tsx`

## Checklist

- [ ] Make chat sidebar horizontally resizable with drag handle on left edge
- [ ] Persist sidebar width in localStorage, respect min/max constraints
- [ ] Update ChatBubble usage to match StoryWriter styling (sizing, spacing, max-width)
- [ ] Update ChatInput to use resizable textarea matching StoryWriter config
- [ ] Align markdown rendering, streaming indicator, and empty state with StoryWriter look
- [ ] Add "Open in Story Writer" button in pane header
- [ ] Verify chat works correctly after changes (send, receive, scroll, streaming)
- [ ] All tests pass, build succeeds
