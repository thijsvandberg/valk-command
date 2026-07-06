# BRDG-483: Accept-draft "Accepted" state does not survive a refresh

**Status:** Done
**Priority:** Medium

## Status

Shipped. The accepted marker is now derived from persisted data via a new pure
helper `computeAcceptedDraftIds` (`src/lib/accepted-drafts.ts`), which matches a
draft's content against the session's saved `localDraft` / `targetLocalDraft`
(per `story_slot`). The set flows through `StoryWriterChat` (`acceptedDraftIds`)
into `ChatMessage`, which keeps only an optimistic flag for instant click
feedback. No DB migration. Both mounts wired: Story Writer (`ChatApp`, both
slots) and Epic Writer (`EpicWriterLayout`, original slot).

Commits: `d8885f7d` (shared fix + Story Writer); the Epic Writer mount wiring
landed alongside the concurrent BRDG-485 commit that owned `EpicWriterLayout.tsx`
(the 3 additive hunks were verified type-clean in isolation first).

Verified: `npm run lint`, `npm run typecheck`, `npx vitest run` (7918 tests),
and `npm run build` all green on the integrated HEAD. E2E in the running app:
- Story Writer (VPL-46294): after a hard refresh, the draft matching the saved
  `localDraft` shows "Accepted" with no Accept button; the non-matching draft
  still offers "Accept draft". No new console errors.
- Epic Writer (VPL-47279): 3 drafts render, exactly the one matching the saved
  content shows "Accepted" on a cold load. No runtime errors.

## Description

As a user of the Story Writer and Epic Writer, when I accept an AI draft I want it to still look accepted after a page refresh, so I trust that my accept was saved and I do not re-accept the same draft by mistake.

Shared bug: this lives in the common chat rendering used by both the Story Writer and the Epic Writer, so it is not epic-specific.

## Problem

Clicking **Accept draft** on a chat message does persist the content: `acceptDraft` (`src/hooks/useStoryWriterDrafts.ts`) sends `PATCH .../story-writer { acceptDraftId }`, which sets the session's `localDraft` and writes a description local-edit. No data is lost.

But the *accepted* indication is client-only state. In `src/components/story-writer/ChatMessageParts.tsx` the `draftAccepted` flag is `useState(false)` (line ~298) and is only flipped to `true` in the click handler (line ~592). On a hard refresh it resets to `false`, so:

- the "Accepted" badge (line ~520) disappears, and
- the **Accept draft** button (line ~586) reappears

on a draft that was already accepted. It reads as "my accept did not save," and re-clicking re-applies the same content.

## Root cause

Accepted-state is derived from ephemeral React state, not from persisted data. The session row has no `accepted_draft_id`; it only stores the accepted content in `local_draft` / `target_local_draft`.

## Proposed fix

Derive the accepted state from persisted data instead of local state, so it survives refresh with no DB migration:

- Treat a draft as accepted when its content matches the session's saved `localDraft` (or `targetLocalDraft` for the target slot, keyed off the draft's `story_slot`).
- Initialize `draftAccepted` from that comparison; keep the optimistic `setDraftAccepted(true)` on click for immediate feedback.

Consider a persisted `accepted_draft_id` on the session only if content-matching proves ambiguous (e.g. two drafts with identical content); prefer the no-migration approach first.

## In Scope

- Accepted state (badge shown, Accept button hidden) is correct after a hard refresh in both the Story Writer and the Epic Writer
- Works for the target slot in Story Writer split mode

## Out of Scope

- Any change to what accepting a draft persists (content saving already works)
- The Epic Writer flow/breakdown work (BRDG-479) and the misc polish (BRDG-478)

## Acceptance Criteria

- [x] After accepting a draft and hard-refreshing, that draft shows "Accepted" and does not offer the Accept button again
- [x] A not-yet-accepted / superseded draft still shows the Accept button
- [x] Behaviour is correct in both Story Writer (incl. target slot) and Epic Writer
- [x] Tests cover the derived accepted-state (accepted vs. not, per slot); `npm run test` and `npm run build` pass
