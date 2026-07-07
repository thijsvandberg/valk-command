# BRDG-501: "Refine now" button on the ticket single view

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, I want a "Refine now" button on a ticket's single view (side panel / full ticket page) so I can jump straight into refining just that one ticket, without first creating or picking a refinement session.

## Problem

Refinement today is session-based only: the PO adds one or more tickets to a `RefinementSession` via "Add to refinement" (`SidePanel.tsx`, `ticket-action-menu.tsx`), then works through them in the fullscreen session route (`/refinement/[sessionId]/session/[ticketKey]`). There is no path to refine a single ticket directly from its own detail view - the session detour is required even for a one-off ticket.

## In Scope

- A "Refine now" button on the ticket single view, next to (or replacing, for eligible tickets) the existing "Add to refinement" action
- Same eligibility as today's `refineEligible` check (not removed from Jira, not Done/Deprecated, not already in a session)
- Clicking it takes the PO straight into fullscreen refinement mode for that one ticket

## Out of Scope

- Changing or removing the existing multi-ticket session flow
- Bulk "refine now" for multiple selected tickets

## Open Questions

- Mechanism: auto-create a single-ticket session behind the scenes and route into the existing fullscreen session page, or a new lightweight route that refines a ticket outside the session model entirely? Needs a decision before implementation.

## Acceptance Criteria

- [ ] A "Refine now" button is visible on the ticket single view for refine-eligible tickets
- [ ] Clicking it starts refinement for that ticket only, landing the PO in fullscreen refinement mode
- [ ] Tickets not eligible for refinement (removed from Jira, Done/Deprecated, already in a session) do not show the button
- [ ] Existing multi-ticket "Add to refinement" flow is unaffected
