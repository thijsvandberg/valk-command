# BRDG-456: Back navigation in the detail sidebar

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description
When a story/epic is open in the detail sidebar and the PO drills into a linked/child/related item, that item opens in the same sidebar (desirable, from [[BRDG-332-open-related-issues-in-sidebar]] / [[BRDG-275-epic-child-opens-sprint-sidepanel]]). But there was no way back to where you came from: the only control was the close **X**, which dismissed the whole panel. The PO wants to step back to the previous item instead.

**Decided with PO:**
- Add a dedicated **back control** (a `←` with the previous ticket key) that appears only after drilling in. The **X keeps meaning "close the panel"** — it is not overloaded. (Alternatives considered and rejected: a smart X that goes back when drilled in, and a full breadcrumb trail.)

## Current Behaviour (before)
- Each host page (`SprintBoard`, `Inbox`, `Cleanup`) stores a single selected key. Drilling into a related item calls `onSelectTicket`, which the host uses to **replace** that key (and remount the panel via its `key` prop). There is no memory of the previous item.
- The panel's `X` calls `onClose`, which clears the host's selection and closes the panel.
- `adjacentKeys` exists but is board-order prefetch only, not a drill-down history.

## Approach
Keep the drill-down history **inside `SidePanel`** so it works identically across all board-like hosts and leaves the underlying board untouched (the entry-point row stays selected).

- `SidePanel` maintains an internal `navStack: string[]` (top = displayed item). The stack resets when the host opens a different ticket (external `ticket.key` change); internal drill-downs never touch the `ticket` prop, so the reset guard only fires on genuine external changes.
- A new `enableBackNavigation` prop gates the behaviour. When on, `handleSelectTicket` pushes onto the stack instead of bubbling to the host; when off (default), behaviour is unchanged (delegate to `onSelectTicket` / router).
- Everything that identifies the displayed ticket (detail hook, view recording, full-view/story-writer/chat links, follow, refinement, tab content `ticketKey`) is driven off the current stack top, not the fixed root key.
- Back control: rendered at the start of the tab bar via a new `tabBarLeading` slot on `TicketTabContent`, plus a floating variant (mirroring the floating close, top-left) so it stays reachable once the bar scrolls away. Shown only when `navStack.length > 1`.
- Enabled on **Sprint Board, Inbox, Cleanup**. Left off on the full ticket page and refinement preview, where "select" means "navigate elsewhere".

### Out of scope / non-goals
- No breadcrumb trail; single-step back only (repeatable to the root).
- Full ticket page (`/tickets/[key]`) child-preview and Refinement preview keep their existing navigation.
- No URL sync for the in-panel stack.

## Implementation
1. `SidePanel.tsx`: internal `navStack` + reset guard; `currentKey`/`canGoBack`/`previousKey`; `handleSelectTicket` pushes when `enableBackNavigation`; `handleBack` pops; drive all displayed-ticket references off `currentKey`; render the in-bar `backControl` (via `tabBarLeading`) and a floating back button.
2. `TicketTabContent.tsx`: add optional `tabBarLeading` slot rendered before the tabs.
3. Hosts: pass `enableBackNavigation` on `SprintBoard.tsx`, `inbox/page.tsx`, `cleanup/page.tsx`.

## Acceptance Criteria
- [x] Drilling into a linked/child item opens it in the same panel and reveals a back control labelled with the previous ticket key. <!-- SidePanel navStack push -->
- [x] Back steps to the previous item; at the root the back control is gone. <!-- handleBack + canGoBack gate -->
- [x] X always closes the whole panel, even after drilling in. <!-- onClose unchanged -->
- [x] Back navigation is only active where drilling means "open here" (board, inbox, cleanup); other hosts unchanged. <!-- enableBackNavigation opt-in -->
- [x] Opening a different ticket from the host resets the drill-down history. <!-- reset guard on external ticket.key change -->

## Tests
- [x] `SidePanel.test.tsx`: drill reveals back-to-previous; back returns and hides the control at root; X still closes after drilling; off-mode delegates to host with no back control; external key change resets the stack; drilled item is recorded as viewed.

## Related
- [[BRDG-332-open-related-issues-in-sidebar]] — the "open related issue in the sidebar" behaviour this makes reversible.
- [[BRDG-275-epic-child-opens-sprint-sidepanel]] — epic children open in the panel; same drill-down path.
- `src/components/sprint-board/SidePanel.tsx`, `src/components/ticket-detail/TicketTabContent.tsx`.
