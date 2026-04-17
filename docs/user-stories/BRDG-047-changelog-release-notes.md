# BRDG-047: Changelog / Release Notes View

**Status:** Open
**Priority:** Low

## Description

As the PO, I want an auto-generated changelog view per sprint that groups completed stories by epic, includes PR links, and can be exported as release notes for stakeholders.

## Implementation Plan

1. **API route** (`src/app/api/reports/changelog/route.ts`): `GET /api/reports/changelog?sprint=SPRINT_ID`. Loads sprint metadata from `appSetting` key `"jira_sprints"`, queries DONE tickets in that sprint, strips ADF description to 200-char plain text, cleans Jira key prefix from titles, joins `pipeline_run` for PR links (deduped by `prUrl`), groups by epic, returns `ChangelogResponse`.

2. **Export utilities** (`src/lib/changelog-export.ts`): Pure functions `buildChangelogMarkdown()` and `buildChangelogPlainText()`. Markdown includes PR links; plain text omits them. Both accept optional `excludeKeys` set for selective export.

3. **Changelog page** (`src/app/(app)/reports/changelog/[sprintId]/page.tsx` + `src/components/changelog/ChangelogView.tsx`): Client component consuming the API via SWR. Sprint metadata header, epic sections with ticket entries, per-ticket checkboxes, Copy Markdown / Copy as Text export buttons.

4. **SprintBoard integration** (`src/components/sprint-board/SprintBoard.tsx`): Add "Release Notes" item to header menu dropdown, visible only for closed sprints. Navigate to `/reports/changelog/{sprintId}`.

5. **SprintListModal integration** (`src/components/sprint-board/SprintListModal.tsx`): Add a Release Notes icon button in the History tab sprint rows (closed sprints only).

6. **Documentation** (`docs/architecture/api-routes.md`): Add Reports section with the new route.

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
