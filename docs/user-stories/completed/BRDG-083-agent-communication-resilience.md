# BRDG-083: Agent Communication Resilience

**Status:** Done
**Priority:** High

## Description

As the PO, I need reliable communication between Bridge and valk-agent so that workspace tasks, story writer messages, and status checks do not silently fail or hang indefinitely. Currently, none of the agent fetch calls (except the health check) have timeouts, there is no retry logic for transient failures, and all errors return the same generic "Agent unreachable" message regardless of the underlying cause.

This has led to recurring issues where messages appear sent in the UI but never reach the agent, the story writer hangs on "Resuming..." forever, and there is no way to distinguish a temporary blip from the agent being truly down.

## Background

Code review identified the following structural issues across the agent communication layer:

- **No timeouts:** Every `fetch()` to the agent can hang indefinitely. Only `workspace-tasks/health` has a 5-second timeout.
- **No retry/backoff:** Transient 503s, network blips, and connection resets fail immediately with no recovery attempt.
- **Generic errors:** All catch blocks return `"Agent unreachable"`, making it impossible to diagnose whether the agent is down, slow, misconfigured, or returning invalid responses.
- **No circuit breaker:** If the agent is down, every user action keeps hitting it, compounding latency for the user.

### Affected routes

| Route | File | Issues |
|-------|------|--------|
| POST /api/workspace-tasks | workspace-tasks/route.ts | No timeout, no retry, generic error |
| GET /api/workspace-tasks | workspace-tasks/route.ts | No timeout, generic error |
| GET /api/workspace-tasks/[id] | workspace-tasks/[id]/route.ts | No timeout, generic error |
| DELETE /api/workspace-tasks/[id] | workspace-tasks/[id]/route.ts | No timeout, generic error |
| GET /api/workspace-tasks/[id]/stream | workspace-tasks/[id]/stream/route.ts | No timeout, no backpressure, no cleanup on client disconnect |
| GET /api/workspace-tasks/skills | workspace-tasks/skills/route.ts | No timeout, generic error |
| POST /api/tickets/[key]/story-writer/messages | story-writer/messages/route.ts | 3 fetch calls, none with timeout |
| POST /api/tickets/[key]/reviews/generate | reviews/generate/route.ts | Polling loop with no per-request timeout |
| Background: fetchAndStoreExecutionLog | story-writer/apply-draft/route.ts | Fire-and-forget, no timeout |

## Implementation Plan

1. Create `src/lib/agent-fetch.ts`: typed `AgentResult<T>` discriminated union, `AgentErrorCode` type, `agentFetch<T>()` wrapper with AbortSignal timeout, error classification (TIMEOUT/UNREACHABLE/AUTH/SERVER_ERROR/INVALID_RESPONSE). Separate `agentFetchStream()` for SSE that returns raw Response on success.
2. Add `VALK_AGENT_TIMEOUT_MS` / `VALK_AGENT_STREAM_TIMEOUT_MS` env vars to Zod schema in `src/lib/env.ts` (if exists, otherwise inline defaults).
3. Add retry logic inside `agentFetch`: `retries` option, exponential backoff (1s/3s/9s + jitter), only retry on transient codes (TIMEOUT, UNREACHABLE, 502/503/504). `console.warn` with JSON object per retry.
4. Migrate all 7 route files + health + skills to `agentFetch`/`agentFetchStream`, returning structured `{ error, code }` JSON on failure. POSTs get `retries: 2`, polled GETs get `retries: 0`.
5. SSE proxy hardening: TransformStream with 60s inactivity timeout + `request.signal` for client disconnect detection.
6. Client-side: map error codes to friendly messages in `useStoryWriter`, `useTaskMonitoring`, `useWorkspaceTask`. Close EventSource on poll timeout in `useTaskMonitoring`.
7. Write tests for `agentFetch` (timeout, retry, error classification).

Batch order: steps 1-3 together, then 4, then 5, then 6, then 7.

## Acceptance Criteria

### Phase 1: agentFetch wrapper with timeout and error classification

- [x] Create `src/lib/agent-fetch.ts` that wraps `fetch()` with:
  - Configurable timeout via AbortSignal (default 30s, 60s for streaming)
  - Structured error responses that distinguish: timeout, network error, auth failure (401/403), server error (5xx), invalid response (non-JSON)
  - Returns a typed result object, not raw Response, so callers don't need try/catch for common cases
- [x] Migrate all agent routes to use `agentFetch` instead of raw `fetch(agentUrl(...))` + try/catch
- [x] Health check keeps its existing 5s timeout

### Phase 2: Retry with exponential backoff for transient failures

- [x] `agentFetch` supports a `retries` option (default: 0 for GETs that are polled, 2 for POSTs)
- [x] Retries only on transient errors: network failures, 502, 503, 504, timeouts
- [x] Exponential backoff: 1s, 3s, 9s (with jitter)
- [x] Non-retryable errors (400, 401, 404, 409, 422) fail immediately
- [x] Each retry logs a structured warning (not console.log) for observability

### Phase 3: Error response improvements

- [x] All agent routes return structured error JSON: `{ error: string, code: "TIMEOUT" | "UNREACHABLE" | "AUTH" | "SERVER_ERROR" | "INVALID_RESPONSE" }`
- [x] Client-side hooks (`useTaskMonitoring`, `useStoryWriter`, `useWorkspaceTask`) display user-friendly messages based on the error code, not just the raw message
- [x] The activity status indicator in the sidebar reflects agent health (already uses health endpoint; ensure it reacts to classified errors)

### Phase 4: SSE stream hardening

- [x] SSE proxy (`workspace-tasks/[id]/stream/route.ts`) adds a 60-second inactivity timeout: if no SSE event arrives within 60s, the proxy closes the upstream connection
- [x] When the client disconnects (browser tab closed, navigation), the proxy detects it and closes the upstream connection to avoid resource leaks
- [x] Client-side `useTaskMonitoring` closes the EventSource when the 5-minute poll timeout expires (currently only stops polling but leaves the EventSource open)

## Technical Notes

- `AbortSignal.timeout(ms)` is available in Node 18+ and all modern browsers
- The SSE stream proxy currently uses `new Response(upstream.body, ...)` which pipes the body directly. For disconnect detection, use a TransformStream that monitors for client abort
- Consider making timeout values configurable via environment variables for different deployment environments
