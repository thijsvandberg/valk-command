# BRDG-053: Improved Search with Filters

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want the search modal to support filters and show results grouped by category so I can find things faster in a growing dataset.

## Core Concepts

- **Filter chips**: Status, sprint, assignee, date range, type (ticket/conversation/comment)
- **Grouped results**: Results shown in sections (Tickets, Conversations, Comments) with counts
- **Recent searches**: Last 5 searches shown when modal opens
- **Search scope**: Local DB + optional Jira search toggle
- **Result preview**: Show enough context (title, snippet, date, status) to identify results
- **Keyboard-first**: Tab between filter chips, arrow keys through results, Enter to open

## Acceptance Criteria

### Phase 1: Filter chips in search modal
- [ ] Filter bar below the search input with horizontally scrollable chips
- [ ] Status filter: dropdown chip with available ticket statuses (multi-select)
- [ ] Sprint filter: dropdown chip listing active and recent sprints
- [ ] Assignee filter: dropdown chip listing team members from known tickets
- [ ] Type filter: chip set for Ticket, Conversation, Comment (toggle on/off)
- [ ] Date range filter: chip that opens a date picker for start/end range
- [ ] Active filters shown as filled chips with a clear (x) button
- [ ] "Clear all filters" link when any filters are active
- [ ] Filters are applied in combination (AND logic between different filters)

### Phase 2: Grouped results display
- [ ] Results grouped into sections: Tickets, Conversations, Comments
- [ ] Each section has a header showing the category name and result count
- [ ] Sections are collapsible (click header to expand/collapse)
- [ ] Empty sections are hidden entirely (no "0 results" noise)
- [ ] Each section shows a maximum of 5 results initially with a "Show more" link
- [ ] Total result count displayed at the top of the results area
- [ ] Results within each section sorted by relevance, then recency

### Phase 3: Recent searches
- [ ] When the search modal opens with an empty query, show "Recent searches" section
- [ ] Store the last 5 unique search queries in localStorage
- [ ] Each recent search item is clickable and re-executes the search
- [ ] Clear individual recent searches with a small x button
- [ ] "Clear all recent" link at the bottom of the recent searches list
- [ ] Recent searches include the filters that were active at the time
- [ ] Recent searches are hidden once the user starts typing a new query

### Phase 4: Enhanced result previews
- [ ] Ticket results show: key, title, status badge, assignee avatar, story points
- [ ] Conversation results show: title/first message snippet, date, participant count
- [ ] Comment results show: parent ticket key, comment snippet with matched text highlighted, author, date
- [ ] Search term highlighted in result titles and snippets
- [ ] Snippet length limited to 120 characters with ellipsis
- [ ] Each result has a subtle icon indicating its type (ticket, chat, comment)

### Phase 5: Keyboard navigation improvements
- [ ] Tab key cycles between search input, filter chips, and result groups
- [ ] Arrow up/down navigates between individual results within a group
- [ ] Enter opens the selected result and closes the modal
- [ ] Escape closes the modal (or clears the query if results are showing)
- [ ] Cmd/Ctrl+number (1-3) jumps to a specific result group
- [ ] Visual focus indicator on the currently selected result
- [ ] First result is pre-selected when search returns results

## Technical Notes

- Search modal already exists (`SearchModal.tsx` in sprint-board)
- Local search API exists at `/api/search/local`, Jira at `/api/search/jira`
- Extend search API to accept filter parameters as query string params
- Recent searches stored in localStorage under key `bridge.recentSearches`
- Fuse.js already in dependencies for fuzzy matching on the local dataset
- Consider search indexing for faster full-text search as data grows
- Filter chip components can be reused across other filter UIs in the app

## Out of Scope (for now)

- Saved searches (bookmarking a query + filter combination)
- Search analytics (tracking popular queries)
- Natural language search (AI-interpreted queries)
- Full-text search index (SQLite FTS5 or similar)
- Cross-page global search shortcut (currently sprint board only)
