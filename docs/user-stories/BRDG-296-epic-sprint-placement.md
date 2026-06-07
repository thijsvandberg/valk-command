# BRDG-296: Epic Writer sprint placement

**Epic:** [BRDG-291](BRDG-291-epic-writer.md)
**Status:** Done
**Priority:** Medium

## Description

As a PO, I want to choose where a story goes when I create it in Jira (a specific sprint, the
backlog, or the default sprint), and reassign sprints afterwards, so I can plan the epic's stories
into sprints from within the Epic Writer.

## Acceptance Criteria

- [x] "Create in Jira" placement menu offers: specific sprint, "to be planned" (backlog), default sprint
- [x] Sprint list fed by `GET /api/jira/sprints`
- [x] "Default sprint" reuses the existing setting `default_sprint_id`
      (`GET /api/settings/default-sprint`); empty value means backlog
- [x] Assignment uses the existing `POST /api/jira/move-sprint` -> `moveToSprint`; backlog leaves
      the sprint empty
- [x] Sprint controls only appear once a card is live in Jira (a DRAFT cannot be assigned)
- [x] Reassigning a created card's sprint works after creation
- [x] AI `<sprint-plan>` suggestion can pre-fill placement choices (PO confirms)
- [x] Created card shows its current sprint (from `ticket.sprintName` / `sprintNameCache`)
- [x] Tests for: placement on create (sprint/backlog/default), post-create reassignment

## Technical Notes

- Reuse existing sprint plumbing entirely (`/api/jira/sprints`, `/api/jira/move-sprint`,
  `ticket.sprintName`, `sprintNameCache`). No new sprint infrastructure.
- `<sprint-plan>` parsing extends `apply-output`.

## Dependencies

[BRDG-295](BRDG-295-epic-create-in-jira-linking.md) (a story must be live in Jira to be placed).
