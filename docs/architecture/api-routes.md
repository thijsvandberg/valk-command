# API Routes Reference

All routes live under `src/app/api/`. Next.js App Router conventions: each `route.ts` exports HTTP method handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).

## Jira Sync

Sync engine for pulling Jira data into the local SQLite database. See [jira-sync.md](jira-sync.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jira/sync-incremental` | POST | Watermark-based incremental sync (background, every 150s) |
| `/api/jira/sync-tickets` | POST | Full sprint sync. `?strategy=bulk\|timestamp-first` |
| `/api/jira/sync-sprints` | POST | Fetch and cache sprint list from Jira |
| `/api/jira/sync-comments` | POST | Sync comments for a specific ticket |
| `/api/jira/check-updated` | GET | Lightweight freshness check for a single ticket |
| `/api/jira/health` | GET | Verify Jira connectivity |

## Tickets

CRUD operations on locally stored tickets and their metadata.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tickets` | GET | List tickets. `?sprintId=X` filters by sprint |
| `/api/tickets` | POST | Create a local ticket record |
| `/api/tickets/[key]` | GET | Get single ticket with metadata, subtasks, links, local edits |
| `/api/tickets/[key]` | PUT | Update ticket fields |
| `/api/tickets/[key]/metadata` | GET | Get PO metadata |
| `/api/tickets/[key]/metadata` | PUT | Update PO metadata (readiness, scores, notes) |
| `/api/tickets/[key]/comments` | GET | List Jira + PO comments |
| `/api/tickets/[key]/comments` | POST | Create PO comment |
| `/api/tickets/[key]/comments/[id]` | DELETE | Delete PO comment |
| `/api/tickets/[key]/attachments` | GET | List attachments |
| `/api/tickets/[key]/attachments` | POST | Upload attachment metadata |
| `/api/tickets/[key]/local-edits` | GET | Get local edits for a ticket |
| `/api/tickets/[key]/local-edits` | POST | Save a local edit (title or description) |
| `/api/tickets/[key]/versions` | GET | List story version history |
| `/api/tickets/[key]/versions` | POST | Create manual version snapshot |
| `/api/tickets/[key]/versions/[id]` | DELETE | Delete a version |
| `/api/tickets/[key]/reviews` | GET | List stored reviews |
| `/api/tickets/[key]/reviews` | POST | Store a review result |
| `/api/tickets/[key]/pull-from-jira` | POST | Force refresh single ticket from Jira |
| `/api/tickets/[key]/push-to-jira` | POST | Push local edits to Jira |
| `/api/tickets/[key]/dev-info` | GET | Bitbucket development info (branches, PRs, pipelines) |

## Story Writer

AI-assisted story editing sessions. See [story-writer.md](story-writer.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tickets/[key]/story-writer` | GET | Get active session with messages, drafts, candidates |
| `/api/tickets/[key]/story-writer` | POST | Create new session |
| `/api/tickets/[key]/story-writer` | PATCH | Update session (drafts, titles, status) |
| `/api/tickets/[key]/story-writer` | DELETE | Close/discard session |
| `/api/tickets/[key]/story-writer/messages` | POST | Send message (invokes workspace skill) |
| `/api/tickets/[key]/story-writer/apply-draft` | POST | Extract and persist AI drafts from task output |
| `/api/tickets/[key]/story-writer/apply-draft` | DELETE | Dismiss a specific AI draft |
| `/api/tickets/[key]/story-writer/apply-related` | GET | List related story candidates |
| `/api/tickets/[key]/story-writer/apply-related` | POST | Parse and store AI-found related stories |
| `/api/tickets/[key]/story-writer/apply-related` | PATCH | Toggle link state for a related candidate |
| `/api/tickets/[key]/story-writer/split` | POST | Activate split mode (link or create target ticket) |
| `/api/tickets/[key]/story-writer/logs/[taskId]` | GET | Fetch execution logs for a task |

## Conversations & Chat

General-purpose chat conversations with the workspace.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List all conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations/[id]` | GET | Get conversation details |
| `/api/conversations/[id]` | PUT | Update conversation (title, related ticket) |
| `/api/conversations/[id]` | DELETE | Delete conversation and messages |
| `/api/conversations/[id]/messages` | GET | List messages in conversation |
| `/api/conversations/[id]/messages` | POST | Add message to conversation |

## Workspace Tasks

Proxy layer to the valk-agent backend. See [workspace-integration.md](workspace-integration.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workspace-tasks` | GET | List all tasks from agent |
| `/api/workspace-tasks` | POST | Submit new task (skill invocation) |
| `/api/workspace-tasks/[id]` | GET | Get task status |
| `/api/workspace-tasks/[id]` | DELETE | Delete/cancel task |
| `/api/workspace-tasks/[id]/stream` | GET | SSE stream of task progress |
| `/api/workspace-tasks/health` | GET | Agent health check |

## Search

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/search/local` | GET | Fuzzy search local DB via Fuse.js. `?q=text` |
| `/api/search/jira` | GET | Live Jira search. `?q=text` or `?jql=...` |

## Activity Log

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/activity-log` | GET | Query activity log. `?limit=N` |
| `/api/activity-log` | POST | Create activity log entry |
| `/api/activity-log/[id]/acknowledge` | POST | Mark entry as read |
| `/api/activity-log/[id]/cancel` | POST | Cancel a running operation |
| `/api/activity-log/acknowledge-all` | POST | Mark all entries as read |
| `/api/activity-log/cancel-all` | POST | Cancel all running operations |

## Jobs & Scheduler

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jobs` | GET | List scheduled jobs |
| `/api/jobs` | POST | Create scheduled job |
| `/api/jobs/[id]` | GET | Get job details |
| `/api/jobs/[id]` | PUT | Update job |
| `/api/jobs/[id]` | DELETE | Delete job |
| `/api/scheduler/tick` | POST | Trigger lazy-cron tick (runs overdue tasks) |
| `/api/scheduler/tick` | GET | Get status of all scheduled tasks |

## Settings & Config

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/config` | GET | App configuration (next sprint ID) |
| `/api/settings/column-widths` | GET | Get saved column widths |
| `/api/settings/column-widths` | POST | Save column widths |
| `/api/settings/quick-prompts` | GET | Get quick prompt templates |
| `/api/settings/quick-prompts` | POST | Save quick prompt templates |
| `/api/sprint-slots` | GET | Get sprint slot assignments |
| `/api/sprint-slots` | POST | Save sprint slot assignments |

## Attachments

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/attachments/[id]` | GET | Proxy attachment download from Jira |

## Common Patterns

### Error Responses

All routes return JSON error responses with consistent shape:

```json
{ "error": "Human-readable error message" }
```

Status codes: `400` (bad request), `404` (not found), `409` (conflict), `500` (server error), `502` (agent unreachable).

### Agent Proxy

Workspace task routes proxy to the valk-agent backend using `agentUrl()` and `agentHeaders()` from `src/lib/agent-proxy.ts`. The agent URL and API key are server-side only.

### Activity Logging

Write operations that affect ticket data log to the `activity_log` table for audit and UI feedback.
