# BRDG-358: New story inbox — configurable grouping, board-style group headers, per-group select-all

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

On the New story inbox, the PO wants:

1. **Configurable "group by":** date, epic, creator (author), or sprint — not just the fixed date grouping from BRDG-356.
2. **More date buckets:** add **"Previous week"** between "This week" and "Older", so the gap after a holiday is not one giant "Older" bucket. Buckets become: **Today / Yesterday / This week / Previous week / Older**.
3. **Board-style group headers:** the groups should look and behave like the Sprint Board's group rows (Image #3) — collapsible header with item count and metric chips — reusing `GroupStatBar`/`GroupCard`.
4. **Per-group "Select all":** each group header gets a select-all that selects only that group's rows (feeding the existing mark-as-read bulk action).

Depends on **BRDG-357** (inbox already using the shared board table).

## Current Behaviour

- BRDG-356's inbox groups by date only, with four buckets (Today / Yesterday / This week / Older) and a bespoke `CollapsibleHeading`. Team grouping is applied on top when a default team is set.
- The board's grouping is in **`useGroupBy`** (`src/components/sprint-board/useGroupBy.ts`): `GroupByOption = "none" | "sprint" | "epic"`, with pure grouping functions and a `TicketGroup { key, label, tickets, sortOrder }` shape. Group headers render via **`GroupStatBar`** (count, SP/BV totals, status counts, collapse, pin) inside **`GroupCard`**.
- `useGroupBy` persists the choice to session storage (`"sprint-board-group-by"`) and collapsed state to `"sprint-board-collapsed-groups"`.
- There is **no per-group select-all** today; the board has a single global `BulkActionBar` and select-all over the whole list.

## Proposed Approach

### Grouping
- Extend `GroupByOption` with **`"date"`** and **`"creator"`** (keep `"sprint"`, `"epic"`, `"none"`). Add the corresponding pure grouping functions to `useGroupBy`:
  - **date** — buckets Today / Yesterday / This week / Previous week / Older from `jiraCreatedAt`, ordered as listed. Reuse/extend the BRDG-356 date-bucket logic (add the "previous_week" bucket: created in the 7 days before "this week").
  - **creator** — group by `reporter.name`; an "Unknown reporter" group last.
  - sprint / epic — reuse the board's existing functions.
- Parameterise `useGroupBy`'s session-storage keys (per BRDG-357's parameterisation theme) so the inbox keeps its own group-by + collapsed state.
- Surface a **group-by selector** on the inbox controls (the board exposes group-by; reuse that control or add an inbox one).

### Group headers
- Render inbox groups with **`GroupStatBar`/`GroupCard`** so they match the board (count + metric chips + collapse). Sprint-specific affordances (pin, edit/close sprint, capacity) should be hidden for non-sprint groupings.

### Per-group select-all
- Add a **select-all control to the group header** that toggles selection of exactly that group's rows, integrating with the inbox's existing multi-select + mark-as-read bulk action (BRDG-356/357). Indeterminate state when only some of the group is selected.
- This is a new affordance; if added to `GroupStatBar`, gate it behind a prop so the board is unaffected (or render it only in the inbox).

## Open Questions

- **Default group-by** for the inbox: date (matches BRDG-356) — confirm.
- **"This week" vs "Previous week" definition:** "This week" = created within the last 7 days (excluding today/yesterday); "Previous week" = the 7 days before that; "Older" = beyond ~14 days. Confirm the exact day boundaries (calendar week vs. rolling 7-day windows). Default: rolling windows, matching BRDG-356's day-distance logic.
- **Team-first ordering** (BRDG-356, default-team to the top): how does it interact with non-date groupings? Default: team-priority applies only to date grouping; epic/creator/sprint groupings order by their own natural order.
- **Per-group select-all in `GroupStatBar`** (shared) vs. an inbox-only header wrapper. Default: prop-gated in `GroupStatBar` so it stays board-safe.

## Implementation Plan

Decided (Opus plan + codebase verification). Build **flat, configurable** inbox grouping WITHOUT touching the board's `useGroupBy` or `SprintSlots` (guarantees AC "board unaffected"). BRDG-356's nested team-first grouping was already dropped in BRDG-357; grouping here is single-level. Default group-by = **date**.

**Phase A — pure grouping core** (`src/lib/new-stories-grouping.ts`)
1. Add the `previous_week` bucket: extend `DateBucket`, `DATE_BUCKET_LABELS` (`"Previous week"`), `DATE_BUCKET_ORDER` (between `this_week`/`older`), and `dateBucket` (`diff <= 14` → `previous_week`). Backward-compatible with the existing team-grouping function + tests.
2. Add flat grouping: `InboxGroupBy = "date"|"epic"|"creator"|"sprint"`, `InboxGroup { key, label, rows }`, `groupInboxStories(rows, { groupBy, now })`. Ordering: date → `DATE_BUCKET_ORDER`, empty dropped; epic → alpha by label, "No epic" (`__none__`) last; creator → alpha by reporter name, "Unknown reporter" (`__unknown__`) last; sprint → alpha by sprint name, "No sprint" (`__none__`) last.

**Phase B — inbox grouping hook** (`src/components/sprint-board/useInboxGroupBy.ts`, new)
3. `useInboxGroupBy(rows)` mirrors useGroupBy's persistence with inbox keys: `useSessionStorage("inbox-group-by", "date")`, `useSessionStorage("inbox-collapsed-groups", [])`. Returns `{ groupBy, setGroupBy, groups, collapsedGroups, toggleCollapse }`.

**Phase C — group-by selector** (inbox-local)
4. New `InboxGroupByDropdown` modeled on the board's private `GroupByDropdown` (Layers icon + active dot + 4-option popover). Rendered in the inbox `BarContainer` before `UnifiedControlsCluster`. Shared controls components stay byte-for-byte unchanged.

**Phase D — page render** (`src/app/(app)/inbox/page.tsx`)
5. Call `useInboxGroupBy(filteredRows)`; map groups → `GroupCard` + `GroupStatBar` header + per-group `BoardRow` table. GroupStatBar gets `tickets={group.rows.map(rowToTicket)}`, `label`, collapse props, and the select-all quartet; all sprint-specific props omitted. Per-group select-all toggles exactly that group's `row.key`s in the existing `checkedKeys` Set; `selectAllIndeterminate` when partial; `selectionActive = checkedKeys.size > 0`. Keep markRead/undo/bulk-bar/SidePanel intact.

**Phase E — tests**
6. grouping unit tests (5 date buckets in order incl. Previous week; creator unknown-last); `useInboxGroupBy` persistence under its own key (board key untouched); page test for per-group select-all + indeterminate.

Flagged: inbox sprint groups order alphabetically (no real `Sprint[]` chronology available); known-reporter/epic order alphabetical.

## Acceptance Criteria

- [x] I can switch the inbox grouping between Date, Epic, Creator, and Sprint. <!-- InboxGroupByDropdown + useInboxGroupBy -->
- [x] Date grouping shows Today / Yesterday / This week / **Previous week** / Older, in that order, with empty buckets hidden. <!-- groupInboxStories date mode -->
- [x] Groups render with the board-style header (count + collapse), matching the Sprint Board look. <!-- GroupCard + GroupStatBar -->
- [x] Each group header has a select-all that selects only that group's rows and feeds the mark-as-read bulk action; it shows an indeterminate state for partial selection. <!-- toggleGroup + GroupStatBar select-all quartet -->
- [x] Group-by and collapsed state persist for the inbox independently of the Sprint Board. <!-- session keys inbox-group-by / inbox-collapsed-groups -->
- [x] The Sprint Board's grouping/headers are unaffected. <!-- no board files touched; separate keys -->

Decided: grouping is flat single-level for all four modes (BRDG-356's nested team-first grouping was already dropped in BRDG-357). Inbox sprint/epic/creator groups order alphabetically; date groups follow the fixed bucket order. Per-group status filtering is omitted (display-only chips).

## Tests

- [x] Date grouping produces the five buckets in order from representative `jiraCreatedAt` values, including a "Previous week" item. <!-- new-stories-grouping.test: groupInboxStories date mode -->
- [x] Creator grouping buckets by reporter and places unknown-reporter last. <!-- new-stories-grouping.test: creator mode (+ epic/sprint ordering) -->
- [x] Group header select-all selects exactly that group's keys; partial selection renders indeterminate. <!-- inbox page.test: group select-all + indeterminate -->
- [x] Inbox group-by persists under its own key and does not change the board's group-by. <!-- useInboxGroupBy.test -->

Note: the date-bucket tests live in `new-stories-grouping.test.ts` (the pure `groupInboxStories`), not the board's `useGroupBy` — the inbox uses dedicated flat grouping rather than the board hook, keeping the Sprint Board untouched.

## Related

- [[BRDG-357-new-story-inbox-reuse-board-table]] — prerequisite (inbox on the shared table).
- [[BRDG-356-newly-created-stories-inbox]] — original date buckets + team-first ordering.
- [[BRDG-300-collapsible-section-headings]] — collapsible group pattern.
- Board components: `useGroupBy`, `GroupStatBar`, `GroupCard`.
