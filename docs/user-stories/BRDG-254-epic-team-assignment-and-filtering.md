# BRDG-254: Epic Team Assignment and Filtering

**Status:** Draft
**Priority:** Medium
**Type:** Feature
**Related:** [[BRDG-044]] (Epic Progress View), [[BRDG-250]] (Epic Color Management)

## Description

As the PO, I want to assign one or more teams to an epic and filter the Epic Progress View by team, so I can quickly see the epics a given team is working on (and hide the rest). Epics are cross-cutting and a single epic can belong to multiple teams, so team assignment must be multi-select.

## Context

- Teams are a fixed set: **BT, BM, BO, GXP, HT** (see the `userTeamAssignment` table in `src/db/schema.ts`, which maps users to teams). Sprints are team-prefixed (e.g. `BT: 138`, `GXP: 138`), so the board already runs concurrent per-team sprints.
- Epics have **no team field** today. They live as `ticket.type === "epic"` rows with no Bridge-owned metadata. Assigning teams therefore needs a small Bridge-owned metadata store keyed by `epicKey` (the same store [[BRDG-250]] needs for epic color, so build them together or share the table).
- The Epic Progress View (`/epics`, [[BRDG-044]]) currently lists every epic with tickets in the recent window and has **no filtering** yet. This story adds the first filter (team) and the data behind it.
- Team assignment is PO metadata: it is **not** written back to Jira.

## Decisions (PO)
- **Team assignment is manual** for now. Auto-deriving a team from the epic's child tickets (sprint prefix / assignees) is explicitly deferred to a later story.
- **Filters in scope:** team **and** epic status. Status options: **open / in progress / done / deprecated** (the epic's own lifecycle status).

## Implementation Plan

### 1. Shared epic-metadata store (schema + migration)
Add a single `epic_metadata` table keyed by `epicKey` (one row per epic), with `teams` stored as a JSON-array text column (`default "[]"`) and an `updatedAt`. This mirrors the `ticketMetadata` single-row pattern and leaves room for BRDG-250's future `color` column. **No FK** to `ticket.jiraKey` (epics may not have a synced epic row, and the PO may assign teams before sync). Generate a migration via `npm run db:generate`; it auto-applies through `migrate()` in `src/db/index.ts`.

### 2. API surface
- New route `src/app/api/epics/[key]/teams/route.ts` modelled on `api/settings/user-teams`: **GET** returns `{ epicKey, teams }`; **PUT** validates `{ teams: Team[] }` with zod (`z.enum(TEAMS)`), upserts via `onConflictDoUpdate`, and invalidates the `/api/epics/progress` cache. Clear = PUT with empty array.
- Extend `/api/epics/progress` to add `teams: Team[]` and `status` (four-bucket value) per epic. Fetch the epic row's own `status` alongside its title; default epics without a synced row to `open`. Stays cached 300s (PUT invalidates).
- Server helper `getEpicTeamsMap(epicKeys)` for a single batched read.

### 3. Client hooks
`useEpicProgress()` returns the extended items automatically (teams + status ride along). Add `useSetEpicTeams()` that PUTs and revalidates `/api/epics/progress`.

### 4. Phase-1 team-assignment control
`EpicTeamPicker.tsx` — a popover multi-select over `TEAMS`, adapted from `CreatorFilter`/`SprintFilter` in `pipelines/FilterBar.tsx` (checkbox rows, brand active state, "Clear selection" = remove all). Triggered from the EpicRow header with `e.stopPropagation()` so it doesn't toggle expansion. Full UI guardrails (hover/focus-visible/active/cursor-pointer).

### 5. Phase-2 chips + unassigned affordance
Render assigned teams as compact chips in the EpicRow header. When unassigned, show an unobtrusive muted "+ Team" pill that doubles as the picker trigger.

### 6. Phase-3 + Phase-4 filters (client-side)
The recent-window epic set is small and already fully loaded, so filter client-side in `page.tsx` via `useMemo`. New `epic-helpers.ts` holds `STORAGE_KEY`, `PersistedEpicFilters` ({ teams?, statuses? }), and `mapJiraStatusToBucket` (shared with the API: `DONE`→done, `DEPRECATED`→deprecated, `IN PROGRESS`/`TEST`→in_progress, else open). New `EpicFilterBar.tsx` with a `TeamFilter` and `StatusFilter` (multi-select, brand active-indicator, "Clear filters"). Persist via `useLocalStorage<PersistedEpicFilters>`. Predicate: `(no team filter OR teams intersect) AND (no status filter OR status in selected)`. Distinct empty-state message when filters exclude everything vs. no epics at all.

### 7. Order
schema → helpers (`mapJiraStatusToBucket`, `getEpicTeamsMap`) → extend progress API → teams route → `useSetEpicTeams` → Phase 1 picker → Phase 2 chips → Phase 3 team filter + persistence → Phase 4 status filter.

### 8. Tests
`progress/route.test.ts` (assert teams + status buckets); new `[key]/teams/route.test.ts`; `epic-helpers.test.ts`; `EpicRow`/`EpicTeamPicker` tests; extend `page.test.tsx` + new `EpicFilterBar.test.tsx`.

### 9. Resolved ambiguities
No FK on `epic_metadata`; status filter operates on the epic's own row status only (child aggregation untouched); multi-team filter is OR (intersection-nonempty); team chips use a small distinct color map; default unknown status → open.

## Acceptance Criteria

### Phase 1: Assign teams to an epic
- [ ] A multi-select control to set one or more teams (from the fixed set BT/BM/BO/GXP/HT) on an epic.
- [ ] Persisted as Bridge-owned metadata keyed by `epicKey` (shared with [[BRDG-250]] if built together). No write-back to Jira.
- [ ] Clear/remove a team assignment.
- [ ] Control follows the UI guardrails: hover / focus-visible / active states, `cursor: pointer`.

### Phase 2: Show team on the epic row
- [ ] Each epic row in `/epics` shows its assigned team(s) as compact chips.
- [ ] Epics with no team assigned render an unobtrusive "unassigned" affordance (not noise).

### Phase 3: Filter the epics view by team
- [ ] A team filter on the `/epics` view (multi-select): selecting one or more teams shows only epics assigned to any selected team.
- [ ] Clear-filter action; filter state is visible (active-filter indicator) and ideally persisted across reloads (localStorage, consistent with the Pipelines view).
- [ ] An empty-state message when no epics match the active filters.

### Phase 4: Filter the epics view by status
- [ ] A status filter on the `/epics` view with options **open / in progress / done / deprecated**, based on the epic's own lifecycle status.
- [ ] Maps the epic's Jira status to the four buckets (e.g. `TO DO` → open, `IN PROGRESS`/`TEST` → in progress, `DONE` → done, `DEPRECATED` → deprecated).
- [ ] Combines with the team filter (an epic must match both the selected teams and the selected statuses).
- [ ] Same clear/active-indicator/persistence behaviour as the team filter.

## Technical Notes
- Reuse the fixed team list from the existing team model (`userTeamAssignment` / the teams referenced by `/api/settings/user-teams`) rather than hardcoding a new list.
- Reuse the filter-bar / multi-select patterns already used on the Pipelines view (`src/app/(app)/pipelines/FilterBar.tsx`) for consistency.
- The epics aggregation API (`/api/epics/progress`) should return each epic's assigned teams **and the epic's own Jira status** so the row chips and client-side team/status filtering work without extra round-trips.

## Out of Scope
- Editing the set of teams themselves (the BT/BM/BO/GXP/HT set is fixed).
- Writing team assignment back to Jira.
- Creating or editing epics from Bridge.
- Auto-deriving a team from child tickets (deferred to a later story).
- Filters other than team and status.
