# BRDG-235: Hover card on TicketStatusPill with ticket details

**Status:** Complete
**Priority:** Medium
**Source:** PO request

## Description

As a Product Owner, I want a small info card to pop up when I hover over a `TicketStatusPill`, so that I can see key ticket details (title, scores, sprint, epic, people) without opening the ticket.

The hover card must be a configurable feature of the pill so it can be turned on or off per location. It is **on by default** and disabled explicitly where it is not wanted (or where the underlying data is unavailable).

## Card content

Shown in this order:

1. **Title** — full ticket title (the pill itself never shows the title).
2. **SP / BV** — story points and business value, side by side.
3. **Sprint** — sprint name (`sprintName`), or "No sprint".
4. **Epic** — parent epic name (`epic`), or "No epic".
5. **Assignee / Creator** — assignee and reporter (creator).
6. **Flagged** — a flag indicator, shown only when the ticket is flagged in Jira.

Empty/null fields render a muted placeholder (e.g. "Unassigned", "No sprint") rather than disappearing, so the card layout stays stable.

The card is **read-only**. Clicking the pill segments keeps their existing behaviour (key dropdown, status dropdown, readiness dropdown). The hover card is purely informational and must not interfere with those click interactions.

## Implementation Plan

1. **Data shape + props** (in `TicketStatusPill.tsx`): export `TicketPillHoverData { title; storyPoints; businessValue; sprintName; epic; assignee: string|null; reporter: string|null; flagged }`. Add props `hoverData?: TicketPillHoverData` and `showHoverCard?: boolean` (default `true`). Card renders only when `showHoverCard !== false && hoverData != null` — this single guard satisfies "off-flag or missing-data hides card, no layout shift".
2. **Hover-card sub-component**: build a co-located internal `TicketHoverCard` (no new file). Do NOT extend `Tooltip` (it wraps children in its own `<span>`); instead reuse its positioning approach. Hover state + `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` + 400ms timer go on the existing top-level wrapper `<div>` of BOTH variants (`list` and default) so the whole pill is the hover target with no new wrapper element. Card is rendered via `createPortal` to `document.body`, `position: fixed`, flips up when `spaceBelow` is insufficient (threshold ~260 for the taller card), `pointer-events-none` so it never blocks pill clicks and mouseleave fires correctly.
3. **Card content** (null-safe, muted placeholders keep height stable): Title; SP / BV side by side (`–` when null, `getBvColor` tint); Sprint (or "No sprint"); Epic (or "No epic", `getEpicColor` tint); Assignee / Creator ("Unassigned" when null); Flagged line only when `flagged === true`.
4. **Styling guardrails**: `--color-surface-floating` bg, `--shadow-popover`, `border-border-default/strong`, `z-9999`; entry animation via `opacity`/`transform` only, no `transition-all`, brand/semantic tokens only (no default Tailwind blue/indigo).
5. **Dropdown coexistence**: no change to dropdown logic; card is portaled + `pointer-events-none`. Clear the hover timer on mouse leave so an in-flight timer can't pop the card after a click.
6. **Call-site wiring (exactly two)**: `sprint-board/TicketRow.tsx` (key cell) and `refinement-session/TicketRow.tsx`. Map `assignee: ticket.assignee?.name ?? null`; `reporter: null` (the list `Ticket` has no reporter — only `TicketDetail` does; placeholder "Unassigned" is shown); `sprintName` resolved via `sprintNameMap[ticket.sprintId]` / the refinement `sprintName` prop. All other usages omit `hoverData` ⇒ render exactly as before.
7. **Tests** (`TicketStatusPill.test.tsx`): full-data card, conditional flagged line, null placeholders, disable-flag / missing-data path, and click-still-opens-dropdown coexistence. Use fake timers + `mouseEnter`/`mouseLeave`; assert content presence, not pixel position (jsdom has no layout).

**Known gap (flagged to PO):** "Creator" is not available on the list `Ticket` type, so it always shows the "Unassigned" placeholder on sprint board / refinement rows. Real creator names would need `reporter` added to the list data (out of scope).

## Acceptance Criteria

- [x] Hovering over a `TicketStatusPill` (anywhere on the pill) shows the info card after a short delay (~400ms, matching the existing `Tooltip`).
- [x] The card shows: title, SP / BV, sprint, epic, assignee / creator, and flagged (conditional).
- [x] Null/empty fields show a muted placeholder; flagged line only appears when the ticket is flagged.
- [x] The card is positioned with a portal and flips up when there is not enough space below (reuse existing `Tooltip`/`DropdownPortal` positioning logic).
- [x] The card closes on mouse leave and does not block clicks on the pill segments.
- [x] Card visibility is controlled by a prop, defaulting to **on**. Passing the disable flag (or omitting the hover data) hides the card with no console errors.
- [x] Where hover data is not supplied, the pill renders exactly as before (no card, no layout shift).
- [x] Styling follows the project guardrails: brand-derived colors, layered/tinted shadow (`--shadow-popover`/`--shadow-md`), `transform`/`opacity` transitions only, no `transition-all`, no default Tailwind blue/indigo.
- [x] Tests cover: card renders with full data, conditional flagged line, placeholders for null fields, and the disable flag / missing-data path.

## Technical Notes

### Affected files

| File | Change |
|------|--------|
| `src/components/shared/TicketStatusPill.tsx` | Add hover-card rendering + new props |
| `src/components/shared/TicketStatusPill.test.tsx` | New/updated tests for the card |
| `src/components/sprint-board/TicketRow.tsx` | Pass hover data (already holds the full ticket) |
| `src/components/refinement-session/TicketRow.tsx` | Pass hover data |
| `src/components/ticket-detail/ChildIssueRow.tsx` | Pass hover data where available, else disable |
| Other pill usages (story-writer chips, link rows, etc.) | Disable the card where ticket data is partial |

### Data sourcing

The pill currently receives only `ticketKey`, `jiraStatus`, `readiness`, `issueType`, `title`. The card needs more, so add an **optional `hoverData` prop** (single object) carrying the extra fields:

```ts
interface TicketPillHoverData {
  title: string;
  storyPoints: number | null;
  businessValue: number | null;
  sprintName: string | null;
  epic: string | null;
  assignee: string | null;   // Assignee display name
  reporter: string | null;   // Creator
  flagged: boolean;
}
```

- Pass the data in (no fetch-on-hover) to avoid extra requests and loading flicker. The sprint-board and refinement `TicketRow` already hold the full `Ticket`, so it is essentially free there.
- Add a prop to control the card, defaulting to enabled (e.g. `showHoverCard?: boolean` defaulting `true`, or `disableHoverCard?: boolean`). When the flag is off **or** `hoverData` is absent, render no card.

### Reuse

- `src/components/shared/Tooltip.tsx` — hover delay, portal, flip-up positioning. Either extend it to accept rich content, or build a dedicated `TicketHoverCard` reusing the same positioning approach.
- `DropdownPortal` inside `TicketStatusPill.tsx` — existing portal + scroll-close pattern for escaping `overflow:hidden` table containers.
- `READINESS_CONFIG`, `JIRA_STATUS_COLORS`, `IssueTypeIcon` for consistent visuals.

### Key code paths

- `src/components/shared/TicketStatusPill.tsx` — `TicketStatusPillProps`, both the `list` and default variants.
- `src/types/ticket.ts` — `Ticket` interface (`storyPoints`, `businessValue`, `sprintName`, `epic`, `assignee`, `reporter`, `flagged`).

## Dependencies

None.

## Follow-up enhancement (2026-05-30): interactive popover

Per PO request, the card became an interactive popover instead of a read-only tooltip:

- **Stays open on hover-bridge**: opens on hover (400ms) and stays open while the pointer is over the pill *or* the card, with a 250ms grace period when travelling between them, so you can move the mouse into it.
- **Editable Story Points & Business Value**: when the pill receives `onStoryPointsChange` / `onBusinessValueChange`, SP and BV render as inline `StoryPointPicker` / `BusinessValuePicker` (size `lg`) instead of static chips. The card stays open while a picker is open (tracked via a new optional `onOpenChange` prop threaded through `usePickerState`). Where no handler is passed (e.g. refinement rows), SP/BV stay read-only chips.
- **Wiring**: sprint-board `TicketRow` now passes the SP/BV change handlers to the pill. Editing in refinement was left out of scope (those handlers aren't plumbed through the session page).
- Verified in-app: hovering the pill, moving into the card, and opening the SP picker all keep the card open; SP/BV pickers function. Covered by added tests in `TicketStatusPill.test.tsx` (grace-period close, stays-open-on-card-enter, editable picker fires onChange, stays-open-while-picker-open, read-only fallback).

## Follow-up enhancement (2026-05-31): editable Sprint/Epic/Assignee, real Creator, refined design

Per PO request, three more fields became editable and the card layout was refined:

- **Editable Sprint / Epic / Assignee**: when the pill receives `onSprintChange` (+`sprints`), `onEpicChange`, or `onAssigneeChange`, those rows render the existing shared `SprintPicker` / `EpicPicker` / `AssigneePicker` inline. Each picker grows an optional `onOpenChange` (forwarded to `BasePicker.Root`) so the card stays open while it's used.
- **Board wiring**: `useTicketActions` gained `handleAssigneeChange` (optimistic + `jira.assign`), `handleEpicChange` (optimistic + PATCH `epicKey`), and `handleSprintChange` (`jira.moveSprint` + revalidate — no optimistic rewrite because the board's `sprintId` field carries the sprint *name*). These thread `SprintBoard → TicketTable → TicketRow → pill`, alongside the `sprints` list. Refinement rows stay read-only (handlers not plumbed there).
- **Real Creator (read-only)**: `Ticket` gained `reporter?: Assignee | null`, populated by `buildAssignee(t.reporter)` in `/api/tickets`. The card now shows the actual reporter name + avatar. Creator remains non-editable (Jira reporters are immutable; no update API exists).
- **Refined design**: each metadata row gained a leading icon (sprint / epic / person), people render with `Avatar`, and the `hoverData` shape expanded (`sprintId`, `epicKey`, and `assignee`/`reporter` as `Assignee` objects).
- Verified in-app: the redesigned card shows icons + avatars, the Sprint/Epic/Assignee pickers render and the real creator displays. Tests added for the editable pickers and the read-only Creator.

## Follow-up enhancement (2026-05-31): wider card, subtask count, refinement editing

- **Wider card**: bumped from `w-64` to `w-72`.
- **Subtask count + tooltip**: new "Subtasks" row showing `{open}/{total}` (muted "None" when there are no subtasks), wrapped in the shared `Tooltip` ("N open of M subtasks"). `hoverData` gained `openSubtaskCount` / `totalSubtaskCount`, sourced from `ticket.openSubtaskCount` / `ticket.totalSubtaskCount`.
- **Editing on the refinement page**: `RefinementPageContent` now reuses `useTicketActions` (with a local `showToast` + `activeListKey="/api/tickets"` + `mapJiraSprints(sprints)`) and threads the assignee/epic/sprint/SP/BV handlers through `RefinementTicketList → refinement TicketRow → pill`. The refinement card is now fully editable, matching the sprint board. Creator stays read-only everywhere.
- Verified in-app on the board (wider card, "0/4" subtask row, tooltip); refinement editing covered by typecheck + the refinement test suite (the pill/picker mechanism is identical to the board, already verified).

## Follow-up enhancement (2026-05-31): read-only card on reference rows

Extended the (read-only) card to the three remaining spots that list *other* tickets: ticket-detail **epic-children / subtask rows** (`ChildIssueRow`), the **link-issue search results** (`LinkSearchResultRow`), and the **refinement session queue items** (`SessionQueueItem`).

- These rows don't carry the rich ticket fields, so rather than fetch per ticket, a new `useTicketHoverData()` hook looks each pill's data up from the shared `/api/tickets` list (SWR-cached, deduped app-wide). The list loads in the background after render; hovers read instantly from cache and SWR revalidates on its own. `buildTicketHoverData(ticket)` maps a board `Ticket` to the read-only hover shape (no edit handlers).
- Graceful degradation: keys not in that list — **subtasks** and **Jira-only (external) link results** — resolve to `undefined`, so they simply render no card instead of an empty one.
- Deliberately NOT added where the surrounding screen already shows full ticket info (ticket detail's own pill, sprint-board side panel, story-writer main pill, the fullscreen refinement session's current-ticket pill, the session-end modal) or on the internal `/dev/ticket-pills` page.
