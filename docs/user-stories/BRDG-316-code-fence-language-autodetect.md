# BRDG-316: Auto-detect language for untagged code fences

**Status:** Done
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

## Implementation Plan

A single pure detector is the linchpin: it must be reused by both the preload scan and the highlight
path so the grammar that gets preloaded is exactly the one used to highlight.

1. **New `src/components/ticket-detail/detectLanguage.ts`**: pure `detectFenceLanguage(code): string | null`.
   Weighted-scoring heuristic over the supported grammars (json via strict `JSON.parse`; javascript via
   `//`, `const/let/var/function`, `=>`, `;`, `===`/`&&`/`||`, `window.`/`document.`, `.method()`;
   markup; css; bash; yaml; python; sql). Accept the top scorer only if it clears an absolute minimum
   AND beats the runner-up by a margin; otherwise return `null` (conservative fallback). Empty/trivial
   input → `null`. (Checkboxes 1, 2.)
2. **`prismLoader.ts` — extend `extractCodeLanguages`** to walk fences in document order (line-walk
   mirroring renderMarkdown's fence toggling, not the tag-only regex). Tagged fence → `resolveLang(tag)`
   verbatim. Bare fence → `detectFenceLanguage(body)`; add the result if non-null. So `ensureLanguages`
   preloads the detected grammar. (Checkboxes 3, 4.)
3. **`renderMarkdown.tsx` — apply detection in `renderCodeBlock`**: split `headerLang` (to CodeBlock)
   from `highlightLang` (to `highlightCodeLine`). Tagged → both = `lang`. Bare → `headerLang=""`,
   `highlightLang = detectFenceLanguage(lines.join("\n")) || ""`. `highlightCodeLine` already falls back
   to escaped plain text when grammar is absent. (Checkboxes 1, 2, 4.)
4. **Fix the LRU cache staleness (critical for checkbox 3).** `markdownCache` is keyed only on
   `${linkifyRefs}:${text}` with no grammar dimension — after grammars load, a re-render returns the
   cached plain-text tree and highlighting never appears. Export a monotonic loaded-grammar generation
   from `prismLoader` (bumped in `loadLang` when a new grammar is added) and prefix the renderMarkdown
   cache key with it. Fixes this latent bug for tagged fences too. (Checkbox 3.)
5. **`CodeBlock.tsx` — no change.** With `headerLang=""` for inferred fences the header stays label-less
   ("Code · N lines"), so the label only ever reflects an author-written tag. Decision for checkbox 5:
   highlight inferred fences but do **not** show a fabricated language label. (Checkbox 5.)
6. **Tests**: `detectLanguage.test.ts` (confident json/js/css/yaml, ambiguous → null, adversarial
   near-miss → null); extend `renderMarkdown.test.tsx` (bare JS fence → token spans; bare JSON →
   token spans; ambiguous bare fence → plain text; tagged fence unaffected — preload Prism grammars in
   the test since renderMarkdown is synchronous); `prismLoader` unit test (bare JS fence →
   `["javascript"]`, ambiguous → `[]`). Use distinct fence bodies per test to avoid module-level cache
   cross-talk. (Checkbox 6.)

Decisions locked: inferred fences get no header label (step 5); JS (not TS) is the target for bare
JS-looking code; the cache fix (4a) is in scope because checkbox 3 cannot otherwise be guaranteed.

## Requirements

- [x] A bare ` ``` ` fence whose content is recognizably JS/JSON (and other supported grammars) is
      syntax-highlighted in both light and dark mode
- [x] Detection is conservative: ambiguous/low-confidence content falls back to today's plain-text
      rendering, never a confidently-wrong palette
- [x] The inferred grammar is loaded before render (no flash of unhighlighted code / no missing-grammar
      fallback for a language we claim to support)
- [x] Explicitly-tagged fences keep using the tag verbatim (detection only runs when the tag is absent)
- [x] Header label behaviour for inferred languages is decided and consistent
- [x] Tests cover: a bare JS fence highlights, a bare JSON fence highlights, an ambiguous/plain block
      falls back to plain text, and a tagged fence is unaffected

## Verification

- New `detectFenceLanguage` unit tests (12) cover json/js/css/yaml/bash/python/sql detection, the real
  `dataLayer` snippet → javascript, and conservative null cases (prose, trivial input, single keyword).
- `extractCodeLanguages` tests (5) confirm bare fences surface the detected grammar for preload and
  ambiguous bare fences surface nothing.
- `renderMarkdown` integration tests (5) confirm: bare JS fence → token spans, bare JSON → token spans,
  ambiguous bare fence → plain text, inferred fence shows no language label, tagged fence unaffected.
- Browser-verified in light AND dark mode (temp `/dev` harness): the bare `dataLayer` JS fence and a
  bare JSON fence highlight with no fabricated label; ambiguous prose stays plain; a tagged ` ```js `
  fence keeps its "JS" label.
- `eslint .`, `tsc --noEmit`, and the full test suite (5141 tests) pass.
- `npm run build`: NOT green at hand-off, blocked solely by an unrelated, concurrently-edited
  parallel-work file (`src/app/dev/sidebar/page.tsx`, a `react-hooks/static-components` error). No file
  in this story is involved; the build "Compiled successfully" and only that page fails next's lint.

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
