# BRDG-238: Sprint Board Side Panel -- Full Single-View Parity

**Status:** In Review
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the ticket side panel on the Sprint Board to do and show (almost) everything the full ticket single view (`/tickets/[key]`) offers, so that I can fully review, refine, and act on a ticket without leaving the backlog and without opening the full page.

Today the side panel (`SidePanel`) is a simplified, read-mostly view: one long scroll, a read-only title and status pill, editable description + a handful of meta fields, and links that bounce out to the full page for history, review, comments, and conflicts. The goal of this story is to close that gap and turn the panel into a compact "mini single view" with its own tab bar.

## Approach (architectural)

The full single view is composed of three reusable pieces driven by one hook:

- `useTicketDetailPage(key)` -- a self-contained hook returning all ticket state and handlers (editing, conflict, push/discard, follow, flag, refresh, review/versions, writer sessions, status/type/readiness, sprint).
- `TicketTabContent` -- the tabbed content area (Content / History / Review / Development), already including `EditableTitle`, `EditableDescription`, `AttachmentsSection`, `SubtasksSection`, `LinkedIssuesSection`, `EpicChildrenSection`, `CommentsSection`, `TicketHistory`, `TicketReview`, `TicketDevelopment`.
- `TicketSidebar` -- the meta sidebar (SP/BV, status, epic, parent, sprint, refinement sessions, assignee, reporter, dates, components, completeness, readiness, labels, quality, PO note, Confluence, dev panel).

**The panel should be rebuilt on top of these same building blocks rather than duplicating their logic.** The panel becomes: a compact header (status pill with edit handlers + action buttons) + `TicketTabContent` + a compact meta area, all backed by `useTicketDetailPage`. This keeps behavior identical to the full page and avoids drift between two implementations.

## Requirements

### 1. Independent scroll for backlog list and side panel

- The backlog/ticket list (left column) and the side panel (right column) must scroll independently.
- Scrolling inside the side panel must never move the backlog list, and vice versa.
- Each column keeps its own scroll position; switching tickets should not reset the backlog scroll position.

### 2. Tabbed layout inside the panel

- The panel gets its own tab bar mirroring the single view: **Content**, **History**, **Review**, **Development**.
- Reuse `TicketTabContent` so tab behavior (badges, conflict banner, draft diff, dynamic-loaded tabs) matches the full page.
- The tab bar must remain usable at the minimum panel width.

### 3. Responsive meta placement (width-driven)

- Below a width threshold the meta fields stack in a single column (compact, like today).
- At or above the threshold the panel splits: tabbed content on the left, a meta sidebar on the right.
- The split is driven by the actual panel width (the panel is user-resizable, persisted under `sprintBoardPanelWidth`), not the viewport width.
- The threshold is chosen so both columns stay comfortably readable.

### 4. Content parity (Content tab)

- Editable **title** (`EditableTitle`) -- currently read-only in the panel.
- Editable **description** (`EditableDescription`) -- keep.
- **Attachments** (`AttachmentsSection`).
- **Subtasks** (`SubtasksSection`) and **linked/related issues** (`LinkedIssuesSection`); for epics, **epic children** (`EpicChildrenSection`).
- **Jira comments** -- view and add (`CommentsSection`).
- Sections hide when empty (no placeholder clutter).
- Subtask/related/child rows link to their ticket the same way the full page does.

### 5. Status & workflow actions (panel header / actions)

The panel header must offer the same actions as the single view header (compacted to fit):

- Status pill with editable **Jira status**, **issue type**, and **readiness** (currently read-only).
- **Push to Jira** when there are local edits (with conflict handling deferred to the History tab, as on the full page).
- **Flag / unflag** (with reason dialog).
- **Follow / unfollow**.
- **Pull from Jira** (refresh).
- **Copy title + Jira link**.
- **Add to refinement** (when eligible).
- **Story writer** / **Resume session**.
- Keep the existing "Open full view" affordance and close button.

Where the panel is too narrow to show every action inline, group secondary actions under a "More actions" menu exactly like the full page.

### 6. Meta sidebar parity

- SP and BV must remain inline-editable (`StoryPointPicker` / `BusinessValuePicker`); relocate them out of the headline position into the meta area (sidebar in two-column mode, meta block in single-column).
- Surface the meta fields the full sidebar shows that the panel currently lacks: **components**, **refinement-session links**.
- Keep readiness completeness bar, quality/review link, labels, PO notes, Confluence, dev panel.

### 7. History / Review / Development tabs

- **History**: versions + diffs in-panel (`TicketHistory`), including the conflict-diff flow.
- **Review**: quality review run/view in-panel (`TicketReview`).
- **Development**: full development tab in-panel (`TicketDevelopment`); the compact `DevPanel` can remain as a meta footer summary.

## Out of scope

- Changes to the full ticket detail page (`/tickets/[key]`) behavior; we reuse its components but do not redesign it.
- Embedding the ticket chat pane inside the panel (chat stays on the full page / `/chat`); a "Chat about this ticket" link is enough.
- Embedding the Story Writer editor inside the panel (the writer remains its own route; the panel only links/launches it).
- Changes to backlog/list rendering beyond the scroll-isolation fix.
- New data sources: everything comes from the existing ticket-detail data and hooks.

## Technical notes

- Side panel: `src/components/sprint-board/SidePanel.tsx` (currently a single `overflow-y-auto` scroll, read-only title, SP/BV `ScoreCard`s near the top, bespoke field handlers duplicating the sidebar's logic).
- Board layout / column structure: `src/components/sprint-board/SprintBoard.tsx` (list column `flex min-w-0 flex-1 flex-col` and the `SidePanel` sibling inside the `flex min-h-0` row). Verify `min-h-0` / height constraints so both columns get their own scroll container.
- Reuse: `useTicketDetailPage` (`src/hooks/useTicketDetailPage.ts`), `TicketTabContent` (`src/components/ticket-detail/TicketTabContent.tsx`), and selectively the sidebar meta rows. Prefer reuse over re-implementing the panel's own optimistic handlers.
- Panel width tracked in `panelWidth` state (persisted `sprintBoardPanelWidth`); use it for the responsive breakpoint.
- The full page renders `TicketTabContent` inside `max-w-4xl mx-auto px-8`; in the narrow panel those width/padding assumptions need adjusting (likely a prop or wrapper) so the content fits without horizontal overflow.
- Watch for in-panel concerns the full page solves at route level: the URL does not change inside the panel, so draft-key adoption (`DRAFT-` -> real key) and deep links like `#review` must be handled or degraded gracefully.

## Checklist

- [x] Isolate scroll so the backlog list and side panel scroll independently
- [x] Rebuild the panel on `useTicketDetailPage` + `TicketTabContent` (remove duplicated field handlers)
- [x] Add an in-panel tab bar (Content / History / Review / Development)
- [x] Make `TicketTabContent` render correctly at narrow panel widths (remove `max-w-4xl` assumptions for panel context)
- [x] Width-driven responsive meta placement (sidebar above threshold, stacked below)
- [x] Content tab: editable title, attachments, subtasks, linked issues, epic children, comments
- [x] Header actions: editable status/type/readiness, push to Jira, flag/unflag, follow, pull, copy link, add to refinement, story writer/resume
- [x] "More actions" overflow menu for secondary actions at narrow widths
- [x] Meta parity: extracted a shared `TicketMetaContent` used by both `TicketSidebar` (full page) and `SidePanel`, so the meta is identical and not duplicated
- [x] History / Review / Development tabs render in-panel
- [x] Handle in-panel edge cases (subtask/linked-issue clicks switch the panel via `onSelectTicket`)
- [x] Update/extend `SidePanel.test.tsx` for the new layout, tabs, and actions
- [x] Verify visually at narrow and wide panel widths
- [ ] Update relevant docs in `docs/architecture/` (no dedicated sprint-board doc exists; this story is the record)

## Notes

- The meta panel is a single shared component, `src/components/ticket-detail/TicketMetaContent.tsx`.
  `TicketSidebar` is now a thin resize/collapse shell around it; the sprint-board `SidePanel`
  renders the same component (as a right column when wide, stacked under the Content tab when
  narrow). Field edits accept an optional `onMutate` so the board list can refresh; the full
  page leaves it undefined.
- `npm run build` currently fails at the lint step on a **pre-existing** error in
  `src/components/refinement-session/SessionEndModal.tsx:110` ("Calling setState
  synchronously within an effect"), introduced by commit `fcf3131b` (2026-06-02),
  unrelated to this story. App code compiles (`tsc` passes) and the full test
  suite (3922 tests) passes. The dev branch build was already red before this work.
