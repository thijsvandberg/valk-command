# BRDG-482: Show bookmark button in story writer as soon as draft syncs to Jira

**Status:** To Do
**Priority:** Low
**Type:** Bugfix

## Description

When a new story is created in the story writer, the bookmark button is absent. It only appears after the user wraps up, navigates away, and reopens the story. The button should appear as soon as the draft has synced to Jira and received a real ticket key — the same moment the "Wrap Up" button appears.

## Current Behaviour

The bookmark button is gated on `!isDraft` (`StoryWriterLayout.tsx:175`), where `isDraft = ticketKey.startsWith("DRAFT-")`. This stays `true` for the entire session even after the draft syncs to Jira, because `ticketKey` never changes within the component lifetime — the URL is silently replaced via `history.replaceState` (no remount).

By contrast, the "Wrap Up" button is gated on `!isStillDraft` (`StoryWriterLayout.tsx:195`), where `isStillDraft = isDraft && !draftSync.realKey`. That variable correctly goes `false` once `useDraftSync` resolves a real Jira key.

The bookmark handler (`handleBookmarkToggle`) also hardcodes `ticketKey` for all API calls (`registerPendingEdit`, `patchTicketDetailCache`, `tickets.setBookmarked`, `captureBookmarkNote`), which would 404 with a DRAFT-xxx key. The `bookmarked` state is derived from `useTicketDetail(ticketKey)`, which also uses the DRAFT key and carries no bookmark data.

## Proposed Approach

Three targeted changes, all in `src/components/story-writer/StoryWriterLayout.tsx`:

1. **Gate condition (line 175):** Change `{!isDraft && (` to `{!isStillDraft && (`. This aligns the bookmark button with the "Wrap Up" button.

2. **Bookmark state:** Add a dedicated `useTicketDetail(effectiveKey)` call for the bookmark state only. `effectiveKey = draftSync.realKey ?? ticketKey`, so before sync it equals `ticketKey` (no extra fetch); after sync it fetches the real ticket's detail where `bookmarked` is populated.

3. **Handler key:** Replace all `ticketKey` references inside `handleBookmarkToggle` with `effectiveKey`, and update the `useCallback` deps array accordingly (`[bookmarked, effectiveKey, captureBookmarkNote]`).

`useTicketDetail(ticketKey)` for `mutateTicket` and `ticketHoverData` remains unchanged — only the bookmark-specific path switches to `effectiveKey`.

Out of scope: showing the bookmark button before the draft has synced (i.e., while `isStillDraft` is still `true` and there is no real Jira key yet) — there is nothing to bookmark at that point.

## Acceptance Criteria

- [ ] After creating a new story and waiting for the "Wrap Up" button to appear (draft synced), the bookmark button is also visible. <!-- StoryWriterLayout.tsx: gate condition line 175 -->
- [ ] Clicking the bookmark button at that point correctly bookmarks the story (no 404, icon toggles, story appears in bookmarks list). <!-- handleBookmarkToggle: all API calls use effectiveKey -->
- [ ] Reopening a story that was bookmarked before wrap-up shows the bookmark as active. <!-- useTicketDetail(effectiveKey) for bookmarked state -->
- [ ] Bookmark button is still absent while the draft is syncing (before the real key is known). <!-- isStillDraft guard -->
- [ ] No regression: bookmark button behaviour on already-saved stories (opened directly by real key) is unchanged. <!-- isDraft=false path untouched -->

## Tests

- [ ] Unit test: `StoryWriterLayout` with a synced draft (`draftSync.realKey` set) renders the bookmark button. <!-- src/components/story-writer/StoryWriterLayout.test.tsx -->
- [ ] Unit test: `StoryWriterLayout` with `isStillDraft=true` does not render the bookmark button. <!-- src/components/story-writer/StoryWriterLayout.test.tsx -->
- [ ] Unit test: `handleBookmarkToggle` calls `tickets.setBookmarked` with `effectiveKey`, not the DRAFT key. <!-- src/components/story-writer/StoryWriterLayout.test.tsx -->

## Related

- [[BRDG-355-bookmark-story-for-reference]] — original bookmark implementation; introduced the `!isDraft` gate with the comment "a DRAFT key has no ticket row".
- [[BRDG-475-quick-note-on-bookmark]] — added `captureBookmarkNote(ticketKey)` call inside the handler that also needs to switch to `effectiveKey`.
- [[BRDG-481-bookmark-feature-polish]] — sibling polish story; this fix is a separate targeted bugfix and does not depend on 481.
- `src/hooks/useDraftSync.ts` — provides `realKey` and the `isStillDraft` guard logic.
