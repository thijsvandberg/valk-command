# BRDG-044: Epic Progress View

**Status:** Open
**Priority:** Medium
**Type:** Feature
**Related:** [[BRDG-250]] (Epic Color Management), BRDG-131 (Epic Detail Interaction), BRDG-249 (Navigate to epic from picker)

## Description

As the PO, I want an Epic-level overview that lists all epics and aggregates their tickets, showing completion percentage, total and remaining points, and a cross-sprint timeline, so I can track feature-level progress across sprints from one place.

This is a read-only **overview of all epics**, distinct from BRDG-131 (interacting with a single epic from the sprint board) and BRDG-249 (clicking through to one epic's detail page).

## Context

- Epic data already exists on tickets as `epic` (name) and `epicKey` (e.g. `VPL-21150`) text columns (`src/db/schema.ts`); there is no separate epic table. All aggregations are derived from the ticket table grouped by `epicKey`.
- An epics API already exists (`src/app/api/epics`) and epics are synced from Jira (`/api/jira/sync-epics`).
- Per-epic colors are owned by BRDG-250. This view should **consume** that color (with a sensible default) rather than define its own color logic.
- Navigation to a single epic's detail page is handled by the `/tickets/[key]` route (see BRDG-249); reuse `<Link href={`/tickets/${epicKey}`}>` for click-through.

## Implementation Plan

### Decisions resolved
- **Placement:** dedicated top-level page at `/epics` (not a Sprint Board tab), mirroring `/stakeholder`, `/pipelines`. Add a sidebar nav entry + command-palette entry.
- **"Recent sprints (last 3 + backlog)":** active sprint + the 2 most recent closed sprints (by `endDate`) + backlog (`sprintName === ""`). Window-scoped aggregates are labelled as such on the page.
- **Status categories:** `DONE` = done; `IN PROGRESS`/`TEST` = in-progress; `DEPRECATED` (+ `DRAFTING`/`REPLACED`/`DRAFT_FAILED`, removed-from-Jira) excluded; everything else = todo. Centralized in a small `src/lib/epic-progress.ts` helper.
- **Color:** consume `getEpicColor()` from `src/types/ticket.ts` (BRDG-250 owns the palette).

### Data model facts
- No epic table. Epics = `ticket.type === "epic"` rows; children carry `epicKey`/`epic`. Reuse the dual-source merge already in `src/app/api/epics/route.ts`.
- `ticket.storyPoints` is nullable `real` (sum with `?? 0`). `ticket.sprintName` stores the sprint **ID** (`""` = backlog); names come from `/api/jira/sprints` (`appSetting "jira_sprints"`).

### Steps (order of implementation)
1. **`src/lib/epic-progress.ts`** (+ test): `categorizeStatus(status)`, percentage/fallback helpers, recent-sprint selection. Pure functions, unit-tested.
2. **API `GET /api/epics/progress`** (`src/app/api/epics/progress/route.ts`, + test): grouped aggregation per `epicKey` over recent-sprint children → `{ key, name, totalTickets, completedTickets, totalPoints, completedPoints, inProgressPoints, todoPoints, sprintIds, perSprint: [{sprintId,total,completed}], pointsBased }`. Cache 5-min like existing route. Leave `/api/epics` untouched.
3. **API `GET /api/epics/[key]/tickets`** (+ test): child tickets for one epic (recent-sprint window), shaped like `/api/tickets` items; consumed lazily on row expand.
4. **Hook `src/hooks/useEpics.ts`**: `useEpicProgress()` + lazy `useEpicTickets(key, enabled)` via `swrFetcher`.
5. **Page `src/app/(app)/epics/page.tsx`** + `loading.tsx`: `ViewHeader`, list of `EpicRow`, window label.
6. **`EpicRow.tsx`**: color swatch, name, `<Link href={/tickets/${key}}>`, counts/points, expand toggle (Phase 3).
7. **`EpicProgressBar.tsx`** (Phase 2): stacked done/in-progress/todo segments using `--color-status-*` tokens; per-epic count-based fallback with a visible "by count" tag when `pointsBased === false`.
8. **`EpicTicketList.tsx`** (Phase 3): grouped-by-status, reuse `TicketStatusPill` + `Avatar`; lazy fetch on expand.
9. **`EpicTimeline.tsx`** (Phase 4): recent-sprint track from `useJiraSprints()` + `perSprint`, boundary markers, done-vs-remaining indication.
10. **Nav:** add entry to `src/components/Sidebar.tsx` `navItems` and `src/components/command-palette/palette-data.ts`.

### Reuse
`getEpicColor` (`src/types/ticket.ts`), `TicketStatusPill`/`Avatar` (`src/components/shared/`), `ViewHeader`, `cache` (`src/lib/cache`), epic merge + grouped-SQL idiom (`src/app/api/epics/route.ts`), `swrFetcher`/hook conventions (`src/hooks/useSprintBoard.ts`), `useJiraSprints()`, status tokens (`src/lib/status-colors.ts`).

## Acceptance Criteria

### Phase 1: Epic list page
- [x] New page at `/epics` (or a tab within the Sprint Board; confirm placement before building)
- [x] List all epics that have tickets in recent sprints (last 3 sprints + backlog)
- [x] Each epic row shows: epic name, color (from [[BRDG-250]], default if unset), total tickets, completed tickets, total points, completed points
- [x] Each row links through to the epic's detail page at `/tickets/[epicKey]` (reuse the BRDG-249 navigation pattern)

### Phase 2: Progress visualization
- [x] Horizontal progress bar per epic showing completion percentage (points-based)
- [x] Color-coded segments: done, in-progress, todo (using the existing status-color tokens, so they stay distinct from the per-epic brand color)
- [x] Percentage label on the bar
- [x] Handle epics with zero estimated points gracefully (fall back to ticket-count-based progress, clearly labelled)

### Phase 3: Epic detail expansion
- [x] Click epic row to expand and show all tickets grouped by status
- [x] Each ticket shows: key, title, status badge (reuse `TicketStatusPill`), assignee, sprint
- [x] Link to ticket detail page

### Phase 4: Cross-sprint timeline
- [x] Timeline bar showing which sprints an epic spans
- [x] Markers for sprint boundaries
- [x] Visual indication of which sprints have completed tickets vs remaining

## Technical Notes
- Aggregate queries on the ticket table grouped by `epicKey`; no new database tables needed.
- Cache epic aggregations with SWR (refresh on sync).
- Reuse existing shared components where possible: `TicketStatusPill` (BRDG-125), status-color tokens (`src/lib/status-colors.ts`).
- Per-epic color comes from [[BRDG-250]]; if that is not yet built, fall back to a deterministic default derived from `epicKey`.

## Out of Scope
- Creating or editing epics from Bridge (epic creation/editing stays in Jira).
- Managing per-epic colors (covered by [[BRDG-250]]).
- Epic-level story writer (batch per epic).
- Roadmap view with drag-and-drop scheduling.
- Epic dependencies.
