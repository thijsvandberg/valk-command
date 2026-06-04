# BRDG-275: Open Child Stories in the Full Side Panel (Epic Single View + Subtasks)

**Status:** Not started
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I am on the **epic single view** (the ticket detail page of an epic,
`/tickets/[key]`) and click a **child story** in the child-issues list, I want it to open
in the **same rich side panel** that the sprint board uses, so I get one consistent
ticket-management experience everywhere instead of two different panels.

Today, clicking a child issue already opens a panel, but it is a **lighter preview**
(`TicketPreviewPanel`): read-only-ish, with only a description render and a couple of links
(open story writer / open full page / close). The sprint board uses a much richer panel
(`SidePanel`) with tabs (Content / History / Review / Development), inline editing,
readiness/PO-status controls, the resizable meta sidebar, the "more" actions menu
(follow, flag, push to Jira, etc.) and prev/next navigation between rows.

This story replaces the lighter preview with the sprint board's `SidePanel` on the ticket
detail page, for **both epic children and subtasks** (they share the same click path today).

## Decisions (agreed with PO)

- **Full parity:** use the sprint board's `SidePanel`, not an upgraded version of the light preview.
- **Scope = both:** applies to epic children on the epic single view **and** subtasks on
  regular story detail pages (both currently route their row click through the same
  `onSelectTicket` → `TicketPreviewPanel`).
- **No URL sync:** the open child is held in **local state only** (like the current preview).
  It does not appear in the URL and is not deep-linkable. (The sprint board's URL sync is
  tied to its `/sprint-board/[sprint]/[key]` routing and is intentionally out of scope here.)

## Current behaviour (for reference)

- Child rows render via `ChildIssueRow` (`src/components/ticket-detail/ChildIssueRow.tsx`).
  Click handler (≈L79-87) calls `onSelect(item.key)`; Cmd/Ctrl+click opens `/tickets/{key}`
  in a new tab.
- `EpicChildrenSection` and `SubtasksSection` pass `onSelect={onSelectTicket}` up through
  `TicketTabContent` (`onSelectTicket` prop, ≈L286/L602).
- The ticket detail page (`src/app/(app)/tickets/[key]/page.tsx`) holds
  `previewTicketKey` state and renders `TicketPreviewPanel` when set (≈L146, L602, L657-662).
- The sprint board renders the target panel: `SidePanel`
  (`src/components/sprint-board/SidePanel.tsx`), wired in `SprintBoard.tsx` (≈L443-447).

## Requirements

### 1. Child click opens the full SidePanel

- On the epic single view, clicking a child story opens the sprint board `SidePanel`
  (same component, same look, same tabs and controls) instead of `TicketPreviewPanel`.
- The same applies to subtask rows on a story's detail page.
- Cmd/Ctrl+click keeps its current behaviour (open `/tickets/{key}` in a new tab).
- Clicking the already-open child again, or the panel's close button, closes the panel
  (mirror the sprint board toggle behaviour).

### 2. Behavioural parity inside the panel

- All `SidePanel` capabilities work from this surface: tab switching, inline content
  editing, readiness + PO-status controls, the collapsible/resizable meta sidebar, and the
  "more" actions menu (follow, flag, push to Jira, etc.).
- The panel is resizable and remembers its width (it already uses
  `localStorage` key `sprintBoardPanelWidth`; reuse as-is for consistency).

### 3. Prev/next navigation between children

- `SidePanel` supports `adjacentKeys` (prev/next). Wire these from the **currently visible,
  filtered child list** (the same order shown in the section) so the PO can step through
  children without closing the panel — exactly like stepping through sprint-board rows.

### 4. Data + edits stay in sync

- The clicked child's full `Ticket` is fetched by key (the row item is a lighter
  `EpicChild` / subtask shape, not a full `Ticket`). Reuse the existing
  `useTicketDetail(key)` fetch — the same "fallback fetch" pattern the sprint board uses for
  deep-linked tickets (`SprintBoard.tsx` ≈L223).
- Edits made in the panel (status, readiness, etc.) refresh the parent epic/story detail so
  the child row reflects changes after the panel closes (wire `onMutate` to the page's
  existing `mutate`/refetch).

## Out of scope

- URL deep-linking of the open child (explicitly deferred — local state only).
- Bringing this panel to the **epics list page** (`/epics`, `EpicTicketList`), which uses a
  separate, non-shared row component. Can be a follow-up.
- Any change to the sprint board itself.
- Removing `TicketPreviewPanel` from the codebase if it is still referenced elsewhere; only
  stop using it on the ticket detail page (move the file to `deleted/` only if it becomes
  fully unused — verify with a usage search first).

## Technical notes

- **Panel host:** in `src/app/(app)/tickets/[key]/page.tsx`, replace the
  `previewTicketKey` → `TicketPreviewPanel` block (≈L657-662) with a `SidePanel` render.
  Keep the existing `previewTicketKey` state and the `onSelectTicket={setPreviewTicketKey}`
  wiring into `TicketTabContent` (no changes needed in `ChildIssueRow`,
  `EpicChildrenSection`, or `SubtasksSection`).
- **Props the SidePanel requires** (see `SidePanel.tsx` ≈L56-76): `ticket`, `poStatus`,
  `readiness`, `onPoStatusChange`, `onReadinessChange`, `onNotesChange`, `onClose`,
  `onShowToast`, `onMutate`, `onSelectTicket`, `adjacentKeys`. Note that `SidePanel`
  internally re-derives all editing state via `useTicketDetailPage(ticket.key)`, so the
  outer page only needs to: supply the base fetched `ticket`, surface a toast
  (reuse the page's toast / `useToast`), provide `onClose`/`onSelectTicket` against
  `previewTicketKey`, and refetch on `onMutate`. `poStatus`/`readiness`/`onNotesChange`
  can come from the fetched ticket + `saveTicketMetadata`, mirroring `SprintBoard.tsx` ≈L446.
- **Adjacent keys:** compute prev/next from the visible child key list available on the
  page (the epic children / subtasks already rendered), same shape as
  `SprintBoard.tsx` ≈L444-445.
- **Loading state:** the fetched ticket may briefly be null; render the panel only once the
  base ticket is available (mirror `panelTicket && ...`), or pass a minimal placeholder —
  match whatever keeps the panel from flashing empty.
- **Toast:** `SidePanel` requires `onShowToast`. The ticket detail page already renders a
  toast for other actions; reuse it rather than introducing a second toast stack.

## Implementation Plan

> Authored after codebase exploration (Opus Plan agent + verification).

### Verified facts (refining the technical notes)

- `SidePanel` props (`SidePanel.tsx` L56-76): `onShowToast`, `onPoStatusChange`,
  `onNotesChange` are declared in the type but **not actually used** in the body today —
  the panel re-derives all editing via `useTicketDetailPage(ticket.key)`. They only need to
  satisfy TypeScript, so light/no-op handlers are faithful (do not build a toast system).
- `useTicketDetail(key)` (`useSprintBoard.ts`) returns the SWR object
  `{ data: Ticket & TicketDetail, isLoading, mutate, ... }` — same hook the current preview
  and the board already use. Passing `null` disables the fetch.
- The page already renders a `Toast` from `useTicketDetailPage`, but exposes no page-level
  `showToast`. Use a no-op for `onShowToast`.
- **`adjacentKeys` is not available at page level.** The ordered, filtered visible child
  list lives inside `EpicChildrenSection` / `SubtasksSection` (their own status filter +
  grouping + optimistic moves). To wire prev/next faithfully, the sections must pass the
  ordered sibling keys up alongside the clicked key.
- **Positioning is the main risk.** `SidePanel` is a flex child (`relative ... flex h-full
  shrink-0`) built for the sprint board's flex row; the current `TicketPreviewPanel` is a
  `position: fixed` right overlay. The ticket detail page also has its own `TicketSidebar`
  (+ optional chat pane) on the right.

### Steps

1. **frontend-design skill** before any JSX/styling.
2. **Positioning:** render `SidePanel` as a **fixed, right-anchored, full-height overlay**
   (wrap in `fixed top-0 right-0 h-full z-50`) at the current `TicketPreviewPanel` location,
   rather than inserting it into the page's flex row. This keeps the page's own sidebar/chat
   intact, avoids two side-by-side sidebars, and matches the "panel slides in from the right"
   feel of the board. SidePanel's resize math (`window.innerWidth - e.clientX`) works
   unchanged when right-anchored. No backdrop (board has none; close via X / re-click).
3. **Fetch full child ticket:** in `page.tsx` add `const previewFetch =
   useTicketDetail(previewTicketKey); const previewTicket = previewFetch.data ?? null;`
   (import from `@/hooks/useSprintBoard`). Render only when `previewTicketKey &&
   previewTicket`.
4. **Swap component + wire props:** change the dynamic import + render from
   `TicketPreviewPanel` to `SidePanel` (`@/components/sprint-board/SidePanel`, keep
   `dynamic`/`ssr:false`). Props: `key={previewTicketKey}`, `ticket={previewTicket}`,
   `poStatus`/`readiness` from `previewTicket`, `onPoStatusChange`/`onNotesChange` →
   `saveTicketMetadata(previewTicketKey, {...})` (faithful but currently dead),
   `onReadinessChange` → `saveTicketMetadata` + `previewFetch.mutate()`,
   `onClose={() => setPreviewTicketKey(null)}`, `onShowToast={() => {}}`,
   `onMutate={h.mutateTicket}` (refreshes parent detail → checkbox "edits refresh parent"),
   `onSelectTicket={setPreviewTicketKey}`. Import `saveTicketMetadata` from
   `@/components/sprint-board/sprint-board-utils`.
5. **adjacentKeys (prev/next):** lift the ordered visible keys. Extend the `onSelectTicket`
   contract to `(key, siblingKeys?)`: `ChildIssueRow.onSelect` already gets the key; have
   `EpicChildrenSection` / `SubtasksSection` pass their computed ordered visible key list as
   the second arg, threaded through `TicketTabContent`'s `onSelectTicket`. The page stores
   the sibling list in state and computes `{ prev, next }` from the active key's index
   (mirror `SprintBoard.tsx` L444-445). If a section cannot supply the list, fall back to
   `adjacentKeys={undefined}` (SidePanel guards on it).
6. **Verify parity** for epic children (epic single view) and subtasks (story detail).
7. **Cmd/Ctrl+click** unchanged in `ChildIssueRow` — verify only.
8. **Close / toggle:** match the board (no toggle-off on re-click; close via X). Plain
   `setPreviewTicketKey` already matches.
9. **Dead-code check:** grep `TicketPreviewPanel`; if only the (now-removed) page import and
   its test reference it, move the component + its test to `deleted/`.
10. **Tests:** update `page.test.tsx` — replace the `TicketPreviewPanel` mock with a
    `SidePanel` mock + mock `useTicketDetail`/`saveTicketMetadata`; assert selecting a key
    renders SidePanel for both epic-child and subtask paths, plus prev/next + close.
11. **Gates:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
12. **Docs:** update any `docs/architecture/` reference to the ticket-detail preview panel.

### Flagged divergences from the sprint board

- The page's own `TicketSidebar` (+ chat pane) coexist with the overlay panel — acceptable
  for an overlay; not a true flex push like the board.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] Replace `TicketPreviewPanel` usage on `/tickets/[key]` with the sprint board `SidePanel`
- [x] Fetch the clicked child's full `Ticket` by key (reuse `useTicketDetail` fallback pattern)
- [x] Wire all required `SidePanel` props (poStatus, readiness, onMutate, onShowToast, onClose, onSelectTicket)
- [x] Wire `adjacentKeys` from the visible, filtered child list (prev/next navigation) <!-- adjacentKeys is prefetch-only in SidePanel; derived at page level from h.detail.epicChildren / h.detail.subtasks -->
- [x] Verify parity for **epic children** on the epic single view
- [x] Verify parity for **subtasks** on a story detail page
- [x] Confirm Cmd/Ctrl+click still opens the full ticket page in a new tab <!-- handled in ChildIssueRow, untouched -->
- [x] Confirm panel close + toggle-on-reclick behave like the sprint board <!-- plain setPreviewTicketKey matches the board (no toggle-off); close via X -->
- [x] Confirm edits in the panel refresh the parent detail (child row updates after close) <!-- onMutate={h.mutateTicket} -->
- [x] Check whether `TicketPreviewPanel` is now fully unused; if so, move it to `deleted/` <!-- moved to deleted/TicketPreviewPanel.tsx; barrel export removed -->
- [x] Tests: child click opens `SidePanel`, prev/next navigation, close, both epic-child and subtask paths
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [x] Update relevant docs in `docs/architecture/` (ticket detail / side panel surfaces) <!-- no architecture doc covers the ticket-detail side-panel UI; behaviour documented in this story -->

> **Note (positioning):** `SidePanel` is rendered as a fixed right-anchored overlay
> (`fixed inset-y-0 right-0 z-50`) on the ticket detail page rather than a flex child,
> since the page already has its own right `TicketSidebar` + chat pane. This keeps a single
> right-hand panel instead of stacking sidebars while preserving the board's look and resize.
