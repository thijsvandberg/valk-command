# BRDG-199: VRW Persistent Claude CLI Session

**Status:** Done
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

## Implementation Plan

Verified via testing: Claude CLI with `--input-format stream-json --output-format stream-json` keeps the process alive after each result. Follow-up messages via stdin are processed in ~1.5s vs ~7s for a fresh spawn (haiku). The NDJSON input format is:
```json
{"type":"user","session_id":"<uuid>","message":{"id":"msg_N","type":"message","role":"user","content":[{"type":"text","text":"..."}]},"parent_tool_use_id":null}
```

**Steps:**

1. **`config.ts`**: Add `sessionIdleTimeoutMs` (default 10min) and `maxPersistentSessions` (default 5)
2. **`persistent-session.ts`** (new): Class managing a single long-lived CLI process. Spawns with `--input-format stream-json --output-format stream-json --session-id <uuid>`. Sends follow-ups by writing NDJSON to stdin. Emits same `sse`/`raw` events as StreamRunner. Tracks state: `idle | busy | dead`.
3. **`session-pool.ts`** (new): Pool of PersistentSession instances keyed by conversationId. Handles idle cleanup timers and max session cap (LRU eviction).
4. **`task-queue.ts`**: For `_message` tasks, check if a persistent session exists and is alive. If yes, use it (fast path). If no, fall back to `streamRunner.run()` (existing path). After first skill-based task completes, create a persistent session for that conversation.
5. **`index.ts`**: Add `taskQueue.shutdown()` to SIGTERM handler to kill all persistent sessions.
6. **Timing**: Log `[persistent-session] overhead: Xms` for each message to measure improvement.

## Acceptance Criteria

- [x] Follow-up messages within an existing conversation reuse a running Claude process instead of spawning a new one
- [x] The persistent process handles sequential messages (one at a time, queued)
- [x] Idle sessions are cleaned up after a configurable timeout (e.g., 10 minutes)
- [x] If the persistent process crashes or times out, VRW falls back to spawning a fresh process
- [x] First message in a new conversation still spawns a new process (no behavior change)
- [x] MCP servers (Jira) stay initialized across messages in the same session
- [x] Measure and log the per-message overhead reduction

## Technical Notes

- **Files (VRW):**
  - `valk-remote-workspace/src/stream-runner.ts` (lines 76-151): currently spawns per task
  - `valk-remote-workspace/src/task-queue.ts` (lines 162-250): `processNext()` orchestration
  - `valk-remote-workspace/src/session-store.ts`: session-to-CLI-session mapping
- **Constraint:** Must keep using the Claude CLI (Max subscription), not switch to pay-as-you-go API.
- **Approach options:**
  1. **Keep CLI process alive:** After a task completes, don't kill the process. Feed the next message via stdin. Requires Claude CLI to support interactive stdin in `stream-json` mode.
  2. **Process pool:** Pre-spawn a Claude CLI process and keep it warm. When a message arrives, pipe it to the warm process. Spawn a replacement in the background.
- Option 1 is the most incremental change. Check if `claude --resume` supports piping multiple prompts via stdin in `stream-json` output mode.
- The `sessionStore` already maps `conversationId` to `cliSessionId`, so the infrastructure for session reuse exists.

## Dependencies

- Requires investigation into Claude CLI stdin/interactive capabilities in stream-json mode
- BRDG-197 (smaller prompts) is independent and can be done in parallel
