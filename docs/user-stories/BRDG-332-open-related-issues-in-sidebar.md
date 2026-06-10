# BRDG-332: Open related & linked issues in the sidebar from a regular story

**Status:** To Do
**Priority:** Medium

This story covers two related problems on the ticket detail view's sidebar:

1. **Related/linked issues are not clickable** and cannot be opened in the SidePanel (the main ask).
2. **Opening a subtask in the SidePanel crashes** with "Something went wrong" (a bug found while specifying this story).

## Problem 1: related issues do not open in the sidebar

## Description

On a regular story's detail view, the **Linked Issues** section (related issues: "relates to", "blocks", "depends on", etc.) lists the connected tickets but they are not clickable. To inspect a related issue I have to open it in a new tab or navigate away and lose my place.

I want to click a related issue and have it open in the right-hand SidePanel, exactly the way **subtasks** and **epic child stories** already do, and the way tickets open in the sidebar from the epic page and the sprint backlog.

As a PO, when I am reading a story and see it "relates to" or "blocks" another ticket, I want to click that ticket and preview it in the sidebar without leaving the story I'm on.

## Background: why this is missing today

The ticket detail surface renders three lists of connected issues, all using the same `ChildIssueRow` component. Two of them are wired to open the clicked ticket in the SidePanel; the Linked Issues list is not.

| Section | File | Passes `onSelectTicket`? | Clicking a row opens sidebar? |
|---------|------|--------------------------|-------------------------------|
| Subtasks | `src/components/ticket-detail/SubtasksSection.tsx` | Yes (`TicketTabContent.tsx:335`) | Yes |
| Epic children | `src/components/ticket-detail/EpicChildrenSection.tsx` | Yes (`TicketTabContent.tsx:352`) | Yes |
| **Linked Issues (related)** | `src/components/ticket-detail/LinkedIssuesSection.tsx` | **No** (`TicketTabContent.tsx:336`) | **No** |

`ChildIssueRow` only becomes clickable when it receives an `onSelect` callback (it bails early otherwise, see `ChildIssueRow.tsx:122`). `LinkedIssuesSection` renders `ChildIssueRow` without `onSelect` (`LinkedIssuesSection.tsx:681`), so related issues have no cursor, no hover affordance, and no click behavior beyond Cmd/Ctrl-click opening a new tab.

The selection plumbing already exists end-to-end: `SidePanel` exposes `onSelectTicket` and falls back to navigation when it isn't provided (`SidePanel.tsx:273`), and `TicketTabContent` already receives an `onSelectTicket` prop. The fix is to thread that callback through `LinkedIssuesSection` into its rows.

## Problem 2 (bug): opening a subtask in the sidebar crashes

### Description

On a regular story's single view, clicking a row in the **Subtasks** section is already wired to open that subtask in the SidePanel — but doing so throws and the panel area is replaced by the `ErrorBoundary` fallback ("Something went wrong / An unexpected error occurred in this section"). The subtask never becomes usable in the sidebar.

### Root cause (reproduced and verified)

The crash is a **nested-anchor hydration error**: `<a> cannot contain a nested <a>`.

When a subtask opens in the panel, the shared meta panel renders a **Parent** field linking to the parent story. That link is a Next.js `<Link>` (an `<a>`), and the content inside it includes a `TicketStatusPill` whose ticket key is itself rendered as an `<a href="/tickets/...">`. An anchor inside an anchor is invalid HTML; React throws on the hydration mismatch and the surrounding `ErrorBoundary` swaps in the fallback.

Verified via the dev runtime overlay (call stack: `a → TicketMetaContent → SidePanel`):

| Layer | File | What it renders |
|-------|------|-----------------|
| Outer `<a>` | `src/components/ticket-detail/TicketMetaContent.tsx:384` | `<Link href={`/tickets/${detail.parent.key}`}>` for the **Parent** field |
| Inner `<a>` | `src/components/shared/TicketStatusPill.tsx:1029` | the ticket-key link (`href={`/tickets/${ticketKey}`}`) rendered inside that pill |

This is **subtask-specific** because only subtasks render the **Parent** link in the meta panel. Regular stories and epics have no Parent field there, so no nested anchor and no crash.

## Acceptance Criteria

### Problem 1: related issues open in the sidebar

- [ ] On a regular story's detail view, clicking a row in the **Linked Issues** section opens that issue in the right-hand SidePanel (same behavior as subtasks and epic children).
- [ ] Clicked rows show the standard interactive affordances: `cursor: pointer`, hover background, and an active/selected state for the row currently open in the panel.
- [ ] Cmd/Ctrl-click (and middle-click) still opens the related issue in a new tab, unchanged.
- [ ] The Delete ("remove link") action on a row still works and does not trigger opening the issue in the sidebar (click does not bubble).
- [ ] Behavior is consistent whether the story is viewed full-page (`/tickets/[key]`) or already inside the SidePanel (clicking a related issue swaps the panel to that issue, matching how subtasks/children behave there).
- [ ] Pending (just-linked, not yet confirmed) rows remain non-clickable until confirmed, as today.
- [ ] Tests cover: a related-issue row calls the selection callback on click, Cmd/Ctrl-click opens a new tab instead, and the Delete action does not trigger selection.

### Problem 2: subtask opens in the sidebar without crashing

- [ ] Opening a subtask in the SidePanel from a regular story's single view shows the subtask, not the "Something went wrong" fallback.
- [ ] No `<a>` cannot be a descendant of `<a>` (nested-anchor) hydration error appears in the console for that view.
- [ ] The **Parent** field in the panel still links to the parent ticket and remains clickable.
- [ ] Navigating subtask -> parent (and back) works without errors.
- [ ] A test reproduces the regression: rendering the meta panel for a ticket that has a parent does not nest an anchor inside an anchor.

## Technical Notes

### Problem 1

- Add an `onSelectTicket?: (key: string) => void` prop to `LinkedIssuesSection` and pass it into each `ChildIssueRow` as `onSelect` (`LinkedIssuesSection.tsx:681`). Mirror exactly how `SubtasksSection`/`EpicChildrenSection` do it.
- Wire it at the call site in `TicketTabContent.tsx:336` by forwarding the existing `onSelectTicket` prop, alongside the sibling sections.
- No new state or context is needed: `SidePanel.handleSelectTicket` (`SidePanel.tsx:273`) already routes to the panel when `onSelectTicket` is supplied and falls back to `/tickets/[key]` navigation otherwise, so the full-page view degrades gracefully.
- The active-row highlight uses `ChildIssueRow`'s `isActive` prop; pass the currently-open ticket key so the selected related issue is visually marked, consistent with the other sections.
- Keep the Delete button's `stopPropagation` (`LinkedIssuesSection.tsx:33`) so removing a link never opens the panel.

### Problem 2 (the crash)

- Remove the nested anchor. The **Parent** field in `TicketMetaContent.tsx:384` wraps its content in a `<Link href="/tickets/${detail.parent.key}">`, and that content includes a `TicketStatusPill` that renders its own key anchor (`TicketStatusPill.tsx:1029`).
- Preferred fix: stop the `TicketStatusPill` key from rendering an `<a>` when it is already inside a link (e.g. a `linkKey={false}` / non-interactive variant), so the single outer `<Link>` remains the only anchor. Alternatively, drop the outer `<Link>` and let the pill provide the navigation. Confirm which surfaces render the pill inside a link before choosing, to avoid regressing other usages.
- Note: `TicketStatusPill.tsx` is already modified in the working tree; coordinate with that change.

## Out of Scope

- URL sync for the open panel — tracked separately in [BRDG-329](BRDG-329-url-sync-detail-selection.md). This story is only about making related issues open in the sidebar; once BRDG-329 lands, related-issue selection inherits URL sync for free through the shared callback.
- The Story Writer "related stories" panel, which has its own selection model (`PaneContext.relatedSelectedKey`).
- Any change to the AI "find related issues" suggestions flow or the link/unlink composer.
