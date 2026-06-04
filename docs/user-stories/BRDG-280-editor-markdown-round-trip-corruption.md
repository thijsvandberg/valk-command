# BRDG-280: Description editor corrupts markdown on save (round-trip)

**Status:** Not started
**Priority:** High
**Type:** Bug

## Description

Editing a ticket description in the rich editor and saving **mutates content that was
never touched**. The TipTap → markdown serialization round-trip escapes and rewrites
characters, and when the result is pushed to Jira the corrupted version becomes the source
of truth. This affects the **normal ticket page** as well as the new child-preview side
panel — it is not specific to one surface; any edit + save of a description that contains
bold, inline code, or a color macro can be affected.

This was discovered while testing BRDG-275: a one-word edit to a real child ticket, on save
+ push, rewrote unrelated parts of the description.

## Reproductions (observed)

Editing + saving a description containing these produced, with no manual change to them:

| Original (correct) | After save round-trip (corrupted) |
|---|---|
| `**Background info**:` | `\*\*Background info\*\*:` (bold lost, literal backslashes shown) |
| `` `VPUPG` `` and `` `VPUPG-100` `` | `` \`VPUPG\` `` and `` \`VPUPG-100\` `` (inline-code backticks escaped) |
| `{color:#97a0af}…{color}` | `{color:rgb(151, 160, 175)}…{color}` (hex normalized to rgb) |

Only the single intended edit should change; everything else must round-trip byte-stable.

## Impact

- **Data integrity:** corrupted markdown is pushed to Jira and becomes the stored content.
- **Silent:** the user edits one thing; unrelated formatting breaks elsewhere in the doc.
- **Cumulative:** each edit/save can add another layer of escaping, so repeated edits
  degrade the description further.

## Affected code

- `src/components/rich-editor/RichEditor.tsx`
  - `getEditorMarkdown()` (~L93-117) takes `tiptap-markdown`'s `getMarkdown()` output and
    post-processes it. It already **unescapes** `\[`, `\]`, and HTML-encoded `&lt;`/`&gt;`,
    but the denylist is **incomplete**: it does not handle escaped backticks (`` \` ``) or
    escaped asterisks (`\*`). So those escapes survive into stored content.
  - `normalizeMarkdownForEditor()` (~L56-90) already special-cases some bold/italic
    delimiter edge cases (e.g. `**word:**`, `*word*:*`) on the **load** path, which is
    evidence this delimiter/colon class of problem is known and only partially covered.
  - The TipTap `Color` / `TextStyle` extensions (~L173-174) normalize color values
    (hex → `rgb()`), so `{color:#xxxxxx}` macros are rewritten on round-trip.
- The push path then sends this corrupted markdown to Jira (markdown → ADF), persisting it.

## Likely root causes (to confirm during investigation)

1. **Incomplete unescape denylist.** `getEditorMarkdown` patches a few escapes by hand;
   `tiptap-markdown` also escapes `` ` `` and `*` (and likely `_`, `#`, etc.). A
   denylist that enumerates "characters we know we don't use as markdown" is fragile.
2. **`**word**:` right-flanking delimiter.** Bold immediately followed by `:` is parsed as
   literal text on load (not a bold mark), so on save the literal `*` get escaped. The
   existing `normalizeMarkdownForEditor` cases hint this is under-covered.
3. **Color normalization.** The `Color` extension canonicalizes to `rgb()`; the Jira
   `{color:#hex}` macro expects hex, so the macro is silently changed.

## Acceptance criteria

- [ ] Editing one part of a description and saving leaves **all other content byte-stable**
      (no new escapes, no color rewrites) — verified by a round-trip test on a fixture
      containing bold, inline code, a `{color:#hex}` macro, links, and a `**word**:` case.
- [ ] `**Background info**:` survives an edit/save unchanged (stays bold, no `\*`).
- [ ] Inline code `` `VPUPG` `` survives unchanged (no `` \` ``).
- [ ] `{color:#97a0af}` survives unchanged (stays hex, not `rgb()`).
- [ ] No regression to the already-handled cases (`\[`, `\]`, `<`, `>`, hard breaks,
      callouts, blockquotes) — keep their existing tests green.
- [ ] A markdown round-trip unit test suite (`load → serialize` is identity for a
      representative corpus) is added to lock this down.

## Technical notes / approach (to refine in investigation)

- Prefer a **principled** fix over extending the hand-rolled unescape denylist:
  - Investigate configuring `tiptap-markdown`'s serializer escaping, or adding an
    allowlist-based unescape that only preserves escapes for characters we actually use as
    markdown syntax, rather than blindly stripping a hardcoded few.
  - For colors, either disable the `Color` extension's normalization or convert back to the
    original hex on serialize so the `{color:#hex}` macro is preserved.
- Add a focused round-trip test (`getEditorMarkdown(load(x)) === x`) over a fixture corpus;
  `RichEditor.test.tsx` and `normalizeMarkdownForEditor` already exist as patterns to follow.
- Validate against the real push path (markdown → ADF) so the fix holds end-to-end, not just
  in the editor.

## Out of scope

- Restoring the specific ticket touched during BRDG-275 testing (VPL-35487) — not needed,
  the original is intact in its History (v1) and the stray edit is inconsequential.
- Broader editor feature work; this is strictly a content-fidelity bug.
