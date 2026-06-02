# BRDG-251: Move pipeline & deploy badges into the ticket hover card

**Status:** Done
**Priority:** Low
**Type:** Enhancement
**Source:** PO request

## Description

As a Product Owner, I want the inline pipeline-health and deployment badges removed from the sprint-board rows and surfaced in the ticket hover card instead, so that the rows stay clean and uncluttered while the information is still one hover away.

Today each row's `pipeline` column shows up to two small badges (see Image 1):

- **Pipeline health** — a `GitBranch` icon plus a recent-failure count (e.g. `6`), colored green/amber/red by status.
- **Last deploy** — a `Rocket` icon plus the environment short code (e.g. `UAT`), colored by deploy state (`SUCCESSFUL` / `FAILED` / other).

These add visual noise to every row. The natural home for them is the existing `TicketStatusPill` hover card (BRDG-235), which already lists Sprint, Epic, Assignee, Creator, and Subtasks (see Image 2). Moving them there continues the BRDG-239 direction of cleaning up the row and re-homing secondary signals into the tooltip.

**For now**, the `pipeline` column should be hidden by default on the sprint board (removed from `DEFAULT_VISIBLE`). The column-toggle plumbing stays intact, so the column can still be re-enabled manually if needed; this story does not delete the column.

## Implementation Plan

1. **Default-hide the pipeline column** — remove `"pipeline"` from `DEFAULT_VISIBLE` in `filter-bar-types.ts`. Keep it in `ColumnId` + `COLUMNS` so the toggle still offers it. Update any test asserting the default set.
2. **Extend hover data** — add `pipelineHealth?: PipelineHealthEntry | null` and `lastDeploy?: LastDeployedInfo | null` to `TicketPillHoverData`. Wire them from `TicketRow.tsx` (`health`, `lastDeploy` are already in scope) into the `hoverData` object.
3. **Render pipeline/deploy rows in the hover card** — add two conditional `InfoRow`s in `TicketHoverCard` (after Subtasks): a `GitBranch` pipeline-health badge (failure count over recent runs) and a `Rocket` deploy badge (environment + state), reusing the green/red/amber color logic from the inline cell. Only render when data is present.
4. **Equalize hover-card value font sizes** (Image #3) — pass `textClass="text-body-sm"` to `SprintPicker`, `AssigneePicker`, and `EpicPicker` in the card so every value row is 12px, matching the read-only Creator/Subtasks values (today Sprint/Assignee are 14px, Epic 11px).
5. **Widen the hover card** — bump the card width from `w-72` (288px) to `w-80` (320px) to give values more room.
6. **Enlarge the card title** (Image #4) — bump the title from `text-body-sm` (12px) to `text-body-lg` (14px).
7. **Tests** — hover card renders pipeline/deploy rows from data and omits them when absent; `DEFAULT_VISIBLE` excludes `pipeline`.

### Follow-up refinements (PO feedback after first pass)

- Pipeline/deploy were initially added as their own labelled `InfoRow`s; per PO they now render as **compact badges on the SP/BV metric row** (next to SP/BV), matching the `MetricBadge` pill geometry (`rounded-md px-1.5 py-0.5 gap-1 text-body-sm`, icon size 12 / strokeWidth 2). Pipeline shows `GitBranch` + `fails/total` (or total when healthy); deploy shows `Rocket` + environment. Both carry `aria-label`s and tooltips with full detail. Status colors: green/red/amber for pipeline, green/red/neutral for deploy.
- Column visibility is persisted **server-side** via `useColumnConfig`, not the `storedColumns` localStorage path in `useSprintBoardFilters` (that path is dead — `externalVisible` always wins). A one-time migration in `useColumnConfig` strips `pipeline` from the loaded visible set so the column hides for existing users; re-adding via the toggle is respected.

## Acceptance Criteria

- [x] The pipeline-health badge and last-deploy badge no longer appear inline on sprint-board rows by default.
- [x] The `pipeline` column is removed from `DEFAULT_VISIBLE` (default-hidden); it remains available via the column toggle.
- [x] The ticket hover card shows pipeline health (recent failures over recent runs) and last deploy (environment + state, with the completed-at timestamp) when that data exists for the ticket.
- [x] Hover-card rows for pipeline/deploy only render when the corresponding data is present (no empty rows for tickets with no pipeline/deploy info).
- [x] Badge colors and meaning in the hover card match the existing inline treatment (green = healthy/successful, red = failed, amber/neutral = warning/unknown).
- [x] Styling follows project guardrails (brand-derived colors, layered/tinted shadows, `transform`/`opacity` transitions only, no `transition-all`, no default Tailwind blue/indigo).
- [x] Tests updated/added: hover card renders pipeline/deploy rows from data; rows are absent when data is missing; `DEFAULT_VISIBLE` no longer includes `pipeline`.
- [x] Hover-card value rows share a single font size (Image #3): Sprint, Epic, Assignee, Creator, and Subtasks values all render at `text-body-sm` (12px).
- [x] The hover card is a bit wider (`w-72` → `w-80`).
- [x] The hover-card ticket title is larger (Image #4): `text-body-sm` → `text-body-lg`.

## Technical Notes

### Affected files

| File | Change |
|------|--------|
| `src/components/sprint-board/filter-bar-types.ts` | Remove `"pipeline"` from `DEFAULT_VISIBLE` (keep it in `ColumnId` and `COLUMNS` so the toggle still works). |
| `src/components/shared/TicketStatusPill.tsx` | Extend `TicketPillHoverData` with pipeline-health + last-deploy fields; add conditional `InfoRow`s to `TicketHoverCard` rendering the `GitBranch` failure badge and `Rocket` environment/state badge. |
| `src/components/sprint-board/TicketRow.tsx` | Pass the existing `health` / `lastDeploy` values into `hoverData`. The inline `case "pipeline"` cell can stay as-is (it simply won't render while the column is default-hidden) — optionally simplify later under BRDG-239. |

### Data sources (already available)

- Pipeline health: `health` (`PipelineHealthEntry`) — `status`, `recentFails`, `recentTotal`. Source: `pipelineHealthMap` / `usePipelines`.
- Last deploy: `lastDeploy` (`LastDeployedInfo`) — `environment`, `state`, `completedAt`. Source: `lastDeployedMap[ticket.key]`.

Both are already wired into `TicketRow` (`TicketRow.tsx:150`, `:545-581`); this story routes them into `hoverData` instead of (only) the inline cell.

### Reuse

- `TicketStatusPill` / `TicketHoverCard` / `InfoRow` (BRDG-235) — the existing hover-card structure and row component.
- Existing badge styling from the inline `pipeline` cell (`TicketRow.tsx:545-581`) — lift the color logic into the hover card.

## Dependencies

- Builds on BRDG-235 (hover card).
- Aligns with BRDG-239 (headerless row layout / re-homing secondary signals into the hover card). BRDG-239 lists pipeline/deploy badges among its OPEN #1 clean-up candidates; this story settles them ahead of that work.
