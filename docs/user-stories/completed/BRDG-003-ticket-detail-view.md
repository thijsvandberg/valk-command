# VC-003: Ticket Detail View

**Status:** In Progress
**Priority:** High

## Description

As a PO, I want a full ticket detail view that shows all Jira ticket information enriched with PO metadata, so I can review and manage tickets without switching to Jira.

## Access Points

- **Side panel**: click on a row in the sprint board opens a compact side panel (already exists)
- **Full page**: own route at `/tickets/[key]`, opens as a full page without sprint board context
- **Open in new tab**: button in the side panel to open the full page view in a new browser tab
- **Link from Jira key**: clicking the ticket key in the sprint board table opens the full page

## Side Panel

The existing side panel (from VC-002) serves as a quick preview. It shows:
- Ticket header (type icon, key, title)
- Status badges (Jira status, epic, points)
- Assignee
- PO metadata editing (PO status, quality score, notes)
- Open in Jira (external link)
- Open full view (new tab)

### Resizable Side Panel
- Default width: 45% of screen
- Drag handle on the left edge to resize
- Width persisted in localStorage
- Full width toggle button: expands panel to fill available space (minus sidebar), click again to restore

## Full Page View (`/tickets/[key]`)

Two-column layout, similar to Jira's single ticket view.

### Left Column (main content, scrollable)

#### Header
- Breadcrumb: Sprint Board / [Sprint Name] / [Ticket Key]
- Ticket title (large, editable)
- Status badge + type icon + priority
- Flagged indicator if applicable

#### Description
- Rich text rendering (same formatting as Jira: headings, bold, italic, lists, inline images, code blocks)
- Locally editable, changes stored in DB
- If local version differs from Jira: show "Locally modified" badge
- Push to Jira button (future, when write access is available)
- If Jira version is newer than local (detected on sync): show "Jira updated" indicator

#### Attachments
- Thumbnail grid with filename + date
- Downloaded from Jira on sync, stored locally with download timestamp
- Automatically cleaned up after 2 months (local files only, metadata retained)
- Cleaned attachments show as empty placeholders (filename + date visible, no thumbnail)
- Re-download via sync button

#### Subtasks
- Mini table: type icon, key, title, status, assignee
- Clickable keys link to their own detail view

#### Linked Work Items
- Grouped by relation type ("is blocked by", "relates to", "blocks")
- Each item: type icon, key, title, status badge, assignee
- Clickable keys link to their own detail view

#### Activity Section
- **PO Comments** (top, separate block)
  - Locally stored, never pushed to Jira
  - Add comment input
  - Threaded display with timestamp + author
- **Jira Comments** (below, separate block)
  - Fetched from Jira on sync, stored in DB
  - Read-only display
  - Author avatar, name, timestamp, content

### Right Column (details rail, sticky)

#### Jira Details
- Story point estimate
- Assignee (avatar + name)
- Reporter (avatar + name)
- Labels
- Sprint
- Epic
- Priority
- Components
- Fix version(s)
- Created date
- Updated date

#### PO Metadata
- PO Status (dropdown, editable)
- Quality Score (0-100, with stale indicator)
- PO Notes (textarea, editable)

## Story Version Tracking

- On each Jira sync: compare ticket description/AC with stored version
- If changed: store new version in `story_version` table with content hash
- Quality score is tied to a specific story version
- If story changed since last review: show score as stale (subtle indicator)

### History View

Accessible from the full page ticket view via a "History" tab or button.

**Important limitation**: Jira REST API does not expose previous versions of the description field. The changelog endpoint shows that a field changed (with timestamp and author) but not the full old value. Therefore:
- We track versions ourselves: every sync that detects a description/AC change stores a new version
- History starts from our first sync of that ticket; anything before is unknown
- First stored version shows as "Initial (first sync)" without a diff

**Display:**
- List of versions, newest first
- Each entry: version number, date, source (Jira sync / local edit)
- Click on a version to see the full content
- Diff view between any two versions: side-by-side or inline diff, per-line changes highlighted
- Current version highlighted at the top
- If quality score was recorded for a version, show it next to that version entry

## Editing Behavior

- **Title**: editable, stored locally in DB
- **Description**: editable, stored locally in DB
- **PO metadata**: editable (PO status, quality score, notes)
- **All other Jira fields**: read-only
- When local title/description differs from Jira version:
  - Show "Locally modified" badge on the field
  - Show "Push to Jira" button (disabled/greyed out until write access is built)
- When Jira version is newer (detected on next sync):
  - Show "Jira updated" indicator
  - Conflict resolution: future scope, not part of this story

## Database Requirements

Uses existing tables from VC-002:
- `ticket` - cached Jira data
- `ticket_metadata` - PO metadata
- `story_version` - description version tracking

New tables needed:
- `po_comment` - local PO comments (ticketKey, author, content, createdAt)
- `jira_comment` - cached Jira comments (ticketKey, jiraCommentId, author, authorAvatar, content, createdAt)
- `ticket_attachment` - attachment metadata (ticketKey, jiraAttachmentId, filename, mimeType, downloadedAt, localPath, cleanedAt)
- `ticket_local_edit` - local edits to title/description (ticketKey, field, localValue, baseJiraVersion, modifiedAt)

## Implementation Phases

### Phase 1: Full Page Route + Layout
- [x] Create `/tickets/[key]` route
- [x] Two-column layout (main content + details rail)
- [x] Header with breadcrumb, title, status badges
- [x] Details rail with all Jira fields (mock data)
- [x] PO metadata section in rail (wired to existing API)
- [x] Open in new tab button in sprint board side panel
- [x] Resizable side panel (drag handle + localStorage persistence)
- [x] Full width toggle button on side panel

### Phase 2: Content Sections
- [x] Description rendering (rich text, mock content)
- [x] Attachments section (mock thumbnails)
- [x] Subtasks section (mock data, clickable links)
- [x] Linked work items section (mock data, grouped by relation)

### Phase 3: Comments
- [x] PO comments (local, CRUD via API)
- [x] Jira comments display (mock data)
- [x] DB tables for po_comment and jira_comment
- [x] API endpoints for PO comments

### Phase 4: Local Editing
- [x] Title inline editing
- [x] Description editing
- [x] DB table for ticket_local_edit
- [x] "Locally modified" badge
- [x] "Push to Jira" button (disabled, placeholder for future)

### Phase 5: Attachment Management
- [x] DB table for ticket_attachment
- [x] Download tracking with timestamps
- [x] Auto-cleanup after 2 months
- [x] Empty placeholder display for cleaned attachments
- [x] Re-download via sync

### Phase 6: Story Version History & Diff
- [x] History tab/button in full page view
- [x] Version list (newest first, date, source)
- [x] Full content view per version
- [x] Unified diff view (per-word highlighting, full description including AC)
- [x] Quality score indicator per version
- [x] "Initial (first sync)" label for first stored version
- [x] "View changes" link in side panel (opens diff inline in the panel)
- [x] Prominent "Story changed" indicator when quality score is stale
- [x] Navigate between versions (previous/next) within the diff view
- [x] Back button to return to normal side panel content

## Technical Notes

- Full page view and side panel share component logic where possible
- Description rich text: parse Jira ADF (Atlassian Document Format) for rendering
- Attachments stored in a local directory (e.g., `.data/attachments/[key]/`)
- Local edits tracked per-field to allow granular conflict detection later

## Dependencies

- VC-002 Sprint Board (side panel, API endpoints, DB schema)
- Jira REST API access (Phase 3+ for real data)
