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

After a successful update, `pushToJira` runs a **confirm-fetch**: it re-reads the issue from Jira (retrying briefly until the remote `updated` timestamp moves past the pre-push value, because Jira reads right after a write can be stale) and ingests that canonical state via `ingestIssue` (sync-tickets-service). This records the pushed content as the newest `storyVersion`, refreshes the mirror's `jiraUpdatedAt`, and lets the session rebase below land on the *pushed* version rather than the pre-push one. Confirm-fetch failures never fail the push; the deferred `checkUpdated` sync plus echo suppression (below) cover the fallback.

On a successful push, `pushToJira` then rebases the active session's `baseVersionHash` onto the just-pushed version, so the draft is not immediately flagged as outdated (see below).

Conflicts are content-only: if Jira's `updated` moved but the latest synced content hash still matches the edit's `baseJiraVersion` (metadata-only drift such as status changes or Bridge's own earlier push), the push proceeds without prompting.

### Draft key promotion

A brand-new story starts as a `DRAFT-<uuid>` placeholder row in `ticket`. When it is pushed to Jira, `syncDraftToJira` / `finalizeDraft` (`src/lib/draft-sync.ts`) create the real issue and swap the key across the related tables; the old draft row is kept with `status = "REPLACED"` and its `description` set to the new real key. `resolveDraftKey(key)` reads that pointer to map a finalized `DRAFT-` key to its real key (returning the key unchanged for non-drafts and still-pending drafts).

Anything that persists draft keys must resolve them on read, or it references a ghost once the draft is promoted. Refinement sessions store ticket keys, so the `/api/refinement-sessions` reads run `resolveSessionTicketKeys` (resolve each key, then dedup — a draft can resolve to a key already in the queue) before returning `ticketKeys` / `ticketCount`. This keeps a session's count and queue aligned with the live tickets.

### Outdated-draft detection (BRDG-243)

When the Jira version of a ticket moves on after a draft's baseline was recorded (for example, the same ticket is edited and pushed from the single story view in another tab), the editor surfaces a warning so the PO does not keep editing a stale draft.

- **Detection:** `GET /api/tickets/[key]/story-writer` returns top-level `outdated` and `targetOutdated` booleans alongside `session`. `outdated` is `true` when `session.baseVersionHash` is non-null and differs from the latest `storyVersion.contentHash` for the ticket (null-guarded, mirroring the conflict semantics in `pushToJira`). `targetOutdated` is derived from the target ticket's `ticketLocalEdit` description baseline vs its latest Jira version.
- **Banner:** `OutdatedBanner` (`panes/OutdatedBanner.tsx`) renders at the top of the editor pane (`EditorApp`, and `SplitTargetApp` for the target) with two actions:
  - **View difference** opens the diff pane (editor draft vs latest Jira version).
  - **Take Jira version** pulls the current Jira content into the editor, rebases the baseline (PATCH `rebaseBaseline: true` for the original; local-edits rebase for the target), and refreshes the session so the warning clears.
- **No false positives:** accepting an AI draft does not change `baseVersionHash` or create a `storyVersion`, so it never flags outdated; a successful push rebases the baseline server-side.
- **Own-push echo suppression:** when sync records a new `storyVersion` whose markdown matches the local mirror (`markdownEqualIgnoringSpacing`, AC unchanged), it is the echo of Bridge's own push returning through webhook/sync, not an external edit. `upsert-issue` keeps the version for history but skips the `content:changed` emit and rebases any active session's `baseVersionHash` onto it.
- **Self-heal at read time:** if `outdated`/`targetOutdated` would be `true` but the latest version's content matches the draft (same `markdownEqualIgnoringSpacing` check), the GET route silently rebases the baseline (`baseVersionHash` for the session, `baseJiraVersion` for the target's local edit) and reports not outdated. This rescues sessions stuck in the false-outdated state from before these fixes and covers races the other two layers miss.
- **Live cross-tab updates:** the `outdated` flag is recomputed at fetch time, so an open editor would otherwise stay stale until reload. A per-ticket SSE stream closes that gap:
  - `emitTicketEvent({ type: "content:changed", ticketKey })` fires whenever the ticket's content moves on server-side: from `pushToJira` (ticket-service) and from `upsert-issue` when a new `storyVersion` is recorded (Jira webhook, sync, agent push).
  - `GET /api/events` streams those events on the unified per-browser SSE connection (BRDG-342); the shared event bus (`src/lib/event-bus.ts`) demultiplexes them, and `useTicketEvents(key, onChange)` subscribes, filtering to the requested key client-side (disabled for `DRAFT-` keys).
  - The editor reacts via `useStoryWriterActions` with a working-tree rule (interpretation A): an **untouched** draft (`!isDraftDirty`, i.e. `localDraft` still equals the Jira baseline) follows the new Jira version via the existing `handleTakeJiraVersion` path; a draft with the PO's **own work** is never overwritten — only `refreshSession()` + `mutateTicket()` run so the banner re-evaluates. Events are ignored while this tab is mid-stream or mid-push (those paths refresh on their own).

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

### Suggestion display

Two inline cards surface in the chat thread, both built on the shared `SuggestionCard` shell:
- **Related stories** (`RelatedStoriesInline`) - scored candidates from `find-related`, with per-row link toggle. Shows an `Applied` header badge once any candidate is linked.
- **Link suggestions** (`LinkSuggestionChips`) - relation-typed link proposals parsed from a chat message. Stories already linked to the ticket (e.g. linked earlier via the related stories panel) are filtered out so they are never re-proposed; only in-session links stay visible to confirm the action.

## Client-Side Hooks

### `useStoryWriter(ticketKey)`

Central hook orchestrating the entire workflow. Located at `src/hooks/useStoryWriter.ts`.

**State:** session, messages, aiDrafts, targetAiDrafts, relatedCandidates, status, streamProgress, usage, outdated, targetOutdated

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
| `TitleInput` | Editable story title; reveals a compact hover/focus sparkle button that sends the type-aware suggest-title prompt in one click. Hidden once the chat already contains a title suggestion (`hasTitleSuggestion`) |
| `OutdatedBanner` | Warns when the Jira version changed under the draft; offers view-diff / take-Jira |
| `SplitModeLayout` | Two-pane layout for split editing |
| `SplitPaneHeader` | Header for each split pane |
| `SplitStoryPicker` | Target ticket selector for split mode |
