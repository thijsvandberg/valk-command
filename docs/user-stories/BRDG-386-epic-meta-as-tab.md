# BRDG-386: Epic single view — drop the default meta sidebar, surface epic meta as a tab

**Status:** To Do
**Priority:** Medium

## Description

As a Product Owner, when I open an **epic** in the single view, I do **not** want the epic's meta sidebar taking the right column by default. The epic's own metadata (status, assignee, labels, dev info, PO note, etc.) is not the thing I work with on an epic — the **child issues** are. The epic meta should instead be reachable as an extra **tab** in the tab bar (`Child issues · Content · History · Meta info`), and the right-hand column should stay free for the thing that *does* belong there: when I click a **child story**, it opens in the side panel on the right (as it does today).

So for epics: no meta sidebar on open, meta moved into a tab, right column reserved for the clicked child.

Non-epic tickets are unchanged — they keep their meta sidebar exactly as-is.

## Current behaviour

In [src/app/(app)/tickets/[key]/page.tsx](src/app/(app)/tickets/[key]/page.tsx) the right column is one of two things:

- **Child open** (`?ticket=`): the shared [SidePanel](src/components/sprint-board/SidePanel.tsx) renders the clicked child ([page.tsx:703-724](src/app/(app)/tickets/[key]/page.tsx#L703-L724)). This already works for epic children (BRDG-275).
- **No child open**: the epic's own [TicketSidebar](src/components/ticket-detail/TicketSidebar.tsx) renders, showing [TicketMetaContent](src/components/ticket-detail/TicketMetaContent.tsx) ([page.tsx:725-729](src/app/(app)/tickets/[key]/page.tsx#L725-L729)).

Epic tabs are `Child issues · Content · History` ([TicketTabContent.tsx:209-214](src/components/ticket-detail/TicketTabContent.tsx#L209-L214)); the default tab for epics is `children` ([ticket-detail-url.ts:17-19](src/lib/ticket-detail-url.ts#L17-L19)).

So on an epic the meta sidebar is the default right-column occupant, even though it is rarely what the PO needs there.

## Proposed behaviour

For tickets of type `epic` only:

1. **No meta sidebar by default.** When no child is open, the right column is empty and the tab content takes the full width. The collapse/`[`/"Open sidebar" affordances do not apply to epics.
2. **Epic meta becomes a tab.** Add a `Meta info` tab (last in the bar): `Child issues · Content · History · Meta info`. Its body renders the existing `TicketMetaContent` inline in the content column. The default landing tab stays `children`.
3. **Child click still opens the side panel.** Clicking a child in the Child issues list opens it in the right-hand `SidePanel` exactly as today (`?ticket=`), and closing it returns to the empty right column (not to an epic meta sidebar).

Non-epic and subtask tickets keep their current layout (meta sidebar + collapse controls, no `Meta info` tab).

> Tab label is a proposal — "Meta info". Alternatives: "Details" / "Epic info". The PO left this open ("oid"); pick one during build, no need to re-confirm.

## Implementation Plan

1. **Tab type + availability**
   - [src/components/ticket-detail/TicketTabContent.tsx](src/components/ticket-detail/TicketTabContent.tsx): add `"meta"` to the `TicketTab` union ([line 39](src/components/ticket-detail/TicketTabContent.tsx#L39)).
   - [src/lib/ticket-detail-url.ts](src/lib/ticket-detail-url.ts): add `"meta"` to `availableTicketTabs("epic")` → `["children", "content", "history", "meta"]` ([line 11](src/lib/ticket-detail-url.ts#L11)). Leave `defaultTicketTab("epic")` as `"children"`.

2. **Tab bar + body** ([TicketTabContent.tsx](src/components/ticket-detail/TicketTabContent.tsx))
   - Append a `Meta info` tab to the bar, gated on `isEpic` (after `History`, [~line 212](src/components/ticket-detail/TicketTabContent.tsx#L212)).
   - Add an `activeTab === "meta" && isEpic` body block that renders `TicketMetaContent` with `ticket`, `detail`, `reviewData`, `onMutate`, and `onReadinessChange`. Wrap it in a container that supplies horizontal padding (the meta footer bleeds via `-mx-5`, so it needs `px-5`); constrain width (e.g. `max-w-2xl`) so it reads as a panel inside the wide page rail, not a full-bleed column.
   - `reviewData` is not currently passed into `TicketTabContent`; thread it through as a new prop from the page (the page already has `h.reviewData`).

3. **Page layout** ([src/app/(app)/tickets/[key]/page.tsx](src/app/(app)/tickets/[key]/page.tsx))
   - Keep the `previewTicketKey && previewTicket` branch (child `SidePanel`) unchanged ([line 703](src/app/(app)/tickets/[key]/page.tsx#L703)).
   - In the `else` branch ([line 725](src/app/(app)/tickets/[key]/page.tsx#L725)), render `TicketSidebar` only when `!isEpic`. For epics render nothing (empty right column).
   - Pass `reviewData={h.reviewData}` into `TicketTabContent`.
   - Hide the header "Open sidebar" button for epics ([line 605-615](src/app/(app)/tickets/[key]/page.tsx#L605-L615)) — there is no sidebar to reopen.

4. **Tests** — see Testing.

### Decisions / risks
- Scope is strictly `type === "epic"`. Non-epic and subtask paths must be byte-for-byte unchanged (sidebar, collapse, `[` shortcut, no `Meta info` tab).
- `TicketMetaContent` already hides the Quality panel and the "open full dev view" link for epics, and shows the SP/BV grid + DevPanel; moving it into a tab changes none of that.
- The `[` keyboard toggle and `sidebarCollapsed` localStorage are only meaningful for non-epics now; do not remove them (other types rely on them), just don't surface the reopen affordance on epics.

## Acceptance Criteria

- [ ] Opening an epic shows **no meta sidebar** in the right column; the tab content uses the full width and the right column is empty until a child is opened.
- [ ] The epic tab bar shows a `Meta info` tab as the **last** entry: `Child issues · Content · History · Meta info`.
- [ ] The `Meta info` tab renders the epic's metadata (the existing `TicketMetaContent`: status, assignee, watchers, reporter, dates, components, labels, readiness, PO note, Confluence, Development panel).
- [ ] Opening an epic still defaults to the **Child issues** tab.
- [ ] Clicking a child issue opens that child in the right-hand **side panel** (`?ticket=`), as it does today; closing it returns to the empty right column (no epic meta sidebar reappears).
- [ ] The header "Open sidebar" button does not appear on epics.
- [ ] `?tab=meta` deep-links to the Meta info tab on an epic; an invalid/stale `?tab=` still degrades to `children`.
- [ ] Non-epic tickets and subtasks are unchanged: meta sidebar present, collapse/`[`/"Open sidebar" intact, no `Meta info` tab.

## Technical Notes

- Primary files: [TicketTabContent.tsx](src/components/ticket-detail/TicketTabContent.tsx), [page.tsx](src/app/(app)/tickets/[key]/page.tsx), [ticket-detail-url.ts](src/lib/ticket-detail-url.ts).
- `TicketMetaContent` expects a host-supplied scroll/padding container with `px-5` (footer uses `-mx-5`); mirror what [TicketSidebar.tsx:143-155](src/components/ticket-detail/TicketSidebar.tsx#L143-L155) does for the className.
- The child `SidePanel` open/close, neighbour prefetch, and `activeChildKey` highlighting all already exist and need no change.
- No DB, API, or type-shape changes beyond the `TicketTab` union and the new `reviewData` prop on `TicketTabContent`.

## Out of Scope

- No changes to non-epic / subtask ticket layouts.
- No redesign of `TicketMetaContent` itself, the child `SidePanel`, or the child-issue list/rows.
- No change to what metadata an epic displays (same fields the sidebar shows today).

## Dependencies

- Existing: `TicketMetaContent`, `TicketSidebar`, `SidePanel`, `EpicChildrenSection`, the `?tab=`/`?ticket=` URL plumbing (`ticket-detail-url.ts`).

## Testing

- Co-locate tests next to the changed components.
- Cover:
  - Epic opens with no meta sidebar and lands on the Child issues tab.
  - Epic tab bar includes `Meta info` (last); the tab renders `TicketMetaContent`.
  - `?tab=meta` resolves to the Meta info tab on an epic; invalid `?tab=` degrades to `children`.
  - Clicking a child opens the `SidePanel`; closing returns to an empty right column (no `TicketSidebar`).
  - "Open sidebar" header button is absent for epics.
  - Non-epic ticket renders the meta sidebar and no `Meta info` tab (regression guard).
  - Update existing epic-path expectations in `page.test.tsx` / `TicketTabContent.test.tsx` that assume the epic meta sidebar renders by default.
