# BRDG-125: TicketStatusPill - Reusable Ticket Key + Status Component

**Status:** Open
**Priority:** High

## Description

The current `TicketKeyPill` component (`src/components/shared/TicketKeyPill.tsx`) shows a ticket key with an optional static status badge. It has no support for readiness, no click-to-edit behavior, and status labels are not abbreviated.

This story replaces/extends `TicketKeyPill` into a fully interactive `TicketStatusPill` that shows ticket key, Jira status, and readiness in a compact, fixed-width pill. Status values are editable via dropdown on click. The component should be reusable across all views: header bars (ticket detail, chat, story writer), sprint board rows, and anywhere else a ticket reference appears.

### Visual design

```
[ VPL-44447 ] [ PROG ] [ • ]
               Jira     Readiness
```

- Three segments: ticket key, Jira status (abbreviated text), readiness (icon + color dot only)
- Readiness segment is optional; hidden when `readiness` is null or omitted
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

### Readiness — icon + color only

Readiness is represented as a small colored dot/icon with no text label. The full name appears in a tooltip. Use a distinct color per value so it is recognizable at a glance:

| Value                | Color suggestion  | Icon           |
|----------------------|-------------------|----------------|
| `drafting`           | amber             | pencil dot     |
| `waiting_for_feedback` | orange          | clock dot      |
| `ready_to_refine`    | violet            | sparkle dot    |
| `on_hold`            | red               | pause dot      |
| `null`               | (segment hidden)  | —              |

`null` means the ticket is ready for development. No dot is shown.

Use brand-palette tints consistent with `IssueTypePicker` / `Badge`; never raw Tailwind default colors.

### Auto-transitions

Readiness transitions automatically in two cases:

1. **Ticket created** → set readiness to `drafting`
2. **Story points updated** → clear readiness to `null` (ready for development), *unless* the current readiness is `waiting_for_feedback`

Rule 2 triggers only on story points field changes, not on other metadata updates. After clearing, readiness can be manually set back to any value (including `drafting` or `waiting_for_feedback`) even when story points are already set.

Auto-transitions are applied server-side in the Jira sync and metadata PATCH handlers.

### Interaction

- **Click on Jira status segment** opens a dropdown with all `JiraStatus` options; selecting one calls `onJiraStatusChange(newStatus)`.
- **Click on readiness segment** opens a dropdown with all `Readiness` options (plus a "Clear" option to set null); selecting one calls `onReadinessChange(newReadiness)`.
- Ticket key segment retains existing copy-to-clipboard behavior.
- Dropdowns close on outside click or Escape.
- When `onJiraStatusChange` / `onReadinessChange` is not provided, the segment is read-only (no dropdown, no pointer cursor).

### Props

```ts
interface TicketStatusPillProps {
  ticketKey: string;
  jiraStatus: JiraStatus;
  readiness?: TicketReadiness | null;  // if null/omitted, readiness segment is hidden
  onJiraStatusChange?: (status: JiraStatus) => void;
  onReadinessChange?: (readiness: TicketReadiness | null) => void;
  size?: "sm" | "md";                  // sm = tighter padding, default md
  showExternalLink?: boolean;          // default true, hides the hover Jira link
}
```

### Colors

Reuse the existing Jira status color mapping from `TicketTableCells`. Readiness colors use the per-value palette defined in the table above, consistent with `IssueTypePicker` / `Badge`.

## Detailed Implementation Plan (Opus)

**DB approach:** Add a new `readiness` column to `ticketMetadata`. Keep `poStatus` column in place until all consumers are migrated, then remove in a follow-up.

**Value mapping from old poStatus → new readiness:**
- `"Draft"` → `"drafting"` | `"Awaiting Feedback"` → `"waiting_for_feedback"` | `"Ready for Refinement"` → `"ready_to_refine"` | `"On Hold"` → `"on_hold"` | `"New"` / `"Ready"` / `null` → `null`

**Implementation order:**
1. Types (`src/types/ticket.ts`) — additive, no breakage
2. DB schema + migration (`src/db/schema.ts`, new migration)
3. Service layer (`src/services/ticket-service.ts`) — add readiness, keep poStatus compat
4. API responses (`/api/tickets`, `/api/tickets/[key]`) — add `readiness` field
5. Auto-transitions (`src/lib/upsert-issue.ts`)
6. Build `TicketStatusPill` component + tests
7. Replace `TicketKeyPill` usages + wire callbacks
8. Update filter infrastructure (FilterBar, useSprintBoardFilters, etc.)
9. Cleanup (remove POStatus, PO_STATUS_COLORS, POStatusCell, POStatusIcon)

**Gaps:**
- `onJiraStatusChange` has no backend support (no Jira transition API); segment will be read-only unless a callback is passed by the parent
- `refinementReadiness` column on ticketMetadata is a separate concept; it coexists with `readiness`
- Saved views in localStorage store `poStatus` filter keys; a one-time migration is needed in the filter hook
- Several places auto-set poStatus (TicketRefinement, story-writer split route); these must be updated

## Implementation Plan

- [x] Add `TicketReadiness` type and readiness icon/color map to `src/types/ticket.ts` (or a new `src/lib/status-labels.ts`); add Jira status abbreviation map in the same file
- [x] Build `TicketStatusPill` in `src/components/shared/TicketStatusPill.tsx` with the props above
- [x] Add a `StatusDropdown` sub-component (internal to the file or same folder) that renders the popover
- [x] Write unit tests in `src/components/shared/TicketStatusPill.test.tsx`
- [x] Apply auto-transition logic server-side:
  - Set readiness to `drafting` when a ticket is created (Jira webhook sync handler)
  - Clear readiness to `null` on story points change, unless current readiness is `waiting_for_feedback` (Jira webhook sync handler + metadata PATCH endpoint)
- [ ] Replace all existing `TicketKeyPill` usages with `TicketStatusPill` where the full pill is desired:
  - `src/components/story-writer/StoryWriterLayout.tsx`
  - `src/components/sprint-board/MultiSprintView.tsx`
  - `src/components/command-palette/ResultItem.tsx`
  - `src/components/chat/MessageList.tsx`
  - `src/app/(app)/tickets/[key]/page.tsx`
- [ ] Wire `onJiraStatusChange` and `onReadinessChange` on sprint board rows (`TicketTableCells`, `TicketRow`) using the existing metadata PATCH endpoint (`PATCH /api/tickets/[key]/metadata`)
- [ ] Wire `onJiraStatusChange` and `onReadinessChange` on the ticket detail header (`src/app/(app)/tickets/[key]/page.tsx`)
- [ ] Keep `TicketKeyPill` as-is if any usage only needs copy-to-clipboard without status; otherwise remove it when fully replaced

## Acceptance Criteria

- Pill renders with ticket key + Jira status in all placements
- Jira status shows an abbreviated text label with fixed min-width; tooltip shows the full label
- Readiness renders as a colored dot/icon only (no text); tooltip shows the full label
- Readiness segment is hidden when value is null
- Clicking Jira status opens a dropdown listing all `JiraStatus` values; selecting one fires the callback
- Clicking readiness opens a dropdown listing all `TicketReadiness` values with full labels plus a "Clear" option; selecting one fires the callback
- Read-only mode (no callback) shows the status without pointer cursor or dropdown
- Ticket created via Jira sync automatically receives `drafting` readiness
- Story points change clears readiness to null, unless current readiness is `waiting_for_feedback`
- Pill appears consistently in: ticket detail header, chat thread header, story writer header, sprint board rows
- All existing tests pass; new unit tests cover abbreviation map, readiness map, and dropdown behavior
