# Sprint Board Build Findings - 2026-03-31

## Final Status Overview

### VC-002: Sprint Board - Complete (all phases done)
- Phase 1 (Mock UI): all 14 items done
- Phase 2 (Data & API): all 4 items done
- Phase 3 (Jira Integration): all 6 items done
- Phase 4 (Polish): all items done (filter multi-select, sort, localStorage persistence, bulk actions, review-story trigger, chat integration)

### VC-003: Ticket Detail View - Complete (Phase 1-6 done)
- Phase 1 (Full Page Route + Layout): all items done
- Phase 2 (Content Sections): all items done
- Phase 3 (Comments): all items done
- Phase 4 (Local Editing): all items done
- Phase 5 (Attachment Management): all items done
- Phase 6 (Story Version History & Diff): all items done

### VC-004: Story Diff View - Complete (all phases done)
- Phase 1 (Diff Component): all items done
- Phase 2 (Side Panel Integration): all items done (API fetch with mock fallback)
- Phase 3 (Full Page Integration): all items done (two-version selector added)
- Phase 4 (Polish): all items done (edge cases, keyboard nav, scroll for long content)

## Verification Results (Browser Testing)

### What Works Well

**Sprint Board (VC-002)**
- Sprint tab switching between BT: 134, BT: 135, Sprint 135 Candidates
- Sprint selector dropdown: right-click opens, search box present, active sprints listed with dates and item counts, "Closed sprints" expandable section
- Filter bar: Status, Epic, Assignee, PO Status dropdowns all open, show checkboxes with correct options
- Sprint header: shows correct date range, item count, point total, status distribution
- Ticket table: all columns render (Type icons, Key, Title, Epic badges, Status badges, Points, Assignee avatars, PO Status icons, Quality scores, Notes icons)
- Checkbox: appears on hover, select-all works, bulk action bar appears with count
- Bulk action bar: shows "18 selected", "Set PO Status", "Refresh from Jira", "Review Story", "Clear"
- Column toggle: shows all 11 columns with checkboxes, Key/Title greyed out (always visible)
- Refresh button: present and clickable
- Sidebar: collapsed icon-only mode, sprint board uses full width
- Quality score: color coding works (red < 30, orange < 70, green >= 70), stale indicator (clock icon) visible

**Ticket Detail (VC-003)**
- Side panel: opens on row click, shows ticket header, status badges, assignee, PO metadata
- Side panel: resizable via drag handle (not explicitly tested but code present)
- Side panel: full width toggle button present with correct icon swap
- Side panel: "Open in new tab" link present
- Full page /tickets/VPL-44062: renders correctly with full two-column layout
- Breadcrumb navigation: Sprint Board > BT: 134 > VPL-44062
- Rich text rendering: headings, bold, bullet lists, ordered lists all render
- Attachments: thumbnail grid with PNG, JSON files and "Cleaned" placeholder
- Subtasks: mini table with clickable key links, status badges, assignee avatars
- Linked issues: grouped by relation type (IS BLOCKED BY, RELATES TO, BLOCKS)
- PO Comments: input field and comment area present
- Jira Comments: section present for tickets with comments
- Title click-to-edit: cursor indicates editability
- Description: edit button present, click-to-edit works
- Details rail: all fields shown (Points, Assignee, Reporter, Labels, Sprint, Epic, Priority, Components, Created, Updated)
- PO metadata in rail: PO Status dropdown, Quality score with stale indicator, Notes textarea

**Story Diff (VC-004)**
- Diff preview page renders at /sprint-board/diff-preview with Panel View / Raw Diff toggle
- Word-level diff: green background for additions, red strikethrough for deletions
- Side panel: "Story changed / View diff" orange indicator visible for stale tickets (VPL-44062)
- Side panel: "View changes (4 versions)" link visible at bottom of panel
- Side panel: clicking opens StoryDiffPanel inline, replaces normal content
- Side panel: Back button returns to normal view
- Prev/Next navigation works: cycles through version pairs (v3->v4, v2->v3, v1->v2)
- Full page: History tab shows version list (newest first) with metadata
- Full page: clicking a version shows diff with back button
- Version metadata: date, source badge (Jira sync / Local edit), quality score per version
- Initial version labeled correctly

### Issues Found

All 6 issues have been resolved. See "Fixed After Initial Verification" below.

### Fixed After Initial Verification

- Details rail now extends full page height (VC-005 #10)
- Breadcrumbs are now clickable links (VC-005 #11)
- View preferences (columns, sort, filters) persisted in localStorage
- **Bulk action buttons wired**: "Set PO Status" opens a dropdown that applies status to all checked tickets via the metadata API. "Refresh from Jira" calls sync-tickets endpoint with loading state. "Review Story" shows an auto-dismissing toast notification (placeholder until agent integration exists).
- **Mock detail data expanded**: Added MOCK_TICKET_DETAILS entries for VPL-29223, VPL-43237, VPL-33796, VPL-43001, and VPL-43900 with realistic descriptions, subtasks, linked issues, and comments.
- **Per-ticket version history**: Created MOCK_VERSIONS_BY_TICKET mapping with unique version histories for VPL-44062 (3 versions), VPL-33796 (3 versions), and VPL-43900 (2 versions). Tickets without versions show "No version history yet". Both SprintBoard side panel and ticket detail page look up versions by ticket key.
- **PO Status full name in side panel**: The side panel now shows the full status name next to the icon via a `showLabel` prop on POStatusCell. Table column retains icon-only display. Dropdown in both contexts shows icon + full name.
- **Checkbox click target fixed**: Entire checkbox td cell is the click target with stopPropagation. Checkbox input is read-only/pointer-events-none so only the td handles clicks. Click area is larger and no longer overlaps with row click.
- **Flagged row border visibility improved**: Border width increased from 3px to 4px. Background tint increased from 0.04 to 0.06 opacity. Hover state on flagged rows uses 0.08 opacity for consistent visibility.

### What Needs Attention Next

- Consider adding loading skeletons for when real data loads
- VC-006: Rich text editor (TipTap) for description editing - has a pre-existing build error in `RichEditor.tsx` (line 31, `editor.storage.markdown` type issue)
- Full VC-005 improvement list at `docs/user-stories/VC-005-improvements.md`
