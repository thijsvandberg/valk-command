# BRDG-052: Rich Editor Slash Commands

**Status:** Open
**Priority:** Low

## Description

As the PO, I want slash commands (/) in the Rich Editor for quickly inserting callouts, tables, acceptance criteria templates, and code blocks so I can write structured stories faster.

## Acceptance Criteria

### Phase 1: Slash command trigger
- [ ] Typing "/" at the start of a new line or after a space opens a command menu
- [ ] Floating menu positioned below the cursor
- [ ] Filter commands by typing (fuzzy match)
- [ ] Arrow keys to navigate, Enter to select, Escape to close

### Phase 2: Built-in commands
- [ ] `/callout` - Insert a callout block (info/warning/success)
- [ ] `/table` - Insert a 3x3 table
- [ ] `/code` - Insert a code block
- [ ] `/divider` - Insert a horizontal rule
- [ ] `/expand` - Insert an expandable section
- [ ] `/ac` - Insert an Acceptance Criteria template (checkbox list with placeholder items)
- [ ] `/heading` - Insert heading (submenu: H1, H2, H3)

### Phase 3: Template commands
- [ ] `/story-template` - Insert a full story template (Description, AC, Technical Notes, Out of Scope)
- [ ] `/bug-template` - Insert a bug report template (Steps to Reproduce, Expected, Actual, Environment)
- [ ] `/task-template` - Insert a task template (Objective, Steps, Definition of Done)

### Phase 4: Polish
- [ ] Command icons in the menu (matching Lucide icons)
- [ ] Command descriptions as secondary text
- [ ] Recently used commands at the top
- [ ] Keyboard shortcut hint in menu (if applicable)

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
