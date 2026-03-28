# Spec: valk-agent

**Date:** 2026-03-27
**Author:** Thijs van den Berg
**Status:** Draft
**Related:** [valk-command PRD](2026-03-27-valk-command-prd.md)

## What Is valk-agent

valk-agent is a cloud-hosted instance of the Valk PO workspace. It runs Claude Code (or an agent built on the Claude Agent SDK) with access to the same MCP servers, skills, and repository context as the local CLI environment.

It exposes an HTTP API so that external clients (valk-command) can submit tasks and receive results via streaming.

---

## What It Does

1. **Accepts tasks** - receives a prompt/skill invocation and queues it for execution
2. **Executes skills** - runs Claude with the workspace context (repo, MCP servers, brain files)
3. **Streams progress** - emits real-time events as the agent works (tool calls, intermediate results)
4. **Returns results** - delivers the final output when a task completes
5. **Manages schedules** - runs recurring tasks (brief, pulse, sprint-status) on cron schedules
6. **Maintains state** - brain files, conversation history, PO metadata persist across sessions

---

## API Contract

### Authentication

Single API key in `Authorization: Bearer <key>` header. No user management needed (single PO user).

### Endpoints

#### Tasks

```
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id
DELETE /api/tasks/:id          (cancel a queued/running task)
GET    /api/tasks/:id/stream   (SSE stream of task events)
```

**POST /api/tasks** - Submit a new task

```json
{
  "prompt": "Review story VPL-1456",
  "skill": "review-story",
  "context": {
    "jira_key": "VPL-1456",
    "conversation_id": "conv_abc"
  }
}
```

**Response:**

```json
{
  "id": "task_xyz",
  "status": "queued",
  "skill": "review-story",
  "created_at": "2026-03-27T10:32:00Z",
  "stream_url": "/api/tasks/task_xyz/stream"
}
```

**GET /api/tasks/:id/stream** - SSE event stream

```
event: status
data: {"status": "running", "skill": "review-story"}

event: tool_call
data: {"tool": "mcp__jira__jira_issue_get", "args": {"issue_key": "VPL-1456"}}

event: tool_result
data: {"tool": "mcp__jira__jira_issue_get", "summary": "Fetched issue"}

event: progress
data: {"message": "Analyzing acceptance criteria..."}

event: result
data: {"status": "completed", "output": "...", "artifacts": [...]}
```

Event types:

| Event | Description |
|-------|-------------|
| `status` | Task status change (queued, running, completed, failed) |
| `tool_call` | Agent is calling a tool (name + summary of args) |
| `tool_result` | Tool returned (summary, not full output) |
| `progress` | Agent's intermediate text output |
| `result` | Final output with artifacts |
| `error` | Task failed with error message |

#### Conversations

```
GET    /api/conversations
GET    /api/conversations/:id
DELETE /api/conversations/:id
```

Conversations are automatically created when a task runs. Messages (user prompt + assistant response) are stored per conversation.

#### Schedules

```
GET    /api/schedules
POST   /api/schedules
PUT    /api/schedules/:id
DELETE /api/schedules/:id
POST   /api/schedules/:id/run   (manual trigger)
GET    /api/schedules/:id/runs   (execution history)
```

**POST /api/schedules**

```json
{
  "name": "Morning Brief",
  "skill": "brief",
  "cron": "0 7 * * 1-5",
  "enabled": true
}
```

#### Health

```
GET /api/health
```

Returns workspace status: agent ready, MCP servers connected, last activity.

---

## MCP Servers Available

The workspace has these MCP servers connected. valk-command does not call them directly; it sends tasks to the workspace which uses them internally.

| Server | Purpose |
|--------|---------|
| **backoffice** | Hotel settings, rooms, extras management |
| **jira** | Jira issue CRUD, sprints, comments, attachments |
| **claude_ai_Atlassian** | Jira + Confluence (Atlassian MCP) |
| **claude_ai_Slack** | Slack messaging, search |
| **claude_ai_Gmail** | Email read/draft |
| **claude_ai_Google_Calendar** | Calendar events |
| **valk-platform** | Booking tool API (reservations, availability, extras) |
| **shiji** | PMS integration (Shiji API) |
| **claude-in-chrome** | Browser automation |
| **ns-chrome** | Chrome DevTools automation |

---

## Skills Available

These can be invoked via the `skill` field in task submissions:

| Skill | What it does |
|-------|-------------|
| `jira-story-writer` | Create/elaborate Jira stories |
| `review-story` | Score story quality |
| `assess-story` | Effort/value assessment (BV, IE, PE, TE) |
| `refinement-prep` | Batch review for refinement |
| `technical-analysis` | Codebase investigation for a story |
| `investigate` | Ad-hoc codebase questions |
| `write-test-scenarios` | Generate test scenarios |
| `test-story` | Execute E2E tests with browser |
| `review-sprint` | Sprint health analysis |
| `brief` | Full situational briefing |
| `pulse` | Quick delta check |
| `sprint-status` | Sprint progress dashboard |
| `brain` | Query/update brain knowledge |
| `explain` | Non-technical summary |
| `find-related` | Find related Jira stories |

---

## Artifacts

Some skills produce artifacts (files) in addition to text output:

| Artifact Type | Source | Format |
|---------------|--------|--------|
| Test report | test-story | HTML with embedded screenshots |
| Story draft | jira-story-writer | Markdown |
| Investigation | investigate, technical-analysis | Markdown |
| Sprint review | review-sprint | Structured data |
| Test scenarios | write-test-scenarios | Markdown |

The API returns artifact references in the `result` event. valk-command fetches/renders them.

```json
{
  "artifacts": [
    {
      "type": "test-report",
      "format": "html",
      "url": "/api/tasks/task_xyz/artifacts/report.html"
    }
  ]
}
```

---

## Hosting

To be determined. Options:

- **Coolify** on existing infra (Docker container)
- **K8s** on k8s-development.vandervalkonline.com

Requirements:
- Persistent filesystem (brain files, conversation history)
- Outbound HTTPS (Jira, Slack, Gmail, Claude API)
- Inbound HTTPS (API endpoint for valk-command + Jira webhooks)
- Long-running processes (agent tasks can take minutes)

---

## What Needs to Be Built

1. **HTTP API layer** - wraps Claude Code CLI or Agent SDK with the endpoints above
2. **Task queue** - manages concurrent/sequential task execution
3. **Event streaming** - captures agent tool calls and progress, emits as SSE
4. **Persistence** - conversations, task history, schedules
5. **Jira webhook receiver** - accepts and processes Jira events, forwards to valk-command or stores locally
6. **MCP server management** - ensures MCP connections stay alive

---

## Open Questions

1. **Runtime:** Claude Code CLI in a container (all skills work immediately) vs. Agent SDK (lighter, more control, skills need adaptation)?
2. **Concurrency:** Can multiple tasks run in parallel, or is it a single-agent queue?
3. **Jira webhooks:** Does the workspace receive them and relay to valk-command, or does valk-command receive them directly?
4. **Shared state:** How do brain files sync between local CLI sessions and the remote workspace?
