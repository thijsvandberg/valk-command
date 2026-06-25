# BRDG-262: Story writer draft must contain only story content, no leaked markup

**Status:** Archived (not reproduced) — 2026-06-25
**Priority:** Medium
**Type:** Bugfix

> Archived without implementation: the leaked `</thinking>` markup in story drafts is no longer observed in practice. Reopen if the artefact reappears in a draft preview.

## Description

As a PO, I want the story writer draft preview to contain only the proposed story content, so that no AI-internal or structural markup that was never meant to be part of the story ends up in the draft I review, accept, and push to Jira.

The concrete trigger: in the "Draft preview" (AI Draft) the draft sometimes ends with a literal `</thinking>` tag rendered as visible text at the bottom of the body (see screenshot for VPL-46242, a standalone `</thinking>` line under the Acceptance Criteria). But the real problem is broader than that one tag: the draft is extracted from the model output by only matching the `<story-draft>` wrapper and is otherwise passed through unfiltered. So any artefact the model emits inside (or bleeding into) that block, that is not actual story content, can leak into the draft.

## Examples of non-content that can leak

- Reasoning markup: `<thinking>` / `</thinking>` (the observed case), and stray openers/closers without their pair.
- Other control/structural tags meant for the pipeline rather than the story (e.g. skill/agent markup, leftover wrapper fragments).
- Instruction or meta remnants the model accidentally includes around the actual content.

The point of the story is the principle, not an exhaustive list: the draft should be sanitized down to story content, with a clear, maintainable place to add known artefact patterns as we discover them.

## Expected behaviour

- The draft preview shows only the story content. No reasoning tags, control/structural tags, or other non-content markup appear as visible text.
- This holds for both the original draft and the target draft (split mode).
- The sanitized text is what gets persisted and pushed to Jira on Accept, not just hidden at render time.
- Normal story content (including legitimate markdown and code blocks) is left untouched.

## Out of scope

- Changing how the AI produces drafts or whether extended thinking is enabled.
- Re-implementing tag stripping that already lives elsewhere for chat (e.g. `stripLinkSuggestionTags`); reuse the pattern, don't duplicate behaviour.

## Technical notes

- Root cause: `extractStoryDraft` / `extractStoryDrafts` in `src/lib/story-draft-parser.ts` only match the content between `<story-draft>` tags and `.trim()` it. There is no sanitization step, so anything non-content inside the block survives. The uncleaned text is saved (`src/app/api/tickets/[key]/story-writer/apply-draft/route.ts`, around lines 72-123) and rendered verbatim by `src/components/story-writer/panes/apps/DraftPreviewApp.tsx` (line 74 via `renderMarkdown`).
- Suggested approach: introduce a single `sanitizeDraft()` step in `story-draft-parser.ts`, applied to both original and target drafts before returning. Drive it from a small, named list of artefact patterns (starting with `<thinking>...</thinking>` blocks and stray `<thinking>`/`</thinking>`) so new known-bad patterns can be added in one place. Apply at the parser choke point so persisted + pushed content is clean, not just the preview.
- Precedent for the stripping pattern: `stripLinkSuggestionTags` in `src/components/story-writer/ChatMessageParts.tsx` (lines 97-100).

## Checklist

- [ ] Reproduce: a draft containing a `</thinking>` (or full `<thinking>...</thinking>`) tag shows the tag as visible text in the preview
- [ ] Add a `sanitizeDraft()` step in `story-draft-parser.ts`, driven by a named list of artefact patterns, applied to both original and target drafts
- [ ] Cover the thinking-tag case (full block + stray open + stray close) and leave a clear place to extend the pattern list
- [ ] Verify the sanitized text is what gets persisted (apply-draft) and rendered (DraftPreviewApp)
- [ ] Tests: parser strips known artefact patterns; leaves normal content (incl. markdown and code blocks) untouched
- [ ] All tests pass, build succeeds
