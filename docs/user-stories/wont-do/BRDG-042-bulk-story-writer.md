# BRDG-042: Bulk Story Writer

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want to select multiple backlog tickets and trigger a batch story-writing session so the AI drafts all selected stories sequentially, allowing me to prepare an entire sprint in one session.

## Acceptance Criteria

### Phase 1: Multi-select on Sprint Board
- [ ] Checkbox column on Sprint Board table (reuse existing bulk action infrastructure)
- [ ] "Write Stories" button in bulk action bar (visible when 2+ tickets selected)
- [ ] Confirmation modal showing selected tickets with option to deselect individual ones

### Phase 2: Batch session
- [ ] Create a batch story writer session that queues selected tickets
- [ ] Process tickets one at a time (sequential, not parallel) to avoid workspace overload
- [ ] Progress indicator: "Writing story 3 of 8" with current ticket key
- [ ] Each ticket uses the standard story writer skill (`write-story-draft` or per-type if BRDG-033 is done)

### Phase 3: Review queue
- [ ] After all drafts are generated, show a review screen
- [ ] List all tickets with their draft status: completed / failed / skipped
- [ ] Click to expand and review each draft inline
- [ ] "Apply" / "Edit" / "Discard" actions per draft
- [ ] "Apply All" bulk action for reviewed drafts

### Phase 4: Session persistence
- [ ] Batch session survives page reload (stored in DB)
- [ ] Resume interrupted batch from where it left off
- [ ] Cancel batch (stops processing remaining tickets)

## Technical Notes

- Batch session is a wrapper around individual story writer sessions
- Queue processing via a simple loop with status tracking per ticket
- Failed drafts don't block the batch; log the error and continue to next
- Rate limit: max 15 tickets per batch to prevent excessive workspace load

## Out of Scope (for now)
- Parallel story writing (multiple workspace tasks at once)
- Custom prompts per ticket in the batch
- Batch scheduling (run overnight)
- Comparison mode (before/after for all stories)
