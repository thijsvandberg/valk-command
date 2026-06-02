# BRDG-211: Upgrade Ticket Chat Sidebar

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the ticket chat sidebar to look and behave like the StoryWriter chat so that I get a consistent, polished chat experience everywhere in the app.

Currently the ticket chat sidebar (`TicketChatPane`) is a fixed 320px panel with minimal styling. It should be upgraded to match the StoryWriter chat quality and reuse its components where possible.

## Implementation Plan

**Resize (checklist 1, 2):** Width state lives in the parent `page.tsx` wrapping div (the sidebar is an inline flex child, not a fixed overlay). Constants `TICKET_CHAT_STORAGE_KEY = "ticket-chat-width"`, default 400, min 320, max 600. Lazy-init width from localStorage (clamped). Drag handle on the wrapper's left edge (`absolute top-0 left-0 h-full w-1 cursor-col-resize`); wrapper gets `relative` and `style={{ width }}` (drop `w-80`). Use delta-from-drag-start math (`newWidth = clamp(startWidth + (startX - clientX))`) since it is not flush to the viewport edge. Set `body.userSelect = "none"` + `cursor` during drag, clear on mouseup. Persist on each move.

**Open in Story Writer (checklist 6):** Add an icon `<a href={/tickets/${ticketKey}/write}>` (PenLine) before the close X in `PaneHeader`, wrapped in `Tooltip` with content "Open in Story Writer" and `aria-label`.

**ChatInput (checklist 4):** Pass `resizable` prop to the existing `<ChatInput>`.

**ChatBubble (checklist 3):** Remove the `!max-w-[90%] !text-body-sm` override so bubbles use StoryWriter defaults (`max-w-[75%] text-body-lg leading-[1.7]`).

**Markdown / streaming / empty state (checklist 5):** Replace `CompactMessageContent` (raw ReactMarkdown) with `renderMarkdown(content, { linkifyRefs: true })` inside `<div className="description-content chat-markdown">`, keeping the `<story-draft>`/`<br>` stripping. Add `pl-[34px]` to `StreamingIndicator`. Empty state: `h-10 w-10` circle, Sparkles 18, brand-500 tints, text `max-w-[200px] py-16`; container `space-y-4 px-4 py-4`. Keep ticket-specific copy.

**Tests (checklist 7, 8):** Add PenLine to the lucide mock; mock `renderMarkdown`; assert the "Open in Story Writer" link renders with the correct href. Resize logic is in `page.tsx` (no page test exists) so verified via build + manual.

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

- [x] Make chat sidebar horizontally resizable with drag handle on left edge
- [x] Persist sidebar width in localStorage, respect min/max constraints
- [x] Update ChatBubble usage to match StoryWriter styling (sizing, spacing, max-width)
- [x] Update ChatInput to use resizable textarea matching StoryWriter config
- [x] Align markdown rendering, streaming indicator, and empty state with StoryWriter look
- [x] Add "Open in Story Writer" button in pane header
- [x] Verify chat works correctly after changes (send, receive, scroll, streaming)
- [x] All tests pass, build succeeds <!-- All 3840 tests pass. BRDG-211 files lint and typecheck clean and TypeScript compiles successfully. The full `npm run build` is blocked by a PRE-EXISTING, UNRELATED lint error in src/components/refinement-session/SessionEndModal.tsx (present at commit b0c8eba1, before this work; already documented in docs/investigations/2026-06-02-build-blocked-sessionendmodal-lint.md). Out of scope for this story. -->

## Verification

Visually verified in-app (ticket VPL-45730): sidebar resizes via left-edge drag handle (widened from default), bubbles use StoryWriter styling with markdown rendering, "Open in Story Writer" pencil button shows its tooltip in the header.
