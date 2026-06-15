# BRDG-352: Backslashes before an escaped image grow on the Jira push round-trip

**Status:** Not Started
**Priority:** Medium
**Type:** Bugfix

## Description

As a PO, I want a description containing a backslash-escaped image reference to survive a push to Jira and back without accumulating extra backslashes, so untouched content is not silently mutated each cycle.

On the "CLI/Bridge test story (don't delete)" (VPL-1337), a line like
`\![image-20260404-222028.png](/api/attachments/att-235476)` shows its backslashes
**doubling** in the diff after a push (`\\` -> `\\\\`), without the PO editing that
line. This is the leftover part of the round-trip corruption reported alongside the
expand-title duplication (fixed) and the post-push title flicker (fixed).

## Root cause (REPRODUCED locally — it is NOT Jira-side)

The doubling only happens **inside an expand/callout fence**, and it is a local
asymmetry in `callout-markdown.ts`, confirmed with the real VPL-1337 content
(the image line lives inside `:::expand Expand`):

```
inside :::expand:   \![…] -> \\![…] -> \\\\![…] -> \\\\\\\\![…]   (DOUBLES each cycle)
at top level:       \![…] -> \![…]                                (stable)
```

- **Load** path for expand/callout inner content uses the custom
  `markdownToBlockHtml`/`mdInlineToHtml` (`callout-markdown.ts`), which puts the
  raw markdown text (including a literal `\`) into HTML **without unescaping**
  markdown backslash escapes.
- **Serialize** path goes through tiptap-markdown (the expand node's
  `addStorage.markdown.serialize` calls `state.renderContent`), which **escapes**
  every literal `\` to `\\`.
- Top-level content does not grow because tiptap-markdown's own loader unescapes
  on the way in, so its load/serialize is symmetric. The custom fence loader
  breaks that symmetry, so backslashes double on every cycle.

Ruled out: `markdown-to-adf.ts`/`adf-to-markdown.ts` (lib round-trip byte-stable)
and the top-level TipTap path (stable). Jira is not involved.

## Fix direction

Make the expand/callout inner-content load symmetric with the serialize escaping,
so the round-trip is idempotent (stops the growth). Options:
- Unescape markdown backslash escapes in the fence inner-content load
  (`markdownToBlockHtml`/`mdInlineToHtml`) the way tiptap-markdown's loader does,
  taking care of ordering vs the inline `**`/`*`/`` ` `` regex replacements; or
- Route expand/callout inner content through tiptap-markdown's own parser instead
  of the custom HTML conversion, so load/serialize are symmetric by construction.
- Add the failing case to `src/components/rich-editor/markdown-roundtrip.test.tsx`
  (image inside an expand) and assert no backslash growth + idempotency, plus the
  byte-stable goal where achievable.

## Implementation Plan

Root cause confirmed: `prosemirror-markdown`'s text escape (`esc()`) escapes `\` -> `\\` on
serialize, but the fence loader `mdInlineToHtml` never unescapes markdown backslash escapes on
load, breaking symmetry. Top level is stable because tiptap-markdown's own loader unescapes.

1. **Fix `mdInlineToHtml` (checkbox 2)** in `src/components/rich-editor/callout-markdown.ts` —
   the single chokepoint for all fence inner inline text (paragraphs, headings, list items).
   - Before the mark/link regexes, protect every `\X` where X is a CommonMark ASCII-punctuation
     char (`` ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~ ``) with a
     private-use sentinel encoding X. This unescapes the backslash AND shields escaped marks
     (`\*`, `` \` ``, `\[`) from being matched as emphasis/code/link.
   - Run the existing mark/link regexes unchanged.
   - Restore sentinels to the literal char, HTML-escaping `<`, `>`, `&` so the literal survives
     TipTap's HTML parse and re-serializes as a literal.
   - Scope: do NOT touch `inlineMarkdownToHtml` (color spans) — its serialize inverse never
     escapes backslashes, so it is already symmetric.
2. **Regression test (checkbox 3)** in `markdown-roundtrip.test.tsx`: image inside an expand,
   assert idempotency (`roundTrip(once) === once`), no `\\!` growth, and content survives. Add a
   focused load-side unit test in `callout-markdown.test.ts`.
3. **All tests pass + build (checkbox 4)**.

## Out of scope

- Expand title duplication - fixed (commit `8bc56dcf`).
- Post-push title not updating - fixed (commit `137c37a3`).
- Real image attachment upload (BRDG-268 out-of-scope note).

## Notes

- The construct only appears because the test story deliberately contains backslash runs; normal descriptions are unaffected. Priority is Medium because it is real cumulative mutation but on pathological content.
- The comparison layer (`normalizeMarkdownForCompare`, BRDG-348) deliberately does NOT fold backslash-run differences, precisely so this real corruption stays visible rather than hidden.

## Checklist

- [x] Reproduce locally and pin the source — expand/callout inner-content load/serialize asymmetry in `callout-markdown.ts` (NOT Jira)
- [x] Make the fence inner-content round-trip symmetric so backslashes stop doubling (idempotent)
- [x] Regression test: image inside an expand, asserts no backslash growth + idempotency
- [x] All tests pass, build succeeds

<!-- Note: 5 failing tests in the suite (push-to-jira/route.test.ts, SprintAnalytics.test.tsx)
     are unrelated parallel-session work (BRDG-343, commit 633f30a6); they do not import this
     story's code. This story's tests (markdown-roundtrip, callout-markdown) all pass and build succeeds. -->
