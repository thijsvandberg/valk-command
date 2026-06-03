# BRDG-268: Pushing a draft to Jira drops or mangles checkboxes, images, and mentions

**Status:** Not Started
**Priority:** High
**Type:** Bugfix

## Description

As a PO, I want valid content in a story draft to push to Jira as the real Jira element, so that checkboxes, images, and mentions are not silently turned into dead text when I push.

`markdownToAdf` (`src/lib/markdown-to-adf.ts`) converts the editor draft to ADF on push. It supports the common blocks (headings, lists, code, tables, callouts, expand, quote, marks), but a few elements that legitimately appear in drafts are not converted and end up as plain text or mangled. Combined with `adfToMarkdown` on the read side, this also breaks round-trips: content that reads back as markdown does not survive being pushed again.

This story is the write-direction counterpart of BRDG-267 (which covers content dropped on read). They share the same risk - a read -> edit -> push cycle corrupting untouched content - so they should be verified together with a bidirectional round-trip test even though they are separate stories.

## Affected content

- **Task-list checkboxes** (the standout). `markdownToAdf` matches `- [ ]` / `- [x]` with the generic bullet rule (line 134, `parseListBlock`), so the item text becomes literal `[ ] ...` / `[x] ...` and no `taskList`/`taskItem` is produced. Jira checklists (common in acceptance criteria / definition of done) are therefore destroyed on push. Round-trip is broken: `adfToMarkdown` emits `- [x]` / `- [] ` from a Jira `taskList`, but pushing that back yields plain bullets with literal brackets. (Minor related bug: `adfToMarkdown` `convertTaskList` emits `- [] ` for TODO instead of the standard `- [ ]`, `src/lib/adf-to-markdown.ts` ~line 236.)
- **Images** (`![alt](url)`). `parseInline` has no image rule, so `!` is emitted as plain text followed by a normal link. An inline image in the description is lost on push. (Real attachments are managed via Jira's attachment API, not description text, so full image authoring is out of scope - but the description should at least not be corrupted.)
- **@mentions**. No mention parsing; `@name` stays plain text rather than becoming a Jira `mention` node, so a mention read from Jira degrades to dead text on the next push.

## Also: invalid-ADF push failure

- **Nested expand**. `markdownToAdf` will happily nest an `expand` inside an `expand` (the fence parser tracks depth), but Jira ADF only allows `nestedExpand` inside an `expand`; a real `expand`-in-`expand` document can be rejected, failing the whole push. The editor already prevents *creating* nested expands, but an AI draft or pasted content can still contain them. Lower likelihood, different flavor (hard fail vs silent loss) - fix opportunistically or note as known limitation.

## Expected behaviour

- A draft containing `- [ ]` / `- [x]` items pushes to Jira as a real task list with the right checked state; a round-trip of a Jira checklist preserves it.
- An inline image reference does not corrupt the pushed description (best effort: preserved as a link/placeholder rather than mangled `!` + link).
- A mention read from Jira survives a push without becoming dead text (at minimum: not corrupted; ideally re-emitted as a `mention` node).
- A nested expand either converts to valid ADF (`nestedExpand`) or is flattened, but never produces a push Jira rejects.

## Proposed approach

- Add task-list handling to `markdownToAdf`: detect `- [ ]` / `- [x]` (and `* [ ]`) at list-parse time and emit `taskList` / `taskItem` with `state: TODO|DONE` instead of bullet `listItem`s. Fix the `- [] ` -> `- [ ]` emission on the read side so the round-trip is symmetric.
- Decide a minimal, non-corrupting representation for images and mentions on push (e.g. keep images as a link; re-emit known mention syntax as a `mention` node if attrs are recoverable, else leave as text). Do not attempt attachment upload here.
- For nested expand, convert inner `expand` to `nestedExpand` or flatten; ensure the output validates.
- Add a bidirectional round-trip test (shared with BRDG-267) asserting that read -> push of a representative ADF document - including a task list - returns equivalent content.

## Out of scope

- The wiki-markup-vs-fence formatting convention (BRDG-266).
- Content dropped when reading ADF (dates, status lozenges, layout columns) - BRDG-267.
- Uploading real image attachments via the Jira attachment API.

## Technical notes

- `src/lib/markdown-to-adf.ts`: list detection at line 134, `parseListBlock` (~245), `parseInline` link rule (~451), plain-text rule (~463).
- `src/lib/adf-to-markdown.ts`: `convertTaskList` (~231), `media` (~111), `mention` (~122).

## Checklist

- [ ] Reproduce: a draft with `- [ ]` / `- [x]` pushes as bullets with literal `[ ]` text, not a Jira task list
- [ ] `markdownToAdf` emits `taskList`/`taskItem` for checkbox items with correct state
- [ ] Fix `adfToMarkdown` TODO emission to `- [ ]` so the round-trip is symmetric
- [ ] Images and mentions: non-corrupting representation on push (no mangled `!` + link)
- [ ] Nested expand never produces ADF that Jira rejects
- [ ] Bidirectional round-trip test (shared with BRDG-267) passes, including a task list
- [ ] All tests pass, build succeeds
