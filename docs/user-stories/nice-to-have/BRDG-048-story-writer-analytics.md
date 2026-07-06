# BRDG-048: Story Writer Analytics

**Status:** Open
**Priority:** Low

## Description

As the PO, I want a dashboard showing Story Writer usage metrics (sessions, drafts, acceptance rate, time saved) so I can measure the ROI of AI-assisted refinement.

## Acceptance Criteria

### Phase 1: Data collection
- [ ] Track in `storyWriterSession`: session duration, draft count, final outcome (applied/discarded/abandoned)
- [ ] Add `appliedAt` timestamp to `storyWriterDraft` when a draft is applied
- [ ] Ensure all sessions have proper start/end timestamps

### Phase 2: Analytics API
- [ ] API route `GET /api/analytics/story-writer` with optional date range params
- [ ] Returns: total sessions, active sessions, drafts generated, drafts applied, average session duration
- [ ] Acceptance rate: applied / (applied + discarded) percentage
- [ ] Breakdown by ticket type (story, bug, task, spike)

### Phase 3: Analytics view
- [ ] Dashboard widget (for BRDG-037) or dedicated section in Settings > Story Writer
- [ ] Stat cards: sessions this sprint, drafts applied, acceptance rate
- [ ] Trend: sessions per week over last 8 weeks (simple bar or sparkline)
- [ ] Top improved stories: tickets where quality score increased most after story writer

## Technical Notes

- Most data already exists in `storyWriterSession` and `storyWriterDraft` tables
- May need to add `outcome` field to session table if not present
- Time saved estimate: average session duration vs estimated manual writing time (configurable baseline, e.g. 30 min per story)
- Keep analytics queries efficient; consider pre-aggregation if dataset grows

## Out of Scope (for now)
- A/B testing (with vs without story writer)
- Quality score correlation analysis
- Team-level analytics
- Export analytics data
