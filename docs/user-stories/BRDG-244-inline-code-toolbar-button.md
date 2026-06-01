# BRDG-244: Inline Code Button in Markdown Toolbar

**Status:** Not Started
**Priority:** Low
**Type:** Feature

## Description

As a Product Owner writing stories, I want an inline code button in the editor toolbar, so that I can mark short fragments (URLs, paths, identifiers like `/booking` or `hotelbreukelen.nl/fr/booking`) as inline code without leaving the toolbar.

The rich editor toolbar already offers a multiline **code block** button (`Code2` icon, in the "more" row), and that works. But there is no way to apply the **inline code** mark from the toolbar. The only way to create inline code today is by typing backticks manually in the source, which is not discoverable for toolbar-driven editing.

The underlying TipTap `code` mark is already available (it ships with StarterKit and is enabled in the editor), so `toggleCode()` works; only the toolbar control is missing.

## Implementation Plan

1. **Toolbar.tsx — import icon.** Add `Code` to the lucide-react import (keep `Code2` for the block button).
2. **Toolbar.tsx — add button.** Insert a new `FormatButton` in the expanded "more" row immediately after the Italic button (before `ColorButton`), so it groups with the inline marks and stays on the inline side of the first `Divider`. Action: `editor.chain().focus().toggleCode().run()`; active: `editor.isActive("code")`; label `"Inline code"`; icon `<Code size={14} strokeWidth={1.5} />`. Reuse `FormatButton` as-is — no new styling.
3. **Toolbar.test.tsx (new).** No Toolbar test exists today. Create one following the mock-editor pattern from `LinkFloatingToolbar.test.tsx` (no real TipTap editor — jsdom can't drive contentEditable). Mock editor needs `chain()` (self-returning), `isActive`, `getAttributes` → `{}`, `on`/`off`. Assertions: button absent until "more" row opened; present and distinct from "Code block" after opening; clicking runs the chain; `isActive("code")` drives `aria-pressed`.
4. **Verify.** Wiring verified by unit test; actual apply/toggle-off confirmed manually in-app (jsdom limitation, consistent with `RichEditor.test.tsx`).

## Requirements

### 1. Add an inline code button

- Add an inline code button to the toolbar in `src/components/rich-editor/Toolbar.tsx`.
- Action: `editor.chain().focus().toggleCode().run()`.
- Active state: `editor.isActive("code")`.
- Use a clear, distinct icon from the existing code block button (`Code2`). For example `Code` from lucide-react, so the two are visually distinguishable.
- Reuse the existing `FormatButton` component and styling for consistency.

### 2. Placement

- Place it near the other inline text formatting controls (Bold / Strikethrough / Italic) in the expanded "more" row, so inline code sits with inline marks and the code **block** button stays with block-level controls.

## Out of scope

- Any change to the existing code block button or its behaviour.
- Markdown serialization changes (the `code` mark already round-trips to/from backticks).
- Keyboard shortcut additions (StarterKit's default `Mod-e` for code may already apply; do not add new shortcuts in this story).

## Technical notes

- The toolbar's "more" row already contains the inline marks (`toggleBold`, `toggleStrike`, `toggleItalic`) and the code **block** button (`toggleCodeBlock`) in `Toolbar.tsx`.
- `code` is part of the StarterKit configuration in `src/components/rich-editor/RichEditor.tsx`; no extension changes are needed.

## Checklist

- [x] Add inline code `FormatButton` (`toggleCode` / `isActive("code")`) to the toolbar
- [x] Use a distinct icon from the code block button
- [x] Place it alongside the inline text marks in the "more" row
- [x] Add/extend a Toolbar test covering the inline code button
- [x] Verify inline code applies and toggles off correctly in the editor
