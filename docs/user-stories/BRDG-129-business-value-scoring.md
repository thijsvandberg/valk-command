# BRDG-129: Business Value Scoring

**Status:** Open
**Priority:** High

## Description

As the PO, I want to assign a Business Value (BV) score to each ticket on the Sprint Board so I can assess whether a sprint delivers sufficient value to stakeholders. BV is a manual, absolute score on a 1-7 scale that is independent of effort/story points and quality score.

## Implementation Plan

1. **Schema** (`src/db/schema.ts`): Add `businessValue: integer("business_value")` to `ticketMetadata` table
2. **Migration**: Generate and apply Drizzle migration
3. **Service** (`src/services/ticket-service.ts`): Add `businessValue` to `UpdateMetadataInput`, add validation (integer 1-7 or null)
4. **Type** (`src/types/ticket.ts`): Add `businessValue: number | null` to `Ticket` interface, add `BV_COLORS` config
5. **API mapping** (`src/app/api/tickets/route.ts`, `src/app/api/tickets/[key]/route.ts`): Map `businessValue` from metadata to response
6. **Column config** (`FilterBar.tsx`): Add `"bv"` to `ColumnId`, `COLUMNS`, `DEFAULT_VISIBLE`, `SortField`, `SORT_OPTIONS`
7. **Sort logic** (`useSprintBoardFilters.ts`): Add BV sort case
8. **Table header** (`TicketTable.tsx`): Add BV to header labels, sort fields, column widths
9. **Row rendering** (`TicketRow.tsx`): Add `case "bv"` to `renderCell`
10. **Picker component** (new `src/components/shared/BusinessValuePicker.tsx`): Dropdown with 1-7 + clear
11. **Optimistic updates** (`sprint-board-utils.ts`): Extend `saveTicketMetadata` for `businessValue`
12. **Plumbing** (`SprintBoard.tsx`, `TicketTable.tsx`): Add `onBusinessValueChange` callback chain
13. **Aggregates** (`GroupStatBar.tsx`): Compute and display BV total + average via `StatPill`
14. **Sidebar** (`TicketSidebar.tsx`): Add BV display + edit in PO Metadata section

## Acceptance Criteria

### Phase 1: Data model and API
- [x] Add `businessValue` integer field (1-7, nullable) to `ticketMetadata` table
- [x] Generate and run Drizzle migration
- [x] Extend metadata PUT endpoint to accept and persist `businessValue`
- [x] Validate input: integer between 1 and 7, or null to clear

### Phase 2: Sprint Board column
- [x] Add "BV" column to the sprint board table
- [x] Column shows the numeric score (1-7) or empty when unset
- [x] Color coding: low (1-2) muted/cool, medium (3-5) neutral, high (6-7) warm/accent
- [x] Column is visible in the default column preset
- [x] Column is sortable
- [x] Column is toggleable via column picker

### Phase 3: Inline editing
- [x] Click on BV cell to open a picker (dropdown or segmented control with 1-7)
- [x] Option to clear the value (set to null)
- [x] Optimistic update on selection
- [x] Persists via existing metadata endpoint

### Phase 4: Sprint aggregates
- [x] Show sprint BV total in the board header/summary area
- [x] Show sprint BV average in the board header/summary area
- [x] Format: "BV: 28 avg 4.0" or similar compact representation
- [x] Aggregates update live when individual scores change

### Phase 5: Ticket sidebar
- [x] Display BV score in the PO Metadata section of the ticket sidebar
- [x] Editable from the sidebar using the same picker component

## Technical Notes

- Field name in schema: `businessValue` (integer, nullable)
- Reuse existing `saveTicketMetadata()` optimistic update pattern from `sprint-board-utils.ts`
- Reuse existing metadata PUT endpoint (`/api/tickets/[key]/metadata`)
- BV is PO-local metadata, never synced back to Jira
- Color scale should use the project's brand palette, not default Tailwind

## Out of Scope

- AI-assisted BV scoring via remote agent (followup: let VRA suggest/validate scores for a sprint or multiselect)
- Stakeholder View integration (followup: surface BV in the read-only stakeholder view with filtering/sorting)
- BV trends over time / historical tracking
- BV as input to prioritization formulas (e.g. WSJF)
- Bulk editing of BV across multiple tickets
