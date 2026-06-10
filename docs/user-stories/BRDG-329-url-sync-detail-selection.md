# BRDG-329: Reflect open detail panel (and active tab) in the URL

**Status:** To Do
**Priority:** Medium

## Description

On the epic single view (`/tickets/[key]`), opening a child story in the right-hand SidePanel is currently tracked only in local React state (`previewTicketKey`). The URL never changes, so:

- Refreshing the page loses the open child and drops you back to the bare epic.
- The view cannot be shared or bookmarked in its current state.
- Browser back/forward does not close/reopen the panel as a user expects.

We want the URL to reflect what is on screen, so that **a refresh keeps you on the exact same view**. As a PO, when I have an epic open with a child story expanded in the sidebar and I refresh (or share the link), I should land back on that same epic with that same child open.

The same principle should extend to the **active tab** on the epic view (Child issues / Content / History): refreshing while on "History" should keep me on "History", not reset me to "Child issues".

The Sprint Board already does this correctly (it deep-links the selected ticket into the path via `window.history.pushState`), so this story is about bringing the rest of the app up to that standard and reusing that proven pattern.

## Audit: where this applies

Investigated during refinement. Behavior today:

| Location | File | Detail opens via | URL synced? |
|----------|------|------------------|-------------|
| Sprint Board | `src/components/sprint-board/SprintBoard.tsx` | SidePanel | Yes (reference implementation) |
| Refinement session | `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` | Full route | Yes (ticket is a path segment) |
| **Epic / ticket detail – child story** | `src/app/(app)/tickets/[key]/page.tsx` (`previewTicketKey`) | SidePanel | **No** |
| **Epic / ticket detail – subtasks** | `src/components/ticket-detail/SubtasksSection.tsx` (reuses same panel state) | SidePanel | **No** |
| **Epic / ticket detail – active tab** | `src/app/(app)/tickets/[key]/page.tsx` (Child issues / Content / History) | Local state | **No** |
| **Cleanup – disposition drawer** | `src/app/(app)/cleanup/page.tsx` (`reviewKey`) | Drawer | **No** |
| **Cleanup – management panel** | `src/app/(app)/cleanup/page.tsx` (`selectedKey`) | SidePanel | **No** |

**In scope for this story:** the epic/ticket detail view — child story panel, subtask panel (same panel), and the active tab.

**Recommended for a follow-up:** the Cleanup page (two stacked panels). Lower traffic and more complex (overlapping drawers), so it should not block the primary fix. Captured here so it is not forgotten.

## Acceptance Criteria

- [ ] On `/tickets/[key]`, opening a child story in the SidePanel updates the URL (e.g. `?ticket=BRDG-123`) without remounting the page.
- [ ] Refreshing the page with a child open restores the same epic with the same child story open in the panel.
- [ ] Closing the panel removes the child from the URL.
- [ ] The same behavior applies when a subtask is opened in the panel from the ticket detail view.
- [ ] The active tab (Child issues / Content / History) is reflected in the URL (e.g. `?tab=history`) and restored on refresh.
- [ ] Browser back/forward navigates panel/tab state intuitively (back closes the panel / returns to the previous tab rather than leaving the page).
- [ ] An invalid or stale key/tab in the URL falls back gracefully (panel closed / default tab) without errors.
- [ ] Sharing the URL reproduces the same view for another session.
- [ ] Sprint Board and Refinement behavior is unchanged.
- [ ] Tests cover: opening a child updates the URL, deep-linking a `?ticket=` URL opens the panel on load, and the active tab round-trips through the URL.

## Technical Notes

- Reuse the Sprint Board pattern: drive selection from the URL (read with `useSearchParams`/`usePathname`) and update it with `window.history.pushState` rather than `router.push`, to avoid a full Next.js navigation that would remount the heavy ticket detail page. See `selectTicket` in `src/components/sprint-board/SprintBoard.tsx` and `buildBoardUrl`/`sprintToSlug` in `src/lib/sprint-utils.ts`.
- Prefer query params here (`?ticket=`, `?tab=`) over path segments: the epic page is a single dynamic route (`/tickets/[key]`) and query params avoid a route restructure while still being shareable. Confirm placement of the param naming before implementing.
- Replace `previewTicketKey` local state (`src/app/(app)/tickets/[key]/page.tsx:155`) with URL-derived state; keep the existing `onSelectTicket` callback chain (`EpicChildrenSection` → `EpicChildrenBySprint` → `ChildIssueRow`) intact and just change what the callback does.
- Watch the project's React Compiler lint rules (no setState-in-effect) when wiring URL → state.

## Out of Scope

- The Cleanup page panels (tracked above as a follow-up).
- Persisting scroll position, filters, or other view state beyond the open detail panel and active tab.
- Any change to Sprint Board or Refinement, which already work.
- Cross-tab synchronization between separate browser tabs/windows.
