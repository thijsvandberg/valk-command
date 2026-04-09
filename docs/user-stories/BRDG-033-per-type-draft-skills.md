# VC-033: Per-type draft skills for Story Writer

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, I want the Story Writer to use a dedicated skill per issue type (Story, Bug, Spike, Task), so each skill can be tuned independently with the right format, tone, and guidance without unrelated instructions polluting the prompt.

## Problem

The current `write-story-draft` skill contains all formats in one prompt. Claude sees Story, Bug, Spike, and Task formats every time, even though the issue type is known before the session starts. This wastes context and makes it harder to tune each type independently.

## In Scope

- Create separate skill files: `write-story-draft.md`, `write-bug-draft.md`, `write-spike-draft.md`, `write-task-draft.md` in valk-remote-workspace
- Register all four skills in `skills.ts`
- VC selects the skill based on `ticket.type` when starting a story writer session and when sending the first message
- Each skill file retains the shared sections (product context, codebase research flag, Jira access, writing guidelines, tone) but only includes its own format
- Existing `write-story-draft` skill becomes the Story-specific skill (clean up the type-assessment section and remove other formats)

## Out of Scope

- Changing the format of any issue type (done separately)
- UI changes to the Story Writer view

## Acceptance Criteria

- Starting a session on a Bug ticket invokes `write-bug-draft`, not `write-story-draft`
- Each skill file only contains the format relevant to its type
- Session recovery passes the correct skill for the ticket type
- All four skill files share the same codebase research toggle behavior
