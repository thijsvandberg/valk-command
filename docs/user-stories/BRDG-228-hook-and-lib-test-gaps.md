# BRDG-228: Close Remaining Hook and Lib Test Gaps

**Status:** In Progress
**Priority:** Medium
**Type:** Testing

## Description

Hooks are at 78% coverage (10 untested) and lib utilities at 87% (9 untested). Several untested files contain complex logic (search engine, sync service, stream handler) where silent regressions are high-risk.

## Implementation Plan

**Phase 1 (Pure functions):** status-colors, refinement-events, sanitize-html-config
**Phase 2 (Simple hooks):** useRefinementFilters, useLinkTypes
**Phase 3 (Server-side libs with DB):** subscribed-teams, task-stream-handler, review-capture, sync-tickets-service, local-search-engine
**Phase 4 (Complex hooks with EventSource/timers):** useRefinementStream, useSchedulerTick, usePipelineTick, useBulkSuggest, useRefinementQueue, useTicketDetailPage, useStakeholderAnalysis

**Shared infra:** Extract MockEventSource to `src/test/mocks/event-source.ts`
**Skips:** `usePageTitle` (already tested), `polling-constants.ts` (pure constants)
**Total:** ~209 tests across 17 test files

## Acceptance Criteria

- [ ] All Tier 1 and Tier 2 files have tests
- [ ] Tests follow existing patterns (renderHook for hooks, direct imports for libs)
- [ ] `npm run test` and `npm run build` pass

---

## Tier 1: Critical (complex logic, data integrity)

### Hooks

#### `useTicketDetailPage` (369 lines, COMPLEX)
Orchestrates 4+ hooks, manages local edits, conflict detection, auto-fetch from Jira, push-to-Jira flow.
**Mocks:** `useTicketDetail`, `useJiraSprints`, `useTicketReviews`, `useFollowedTickets`, `useFollowTicket`, `useActiveWriterSessions`, `jira.syncTickets`, `tickets.pushToJira`, `tickets.toggleFlag`, `apiFetch`, `navigator.clipboard.writeText`
**Test scenarios (~18 tests):**
- [ ] Maps API data to Ticket type correctly
- [ ] Maps API data to TicketDetail type correctly
- [ ] Auto-fetches from Jira when ticket not found locally (with 10s timeout)
- [ ] Cancels Jira fetch on unmount
- [ ] Push to Jira with success updates state
- [ ] Push to Jira with conflict shows diff
- [ ] Discard draft clears all local edit state
- [ ] Refresh from Jira syncs fresh data
- [ ] Flag toggle calls API, updates flagOverride
- [ ] Copy link to clipboard
- [ ] Readiness change: optimistic update then API call
- [ ] Jira status change: optimistic update then API call
- [ ] Type change calls PATCH and revalidates

#### `useRefinementQueue` (171 lines, COMPLEX)
Drag-drop queue with shift-click range selection, debounced persistence, DND sensors.
**Mocks:** `useSensor`, `useSensors`, `refinementSessionsApi.update`, SWR mutator, `setTimeout/clearTimeout`
**Test scenarios (~14 tests):**
- [ ] Initial queue from activeSession.ticketKeys
- [ ] Falls back to localQueue when no active session
- [ ] Toggle ticket (single click add/remove)
- [ ] Shift-click range selection
- [ ] Respects MAX_TICKETS limit
- [ ] Debounces persistence by 400ms (use vi.useFakeTimers)
- [ ] Flushes debounce timer explicitly
- [ ] Drag-end reorders queue
- [ ] Ignores drag-end when active === over
- [ ] Ready-to-refine toggle
- [ ] Remove from queue
- [ ] Optimistic mutation via mutateSessions

#### `useRefinementStream` (101 lines, COMPLEX)
EventSource SSE connection with 6 event types, reconnection with 3s backoff.
**Mocks:** `EventSource`, global `mutate`
**Test scenarios (~14 tests):**
- [ ] Creates EventSource on mount
- [ ] Closes EventSource on unmount
- [ ] Parses JSON event data correctly
- [ ] Handles malformed JSON gracefully
- [ ] session:created triggers /api/refinement-sessions mutation
- [ ] session:updated triggers mutation
- [ ] session:deleted triggers mutation
- [ ] bulk-suggest:progress with matching sessionId triggers specific mutations
- [ ] bulk-suggest:progress with non-matching sessionId is ignored
- [ ] bulk-suggest:complete triggers multiple mutations
- [ ] tickets:updated triggers /api/tickets mutation
- [ ] Reconnects after 3 seconds on error

#### `useStakeholderAnalysis` (251 lines, COMPLEX)
Multi-phase async: streams progress via EventSource, polls as fallback, auto-resumes running analyses.
**Mocks:** `useSWR`, `EventSource`, `stakeholderApi.createAnalysis`, `workspaceTasksApi.get`, `apiFetch`, `setInterval/clearInterval`, `setTimeout/clearTimeout`
**Test scenarios (~18 tests):**
- [ ] Loads rows from SWR when sprintId provided
- [ ] Returns null rows when sprintId is null
- [ ] Initial liveState is idle for both types
- [ ] Resets live state on sprint change
- [ ] Detects running analysis and reattaches stream on mount
- [ ] Parses progress event updates progressText
- [ ] Parses tool_call event formats toolName
- [ ] Handles result event, closes stream, marks completed
- [ ] Handles error event, closes stream
- [ ] Timeout (5 min) closes stream and fails analysis
- [ ] Polling detects completed status
- [ ] Polling detects failed status
- [ ] Generate creates analysis and attaches stream
- [ ] Detects stale analysis (changed point/todo counts)

### Lib Utilities

#### `sync-tickets-service.ts` (448 lines, VERY COMPLEX)
Three sync strategies (individual, sprint, backlog), removed-ticket tracking, rank persistence, scope change detection.
**Mocks:** DB queries, `jiraClient.getIssue/getSprintIssues/getBacklogIssues`, `upsertIssue`, `cacheSprintName`, activity logging, `AbortController`
**Test scenarios (~21 tests):**
- [ ] syncIndividualTickets: syncs valid keys
- [ ] syncIndividualTickets: marks as removed if 404
- [ ] syncIndividualTickets: clears removedFromJiraAt if found again
- [ ] syncIndividualTickets: creates activity log entry with duration
- [ ] syncSprint: validates sprintId required (throws SyncValidationError)
- [ ] syncSprint: validates sprintId is number
- [ ] syncSprint: timestamp-first strategy when available
- [ ] syncSprint: updates rank map
- [ ] syncSprint: detects tickets removed from sprint
- [ ] syncSprint: records scope changes in DB
- [ ] syncSprint: checks if ticket removed from Jira (404)
- [ ] syncSprint: updates activity log with summary
- [ ] syncBacklog: similar flow
- [ ] Handles AbortSignal cancellation (throws with 499)
- [ ] Wraps unhandled errors in SyncValidationError
- [ ] Activity log records error details on failure
- [ ] Watermark updated to latest issue timestamp

#### `local-search-engine.ts` (376 lines, COMPLEX)
Fuse.js search index with multi-token search, scoring adjustments, complex filters, ADF conversion.
**Mocks:** DB queries, `adfToMarkdown`, `getSearchCache/setSearchCache`
**Test scenarios (~21 tests):**
- [ ] Returns empty response for query < 2 chars
- [ ] Builds index from DB (tickets, metadata, comments, conversations)
- [ ] Single-token search returns ranked results
- [ ] Multi-token search with token merging
- [ ] Score adjusted for recency (7d boost, 180d+ penalty)
- [ ] Score penalizes active sprint tickets
- [ ] Score boosts DEPRECATED/DONE status
- [ ] Filter by status
- [ ] Filter by PO status
- [ ] Filter by issue type
- [ ] Filter by assignee
- [ ] Filter by sprint
- [ ] Filter by date range (7d, 28d, custom)
- [ ] Multiple filters combined (AND logic)
- [ ] Conversation search results
- [ ] Comment search results (jira + po)
- [ ] ADF parsing with fallback to raw string
- [ ] Search cache hit vs. miss path
- [ ] Results limit (25 tickets, 15 conversations/comments)

#### `task-stream-handler.ts` (239 lines, MODERATE)
SSE stream parsing into events, message save with deduplication, task completion/failure capture, notifications.
**Mocks:** `fetch`, DB inserts, `createNotification`, `nextSequence`
**Test scenarios (~20 tests):**
- [ ] Parses SSE stream with event:/data: lines
- [ ] Handles multi-line data accumulation
- [ ] Resets on empty line
- [ ] Handles incomplete final buffer
- [ ] Closes reader on abort signal
- [ ] Saves assistant message to DB
- [ ] Deduplication: skips if message already exists for workspaceTaskId
- [ ] captureTaskStream inserts workspaceTask record
- [ ] Parses result event and extracts output
- [ ] Parses error event and captures error message
- [ ] Handles JSON parsing failure gracefully
- [ ] 10-minute timeout aborts fetch
- [ ] Checks if task was cancelled before saving
- [ ] Updates task status to completed/failed
- [ ] Creates type-specific notifications
- [ ] Updates conversation readAt to null (unread)

---

## Tier 2: Important (feature logic)

### Hooks

#### `useSchedulerTick` (105 lines, COMPLEX)
Lazy-cron for scheduler tasks every 30s with AbortController cancellation.
**Mocks:** `schedulerApi.tick`, global `mutate`, `document.visibilityState`, `setInterval`, `AbortController`
**Test scenarios (~12 tests):**
- [ ] Calls tick on mount
- [ ] Sets up 30-second interval
- [ ] Skips tick if document not visible
- [ ] Guards against concurrent ticks
- [ ] Updates remaining, lastSyncAt, lastSyncCount from result
- [ ] Calls onSyncComplete when count > 0
- [ ] Invalidates /api/tickets and /api/activity-log on sync
- [ ] Aborts pending tick on unmount
- [ ] Handles errors gracefully

#### `usePipelineTick` (65 lines, MODERATE)
Lazy-cron for pipeline sync every 60s.
**Mocks:** `pipelinesApi.tick`, global `mutate`, `document.visibilityState`, `setInterval`
**Test scenarios (~10 tests):**
- [ ] Calls tick on mount
- [ ] Sets up 60-second interval
- [ ] Calls tick on visibility change to visible
- [ ] Guards against concurrent execution
- [ ] Revalidates /api/pipelines when newRuns > 0
- [ ] Revalidates /api/notifications when PR data changed
- [ ] Cleans up interval and listeners on unmount

#### `useBulkSuggest` (82 lines, MODERATE)
Manages bulk suggest flow for refinement sessions.
**Mocks:** `useSWR`, `refinementSessionsApi.bulkSuggestSubtasks`, `navigator.clipboard.writeText`, global `mutate`
**Test scenarios (~8 tests):**
- [ ] Initial state with no session
- [ ] Loads suggestion counts when sessionId present
- [ ] Triggers bulk suggest API call
- [ ] Copy stories to clipboard with toast
- [ ] Guards against running twice
- [ ] Handles API errors

#### `useRefinementFilters` (75 lines, SIMPLE)
Filter state management with computed labels.
**Test scenarios (~9 tests):**
- [ ] Initial state (hideEstimated=true)
- [ ] Toggle sprint filter (add/remove)
- [ ] Sprint filter labels: "All" / "Pinned" / name / count
- [ ] lastUpdatedLabel computed correctly
- [ ] activeFilterCount computed correctly

#### `useLinkTypes` (31 lines, SIMPLE)
SWR wrapper with fallback.
**Test scenarios (~5 tests):**
- [ ] Returns fallback when data undefined
- [ ] Returns API data when loaded
- [ ] Returns error state
- [ ] Returns loading state

### Lib Utilities

#### `review-capture.ts` (112 lines, MODERATE)
Review JSON parsing, DB persistence with version hash, low-quality alerts.
**Test scenarios (~12 tests):**
- [ ] Parses agent review JSON correctly
- [ ] Calculates version hash and number
- [ ] Inserts storedReview to DB
- [ ] Updates metadata qualityScore
- [ ] Creates notification for low score (< 60)
- [ ] No notification for high score
- [ ] captureReviewGeneration delegates to captureTaskStream
- [ ] Handles malformed JSON gracefully

#### `refinement-events.ts` (29 lines, SIMPLE)
EventEmitter singleton.
**Test scenarios (~6 tests):**
- [x] emitRefinementEvent broadcasts event
- [x] onRefinementEvent receives events
- [x] Multiple listeners receive same event
- [x] Unsubscribe removes listener

#### `subscribed-teams.ts` (56 lines, SIMPLE)
Get/set subscribed teams from appSetting table.
**Test scenarios (~8 tests):**
- [ ] getSubscribedTeams returns teams array
- [ ] getSubscribedTeams returns empty array if not found
- [ ] getSubscribedTeams handles malformed JSON
- [ ] setSubscribedTeams upserts record
- [ ] getAvailableTeams extracts team prefixes from sprint name cache

#### `status-colors.ts` (126 lines, SIMPLE)
Pure functions for color mapping.
**Test scenarios (~10 tests):**
- [x] getScoreColor: < 60 error, 60-74 warning, 75-89 caution, 90+ success
- [x] verdictLabel for each band
- [x] JIRA_STATUS_STYLES has all required statuses
- [x] READINESS_STYLES has all required readinesses
- [x] pipelineStatusColor for SUCCESSFUL/FAILED/other

---

## Tier 3: Nice-to-have (trivial or config-only)

#### `usePageTitle` (19 lines, TRIVIAL)
- [ ] Sets document.title with " | Bridge" suffix
- [ ] Returns React `<title>` element

#### `sanitize-html-config.ts` (21 lines, CONFIG)
- [x] ALLOWED_TAGS includes expected elements
- [x] ALLOWED_ATTR includes expected attributes
- [x] ALLOW_DATA_ATTR is false

#### `polling-constants.ts` (4 lines, TRIVIAL)
Skip. Pure constant exports with no logic.

## Notes

- Tier 1 files represent ~1,600 lines of untested logic with complex async patterns
- Use `vi.useFakeTimers()` for all polling/interval hooks
- Mock `EventSource` as a class with `addEventListener`, `close` methods
- Mock `document.visibilityState` for visibility-based polling hooks
