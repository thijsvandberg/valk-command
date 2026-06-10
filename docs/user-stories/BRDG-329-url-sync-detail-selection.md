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

## Implementation Plan

### Key findings that shape the approach

1. **SprintBoard does NOT use `popstate`.** It relies on `usePathname()` / `useSearchParams()` being reactive to `window.history.pushState` in Next 15's App Router. Back/forward fire the same hook updates, so they work without a manual `popstate` listener. Mirror this exactly.
2. **The state to replace is minimal.** Only two `useState` calls in `src/app/(app)/tickets/[key]/page.tsx`: `previewTicketKey` (drives the SidePanel for both epic children and subtasks) and `activeTab` (`TicketTab = "children" | "content" | "history" | "review" | "development"`).
3. **The callback chain is already in place.** `onSelectTicket={setPreviewTicketKey}` flows page → `TicketTabContent` → sections. Only what the callback does changes; `SubtasksSection.tsx`, `TicketTabContent.tsx`, `ChildIssueRow.tsx`, `EpicChildrenSection.tsx` are not edited (keeps the diff away from uncommitted BRDG-334 work).
4. **The existing default-tab logic uses the React-Compiler-safe "adjust state during render" pattern**; it gets replaced by inline derivation, not effects.
5. **The page test already wraps the page in `<Suspense>`**, satisfying Next 15's `useSearchParams` requirement; the test must add a `vi.mock("next/navigation", ...)` once the hooks are added.

### Design: URL as source of truth, written via `pushState`

- **Param names:** `?ticket=<KEY>` for the open panel, `?tab=<slug>` for the active tab. Tab slugs match the `TicketTab` union (validate membership). Default tab is omitted from the URL (epics default to `children`, everything else `content`).
- **Read:** derive state during render from `useSearchParams()` — no `useState`, no `useEffect`.
- **Write:** `window.history.pushState(null, "", newUrl)` so the page does not remount (mirrors `selectTicket` in SprintBoard).

### Steps

1. **URL-builder helper (new file + test).** `buildTicketDetailUrl(routeKey, { ticket, tab })` in new `src/lib/ticket-detail-url.ts`, pure and framework-free, omits null/default params. Unit test co-located.
2. **URL → state (read) in `page.tsx`.** Replace `previewTicketKey` state with `searchParams.get("ticket")`. Replace `activeTab` state + `tabDefaultedKey` adjust-block with validated derivation: valid `?tab=` wins, else default by ticket type; tabs unavailable for the ticket type fall back to default. Invalid/stale `?ticket=` already degrades gracefully via the existing `previewTicketKey && previewTicket` render guard.
3. **State → URL (write) in `page.tsx`.** `selectTicket(next)` and `selectTab(tab)` callbacks that `pushState` URLs built with the helper, each preserving the sibling param. Pass `selectTicket` everywhere `setPreviewTicketKey` was passed (TicketTabContent, SidePanel onSelectTicket/onClose). Route every `setActiveTab` call site (handleTabChange, handleViewDiff, sidebar navigate callbacks, history view) through `selectTab`. Preserve query params in the existing DRAFT-key `replaceState`.
4. **Remove dead tab-default machinery** (`tabDefaultedKey` state + adjust-block). `historyResetKey`, `openDraftDiff` stay local.
5. **Tests.** New `src/lib/ticket-detail-url.test.ts` (pure). In `page.test.tsx`: mock `next/navigation` with controllable `useSearchParams` backed by a mutable store that the `pushState` spy updates (round-trip realism); spy `window.history.pushState`. Tests: opening a child pushes `?ticket=`; deep-link `?ticket=` opens the panel on load; closing removes it; tab round-trips through URL incl. invalid-tab fallback; update existing open/close panel tests to the new mechanism.

### Decisions on flagged ambiguities

- All five tab values sync through the URL, with per-type availability fallback (cheaper and consistent than restricting to three).
- Tab changes use `pushState` (AC says back returns to the previous tab).
- `?ticket=` and `?tab=` are independent and preserved across each other's writes.

## Acceptance Criteria

- [x] On `/tickets/[key]`, opening a child story in the SidePanel updates the URL (e.g. `?ticket=BRDG-123`) without remounting the page.
- [x] Refreshing the page with a child open restores the same epic with the same child story open in the panel.
- [x] Closing the panel removes the child from the URL.
- [x] The same behavior applies when a subtask is opened in the panel from the ticket detail view.
- [x] The active tab (Child issues / Content / History) is reflected in the URL (e.g. `?tab=history`) and restored on refresh.
- [ ] Browser back/forward navigates panel/tab state intuitively (back closes the panel / returns to the previous tab rather than leaving the page).
- [x] An invalid or stale key/tab in the URL falls back gracefully (panel closed / default tab) without errors.
- [ ] Sharing the URL reproduces the same view for another session.
- [ ] Sprint Board and Refinement behavior is unchanged.
- [x] Tests cover: opening a child updates the URL, deep-linking a `?ticket=` URL opens the panel on load, and the active tab round-trips through the URL.

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
