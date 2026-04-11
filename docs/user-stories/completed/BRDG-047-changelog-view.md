# BRDG-047: Changelog / Release Notes View

**Status:** Open
**Priority:** Low

## Description

As the PO, I want an auto-generated changelog view per sprint that groups completed stories by epic/category and can be exported as release notes for stakeholders.

## Core Concepts

- **Sprint changelog**: List of all "Done" tickets in a sprint, grouped by epic for logical organization
- **Entry format**: Each entry shows the ticket title plus a short summary (first 200 characters of description or acceptance criteria)
- **PR links**: Include Bitbucket PR links for each ticket, sourced from the dev-info integration
- **Export options**: Copy as markdown or copy as plain text for pasting into Slack, email, or other communication channels
- **Template**: Configurable header and footer text for the release notes output
- **Historical**: View and regenerate changelogs for any past sprint

## Acceptance Criteria

### Phase 1: Changelog generation
- [ ] New page at `src/app/(app)/changelog/page.tsx` or accessible from the Sprint Board
- [ ] API endpoint `GET /api/changelog?sprintId=X` that aggregates completed tickets for a sprint
- [ ] Group tickets by epic field; tickets without an epic go into a "General" group
- [ ] Each entry includes: ticket key, title, truncated summary (first 200 chars of description)
- [ ] Sort epics alphabetically, tickets within each epic by key
- [ ] Handle sprints with no completed tickets (empty state with a clear message)

### Phase 2: Changelog display
- [ ] Formatted changelog view with epic group headings
- [ ] Each ticket entry shows key (as link to ticket detail), title, and summary excerpt
- [ ] Visual separation between epic groups
- [ ] Sprint name and date range displayed as the changelog header
- [ ] Total count of completed tickets and story points in a summary line

### Phase 3: PR link integration
- [ ] Fetch associated PRs for each ticket from the dev-info/Bitbucket data
- [ ] Display PR links next to each ticket entry (PR number linking to Bitbucket)
- [ ] Handle tickets with multiple PRs (show all)
- [ ] Handle tickets with no PRs (show nothing, no error state)
- [ ] PR status indicator (merged, open, declined)

### Phase 4: Export options
- [ ] "Copy as Markdown" button that copies the changelog in markdown format to clipboard
- [ ] "Copy as Plain Text" button that copies a simplified version without markdown formatting
- [ ] Markdown export includes: header, grouped entries with ticket keys, PR links
- [ ] Plain text export includes: header, grouped entries with ticket titles only
- [ ] Configurable header and footer text stored in `appSetting` table
- [ ] Settings UI for editing the template header/footer
- [ ] Visual feedback on copy (brief confirmation message)

### Phase 5: Sprint selector for historical changelogs
- [ ] Sprint dropdown showing all available sprints (active and closed)
- [ ] Selecting a sprint regenerates the changelog for that sprint
- [ ] Default to the most recently completed sprint
- [ ] Persist selected sprint in URL query params

## Technical Notes

- Data comes from existing `/api/tickets` endpoint (filtered by sprint and status "Done") and dev-info endpoints for PR data
- No new database tables needed for basic functionality; this is a computed view
- Grouping by epic uses the existing epic field on ticket objects
- Markdown export uses template literals to construct the output string
- Consider storing generated changelogs in the `appSetting` table or a dedicated table for quick access and to preserve a snapshot
- The Clipboard API (`navigator.clipboard.writeText`) handles the copy action

## Out of Scope (for now)

- Automated email or Slack distribution of release notes
- Semantic version numbering
- Confluence or wiki publishing
- Changelog diffing between sprints
- Custom grouping categories beyond epic
- PDF export
