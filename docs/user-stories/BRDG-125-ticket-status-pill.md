# BRDG-125: TicketStatusPill - Reusable Ticket Key + Status Component

**Status:** Open
**Priority:** High

## Description

The current `TicketKeyPill` component (`src/components/shared/TicketKeyPill.tsx`) shows a ticket key with an optional static status badge. It has no support for PO status, no click-to-edit behavior, and status labels are not abbreviated.

This story replaces/extends `TicketKeyPill` into a fully interactive `TicketStatusPill` that shows ticket key, Jira status, and PO status in a compact, fixed-width pill. Status values are editable via dropdown on click. The component should be reusable across all views: header bars (ticket detail, chat, story writer), sprint board rows, and anywhere else a ticket reference appears.

### Visual design

```
[ VPL-44447 ] [ PROG ] [ • ]
               Jira     PO
```

- Three segments: ticket key, Jira status (abbreviated text), PO status (icon + color dot only)
- PO status segment is optional; hidden when `poStatus` is omitted
- Both status segments show a tooltip with the full label on hover
- Jira status segment has a fixed minimum width so the pill never grows unexpectedly

### Status abbreviations (Jira)

| Full label     | Abbreviated |
|----------------|-------------|
| TO DO          | TODO        |
| IN PROGRESS    | PROG        |
| TEST           | TEST        |
| DONE           | DONE        |
| DEPRECATED     | DEPR        |

### PO status — icon + color only

PO status is represented as a small colored dot/icon with no text label. The full name appears in a tooltip. Use a distinct color per status so it is recognizable at a glance:

| Value                   | Color suggestion       | Icon           |
|-------------------------|------------------------|----------------|
| New                     | sky / brand-light      | circle (empty) |
| Draft                   | amber                  | pencil dot     |
| Awaiting Feedback       | orange                 | clock dot      |
| Ready for Refinement    | violet                 | sparkle dot    |
| Ready                   | emerald / green        | check dot      |
| On Hold                 | red                    | pause dot      |
| — (null)                | (segment hidden)       | —              |

Use brand-palette tints consistent with `IssueTypePicker` / `Badge`; never raw Tailwind default colors.

### Interaction

- **Click on Jira status segment** opens a dropdown with all `JiraStatus` options; selecting one calls `onJiraStatusChange(newStatus)`.
- **Click on PO status segment** opens a dropdown with all `POStatus` options; selecting one calls `onPoStatusChange(newStatus)`.
- Ticket key segment retains existing copy-to-clipboard behavior.
- Dropdowns close on outside click or Escape.
- When `onJiraStatusChange` / `onPoStatusChange` is not provided, the segment is read-only (no dropdown, no pointer cursor).

### Props

```ts
interface TicketStatusPillProps {
  ticketKey: string;
  jiraStatus: JiraStatus;
  poStatus?: POStatus;          // if omitted, PO segment is hidden
  onJiraStatusChange?: (status: JiraStatus) => void;
  onPoStatusChange?: (status: POStatus) => void;
  size?: "sm" | "md";           // sm = tighter padding, default md
  showExternalLink?: boolean;   // default true, hides the hover Jira link
}
```

### Colors

Reuse the existing Jira status color mapping from `TicketTableCells`. PO status colors use the per-value palette defined in the table above, consistent with `IssueTypePicker` / `Badge`.

## Implementation Plan

- [ ] Add Jira status abbreviation map and PO status icon/color map to `src/types/ticket.ts` (or a new `src/lib/status-labels.ts`)
- [ ] Build `TicketStatusPill` in `src/components/shared/TicketStatusPill.tsx` with the props above
- [ ] Add a `StatusDropdown` sub-component (internal to the file or same folder) that renders the popover
- [ ] Write unit tests in `src/components/shared/TicketStatusPill.test.tsx`
- [ ] Replace all existing `TicketKeyPill` usages with `TicketStatusPill` where the full pill is desired:
  - `src/components/story-writer/StoryWriterLayout.tsx`
  - `src/components/sprint-board/MultiSprintView.tsx`
  - `src/components/command-palette/ResultItem.tsx`
  - `src/components/chat/MessageList.tsx`
  - `src/app/(app)/tickets/[key]/page.tsx`
- [ ] Wire `onJiraStatusChange` and `onPoStatusChange` on sprint board rows (`TicketTableCells`, `TicketRow`) using the existing metadata PATCH endpoint (`PATCH /api/tickets/[key]/metadata`)
- [ ] Wire `onJiraStatusChange` and `onPoStatusChange` on the ticket detail header (`src/app/(app)/tickets/[key]/page.tsx`)
- [ ] Keep `TicketKeyPill` as-is if any usage only needs copy-to-clipboard without status; otherwise remove it when fully replaced

## Acceptance Criteria

- Pill renders with ticket key + Jira status in all placements
- Jira status shows an abbreviated text label with fixed min-width; tooltip shows the full label
- PO status renders as a colored dot/icon only (no text); tooltip shows the full label
- Clicking Jira status opens a dropdown listing all `JiraStatus` values; selecting one fires the callback
- Clicking PO status opens a dropdown listing all `POStatus` values with full labels; selecting one fires the callback
- Read-only mode (no callback) shows the status without pointer cursor or dropdown
- Pill appears consistently in: ticket detail header, chat thread header, story writer header, sprint board rows
- All existing tests pass; new unit tests cover abbreviation map and dropdown behavior
