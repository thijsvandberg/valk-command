# BRDG-040: Stakeholder View

**Status:** Completed
**Priority:** Medium

## Description

As the PO, I want a clean, presentation-style view of sprint progress that filters out internal PO metadata, so I can review the status myself and then share it with stakeholders (via copy or screenshot) without giving them access to the app.

## Implementation Plan

1. **Fix middleware** (`src/middleware.ts`): Remove the `/stakeholder` bypass so normal JWT auth applies.
2. **Create nested layout** (`src/app/(app)/stakeholder/layout.tsx`): Full-viewport overlay (`fixed inset-0 z-50`) that visually covers the sidebar and app chrome. `SWRProvider` from parent remains available.
3. **Create data transformation layer** (`src/lib/stakeholder-data.ts`): `StakeholderTicket` type (strips PO fields), `toStakeholderTickets()`, `buildMarkdownSummary()`. Fully unit-testable.
4. **Create components** under `src/components/stakeholder/`: `SprintOverviewCard`, `TicketGroup`, `ProgressBar`, `UpcomingSection`, `CopyMarkdownButton`.
5. **Rewrite page** (`src/app/(app)/stakeholder/page.tsx`): Client component, uses `useJiraSprints()` + direct `useSWR` with `refreshInterval: 300_000`. Sprint selector defaults to active sprint. Passes data through transformation layer.
6. **Update tests** (`src/app/(app)/stakeholder/page.test.tsx`): Mock SWR, test PO fields absent, test copy button, test human-readable labels.

**Notes:**
- Sprint goal not available in current Jira data model; skip and display conditionally if present.
- "Next sprint" = first sprint with `state === "future"` after the selected sprint.
- The `sprintId` param in `useTickets` matches `ticket.sprintName` (stored as the Jira numeric ID as a string).
- Jira keys hidden everywhere in main sections; toggle only in Upcoming section.

## Acceptance Criteria

### Phase 1: Stakeholder page

- [x] New page at `/stakeholder` with its own layout: no sidebar, no chat, no action buttons
- [x] Accessible from the main nav (visible only to the authenticated user)
- [x] Sprint selector with current sprint as default
- [x] "Last updated" timestamp shown in the footer

### Phase 2: Sprint overview section

- [x] Sprint name, goal (if set), dates, and days remaining
- [x] Progress bar: story points completed vs. total
- [x] Done tickets listed with title and epic grouping
- [x] In-progress tickets listed with assignee
- [x] Human-readable status labels ("Completed", "In Progress", "To Do")
- [x] No internal fields visible: no quality scores, no PO notes, no Jira keys

### Phase 3: Upcoming section

- [x] Next sprint's planned tickets (if available in Jira)
- [x] Grouped by epic
- [x] Jira keys hidden by default; optional "Show details" toggle reveals them

### Phase 4: Sharing

- [x] "Copy as Markdown" button that copies the sprint summary to clipboard as structured markdown
- [x] The copy output excludes the copy button itself

### Phase 5: Polish

- [x] Auto-refresh every 5 minutes while the page is open
- [x] Mobile-responsive layout

## Technical Notes

- Separate Next.js layout for `/stakeholder` route (no app chrome, no nav)
- The route is still behind app authentication - stakeholders never access this URL directly
- Filter out all PO-internal fields at the data layer before passing to the view
- Markdown copy builds a structured string from the same data shape used to render the page

## Out of Scope

- Token-based or public URL access for external stakeholders
- Multiple stakeholder views with different permissions
- Email digest or scheduled delivery
- Comment or feedback functionality from stakeholders
