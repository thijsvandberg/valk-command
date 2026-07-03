# Bridge

PO Command Center for Valk Platform. See [docs/plans/2026-03-27-valk-command-prd.md](docs/plans/2026-03-27-valk-command-prd.md) for the full product spec.

## Product

Single-user web app for the Product Owner of Valk Platform. Chat-driven interface to send tasks to a remote Claude Code workspace (valk-agent) and view results. Combines a PO metadata layer on top of Jira with real-time visibility into workspace activity.

### Views

Primary nav views (`src/components/nav/NavPanel.tsx`); root `/` redirects to `/sprint-board`.

| View | Purpose |
|------|---------|
| Sprint Board | Jira tickets + PO metadata (readiness, scores, notes); primary view |
| Chat | Primary interaction with the workspace |
| Story Writer | AI-assisted story authoring, split mode, related stories |
| Refinement | Prep view + fullscreen refinement mode |
| Inbox | New/changed tickets and relevance grouping |
| Epics | Epic overview with progress, colors, team assignment |
| Pipelines | Bitbucket pipeline / PR health |
| Stakeholder | Read-only external view for non-technical stakeholders |
| Cleanup | Deprecated-area and housekeeping actions |

Other pages (not in the primary nav): Test Center (`/test-center`), Activity Log (`/activity-log`), and Settings (`/settings/*`, incl. Jobs, Scheduler, People, Prompts, Integrations, Notifications).

### Integrations

| System | Method |
|--------|--------|
| valk-agent (remote workspace) | REST API + SSE streaming |
| Jira | Inbound webhooks + on-demand REST reads |
| Bitbucket Cloud | REST API v2 (branches, PRs, pipelines) |

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4
- Auth: Clerk (`@clerk/nextjs`)
- Client data: SWR (bounded LRU cache, see Client Data & Memory doc)
- Rich text: Tiptap; markdown: `marked`; drag-and-drop: `@dnd-kit`; list virtualization: `@tanstack/react-virtual`; runtime validation: Zod
- UI components are custom Tailwind (`src/components/ui/`); no shadcn/Radix
- Ports (prod-first scheme): Bridge prod 3100 / dev 3101; VRW prod 3110 / dev 3111. Dev server: `npm run dev` (port 3101). Runs `tools/scripts/dev-with-memory-guard.sh`, which kills any existing process on port 3101, starts `next dev --turbopack`, and auto-restarts it whenever its memory (read via `footprint` phys_footprint) crosses `DEV_MEM_LIMIT_MB` (default 4096MB) — Turbopack leaks memory over long sessions. Every restart is appended to a changelog at `tools/scripts/dev-guard-restarts.log` (gitignored) with timestamp, memory at the time, and uptime, so you can spot a too-tight limit. Flap protection: if the server crosses the limit within `DEV_FLAP_WINDOW` seconds of starting (default 60), the guard stops instead of restarting (it would otherwise loop without ever serving). Tunables (env): `DEV_PORT`, `DEV_MEM_LIMIT_MB`, `DEV_MEM_INTERVAL`, `DEV_FLAP_WINDOW`, `DEV_GUARD_LOG`. Use `npm run dev:plain` for the raw `next dev` without the guard. When restarting manually, always kill port 3101 first: `lsof -ti:3101 | xargs kill -9 2>/dev/null`. Prod runs on 3100 via `npm run start` (single checkout: run dev OR prod, not both — they share `.next`). `npm run start` also auto-starts VRW when its `/health` is down (BRDG-459): VRW runs detached in its own session (it survives Ctrl+C on Bridge and never restarts when already healthy), with output persisted to `logs/vrw-*.log` (pruned like prod logs: keep 15, max 14d; tunables `VRW_PORT`, `VRW_PATH`, `VRW_LOG_DIR`, `VRW_LOG_KEEP`, `VRW_LOG_MAX_AGE_DAYS`). Start VRW standalone with `npm run vrw:start`. `npm run dev` only warns when VRW is down; there is no crash supervision — a VRW that dies later stays down until the next start.
- Database: SQLite (`better-sqlite3`) + Drizzle ORM. Schema in `src/db/schema.ts`, migrations in `drizzle/`
- Environment: copy `.env.example` to `.env.local`

## Architecture Docs

Detailed technical documentation lives in `docs/architecture/`:

- [Database Schema](docs/architecture/database-schema.md) - All tables, relationships, conventions
- [API Routes](docs/architecture/api-routes.md) - Complete endpoint reference (~190 route files)
- [Jira Sync](docs/architecture/jira-sync.md) - Sync strategies, watermark system, data flow
- [Workspace Integration](docs/architecture/workspace-integration.md) - Agent proxy, SSE, skills, Bitbucket
- [Story Writer](docs/architecture/story-writer.md) - AI-assisted editing, split mode, related stories
- [Scheduler](docs/architecture/scheduler.md) - Lazy-cron pattern, background tasks
- [Optimistic Updates](docs/architecture/optimistic-updates.md) - Pending-edits overlay that prevents board edits from "snapping back" to stale data. READ THIS before adding or changing any editable board field.
- [Client Data & Memory](docs/architecture/client-data-and-memory.md) - Bounded SWR cache, no whole-backlog fetches, virtualize growable lists, list-vs-detail payload split. READ THIS before adding a client fetch, a list view, or a field to the ticket payload.
- [Filter Persistence](docs/architecture/filter-persistence.md) - How board/view filters persist via localStorage + recently-viewed store.
- [UI Primitives](docs/architecture/ui-primitives.md) - Shared component layer (form recipe + Field, AnchoredPanel, z tokens, Modal nesting, ToastCard/Tooltip). READ THIS before building any overlay, form field, or toast.

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

