# BRDG-295: Epic Writer create-in-Jira and linking

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Not Started
**Priority:** High

## Description

As a PO, I want a per-card "Create in Jira" button that promotes a DRAFT card into a real Jira
issue under the epic, and I want inter-story links proposed by the AI that I confirm, so the
breakdown becomes real, linked Jira tickets when I am ready.

## Acceptance Criteria

- [ ] Per-card "Create in Jira" button promotes a DRAFT card to a real Jira issue under the epic
- [ ] Created issue is automatically linked to the epic (epic-child)
- [ ] Card state shows DRAFT vs created (Jira key visible after creation)
- [ ] `epic_child_draft` updates: `status: created`, `jiraKey` set
- [ ] AI-proposed inter-story links (`suggestedLinks`) are shown; PO confirms each before it is
      created in both local DB and Jira
- [ ] Nothing reaches Jira until "Create in Jira" / link confirmation is pressed
- [ ] Tests for: create-in-jira promotion, epic-child link, suggested-link confirm/skip

## Technical Notes

- Route `create-in-jira` reuses `create-draft` -> `syncDraftToJira` and `ticketLink` (as split
  mode does). `link-children` creates confirmed inter-story links.
- Placement menu is part of this story's "Create in Jira" UI; sprint wiring lands in BRDG-296.

## Dependencies

[BRDG-293](BRDG-293-epic-breakdown-generation.md) (cards). Detailing ([BRDG-294](BRDG-294-epic-child-story-detailing.md)) is optional before creation.
