# BRDG-047: Changelog / Release Notes View

**Status:** Open
**Priority:** Low

## Description

As the PO, I want an auto-generated changelog view per sprint that groups completed stories by epic, includes PR links, and can be exported as release notes for stakeholders.

## Acceptance Criteria

### Phase 1: Changelog generation
- [ ] API route `GET /api/reports/changelog?sprint=SPRINT_ID`
- [ ] Returns completed tickets grouped by epic
- [ ] Each entry: ticket title (cleaned, no Jira key prefix), description summary (first 200 chars), PR links

### Phase 2: Changelog page
- [ ] Accessible from Sprint Board as "Release Notes" action on completed sprints
- [ ] Clean, readable layout with epic sections
- [ ] Each ticket entry with title, short description, and linked PRs (from Bitbucket data)
- [ ] Sprint metadata header: name, dates, velocity stats

### Phase 3: Export
- [ ] "Copy as Markdown" button
- [ ] "Copy as plain text" button (stakeholder-friendly, no technical details)
- [ ] Markdown version includes PR links; plain text version omits them
- [ ] Optional: include/exclude specific tickets via checkboxes before export

## Technical Notes

- Reuse ticket data + Bitbucket PR data already available
- "Completed" = tickets with status in done category at sprint close
- Description summary: strip markdown formatting, take first 200 characters
- Group by epic; tickets without epic go under "Other"

## Out of Scope (for now)
- Automated posting to Slack/email
- Changelog history across sprints
- Semantic versioning integration
- Customer-facing release notes (different audience)
