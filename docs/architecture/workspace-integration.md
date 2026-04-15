# Workspace Integration

How valk-command communicates with the valk-agent backend to execute skills and stream results.

## Overview

The valk-agent is a remote Claude Code workspace that executes skills (story writing, reviews, investigations). valk-command acts as the frontend, proxying all agent communication through server-side API routes to keep credentials out of the browser.

```
Browser                    valk-command (Next.js)          valk-agent
  |                              |                            |
  |-- POST /api/workspace-tasks ->                            |
  |                              |-- POST /agent/api/tasks --->|
  |                              |<-- { taskId } -------------|
  |<-- { taskId, convId } ------|                              |
  |                              |                            |
  |                              | [after()] captureTaskStream |
  |                              |-- GET /agent/api/tasks/X/stream ->|
  |                              |<========= SSE (server-side, persistent) ======|
  |                              | saves assistant message to DB on completion   |
  |                              |                            |
  |-- GET /stream ------------->|                              |
  |                              |-- GET /agent/api/tasks/X/stream ->|
  |<========= SSE events ======|<========= SSE events ======|
  |        (browser, optional)   |
```

The server-side stream (`captureTaskStream`) is independent of the browser connection and ensures task results are always persisted even if the user navigates away.

## Agent Proxy (`src/lib/agent-proxy.ts`)

Server-side helper that constructs agent URLs and auth headers.

- `VALK_AGENT_URL`: Base URL of the agent (default: `http://localhost:3001`)
- `VALK_AGENT_KEY`: Bearer token for agent authentication
- `agentUrl(path)`: Builds full URL
- `agentHeaders()`: Returns `Authorization: Bearer ...` and `Content-Type: application/json`

## Task Lifecycle

### 1. Submit Task

`POST /api/workspace-tasks` receives a skill invocation from the frontend:

```json
{
  "skillName": "write-story-draft",
  "args": { "ticketKey": "VPL-123", "instructions": "..." },
  "conversationId": "optional-uuid"
}
```

The route generates a `conversationId` if missing, ensures the conversation exists in Bridge's DB, and forwards to the agent. It then spawns a background server-side stream handler via Next.js `after()` that connects to the VRW SSE stream independently of the browser. Returns `{ taskId, conversationId }` to the browser.

### 2. Stream Progress

`GET /api/workspace-tasks/[id]/stream` opens an SSE (Server-Sent Events) connection to the agent and pipes events directly to the browser. Event types:

| Event | Data | Purpose |
|-------|------|---------|
| `status` | `{ status: "running" }` | Task started |
| `progress` | `{ text: "Analyzing story..." }` | Intermediate progress update |
| `tool_call` | `{ tool: "read_file", args: "..." }` | Agent invoked a tool |
| `result` | `{ output: "..." }` | Final task output |
| `error` | `{ message: "..." }` | Task failed |
| `done` | `{}` | Stream complete |

### 3. Fetch Status

`GET /api/workspace-tasks/[id]` retrieves the current status of a task without streaming.

### 4. Health Check

`GET /api/workspace-tasks/health` checks agent availability with a 5-second timeout. Returns:

```json
{
  "status": "healthy",
  "authenticated": true,
  "tokenExpiresAt": "2026-04-15T..."
}
```

Falls back to `{ status: "unreachable" }` on connection failure.

## Client-Side Hooks

### `useWorkspaceTask`

Central hook for task submission and streaming. Located at `src/hooks/useWorkspaceTask.ts`.

**State machine:**
```
idle -> submitting -> streaming -> completed
                                -> failed
```

**Key behavior:**
- `useWorkspaceTask(conversationId?)` - accepts optional conversationId for reconnection
- On mount with `conversationId`: polls `GET /api/workspace-tasks?conversationId=X` to find any running/completed tasks and reconnects automatically
- `submitAndStream(skill, args, conversationId?)` submits the task and opens an EventSource
- Parses SSE events into structured state: `toolCalls`, `progressText`, `output`
- 5-minute timeout on streaming
- Cleans up EventSource on unmount
- Strips `mcp__` prefixes from tool names for display

### `useWorkspaceHealth`

Polls `/api/workspace-tasks/health` every 30 seconds. Exposes:

- `workspace`: `"connected"` | `"unreachable"` | `"checking"`
- `claude`: `"valid"` | `"expired"` | `"no_credentials"` | `"unknown"` | `"checking"`
- `tokenExpiresAt`: ISO timestamp

### `useTaskMonitoring`

Used by the story writer to monitor running tasks and collect results. Manages the stream lifecycle and delegates result parsing to the caller.

## Skill Invocation from Chat

The agent client (`src/lib/agent-client.ts`) includes `parseSkillInvocation()` which detects `/skill args` patterns in chat messages:

```
/review VPL-123       -> { skill: "review", args: "VPL-123" }
/write-story VPL-456  -> { skill: "write-story", args: "VPL-456" }
```

## Review Processing

When the agent returns review results, they are wrapped in `<json-output>` tags. The client provides:

- `parseReviewOutput(output)`: Extracts `ReviewStoryData` from agent output
- `mapAgentReviewToResult(data)`: Normalizes scores to 0-100, maps criteria to dimensions
- Results are persisted via `POST /api/tickets/[key]/reviews`

## Bitbucket Integration

`GET /api/tickets/[key]/dev-info` queries Bitbucket Cloud API v2 for development information related to a ticket key:

- **Branches**: Searches for branches containing the ticket key
- **Pull Requests**: Searches PRs by title containing the ticket key
- **Pipelines**: Fetches pipeline runs for matched branches
- **Commits**: Extracted from branch head commits

Queries all configured repositories in parallel. Auth via Bitbucket app password (Basic auth). Returns empty payload when not configured.

## Investigate Skill and Confluence Integration

The `investigate` skill (v2.0.0) in VRW searches both code repos and Confluence documentation.

Since VRW has no Confluence MCP server, it calls Bridge's Confluence proxy endpoints via `WebFetch`:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/confluence/search?q=<term>&mode=title\|text\|cql` | Search Confluence pages |
| `GET /api/confluence/pages/<pageId>?format=text&maxWords=<n>` | Fetch page content as plain text |

These endpoints require no auth (rate-limited only). The investigation degrades gracefully if Confluence is not configured (503 response is silently ignored).

**Search modes:**
- `mode=title` (default): CQL `title~"term"` search
- `mode=text`: CQL `text~"term"` search for full-text content
- `mode=cql`: Raw CQL expression passthrough

**Investigation flow with Confluence (Step 3b):**
1. Title and text searches using domain terms derived from the question
2. Ticket key search in Confluence (if a Jira key was provided)
3. Selective page fetch (at most 3 pages based on title/excerpt relevance)
4. Cross-reference: after finding key files with Jira keys in code, search Confluence for those keys
5. Discrepancies between Confluence docs and code surfaced in "What's missing"
6. Explain mode: Confluence business context enriches the non-technical summary

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VALK_AGENT_URL` | No | Agent base URL (default: `http://localhost:3001`) |
| `VALK_AGENT_KEY` | Yes* | Bearer token for agent auth (* required when agent is active) |
| `BITBUCKET_WORKSPACE` | No | Bitbucket Cloud workspace slug |
| `BITBUCKET_REPO_SLUG` | No | Comma-separated repo slugs to search |
| `BITBUCKET_EMAIL` | No | Falls back to `JIRA_EMAIL` |
| `BITBUCKET_APP_PASSWORD` | No | App password for Bitbucket auth. Falls back to `BITBUCKET_API_TOKEN` |
