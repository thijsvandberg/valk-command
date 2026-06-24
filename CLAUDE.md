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
- Dev server: `npm run dev` (port 3100). Runs `tools/scripts/dev-with-memory-guard.sh`, which kills any existing process on port 3100, starts `next dev --turbopack`, and auto-restarts it whenever its memory (read via `footprint` phys_footprint) crosses `DEV_MEM_LIMIT_MB` (default 4096MB) — Turbopack leaks memory over long sessions. Every restart is appended to a changelog at `tools/scripts/dev-guard-restarts.log` (gitignored) with timestamp, memory at the time, and uptime, so you can spot a too-tight limit. Flap protection: if the server crosses the limit within `DEV_FLAP_WINDOW` seconds of starting (default 60), the guard stops instead of restarting (it would otherwise loop without ever serving). Tunables (env): `DEV_PORT`, `DEV_MEM_LIMIT_MB`, `DEV_MEM_INTERVAL`, `DEV_FLAP_WINDOW`, `DEV_GUARD_LOG`. Use `npm run dev:plain` for the raw `next dev` without the guard. When restarting manually, always kill port 3100 first: `lsof -ti:3100 | xargs kill -9 2>/dev/null`
- Database: SQLite + Drizzle ORM. Schema in `src/db/schema.ts`, migrations in `drizzle/`
- Environment: copy `.env.example` to `.env.local`

## Architecture Docs

Detailed technical documentation lives in `docs/architecture/`:

- [Database Schema](docs/architecture/database-schema.md) - All tables, relationships, conventions
- [API Routes](docs/architecture/api-routes.md) - Complete endpoint reference (60+ routes)
- [Jira Sync](docs/architecture/jira-sync.md) - Sync strategies, watermark system, data flow
- [Workspace Integration](docs/architecture/workspace-integration.md) - Agent proxy, SSE, skills, Bitbucket
- [Story Writer](docs/architecture/story-writer.md) - AI-assisted editing, split mode, related stories
- [Scheduler](docs/architecture/scheduler.md) - Lazy-cron pattern, background tasks
- [Optimistic Updates](docs/architecture/optimistic-updates.md) - Pending-edits overlay that prevents board edits from "snapping back" to stale data. READ THIS before adding or changing any editable board field.
- [Client Data & Memory](docs/architecture/client-data-and-memory.md) - Bounded SWR cache, no whole-backlog fetches, virtualize growable lists, list-vs-detail payload split. READ THIS before adding a client fetch, a list view, or a field to the ticket payload.

## Project Structure

```
src/app/          Next.js App Router pages and API routes
src/components/   Reusable React components
src/hooks/        Custom React hooks
src/lib/          Utility functions and API clients
src/db/           Database schema and client
src/types/        TypeScript type definitions
src/contexts/     React context providers
docs/             Project documentation
  plans/          PRDs and specs
  architecture/   Technical architecture docs
  user-stories/   Feature specs (BRDG-XXX-name.md)
  investigations/ Ad-hoc research
  todo.md         Backlog
drizzle/          Database migrations
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

