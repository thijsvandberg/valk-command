# BRDG-499: Improve callout block in the editor

**Status:** To Do
**Priority:** Medium
**Type:** Bugfix | Feature

## Description

Two distinct UX problems with the callout block in the Tiptap rich editor:

1. **Slash command always inserts "info".** The `/callout` slash command (and its aliases: `note`,
   `info`, `warning`, `alert`) hard-codes `type: "info"`. All five types already exist in the
   extension (`info | warning | error | note | success`), but there is no way to pick one via the
   slash menu. The slash menu should expose all five types as individual entries with a colour
   indicator so the PO can insert the right type in one step.

2. **Clicking inside a callout always selects the whole block.** The ProseMirror plugin in
   `callout-extension.ts` fires a `NodeSelection` whenever `handleClickOn` is called with
   `direct=false` (i.e., for any ancestor of the clicked node). This means clicking on text inside
   the callout selects the entire block instead of placing the cursor. Desired behaviour:
   - Click on the callout's padding / border area (i.e., directly on the container `div`,
     `direct=true`) → select the whole node.
   - Click on text or any child element inside the callout (`direct=false`) → let ProseMirror
     handle it naturally (cursor placement).

## Current Behaviour

- `slash-command-list.ts`: single `callout` entry, `execute` always calls
  `setCallout({ type: "info" })`. Aliases `note`, `warning`, `alert` all resolve to the same entry
  and insert "info".
- `callout-extension.ts` (lines 69-77): `handleClickOn` checks `if (direct || ...)` which skips
  the handler when `direct=true` and intercepts when `direct=false`. Any click inside the callout
  (on text, on a paragraph, etc.) fires NodeSelection before the cursor can land.
- The toolbar `CalloutDropdown` already exposes all five types correctly — only the slash command
  lags behind.

## Proposed Approach

### Part 1 — Five slash commands (one per type)

Replace the single `callout` entry in `SLASH_COMMANDS` with five dedicated entries:

| id              | label            | aliases                        | type    |
|-----------------|------------------|--------------------------------|---------|
| callout-info    | Callout: Info    | callout, info, alert, box      | info    |
| callout-warning | Callout: Warning | warning, warn, caution         | warning |
| callout-error   | Callout: Error   | error, danger, critical        | error   |
| callout-note    | Callout: Note    | note, purple                   | note    |
| callout-success | Callout: Success | success, tip, done, green      | success |

Each entry shows a colour-dot icon next to the type label. Typing `/callout` fuzzy-matches all
five; typing `/warning` surfaces only the warning entry.

The `SlashCommand` interface already supports `LucideIcon` as icon — use a small coloured circle
rendered inline (or a coloured variant of the existing `Info`-style icons).

Non-goals: no sub-menu, no change to the toolbar dropdown.

### Part 2 — Fix click selection logic

In `callout-extension.ts` `handleClickOn`, invert the guard:

```
// Before: if (direct || ...) return false   — skips on direct=true, fires on direct=false
// After:  if (!direct || ...) return false  — fires on direct=true, skips on direct=false
```

When `direct=true`, the raw click landed on the callout container element (padding area), so select
the whole node. When `direct=false`, the click landed on a child (text, paragraph) and ProseMirror
handles cursor placement naturally.

The "second click enters text cursor mode" escape hatch (line 72) stays intact: if the callout is
already NodeSelected, any click returns `false` and lets ProseMirror move the cursor inside.

## Implementation Plan

1. **`slash-command-list.ts`** — Replace the single `callout` entry with five type-specific entries.
   Add a colour indicator (e.g. a small coloured `Circle` Lucide icon, or inline `div` via a
   wrapper component if the `SlashCommand` interface is extended with an optional `iconColor`).
2. **`callout-extension.ts`** — Change `handleClickOn` guard from `direct ||` to `!direct ||`.
3. **`callout-extension.ts` tests / `callout-markdown.test.ts`** — Add unit tests for the new
   slash commands and the corrected click-selection logic.

## Acceptance Criteria

- [ ] Typing `/callout` in the editor opens the slash menu and shows five entries, one per type,
      each labelled "Callout: {Type}" with a colour indicator.
  <!-- slash-command-list.ts: five SLASH_COMMANDS entries with callout-{type} ids -->
- [ ] Typing `/warning` (or `/error`, `/note`, `/success`, `/info`) in the slash menu surfaces the
      corresponding callout type entry and inserts a callout of that type on selection.
  <!-- slash-command-list.ts: aliases per entry; Fuse.js search -->
- [ ] Selecting a type-specific slash command inserts a callout of the correct type (not always
      "info").
  <!-- execute: (editor) => editor.chain().focus().setCallout({ type }).run() -->
- [ ] Clicking on text inside a callout places the cursor at that position (no NodeSelection).
  <!-- callout-extension.ts handleClickOn: guard inverted to direct=true only -->
- [ ] Clicking on the padding / border area of a callout (but not on text) selects the whole node
      (NodeSelection), consistent with current toolbar selection behaviour.
  <!-- callout-extension.ts handleClickOn: direct=true path -->
- [ ] Clicking inside an already-NodeSelected callout moves the cursor into the text
      (existing escape-hatch on line 72 stays intact).
  <!-- callout-extension.ts: NodeSelection guard unchanged -->
- [ ] The toolbar `CalloutDropdown` is unchanged and continues to work.

## Tests

- [ ] Slash command list contains exactly five callout entries (ids: callout-info .. callout-success).
  <!-- slash-command-list.test.ts (new) or existing slash-command-list.ts snapshot -->
- [ ] Each callout slash command inserts the correct callout type.
  <!-- slash-command-list.test.ts -->
- [ ] Fuzzy search for "callout" returns all five entries; search for "warning" returns exactly
      callout-warning.
  <!-- slash-command-list.test.ts using slashCommandFuse -->
- [ ] handleClickOn with direct=true on a callout node dispatches NodeSelection.
  <!-- callout-extension.test.ts (new) -->
- [ ] handleClickOn with direct=false on a callout node returns false (no dispatch).
  <!-- callout-extension.test.ts -->

## Related

- `src/components/rich-editor/slash-commands/slash-command-list.ts` — callout entry to replace
- `src/components/rich-editor/callout-extension.ts` — handleClickOn to fix
- `src/components/rich-editor/Toolbar.tsx` — CalloutDropdown (reference for type colours, no change)
- `src/components/rich-editor/slash-commands/SlashCommandMenu.tsx` — menu renderer (no change expected)
