# BRDG-005: Sprint Board Improvements & Bug Fixes

**Status:** Complete
**Priority:** Medium

## Description

Collection of improvements, bug fixes, and polish items identified during the initial sprint board build (BRDG-002/003/004).

## Issues Found During Verification

### Functional Issues

1. **Bulk action buttons are inert**: (FIXED) Bulk actions now wired: Set PO Status opens dropdown, Refresh from Jira calls sync endpoint, Review Story shows toast notification.

2. **Ticket detail shows "No description available" for most tickets**: (FIXED) Added mock detail data for 5 additional tickets (VPL-29223, VPL-43237, VPL-33796, VPL-43001, VPL-43900).

3. **All tickets share the same mock versions in History tab**: (FIXED) Created per-ticket version mapping (MOCK_VERSIONS_BY_TICKET). Tickets without versions show "No version history yet".

4. **"View changes" link only appears for qualityStale tickets**: (FIXED) "View changes" link now shows for all tickets with versions > 1 (via hasVersions check). The prominent orange "Story changed" indicator remains only for qualityStale tickets.

5. **Side panel checkbox click vs row click conflict**: (FIXED) Entire checkbox td is now the click target with stopPropagation. No more overlap with row click.

### Visual / Polish Issues

6. **Flagged row red border not visible**: (FIXED) Border width increased to 4px, background tint increased to 0.06 opacity, hover state uses 0.08 for flagged rows.

7. **PO Status dropdown in side panel shows icon only**: (FIXED) Side panel now shows full status name next to icon via showLabel prop. Table keeps icon-only for compact display.

8. **Sort dropdown not tested in detail**: (FIXED) Sort dropdown now shows: active field name in the button, asc/desc arrow indicator, highlighted border when non-default sort is active, active dot on selected option, and a "Reset to default" option.

9. **No loading state for History tab**: (FIXED) Added loading skeleton with 3 animated placeholder rows while version data loads from the API.

10. **Details rail does not extend full height**: On tickets with short content, the right details rail stops at the content height instead of running the full page height. Should use `min-h-full` or similar to always fill the viewport. (FIXED)

11. **Breadcrumbs are not clickable**: "Sprint Board" and "BT: 134" in the breadcrumb are plain text. "Sprint Board" should link to `/sprint-board`, "BT: 134" should link to `/sprint-board` with that sprint selected. (FIXED)

## Improvements

1. **Wire bulk actions to API endpoints**: Create bulk-update endpoints for PO status and Jira refresh. Wire the button handlers to call these endpoints.

2. **Per-ticket story versions**: Replace MOCK_VERSIONS with API-driven versions fetched per ticket from the story_version table.

3. **Two-version selector in History tab**: The BRDG-004 spec mentions comparing any two versions via checkboxes or dropdowns. Currently only sequential comparison is supported. Add arbitrary version comparison.

5. **Keyboard navigation**: (FIXED) Added keyboard shortcuts: Up/Down arrow to navigate between tickets (with focus outline), Enter to open/close side panel for focused ticket, Escape to close side panel. Only active when the table container has focus.

6. **Empty states**: (FIXED) Added empty state messages for: no attachments ("No attachments"), no subtasks ("No subtasks"), no linked issues ("No linked items"), no comments ("No comments yet"), and empty sprint ("No tickets in this sprint").

7. **Persist view preferences in localStorage**: Sorting, filtering, and column visibility settings are now saved in localStorage and restored on page reload.

## Polish Items

1. Show the "View changes" link for all tickets with versions > 1 (not just stale) - (FIXED) Already implemented via hasVersions check in SidePanel.
2. Add loading skeleton for ticket detail page - (FIXED) Added Next.js loading.tsx for route-level loading skeleton.
3. Add loading skeleton for History tab data - (FIXED) Added animated skeleton in HistorySection while data loads.
4. Improve checkbox hover target size in sprint board table - (FIXED) Whole td is click target with stopPropagation. Verified.
5. Add subtle row highlight for the currently selected ticket in the table - (FIXED) Selected row now has stronger bg opacity (12%) and a left brand-colored border.
6. Consider showing version count badge on the History tab even when not selected - (FIXED) Badge already shows on both active and inactive tab states. Updated to use dynamic count from API.
7. PO Status full name tooltip on hover in sprint board table - (FIXED) The title attribute is already set on the POStatusCell button showing the status name.

## Dependencies

- BRDG-002 Sprint Board (bulk action infrastructure)
- BRDG-003 Ticket Detail View (empty states, loading)
- BRDG-004 Story Diff (arbitrary version comparison)
- valk-agent REST API (for review-story trigger)
