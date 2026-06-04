# BRDG-281: Open Tickets in the Side Panel from the Refinement Overview

**Status:** Complete
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I am on the **refinement overview page** (`/refinement[/:sessionId]`, the prep
view with the "Select tickets" list on the left and the queue on the right), I want to
**click a ticket in the "Select tickets" list and have it open in the rich side panel** —
the same `SidePanel` the sprint board uses — so I can inspect and edit a ticket without
leaving the prep view. The panel should **slide in from the right and overlay the queue**,
not push the layout sideways.

Today, clicking a row in the "Select tickets" list **toggles that ticket into/out of the
refinement queue**. There is no way to read or edit the ticket in place; that requires
opening the full ticket page. This story separates the two actions: the checkbox manages the
queue, the row opens the panel.

## Decisions (agreed with PO)

- **Click model:** **row click = open the side panel**; **checkbox = add/remove from the
  queue.** The inline checkbox becomes the only way to build the queue from the list. This
  mirrors the sprint board (row opens the panel, checkbox multi-selects).
- **Overlay, not push:** the side panel must **fall over the queue** (fixed, right-anchored,
  full-height overlay), so the existing left-list + right-queue layout stays put underneath.
  Same overlay approach already used on the ticket detail page (see BRDG-275).
- **Reuse the sprint board `SidePanel`** as-is — full parity (tabs, inline editing,
  readiness / PO-status, resizable meta sidebar, "more" actions). Do not build a lighter
  variant.

## Current behaviour (for reference)

- The list is rendered by `RefinementTicketList`
  (`src/components/refinement-session/RefinementTicketList.tsx`). Each ticket is a
  `ChildIssueRow` (≈L231-273) with:
  - `onCheckboxClick={(e) => queueHook.toggleTicket(...)}` — the checkbox toggles the queue.
  - `onSelect={(key, e) => queueHook.toggleTicket(key, idx, e.shiftKey)}` — **row click also
    toggles the queue today.** This is the handler that must change to "open the side panel".
- The page host is `RefinementPageContent`
  (`src/components/refinement-session/RefinementPageContent.tsx`). Layout at ≈L318-357:
  `RefinementTicketList` (left, `flex-1`) + `ResizableQueuePane` → `RefinementQueuePanel`
  (right, fixed width).
- Queue state lives in `useRefinementQueue` (`src/hooks/useRefinementQueue.ts`),
  `toggleTicket()` ≈L65-86. **Unchanged by this story** — only the checkbox keeps calling it.
- The target panel is `SidePanel` (`src/components/sprint-board/SidePanel.tsx`), wired on the
  sprint board in `SprintBoard.tsx` and as a fixed overlay on the ticket detail page
  (`src/app/(app)/tickets/[key]/page.tsx`) per BRDG-275 — **use that overlay wiring as the
  reference implementation.**

## Requirements

### 1. Row click opens the side panel

- Clicking a ticket row in the "Select tickets" list opens the sprint board `SidePanel` for
  that ticket (same component, same look, same tabs and controls).
- Clicking the row no longer toggles the queue.
- Cmd/Ctrl+click keeps its current `ChildIssueRow` behaviour (open `/tickets/{key}` in a new
  tab) — verify only, do not change.
- Clicking the already-open ticket again, or the panel's close (X), closes the panel.
- Inline controls inside the row that already `stopPropagation` (SP / BV pickers, status,
  assignee, etc.) keep working without opening the panel.

### 2. Checkbox manages the queue

- The inline checkbox remains the way to add/remove a ticket from the queue
  (`onCheckboxClick` → `queueHook.toggleTicket`), including shift-click range select.
- The "ready to refine" bulk toggle and all other queue interactions are unchanged.

### 3. Panel overlays the queue

- The `SidePanel` renders as a **fixed, right-anchored, full-height overlay**
  (`fixed inset-y-0 right-0 z-50`, matching the ticket detail page), so it covers the queue
  pane rather than shrinking the list/queue columns.
- It is resizable and remembers its width via the existing `localStorage` key
  `sprintBoardPanelWidth` (reuse as-is). SidePanel's resize math
  (`window.innerWidth - e.clientX`) works unchanged when right-anchored.
- No backdrop (the board has none; close via X or re-click), consistent with BRDG-275.

### 4. Full panel parity + edits stay in sync

- All `SidePanel` capabilities work from this surface: tab switching, inline content editing,
  readiness + PO-status controls, the collapsible/resizable meta sidebar, and the "more"
  actions menu (follow, flag, push to Jira, etc.).
- The clicked ticket's full `Ticket` is fetched by key via `useTicketDetail(key)` (the same
  fallback-fetch pattern the board and ticket page use). Render the panel only once the base
  ticket is available, to avoid a flash of empty panel.
- Edits in the panel (status, readiness, SP/BV, etc.) refresh the list so the row reflects
  changes after the panel closes — wire `onMutate` to the page's existing `mutateTickets()`
  (and the relevant `useTicketActions` refresh) so optimistic state stays consistent.

### 5. Prev/next navigation (nice to have, match the board if cheap)

- `SidePanel` supports `adjacentKeys` (prev/next). If wiring it from the **currently visible,
  filtered `availableTickets` order** is straightforward, do so, so the PO can step through
  the list without closing the panel. If it adds meaningful complexity, fall back to
  `adjacentKeys={undefined}` (SidePanel guards on it) and note it.

## Out of scope

- URL deep-linking of the open ticket on the refinement page (keep it local state, like the
  ticket detail page overlay). Can be a follow-up if deep links are wanted.
- Any change to `useRefinementQueue` / queue persistence logic.
- Any change to the sprint board or the ticket detail page.
- The fullscreen in-session refinement mode (`/refinement/:id/session/:key`) — this story is
  only the **overview / prep** page.

## Technical notes

- **Panel host:** add `previewTicketKey` state in `RefinementPageContent`, set it from a new
  `onSelectTicket` callback passed down to `RefinementTicketList`. Render `SidePanel` (dynamic
  import, `ssr:false`) as a fixed overlay sibling at the page root when
  `previewTicketKey && previewTicket`.
- **Wire the row:** in `RefinementTicketList`, change `ChildIssueRow.onSelect` from
  `queueHook.toggleTicket(...)` to the new `onSelectTicket(ticket.key)`. Leave
  `onCheckboxClick` pointing at `queueHook.toggleTicket`. Thread an `onSelectTicket` prop
  through `RefinementTicketListProps`.
- **Fetch full ticket:** `const previewFetch = useTicketDetail(previewTicketKey);` (from
  `@/hooks/useSprintBoard`); `const previewTicket = previewFetch.data ?? null;` Passing
  `null` disables the fetch.
- **SidePanel props** (see `SidePanel.tsx` ≈L56-76 and the BRDG-275 wiring in
  `tickets/[key]/page.tsx`): `key={previewTicketKey}`, `ticket={previewTicket}`,
  `poStatus`/`readiness` from the ticket, `onReadinessChange` →
  `saveTicketMetadata(...)` + `previewFetch.mutate()`,
  `onClose={() => setPreviewTicketKey(null)}`, `onShowToast` (reuse the page's `showToast`
  from `useToast`, already present at ≈L108), `onMutate={() => mutateTickets()}`,
  `onSelectTicket={setPreviewTicketKey}`. `onPoStatusChange`/`onNotesChange` are declared but
  currently unused by `SidePanel` (it re-derives editing via `useTicketDetailPage`); supply
  faithful/no-op handlers like BRDG-275 did. Import `saveTicketMetadata` from
  `@/components/sprint-board/sprint-board-utils`.
- **adjacentKeys:** if wired, compute `{ prev, next }` from the index of `previewTicketKey`
  in `availableTickets` (mirror `SprintBoard.tsx`).
- **frontend-design skill** before any JSX/styling work.

## Implementation Plan

> Authored after codebase exploration (Opus Plan agent + verification).

### Verified facts

- `useTicketActions` (`ta`) already exposes `poStatuses`, `readinessMap`,
  `handlePoStatusChange(key, v)`, `handleReadinessChange(key, v)` — all optimistic, persisting
  via `saveTicketMetadata(key, {...}, activeListKey="/api/tickets")` and updating the same
  `readinessMap` the list reads (L193). Reusing these makes panel edits reflect in the row live.
- `ChildIssueRow.onSelect: (key, e) => void`. `handleClick` routes Cmd/Ctrl+click to
  `window.open('/tickets/<key>')` **before** calling `onSelect`, so Cmd/Ctrl+click is unchanged
  by re-pointing `onSelect` (checklist 9 = verify only).
- `availableTickets` is `Ticket[]` (full objects) — the clicked ticket can be passed straight to
  `SidePanel` to avoid an empty-panel flash; `useTicketDetail` is only a fallback for keys not in
  the list (panel drill-downs).
- No `docs/architecture/` file describes the refinement prep view.

### Steps

1. **frontend-design skill** before any JSX/styling.
2. **`RefinementTicketList`:** add `onSelectTicket: (key: string) => void` to props; change
   `ChildIssueRow.onSelect` from `queueHook.toggleTicket(...)` to `(key) => onSelectTicket(key)`.
   Leave `onCheckboxClick` on `queueHook.toggleTicket` (queue + shift-range untouched).
3. **`RefinementPageContent` state:** `dynamic` import `SidePanel` (`ssr:false`); add
   `previewTicketKey` state; `previewLightTicket = availableTickets.find(t => t.key === key)`;
   `previewFetch = useTicketDetail(key && !light ? key : null)`; `previewTicket = light ?? fetch ?? null`;
   `previewAdjacentKeys` from `availableTickets` index.
4. **Overlay render:** at the fragment root (outside the centered `max-w` scroll container), render
   `{previewTicketKey && previewTicket && (<div className="fixed inset-y-0 right-0 z-50 flex"><SidePanel .../></div>)}`.
   SidePanel's `h-full` resolves against the fixed wrapper; its resize uses
   `window.innerWidth - e.clientX` so right-anchoring works and reuses `sprintBoardPanelWidth`.
5. **Wire props:** `ticket`, `poStatus={ta.poStatuses[key] ?? previewTicket.poStatus ?? null}`,
   `readiness={ta.readinessMap[key] ?? previewTicket.readiness ?? null}`,
   `onPoStatusChange={(v) => ta.handlePoStatusChange(key, v)}`,
   `onReadinessChange={(v) => ta.handleReadinessChange(key, v)}`,
   `onNotesChange={(n) => void saveTicketMetadata(key, { poNotes: n }, "/api/tickets")}`,
   `onClose={() => setPreviewTicketKey(null)}`, `onShowToast={showToast}`,
   `onMutate={() => mutateTickets()}`, `onSelectTicket={setPreviewTicketKey}`,
   `adjacentKeys={previewAdjacentKeys}`.
6. **Toggle-on-reclick:** page passes `onSelectTicket={(key) => setPreviewTicketKey(cur => cur === key ? null : key)}`
   to the list (re-click the open row closes it; matches ticket-detail overlay feel).
7. **Tests** (`RefinementTicketList.test.tsx`): extend the `ChildIssueRow` mock to expose
   `onSelect`; add `onSelectTicket` to default props; keep the checkbox→`toggleTicket` test
   (verifies queue unchanged); add a row-click→`onSelectTicket` test asserting no queue toggle.
8. **Gates:** lint, typecheck, changed-file tests, then full `npm run verify` + `npm run build`.
9. **Docs:** none needed (no architecture doc covers the prep view); note in story.

### Risks

- Page is a centered scroll container, not a full-height flex with a panel slot, so the panel
  **must** be a `fixed` overlay (cannot reuse the board's in-flow placement).
- On very wide xl screens the viewport-anchored panel may leave a small gutter before the queue;
  acceptable per the "covers the queue" spec (frontend-design pass to confirm).
- Page-level SidePanel-open test would need heavy hook + dynamic-import mocking; assert the
  row-click→`onSelectTicket` contract at the list level instead.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] Row click in "Select tickets" opens the sprint board `SidePanel` (no longer toggles the queue)
- [x] Checkbox remains the queue add/remove (incl. shift-click range) — verify unchanged
- [x] `SidePanel` renders as a fixed right-anchored overlay that covers the queue pane
- [x] Panel is resizable and reuses the `sprintBoardPanelWidth` width <!-- SidePanel reads/writes sprintBoardPanelWidth internally; unchanged -->
- [x] Fetch the clicked ticket's full `Ticket` by key (reuse `useTicketDetail` pattern); no empty-panel flash <!-- list already holds full Ticket objects; useTicketDetail used only as fallback for keys not in the visible list -->
- [x] Wire all required `SidePanel` props (poStatus, readiness, onMutate, onShowToast, onClose, onSelectTicket)
- [x] Edits in the panel refresh the list (row reflects changes after close) <!-- onMutate=mutateTickets; readiness/poStatus via ta handlers that update the readinessMap the list reads -->
- [x] Cmd/Ctrl+click still opens the full ticket page in a new tab <!-- handled in ChildIssueRow.handleClick before onSelect; untouched -->
- [x] Close + toggle-on-reclick behave like the sprint board / ticket detail overlay <!-- handleSelectTicket toggles off on re-click; close via X -->
- [x] Prev/next via `adjacentKeys` wired from `availableTickets` order, or explicitly skipped with a note <!-- wired: previewAdjacentKeys from availableTickets index -->
- [x] Tests: row click opens `SidePanel`; checkbox still toggles queue; close; (prev/next if wired)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` <!-- all green for BRDG-281; one pre-existing failure (TicketSidebar "displays Jira status") comes from concurrent parallel work on TicketStatusPill, not this story -->
- [x] Update relevant docs in `docs/architecture/` if the refinement prep view is described there <!-- no architecture doc covers the refinement prep view -->

> **Note (positioning):** `SidePanel` is rendered as a fixed overlay on the refinement
> overview page rather than a flex child, because the page is a centered scroll container,
> not a full-height flex with a panel slot. This makes the panel fall over the queue while
> keeping the list/queue layout underneath.

## Follow-up (PO feedback after first pass)

The first pass anchored the overlay to the viewport edge (`fixed inset-y-0 right-0`). On wide,
centered layouts (`xl:max-w-[1600px]`) that left the panel floating ~200px right of the queue,
and — critically — its top sat under the app header, hiding the panel's toolbar
(Content/History/Review/Development + collapse/maximize/more/close). Root cause: the header
portal is `z-30` and `#main-content` has `isolate`, so a `fixed z-50` panel rendered inside
`#main-content` is trapped in that stacking context and the header paints over its top.

Fixes (verified in-app):

- **Anchor over the queue slot.** The overlay is now positioned from a measured anchor: `top`
  = `#main-content`'s top (just below the header, so the toolbar is always visible) and `right`
  = the queue pane's right edge (measured from the content row's last child). Re-measured on
  window resize. So the panel overlays the queue exactly instead of the viewport edge.
- **Default width matches the queue pane.** Added an optional `defaultWidth` prop to `SidePanel`
  (defaults to the existing 400 elsewhere); the refinement page passes `380` to match
  `ResizableQueuePane`'s default. Persisted `sprintBoardPanelWidth` still wins once set.
- **Resize accuracy.** `SidePanel`'s drag now measures from the panel's own right edge
  (`panelRef.getBoundingClientRect().right`) instead of `window.innerWidth`, so dragging is
  correct when the panel is anchored to a host pane that doesn't reach the viewport edge.
  Unchanged on the board/ticket page where the right edge equals the viewport edge.
- **Collapse + toolbar.** With the toolbar visible, the meta-sidebar collapse control and the
  panel close/maximize actions are all reachable, matching the sprint board panel.

Touched: `RefinementPageContent.tsx` (anchor measurement + overlay positioning, `defaultWidth`),
`SidePanel.tsx` (`defaultWidth` prop, right-edge resize), `globals.css` (`slideInRight`).

## Follow-up 2 (PO feedback: border + fill the right space)

Two more polish points after seeing the panel in use:

1. **Border must run through cleanly.** The overlay top sat at the app-header bottom, so it
   overlapped the full-width session-selector row and its bottom border collided with the
   panel's tab-bar border (1px seam at the panel's left edge). Fix: anchor the overlay top to
   the **content row top** (`max(headerBottom, rowTop)`, clamped so it never slides under the
   header when scrolled). The session-selector border now runs full-width uninterrupted and the
   panel hangs cleanly below it; the toolbar stays visible.
2. **Use the right-hand space (uitvullen).** The overlay's right edge was pinned to the queue's
   right edge, leaving the ~200px viewport gutter empty on wide layouts. Fix: anchor the right
   edge to the **viewport edge** (`right: 0`) and default the width to span from the queue's
   **left** edge to the viewport edge (`window.innerWidth - queueLeft`), so the panel fills the
   whole right side and still lines up with where the queue starts.

Supporting change: `SidePanel` gained an optional `storageKey` prop so the refinement panel
persists its width under `refinementPanelWidth` (independent of the board's
`sprintBoardPanelWidth`), making the fill-width default reliable. Measurement runs synchronously
on open (so the first paint is correct) and on window resize.

Verified in-app: session-selector border continuous full-width; panel spans queue-left → viewport
edge; toolbar (tabs + collapse/maximize/more/close) fully visible. Gates: lint, typecheck,
affected tests (39), build all green.
