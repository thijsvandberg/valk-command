# VC-006: Rich Text Editor for Story Descriptions

**Status:** In Progress
**Priority:** Medium

## Description

As a PO, I want a rich text editor with a markdown toggle for editing story descriptions, so I can format content visually or in raw markdown depending on my preference.

## Editor Modes

### Rich Text Mode (WYSIWYG)
- TipTap-based editor
- Toolbar with formatting buttons
- Live preview of formatting as you type
- Callout blocks with distinct styling

### Markdown Mode
- Plain textarea with raw markdown
- Syntax highlighting (optional, nice-to-have)
- Toggle switch to flip between modes instantly
- Content stays in sync between modes

### Toggle
- Switch at the top of the editor (Markdown / Rich Text)
- Switching preserves content, converts between formats
- Last used mode remembered in localStorage

## Toolbar Buttons

| Button | Markdown | Notes |
|--------|----------|-------|
| Bold | `**text**` | |
| Italic | `*text*` | |
| H2 | `## ` | |
| H3 | `### ` | |
| H4 | `#### ` | |
| Bullet list | `- ` | |
| Numbered list | `1. ` | |
| Code block | ` ``` ` | With optional language tag |
| Link | `[text](url)` | |
| Note (info) | `:::info` | Blue callout |
| Note (warning) | `:::warning` | Amber callout |
| Note (error) | `:::error` | Red callout |
| Note (note) | `:::note` | Gray callout |
| Note (success) | `:::success` | Green callout |

## Callout Blocks

Rendered as colored callout boxes with icon + background:

| Type | Icon | Background | Border |
|------|------|------------|--------|
| Info | (i) circle | Blue tint | Blue left border |
| Warning | Triangle | Amber tint | Amber left border |
| Error | X circle | Red tint | Red left border |
| Note | Chat bubble | Gray tint | Gray left border |
| Success | Checkmark | Green tint | Green left border |

Markdown syntax:
```
:::info
This is an informational callout.
It can span multiple lines.
:::
```

## Storage

- Always stored as markdown in the database
- TipTap converts to/from markdown via extensions
- Callout blocks use `:::type` fenced syntax (common in markdown-it and similar parsers)

## Usage Locations

- Ticket description editing (VC-003 Phase 4, replaces current textarea)
- PO Notes editing (in side panel and detail view)
- PO Comments (if we want rich formatting there too, future)

## Implementation Phases

### Phase 1: TipTap Setup + Basic Formatting
- [x] Install TipTap and required extensions
- [x] Build `RichEditor` component with toolbar
- [x] Basic formatting: bold, italic, H2, H3, H4
- [x] Lists: bullet, numbered
- [x] Code block
- [x] Link insertion
- [x] Dark theme styling matching design system

### Phase 2: Callout Blocks
- [x] Custom TipTap extension for callout blocks
- [x] 5 callout types with distinct styling (info, warning, error, note, success)
- [x] Toolbar dropdown/buttons for inserting callouts
- [x] `:::type` markdown syntax parsing and serialization

### Phase 3: Markdown Toggle
- [x] Markdown mode: plain textarea with raw content
- [x] Toggle switch between Rich Text and Markdown
- [x] Content sync between modes (markdown <-> TipTap)
- [x] Last used mode persisted in localStorage

### Phase 4: Integration
- [ ] Replace description textarea in ticket detail view (VC-003)
- [ ] Replace PO Notes textarea in side panel and detail rail
- [ ] Ensure local edit tracking (VC-003 Phase 4) works with new editor
- [ ] Update description rendering to support callout blocks

## Technical Notes

- TipTap is built on ProseMirror, the most mature rich text framework for React
- Extensions needed: @tiptap/starter-kit, @tiptap/extension-link, custom callout extension
- Markdown serialization via tiptap-markdown or custom serializer
- Callout syntax (`:::type`) is compatible with markdown-it-container and similar parsers
- Editor must work within the dark theme (custom CSS for TipTap)

## Dependencies

- VC-003 Ticket Detail View (editing infrastructure)
