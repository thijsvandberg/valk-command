# BRDG-173: AI-Suggested Subtasks

**Status:** Open
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish), BRDG-164 (Subtask Rename and Delete)

## Description

As the PO, I want the AI to suggest subtasks based on the ticket's description and acceptance criteria, so I can quickly break down stories into actionable work items during refinement.

## Acceptance Criteria

### Suggestion trigger

- [ ] "Suggest subtasks" button (sparkle icon) in the SubtasksSection header
- [ ] Available in both ticket detail view and refinement session
- [ ] Button shows a loading state while the AI is generating suggestions

### Suggestion display

- [ ] Suggestions appear as a list below the existing subtasks, visually distinct (dashed border or lighter style)
- [ ] Each suggestion shows the proposed title with an "Add" button and a "Dismiss" button
- [ ] "Add all" button to accept all suggestions at once
- [ ] Dismissed suggestions disappear (no undo needed)

### Adding suggestions

- [ ] Clicking "Add" creates the subtask via the existing `POST /api/tickets/[key]/subtasks` endpoint
- [ ] The suggestion is replaced by the real subtask in the list (same optimistic pattern as manual create)
- [ ] "Add all" creates subtasks sequentially to avoid rate limiting

### AI integration

- [ ] Send ticket description, acceptance criteria, and existing subtask titles to the workspace
- [ ] Use the `suggest-subtasks` skill (to be created) or a direct prompt
- [ ] Parse the AI response into a list of subtask title strings

## Technical Notes

- Reuse the workspace task pattern: `POST /api/workspace-tasks` with a `suggest-subtasks` skill
- Parse the streamed response to extract subtask titles (expect a numbered or bulleted list)
- Cache suggestions per ticket key so re-opening does not re-generate (clear on description change)
- Consider a lightweight local-only approach using the chat API if workspace is unavailable

## Out of Scope

- Suggesting story points for subtasks
- Suggesting assignees
- Auto-creating subtasks without user confirmation
- Suggesting subtask dependencies or ordering
