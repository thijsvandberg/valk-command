# BRDG-311: Collapsible code blocks in rendered markdown

**Status:** Done
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-300 (collapsible section headings), BRDG-244 (inline code toolbar button)

## Description

As a PO reading a ticket, a long fenced code block (e.g. a `dataLayer` push or an event
payload) takes over the whole screen and pushes the surrounding prose far down. I want to be
able to **collapse a code block** so I can keep reading the story and only expand it when I
actually need the code.

This must work **everywhere a code block renders**, not just on one ticket. In practice all the
styled code blocks (the dark block with the mac "traffic-light" dots and line numbers, as seen on
`VPL-46344`) come from a single renderer, so collapsing is added there once and applies to every
view that uses it: ticket descriptions, comments, story/draft previews, version preview and the
story-writer diff panes.

Example block to test against: `VPL-46344` (real long block). Use `VPL-1337` as the throwaway
ticket for manual verification.

## Behaviour

- Every rendered code block gets a **collapse / expand toggle** in its header bar (the row that
  already shows the traffic-light dots and the language label).
- **Collapsed** state shows the header bar plus a compact summary so the block is still
  recognisable and clickable — e.g. the language label and a line count ("`JS · 24 lines`"), with
  the code area hidden. The page reflows as if the code were gone.
- **Expanded** state is exactly today's rendering (line numbers + syntax highlighting).
- Clicking the toggle (and/or the header bar) switches between the two states. The control needs a
  clear chevron/affordance, hover + focus-visible states, and `cursor: pointer`.
- **Default state:** blocks render **expanded**, except blocks longer than a threshold (proposed:
  **> 15 lines**) start **collapsed** so long payloads don't dominate the view. Short blocks always
  start expanded. (Threshold is a single constant, easy to tune.)
- State is **per-block, in-memory** for the current view — collapsing a block does not need to
  persist across reloads or sync to Jira.

## Implementation notes (for the agent)

- The renderer is `renderCodeBlock(...)` in `src/components/ticket-detail/renderMarkdown.tsx`.
  `renderMarkdown` is a **pure, LRU-cached** function returning `ReactNode`, so collapse state
  cannot live inside it directly. Extract the code block into a small **client component** (e.g.
  `CodeBlock.tsx`) that owns `useState` for collapsed/expanded; `renderCodeBlock` renders that
  component. Keep the cache valid (the component instance manages its own state; cached nodes stay
  pure).
- Reuse existing tokens/styling already in `renderCodeBlock` (header bar, `--color-overlay-*`,
  line-number grid). Animate only `transform`/`opacity`; no `transition-all`.
- The default-collapsed threshold is computed from `lines.length`.
- Chat messages use a **separate** plainer `<pre>` in
  `src/components/chat/markdown-components.tsx` (no traffic-light header). **Out of scope** for this
  story — only the styled markdown blocks change.

## Implementation Plan

Collapse state lives in a new `"use client"` child component (`CodeBlock.tsx`) with `useState`, mirroring `ImageLightbox`. `renderMarkdown` stays a pure, LRU-cached function: it emits a `<CodeBlock />` element into the cached tree, and React gives each mount fresh state. Prism highlighting stays in the pure layer — `renderCodeBlock` precomputes sanitized HTML lines and passes them as props, so the client component only owns the toggle (no Prism in the toggle path, expanded output byte-identical to today).

**Scope resolution:** the only single styled renderer is `renderCodeBlock`, reached by every `renderMarkdown` consumer (ticket description, comments, story/draft preview, version preview, diff panes, story-writer `ChatMessageParts`). The "chat out of scope" item refers to the separate plainer `<pre>` in `src/components/chat/markdown-components.tsx`, which never calls `renderCodeBlock` — so it stays untouched automatically. No opt-out flag is added; every `renderMarkdown` view gets the toggle per requirement 6.

1. **Threshold constant** — module-level `const CODE_BLOCK_COLLAPSE_THRESHOLD = 15;` in `renderMarkdown.tsx` (single source of truth).
2. **`CodeBlock.tsx` (new, `"use client"`)** — props `{ lang, highlightedLines, lineCount, defaultCollapsed }`. `useState(defaultCollapsed)`. Header bar is a `<button>` (large hit target) with chevron affordance, `aria-expanded`, hover/focus-visible/active + `cursor-pointer`, chevron rotates via `transform` only. Collapsed: header + compact summary (`JS · 24 lines`), no code grid (page reflows). Expanded: exact current grid mapping over `highlightedLines`.
3. **Rewrite `renderCodeBlock`** — precompute `highlightedLines = lines.map(l => sanitizePrismOutput(highlightCodeLine(l, lang) || " "))`, `defaultCollapsed = lines.length > CODE_BLOCK_COLLAPSE_THRESHOLD`, return `<CodeBlock .../>`.
4. **Tests** — `CodeBlock.test.tsx`: default-collapsed-when-long, default-expanded-when-short, toggle both directions + `aria-expanded`, collapsed summary content; plus one wiring assertion in `renderMarkdown.test.tsx`.

Empty-language fallback label: `Code`; line count singularizes (`1 line`).

## Requirements

- [x] Each styled code block has a visible collapse/expand toggle in its header bar
- [x] Collapsed blocks hide the code and show a compact summary (language + line count) while the
      page reflows
- [x] Expanded state is unchanged from today (line numbers + highlighting)
- [x] Toggle has hover, focus-visible and active states and `cursor: pointer`
- [x] Blocks longer than the threshold start collapsed; short blocks start expanded
- [x] Behaviour applies to every view that uses `renderMarkdown` (ticket description, comments,
      story/draft preview, version preview, diff panes) via the shared renderer
- [x] Per-block state, in-memory only (no persistence, no Jira sync)
- [x] Tests cover: toggle expand/collapse, default-collapsed-when-long vs default-expanded-when-short,
      and the collapsed summary content

## Out of Scope

- The **chat** code block (plainer `<pre>` in `markdown-components.tsx`) — styled markdown blocks only.
- Persisting collapse state across reloads or per user.
- A global "collapse all / expand all" control.
- Changing syntax highlighting, the language label, or copy-to-clipboard behaviour.
