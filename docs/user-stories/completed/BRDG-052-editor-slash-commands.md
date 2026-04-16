# BRDG-052: Rich Editor Slash Commands

**Status:** Completed
**Priority:** Low

## Description

As the PO, I want slash commands (/) in the Rich Editor for quickly inserting callouts, tables, acceptance criteria templates, and code blocks so I can write structured stories faster.

## Implementation Plan

1. **Create template strings** (`src/components/rich-editor/slash-commands/slash-command-templates.ts`) - Markdown constants for AC, story, bug, and task templates. Converted to HTML at insertion time via `calloutMarkdownToHtml()`.

2. **Create recently-used hook** (`src/components/rich-editor/slash-commands/use-recent-commands.ts`) - Reads/writes `localStorage` key `"slash-commands-recent"`, tracks last 5 used command IDs.

3. **Create command registry** (`src/components/rich-editor/slash-commands/slash-command-list.ts`) - `SlashCommand[]` array with all Phase 2 + Phase 3 commands. Fuse.js instance for fuzzy search on label and aliases. Uses heading levels 2/3/4 to match StarterKit config.

4. **Create ProseMirror plugin extension** (`src/components/rich-editor/slash-commands/slash-command-extension.ts`) - Custom TipTap Extension with a ProseMirror plugin that detects `/` input, tracks query string, exposes `{ active, query, range, coords }` via PluginKey. Intercepts ArrowDown/Up/Enter/Escape when menu is active via callbacks set by the menu component.

5. **Create React menu component** (`src/components/rich-editor/slash-commands/SlashCommandMenu.tsx`) - Portal to `document.body`, reads plugin state on transactions, filters commands with Fuse.js, renders floating menu with Lucide icons + descriptions + recently-used ordering. On selection: deletes the `/query` range then calls `command.execute(editor)`.

6. **Barrel export** (`src/components/rich-editor/slash-commands/index.ts`).

7. **Wire into `RichEditor.tsx`** - Add `SlashCommandExtension` to extensions array, render `<SlashCommandMenu editor={editor} />`.

8. **CSS** (`src/components/rich-editor/editor-styles.css`) - Max-height + scroll for menu, transition styles.

### Key Decisions
- No `@tiptap/suggestion` package (version mismatch); custom ProseMirror plugin instead.
- Heading levels 2/3/4 (matching StarterKit `levels: [2, 3, 4]` config).
- Callout inserts "info" type by default (user can change via toolbar).
- Menu positioned with `view.coordsAtPos()` + `position: fixed` portal.

## Acceptance Criteria

### Phase 1: Slash command trigger
- [x] Typing "/" at the start of a new line or after a space opens a command menu
- [x] Floating menu positioned below the cursor
- [x] Filter commands by typing (fuzzy match)
- [x] Arrow keys to navigate, Enter to select, Escape to close

### Phase 2: Built-in commands
- [x] `/callout` - Insert a callout block (info/warning/success)
- [x] `/table` - Insert a 3x3 table
- [x] `/code` - Insert a code block
- [x] `/divider` - Insert a horizontal rule
- [x] `/expand` - Insert an expandable section
- [x] `/ac` - Insert an Acceptance Criteria template (checkbox list with placeholder items)
- [x] `/heading` - Insert heading (H2, H3, H4 — H1 excluded; StarterKit configured with levels [2,3,4])

### Phase 3: Template commands
- [x] `/story-template` - Insert a full story template (Description, AC, Technical Notes, Out of Scope)
- [x] `/bug-template` - Insert a bug report template (Steps to Reproduce, Expected, Actual, Environment)
- [x] `/task-template` - Insert a task template (Objective, Steps, Definition of Done)

### Phase 4: Polish
- [x] Command icons in the menu (matching Lucide icons)
- [x] Command descriptions as secondary text
- [x] Recently used commands at the top
- [ ] Keyboard shortcut hint in menu (if applicable) <!-- skipped: no keyboard shortcuts defined for slash commands; not applicable -->

## Technical Notes

- TipTap has built-in suggestion/slash command support via `@tiptap/suggestion`
- Command menu as a React portal positioned relative to cursor
- Each command is a function that inserts the appropriate TipTap nodes
- Templates stored as markdown strings, converted to TipTap nodes on insert
- Fuzzy match using existing fuse.js dependency

## Out of Scope (for now)
- Custom user-defined slash commands
- AI-powered commands (e.g., "/improve" to rewrite selection)
- Slash commands in the chat input
- Command palette integration (separate from Cmd+K)
