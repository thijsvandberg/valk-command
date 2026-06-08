# BRDG-314: Theme-aware code blocks and syntax highlighting (light/dark)

**Status:** Draft
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-310 (board row polish), rendered markdown code blocks (`CodeBlock.tsx`), rich editor code blocks (`editor-styles.css`)

## Description

As a PO reading and writing tickets in **light mode**, I want code blocks to look as deliberate and
legible as the rest of the light UI. Today they are forced dark and a few elements have poor contrast,
which looks unfinished and is hard to read.

The trigger was the collapsed code-block heading ("Code · 69 lines") being barely readable in light
mode. Investigation showed this is not a one-off: light mode currently **forces every code block to a
dark surface** with a hardcoded, low-contrast header label, and there is no light-tuned syntax palette.

## Current behaviour (root cause)

All in `src/components/rich-editor/editor-styles.css`:

- **Code blocks forced dark in light mode** (`[data-theme="light"]` rules, ~lines 141–169): the
  rendered-markdown block (`.rm-code-block`) and the editor block (`.editor-code-block`,
  `.description-content pre`) are pinned to `#1e1e2e` / header `#16161e` with `!important`, so they stay
  dark even though the surrounding page is light.
- **Low-contrast collapsed header** (~line 158): `.rm-code-block-header span` is hardcoded to
  `rgba(255, 255, 255, 0.35) !important`. This is the dim "Code · 69 lines" label, and the `!important`
  is why adjusting the inline text token in `CodeBlock.tsx` has no effect in light mode.
- **Single syntax palette** (Prism token rules, ~lines 398–495): token colours are tuned for a dark
  surface only; there is no light-mode variant.

So the bug the PO saw (dim heading) is the visible symptom of a broader "code blocks aren't really
themed for light mode" gap.

## Approach (decided)

**Option A — True light code blocks in light mode.** Code blocks get a light surface and a
light-tuned Prism palette in light mode (like GitHub/most IDEs), and keep the dark treatment in dark
mode. The hardcoded low-contrast header label and the broad `!important` overrides in
`editor-styles.css` are removed in favour of semantic, per-theme token values.

(Considered and rejected: keeping code blocks dark in both themes and only fixing contrast — simpler,
but leaves code visually dark on a light page, less cohesive with the light theme.)

## Scope

- Rendered-markdown code blocks: `src/components/ticket-detail/CodeBlock.tsx` + the `.rm-code-block*`
  and `.rm-code-content .token.*` rules in `editor-styles.css`.
- Rich editor code blocks: `.editor-code-block` / `.description-content pre` rules in
  `editor-styles.css`.
- Inline code (`.description-content code`, `.tiptap code`) contrast in both themes.

## Implementation Plan

Introduce semantic, per-theme CSS variables for code blocks so the inline styles in `CodeBlock.tsx`
flip with the theme, removing the need for the broad `[data-theme="light"] ... !important` overrides.

1. **New code tokens in `globals.css` `:root` (dark defaults)** near the existing chat code tokens:
   `--color-code-surface` (`color-mix(in srgb, black 28%, transparent)`), `--color-code-header-bg`
   (`var(--color-overlay-subtle)`), `--color-code-border` (`var(--color-overlay-default)`),
   `--color-code-fg` (`var(--color-text-secondary)`), `--color-code-line-number`
   (`var(--color-text-muted)`), `--color-code-label` (`var(--color-text-secondary)`).
2. **Light overrides** for those tokens in the `[data-theme="light"]` block: light surface
   (`#f6f8fa`), header bg (`#eaeef2`), border (`#d0d7de`), fg (`rgba(0,0,0,0.80)`), line-number
   (`rgba(0,0,0,0.45)`), label (`rgba(0,0,0,0.60)`).
3. **Rewire `CodeBlock.tsx` inline styles** to the new tokens (no markup change): container bg/border,
   header bg/border, summary + language label color, line-number gutter color/border, code content color.
4. **Update the shared editor code-block rule** in `editor-styles.css` (`.description-content pre`,
   `.editor-code-block`) to use `--color-code-surface/-border/-fg`.
5. **Delete the `[data-theme="light"]` `!important` override block** (`pre`/`editor-code-block` +
   the five `.rm-code-block*` rules) — now redundant because the tokens flip.
6. **Add a light Prism palette**: `[data-theme="light"] .rm-code-content .token.*` with GitHub-light
   hex (comment `#6a737d`, string `#032f62`, keyword `#d73a49`, number `#005cc5`, function `#6f42c1`,
   class-name/tag `#22863a`, property/attr-name `#005cc5`, variable/important `#e36209`, regex
   `#032f62`, builtin/symbol `#005cc5`, url `#032f62`, inserted `#22863a`, deleted `#b31d28`).
   `operator`/`punctuation` already reference theme tokens and auto-flip.
7. **Inline code contrast**: switch `.description-content code` / `.tiptap code` color to
   `var(--color-code-inline)` (already light/dark aware) so it is legible in both themes.
8. **Verify + tests**: existing `CodeBlock.test.tsx` / `renderMarkdown.test.tsx` cover collapsed/expanded
   rendering (markup unchanged). Visual check in both themes.

Note: the editor's `.editor-code-block` is plain StarterKit (no Prism token spans), so "consistent"
means surface/fg/border parity, not token colours — matching editor token highlighting is out of scope.

## Requirements

- [x] Light mode: code blocks use a **light surface** with a light-tuned syntax palette; dark mode keeps
      the dark treatment
- [x] The collapsed header label ("Code · N lines"), the language label, and the line-number gutter all
      meet readable contrast in both themes (no `rgba(255,255,255,0.35)`-style dim text)
- [x] Syntax highlighting (Prism tokens) is legible on whatever surface the block uses in each theme
- [x] Header/label colours follow semantic theme tokens instead of hardcoded hex + broad `!important`
      overrides where avoidable
- [x] Both code-block paths (rendered markdown **and** the rich editor) are consistent
- [x] Inline code contrast verified in both themes
- [ ] Visual verification in light **and** dark mode (use the `validate-ui` skill); tests cover the
      collapsed/expanded header rendering as applicable

## Out of Scope

- Adding new languages to Prism (`prismLoader.ts` language set is unchanged).
- Collapse/expand behaviour, line-numbering layout, or copy-to-clipboard features.
- Any non-code surface theming.

## Open Questions

- Which light syntax palette to map the existing token classes to (e.g. a GitHub-light-style mapping).
</content>
</invoke>
