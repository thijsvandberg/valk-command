# VC-002 Remaining Items Investigation - 2026-03-31

## Summary

All Phase 1, 2, and 3 items are completed and checked off. Only Phase 4 has open items.

## Open Items (Phase 4)

### 1. Bulk actions wired to backend
**Status:** Not done
- The `BulkActionBar` component exists with three buttons: "Set PO Status", "Refresh from Jira", "Review Story"
- None of these buttons have `onClick` handlers (only the "Clear" button does)
- No bulk API endpoints exist under `/api/tickets/`
- The existing ticket API routes are single-ticket only: `GET/POST /api/tickets`, `GET/PUT/DELETE /api/tickets/[key]`, `PUT /api/tickets/[key]/metadata`
- Work needed: create bulk endpoints (e.g., `POST /api/tickets/bulk/status`, `POST /api/tickets/bulk/refresh`) and wire up the buttons

### 2. Review-story trigger from board
**Status:** Not done
- "Review Story" button exists in the bulk action bar but has no handler
- No review-story API endpoint or agent integration exists
- This depends on agent/workspace integration (valk-agent REST API)
- Work needed: implement agent communication for review-story and wire button

### 3. Story history diff view (separate ticket)
**Status:** Not applicable (VC-004)
- This item is explicitly marked as a "separate ticket" in VC-002
- VC-004 (Story Diff View) exists and covers this feature
- The backend infrastructure is ready: `story_version` table exists, version detection works during Jira sync
- No code changes needed in VC-002 scope

### 4. Chat integration from side panel
**Status:** Not done
- The side panel exists but has no "Start chat about ticket" functionality
- The chat page exists at `/chat` but there is no way to launch it with ticket context from the sprint board
- Work needed: add a button in the side panel that navigates to chat with ticket context pre-filled

## Conclusion

Items 1, 2, and 4 are genuinely not implemented. Item 3 is intentionally deferred to VC-004. No items need to be re-checked in the user story file; all checkboxes are accurate.
