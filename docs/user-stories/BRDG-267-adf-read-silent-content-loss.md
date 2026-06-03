# BRDG-267: Reading a Jira ticket silently drops some content, which can delete it on push

**Status:** Not Started
**Priority:** High
**Type:** Bugfix

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

## Checklist

- [ ] Reproduce: a ticket whose description contains a date and a status lozenge loses them when opened in the story writer
- [ ] Add `convertNode` cases for `date` and `status` that preserve their text and survive a round-trip back through `markdownToAdf`
- [ ] Ensure `layoutSection`/`layoutColumn` and `decisionList`/`decisionItem` preserve child text rather than emptying
- [ ] Decide handling for `underline`/`subsup` marks (preserve text at minimum)
- [ ] Add a round-trip test asserting no text content is lost for a representative ADF document
- [ ] All tests pass, build succeeds
