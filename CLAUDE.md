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
- Run `npm run build` before committing to verify the build passes

## Branch Protection

The `main` branch is protected with the following rules:
- Required status check: `build` (CI workflow) must pass before merge
- Branches must be up to date with `main` before merging
- Force pushes and branch deletion are blocked

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

### Preparing work for AO

1. Define the feature (user story in `docs/user-stories/VC-XXX-name.md`)
2. Create a GitHub Issue with clear description + acceptance criteria
3. `ao spawn <issue-number>` to dispatch a worker
4. Worker builds, PRs, handles CI/review feedback autonomously
5. You review and merge

### Agent Mode (for AO workers)

When this project is worked on by an AO worker agent:
- Do NOT ask for confirmation. Start working immediately.
- Do NOT discuss or propose plans. Implement directly.
- When done: commit, push, and create a PR.
- If something is unclear in the issue, make a reasonable decision and document it in the PR description.

## Containment Rules

CRITICAL: This is an isolated agent environment. The following are strictly forbidden for AO workers:

- Do NOT use Slack, Gmail, Google Calendar, Atlassian, or any external messaging tools
- ONLY interact with: the local filesystem, git, gh CLI, and npm
