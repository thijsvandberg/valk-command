# valk-command

PO Command Center for Valk Platform. See [docs/plans/2026-03-27-valk-command-prd.md](docs/plans/2026-03-27-valk-command-prd.md) for the full product spec.

## Product

Single-user web app for the Product Owner of Valk Platform. Chat-driven interface to send tasks to a remote Claude Code workspace (valk-agent) and view results. Combines a PO metadata layer on top of Jira with real-time visibility into workspace activity.

### Views

| View | Purpose |
|------|---------|
| Dashboard | Widgets: morning brief, pulse, sprint progress, velocity |
| Chat | Primary interaction with the workspace |
| Sprint Board | Jira tickets + PO metadata (readiness, scores, notes) |
| Test Center | Test status, execution, reports |
| Refinement | Prep view + fullscreen refinement mode |
| Scheduled Jobs | Manage recurring workspace tasks |
| Stakeholder | Read-only external view for non-technical stakeholders |

### Integrations

| System | Method |
|--------|--------|
| valk-agent (remote workspace) | REST API + SSE streaming |
| Jira | Inbound webhooks + on-demand REST reads |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Dev server: `npm run dev` (port 3100)
- Database: SQLite + Drizzle ORM (planned)

## Project Structure

```
src/app/          Next.js App Router pages and layouts
src/components/   Reusable components
docs/             Project documentation
  plans/          PRDs and specs
  user-stories/   Feature specs (VC-XXX-name.md)
  architecture/   Technical architecture docs
  investigations/ Ad-hoc research
  agent-orchestrator/  AO usage docs (cli, config, lifecycle, workflow)
  todo.md         Backlog
```

## Code Standards

- All code, comments, and UI strings in English
- Only write comments that explain WHY, not WHAT
- Use conventional commits (feat:, fix:, chore:)
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before committing

## Branching Strategy

- `dev` is the integration branch. All agent PRs target `dev`.
- `main` is the production branch. Promoted from `dev` via `npm run promote`.

## Branch Protection

**dev branch:**
- CI runs post-merge (on push to dev). No required status checks before merge.
- Agents must run `npm run lint && npm run typecheck && npm run test && npm run build` locally before pushing.
- Force pushes and branch deletion are blocked.

**main branch:**
- CI runs on pull request (pre-merge gate). Required status check: `build` must pass.
- Promoted from dev via `npm run promote`.

## Testing

- Every feature and bug fix must include tests
- Test files use `*.test.ts` or `*.test.tsx` and are co-located next to the source file they test
- Run `npm run test` before committing to verify all tests pass
- Tests must pass together with `npm run build` before any commit or PR

## Agent Orchestrator

This project is managed by Agent Orchestrator (AO). Workers are spawned via `ao spawn` to implement issues autonomously.

See `docs/agent-orchestrator/` for full AO documentation:
- [CLI reference](docs/agent-orchestrator/cli-reference.md)
- [Config reference](docs/agent-orchestrator/config-reference.md)
- [Lifecycle](docs/agent-orchestrator/lifecycle.md)
- [Workflow](docs/agent-orchestrator/workflow.md)

### Monitoring

- `/ao` - Single monitoring pass: health check, unstick zombies, log findings, track token/model efficiency
- `/loop 3m /ao` - Continuous monitoring while AO runs. Stop the loop to stop monitoring.
- Feedback logs: `docs/agent-orchestrator/feedback/YYYY-MM-DD.md` (per-date findings)
- Patterns: `docs/agent-orchestrator/feedback/patterns.md` (cross-date recurring observations)

### Preparing work for AO

1. Define the feature (user story in `docs/user-stories/VC-XXX-name.md`)
2. Create a GitHub Issue with clear description + acceptance criteria
3. Dependencies between issues MUST use exact format: `Depends on #N` (not freetext like "depends on database setup")
4. Add `ao:ready` label to approve the issue for automatic agent pickup
5. `ao spawn <issue-number>` to dispatch a worker manually (skips label check)
6. Worker builds, PRs, handles CI/review feedback autonomously
7. Pipeline proceeds via event-driven hooks: PR created -> code review -> PO -> merge (see `docs/architecture/event-driven-pipeline.md`)

### Agent Mode (for AO workers)

When this project is worked on by an AO worker agent:
- Do NOT ask for confirmation. Start working immediately.
- Do NOT discuss or propose plans. Implement directly.
- When done: commit, push your branch, and create a PR targeting `dev`.
- Do NOT push directly to `dev` or `main`. All changes go through a PR.
- Do NOT merge PRs. Only the merge agent (via nudge pipeline) handles merging.
- When modifying layouts, routing, or shared components: verify all existing pages still render by running the full test suite.
- When adding a new route: add it to the EXPECTED_ROUTES manifest in `src/app/routes.test.tsx`.
- If something is unclear in the issue, make a reasonable decision and document it in the PR description.

## Containment Rules

CRITICAL: This is an isolated agent environment. The following are strictly forbidden for AO workers:

- Do NOT use Slack, Gmail, Google Calendar, Atlassian, or any external messaging tools
- ONLY interact with: the local filesystem, git, gh CLI, and npm
- Do NOT modify `.claude/settings.json`, `.claude/metadata-updater.sh`, or `tools/scripts/pipeline-driver.sh`. These are pipeline infrastructure managed by the PO.
