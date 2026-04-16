# BRDG-086: Story Writer — UX Polish

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want five small UX improvements in the Story Writer so I can read drafts faster, submit quick prompts in one click, keep the editor toolbar out of the way, navigate to the split target directly, and remove the redundant pane count control.

## Implementation Plan

1. **AC5 — Remove panes count selector** (`ApplicationListBar.tsx`, `PaneContext.tsx`): Delete the `PANE_COUNTS` constant, divider, and pane-count toggle buttons. Remove `setPaneCount` from context interface, function, and provider value.
2. **AC4 — "Open in Story Writer" link** (`StoryWriterLayout.tsx`): Add a `Link` to `/tickets/${targetTicketKey}/write` in the TARGET section of the `...` menu, gated by existing `targetTicketKey && splitModeVisible`.
3. **AC3 — Collapsible toolbar** (`RichEditor.tsx`, `EditorApp.tsx`): Add `hideToolbar?: boolean` prop to `RichEditor`. Add `toolbarVisible` state (default `false`) to `EditorApp` and a toggle button via `registerToolbar` actions.
4. **AC1 — Focus mode button** (`PaneContext.tsx`, `DraftPreviewApp.tsx`, `ChatApp.tsx`, `StoryWriterChat.tsx`, `ChatMessageParts.tsx`): Add `focusDraftPreview` to context that closes all panes and opens only draft-preview. Thread `onFocusDraft` callback down to `ChatMessage`. In `DraftPreviewApp`, apply `max-w-4xl mx-auto` when `paneCount === 1`.
5. **AC2 — Quick submit arrow** (`StoryWriterChat.tsx`): Replace `Button` with a split-button: label area inserts text, `ChevronRight` arrow submits immediately.

## Acceptance Criteria

### 1. Focus mode button on draft response card

- [x] Add a second icon button next to the existing "Open" button on the draft response card in chat (the card that shows "Draft updated")
- [x] Clicking this button opens the draft preview pane and closes all other panes (focus mode)
- [x] The draft preview pane in focus mode is centered with the same max-width as the ticket single view (not full-width)
- [x] The existing "Open" button behavior is unchanged (opens the preview alongside existing open panes)

### 2. Quick submit arrow on quick prompt buttons

- [x] Each quick prompt button gets a small `>` arrow icon embedded on its right side
- [x] Clicking the `>` arrow submits the prompt immediately without opening it in the chat input
- [x] Clicking the main label area of the button (anywhere except the `>`) inserts the prompt text into the chat input, allowing the user to edit it before sending (existing behavior)

### 3. Collapsible HTML toolbar in the editor

- [x] The HTML formatting toolbar in the editor pane is hidden by default
- [x] A toggle button is added to the editor title bar (the bar that shows "Editor" and the close `×` button)
- [x] Clicking the toggle shows or hides the toolbar
- [x] The toggle state is remembered for the session (not required to persist across page reloads)

### 4. "Open in Story Writer" for split target

- [x] In the split mode `...` context menu, add an "Open in Story Writer" link under the TARGET section (alongside the existing "Open in Jira" and "View in Bridge" items)
- [x] Clicking it navigates to the Story Writer for the target ticket (same as opening that ticket's story writer directly)
- [x] The item only appears when a split target exists

### 5. Remove panes count selector

- [x] Remove the "PANES 1 2 3" control from the story writer header bar
- [x] Remove all code that drives this control (state, handlers, layout branching based on pane count)
- [x] Pane count is now implicitly determined by which apps are open; no explicit selector needed
- [x] Verify that opening, closing, and dragging apps still works correctly after the refactor
- [x] No other layout or header behavior should change

## Technical Notes

- Draft response card: `src/components/story-writer/` — find the component that renders the "Draft updated" chat message bubble
- Quick prompt buttons: check `StoryWriterLayout.tsx` and related components
- Editor toolbar: check `EditorApp.tsx` and the TipTap or ProseMirror toolbar component
- Max-width for focus mode: match `max-w-3xl` (or whatever the ticket single view uses) and apply `mx-auto`
- Split mode context menu: check `SplitTargetApp.tsx` for the `...` menu implementation
