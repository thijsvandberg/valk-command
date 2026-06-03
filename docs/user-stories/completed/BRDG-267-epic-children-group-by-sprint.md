# BRDG-267: Group child issues by sprint — a selectable view on the epic detail

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a PO, when I open an epic I want to switch its Child Issues list into a sprint-grouped view, so I can see at a glance which sprint does what, how much effort (story points) and business value sit in each sprint, and how far each sprint has progressed — without leaving the epic.

This is a second way of looking at the same children. The current flat list stays; the new "By sprint" view groups the same rows under per-sprint headers that carry the group's stats, exactly like the sprint board's grouped headers. The PO chooses between the two; the rest of the section (create / link existing, status filter, column visibility) is unchanged.

The chosen direction is variant **A1** from the roadmap exploration. A temporary, mock-data sketch of it lives at `src/app/(app)/dev/epic-roadmap` (family A, variant A1) and should be deleted once this ships.

## Context

Current Child Issues view:
- `src/components/ticket-detail/EpicChildrenSection.tsx` renders a flat list from a pre-fetched `items: EpicChild[]` (no client fetch). Header is `ChildIssueListHeader.tsx`; rows are `ChildIssueRow.tsx`; the footer create/link input is inside `EpicChildrenSection`.
- `ChildIssueListHeader` already hosts the "Child Issues (count)" title and the filter funnel (`FieldFilterPopover`, which drives the status filter and column visibility via `useSectionVisibility` → `useLocalStorage("epic-children")`). There is no view/group toggle today.

Data available per child (`EpicChild` in `src/types/ticket.ts`):
- `sprintName: string | null` (human-readable, populated at fetch time), `storyPoints`, `businessValue`, status, `type`, `subtaskCount`, assignee.

Reusable pieces:
- `src/components/sprint-board/GroupStatBar.tsx` takes a plain `Ticket[]` and renders the exact header in the screenshot: item count, Σ SP (tinted), Σ BV + avg, and `TO DO / IN PROGRESS / TEST / DONE` counts, plus a collapse chevron and an `isActive` live dot. It is not board-coupled.
- `src/components/sprint-board/useGroupBy.ts` has a `groupBySprintFn`, but it assumes a `Sprint[]` metadata list (state, ordering). Epic children do not carry that.

Known data gaps (drive the phasing below):
- Children carry `sprintName` only — **no sprint state** (active / future / closed), **no dates**, and **no deterministic sprint order**. Sprint state/dates live with the sprints list / `sprintNameCache` and are not currently passed to the epic detail.
- The capacity meter (% of a sprint the epic consumes) and "penciled-in" items shown in the exploration have **no backing store**. They are deliberately out of scope here (see Out of scope).

## Approach

**Placement.** Add a view-mode toggle to the Child Issues section, beside the filter funnel in `ChildIssueListHeader`: `List` (current flat view) and `By sprint` (new). Same data, same `ChildIssueRow`, same create/link footer. Not a new top-level tab next to Content / History / Review / Development. Rationale: A1 is a re-grouping of the same child list and shares the create/link affordance; a separate tab would split one dataset across two places. (Alternative recorded under Open questions.)

**By-sprint rendering.** Group `items` by `sprintName`. Render each group as a card whose header is `GroupStatBar` (label = sprint name, stats computed from that group's children), collapsible, with an "Unscheduled" group for `sprintName == null` pinned last. Rows inside reuse `ChildIssueRow` unchanged. The active status filter and column-visibility prefs keep applying within every group.

**Persistence.** Store the toggle with `useLocalStorage` (e.g. key `epic-children-view`, values `"list" | "sprint"`), matching the existing `useSectionVisibility` localStorage pattern so the PO's choice sticks across sessions. The status filter and column-visibility prefs are **shared** between the two views — switching the toggle does not change which statuses/columns are shown.

Both phases below ship together in this story.

## Implementation Plan

**Component split.** New presentational component `EpicChildrenBySprint.tsx`. `EpicChildrenSection` stays the single owner of all shared state (filter, `useSectionVisibility`, `mergedItems`, `filtered`, `statusCounts`, the create/link footer, `renderMetadata`, status/readiness handlers). It computes `filtered` once and passes it down. The create/link footer stays at the section level, rendered below the grouped cards in by-sprint mode.

**Grouping utility.** Pure function `groupChildrenBySprint(items, sprints)` in `src/lib/epic-children-grouping.ts` (no React). Buckets items by `sprintName` (locally-added `Subtask` and `sprintName: null` → Unscheduled, pinned last). When `sprints` metadata is provided, matches each group to a `Sprint` by `sprintName === sprint.name` to derive `state`, `dateRange`, `isActive`; orders named groups closed → active → future, then `startDate` ascending. Client-side join — no DB/API/schema changes (`sprintName` is already the display name === `sprint.name`).

**Toggle.** `List` / `By sprint` segmented toggle added to `ChildIssueListHeader` (new `viewMode`/`onViewModeChange` props), placed before the filter funnel. Persisted in `EpicChildrenSection` via `useLocalStorage("epic-children-view", "list")`.

**Sprint metadata (Phase 2).** `EpicChildrenSection` calls `useJiraSprints()` and maps via `mapJiraSprints` (en-GB date range, state). Active sprint marked with `GroupStatBar`'s `isActive` live dot; `state` chip + date range shown on each header.

**Cleanup.** Move the temporary `src/app/(app)/dev/epic-roadmap/` sketch to `deleted/`.

Steps: (1) grouping util + test → (2) header toggle → (3) `EpicChildrenBySprint` component → (4) wire into `EpicChildrenSection` + metadata join → (5) update section tests → (6) move dev sketch.

Notes: `EpicChild` has no `businessValue`, so BV pill/avg won't render in by-sprint headers (acceptable). Collapse state is per-session via `useSessionStorage` keyed by epic key.

## Requirements

### Phase 1 — Selectable sprint-grouped view
- [x] Add a `List` / `By sprint` toggle to `ChildIssueListHeader`, next to the filter funnel, persisted via `useLocalStorage`
- [x] In "By sprint" mode, group children by `sprintName`; render one collapsible card per sprint with a `GroupStatBar` header (items, Σ SP, Σ BV + avg, status counts)
- [x] "Unscheduled" group for children without a sprint, sorted last
- [x] Rows reuse `ChildIssueRow`; the shared status filter and column-visibility prefs apply within each group
- [x] Empty/edge states: epic with no children, all children unscheduled, a single sprint
- [x] Collapse state per group within a session
- [x] Tests: grouping logic (by `sprintName`, unscheduled last), toggle persistence, shared filter/columns across views, group stats match the flat list totals

### Phase 2 — Sprint state, dates, and ordering
- [x] Expose sprint metadata (state active/future/closed, date range, order) to the epic detail and correlate children by sprint
- [x] Show the Active/Future/Closed chip and date range on each sprint header; mark the active sprint with the `GroupStatBar` live dot
- [x] Order sprint groups chronologically (closed → active → future), Unscheduled last
- [x] Tests: ordering and state derivation

## Decisions (resolved)
- **Layout:** variant A1 (sprint-board-style grouped cards), not the horizontal roadmap.
- **Placement:** a `List` / `By sprint` view toggle on the Child Issues section, not a new tab.
- **Shared prefs:** the status filter and column-visibility settings are shared between the two views, not remembered per view.
- **Scope:** Phase 1 and Phase 2 ship together (sprint state, dates, and chronological ordering included).
- **Grouping key:** the `sprintName` string for grouping; sprint state/dates/order come from the metadata plumbed in Phase 2.
- **Persistence:** `useLocalStorage`, so the chosen view is sticky across sessions.

## Out of scope (follow-ups)
- **Capacity meter** (% of a sprint the epic consumes). New persisted PO metadata with no current backing; track as its own story, tied to the roadmap (B) framing.
- **Penciled-in / draft items** not yet on the backlog, and **view-local SP estimates** (the `~N` behaviour from B1). Separate story.
- The **horizontal roadmap** views (B family) and the **multi-epic capacity lane** (C). Separate work.
- Deleting the temporary sketch route `src/app/(app)/dev/epic-roadmap` once this view ships.
