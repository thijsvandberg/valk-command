# BRDG-173: AI-Suggested Subtasks

**Status:** Done
**Priority:** Medium
**Related:** BRDG-170 (Refinement Session View Polish), BRDG-164 (Subtask Rename and Delete)

## Description

As the PO, I want the AI to suggest subtasks based on the ticket's description and acceptance criteria, so I can quickly break down stories into actionable work items during refinement.

## Implementation Plan

1. **Parser utility** (`src/lib/parse-subtask-suggestions.ts`): Pure function `parseSubtaskSuggestions(output: string): string[]` that extracts subtask titles from numbered/bulleted AI output. Unit tests for all input formats.

2. **API route** (`src/app/api/tickets/[key]/suggest-subtasks/route.ts`): POST handler following `suggest-epic` pattern. Fetches ticket description, acceptance criteria, and existing subtask titles from DB. Submits `suggest-subtasks` skill to VRW via `agentFetch`. Returns `{ taskId, streamUrl }` (202).

3. **API client + skill registration**: Add `tickets.suggestSubtasks(key)` to `api-client.ts`. Register `suggest-subtasks` in `buildConversationTitle` and `buildPromptSummary` in `workspace-tasks/route.ts`.

4. **SubtaskSuggestions component** (`src/components/ticket-detail/SubtaskSuggestions.tsx`): Displays parsed suggestions with Add/Dismiss per row and Add All button. Dashed border styling to distinguish from real subtasks. Loading and error states.

5. **SubtasksSection integration**: Add Sparkles button to header. Manage streaming lifecycle (submit, parse result, cache). Wire Add (optimistic create via existing pattern), Add All (sequential), and Dismiss actions.

## Acceptance Criteria

### Suggestion trigger

- [x] "Suggest subtasks" button (sparkle icon) in the SubtasksSection header
- [x] Available in both ticket detail view and refinement session
- [x] Button shows a loading state while the AI is generating suggestions

### Suggestion display

- [x] Suggestions appear as a list below the existing subtasks, visually distinct (dashed border or lighter style)
- [x] Each suggestion shows the proposed title with an "Add" button and a "Dismiss" button
- [x] "Add all" button to accept all suggestions at once
- [x] Dismissed suggestions disappear (no undo needed)

### Adding suggestions

- [x] Clicking "Add" creates the subtask via the existing `POST /api/tickets/[key]/subtasks` endpoint
- [x] The suggestion is replaced by the real subtask in the list (same optimistic pattern as manual create)
- [x] "Add all" creates subtasks sequentially to avoid rate limiting

### AI integration

- [x] Send ticket description, acceptance criteria, and existing subtask titles to the workspace
- [x] Use the `suggest-subtasks` skill (to be created) or a direct prompt
- [x] Parse the AI response into a list of subtask title strings

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
