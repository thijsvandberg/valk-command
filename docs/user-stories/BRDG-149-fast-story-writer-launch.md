# BRDG-149: Fast Story Writer Launch

**Status:** Draft
**Priority:** Medium

## Description

As the PO, I want the story writer to open instantly when I create a new story, so I can start writing without waiting for the Jira issue to be created first.

Currently, clicking "Create & open" in the StoryWriterLauncherModal blocks on a synchronous Jira API call (`jiraClient.createIssue`) before navigating to the story writer. This makes the flow feel sluggish (1-3s spinner in the modal). The Jira key is the primary identifier, so the entire chain (local DB insert, session creation, page load) is blocked by this external call.

## Current Behavior

1. User fills in title, type, sprint in `StoryWriterLauncherModal`
2. Clicks "Create & open"
3. `POST /api/story-writer/create` is called and **fully awaited**:
   - `jiraClient.createIssue()` (external HTTP, 1-3s)
   - `db.insert(ticket)` (local, fast)
   - `db.insert(ticketMetadata)` (local, fast)
   - `logActivity()` (local, fast)
   - All 4 steps run sequentially
4. Only after the full response: modal closes + router navigates to `/tickets/${key}/write`
5. On that page: `useStoryWriter` hook fetches/creates a session (more DB calls)
6. Finally `status === "ready"` and the user can start writing

**Key files:**
- `src/components/shared/StoryWriterLauncherModal.tsx` (lines 437-449): `handleCreateNew()`
- `src/app/api/story-writer/create/route.ts`: Jira creation + local DB inserts
- `src/hooks/useStoryWriter.ts`: session initialization
- `src/app/api/tickets/[key]/story-writer/route.ts`: session creation API

## Desired Behavior

The modal closes and the story writer opens near-instantly. Jira issue creation happens in the background. The user can start writing their story description immediately, with the Jira key appearing once available.

## Implementation Plan

1. **Phase 4 first (quick win)**: Parallelize the 3 sequential DB inserts in `POST /api/story-writer/create` with `Promise.all`.
2. **New API route `POST /api/story-writer/create-draft`**: Creates a local-only ticket with `DRAFT-{uuid}` key and `status: "DRAFTING"`. No Jira call. Returns the draft key immediately.
3. **Add `createDraft` to api-client**: New method in the `storyWriter` namespace.
4. **Update `handleCreateNew` in StoryWriterLauncherModal**: Call `createDraft` instead of `createViaGlobal`, navigate to `/tickets/DRAFT-xxx/write` immediately.
5. **Update command palette**: Same pattern as step 4.
6. **Skip Jira freshness check for draft keys**: In `useTicketDetail`, skip `jiraApi.checkUpdated()` when key starts with `DRAFT-`.
7. **New API route `POST /api/story-writer/finalize-draft`**: Accepts `{draftKey, realKey}`. In a transaction: insert new ticket row with real key, update `ticketMetadata`, `storyWriterSession`, `conversation.relatedTicket`, set old draft ticket `status: "REPLACED"`.
8. **Server-side background sync**: The `create-draft` route fires `jiraClient.createIssue()` in a detached promise after responding. On success, calls the finalize logic internally. On failure, marks ticket as `DRAFT_FAILED`.
9. **New hook `useDraftSync`**: Polls `GET /api/story-writer/draft-status?key=DRAFT-xxx`. Returns `{syncStatus, realKey, error, retry}`. When synced, calls `router.replace()`.
10. **New API route `GET /api/story-writer/draft-status`**: Returns `{status: "pending"|"synced"|"error", realKey?, error?}` by checking the ticket table.
11. **Integrate `useDraftSync` into StoryWriterLayout**: Show pulsing placeholder while pending, error banner on failure, retry button.
12. **Hide Jira-specific actions for draft keys**: Conditionally hide "Open in Jira", "Pull from Jira", "Push to Jira" when key starts with `DRAFT-`.

## Acceptance Criteria

### Phase 1: Optimistic navigation with local draft
- [x] Introduce a "draft" concept: create a local-only ticket record with a temporary key (e.g., `DRAFT-{uuid}`) and `status: "DRAFTING"`
- [x] `handleCreateNew` creates the local draft and navigates to `/tickets/DRAFT-xxx/write` immediately (no waiting for Jira)
- [x] The story writer session is created against the draft key and works normally
- [x] User can start typing their story description immediately after the modal closes

### Phase 2: Background Jira sync
- [ ] After the local draft is created, fire the Jira issue creation in the background (non-blocking)
- [ ] When the Jira API responds with the real key (e.g., `BRDG-250`):
  - Update the local ticket record: replace `DRAFT-xxx` with the real Jira key
  - Update the `storyWriterSession`, `ticketMetadata`, and `conversation` records to use the real key
  - Update the URL from `/tickets/DRAFT-xxx/write` to `/tickets/BRDG-250/write` (use `router.replace`)
- [ ] Show a subtle indicator in the story writer header while the Jira key is pending (e.g., pulsing placeholder instead of the ticket key)
- [ ] Once the real key arrives, display it in the header with a brief transition

### Phase 3: Error handling
- [ ] If Jira creation fails, show an inline error banner in the story writer (not a blocking modal)
- [ ] Provide a "Retry" action in the banner to re-attempt Jira creation
- [ ] The user's draft content is preserved regardless of Jira sync status
- [ ] If the user closes the story writer before Jira creation completes, the background task still finishes and updates the record

### Phase 4: Parallelize remaining DB operations
- [x] In the create API route, run the 3 DB operations (`ticket`, `ticketMetadata`, `logActivity`) with `Promise.all` instead of sequentially
- [x] Same pattern for the session creation route where applicable <!-- already parallelized with Promise.all on line 144 -->

## Technical Notes

- The main challenge is that `jiraKey` is currently used as the primary key/identifier throughout the system (ticket table, metadata, sessions, URLs). The draft key approach requires all lookups to work with both draft keys and real Jira keys.
- Consider adding a `draftId` column to the ticket table, or using a separate `drafts` table that gets merged into `ticket` once the Jira key arrives.
- Alternative simpler approach: instead of draft keys, keep using the modal spinner but optimize the Jira call. Evaluate if the Jira project has webhooks that could confirm creation async, or if there is a faster Jira endpoint.
- The `useStoryWriter` hook already handles session loading/creation. It would need to additionally poll or subscribe (SSE) for the Jira key update.
- For the URL update in Phase 2, Next.js `router.replace()` updates the URL without a navigation/re-render.
- The `Promise.all` optimization in Phase 4 is independent and can be shipped separately as a quick win.

## Out of Scope (for now)

- Offline draft support (working without any network)
- Batch creation of multiple stories
- Pre-fetching the story writer page shell before the modal submit
