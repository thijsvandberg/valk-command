# BRDG-207: Improve Sprint Board Side Panel

**Status:** Done
**Priority:** Medium
**Type:** Enhancement

## Description

As a Product Owner, I want the sprint board side panel to display richer ticket information so that I can triage and review tickets without navigating to the full detail page.

The current `SidePanel` on the sprint board is functional but bare compared to the `TicketSidebar` on the ticket detail page. Key metadata fields are missing, the layout feels flat, and several reusable components from `TicketSidebar` are not being leveraged.

### Current State (SidePanel)

The sprint board side panel (`src/components/sprint-board/SidePanel.tsx`) currently shows:
- Ticket key + action buttons (story writer, sync, expand, open, close)
- Title
- Status badge, epic badge, story points
- Assignee (name + avatar)
- Description (markdown rendered, max-height 256px)
- PO Metadata: Readiness dropdown, Quality Score badge (read-only), Notes textarea
- View Changes link (when versions exist)
- Actions: Review Story button, Chat link

### Missing from TicketSidebar that should be added

| Feature | TicketSidebar | SidePanel | Action |
|---------|:---:|:---:|--------|
| Business Value | Yes | No | Add next to Story Points |
| Sprint selector | Yes | No | Add (read-only or editable) |
| Reporter | Yes | No | Add below assignee |
| Labels | Yes | No | Add (read-only or via LabelPicker) |
| Timestamps (created/updated) | Yes | No | Add with relative dates |
| Readiness progress bar | Yes | No | Add visual completeness indicator |
| DevPanel (branches, PRs, builds) | Yes | No | Add as collapsible footer section |
| Confluence pages | Yes | No | Add as collapsible footer section |
| Parent ticket link | Yes | No | Add for subtasks |

### Design Goals

1. **Reuse existing components** from `src/components/ticket-detail/` and `src/components/shared/` instead of building new ones
2. **Organized sections** with clear visual hierarchy (metadata grid at top, description in middle, PO data + dev info at bottom)
3. **Collapsible sections** for DevPanel and Confluence Pages so the panel doesn't become overwhelming
4. **Consistent styling** with TicketSidebar for visual coherence across the app

### Reusable Components

These components from TicketSidebar can be directly reused in SidePanel:

| Component | Path | Notes |
|-----------|------|-------|
| `DevPanel` | `src/components/ticket-detail/DevPanel.tsx` | Branches, PRs, builds |
| `ConfluencePagesSection` | `src/components/ticket-detail/ConfluencePagesSection.tsx` | Linked pages |
| `CompactField` | `src/components/ticket-detail/TicketSidebar.tsx` | Label-value pair wrapper |
| `BusinessValuePicker` | `src/components/shared/BusinessValuePicker.tsx` | BV selector |
| `LabelPicker` | `src/components/shared/LabelPicker.tsx` | Label management |
| `SprintPicker` | `src/components/shared/SprintPicker.tsx` | Sprint selector |
| `ReadinessCell` | Already used in SidePanel | Readiness dropdown |

### Proposed Layout

```
+------------------------------------------+
| [icon] VPL-24856  [checkbox] [...actions] |
| ---------------------------------------- |
| QS: 7/10                                 |
| ---------------------------------------- |
|                                          |
| Add giftcard transactions as separate    |
| payments in Shiji Billing                |
|                                          |
| [DONE]  [3 pts]  [BV: 5]                |
|                                          |
| ---- Metadata Grid ----                  |
| Assignee    David Kingma                 |
| Reporter    Jane Doe                     |
| Sprint      Sprint 42                    |
| Epic        Payments                     |
| Parent      VPL-24800 (if subtask)       |
| Labels      [billing] [shiji]            |
| Created     3 days ago                   |
| Updated     1 hour ago                   |
|                                          |
| ---- Description ----                    |
| (rendered markdown, scrollable)          |
|                                          |
| ---- PO Metadata ----                    |
| Readiness   [====75%====]               |
|             [dropdown: Ready]            |
| Quality     [7/10 badge]                |
| Notes       [textarea]                   |
|                                          |
| ---- Development (collapsible) ----      |
| > 2 branches, 1 PR, 3 builds            |
|                                          |
| ---- Confluence (collapsible) ----       |
| > 1 linked page                          |
|                                          |
| [Review Story] [Chat about ticket]       |
+------------------------------------------+
```

## Implementation Plan

### Key Architectural Decision
The existing `useTicketDetail(ticket.key)` call inside `TicketDescription` already fetches `Ticket & TicketDetail`. Currently only `detail?.description` is used. We lift this hook to the main `SidePanel` body so reporter, parent, labels, and timestamps are all available without additional network calls.

For Phase 3, two additional hooks are introduced: `useDevInfo(ticket.key)` and `ConfluencePagesSection`'s internal `useTicketConfluenceLinks`. Both have 60s deduplication so they are lightweight.

### Implementation Order
1. **Phase 1.1** Lift `useTicketDetail` to SidePanel body, add `DetailRow` helper
2. **Phase 1.2** Add BV badge, Reporter, Sprint, Parent, Labels, Timestamps (all read-only)
3. **Phase 2** Completeness bar, interactive Quality Score, reorganized PO section
4. **Phase 3** DevPanel + ConfluencePagesSection as collapsible footer
5. **Phase 4** Layout polish, section headings, scroll behavior, verification

### Design Decisions
- BV, Sprint, Reporter, Labels, Timestamps are **read-only** in the side panel (quick view context)
- Quality Score links to full ticket detail page review section
- Footer sections (Dev, Confluence) are collapsible and manage their own state
- Reuses `DetailRow` pattern from TicketSidebar for consistent styling

## Checklist

### Phase 1: Metadata enrichment
- [x] Add Business Value badge next to Story Points in the status row
- [x] Add Reporter row below Assignee (avatar + name, read-only)
- [x] Add Sprint display (read-only badge, or SprintPicker if editable)
- [x] Add Parent ticket link for subtasks
- [x] Add Labels display (read-only tags, or LabelPicker if editable)
- [x] Add Created/Updated timestamps with relative dates and absolute date tooltips

### Phase 2: PO Metadata improvements
- [x] Add readiness progress bar (reuse completeness logic from TicketSidebar)
- [x] Make Quality Score interactive (link to review section or trigger review)
- [x] Reorganize PO Metadata section with clearer visual structure

### Phase 3: Footer sections
- [x] Integrate `DevPanel` as a collapsible section at the bottom
- [x] Integrate `ConfluencePagesSection` as a collapsible section at the bottom
- [x] Ensure collapsible sections remember their expanded/collapsed state

### Phase 4: Layout and polish
- [x] Restructure the panel into clearly defined sections (header, metadata grid, description, PO data, footer)
- [x] Add section dividers/headings consistent with TicketSidebar styling
- [x] Ensure proper scroll behavior (sticky header, scrollable content area)
- [x] Verify all pickers and interactive elements work correctly within the panel
- [x] Test with various ticket types (stories, bugs, subtasks, epics)
- [x] Verify responsive behavior at different panel widths
