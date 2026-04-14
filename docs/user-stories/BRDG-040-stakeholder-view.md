# BRDG-040: Stakeholder View

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a clean, presentation-style view of sprint progress that filters out internal PO metadata, so I can review the status myself and then share it with stakeholders (via copy or screenshot) without giving them access to the app.

## Acceptance Criteria

### Phase 1: Stakeholder page

- [ ] New page at `/stakeholder` with its own layout: no sidebar, no chat, no action buttons
- [ ] Accessible from the main nav (visible only to the authenticated user)
- [ ] Sprint selector with current sprint as default
- [ ] "Last updated" timestamp shown in the footer

### Phase 2: Sprint overview section

- [ ] Sprint name, goal (if set), dates, and days remaining
- [ ] Progress bar: story points completed vs. total
- [ ] Done tickets listed with title and epic grouping
- [ ] In-progress tickets listed with assignee
- [ ] Human-readable status labels ("Completed", "In Progress", "To Do")
- [ ] No internal fields visible: no quality scores, no PO notes, no Jira keys

### Phase 3: Upcoming section

- [ ] Next sprint's planned tickets (if available in Jira)
- [ ] Grouped by epic
- [ ] Jira keys hidden by default; optional "Show details" toggle reveals them

### Phase 4: Sharing

- [ ] "Copy as Markdown" button that copies the sprint summary to clipboard as structured markdown
- [ ] The copy output excludes the copy button itself

### Phase 5: Polish

- [ ] Auto-refresh every 5 minutes while the page is open
- [ ] Mobile-responsive layout

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
