# Bridge

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
| Bitbucket Cloud | REST API v2 (branches, PRs, pipelines) |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Dev server: `npm run dev` (port 3100). This script auto-kills any existing process on port 3100 before starting. When restarting the dev server manually, always kill port 3100 first: `lsof -ti:3100 | xargs kill -9 2>/dev/null`
- Database: SQLite + Drizzle ORM (planned)

## Project Structure

```
src/app/          Next.js App Router pages and layouts
src/components/   Reusable components
docs/             Project documentation
  plans/          PRDs and specs
  user-stories/   Feature specs (BRDG-XXX-name.md)
  architecture/   Technical architecture docs
  investigations/ Ad-hoc research
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

### `main` (production)
- Required status check: `build` (CI workflow) must pass before merge
- Strict mode is ON: branches must be up-to-date with `main` before merging
- Force pushes and branch deletion are blocked

### `dev` (integration)
- Not currently protected
- All agent PRs target `dev`; CI runs via GitHub Actions but is not a required check

## Testing

- Every feature and bug fix must include tests
- Test files use `*.test.ts` or `*.test.tsx` and are co-located next to the source file they test
- Run `npm run test` before committing to verify all tests pass
- Tests must pass together with `npm run build` before any commit or PR
- **CRITICAL: Only ONE test process at a time.** Never run multiple `vitest`/`npm run test` commands in parallel or in quick succession. This is a 16GB RAM machine; concurrent vitest processes cause swap thrashing. Always wait for a test run to fully complete before starting another.
- **Running tests correctly:** Run `npx vitest run` in the foreground without pipes (`| tail`, `| grep`). Do NOT run tests in background mode. Do NOT use `sleep && cat` to poll for output. Just run the command and wait for it to finish (~20s).

