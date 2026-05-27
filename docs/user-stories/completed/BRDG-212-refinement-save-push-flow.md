# BRDG-212: Refinement Edit Save Draft / Push to Jira Flow

**Status:** Complete
**Priority:** High

## Implementation Plan

1. **Fix EditableDescription unmount flush** (`EditableDescription.tsx`): Add a `valueRef` and modify cleanup to `sendBeacon` pending drafts on unmount (not just beforeunload). This ensures navigating between tickets does not lose the last 800ms of typing.

2. **Add push/save/discard state and handlers to refinement session page** (`page.tsx`): Add state (`isPushing`, `pushError`, `overrideConfirmed`, `draftDiscardKey`, `hasLocalTitleEdit`, `hasLocalDescEdit`). Extract `localEdits` and `editState` from `ticketData`. Add `handleDiscardDraft` and `handlePushToJira` callbacks (same pattern as ticket detail page). Add state reset effect when `currentKey` changes.

3. **Expand SessionTicketView props and wire through** (`SessionTicketView.tsx`): Add all new props to interface. Pass `serverLocalEdit`, `onPushToJira`, `isPushing`, `pushError`, `onDiscard`, `showConflictWarning`, `overrideConfirmed`, `onOverrideChange`, `onViewDiff`, `draftDiscardKey` through to `EditableTitle` and `EditableDescription`.

4. **Add conflict warning banner** (`SessionTicketView.tsx`): Render a conflict banner above the title when `showConflictWarning` is true, with "Accept Jira version" and "Review diff" buttons.

5. **Pass new props from refinement page to SessionTicketView** (`page.tsx`): Update the `<SessionTicketView>` invocation with all new props including `key` that incorporates `draftDiscardKey`.

6. **Write tests** (`SessionTicketView.test.tsx`): Test auto-save, save draft, push to Jira, conflict detection, discard.

**`onViewDiff` strategy:** Opens the ticket detail page in a new browser tab (refinement session has no history tab).

## Description

As a PO, I want a proper save draft and push-to-Jira flow in the refinement session ticket edit view, so that description and title changes I make during refinement are persisted and can be synced back to Jira without leaving the session.

Currently the refinement session renders `EditableTitle` and `EditableDescription` but only tracks whether a local edit was made (`onLocalEdit`). There is no auto-save, no draft persistence, no push-to-Jira button, and no conflict detection. The Story Writer already has this full flow working via `useStoryWriterDrafts` and the `/api/tickets/{key}/local-edits` + `/api/tickets/{key}/push-to-jira` endpoints. This story brings the same capability to the refinement session.

## Acceptance Criteria

- [x] Edits in refinement session auto-save as drafts (debounced, `isDraft: true`) to `/api/tickets/{key}/local-edits`
- [x] "Local edits" badge appears on the ticket when unsaved changes exist (consistent with ticket detail view)
- [x] Save Draft action explicitly persists the current state (`isDraft: false`)
- [x] Push to Jira action sends the saved draft to Jira via existing push endpoint
- [x] Conflict detection: if the remote Jira version changed since last sync, warn the user before overwriting
- [x] Override checkbox when conflict is detected (same pattern as Story Writer)
- [x] Discard action reverts local changes
- [x] Loading / error states during push (spinner on button, error message on failure)
- [x] Navigating to the next/previous ticket in the session does not lose unsaved drafts (auto-save fires on navigate)
- [x] Draft state survives page refresh (persisted in local-edits table)
- [x] Push success refreshes the ticket detail data (invalidate SWR cache)
- [x] Tests cover: auto-save on edit, save draft, push to Jira, conflict detection, discard

## Technical Notes

- Reuse `EditableTitle` / `EditableDescription` props that already exist but are not wired up in refinement: `onPushToJira`, `isPushing`, `pushError`, `onDiscard`, `showConflictWarning`, `onViewDiff`
- Extract or reuse the draft management logic from `useStoryWriterDrafts` (`src/hooks/useStoryWriterDrafts.ts`). Consider a shared hook (`useTicketDrafts`) or reuse the existing hook directly if it generalizes cleanly
- API endpoints already exist and are proven:
  - `PUT /api/tickets/{key}/local-edits` for draft save
  - `POST /api/tickets/{key}/push-to-jira` for Jira sync
- Key files to modify:
  - `src/components/refinement-session/SessionTicketView.tsx` (wire up all props on EditableTitle/EditableDescription)
  - `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` (add push/save handlers)
  - Possibly extract shared hook from `src/hooks/useStoryWriterDrafts.ts`
- Auto-save should fire on ticket navigation (prev/next) to prevent data loss
- No changes needed to EditableTitle/EditableDescription components themselves (they already support all required props)

## UI Placement

The save/push controls should appear in the refinement session toolbar or as an inline action bar near the "Local edits" badge, consistent with the Story Writer pattern. Exact placement to be confirmed during implementation.

## Dependencies

- EditableTitle / EditableDescription components (exist)
- Local edits API (`/api/tickets/{key}/local-edits`) (exists)
- Push to Jira API (`/api/tickets/{key}/push-to-jira`) (exists)
- `useStoryWriterDrafts` hook as reference (exists)
