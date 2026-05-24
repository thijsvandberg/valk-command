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

## Implementation Plan

1. **Extract shared component** - Move `RefinementPageInner` from `page.tsx` into `src/components/refinement-session/RefinementPageContent.tsx`. Accept `initialSessionId?: string` and `onSessionChange?: (id: string | null) => void` props. Remove `useSearchParams` dependency for session selection.
2. **Create dynamic route** - Add `src/app/(app)/refinement/[sessionId]/page.tsx` as a thin wrapper that reads `sessionId` from params and passes it to `RefinementPageContent`. Uses `router.push` in `onSessionChange` to update URL.
3. **Update base page** - Refactor `/refinement/page.tsx` to render `RefinementPageContent` without `initialSessionId`. Add `onSessionChange` that navigates to `/refinement/[id]` on session select.
4. **Invalid session fallback** - In `RefinementPageContent`, detect when `initialSessionId` is set but no matching session exists, and redirect to `/refinement`.
5. **Toast deep-link** - In `SprintBoard.tsx`, change the `onAdded` toast link from `/refinement` to `/refinement/${id}`.
6. **TicketSidebar links** - Change `href={/refinement?session=${s.id}}` to `href={/refinement/${s.id}}`.
7. **SessionSummary + session page** - Update `router.push("/refinement")` calls to use `savedSessionId` from context for back-navigation.
8. **Tests** - Update any existing tests, add test for invalid session redirect.

**Key decisions:**
- Use `router.push` (not `replace`) when user clicks a session tab, so back/forward works
- Quick session stays at `/refinement` (no ID)
- Static `/refinement/session` route takes precedence over `[sessionId]` dynamic segment (no conflict)

## Acceptance Criteria

### URL routing

- [x] `/refinement` shows the refinement page with the default view (quick session or first saved session)
- [x] `/refinement/[sessionId]` opens the refinement page with the specified session active
- [x] Clicking a session tab updates the browser URL to `/refinement/[sessionId]`
- [x] Navigating to an invalid/deleted session ID shows a fallback (redirect to `/refinement` or an inline "session not found" message)
- [x] Browser back/forward navigates between previously visited sessions

### Toast deep-link

- [x] After adding tickets to a refinement session from the sprint backlog (AddToRefinementModal), the toast "Open refinement" link points to `/refinement/[sessionId]` instead of `/refinement`
- [x] Clicking the toast link navigates to the correct session and shows it as the active tab

### Quick session handling

- [x] Quick session remains accessible at `/refinement` (no session ID needed since it is ephemeral)
- [x] When the user clicks the Quick Session tab, the URL updates to `/refinement` (no ID suffix)

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
