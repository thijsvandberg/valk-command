# BRDG-131: Business Value in Stakeholder View

**Status:** Done
**Priority:** Medium
**Depends on:** BRDG-129

## Description

As a stakeholder viewing the read-only Stakeholder View, I want to see Business Value scores so I can understand which tickets in the sprint are most valuable and whether the sprint is focused on high-value delivery.

## Implementation Plan

### Phase 1: BV display in ticket list

1. **Add `businessValue` to `StakeholderTicket` interface and transforms** (`stakeholder-data.ts`)
2. **Update tests** for the new field (`stakeholder-data.test.ts`)
3. **Show BV score per ticket** in `TicketGroup.tsx` with color coding via `getBvColor()`
4. **Add sort-by-BV** toggle in `SprintOverviewCard.tsx`
5. **Add BV filter chips** (high 6-7, medium 3-5, all) in `SprintOverviewCard.tsx`

### Phase 2: Sprint value summary

6. **Create `BvSummaryBar` component** showing total BV, average BV, high/medium/low distribution bar
7. **Wire `BvSummaryBar`** into `SprintOverviewCard` between ProgressBar and EpicFilterChips
8. **Thread previous-sprint tickets** to enable sprint-over-sprint comparison delta

### Phase 3: Value-focused presentation

9. **Create `TopValueItems` component** highlighting BV >= 6 tickets prominently
10. **Integrate BV into section headers** (total BV per section alongside point count)
11. **De-emphasize unscored tickets** via reduced opacity when BV display is active

## Acceptance Criteria

### Phase 1: BV display in ticket list
- [x] Show BV score per ticket in the stakeholder view ticket list
- [x] Same color coding as the sprint board (low/medium/high)
- [x] Sortable by BV score
- [x] Filterable: show only high-value (6-7), medium (3-5), or all

### Phase 2: Sprint value summary
- [x] Sprint summary section shows total BV and average BV
- [x] Visual indicator of value distribution (e.g. how many tickets are high/medium/low value)
- [x] Compare against previous sprint if data available (sprint-over-sprint value trend)

### Phase 3: Value-focused presentation
- [x] "Top value items" highlight section showing the highest-BV tickets prominently
- [x] BV integrated into any existing sprint progress or status widgets
- [x] Tickets without a BV score are visually de-emphasized but still visible

## Technical Notes

- Stakeholder view is read-only; no editing of BV scores from this view
- Reuse BV display components from the sprint board (shared component)
- Stakeholder view data comes from the same API; no additional endpoints needed
- Respect existing stakeholder view access patterns (no auth changes)

## Out of Scope

- Stakeholder ability to vote on or influence BV scores
- BV-based notifications or alerts to stakeholders
- Cross-sprint value reporting or dashboards
