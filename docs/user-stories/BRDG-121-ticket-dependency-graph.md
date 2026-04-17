# BRDG-121: Ticket Dependencies Graph

**Status:** Open
**Priority:** Low

## Description

Jira ticket links contain dependency info (blocks/is-blocked-by, relates-to) which is already synced to the ticketLink table, but this data is only shown as a flat list in the ticket detail sidebar. During refinement and sprint planning, understanding the dependency chain is critical for sequencing work.

### Proposed features

- Visual dependency graph showing tickets as nodes and links as edges
- Scope: single sprint, single epic, or custom selection
- Highlight critical path (longest chain of blocking dependencies)
- Color-code by status (blocked = red, in progress = blue, done = green)
- Click a node to open ticket detail
- Show blocked tickets that cannot start until dependencies are resolved

### Data sources

- `ticketLink` table (already synced from Jira, contains `linkType` and `targetKey`)
- `ticket` table (status, assignee, story points)

### Technical approach

- Use a lightweight graph library (e.g., dagre for layout, React for rendering)
- Could be a tab on the sprint board or a section in the refinement view

### Related

- BRDG-038 (Refinement Agenda, open) could use this for sequencing discussion

## Acceptance Criteria

- [ ] Graph visualization of ticket dependencies within a sprint
- [ ] Nodes show ticket key, title snippet, status color
- [ ] Edges show link type (blocks, is-blocked-by, relates-to)
- [ ] Critical path highlighted
- [ ] Blocked tickets visually distinct
- [ ] Click node to navigate to ticket detail
- [ ] Works for sprints with 30+ tickets without performance issues

## Impact

Surfaces existing dependency data as a visual graph, making it easier to sequence work during refinement and sprint planning. Enables the PO to quickly identify blocked tickets and the critical path through a sprint without manually tracing link chains in Jira.
