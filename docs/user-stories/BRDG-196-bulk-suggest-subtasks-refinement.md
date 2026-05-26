# BRDG-196: Bulk Suggest Subtasks from Refinement Session

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to generate subtask suggestions for all tickets in a refinement session with one action, so I can prepare an entire refinement efficiently without opening each ticket individually.

The bulk generation runs in the background. A chat conversation linked to the session shows progress with links to each ticket. Suggestions stay as drafts ("concept") on each ticket until I accept them. The system is smart about regeneration: it compares the suggestion generation date against the ticket's last change date and only regenerates when the ticket has been modified since.

## Current Behavior

- Subtask suggestions can only be triggered per ticket from the ticket detail view
- No bulk action exists on the refinement overview
- No conversation/chat view in the refinement overview context
- Subtask suggestions have no "concept/accepted" status tracking

## Desired Behavior

### 1. Trigger: Bulk action button on refinement overview

- Button in the queue panel header (e.g. "Suggest subtasks") for the active refinement session
- Triggers generation for **all tickets in that session's queue**
- Disabled while a bulk job is already running for this session

### 2. Background processing with chat conversation

- Creates (or reuses) a conversation linked to the refinement session
- Chat panel visible on the refinement overview page (collapsible sidebar or bottom panel)
- Messages appear as the job progresses:
  - Start: "Starting subtask generation for 8 tickets..."
  - Per ticket: "Generating subtasks for [VPL-123](link)..." then "Generated 4 suggestions for [VPL-123](link)"
  - Skip: "Skipping [VPL-456](link) - suggestions are up to date (generated after last change)"
  - End: "Done. Generated suggestions for 6/8 tickets (2 skipped, already up to date)"
  - Error: "Failed to generate for [VPL-789](link): {reason}"
- Conversation persists so you can review what happened in previous runs

### 3. Smart regeneration logic

- For each ticket in the queue, compare:
  - `subtask_suggestion.createdAt` (most recent suggestion for this ticket)
  - vs. ticket's `updatedAt` / Jira's `updated` field (last modification date)
- **Skip** if suggestions exist AND were generated after the ticket's last change
- **Regenerate** if the ticket was modified since the last suggestion generation
- **Generate** if no suggestions exist yet
- User can force-regenerate all via a "Regenerate all" option (ignores skip logic)

### 4. Results on tickets

- Subtask suggestions appear on the ticket in the refinement session view (existing `SubtaskSuggestions` component)
- Suggestions are in "concept" state by default (visual indicator, e.g. subtle styling or label)
- PO can accept individual suggestions (creates subtask in Jira) or dismiss them
- A small indicator on the ticket row in the queue panel shows how many pending suggestions exist (e.g. sparkle icon with count badge)

## Implementation Plan

### Backend

- [x] New API endpoint: `POST /api/refinement-sessions/[id]/bulk-suggest-subtasks`
  - Reads session's `ticketKeys` to get the list
  - Creates/reuses a conversation linked to the session (store `conversationId` on session or use metadata)
  - Posts a "start" message to the conversation
  - Processes tickets sequentially (VRW handles one task at a time):
    - Check skip logic (compare dates)
    - Call existing `suggest-subtasks` skill via VRW for each ticket
    - Parse output and persist to `subtask_suggestion` table
    - Post progress messages to conversation with ticket links
  - Posts "done" summary message
  - Uses `after()` for background execution, returns job ID immediately

- [x] Add `bulkSuggestConversationId` field to `refinementSession` table (or use metadata) to link the chat conversation
  - Used deterministic conversation ID pattern (`bulk-suggest-${sessionId}`) with metadata, no schema change needed

- [x] Add `GET /api/refinement-sessions/[id]/bulk-suggest-subtasks` endpoint to check if a bulk job is running
- [x] Add `GET /api/refinement-sessions/[id]/suggestion-counts` endpoint for per-ticket suggestion counts

### Frontend

- [ ] Add "Suggest subtasks" button to queue panel header in `RefinementPageContent.tsx`
  - Disabled state while job is running
  - Dropdown or secondary option for "Regenerate all" (force mode)

- [ ] Add chat conversation panel to refinement overview
  - Reuse `TicketChatPane` pattern or build a lightweight read-only message list
  - Collapsible panel (side or bottom)
  - Messages render ticket links as clickable chips/links
  - Auto-scrolls as new messages arrive

- [ ] Add suggestion count indicator on ticket rows in the queue panel
  - Small badge (e.g. sparkle + count) on tickets that have pending suggestions
  - Fetch suggestion counts via a batch endpoint or include in ticket data

- [ ] Ensure `SubtaskSuggestions` component in `SessionTicketView` loads and displays suggestions when entering a ticket in the refinement session

### Tests

- [ ] API test: `POST /api/refinement-sessions/[id]/bulk-suggest-subtasks` creates conversation, processes tickets, posts messages
- [ ] API test: skip logic correctly compares dates
- [ ] API test: force-regenerate ignores skip logic
- [ ] Unit test: suggestion count badge renders correctly on queue items
- [ ] Integration test: end-to-end flow from button click to suggestions appearing on tickets

## Acceptance Criteria

- [ ] "Suggest subtasks" button visible in queue panel header for active refinement sessions
- [ ] Clicking the button starts background generation for all session tickets
- [ ] Chat conversation shows real-time progress with clickable ticket links
- [ ] Tickets modified since last generation get new suggestions; unchanged tickets are skipped
- [ ] "Regenerate all" option bypasses skip logic
- [ ] Suggestions appear on ticket detail in refinement session via existing SubtaskSuggestions component
- [ ] Queue panel shows suggestion count indicator per ticket
- [ ] Button is disabled while a bulk job is already running
- [ ] Conversation persists across page navigations (can review previous runs)
- [ ] Errors for individual tickets don't block processing of remaining tickets

## Technical Notes

### Existing infrastructure to reuse
- **Subtask suggestion per ticket**: `POST /api/tickets/[key]/suggest-subtasks` triggers VRW skill, `subtask_suggestion` table stores results
- **Workspace task system**: `workspaceTask` table + `captureTaskStream()` for async VRW execution
- **Conversation system**: `conversation` + `message` tables, `useMessages` hook with polling
- **Refinement session**: `refinementSession` table with `ticketKeys` array, `RefinementPageContent.tsx` for overview UI
- **SubtaskSuggestions component**: Already renders suggestions with add/dismiss actions

### Key files
- `src/app/api/tickets/[key]/suggest-subtasks/route.ts` - existing per-ticket trigger
- `src/app/api/tickets/[key]/subtask-suggestions/route.ts` - CRUD for suggestions
- `src/app/api/workspace-tasks/route.ts` - workspace task submission
- `src/lib/task-stream-handler.ts` - SSE stream capture
- `src/lib/parse-subtask-suggestions.ts` - AI output parser
- `src/components/ticket-detail/SubtaskSuggestions.tsx` - suggestion UI
- `src/components/refinement-session/RefinementPageContent.tsx` - refinement overview
- `src/components/shared/TicketChatPane.tsx` - reusable chat panel pattern
- `src/db/schema.ts` - all table definitions

### Sequential processing
VRW processes one skill at a time. The bulk endpoint must queue tickets sequentially, waiting for each to complete before starting the next. The conversation messages provide real-time feedback so the PO knows what's happening.

### Conversation message format
Messages should use markdown with ticket links formatted as `[VPL-123](/tickets/VPL-123)` so they render as clickable in the chat UI. Status messages come from the "assistant" role.
