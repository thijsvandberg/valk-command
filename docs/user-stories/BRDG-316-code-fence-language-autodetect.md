# BRDG-316: Auto-detect language for untagged code fences

**Status:** Draft
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-314 (theme-aware code blocks), `renderMarkdown.tsx`, `prismLoader.ts`, `CodeBlock.tsx`

## Description

As a PO reading tickets, I want code blocks to be syntax-highlighted even when the author pasted
them with a **bare ` ``` ` fence** (no language tag). Today such blocks render as flat monospace text
in both themes, which is hard to scan, especially for the JS/JSON snippets that show up most often in
this project.

Trigger: a ticket description contained a `window.dataLayer.push({...})` JavaScript block inside a
bare ` ``` ` fence. It rendered with no colours and no language label, even though the content is
clearly JavaScript.

## Current behaviour (root cause)

In `src/components/ticket-detail/renderMarkdown.tsx`:

- The fence language is parsed as `codeBlockLang = line.slice(3).trim()` (the text after ` ``` `). A
  bare fence yields `""`.
- `highlightCodeLine(code, lang)` short-circuits on `if (!lang || !code) return safeEscapeHtml(code)`,
  so with no language there is no grammar to tokenize with and the line is emitted as plain escaped
  text. No `.token` spans, hence no colours in either theme.
- `CodeBlock.tsx` only shows a language label when `lang` is truthy, so a bare fence also has no header
  label (the visible tell).

This is independent of BRDG-314, which only changed code-block colours, not language detection.

## Approach (decided)

**Content-based auto-detection.** When a fence has no language tag, infer one from the snippet content
(restricted to the already-supported Prism grammars in `prismLoader.ts`: js/ts/json/html/css/bash/
python/sql/yaml/etc.) and highlight with the inferred grammar. Keep the heuristic lightweight and
conservative: if confidence is low, fall back to the current plain-text rendering rather than
mis-highlighting (e.g. colouring a bash block as JavaScript).

(Considered: defaulting every bare fence to JavaScript — simpler but mis-highlights non-JS snippets;
rejected in favour of detection.)

## Design notes / constraints

- **Grammar loading is async, highlighting is sync.** `highlightCodeLine` runs in the pure render
  layer and needs the Prism grammar already loaded. Consumers currently call `extractCodeLanguages` +
  `ensureLanguages` before render (it only scans *declared* fence languages). Detection must feed the
  inferred language into that pre-load step (e.g. `extractCodeLanguages` also infers for bare fences),
  or a small common set (js/json) must be preloaded, so the grammar is present when the fence renders.
- **Detection must be deterministic and cheap** (no heavy statistical library unless separately
  agreed) so renderMarkdown's cached output stays pure and fast.
- **Label honesty:** decide whether an inferred language shows in the header (e.g. a subtle
  "JS" label) or whether the block highlights without claiming a language. Pick one and apply it
  consistently.
- **Scope to the rendered-markdown path** (`renderMarkdown` / `.rm-code-content`). The rich-editor
  code block has no Prism highlighting at all (plain StarterKit), so it is unaffected and out of scope.

## Requirements

- [ ] A bare ` ``` ` fence whose content is recognizably JS/JSON (and other supported grammars) is
      syntax-highlighted in both light and dark mode
- [ ] Detection is conservative: ambiguous/low-confidence content falls back to today's plain-text
      rendering, never a confidently-wrong palette
- [ ] The inferred grammar is loaded before render (no flash of unhighlighted code / no missing-grammar
      fallback for a language we claim to support)
- [ ] Explicitly-tagged fences keep using the tag verbatim (detection only runs when the tag is absent)
- [ ] Header label behaviour for inferred languages is decided and consistent
- [ ] Tests cover: a bare JS fence highlights, a bare JSON fence highlights, an ambiguous/plain block
      falls back to plain text, and a tagged fence is unaffected

## Out of Scope

- Adding new Prism grammars beyond the set already in `prismLoader.ts`.
- Any change to the rich-editor (`.editor-code-block`) highlighting.
- Code-block theming/colours (delivered in BRDG-314).

## Open Questions

- Which detection strategy: a small hand-rolled heuristic (keyword/shape signals) vs a lightweight
  detector dependency? Prefer no new dependency if a heuristic is good enough for the common JS/JSON/
  HTML/CSS/bash/yaml cases.
- Should inferred languages be visually marked as "detected" so it's clear the tag was guessed?
</content>
