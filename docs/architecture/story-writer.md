# Story Writer Architecture

AI-assisted story editing with draft management, split mode, and related story discovery.

## Overview

The story writer provides a chat interface where the PO collaborates with the AI workspace to refine ticket descriptions. The AI generates story drafts that the PO can accept, edit, and push to Jira.

```
Ticket Detail -> "Write Story" -> Story Writer Session
    |                                  |
    |                              Chat + Editor side-by-side
    |                                  |
    |                              AI generates <story-draft> tags
    |                                  |
    |                              PO accepts/edits draft
    |                                  |
    |                              Push to Jira
    |                                  |
    v                              Session completed
```

## Session Lifecycle

### Create Session

`POST /api/tickets/[key]/story-writer` creates a new session:

1. Checks for existing active session (returns it if found)
2. Creates a conversation record
3. Loads current ticket content as the baseline
4. Records `baseVersionHash` for conflict detection
5. Returns session with empty messages

### Chat Flow

`POST /api/tickets/[key]/story-writer/messages` handles two modes:

**First message:** Invokes the `write-story-draft` skill on the workspace with enriched context:
- Current description (markdown-converted from ADF)
- Acceptance criteria
- Subtasks, links, comments
- Optional codebase research flag
- Optional model selection

**Follow-up messages:** Resumes the existing workspace conversation. If the workspace returns 410 (session lost), the route recovers by reconstructing context and re-sending as a new first message.

**Message reliability (BRDG-084):**
- Messages are inserted with `status: "pending"`, updated to `"sent"` on agent success or `"failed"` on agent failure.
- Failed messages show an inline retry button; retry reuses the existing DB row via `retryMessageId`.
- Server-side dedup: a `contentHash` (SHA-256 of conversationId + normalized content) is checked against recent messages (30s window). Returns 409 on duplicate.
- Client-side dedup: blocks identical content within 10s of the last message.
- `DELETE /api/tickets/[key]/story-writer/messages?failed=true` clears orphaned (pending/failed) messages.
- Session discard automatically cleans up orphaned messages.

### Draft Extraction

When the workspace completes a task, `POST /api/tickets/[key]/story-writer/apply-draft` parses the output for `<story-draft>` XML tags:

```
<story-draft>
## Description
The new story content...
</story-draft>

<story-draft slot="target">
## Split Story Content
For the target ticket...
</story-draft>
```

Drafts are stored in `story_writer_draft` with a `draft_index` for ordering and `story_slot` to distinguish original vs. target content. Execution logs are fetched and stored asynchronously in the background.

### Draft Acceptance

The PO reviews AI drafts in the editor panel. Accepting a draft merges it into the session's `localDraft` field. The PO can further edit before pushing.

### Push to Jira

`POST /api/tickets/[key]/push-to-jira` pushes local edits (title + description) to Jira. For split mode, both original and target tickets are pushed.

### Close Session

`DELETE /api/tickets/[key]/story-writer` marks the session as `completed` or `discarded` and optionally deletes the conversation.

## Split Mode

Split mode allows redistributing content between two tickets:

### Activation

`POST /api/tickets/[key]/story-writer/split` activates split mode by either:
- Linking an existing target ticket
- Creating a new Jira issue (title: `Split: {originalTitle}`)

Creates bidirectional `split to` / `is split from` links in both the local DB and Jira.

### Editing in Split Mode

After activation, the AI receives context about both tickets and generates drafts for each with slot annotations (`original` / `target`). The editor shows two panes, one per ticket.

### Deactivation

Removes the `targetTicketKey` from the session but preserves any target drafts already created.

## Related Stories

The `find-related` skill discovers stories related to the current ticket.

### Discovery

`POST /api/tickets/[key]/story-writer/apply-related` parses `<related-stories>` JSON from workspace output. Candidates are stored in `related_story_candidate` with:
- Relevance score
- Match reason (why the AI considers it related)
- Link state (whether a Jira link was created)

### Linking

`PATCH /api/tickets/[key]/story-writer/apply-related` toggles link state:
- **Link:** Creates `relates to` link in both local DB and Jira
- **Unlink:** Removes both local and Jira links

Found tickets are synced into the local DB in the background.

## Client-Side Hooks

### `useStoryWriter(ticketKey)`

Central hook orchestrating the entire workflow. Located at `src/hooks/useStoryWriter.ts`.

**State:** session, messages, aiDrafts, targetAiDrafts, relatedCandidates, status, streamProgress, usage

**Actions:**
- `sendMessage()` - Send chat message
- `acceptDraft()` / `dismissDraft()` - Handle AI drafts
- `updateLocalDraft()` / `updateLocalTitle()` - Edit original story
- `updateTargetLocalDraft()` / `updateTargetLocalTitle()` - Edit target story (split mode)
- `activateSplit()` / `deactivateSplit()` - Manage split mode
- `saveDraft()` - Persist current drafts
- `pushToJira()` - Push to Jira
- `linkCandidate()` - Toggle related story linking
- `deleteSession()` - Close session

### `useStoryWriterDrafts()`

Manages draft persistence with 500ms debounce. Located at `src/hooks/useStoryWriterDrafts.ts`.

- Debounced saves to both session state and local-edits endpoint
- `acceptDraft()` merges AI draft into session `localDraft`
- `pushToJira()` handles both original and target tickets, with conflict detection

## Data Model

See [database-schema.md](database-schema.md) for table definitions:

- `story_writer_session` - Session state and drafts
- `story_writer_draft` - AI-generated draft suggestions
- `story_writer_execution_log` - Full AI task logs
- `related_story_candidate` - Discovered related tickets

## UI Components

Located in `src/components/story-writer/`:

| Component | Purpose |
|-----------|---------|
| `StoryWriterLayout` | Main container with chat + editor layout |
| `StoryWriterChat` | Chat interface for AI interaction |
| `StoryWriterEditor` | Rich text editor for draft editing |
| `DiffPane` | Side-by-side diff viewer |
| `ChatMessageParts` | Message rendering with structured output |
| `ExecutionLogViewer` | Detailed AI task execution logs |
| `RelatedStoriesPanel` | Related story candidates with link toggle |
| `SplitModeLayout` | Two-pane layout for split editing |
| `SplitPaneHeader` | Header for each split pane |
| `SplitStoryPicker` | Target ticket selector for split mode |
