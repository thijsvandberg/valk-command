# BRDG-030: Bitbucket Development Panel in Ticket Detail

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to see Bitbucket development activity linked to a Jira ticket directly in the ticket detail view, so I can assess implementation progress (branches, commits, pull requests, builds) without leaving valk-command.

## Core Concepts
API (readonly) key in .env.local `BITBUCKET_API_TOKEN`

- **Development panel**: A collapsible sidebar section in the ticket detail view, mirroring the "Development" panel in Jira
- **Data source**: Jira's development info API (`/rest/dev-status/latest/issue/detail`) returns branches, commits, PRs, and build statuses linked to a ticket via the Bitbucket integration Jira already has configured
- **Read-only**: No branch creation or VS Code integration — just visibility into linked activity
- **Linked items**: Branches, commits, pull requests, and build pipeline results

## Acceptance Criteria

### Phase 1: API proxy route

- [x] New API route `src/app/api/tickets/[key]/dev-info/route.ts` that calls Jira's dev-status endpoint for the given ticket
- [x] Route fetches `applicationType=stash` (Bitbucket Server) or `applicationType=bitbucket` (Bitbucket Cloud) depending on config
- [x] Returns a normalised JSON shape: `{ branches, pullRequests, commits, builds }`
- [x] Each branch: `{ name, url, lastCommit: { id, message, date, author } }`
- [x] Each pullRequest: `{ id, title, url, status: 'OPEN' | 'MERGED' | 'DECLINED', author, reviewers }`
- [x] Each commit: `{ id, message, date, author, url }`
- [x] Each build: `{ name, url, state: 'SUCCESSFUL' | 'FAILED' | 'IN_PROGRESS', completedAt }`
- [x] On Jira API error or empty response, return empty arrays (not a 500)

### Phase 2: Development panel component

- [ ] New component `src/components/ticket-detail/DevPanel.tsx`
- [ ] Collapsible section header "Development" with a chevron toggle (collapsed by default if no data, expanded if data exists)
- [ ] Loading skeleton while fetching
- [ ] Empty state: "No development activity linked to this ticket"
- [ ] Branches section: list each branch name with a link icon pointing to Bitbucket, last commit message + relative date below
- [ ] Pull requests section: each PR with title, author, and a status badge (`OPEN` in amber, `MERGED` in green, `DECLINED` in red/muted)
- [ ] Commits section: shows count and most recent commit (message truncated to 80 chars, date, author)
- [ ] Builds section: each build with name, status icon (checkmark green / cross red / spinner for in-progress), and link to pipeline run
- [ ] Counts in the section header (e.g. "2 branches · 1 PR · 38 commits · 1 build")

### Phase 3: Integration in ticket sidebar

- [ ] `DevPanel` is rendered in `TicketSidebar` below the existing metadata fields
- [ ] Data is fetched client-side (SWR or `useEffect`) — not blocking the ticket page load
- [ ] Panel respects the existing sidebar's visual style (same spacing, font size, section dividers)

## Technical Notes

- Jira dev-status API: `GET /rest/dev-status/latest/issue/detail?issueId=<numericId>&applicationType=stash&dataType=branch` (and similar for `pullrequest`, `build`)
  - `issueId` is the **numeric** Jira internal ID (e.g. `"10042"`), not the string key (`VALK-42`)
  - Jira returns this as the top-level `id` field on every issue in the REST API response
  - The current `ticket` DB table only stores `jiraKey` — `jiraId` is not yet persisted
- **Schema change required**: add a `jiraId text("jira_id")` column to the `ticket` table and populate it during sync in `sync-tickets/route.ts` (the value is available in the Jira API response as `issue.id`)
- The dev-info proxy route resolves `jiraId` from the DB by `jiraKey` before calling the dev-status endpoint
- If the Jira instance uses Bitbucket Cloud the `applicationType` will differ; make the value configurable via env var `JIRA_DEV_APPLICATION_TYPE` defaulting to `stash`
- Keep the proxy route thin: fetch, normalise, return — no caching needed initially

## Out of Scope (for now)

- Creating branches from valk-command
- "Open with VS Code" action
- Displaying release links
- Write operations on PRs (approve, comment)
