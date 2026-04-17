# BRDG-120: Sprint Comparison Dashboard

**Status:** Open
**Priority:** Low

## Description

The stakeholder view has a basic sprint comparison mode (BRDG-096, done) but it is limited to side-by-side ticket lists for stakeholders. The PO needs a deeper analytics view comparing sprints across multiple dimensions.

### Proposed features

- Side-by-side metric comparison for any two sprints
- Metrics: velocity (points delivered), story count, quality score average, carry-over count, completion rate
- Quality score trend chart across last N sprints
- Story completion rate evolution
- Story writer usage correlation with quality scores
- Sprint goal achievement tracking

### Data sources

- Velocity data from `/api/velocity` (exists)
- Quality scores from `ticketMetadata` (exists)
- Carry-over detection from stakeholder data (exists, BRDG-093)
- Story writer session counts from `storyWriterSession` table (exists)

### Related stories

- BRDG-096 (Stakeholder Sprint Comparison, done)
- BRDG-043 (Sprint Retrospective Report, open)

## Acceptance Criteria

- [ ] Select any two sprints for comparison
- [ ] Show key metrics side-by-side (velocity, quality, completion, carry-over)
- [ ] Quality score trend chart across historical sprints
- [ ] Story writer usage statistics per sprint
- [ ] Sprint goal display and achievement status
- [ ] Exportable as markdown or image for retrospectives
