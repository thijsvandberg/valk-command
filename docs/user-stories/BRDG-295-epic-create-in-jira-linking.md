# BRDG-295: Epic Writer create-in-Jira and linking

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Done
**Priority:** High

## Description

As a PO, I want a per-card "Create in Jira" button that promotes a DRAFT card into a real Jira
issue under the epic, and I want inter-story links proposed by the AI that I confirm, so the
breakdown becomes real, linked Jira tickets when I am ready.

## Acceptance Criteria

- [x] Per-card "Create in Jira" button promotes a DRAFT card to a real Jira issue under the epic
- [x] Created issue is automatically linked to the epic (epic-child)
- [x] Card state shows DRAFT vs created (Jira key visible after creation)
- [x] `epic_child_draft` updates: `status: created`, `jiraKey` set
- [x] AI-proposed inter-story links (`suggestedLinks`) are shown; PO confirms each before it is
      created in both local DB and Jira
- [x] Nothing reaches Jira until "Create in Jira" / link confirmation is pressed
- [x] Tests for: create-in-jira promotion, epic-child link, suggested-link confirm/skip

## Implementation notes

- Epic-child link is established at creation via `jiraClient.createIssue({ parentKey: epicKey })`
  (modern Jira hierarchy), so no separate link call is needed.
- `create-in-jira` accepts a `placement` (sprint id | `__backlog__` | `__default__`) so the
  placement menu is wired end to end; the actual `moveToSprint` lands in BRDG-296.
- `link-children` requires both ends to be `created` (real Jira keys) and is idempotent on the
  local link rows; it marks the matching `suggestedLink.confirmed` on the source card.

## Technical Notes

- Route `create-in-jira` reuses `create-draft` -> `syncDraftToJira` and `ticketLink` (as split
  mode does). `link-children` creates confirmed inter-story links.
- Placement menu is part of this story's "Create in Jira" UI; sprint wiring lands in BRDG-296.

## Dependencies

[BRDG-293](BRDG-293-epic-breakdown-generation.md) (cards). Detailing ([BRDG-294](BRDG-294-epic-child-story-detailing.md)) is optional before creation.
