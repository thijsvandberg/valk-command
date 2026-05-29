# BRDG-224: Link Editor Popover

**Status:** Done
**Priority:** Medium
**Type:** Enhancement

## Description

The rich editor currently uses a native `window.prompt()` dialog for inserting and editing links. This only accepts a URL and provides no way to set display text separately. Replace it with a custom inline popover that supports both URL and display text, plus a floating toolbar on existing links for quick actions.

## User Story

As a PO editing story descriptions, I want a proper link editor (like Jira's) so that I can set both the URL and display text, and quickly edit or remove existing links without re-entering everything.

## Requirements

### Link insertion popover (new link or editing existing)

- When the user clicks the link toolbar button (or uses the keyboard shortcut), open an inline popover anchored below the toolbar button or near the cursor
- Two input fields:
  - **URL** (required): pre-filled with `https://` for new links, or the existing href when editing
  - **Display text** (optional): pre-filled with the selected text (new link) or the current link text (editing). If left empty, the URL is used as the display text
- A **clear button** (X icon) inside the URL field to quickly empty it
- **Apply** button (primary) and **Cancel** button (secondary), or simply press Enter to apply
- Same protocol validation as today: only `http:`, `https:`, `mailto:` allowed
- When applying: insert/update the link mark on the selected text. If display text was changed, also replace the text content
- Pressing Escape or clicking outside the popover cancels and returns focus to the editor

### Floating link toolbar (on existing links)

- When the cursor is inside or the user clicks on an existing link, show a small floating toolbar near/below the link
- Actions (icon buttons with tooltips):
  - **Edit** (pencil icon): opens the link insertion popover pre-filled with current URL and text
  - **Unlink** (broken chain icon): removes the link mark, keeps the text
  - **Open in new tab** (external link icon): opens the URL in a new browser tab
  - **Copy URL** (clipboard icon): copies the href to clipboard
- The floating toolbar dismisses when the cursor moves outside the link or the user presses Escape
- Should not block content: position below the link, or above if near the bottom of the editor

### Keyboard support

- `Cmd+K` / `Ctrl+K` should open the link popover (same as the toolbar button)
- Tab between URL and Display text fields within the popover
- Enter to apply, Escape to cancel

### Components affected

- `LinkButton` in `src/components/rich-editor/Toolbar.tsx`: replace `window.prompt()` with popover trigger
- New: `LinkPopover` component (inline popover with URL + display text fields)
- New: `LinkFloatingToolbar` component (floating action bar on existing links)
- `RichEditor.tsx`: may need to register the floating toolbar as a TipTap plugin or use `BubbleMenu`

## Design Notes

- Use TipTap's `BubbleMenu` component for the floating toolbar on existing links (it handles positioning automatically)
- The link insertion popover can use a Radix/headless popover or a simple absolutely-positioned div anchored to the toolbar button
- Style both elements to match the existing editor toolbar aesthetic (same background, border radius, shadow tokens)
- Input fields should match the app's form styling
- Keep animations to `transform` and `opacity` only

## Out of Scope

- Link previews / unfurling (fetching page titles or thumbnails)
- Search for internal links (e.g. searching for other tickets)
- Link type selection (web link, email, etc. as separate modes)
- Drag-and-drop link reordering

## Implementation Plan

1. **Create `LinkPopover.tsx`** -- standalone popover with URL + display text fields, protocol validation, outside-click/Escape dismissal. Follows the ExpandButton pattern for styling and interactions.
2. **Modify `Toolbar.tsx`** -- convert `LinkButton` from `window.prompt()` to dropdown-style component that renders `LinkPopover`. Uses same `useState`/`useRef` pattern as ColorButton.
3. **Extend Link in `RichEditor.tsx`** -- add `Mod-k` keyboard shortcut via `Link.extend({ addKeyboardShortcuts })`, emitting a custom `openLinkPopover` editor event. `LinkButton` listens for this event.
4. **Create `LinkFloatingToolbar.tsx`** -- BubbleMenu-based floating toolbar with edit/unlink/open/copy buttons. Edit triggers the toolbar's `LinkPopover` via editor event. Shows when cursor is inside a link.
5. **Mount floating toolbar in `RichEditor.tsx`** -- render `<LinkFloatingToolbar>` alongside `<SlashCommandMenu>`.
6. **Tests** -- `LinkPopover.test.tsx` and `LinkFloatingToolbar.test.tsx` with mocked editor.

**Key decisions:**
- `Cmd+K` always opens the toolbar-anchored popover (not a cursor-positioned one) for simplicity
- When cursor is collapsed with no selection, display text defaults to the URL
- Floating toolbar's "edit" button opens the same popover via shared editor event
- Copy URL shows brief checkmark feedback (1.5s icon swap)

## Checklist

- [x] Create `LinkPopover` component with URL + display text fields, apply/cancel buttons
- [x] Create `LinkFloatingToolbar` component using TipTap `BubbleMenu` (edit, unlink, open, copy)
- [x] Replace `window.prompt()` in `LinkButton` with `LinkPopover` trigger
- [x] Wire up `Cmd+K` / `Ctrl+K` keyboard shortcut to open the link popover
- [x] Handle display text updates (replace text content when display text field is changed)
- [x] Protocol validation (http, https, mailto only)
- [x] Ensure popover dismisses on Escape, outside click, and after apply
- [x] Style both components to match existing editor toolbar tokens
- [x] Tests for LinkPopover (open, fill, apply, cancel, validation)
- [x] Tests for LinkFloatingToolbar (edit, unlink, open, copy actions)
- [x] Manual test: insert new link, edit existing link, unlink, copy URL
