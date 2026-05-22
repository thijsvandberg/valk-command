# BRDG-161: Plain text chat messages and chat feedback

**Status:** Backlog
**Priority:** High

## Description

Chat conversations currently only forward messages to the workspace when they match specific conditions (slash command, investigation type, sprint goal type). Plain text messages in a regular `chat` conversation are saved to the database but never sent to the workspace. The user gets no feedback that nothing happened: no spinner, no error, no indication that the message was silently dropped.

This story adds two things:
1. A new `chat` skill on VRW that handles general-purpose plain text messages (questions, requests, free-form tasks)
2. Proper feedback in the chat UI so the user always knows what is happening after sending a message

## Problem

**Silent message drop:** A user sends "draft een mail naar Shiji..." in a regular chat conversation. The message is saved (`status: "sent"`) but no workspace task is created. The UI shows the message bubble and an empty input field, as if it was sent successfully. There is no spinner, no assistant response, and no error. The user has no way to know the message was not processed.

**Root cause:** `ChatLayout.tsx` lines 120-193 only create a workspace task if:
- The conversation is a sprint goal type (title starts with "Sprint Goal:")
- The conversation is an investigation type (`type === "investigation"`)
- The message starts with `/` (slash command via `parseSkillInvocation`)

A plain text message in a `type: "chat"` conversation falls through all three checks and `handleSend` returns `true` (success) without ever calling `workspaceTask.submitAndStream()`.

## In Scope

### 1. New `chat` skill on VRW

Create a general-purpose conversational skill that can:
- Answer questions about Jira tickets, sprints, and the codebase
- Help draft text (emails, messages, descriptions)
- Perform lightweight tasks that don't fit a specialized skill
- Use Jira read tools and codebase search tools for context

The skill should be conversational in tone, not produce a rigid report format like `investigate`. Output format is plain text.

**Multi-turn support:** The VRW already supports session resume via Claude CLI's `--resume` flag and `enqueueMessage()`. The chat skill should leverage this so follow-up messages in the same conversation maintain context from previous turns.

#### VRW changes

- [x] Create `.claude/skills/chat.md` with the skill prompt
- [x] Register the skill in `src/skills.ts` SKILL_REGISTRY with id `chat`, outputFormat `text`, reasonable timeout (5 min), tools: base tools + Jira read tools

### 2. Bridge: forward plain text messages as `chat` skill

In `ChatLayout.tsx`, after the existing checks (sprint goal, investigation, slash command), add a fallback that forwards plain text messages to the workspace via the `chat` skill.

For follow-up messages (when a session already exists for the conversation), use the existing `enqueueMessage` mechanism instead of creating a new task.

#### Bridge changes

- [x] `ChatLayout.tsx`: add fallback in `handleSend` to submit plain text as `chat` skill when no other handler matches
- [x] `ChatLayout.tsx`: for follow-up messages in an active chat session, use `enqueueMessage` flow instead of creating a new task
- [x] `workspace-tasks/route.ts`: add `case "chat"` to `buildConversationTitle` (use first ~50 chars of message)
- [x] `workspace-tasks/route.ts`: add `case "chat"` to `buildPromptSummary` (use the full message text)
- [x] Update conversation title from "New conversation" to something meaningful on first message

### 3. Chat UI feedback

The chat UI must give clear feedback at every stage of message processing. The user should never be left wondering whether their message was received, is being processed, or failed.

- [x] Show a loading/typing indicator after sending a message while waiting for workspace response <!-- already implemented: TaskProgress shows pulsing dot + progress text for submitting/streaming states -->
- [x] Show an error message in the chat if the workspace task fails to start (agent unreachable, skill not found, etc.) <!-- already implemented: useWorkspaceTask catches errors, TaskProgress renders failed state -->
- [x] Show an error message if the workspace task errors out during execution <!-- already implemented: onStructuredError/onNetworkError handlers in useWorkspaceTask -->
- [x] Show an error message if the workspace task times out <!-- already implemented: 5-min client-side timeout in useWorkspaceTask.openStream -->
- [x] Disable the send button while a task is actively running (prevent double-sends) <!-- already implemented: MessageInput disabled prop bound to submitting/streaming -->
- [x] If no workspace task is created for any reason (edge case), show an explicit error rather than silently succeeding <!-- fixed: plain text now always triggers a workspace task via the chat skill fallback -->

## Out of Scope

- Changes to the `investigate` skill (remains its own specialized skill)
- Changes to sprint goal or investigation conversation flows
- Streaming token-by-token output (current SSE stream with progress events is sufficient)
- Rich formatting or markdown rendering in assistant responses (existing rendering is fine)

## Acceptance Criteria

- [x] A plain text message in a regular chat conversation is forwarded to the workspace and receives a response
- [x] Follow-up messages in the same conversation maintain context from previous turns
- [x] The user sees a loading indicator between sending a message and receiving a response
- [x] If the workspace is unreachable or the task fails, the user sees a clear error message in the chat
- [x] Slash commands (`/investigate`, `/review-story`, etc.) continue to work as before
- [x] Investigation and sprint goal conversations are unaffected
- [x] The conversation title updates from "New conversation" to something descriptive after the first message

## Implementation Plan

1. **VRW: Create chat skill** - `.claude/skills/chat.md` (conversational prompt, text output) + register in `src/skills.ts` with BASE_TOOLS + JIRA_READ_TOOLS, 5 min timeout
2. **Bridge: workspace-tasks route** - Add `case "chat"` to `buildConversationTitle` (first ~50 chars) and `buildPromptSummary` (full text). Update existing "New conversation" titles server-side.
3. **Bridge: chat-messages proxy** - New `POST /api/conversations/[id]/chat-messages/route.ts` that proxies to VRW's `POST /api/conversations/:id/messages` (enqueueMessage). Add `streamExistingTask(taskId, skill)` to `useWorkspaceTask`. Spawn `captureTaskStream` background handler. 410 recovery: fall back to fresh `chat` task.
4. **Bridge: ChatLayout fallback** - In `handleSend`, after slash-command check: if no invocation, detect first-message vs follow-up. First message -> `submitAndStream("chat", ...)`. Follow-up (assistant message exists) -> proxy route. Update title client-side if still "New conversation".
5. **Feedback (8-13)** - Already implemented: TaskProgress shows submitting/streaming/failed states, MessageInput disables during task, useWorkspaceTask handles timeout/errors. The fix is ensuring plain text always triggers a workspace task so the existing feedback mechanisms activate.
6. **Tests** - workspace-tasks route chat cases, chat-messages proxy route, ChatLayout plain text fallback

## Technical Notes

### VRW skill system
- Skills defined in `/valk-remote-workspace/.claude/skills/*.md` (prompt) + `/src/skills.ts` (registry)
- Skill config: `{ id, name, promptFile, tools, timeout, outputFormat }`
- Args injected at the end of the prompt as `User input:\nkey: value`
- Session resume: `SessionStore` maps `conversationId` to `cliSessionId`, `--resume` flag on Claude CLI

### Bridge chat flow
- `ChatLayout.tsx`: `handleSend` saves message via `sendMessage()`, then conditionally calls `workspaceTask.submitAndStream()`
- `useWorkspaceTask.ts`: `submitAndStream()` calls `POST /api/workspace-tasks`, then opens SSE stream
- `workspace-tasks/route.ts`: creates conversation + message in DB, calls `agentFetch("/api/tasks")`, spawns `captureTaskStream` in background
- `task-stream-handler.ts`: captures SSE stream server-side, saves assistant message and updates workspace_task status

### Key files
- `src/components/chat/ChatLayout.tsx` - message send handler (the core change)
- `src/components/chat/MessageInput.tsx` - send button, input field
- `src/hooks/useWorkspaceTask.ts` - workspace task submission and streaming
- `src/app/api/workspace-tasks/route.ts` - task creation API, title/summary builders
- `src/lib/task-stream-handler.ts` - server-side stream capture
- VRW: `src/skills.ts` - skill registry
- VRW: `src/task-queue.ts` - task processing, session resume
- VRW: `.claude/skills/` - skill prompt files
