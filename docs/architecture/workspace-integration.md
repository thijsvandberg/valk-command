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

### Local VRW Lifecycle (BRDG-459)

Bridge prod (`npm run start` → `tools/scripts/start-prod.sh`) calls `tools/scripts/start-vrw.sh`, which auto-starts VRW when `<VALK_AGENT_URL>/health` does not respond:

- A **healthy VRW is never touched** (a restart could kill an agent task mid-run); the script exits before any port cleanup.
- Otherwise it frees port 3110, starts VRW detached in its **own session** (`nohup` + `setsid` via perl — npm installs its own SIGINT handler, so without a new session Ctrl+C on Bridge would kill VRW too), and polls `/health` for ~15s.
- VRW output goes to `logs/vrw-<stamp>.log` in the Bridge repo, pruned like the prod logs (keep 15 files, max 14 days; tunables `VRW_PORT`, `VRW_PATH`, `VRW_LOG_DIR`, `VRW_LOG_KEEP`, `VRW_LOG_MAX_AGE_DAYS`).
- Failure is **non-fatal**: a warning with the log path is printed and Bridge boots anyway. If `VALK_AGENT_URL` points at a non-localhost VRW, the script only warns (starting a local instance would be pointless).
- There is **no crash supervision**: a VRW that dies later stays down until the next `npm run start` or a manual `npm run vrw:start`.
- Dev (`npm run dev`) keeps the warn-only probe (`tools/scripts/check-vrw.sh`).

## Agent Proxy (`src/lib/agent-proxy.ts`)

Server-side helper that constructs agent URLs and auth headers.

- `VALK_AGENT_URL`: Base URL of the agent (default: `http://localhost:3110`, VRW prod; dev VRW is 3111)
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

## Backlog Deprecation Review — Server-Side Skill Calls

The deep-scan topic scorers (BRDG-285..287, `src/lib/topics/`) call workspace skills **server-side** using `runAgentTaskToCompletion()` (`src/lib/agent-task-result.ts`). This helper submits a `POST /api/tasks`, polls `GET /api/tasks/:id` until completion, and returns the final text output. It never throws; callers degrade gracefully on failure.

| Scorer | Skill | BRDG | Notes |
|--------|-------|------|-------|
| `deprecation-analyzer.ts` (consolidated, **primary**) | `analyze-deprecation` | BRDG-298 | One pass scores all topics + revival; see below |
| `replaced-area-topic.ts` (fallback) | `ask` | BRDG-285 | Confirms whether a keyword match is genuine |
| `superseded-topic.ts` (fallback) | `find-related` | BRDG-286 | Finds duplicate/superseded tickets |
| `already-built-topic.ts` (fallback) | `codebase-research` | BRDG-287 | Checks whether the feature is already implemented |

### Consolidated `analyze-deprecation` skill (BRDG-298)

`runDeepScan` PREFERS one consolidated call to the VRW `analyze-deprecation` skill
(`.claude/skills/analyze-deprecation.md`) over the four per-topic scorers above. The skill takes a
target ticket (`key`, `summary`, `description`), gathers signals once (Jira recent/open/future
sprints, related tickets, codebase, product docs), and emits a single parseable
`<deprecation-analysis>` JSON block covering every topic (`staleness`, `replaced`, `duplicate` with
`supersededBy`, `alreadyBuilt`, `relevance`) **plus** a `revival` verdict.

- **Parser**: `src/lib/parse-deprecation-analysis.ts` — defaults missing fields, clamps scores to
  0..1, never throws (null on absent/malformed block).
- **Analyzer**: `src/lib/deprecation-analyzer.ts` — submits the skill, maps the result into the
  `scanScores` topic shape + a revival verdict. Wired as primary in `src/lib/topics/index.ts`.
- **Fallback**: when the analyzer is unavailable (agent down, `VALK_AGENT_KEY` unset) or returns
  nothing parseable, `runDeepScan` falls back to the registered per-topic scorers. The per-topic
  scorers are intentionally NOT removed.
- **Revival** (the OPPOSITE of deprecation): a low-backlog ticket still high value and a good fit for
  recent/planned sprint work. `revivalScore >= 0.6` fires a distinct `revival-candidate` notification
  and suppresses the deprecation-candidate promotion for that ticket (the two never double-fire). See
  [database-schema.md](database-schema.md#ticket_metadata) for the `revival_score` / `revival_rationale`
  columns.

### Stakeholder test documentation: `generate-test-doc` skill (BRDG-426)

The sprint board can generate the per-story test documentation that goes to the customer at
sprint end. The VRW skill (`.claude/skills/generate-test-doc.md`) takes the ticket context
(title, type, full description, ALL Jira comments, recent status changes) and emits one
parseable `<test-doc>` JSON block: `{ classification: "ok" | "needs_input" |
"not_stakeholder_relevant", markdown }`.

- **Route**: `POST /api/tickets/[key]/generate-test-doc` gathers the context (comments are a
  primary input: preconditions and test data usually live there) and dispatches via
  `agentFetch`, returning `{ taskId, streamUrl }` for SSE streaming.
- **Parser**: `src/lib/parse-test-doc.ts` — never throws; null on absent/malformed block;
  unknown classifications degrade to `ok`.
- **Validation UI**: `src/components/sprint-board/TestDocReviewModal.tsx` — split view with the
  editable doc left and the story (regular rendered format) right. Entry points: row action
  menu, the to-Test status-change line button (BRDG-414 stub made real), and the bulk toolbar
  (sequential queue with Skip).
- **Save**: `PUT /api/tickets/[key]/test-doc` stores the Bridge copy in `ticket_metadata`
  (`test_doc*` columns) and writes exactly one `:::expand Test documentation` block at the end
  of the Jira description through the regular `upsertLocalEdit` + `pushToJira` path
  (`src/lib/test-doc.ts` strips/appends the block). Draft keys 409 in both routes.

### already-built topic (BRDG-287)

The `codebase-research` skill is the most expensive call in the scorer pipeline. Two independent controls limit its use:

- **Gate**: the scorer reads the already-persisted `scanScores` for the ticket (from prior Tier-1 or Tier-2 runs) and sums the `staleness + replaced + duplicate` scores. If the sum is below `ALREADY_BUILT_GATE_THRESHOLD` (0.4) the call is skipped and the scorer abstains (returns `null`).
- **Hard throttle**: at most `ALREADY_BUILT_DAILY_CAP` (20) calls per UTC calendar day. The running count is stored in `app_setting` under the key `already-built-scan:<YYYY-MM-DD>`. When the cap is hit the scorer logs a warning with the skipped ticket key (via `logger.warn`) so coverage is transparent. Skipped tickets retain no `alreadyBuilt` entry in `scanScores`, so they are eligible for retry on a future deep-scan batch.

The prompt asks the agent three structured questions: `IMPLEMENTED: YES/NO`, `IMPLEMENTED_IN: <file or ticket>`, `RATIONALE: <sentence>`. The response is parsed by `parseAlreadyBuiltResult()` in the scorer file.

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

## VRW Testing

VRW has a Vitest test suite (105 tests, 11 files) covering all core modules. When making changes that affect workspace integration:

- **Task execution**: `task-queue.test.ts` and `task-queue.integration.test.ts` cover the full task lifecycle including SSE event capture, status transitions, and session management
- **CLI communication**: `stream-runner.test.ts` and `persistent-session.test.ts` test CLI event parsing (system/assistant/result/error) with mocked `child_process`
- **Session management**: `session-pool.test.ts` covers LRU eviction, idle timeouts, and pool lifecycle
- **Skill system**: `skills.test.ts` covers registry lookup, prompt loading, frontmatter stripping, and args injection
- **Scheduling**: `scheduler.test.ts` covers cron registration, job execution, output parsing, and delivery

Run VRW tests from its project root: `cd /path/to/valk-remote-workspace && npm run test`

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VALK_AGENT_URL` | No | Agent base URL (default: `http://localhost:3110`, VRW prod; dev VRW is 3111) |
| `VALK_AGENT_KEY` | Yes* | Bearer token for agent auth (* required when agent is active) |
| `BITBUCKET_WORKSPACE` | No | Bitbucket Cloud workspace slug |
| `BITBUCKET_REPO_SLUG` | No | Comma-separated repo slugs to search |
| `BITBUCKET_EMAIL` | No | Falls back to `JIRA_EMAIL` |
| `BITBUCKET_APP_PASSWORD` | No | App password for Bitbucket auth. Falls back to `BITBUCKET_API_TOKEN` |
