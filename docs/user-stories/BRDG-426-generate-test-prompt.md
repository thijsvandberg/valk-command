# BRDG-426: Generate test prompt (agent-driven) for a ticket

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

When a ticket moves to **Test**, the PO wants to generate a prompt that an agent can use to test the ticket, built from the ticket's **story (description + acceptance criteria)**, its **comments**, and **what changed**. This is the follow-up that fills in the inert **"Generate test prompt"** button already shipped on the status-change line (BRDG-414).

This is a **placeholder — needs scoping** before implementation. The shape below is the expected direction, not a locked spec.

## Current Behaviour

- BRDG-414 added a status-change review line on the sprint board. A change **to Test** renders a **"Generate test prompt"** button that is currently **inert** (`src/components/sprint-board/StatusChangeLine.tsx` — the `isTest` action; no `onClick`, tooltip "coming soon").
- The workspace-task pattern for agent-driven actions already exists and is the template to follow: `POST /api/workspace-tasks` + `useWorkspaceTask` + SSE streaming, with concrete precedents `POST /api/tickets/[key]/suggest-subtasks/route.ts` and `POST /api/tickets/[key]/suggest-epic/route.ts` (each calls `agentFetch` with a skill name + the ticket context and returns `{ taskId, streamUrl }`). See `docs/architecture/workspace-integration.md`.
- The ticket already exposes the inputs a prompt would need: description + acceptance criteria (story content), `jiraComments`, and the BRDG-414 `ticket_status_change` history.
- The valk-agent workspace skills live in the Valk Remote Workspace (`.claude/skills/`); a new skill would be added there.

## Proposed Approach (to scope)

1. **Agent skill** `generate-test-prompt` in the remote workspace: given the story, comments and recent changes, produce a test prompt (manual or agent-runnable test steps / checklist).
2. **Route** `POST /api/tickets/[key]/generate-test-prompt`: gather the ticket's description + AC + comments + recent status/scope changes, call `agentFetch` with the new skill (mirror `suggest-subtasks`), return `{ taskId, streamUrl }`.
3. **Wire the button**: make the BRDG-414 "Generate test prompt" action call the route via `useWorkspaceTask`, stream the result, and surface it (modal / side panel / copy-to-clipboard — to decide).
4. **Where the output goes** (open): a copyable prompt, a drafted comment, a Test Center artifact (BRDG-039), or a task handed to an agent. Decide during scoping.

### Out of scope / open questions

- Output destination + format (see step 4).
- Whether generation also triggers automatically on the move-to-Test, or only on demand via the button (default: on demand).
- Overlap with the Test Center (BRDG-039) `testStatus` / `lastTestReportUrl` — should a generated prompt or its run feed those fields?

## Acceptance Criteria

- [ ] A change **to Test** offers a working "Generate test prompt" action (replacing the BRDG-414 stub). <!-- StatusChangeLine isTest action -->
- [ ] The prompt is built from the ticket's story (description + AC), comments and recent changes. <!-- route gathers inputs -->
- [ ] Generation runs through the existing workspace-task + SSE pattern. <!-- /api/workspace-tasks, useWorkspaceTask, agentFetch -->
- [ ] The generated prompt is surfaced to the PO (destination TBD in scoping).

## Tests

- [ ] Route gathers the expected ticket context and dispatches the skill (happy path + missing-ticket). <!-- src/app/api/tickets/[key]/generate-test-prompt/route.test.ts -->
- [ ] The button triggers generation and renders the streamed result.

## Related

- [[BRDG-414-active-sprint-status-changes]] — ships the inert button this story makes real.
- [[BRDG-039-test-center]] — test status fields that may consume the output.
- Pattern: `suggest-subtasks` / `suggest-epic` routes + `docs/architecture/workspace-integration.md`.
