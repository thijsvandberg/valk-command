# BRDG-131: Business Value in Stakeholder View

**Status:** Open
**Priority:** Medium
**Depends on:** BRDG-129

## Description

As a stakeholder viewing the read-only Stakeholder View, I want to see Business Value scores so I can understand which tickets in the sprint are most valuable and whether the sprint is focused on high-value delivery.

## Acceptance Criteria

### Phase 1: BV display in ticket list
- [ ] Show BV score per ticket in the stakeholder view ticket list
- [ ] Same color coding as the sprint board (low/medium/high)
- [ ] Sortable by BV score
- [ ] Filterable: show only high-value (6-7), medium (3-5), or all

### Phase 2: Sprint value summary
- [ ] Sprint summary section shows total BV and average BV
- [ ] Visual indicator of value distribution (e.g. how many tickets are high/medium/low value)
- [ ] Compare against previous sprint if data available (sprint-over-sprint value trend)

### Phase 3: Value-focused presentation
- [ ] "Top value items" highlight section showing the highest-BV tickets prominently
- [ ] BV integrated into any existing sprint progress or status widgets
- [ ] Tickets without a BV score are visually de-emphasized but still visible

## Technical Notes

- Stakeholder view is read-only; no editing of BV scores from this view
- Reuse BV display components from the sprint board (shared component)
- Stakeholder view data comes from the same API; no additional endpoints needed
- Respect existing stakeholder view access patterns (no auth changes)

## Out of Scope

- Stakeholder ability to vote on or influence BV scores
- BV-based notifications or alerts to stakeholders
- Cross-sprint value reporting or dashboards
