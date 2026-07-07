# BRDG-498: Fix markdown rendering bugs (tables, escaped pipes, blockquote headings)

**Status:** To Do
**Priority:** High
**Type:** Bug

## Description

Three related rendering bugs in the ticket description view. All three involve
`renderMarkdown.tsx` (the read-side renderer) or the WYSIWYG editor's serialize path.
Affected: ticket descriptions and comments on any ticket using these content structures.

---

## Bug 1: HTML tags visible in content after editing a table

**Symptom:** After editing a table in the WYSIWYG editor, raw HTML (`<table>`, `<tr>`,
`<td>`, etc.) appears as literal text in the rendered description.

**Root cause:** `tiptap-markdown` (v0.9.x) has an `isMarkdownSerializable()` guard in
`node_modules/tiptap-markdown/src/extensions/nodes/table.js` (lines 57-73). It returns
`false` (falling back to HTML) when the table has:
- A first row without `tableHeader` cells (common in Jira tables that lack an explicit header)
- Cells with more than one child node (multi-paragraph cells)
- Cells with colspan/rowspan > 1

When the guard fires, the editor stores `<table>...</table>` HTML in the markdown field
instead of GFM pipe-delimited syntax. `renderMarkdown.tsx` does not have a handler for
`<table>` HTML blocks, so they fall through to plain-text rendering.

**Fix scope:** Medium. Two options (pick one):
- **Option A (preferred):** In `renderMarkdown.tsx`, add a `<table>` HTML block handler
  (similar to the existing `<details>` handler at line 621-673) that parses the HTML table
  and renders it as a React `<table>` element.
- **Option B:** In `getEditorMarkdown()` (`RichEditor.tsx`), post-process the serialized
  output and convert any `<table>...</table>` HTML back to GFM markdown before storing.

---

## Bug 2: `\|` visible as literal text in table cells

**Symptom:** Table cells that contain a pipe character (`|`) render with a visible
backslash: `\|` appears instead of just `|`. Visible as e.g. `Track 3:\| Dashboard\|`.

**Root cause:** `renderMarkdown.tsx`'s `parseRow` function (line 320-321) splits table
rows on every bare `|`:

```typescript
const parseRow = (line: string): string[] =>
    line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
```

When a table cell contains a CommonMark-escaped pipe (`\|`) — either from the stored
content or from a previous editor round-trip — the split operates on the `|` part of `\|`,
fragmenting the cell and leaving a dangling `\` in the preceding cell text.

Same function exists in `markdown-to-adf.ts` at line 225-229, causing the same problem
when converting markdown to ADF for save-to-Jira.

**Fix scope:** Easy. Two changes:
1. `renderMarkdown.tsx` line 321: split on unescaped `|` only (negative lookbehind) and
   unescape `\|` → `|` in each cell:
   ```typescript
   const parseRow = (line: string): string[] =>
       line.replace(/^\||\|$/g, "")
           .split(/(?<!\\)\|/)
           .map((c) => c.trim().replace(/\\\|/g, "|"));
   ```
2. Same fix in `markdown-to-adf.ts` `parseRow` at line 225-229.

---

## Bug 3: Headings (and other block elements) broken inside blockquotes

**Symptom:** When a blockquote (`> `) wraps content that includes headings, the heading
markup is either shown as raw `## text` or the content renders with stray asterisks (e.g.
`**********Option C:`). Seen on VPL-47278.

**Root cause:** `renderMarkdown.tsx`'s blockquote handler (lines 750-778) strips the `> `
prefix from all lines, then calls `fmt(l)` — the inline-only formatter — on each line. It
does NOT recursively call the full block renderer. As a result:
- `> ## Heading` → `## Heading` → shown as literal `##` text (or confuses inline regex)
- `> - list item` → list not rendered
- Multi-line bold spans broken across lines produce stray `**` asterisks in output

**Fix scope:** Medium. In the blockquote handler, after collecting and stripping `> `
prefixes, recursively call `renderMarkdown` on the inner content instead of calling
`fmt(l)` per line:

```typescript
// Collect quoteLines as before (stripping "> " prefix)...
const innerMarkdown = quoteLines.join("\n");
elements.push(
    <blockquote key={`bq-${elements.length}`}>
        {renderMarkdown(innerMarkdown, linkifyRefs)}
    </blockquote>
);
```

This requires `renderMarkdown` to be a named function (not only the exported top-level
wrapper), but it already processes content recursively in other contexts.

---

## Acceptance Criteria

- [ ] Tables with non-header first rows or multi-paragraph cells do not produce visible
  HTML tags in the description view after being edited in the WYSIWYG editor
- [ ] Table cells containing a literal `|` character display `|`, not `\|` or a fragmented
  cell boundary
- [ ] Headings inside blockquotes render as styled heading elements (h2, h3, etc.), not
  as raw `## text`
- [ ] Lists inside blockquotes render as proper lists
- [ ] Existing content (tables without pipe-in-cells, non-blockquote headings) is unaffected
- [ ] All existing tests pass; new tests cover each bug's round-trip scenario

## Files Involved

- `src/components/ticket-detail/renderMarkdown.tsx` — bugs 1 (option A), 2, 3
- `src/components/rich-editor/RichEditor.tsx` — bug 1 (option B)
- `src/lib/markdown-to-adf.ts` — bug 2 (parseRow at line 225)

## Test Scenarios

- **Bug 1:** Load a ticket with a Jira table lacking header row → edit a cell → save →
  verify no HTML tags visible in rendered view
- **Bug 2:** Ticket with a table where a cell contains ` | ` (e.g. `A | B`) → verify cell
  shows `A | B`, not `A \| B` or split cells
- **Bug 3:** Description with `> ## Heading` → verify heading styled correctly inside
  blockquote; description with `> **bold**` multi-line → verify no stray asterisks
