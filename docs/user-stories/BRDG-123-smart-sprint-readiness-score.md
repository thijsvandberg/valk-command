# BRDG-123: Smart Sprint Readiness Score

**Status:** Open
**Priority:** Medium

## Description

Per-ticket readiness checks exist in the ticket sidebar ([src/components/ticket-detail/TicketSidebar.tsx](../../src/components/ticket-detail/TicketSidebar.tsx), see the "Readiness" section around line 141), but there is no aggregated sprint-level readiness indicator. The PO has to open each ticket individually to assess overall sprint readiness.

### Proposed features

- **Sprint-level readiness score:** "This sprint is 72% ready for development"
- **Breakdown** showing which criteria drag the score down
- **Per-ticket readiness** in a sortable table (sorted by least-ready first)
- **Suggestions** on what to focus on before sprint start
- Could be a dashboard widget (ties into BRDG-037) or a sprint board header section

### Readiness criteria (already partially implemented per-ticket)

- Has description (not empty)
- Has acceptance criteria
- Has story points estimated
- Has assignee
- PO status is "Ready" or "Ready for Refinement"
- Story review score above threshold
- No unresolved blockers (blocked-by links with status != Done)

### Data sources

- `ticket` table (description, acceptanceCriteria, storyPoints, assignee)
- `ticketMetadata` (poStatus, qualityScore)
- `storedReview` (latest review scores)
- `ticketLink` (blocker detection)

### Related stories

- BRDG-037 (Dashboard Widgets) - readiness score could be a dashboard widget
- BRDG-041 (Proactive Alerts, open) - could trigger alerts when readiness drops below threshold

## Acceptance Criteria

- [ ] Sprint-level readiness percentage calculated from per-ticket readiness
- [ ] Visual readiness bar in sprint board header or dashboard widget
- [ ] Drill-down table showing per-ticket readiness with failing criteria highlighted
- [ ] Sorted by least-ready tickets first
- [ ] Actionable suggestions (e.g., "5 tickets missing story points", "3 tickets have no assignee")
- [ ] Updates in real-time as tickets are modified

## Impact

Gives the PO a single glance view of sprint readiness instead of clicking through individual tickets. Surfaces the most impactful improvements to make before sprint start, reducing the chance of pulling in under-specified work.
