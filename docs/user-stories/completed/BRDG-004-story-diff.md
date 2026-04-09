# BRDG-004: Story Diff View

**Status:** Complete
**Priority:** Medium

## Description

As a PO, I want to see a unified diff of story changes between versions, so I can quickly understand what changed in a ticket's description and acceptance criteria without manually comparing text.

## Context

Jira REST API does not provide previous versions of the description field. The changelog endpoint shows that a field changed (timestamp + author) but not the full old value. We track versions ourselves: every sync that detects a description change stores a new snapshot in the `story_version` table (from BRDG-002). History starts from our first sync; anything before is unknown.

The diff covers the entire Jira description field, which typically contains: user story, acceptance criteria, scenarios, design notes, and any other content the team puts there.

## Access Points

### Side Panel (sprint board)
- "View changes" link visible when multiple versions exist
- When quality score is stale (story changed since last review): prominent "Story changed - view diff" indicator
- Clicking opens the diff view inline in the side panel, replacing the normal content
- "Back" button returns to normal side panel view

### Full Page Ticket View (BRDG-003)
- History tab showing version list
- Click a version to see diff with previous version
- Select any two versions to compare

## Diff View Design

### Format
- **Unified diff** (single column, not side-by-side)
- **Per-word diffing**: highlights changed words within lines, not just whole lines
- Additions: green background highlight
- Deletions: red background with strikethrough
- Unchanged text: normal rendering, full context shown (stories are short enough)

### Layout (in side panel)
```
[Back]                              [< Prev] [Next >]

Version 4 -> Version 5
March 28, 2026 (Jira sync)
-------------------------------------------

User Story:
As a hotel owner, I want to show correct extra prices
to my guests even [though extra prices change] -> [when extra prices vary]
between dates, So that I can give my guests a correct
experience.

Acceptance Criteria:
1. Show "vanaf" label when prices differ
2. [The lowest price is shown] -> [The lowest adult price among days with available inventory is shown]
3. ...
```

### Layout (in full page view)
- Same diff rendering but wider
- Version selector: two dropdowns to pick any two versions
- Version metadata: date, source (Jira sync / local edit), quality score if recorded

### Version List
- Newest first
- Each entry shows: version number, date, source, quality score (if any)
- Current version highlighted
- "Initial (first sync)" label on first stored version
- Click to view diff with previous version
- Or select two versions via checkboxes to compare

## Technical Approach

### Diff Algorithm
- Use a word-level diff algorithm (e.g., `diff-match-patch` or `fast-diff` npm package)
- Split description into words, compute diff, render with highlighting
- Preserve paragraph structure and formatting during diff

### Rendering
- Parse the description (plain text or Jira ADF) into blocks (paragraphs, lists, headings)
- Apply word-level diff within each block
- Render with appropriate highlighting (green/red backgrounds)

### Data Flow
1. Fetch versions from `story_version` table via API
2. Compute diff client-side (lightweight for story-length text)
3. Render unified view

## Implementation Phases

### Phase 1: Diff Component
- [x] Install diff library (diff-match-patch or fast-diff)
- [x] Build `StoryDiff` component: takes two text strings, renders unified word-level diff
- [x] Green highlights for additions, red strikethrough for deletions
- [x] Preserve paragraph/block structure
- [x] Mock with two dummy story versions to verify rendering

### Phase 2: Side Panel Integration
- [x] "View changes" link in side panel when versions > 1
- [x] "Story changed" prominent indicator when quality score is stale
- [x] Diff view replaces side panel content with back button
- [x] Previous/next version navigation
- [x] Fetch versions from API

### Phase 3: Full Page Integration
- [x] History tab in ticket detail view (BRDG-003)
- [x] Version list with metadata
- [x] Two-version selector (dropdowns or checkboxes)
- [x] Diff rendering in full page width
- [x] Quality score per version indicator

### Phase 4: Polish
- [x] Handle edge cases: first version (no diff, show full content)
- [x] Empty description versions
- [x] Very long descriptions (performance)
- [x] Keyboard navigation between versions

## Dependencies

- BRDG-002 Sprint Board (story_version table, side panel)
- BRDG-003 Ticket Detail View (full page view, history tab)
- `story_version` table must be populated by Jira sync (BRDG-002 Phase 3)

## Technical Notes

- Diff computed client-side to keep API simple (just serve raw versions)
- story_version stores the full description text + content hash
- Word-level diff is preferred over line-level for prose/story text
- The diff view should work with both plain text and rich text (when ADF parsing is added later)
