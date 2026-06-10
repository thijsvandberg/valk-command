# Stale UI After Mutation - Audit (2026-06-10)

Audit of every client-side mutation handler against the known pitfall: server-cached GET
responses (src/lib/cache.ts) that embed mutated data, write routes that do not invalidate
every embedding cache key, and clients that rely on bare revalidation.

Status note: src/lib/cache.ts:12-22 now backs the store with a `globalThis` singleton, so
cross-route `cache.invalidate` IS reliable (the dev-mode split-instance problem is fixed at
the cache layer). The remaining bug class is therefore (1) write routes that invalidate the
wrong/too-few keys, and (2) clients that neither patch nor revalidate.

## Server-cached GET endpoints (the only ones that can serve stale data)

| GET key | TTL | Set at | Embeds |
|---|---|---|---|
| `/api/tickets` and `/api/tickets?sprintId=X` | 30s | src/app/api/tickets/route.ts:161 | status, assignee, flagged, readiness, poStatus, qualityScore, businessValue, guestimation, notes, editState, SP, subtask counts |
| `/api/tickets/{key}` (detail) | 60s | src/app/api/tickets/[key]/route.ts:57 | everything incl. subtasks, linkedIssues, jiraComments, **epicChildren** (status/readiness/SP/BV/sprint per child), qualityScore, reviewCount, versionCount, chatMessageCount, pendingSuggestionCount (src/lib/ticket-detail-builder.ts:147-212,281-286,334) |
| `/api/tickets/{key}/dev-info` | 120s | dev-info/route.ts:26 | Bitbucket info (read-only, no writes) |
| `/api/jira/sprints` | 300s | src/app/api/jira/sprints/route.ts:109 | sprint list + **backlogCount** |
| `/api/epics` | 300s | src/app/api/epics/route.ts:105 | epic list items |
| `/api/epics/progress` | 300s | src/app/api/epics/progress/route.ts:205 | per-epic **status/points aggregates** of children |
| `/api/burnup?...` | 60s | src/app/api/burnup/route.ts:278 | sprint scope/done series |
| `/api/jira/link-types` | 7d | jira/link-types/route.ts:72 | static |

Not server-cached (bare revalidation is safe): conversations, refinement-sessions,
stakeholder analysis, jobs, placeholders, followed-tickets, sprint-slots, story-writer
sessions/active-sessions, comments (PO), reviews GET, versions GET, watchers,
workspace-tasks, sprints/pencil-capacity.

## Write-route invalidation map

| Write route | Invalidates | Missing |
|---|---|---|
| PUT `/api/tickets/[key]/status` (status/route.ts:55-67) | own detail, list keys, **subtask parents** | epic parent detail, `/api/epics/progress`, `/api/burnup` |
| PATCH `/api/tickets/[key]` (type/SP/flag/labels/epicKey) ([key]/route.ts:91-92) | own detail, list keys | epic parent detail (incl. old/new epic on epicKey change), `/api/epics/progress` |
| PUT `/api/tickets/[key]/metadata` (via src/services/ticket-service.ts:578-579) | own detail, list keys | epic parent detail (readiness/BV shown in epic child rows) |
| PUT `/api/tickets/[key]/summary` (summary/route.ts:53-54) | own detail, list keys | epic parent detail (child title) |
| POST/DELETE `/api/tickets/[key]/links` (links/route.ts:142-144,201-203) | both details, lists | - |
| POST `/api/tickets/[key]/jira-comments` (jira-comments/route.ts:67) | detail | - |
| subtasks create/rename/delete/close/rank (subtasks/*) | parent detail, lists | - |
| POST `/api/jira/assign` (assign/route.ts:61) | broad `/api/tickets` prefix (covers all details + lists) | - |
| POST `/api/jira/move-sprint` (move-sprint/route.ts:92) | broad `/api/tickets` prefix | `/api/jira/sprints` (backlogCount) |
| POST `/api/jira/rank` (rank/route.ts:86) | broad prefix | - |
| **POST `/api/tickets/[key]/reviews`** (reviews/route.ts:104-110 upserts qualityScore) | **nothing** | detail + lists (qualityScore, reviewCount) |
| **DELETE `/api/tickets/[key]/reviews/[id]`** (reviews/[id]/route.ts:44-47 updates qualityScore) | **nothing** | detail + lists |
| POST `/api/tickets/[key]/versions` | nothing | detail (versionCount badge) |
| DELETE `/api/tickets/[key]/story-writer` (route.ts:406) | nothing | detail (chatMessageCount badge) |
| PUT/POST/DELETE epic teams/color/summary | `/api/epics/progress` resp. `/api/epics` | - |
| local-edits PUT/PATCH/DELETE (local-edits/route.ts:62-66) | detail, lists | - |
| push-to-jira (push-to-jira/route.ts:39-40, ticket-service.ts:160-161) | detail, lists | - |

## Findings per view

Classes: (a) optimistic client patch with `{ revalidate: false }`; (b) bare revalidation;
(c) no cache update at all. "OK" = instant or fresh-on-revalidate because the server
invalidation covers every displayed key.

### Sprint Board (src/components/sprint-board/)

| Handler | Endpoint | Displayed via | Class | Verdict |
|---|---|---|---|---|
| useTicketActions.handleJiraStatusChange:76 | PUT .../status | board list | a | OK |
| useTicketActions.handleIssueTypeChange:88 | PATCH .../[key] | board list | a | OK |
| useTicketActions.handleTitleChange:100 | PUT .../summary | board list | a | OK |
| useTicketActions.handleAssigneeChange:112 | POST /api/jira/assign | board list | a | OK (optimisticData + populateCache) |
| useTicketActions.handleEpicChange:137 | PATCH .../[key] | board list | a | OK |
| useTicketActions.handleSprintChange:153 | POST /api/jira/move-sprint | board list | b | OK (move route invalidates broad prefix) |
| useTicketActions.handleCloseSubtasks:162 | POST .../subtasks/close | board list | a | OK |
| useTicketActions.handlePoStatusChange:26 / handleReadinessChange:39 / handleBulkSetReadiness:192 | PUT .../metadata via saveTicketMetadata | poStatuses/readinessMap shadow state + SWR list/detail patch (sprint-board-utils.ts:56-78) | a | OK for board-originated edits; see BUG-3 for cross-surface staleness |
| useTicketActions.handleBusinessValueChange:52 / handleGuestimationChange:56 / handleStoryPointsChange:60 | PUT .../metadata, PATCH SP | board list | a | OK (saveTicketMetadata/saveStoryPoints patch list+detail) |
| useTicketActions.handleBulkSetStatus:208 | PUT .../status xN | board list | a | OK on board; epic detail stale -> BUG-1 |
| useTicketActions.handleBulkSetEpic:225 | PATCH .../[key] xN | board list | b | OK on board (route invalidates lists); epic details stale -> BUG-1 |
| useTicketActions.handleBulkMoveSprint:246 | POST move-sprint | all sprint lists | a | OK (BRDG-271 reference) |
| useTicketActions.handleBulkUpdateAssignee:294 / handleBulkUpdateLabels:306 | assign/PATCH xN | board list | b | OK (server invalidates before revalidate) |
| useTicketActions.handleBulkSetFlagged:328 | PATCH .../[key] xN | board list | a | OK |
| MultiSprintView handlers (175-243) | same endpoints | per-sprint lists | a | OK (all optimistic; legacy view) |
| SidePanel -> TicketMetaContent.tsx:184-230 (SP/status/sprint) | PATCH/PUT/move-sprint | patchTicketCaches (src/lib/ticket-cache.ts:17) all lists + detail | a | OK |
| sprint-board-utils.saveSprintSlots:21 | PUT /api/sprint-slots | sprint-slots SWR | a | OK |
| SprintListModal.handleToggleHidden:386 | PUT /api/jira/sprints | sprints SWR | b | OK (route invalidates sprints cache, jira/sprints/route.ts:222) |
| usePencilCapacity.setCapacity:29 | PUT pencil-capacity | capacity SWR | a | OK |

### Ticket Detail (src/hooks/useTicketDetailPage.ts, src/components/ticket-detail/)

| Handler | Endpoint | Displayed via | Class | Verdict |
|---|---|---|---|---|
| handleReadinessChange:163 | PUT .../metadata | detail key (patched) + board list (NOT patched) | a (detail only) | detail OK; board pill stale -> BUG-3 |
| handleJiraStatusChange:172 | PUT .../status | detail | a | OK |
| handleSubtaskJiraStatusChange:185 + SubtasksSection.tsx:302 | PUT child status | parent detail subtasks | a | FIXED (seed case, 9d7021de/5d9ac82a; server side status/route.ts:61-67) |
| handleTypeChange:99 | PATCH .../[key] | detail | b | OK (route invalidates detail) |
| handleDeleteSession:130 | DELETE .../story-writer | active-sessions SWR | a | OK (optimistic patch 135-137) |
| handleDiscardDraft:203 / handlePushToJira:228 / handleConflictResolved:303 | local-edits/push | detail editState | a | OK |
| handleFlag:273 / handleUnflag:287 | PATCH flag | flagOverride local + revalidate | a-ish | OK |
| SubtasksSection.handleAssigneeChange:333 | POST /api/jira/assign | parent detail | b | OK (assign invalidates broad prefix) |
| SubtasksSection create/rename/delete (374-491) | subtasks routes | parent detail | b | OK (routes invalidate parent detail) |
| LinkedIssuesSection (223-318) link create/delete | links routes | parent detail | b | OK (route invalidates both details) |
| EditableDescription/TicketHistory local-edits flows | local-edits routes | detail editState | b | OK (route invalidates; conflict resolution patches optimistically) |
| useTicketReviews.saveReview / deleteReview (useSprintBoard.ts:223-252) | POST/DELETE reviews | reviews SWR (not cached) + detail qualityScore/reviewCount + board list qualityScore | b | **BUG-2: reviews routes invalidate nothing; revalidation returns stale cached detail/list** |
| ConfluencePagesSection add/remove | confluence-links | confluence-links SWR | b | OK (GET not server-cached) |

### Epic (EpicChildrenSection, rendered inside ticket detail and side panel)

Data source: `epicChildren` embedded in the parent epic's cached detail (`/api/tickets/EPIC`,
60s TTL). `onMutate` = bare revalidation of that key (useTicketDetailPage.ts:16).

| Handler | Endpoint | Class | Verdict |
|---|---|---|---|
| handleJiraStatusChange (EpicChildrenSection.tsx:445) | PUT child status | b (onMutate only) | **BUG-1: status route never invalidates epic parent detail; revalidation returns stale child status; pill does not change / flips back** |
| handleReadinessChange:468 | PUT child metadata | b | **BUG-1 (metadata service does not invalidate epic detail)** |
| handleStoryPointsChange:491 / handleBusinessValueChange:504 / handleGuestimationChange:516 | PATCH/PUT child | local `localMetrics` overlay (line 148, merged at 253-258) + onMutate | masked by overlay (value shown), but underlying cache stays stale 60s |
| handleBulkStatus:787 / handleBulkReadiness:791 | child writes xN -> runBulk:776 -> onMutate | b | **BUG-1** |
| handleBulkEpic:795 (move child to other epic) | PATCH epicKey | b | **BUG-1: child remains listed; neither old nor new epic detail invalidated** |
| handleBulkAssignee:799 / handleBulkMoveSprint:819 | assign / move-sprint | b / optimistic localMoves | OK (broad `/api/tickets` prefix invalidation covers epic detail) |
| handleBulkFlag:803 / handleBulkLabels:807 | PATCH child | b | flag/labels not rendered in child rows; harmless |
| handleCreate:288 / handleLinkExisting:381 | POST children | b | OK (children/route.ts:105-106 invalidates epic detail) |

Epics overview page (src/app/(app)/epics, hooks src/hooks/useEpics.ts):

| Handler | Class | Verdict |
|---|---|---|
| useSetEpicTeams:23 / useSetEpicColor:38 | a (patch progress list) | OK |
| (no direct mutations on the page) | - | **BUG-4: `/api/epics/progress` (300s) is only invalidated by teams/color routes; any child status/SP/epicKey change leaves epic progress bars stale up to 5 minutes, even across manual page refreshes** |
| useEpicTickets (`/api/epics/[key]/tickets`) | - | OK (GET not server-cached) |

### Refinement

| Handler | Endpoint | Class | Verdict |
|---|---|---|---|
| Session page status PUT / type PATCH (refinement/[sessionId]/session/[ticketKey]/page.tsx:314,330 -> mutate()) | status / PATCH | b | OK (routes invalidate the detail before responding) |
| Session page SP/local-edits (225-301) | metadata/PATCH/local-edits | b | OK |
| SessionTicketView SP/BV/sprint/assignee/epic/labels (275-351) | metadata/move/assign/PATCH | b via onMutate | OK (all covered by route invalidation) |
| SessionEndModal.handleJiraStatusChange:219 / handleReadinessChange:225 / handleIssueTypeChange:231 | status/metadata/PATCH | **c - no patch, no mutate** ("allTickets will revalidate") | **BUG-5: rows read `useTickets("__all__")` (SessionEndModal.tsx:35); nothing revalidates on success, pill stays stale until the list's 60s refreshInterval** |
| SessionEndModal spike promotion (~199-206) | metadata xN | c | same as BUG-5, but modal closes immediately (low impact) |

### Story Writer

| Handler | Endpoint | Class | Verdict |
|---|---|---|---|
| useStoryWriterActions.handleJiraStatusChange:333 | PUT status | a (patches detail) | OK |
| useStoryWriterActions.handleTypeChange:127 | PATCH | b | OK |
| push flow ~320-330 (deleteSession + readiness) | DELETE story-writer + metadata | mutates active-sessions (globalMutate at :321) | OK |
| useStoryWriterDrafts accept/dismiss/save (120-150, 24) | story-writer PATCH, local-edits PUT | local session state | OK (session GET not server-cached) |
| StoryWriterLauncherModal.deleteSession:203-211 | DELETE /api/story-writer/active-sessions | **c - only modal-local `setSessions`; never mutates the `/api/story-writer/active-sessions` SWR key** | **BUG-6: sidebar writer-session list (useSidebarData.ts:67) and ticket-detail badge (useTicketDetailPage.ts:125-126) keep showing the deleted session while mounted** |

### Chat / Test Center / Scheduled Jobs / Stakeholder

No server-side caching on conversations, workspace-tasks, jobs, or stakeholder analysis
routes (verified: no `cache.` usage under src/app/api/conversations, jobs, stakeholder,
refinement-sessions, story-writer). All handlers there (ChatLayout.tsx:145-156,278-336,
EditableConversationTitle.tsx:45, useStakeholderAnalysis.ts:49-68, useTaskMonitoring,
TicketChatPane) are class (b) against uncached GETs -> OK.

## Confirmed needs-manual-refresh bugs (ranked)

### BUG-1 (HIGH): Epic child mutations invisible in the epic's children list
- Handlers: EpicChildrenSection.tsx:445 (status), 468 (readiness), 787/791 (bulk status/readiness), 795 (bulk epic move); also board-side status changes of epic children (useTicketActions.ts:76/208 patch only the board list).
- Displayed via: `/api/tickets/{EPIC}` detail, server-cached 60s, embeds epicChildren (ticket-detail-builder.ts:334, 281-286).
- Gap: PUT status (status/route.ts:55-67) invalidates subtask parents only; PATCH ([key]/route.ts:91-92), metadata (ticket-service.ts:578-579), summary (summary/route.ts:53-54) never invalidate the epic parent. Client does a bare `onMutate()` revalidation, which refetches the stale cached epic detail. Status/readiness pills do not change (or revert) for up to 60s.
- Fix: (client) pass an `onChildOptimistic` patch from the epic detail owner that mutates `epicChildren` in the `/api/tickets/{EPIC}` SWR key with `{ revalidate: false }` (mirror of handleSubtaskJiraStatusChange, useTicketDetailPage.ts:185). (server) in status PUT, PATCH, metadata PUT and summary PUT, look up the ticket's `epicKey` and `cache.invalidate(\`/api/tickets/${epicKey}\`)`; on epicKey change invalidate old and new epic.

### BUG-2 (HIGH-MED): Quality score / review count stale after creating or deleting a review
- Handlers: useSprintBoard.ts:223-239 (saveReview), 241-250 (deleteReview); used by ticket detail, chat reviews, bulk review (sprint-board-utils.ts:122).
- Displayed via: detail `qualityScore`/`reviewCount` (cached 60s) and board list `qualityScore` (cached 30s).
- Gap: POST reviews (reviews/route.ts:104-110) and DELETE reviews/[id] (reviews/[id]/route.ts:44-47) both write `qualityScore` but invalidate nothing; the client's `globalMutate(detailUrl)` revalidation returns the stale cached response.
- Fix: (server) add `cache.invalidate(\`/api/tickets/${key}\`)` + `cache.invalidate(/^\/api\/tickets(\?|$)/)` to both routes. (client) optionally patch the detail key's `qualityScore`/`reviewCount` with `{ revalidate: false }` for instant feedback.

### BUG-3 (MED): Board readiness/PO-status pills never resync after cross-surface edits
- Mechanism: BoardRow reads exclusively from the shadow maps (BoardRow.tsx:376,407; TicketTable.tsx:297); useTicketActions.syncFromApiTickets:177-190 seeds only keys not yet present and never overwrites. A readiness change made on the ticket detail page patches only the detail SWR key (useTicketDetailPage.ts:163-170). Returning to the board seeds the map from the stale client list cache; the subsequent fresh revalidation is then ignored, so the pill stays stale until a hard reload.
- Note: the originally suspected mechanism ("handler never patches the SWR board list") is wrong - saveTicketMetadata patches list + detail (sprint-board-utils.ts:56-78). The bug is the one-shot shadow-map seeding.
- Fix: (client) have syncFromApiTickets reconcile existing keys against fresh `apiTickets` (track an in-flight set to avoid clobbering optimistic values), or drop the shadow maps and read poStatus/readiness from the SWR rows; additionally make useTicketDetailPage.handleReadinessChange use patchTicketCaches (src/lib/ticket-cache.ts:17) so list caches are patched too.

### BUG-4 (MED): Epic progress view stale up to 5 minutes after status/SP changes
- Displayed via: `/api/epics/progress`, cached 300s (epics/progress/route.ts:63,205), aggregates child status + points.
- Gap: only epic teams (epics/[key]/teams/route.ts:65) and color (epics/[key]/color/route.ts:66) invalidate it. Status PUT, PATCH (SP/epicKey), move-sprint, sync routes do not. Manual browser refresh does not help (server cache).
- Fix: (server) `cache.invalidate("/api/epics/progress")` in status PUT and in updateTicketFields for storyPoints/epicKey changes (or in the shared sync path); optionally shorten TTL. Client patch not practical (aggregate).

### BUG-5 (MED-LOW): Refinement wrap-up modal pills do not update
- Handlers: SessionEndModal.tsx:219-223 (status), 225-229 (readiness), 231-235 (type) - class (c): no patch, no mutate; rows derive from `useTickets("__all__")` (SessionEndModal.tsx:35).
- The server caches ARE invalidated by these routes, but nothing triggers a revalidation; the pill self-heals only on the list's 60s refreshInterval (useSprintBoard.ts:58).
- Fix: (client) call patchTicketCaches(key, { jiraStatus / readiness / type }) in each handler.

### BUG-6 (LOW-MED): Deleting a writer session in the launcher modal leaves badges elsewhere
- Handler: StoryWriterLauncherModal.tsx:203-211 - updates only modal-local `sessions` state; never mutates the `/api/story-writer/active-sessions` SWR key.
- Affected: sidebar session list (useSidebarData.ts:67), ticket detail "active session" badge (useTicketDetailPage.ts:125-126) while those components stay mounted. Endpoint is not server-cached, so a remount self-heals.
- Fix: (client) `globalMutate("/api/story-writer/active-sessions", remaining-filter, { revalidate: false })` (or a bare revalidation) after the DELETE.

### Minor (LOW, TTL-bounded, listed for completeness)
- Backlog count: `/api/jira/sprints` (300s) embeds backlogCount (jira/sprints/route.ts:83,109); move-sprint (move-sprint/route.ts:92) and create-ticket (src/lib/create-ticket.ts:111) invalidate only ticket keys. Sidebar/board backlog badge can lag up to 5 min. Fix: invalidate "/api/jira/sprints" in move-sprint and create-ticket.
- versionCount badge: POST versions route does not invalidate the detail (versionCount embedded, builder line ~321). Fix: invalidate detail in versions POST/DELETE.
- chatMessageCount badge: DELETE story-writer (deleteConversation) does not invalidate the detail. Fix: invalidate detail key.
- Burnup chart: `/api/burnup` (60s) not invalidated on status/SP writes; self-heals within TTL.

## Refuted candidates

- "Story Writer session delete leaves the active-session badge because the DELETE route does not invalidate the ticket detail cache": REFUTED as described. The badge reads `/api/story-writer/active-sessions` (uncached) via useActiveWriterSessions, not the ticket detail response; the detail-page delete handler optimistically patches that key (useTicketDetailPage.ts:130-147). The real residual gap is the launcher modal path (BUG-6) plus the cosmetic chatMessageCount staleness.
- "Board readiness pill staleness because the handler keeps local state only and never patches the SWR board list": PARTIALLY REFUTED. saveTicketMetadata does patch the active list and detail SWR keys (sprint-board-utils.ts:56-78), so board-originated edits are instant. The true bug is the never-resyncing shadow maps for edits made on other surfaces (BUG-3).

## Fixed reference (do not re-report)

- Subtask status inside parent detail: SubtasksSection.tsx:302-331 calls
  `onSubtaskStatusOptimistic` (wired in useTicketDetailPage.ts:185-193 and the refinement
  session page), and PUT status invalidates subtask-parent detail keys
  (status/route.ts:61-67). Commits 9d7021de, 5d9ac82a.

## Methodology

1. Enumerated all client writes: grep for `method: "PUT|POST|PATCH|DELETE"` and api-client
   wrappers across src/components, src/hooks, src/lib, src/contexts, src/app/(app).
2. Mapped every `cache.get/set/invalidate` across src/app/api and src/lib to build the
   cached-GET and invalidation tables; read each cached GET to list embedded fields.
3. For each handler, read the surrounding code to classify (a)/(b)/(c) and traced the SWR
   key(s) that display the mutated data, including embedding keys (epic detail,
   board lists, progress aggregates, sprints payload).
4. Flagged a bug only where a displayed, server-cached key is neither invalidated by the
   write route nor patched client-side. All file:line references verified by reading the
   files in this audit.
