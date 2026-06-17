# Bridge docs

PO Command Center for Valk Platform.

## Structure

- [plans/](plans/) - PRDs, specs, and implementation plans
- [architecture/](architecture/) - Technical architecture documentation
- [user-stories/](user-stories/) - Feature specifications as user stories
- [investigations/](investigations/) - Ad-hoc codebase investigations
  - [Sharing one row between the board and the epic-children list](investigations/2026-06-17-unified-issue-row.md) - BRDG-347: recommend the epic-children list adopt the shared BoardRow, keeping epic features at section level
- [todo.md](todo.md) - Backlog and task tracking
- [performance-log.md](performance-log.md) - Notable bottlenecks from `/implement-story` runs

## Key Documents

- [PRD](plans/2026-03-27-valk-command-prd.md) - Product requirements
- [valk-agent spec](plans/2026-03-27-valk-agent-spec.md) - Backend agent API specification (aspirational, agent not yet built)

## Architecture

- [Jira Sync](architecture/jira-sync.md) - Sync strategies, watermark system, data flow
- [Database Schema](architecture/database-schema.md) - All tables, relationships, conventions
- [API Routes](architecture/api-routes.md) - Complete API endpoint reference (60+ routes)
- [Workspace Integration](architecture/workspace-integration.md) - Agent proxy, SSE streaming, skill invocation, Bitbucket integration
- [Story Writer](architecture/story-writer.md) - AI-assisted story editing, split mode, related stories
- [Scheduler](architecture/scheduler.md) - Lazy-cron pattern, task registry, background sync
- [Optimistic Updates](architecture/optimistic-updates.md) - Pending-edits overlay; read before adding any editable board field
