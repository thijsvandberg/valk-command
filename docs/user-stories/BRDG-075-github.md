# BRDG-075: GitHub Integration

**Status:** Open
**Priority:** Low

## Description

As the PO, I want GitHub support alongside Bitbucket in the Dev Panel so the app works for teams using GitHub as their code platform.

## Acceptance Criteria

### Phase 1: GitHub connection
- [ ] Settings: GitHub personal access token + repository (owner/repo)
- [ ] Support multiple repositories (comma-separated, like Bitbucket config)
- [ ] Health check: `GET /api/github/health`
- [ ] Connection test on settings page

### Phase 2: Dev Panel integration
- [ ] Extend Dev Panel to show GitHub data alongside or instead of Bitbucket
- [ ] Search branches by ticket key pattern (same as Bitbucket logic)
- [ ] Show pull requests: title, status (open/merged/closed), author, reviewers
- [ ] Show commits on matching branches
- [ ] Show GitHub Actions workflow runs (latest per branch)

### Phase 3: Unified dev info API
- [ ] Refactor `/api/tickets/[key]/dev-info` to support both providers
- [ ] Configuration determines active provider(s): Bitbucket, GitHub, or both
- [ ] Normalized response shape (same as existing dev-info format)
- [ ] Provider badge on each item (GitHub/Bitbucket icon)

## Technical Notes

- GitHub REST API v3 with personal access token (PAT)
- Search branches: `GET /repos/{owner}/{repo}/branches` filtered client-side
- Search PRs: `GET /repos/{owner}/{repo}/pulls?state=all` filtered by title containing ticket key
- Actions runs: `GET /repos/{owner}/{repo}/actions/runs?branch={branch}`
- Rate limit: 5000 req/hour for authenticated requests

## Out of Scope (for now)
- GitHub Apps (OAuth, installation)
- Code review from Bridge
- GitHub Issues integration
- GitHub Projects integration
- Webhook-based real-time updates
