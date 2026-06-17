# BRDG-268: Pushing a draft to Jira drops or mangles checkboxes, images, and mentions

**Status:** Completed + archived (2026-06-17). The previously-red parallel failures (`push-to-jira/route.test.ts`, `SprintAnalytics.test.tsx`) now pass; serializer + round-trip suites green (59/59).
**Priority:** High
**Type:** Bugfix

## Status notes

- Implemented jointly with BRDG-267. Commits: `3a493e48` (read side), `2f240e42` (write side), `99f6369c` (round-trip test), `7c64f1e8` (docs).
- `npm run build` passes; the serializer + round-trip suites pass (59/59).
- The full `npm run test` has 5 failures in two files that are **unrelated parallel work**, not this change: `push-to-jira/route.test.ts` (a 3rd arg was added to `pushToJira` by another session) and `SprintAnalytics.test.tsx` (`MetricBadge`/`activeSortDir`). Archive both 267 and 268 once the shared tree is green.
- Follow-up noted: a real Jira `mention` node needs an accountId that markdown does not carry; `@name` is preserved as text for now.

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

## Implementation Plan

Implemented jointly with BRDG-267 (shared serializer contract + one round-trip test). See BRDG-267 for the full ordered sequence. Write-direction steps (this story):

1. **Task lists** (`markdown-to-adf.ts`): in the main loop, before the generic list branch, detect a task-item first line (`/^[-*]\s+\[( |x|X)\]\s/`) and route to a new `parseTaskListBlock`. Emit `taskList` (with `localId`) of `taskItem` nodes (`attrs: { localId, state: TODO|DONE }`, content = `parseInline(itemText)`). Paired with the read-side `"- [ ] "` fix so the round-trip is symmetric.
2. **Images `![alt](url)`** (`parseInline`): add an image rule *before* the link rule that matches `/^!\[(.*?)\]\((.+?)\)/` and emits the whole match as one plain `text` node. Conservative, byte-stable, non-corrupting (no real media upload from markdown). Fixes the current mangled `!` + link.
3. **@mentions:** `@name` already passes through as plain text (the plain-text run includes `@`), so it is non-corrupting today. A real `mention` node needs an accountId markdown does not carry, so passthrough is the honest outcome - covered by a test, no code change. Noted as a follow-up.
4. **Nested expand** (`markdownToAdf` fence handling): when an `expand` fence's inner content contains `expand` children, demote them to `nestedExpand`; flatten anything deeper than one nesting level so the output validates (Jira allows only `nestedExpand` directly inside `expand`).
5. **Shared round-trip test** (see BRDG-267 step 4), including a task list.

Risk notes: `taskItem`/`taskList` need `localId` for Jira to accept the push (criteria didn't mention it; generated here). Image/mention "ideal" Jira nodes are unreachable from markdown alone (no file/account id) - passthrough is the correct conservative choice.

## Checklist

- [x] Reproduce: a draft with `- [ ]` / `- [x]` pushes as bullets with literal `[ ]` text, not a Jira task list - captured as regression test
- [x] `markdownToAdf` emits `taskList`/`taskItem` for checkbox items with correct state (with `localId`s)
- [x] Fix `adfToMarkdown` TODO emission to `- [ ]` so the round-trip is symmetric
- [x] Images and mentions: non-corrupting representation on push (no mangled `!` + link) - image preserved verbatim; `@mention` passes through as text (real mention node needs an accountId markdown lacks - noted as follow-up)
- [x] Nested expand never produces ADF that Jira rejects - inner `expand` demoted to `nestedExpand`, deeper nesting flattened
- [x] Bidirectional round-trip test (shared with BRDG-267) passes, including a task list (`src/lib/adf-markdown-roundtrip.test.ts`)
- [x] All tests pass, build succeeds - serializer + round-trip suites pass (59/59); see Status notes re: full-suite/build
