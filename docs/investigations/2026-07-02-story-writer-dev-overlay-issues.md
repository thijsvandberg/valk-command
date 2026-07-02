# Story Writer dev-overlay issues (pre-existing, spotted during BRDG-460 verification)

Date: 2026-07-02. While visually verifying BRDG-460 on `/tickets/VPL-1337/write`, the
Next.js dev overlay reported 2 issues. Both are unrelated to BRDG-460 (they sit in
components the story did not touch) and are logged here for later pickup.

## 1. Nested button hydration error in the link-suggestions card

React error: `<button> cannot be a descendant of <button>. This will cause a hydration
error.`

Stack: `RelatedStoriesInline` → `SuggestionCard` renders a header toggle `<button>`
(`flex min-h-8 w-full items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle ...`) that
contains the "Open in side panel" `<button>` (aria-label "Open in side panel").

Files: `src/components/story-writer/SuggestionCard.tsx` (header toggle) and the header
content passed from `src/components/story-writer/RelatedStoriesInline.tsx` (or via
`headerRight`).

Fix direction: make the outer toggle a non-button element with `role="button"` handling,
or move the side-panel button out of the toggle (sibling, absolutely positioned). Small,
self-contained fix; needs its own story/commit since it changes interactive markup.

## 2. Tiptap duplicate extension warning

`[tiptap warn]: Duplicate extension names found: ['link']` on the Story Writer editor.
Likely StarterKit (or another bundle) already registers a `link` extension while the
editor config adds `Link` explicitly. Harmless today but can cause config drift; dedupe
by disabling one of the two registrations in the RichEditor/Tiptap setup.
