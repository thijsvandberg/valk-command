# BRDG-030: Bitbucket Development Panel in Ticket Detail

**Status:** Done
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

- [x] New component `src/components/ticket-detail/DevPanel.tsx`
- [x] Collapsible section header "Development" with a chevron toggle (collapsed by default if no data, expanded if data exists)
- [x] Loading skeleton while fetching
- [x] Empty state: "No development activity linked to this ticket"
- [x] Branches section: list each branch name with a link icon pointing to Bitbucket, last commit message + relative date below
- [x] Pull requests section: each PR with title, author, and a status badge (`OPEN` in amber, `MERGED` in green, `DECLINED` in red/muted)
- [x] Commits section: shows count and most recent commit (message truncated to 80 chars, date, author)
- [x] Builds section: each build with name, status icon (checkmark green / cross red / spinner for in-progress), and link to pipeline run
- [x] Counts in the section header (e.g. "2 branches · 1 PR · 38 commits · 1 build")

### Phase 3: Integration in ticket sidebar

- [x] `DevPanel` is rendered in `TicketSidebar` below the existing metadata fields
- [x] Data is fetched client-side (SWR or `useEffect`) — not blocking the ticket page load
- [x] Panel respects the existing sidebar's visual style (same spacing, font size, section dividers)

## Technical Notes

- **Data source**: Bitbucket Cloud REST API v2 (not Jira dev-status, which requires OAuth scopes unavailable with API tokens)
- Searches branches by `name ~ "VPL-XXX"` and PRs by `title ~ "VPL-XXX"` across all configured repos
- Pipelines fetched per branch when branches exist
- **Schema change**: added `jiraId text("jira_id")` column to `ticket` table (populated during sync, used for future integrations)
- **Env vars**: `BITBUCKET_WORKSPACE`, `BITBUCKET_REPO_SLUG` (comma-separated), `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` (Atlassian API token with Bitbucket read scopes)

## Out of Scope (for now)

- Creating branches from valk-command
- "Open with VS Code" action
- Displaying release links
- Write operations on PRs (approve, comment)
