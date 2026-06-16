# BRDG-357: Rebuild the New story inbox on the shared board issue table

**Status:** Not Started
**Priority:** High
**Type:** Refactor / Feature

## Description

The New story inbox (BRDG-356) currently uses a **bespoke 7-column table**. The PO wants it to use the **same issue table/view as the Sprint Board** so we reuse the existing row, filtering, display, and (later) grouping machinery instead of maintaining a parallel implementation. This story replaces the bespoke table with the shared board components and adds an inbox filter bar + display options, matching the board's look and behaviour.

Also: **move the route to `/inbox`** and relabel. Label: **"Story inbox"** (recommended — disambiguates from Chat/notifications which already occupy the generic "inbox" space; pairs with the `/inbox` URL). Alternatives: "New stories" / "New story inbox". Final label is the PO's pick.

This story **supersedes the bespoke table built in BRDG-356**; the API (`/api/new-stories`, mark-as-read) and the per-row read concept stay.

## Current Behaviour

- `src/app/(app)/new-stories/page.tsx` renders a custom grid table (`StoryRow`, `CollapsibleHeading`) with its own columns, mark-as-read and multi-select. The ticket key is plain mono text, **not** the standard ticket pill.
- The Sprint Board renders its list through reusable, prop-driven components (per the BRDG-356 follow-up investigation):
  - **`TicketTable`** + **`BoardRow`** (`src/components/sprint-board/`) — fully prop-driven row rendering (status pill, title, epic chip, SP/BV chips, assignee, flag, refinement, QS, notes, PO readiness, edit state).
  - **`useSprintBoardFilters`** — pure filter/sort/search state (Status, Epic, Assignee, Readiness, Edit State, Type, Gaps, Team, Sprint). Persists to `/api/settings/sprint-board-filters` + localStorage.
  - **`useColumnConfig`** — inline tag/column visibility (Display options). Persists to `/api/settings/sprint-board-row-fields`.
  - **`FilterControlsPanel`** + **`UnifiedControlsCluster`** + **`BoardFieldToggle`** — the Filters/Display/Sort popovers.
- The board's **`TicketStatusPill`** (used in `BoardRow`) already provides the click-to-edit picker and the rich hover card the PO wants on the key.

## Proposed Approach

Reuse the board list components on the inbox page, parameterising the few hard-coded storage keys so inbox state does not collide with the board's.

### Components to reuse (drop-in or near-drop-in)
- `TicketTable`, `BoardRow`, `GroupCard`, `GroupStatBar` — render as-is from a different data source (`/api/new-stories`).
- `useSprintBoardFilters` — add a `storageKeys` parameter (`{ filterKey, sortKey }`) so the inbox persists to e.g. `/api/settings/new-stories-filters` instead of the board key. Logic unchanged.
- `useColumnConfig` — add a `settingsKey`/`storageKey` parameter so the inbox keeps its own Display config.
- `FilterControlsPanel` / `UnifiedControlsCluster` / `BoardFieldToggle` — reuse; hide the filter categories that are **not relevant** to the inbox.

### Filters (per PO, Image #1)
Show the board's standard filter categories **minus Readiness, Changes (Edit State), and Gaps**: keep **Status, Epic, Assignee, Type, Team, Sprint**. This likely means a small prop on `FilterControlsPanel` to whitelist categories (or an inbox wrapper that hides the three).

### Display options (Image #2)
Reuse the Display popover (Flag, Refinement, QS, Notes, PO readiness, Edit state, SP, BV, Epic, Assignee) via `useColumnConfig` with an inbox storage key. Default the inbox to a sensible subset (e.g. Epic, SP, Assignee on; Refinement/QS/Notes off) — confirm defaults.

### Ticket pill / row
By adopting `BoardRow`, the **key becomes the standard `TicketStatusPill`** with click-to-edit and hover card automatically — satisfying "VPL nr must be the default ticket pill". The mark-as-read action is added to the row (trailing action) — see Open Questions on placement, since the board row has no such action today.

### Mark-as-read integration
The board's `BulkActionBar` does not have "mark as read". Add an inbox-specific bulk action + a per-row action. Keep the optimistic update + undo toast from BRDG-356. (Per-group select-all and group headers are handled in **BRDG-358**.)

### Side panel / selection
Reuse the existing `SidePanel` selection path (already used by the BRDG-356 page).

## Open Questions

- **Route:** **Decided — move to `/inbox`.** Update the nav link, the badge wiring, and any references from `/new-stories`; the API routes stay under `/api/new-stories`. Label "Story inbox" recommended (confirm final wording).
- **Extract vs. copy:** parameterise the shared hooks in place (preferred, single source of truth) vs. fork copies for the inbox. Default: parameterise in place; the board keeps its current behaviour by passing its existing keys.
- **Display defaults** for the inbox (which tags on by default). Default assumption above; confirm.
- **Mark-as-read placement** in a `BoardRow` (trailing icon vs. a dedicated column vs. only via multi-select). Default: trailing per-row action + bulk action, mirroring BRDG-356.

## Implementation Plan (sketch)

1. Parameterise storage keys in `useSprintBoardFilters`, `useColumnConfig` (and keep board callers passing their current keys).
2. Add a category-whitelist prop to `FilterControlsPanel` (or an inbox wrapper) to drop Readiness/Edit State/Gaps.
3. Rewrite `src/app/(app)/new-stories/page.tsx` to compose `UnifiedControlsCluster` + `TicketTable`/`BoardRow` fed by `/api/new-stories`, replacing the bespoke `StoryRow`/`CollapsibleHeading`.
4. Wire the inbox mark-as-read (per-row + bulk) into the board row/bulk surfaces; keep optimistic + undo.
5. Rename nav label + page title to "New story inbox".
6. Remove the now-dead bespoke table code (move to `deleted/` per repo rule, not delete).
7. Tests: filter subset renders, row uses `TicketStatusPill`, mark-as-read still works, display toggles persist under the inbox key.

## Implementation Plan

Decided during implementation (Opus plan + codebase verification):

**A. Render `BoardRow` directly in a flat `<table>`, NOT through `TicketTable`.** `TicketTable` is hard-coupled to board-only concerns (drag-drop, virtualization, grouping, pipelines, ~50 props). The Story Writer landing (`src/app/(app)/story-writer/page.tsx`) already establishes the sanctioned pattern: a plain `<table><tbody>` mapping `BoardRow` with `tags`/`showSprint`/`onDiscard`. The inbox mirrors that. Grouping is removed here (returns in BRDG-358), so the table's grouping value is moot.

**B. Build a lighter `useInboxFilters` hook, NOT parameterise `useSprintBoardFilters` in place.** The board hook is wired to URL routing, saved views, dual all/sprint stores, sprint-state buckets, deep-index search and three hardcoded board settings endpoints; threading inbox keys through it is high-risk and touches the board's hottest hook. Instead reuse the already-decoupled primitives — `FilterControlsPanel`, `UnifiedControlsCluster`, `BoardFieldList`, `filter-bar-types`, `useMigratedAccountSetting` — inside a small new hook with inbox settings keys. This best guarantees AC #7 (board untouched).

**C. Add a real `jiraStatus` to `NewStoryRow`** (from `ticket.status`, cheap) so the status pill and the Status filter are meaningful rather than a hardcoded "TO DO".

Steps:
1. `NewStoryRow` + `listNewStories`: add `jiraStatus`. Update query test.
2. New settings routes `/api/settings/inbox-filters` + `/api/settings/inbox-row-fields` via `createUserJsonSettingRoute`.
3. `FilterControlsPanel`: add optional `categoryWhitelist?: string[]` to drop Readiness/Changes/Gaps for the inbox. Board passes nothing -> unchanged.
4. `BoardRow`: add optional `onMarkRead?: (key) => void` rendering a hover-revealed trailing Check action (mirrors the `onDiscard` overlay), inert on the board.
5. New `useInboxFilters` hook (filter/sort/search over `NewStoryRow[]` + display config under inbox keys). Default display tags: Epic, SP, Assignee on.
6. Rebuild page at `src/app/(app)/inbox/page.tsx`: `UnifiedControlsCluster` + flat `BoardRow` list fed by `useInboxFilters`, keep markRead optimistic+undo and `SidePanel`. Bulk mark-as-read keeps the existing bespoke bottom bar. Move old `new-stories/page.tsx` + test to `deleted/`. Keep `new-stories-grouping.ts` in place (unused; BRDG-358 reuses it).
7. Nav `href`+label, `routes.test.tsx`, page title. Count endpoint stays `/api/new-stories/count`.
8. Tests per the Tests section.

Risk/notes: Team/Sprint filter for the inbox is derived from `sprintName` (no sprintId on the row) via `extractTeamPrefix`; sort is a client sort over the row fields (no rank/index context).

## Acceptance Criteria

- [ ] The inbox renders rows with the **same `BoardRow`** used on the Sprint Board (same status pill, epic chip, SP/BV, assignee, etc.).
- [ ] The ticket key is the **standard ticket pill** with click-to-edit options and the hover card.
- [ ] A **Filters** popover offers Status, Epic, Assignee, Type, Team, Sprint (no Readiness / Changes / Gaps) and filters the list.
- [ ] A **Display** popover toggles which inline fields show, persisted under an inbox-specific key (independent of the board's).
- [ ] Mark-as-read (single + multi-select) still works with optimistic update + undo.
- [ ] The feature is labelled **"New story inbox"** in the nav and page title.
- [ ] The board's own filters/display/sort are unaffected (separate storage keys).

## Tests

- [ ] Filter panel renders only the inbox category whitelist; selecting a Status filters the rows.
- [ ] Display toggle persists under the inbox key and does not mutate the board's row-fields setting.
- [ ] Row renders via `BoardRow`/`TicketStatusPill` (key is a pill, not plain text).
- [ ] Mark-as-read (row + bulk) fires the existing endpoints and optimistically removes rows; undo restores.

## Related

- [[BRDG-356-newly-created-stories-inbox]] — the inbox this rebuilds; API + read concept reused.
- [[BRDG-358-new-story-inbox-grouping-and-group-actions]] — configurable grouping + group headers + per-group select-all (depends on this).
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — per-user read + exclude self-authored.
- Board components: `TicketTable`, `BoardRow`, `GroupStatBar`, `useSprintBoardFilters`, `useColumnConfig`, `FilterControlsPanel`.
