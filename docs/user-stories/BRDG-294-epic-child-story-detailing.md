# BRDG-294: Epic child-story detailing

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Not Started
**Priority:** Medium

## Description

As a PO, I want to deepen one or more breakdown cards from a bullet list into a fully worked-out
story (description + acceptance criteria), so the stories are ready before I create them in Jira.

## Acceptance Criteria

- [ ] "Deepen" action per card asks the AI to produce a full body + AC (`<story-detail>` block)
- [ ] Detailing can run for one or several cards in parallel
- [ ] Reuses the existing single-story `write-story-draft` path so a child can graduate into a full
      Story Writer-style draft
- [ ] `epic_child_draft.body` is filled on detailing; depth badge updates (title / bullets / full)
- [ ] Detailed content is editable and persists across resume
- [ ] Sparring can refine a detailed card further
- [ ] Tests for: detail-output parsing, body persistence, depth badge transitions

## Technical Notes

- `apply-output` extends to parse `<story-detail>` (named per card/index).
- Keep the deepen path aligned with `write-story-draft` so a card can later open as a full session.

## Dependencies

[BRDG-293](BRDG-293-epic-breakdown-generation.md) (cards must exist to deepen).
