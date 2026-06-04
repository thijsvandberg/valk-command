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

## Implementation Plan

> Authored after EMPIRICAL investigation (Opus Plan agent built a real TipTap editor in
> jsdom and captured verbatim serializer output). The story's original hypotheses were
> partly wrong — corrected below.

### True root causes (corrected)

1. **NOT a `:` right-flanking delimiter issue and NOT a serializer-config issue.** Single-line
   content round-trips cleanly (`**Background info**:`, `` `VPUPG` `` both stay intact). The
   corruption appears **only when a paragraph has 2+ lines** (a soft break inside one
   paragraph). Root cause: `calloutMarkdownToHtml`'s `flushPara` (in
   `src/components/rich-editor/callout-markdown.ts`) wraps multi-line paragraphs as
   `<p>rawLine<br>rawLine</p>` **without** converting inline markdown. TipTap's
   `Markdown({html:true})` then treats `**`/`` ` `` as literal HTML text, so they become plain
   text nodes; on serialize prosemirror-markdown *correctly* backslash-escapes them. So the
   escaping is correct behaviour for text that was wrongly never parsed as a mark on load —
   a **load-path bug**, not a serialize bug. (Callout/list/blockquote/single-line paths
   already run inline conversion, which is why only multi-line plain paragraphs break.)
2. **Color `#hex` → `rgb()`** is **CSSOM normalization**, not the `Color` extension and not the
   serializer: setting HTML into the editor DOM normalizes `#97a0af` to `rgb(151, 160, 175)`,
   and `getHTML()` reads it back normalized. Cannot be fixed by configuring the extension;
   fix on serialize by converting `rgb()` back to hex.

### Steps

1. **Fix multi-line paragraph load corruption** — `callout-markdown.ts`, `flushPara` multi-line
   branch: convert each line with the existing `mdInlineToHtml` before joining with `<br>`
   (`<p>${paraBuffer.map(mdInlineToHtml).join("<br>")}</p>`). Leave the single-line branch raw
   (it is parsed by markdown-it at top level; double-converting would break it). This makes the
   multi-line path consistent with the callout/list/blockquote paths — principled, not a
   denylist patch. Empirically verified to produce clean `**Background info**:` / `` `VPUPG` ``.
2. **Preserve `{color:#hex}` macros** — `callout-markdown.ts`, `htmlToCalloutMarkdown` color-span
   handler: convert serialized `rgb(r, g, b)` back to lowercase 6-digit `#rrggbb`. Only fire on
   3-component `rgb()`; leave `rgba()`, named colors, and already-hex untouched. WHY-comment:
   CSSOM normalizes hex→rgb on load.
3. **Do NOT broaden the `getEditorMarkdown` unescape denylist** (`RichEditor.tsx` ~L112-120).
   After step 1 the bold/code serialize as real marks (never escaped), so no change is needed;
   broadening to strip `\*` / `` \` `` globally would corrupt *intentional* literals like
   `2 \* 3 = 6`. Keep existing `\[ \] &lt; &gt;` + hard-break handling and its tests green.
4. **Round-trip test suite** — new `markdown-roundtrip.test.tsx`. A real `@tiptap` editor with
   the production extension set runs in this jsdom config and reproduces both bugs. Export a
   thin testing helper from `RichEditor.tsx` (`markdownToEditorHtml` + `getEditorMarkdown`, or a
   `roundTrip(md)` wrapper — the file already exports `normalizeMarkdownForEditor` "for testing
   only") so the test exercises the exact production pipeline. Corpus, each `roundTrip(x) === x`:
   `**Background info**:`; a multi-line paragraph mixing `**bold**:` and `` `code` ``; `` `VPUPG` ``/`` `VPUPG-100` ``;
   `{color:#97a0af}text{color}`; a link; `array[x]`; `<tag>`; an `:::info` callout; a 2-line
   blockquote; and a literal-asterisk control `2 * 3 = 6` (locks in that intentional escapes are
   not over-stripped).
5. **Gate**: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`. Keep
   `callout-markdown.test.ts` and `RichEditor.test.tsx` green (extend the former for rgb→hex).

### Regression risks

- Step 1 must touch ONLY the multi-line branch; single-line content must keep going through
  markdown-it (corpus single-line cases guard this).
- Step 2 rgb→hex only on 3-component `rgb()`; guard named-color and rgba spans with a test.
- Hard-break trailing `\` from multi-line `<br>` is still stripped outside blockquotes by the
  existing `getEditorMarkdown` logic; preserved inside blockquotes.

## Acceptance criteria

- [x] Editing one part of a description and saving leaves **all other content byte-stable**
      (no new escapes, no color rewrites) — verified by a round-trip test on a fixture
      containing bold, inline code, a `{color:#hex}` macro, links, and a `**word**:` case. <!-- markdown-roundtrip.test.tsx -->
- [x] `**Background info**:` survives an edit/save unchanged (stays bold, no `\*`).
- [x] Inline code `` `VPUPG` `` survives unchanged (no `` \` ``).
- [x] `{color:#97a0af}` survives unchanged (stays hex, not `rgb()`).
- [x] No regression to the already-handled cases (`\[`, `\]`, `<`, `>`, hard breaks,
      callouts, blockquotes) — keep their existing tests green. <!-- callout-markdown.test.ts + brackets round-trip case green -->
- [x] A markdown round-trip unit test suite (`load → serialize` is identity for a
      representative corpus) is added to lock this down. <!-- src/components/rich-editor/markdown-roundtrip.test.tsx (real-editor) -->

> **Fix summary:** root cause was a load-path bug in `callout-markdown.ts` (multi-line
> paragraphs wrapped as raw `<p>...<br>...</p>` without inline conversion → marks lost →
> escaped on serialize) plus CSSOM hex→rgb normalization. Fixed both in `callout-markdown.ts`
> (per-line `mdInlineToHtml` in the multi-line `flushPara` branch; `rgb()`→hex on serialize).
> Did **not** broaden the `getEditorMarkdown` unescape denylist (would corrupt intentional
> literals). Editor extension set extracted to `buildEditorExtensions()` so the new real-editor
> round-trip test exercises the exact production pipeline.

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
