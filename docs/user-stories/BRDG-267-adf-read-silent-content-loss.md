# BRDG-267: Reading a Jira ticket silently drops some content, which can delete it on push

**Status:** Implemented + verified (build + serializer/round-trip suites green); archive deferred while unrelated parallel test failures are red
**Priority:** High
**Type:** Bugfix

## Status notes

- Implemented jointly with BRDG-268. Commits: `3a493e48` (read side), `2f240e42` (write side), `99f6369c` (round-trip test), `7c64f1e8` (docs).
- `npm run build` passes; the serializer + round-trip suites pass (59/59).
- The full `npm run test` has 5 failures in two files that are **unrelated parallel work**, not this change: `push-to-jira/route.test.ts` (a 3rd arg was added to `pushToJira` by another session) and `SprintAnalytics.test.tsx` (`MetricBadge`/`activeSortDir`). Archive both 267 and 268 once the shared tree is green.

## Description

As a PO, I want every part of a Jira ticket's description to survive being read into the story writer, so that editing and pushing a draft never silently deletes content that I never touched.

When the app reads a Jira description, `adfToMarkdown` converts the ADF document to markdown. Several ADF node and mark types are not handled and fall through to a default that returns an empty string. That content disappears from the markdown the PO and the AI see. Because the story writer then edits that markdown and pushes it back as the full new description, anything that was dropped on read is **gone from the ticket** after the next push.

This is more dangerous than a formatting glitch: it is invisible (no marker, no warning) and it is destructive on round-trip, not just cosmetic.

## Affected content

In `src/lib/adf-to-markdown.ts`, `convertNode` has no case for these, so they hit the default branch (`if (node.text) ...; if (node.content) ...; return ""`):

- **Date nodes** (`date`, attrs `timestamp`) - no `text`, no `content` -> dropped entirely.
- **Status lozenges** (`status`, attrs `text`/`color`) - the label lives in `attrs.text`, not `node.text` -> dropped entirely.
- **Layout columns** (`layoutSection` / `layoutColumn`) - children are extracted but the column structure is flattened, so a two/three-column layout silently collapses into a single run of content.
- **Decision lists** (`decisionList` / `decisionItem`) - rendered as bare text, losing the decision semantics.
- **Marks** `underline` and `subsup` - explicitly dropped in `applyMarks` (no markdown equivalent), so underlined / super-subscript text loses its formatting on read.

(Date and status are the clearest data-loss cases; the rest are degradations of varying severity.)

## Expected behaviour

- No description content disappears silently when a ticket is read into the story writer.
- Date and status content is preserved as readable text so it survives a read -> edit -> push round-trip (e.g. a status lozenge becomes its label text, a date becomes its formatted/ISO value).
- Where a structure cannot be represented in markdown (layout columns, decisions), its **text content** is preserved even if the structure is not, rather than being emptied.
- A round-trip read -> push of an unedited description does not remove any content.

## Proposed approach

- Add explicit `convertNode` cases for `date` and `status` that emit their value/label as text (date: format `attrs.timestamp`; status: emit `attrs.text`). Pick a representation that survives `markdownToAdf` on the way back without corrupting it.
- For `layoutSection`/`layoutColumn` and `decisionList`/`decisionItem`, at minimum recurse into children so their text is preserved (no empty output); deciding on a structural representation is optional and can be deferred.
- Consider a guard/test that asserts a read -> push round-trip of a representative ADF document does not lose text nodes, so future unhandled types are caught.
- Out of scope: full fidelity for layout columns and decisions (structural round-trip). The bar here is "no silent loss", not "perfect representation".

## Out of scope

- Producing these elements from the writer (we are fixing the read direction). Authoring status/date/layout from markdown is a separate concern.
- The wiki-markup-vs-fence formatting issue (BRDG-266).
- The write-direction converter gaps - checkboxes, images, @mentions, nested expand - are tracked in BRDG-268. The two stories share the same round-trip risk and should be verified together with a bidirectional round-trip test.

## Technical notes

- File: `src/lib/adf-to-markdown.ts`, `convertNode` (switch ends at the `default` branch around lines 140-145) and `applyMarks` (underline/subsup around lines 202-207).
- Read path that feeds the story writer: `selectCurrentDescription` / `buildFirstMessageBody` in `src/lib/story-writer-messages.ts` use the converted description as the AI's baseline; the same converted text is what the editor shows and what gets pushed back via `markdownToAdf`.

## Implementation Plan

Implemented jointly with BRDG-268 (shared serializer contract + one round-trip test). Ordered sequence:

1. **Task lists (cross-story dependency, first):** read side - fix `convertTaskList` TODO prefix `"- [] "` -> `"- [ ] "` (adf-to-markdown.ts ~236). Write side (268) emits `taskList`/`taskItem`. The two must agree.
2. **Read-direction node coverage** (`adf-to-markdown.ts` `convertNode`, new cases before `default`):
   - `date` (attrs.timestamp epoch ms) -> emit `{date:<ms>}` token (mirrors the existing `{color:...}` convention; round-trips via a matching `parseInline` rule). Plain-text fallback if no timestamp.
   - `status` (attrs.text/color) -> emit `{status:<color>|<text>}` token; color constrained to the ADF enum (neutral/green/yellow/red/blue/purple), default neutral. The `{...}` wrapper prevents the label being re-detected as a heading/list block on write.
   - `layoutSection`/`layoutColumn` -> explicit cases returning child text (with block separation) instead of relying on the `default` branch.
   - `decisionList`/`decisionItem` -> explicit cases preserving child text (newline-separated). Structure not preserved (out of scope); text is.
   - `underline`/`subsup` marks -> decision: keep text, drop the mark (markdown has no equivalent). Made explicit + tested.
3. **Write-direction re-parse rules** (268, `markdown-to-adf.ts` `parseInline`): `{date:...}` and `{status:...|...}` rules so the new tokens round-trip back to ADF nodes.
4. **Shared bidirectional round-trip test** `src/lib/adf-markdown-roundtrip.test.ts`: representative ADF (paragraph, headings, lists, task list TODO+DONE, table, panel, date, status, decisionList, underline/subsup) asserting adf->md->adf preserves all **text** (text-level compare, since marks/structure may legitimately differ) and md->adf->md is second-pass stable.

Notes / risks: the round-trip is content-stable (text preserved), not byte-stable - marks like underline are intentionally lost. `{date}`/`{status}` tokens render as literal text in non-Jira markdown previews (acceptable for fidelity).

## Checklist

- [x] Reproduce: a ticket whose description contains a date and a status lozenge loses them when opened in the story writer - captured as regression tests in `adf-to-markdown.test.ts` (the date/status nodes that previously dropped now emit `{date:...}`/`{status:...}`)
- [x] Add `convertNode` cases for `date` and `status` that preserve their text and survive a round-trip back through `markdownToAdf` (`{date:<ms>}`, `{status:<color>|<text>}` + matching `parseInline` rules)
- [x] Ensure `layoutSection`/`layoutColumn` and `decisionList`/`decisionItem` preserve child text rather than emptying
- [x] Decide handling for `underline`/`subsup` marks (preserve text at minimum) - text kept, mark dropped; made explicit + tested
- [x] Add a round-trip test asserting no text content is lost for a representative ADF document (`src/lib/adf-markdown-roundtrip.test.ts`)
- [x] All tests pass, build succeeds - serializer + round-trip suites pass (59/59); see Status notes re: full-suite/build
