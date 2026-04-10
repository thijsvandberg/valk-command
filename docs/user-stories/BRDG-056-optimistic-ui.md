# BRDG-056: Optimistic UI Updates

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want optimistic updates on Sprint Board actions (status change, metadata edit, bulk operations) so the UI responds instantly while the API call happens in the background.

## Acceptance Criteria

### Phase 1: SWR optimistic mutations
- [ ] Implement optimistic update pattern in SWR mutations for ticket metadata changes
- [ ] On metadata edit: immediately update the local SWR cache, then send API request
- [ ] On success: keep the optimistic value (already showing correct data)
- [ ] On error: revert to previous value and show error toast

### Phase 2: Sprint Board optimistic updates
- [ ] PO status change: instant visual update
- [ ] Quality score override: instant update
- [ ] Notes edit: instant update
- [ ] Bulk PO status change: all selected tickets update instantly

### Phase 3: Error handling
- [ ] Toast notification on revert: "Failed to update VALK-42. Change reverted."
- [ ] Retry button in the toast
- [ ] Track pending mutations visually (subtle loading indicator on cells with in-flight changes)

### Phase 4: Conversation actions
- [ ] Optimistic message sending in Chat (show message immediately, confirm after API response)
- [ ] Optimistic conversation creation
- [ ] Optimistic comment posting on ticket detail

## Technical Notes

- SWR `mutate` with `optimisticData` parameter handles this natively
- Key pattern: `mutate(key, updateFn, { optimisticData, rollbackOnError: true })`
- Ensure cache keys match between list and detail views for consistent updates
- Queue mutations to prevent race conditions on rapid edits

## Out of Scope (for now)
- Offline queue (save mutations for later when offline)
- Conflict resolution for concurrent edits
- Optimistic Jira push operations
- Undo stack for optimistic changes
