# BRDG-008: Sprint Board Next Steps

**Status:** In Progress
**Priority:** Medium

## Description

Follow-up improvements and new features for the sprint board, ticket detail view, and story diff after the initial build (BRDG-002 through BRDG-007).

## Real Data Integration

### Jira Connection
- [ ] Configure real Jira credentials (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
- [ ] Test sprint sync with real Jira board
- [ ] Test ticket sync with real sprint data
- [ ] Map Jira ADF (Atlassian Document Format) to our markdown renderer
- [ ] Handle Jira custom fields (Impact, custom statuses)
- [ ] Webhook receiver for real-time Jira updates (issue.updated, sprint.changed)

### Data Quality
- [ ] Replace remaining mock data with API-driven data throughout
- [ ] Per-ticket version history from actual Jira syncs (not mock versions)
- [ ] Real attachment downloads and thumbnail generation
- [ ] Real Jira comments sync
- [ ] Story version detection with actual content hash comparison

## Sprint Board Enhancements

### Drag-and-Drop
- [x] Drag tickets to reorder (PO priority, independent from Jira rank)
- [x] PO priority stored locally, persisted in DB
- [x] Visual drag handle on row hover

### Sprint Analytics
- [ ] Burndown/burnup mini chart in sprint header
- [ ] Velocity comparison with previous sprints
- [x] Story points distribution by status (visual bar)
- [x] Story points by assignee breakdown

### Sprint Transitions
- [ ] "Start sprint" / "Complete sprint" actions (when Jira write access available)
- [ ] Sprint planning mode: drag tickets between sprints
- [ ] Sprint retrospective summary view

### Multi-Sprint View
- [x] Compare two sprints side-by-side
- [x] Cross-sprint ticket search
- [ ] Ticket movement tracking between sprints

## Ticket Detail Enhancements

### Real-Time Collaboration
- [ ] WebSocket updates when ticket changes in Jira
- [ ] Optimistic UI updates for PO metadata changes
- [ ] Conflict detection when local edit collides with Jira update

### Jira Write Access
- [ ] Push local title/description edits to Jira
- [ ] Change ticket status from the detail view
- [ ] Assign/unassign from the detail view
- [ ] Add Jira comments from the app
- [ ] Move ticket between sprints

### Review Workflow
- [x] Structured review form (quality dimensions: clarity, testability, completeness, technical feasibility)
- [x] Review score auto-calculated from dimensions
- [x] Review history with reviewer and score per dimension
- [x] "Ready for refinement" checklist (auto-sets PO status when complete)
- [ ] Batch review mode: review multiple stories in sequence

### Refinement Integration
- [ ] Link to refinement view with pre-loaded stories
- [x] Team estimation capture (story points from team members)
- [ ] Refinement notes per ticket

## Diff & History Enhancements

### Advanced Diff
- [x] Side-by-side diff mode toggle (in addition to unified)
- [ ] Syntax-aware diff for structured content (lists, headings keep structure)
- [x] Export diff as PDF or markdown for sharing
- [ ] Diff annotations: PO can comment on specific changes

### Version Management
- [x] Manual version snapshot: save current state as named version
- [x] Version tagging: "pre-refinement", "post-refinement", "final"
- [ ] Restore to previous version (local, with option to push to Jira later)

## Agent Integration

### Review Story via Agent
- [x] Wire "Review Story" button to valk-agent workspace
- [x] Agent analyzes story quality (clarity, testability, completeness)
- [x] Agent returns structured review with score per dimension
- [x] Results stored in ticket metadata and displayed in side panel

### Chat Context
- [x] "Chat about this ticket" opens chat with ticket context pre-loaded
- [ ] Agent has access to ticket description, history, PO notes, comments
- [ ] Chat responses can reference ticket fields
- [ ] Actions from chat: update PO status, add notes, trigger review

### Automated Insights
- [x] Sprint health dashboard: stale stories, unreviewed tickets, blocked items
- [ ] Daily digest: what changed in the sprint since yesterday
- [ ] Risk detection: tickets with low quality scores close to sprint end

## Technical Debt

### Performance
- [ ] Virtual scrolling for large sprints (50+ tickets)
- [x] Lazy-load ticket detail data (only fetch on open)
- [x] Cache API responses with SWR or React Query
- [x] Debounce filter/sort changes

### Testing
- [ ] Integration tests for full page flows (sprint board -> side panel -> detail view)
- [ ] E2e tests with Playwright
- [ ] Visual regression tests for key views

### Code Quality
- [x] Extract shared components (StatusBadge, Avatar, EpicLabel) into a component library
- [x] Move inline SVG icons to a shared icon set
- [x] Reduce SprintBoard.tsx file size (currently very large, split into subcomponents)
- [ ] Type-safe API layer with shared types between client and server

## Dependencies

- Jira REST API write access (for push features)
- valk-agent workspace (for review and chat integration)
- WebSocket infrastructure (for real-time updates)
