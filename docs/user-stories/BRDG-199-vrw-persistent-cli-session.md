# BRDG-199: VRW Persistent Claude CLI Session

**Status:** Not Started
**Priority:** High

## Description

As a PO using the Story Writer, I want conversation follow-ups to be processed without the overhead of spawning a new Claude CLI process each time, so that simple questions get answers in seconds instead of 15-20 seconds.

## Problem

Currently, every message (including follow-ups within the same conversation) triggers VRW to spawn a fresh `claude` CLI subprocess via `stream-runner.ts`. Even though `--resume {sessionId}` is passed to reuse conversation state, the process startup adds significant fixed overhead:

| Overhead source | Est. duration |
|----------------|---------------|
| Node `spawn()` + CLI bootstrap | 1-2s |
| MCP server init (Jira MCP subprocess) | 0.5-1s |
| Token validation (`ensureValidToken()`) | 0-1s |
| Session state restore from `--resume` | 1-2s |
| **Total per-message overhead** | **3-5s** |

For a 20-second roundtrip on a simple question, this fixed overhead accounts for 15-25% of the total latency.

## Acceptance Criteria

- [ ] Follow-up messages within an existing conversation reuse a running Claude process instead of spawning a new one
- [ ] The persistent process handles sequential messages (one at a time, queued)
- [ ] Idle sessions are cleaned up after a configurable timeout (e.g., 10 minutes)
- [ ] If the persistent process crashes or times out, VRW falls back to spawning a fresh process
- [ ] First message in a new conversation still spawns a new process (no behavior change)
- [ ] MCP servers (Jira) stay initialized across messages in the same session
- [ ] Measure and log the per-message overhead reduction

## Technical Notes

- **Files (VRW):**
  - `valk-remote-workspace/src/stream-runner.ts` (lines 76-151): currently spawns per task
  - `valk-remote-workspace/src/task-queue.ts` (lines 162-250): `processNext()` orchestration
  - `valk-remote-workspace/src/session-store.ts`: session-to-CLI-session mapping
- **Approach options:**
  1. **Keep CLI process alive:** After a task completes, don't kill the process. Feed the next message via stdin. Requires Claude CLI to support interactive stdin in `stream-json` mode.
  2. **Switch to Claude API directly:** Replace CLI subprocess with direct Anthropic API calls. Eliminates process overhead entirely but requires reimplementing session/conversation management and tool execution.
  3. **Process pool:** Pre-spawn a Claude CLI process and keep it warm. When a message arrives, pipe it to the warm process. Spawn a replacement in the background.
- Option 1 is the most incremental change. Check if `claude --resume` supports piping multiple prompts via stdin in `stream-json` output mode.
- The `sessionStore` already maps `conversationId` to `cliSessionId`, so the infrastructure for session reuse exists.

## Dependencies

- Requires investigation into Claude CLI stdin/interactive capabilities in stream-json mode
- BRDG-197 (smaller prompts) is independent and can be done in parallel
