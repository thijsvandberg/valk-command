# BRDG-177: Refinement Session URL Routing

**Status:** Open
**Priority:** Medium
**Related:** BRDG-166 (Saved Refinement Sessions)

## Description

As the PO, I want each refinement session to have its own URL (`/refinement/[sessionId]`), so I can bookmark, share, and deep-link directly to a specific session instead of always landing on `/refinement` and having to select the right tab.

## Context

Currently the refinement page lives at a single route `/refinement`. Saved sessions are selected via tabs on that page, but the URL never changes. This means:

- You cannot bookmark or share a link to a specific session
- The toast after adding tickets from the sprint backlog always links to `/refinement`, not to the session the tickets were added to
- Browser back/forward does not navigate between sessions

## Acceptance Criteria

### URL routing

- [ ] `/refinement` shows the refinement page with the default view (quick session or first saved session)
- [ ] `/refinement/[sessionId]` opens the refinement page with the specified session active
- [ ] Clicking a session tab updates the browser URL to `/refinement/[sessionId]`
- [ ] Navigating to an invalid/deleted session ID shows a fallback (redirect to `/refinement` or an inline "session not found" message)
- [ ] Browser back/forward navigates between previously visited sessions

### Toast deep-link

- [ ] After adding tickets to a refinement session from the sprint backlog (AddToRefinementModal), the toast "Open refinement" link points to `/refinement/[sessionId]` instead of `/refinement`
- [ ] Clicking the toast link navigates to the correct session and shows it as the active tab

### Quick session handling

- [ ] Quick session remains accessible at `/refinement` (no session ID needed since it is ephemeral)
- [ ] When the user clicks the Quick Session tab, the URL updates to `/refinement` (no ID suffix)

## Technical Notes

- The `onAdded` callback in `SprintBoard.tsx` already receives `(id, name)` from AddToRefinementModal. The `id` is the session ID; use it to construct the link.
- Two approaches for routing:
  - **Option A: App Router dynamic route** - Add `src/app/(app)/refinement/[sessionId]/page.tsx` that renders the same refinement page with `sessionId` as a param
  - **Option B: Shallow routing** - Keep a single page component and use `router.push`/`router.replace` with shallow navigation to update the URL without a full page reload
- The active refinement session page (`/refinement/session`) for the live ceremony is a separate route and should remain unchanged
- Consider using `router.replace` instead of `router.push` when switching tabs to avoid polluting the browser history with every tab click (or let the user choose via normal click vs. explicit navigation)

## Out of Scope

- Slug-based URLs (e.g., `/refinement/my-session-name`); UUID-based is sufficient
- Shareable public URLs (this is a single-user app)
- Changes to the active refinement session route (`/refinement/session`)
