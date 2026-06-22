# Codebase Audit — 2026-06-22

Full-codebase refactoring audit (`/audit-code`) across six layers using parallel agents:
API routes, data layer (DB + services), React components, hooks + contexts, integration/sync
libraries, and business-logic/utility libraries. Read-only; no code was changed. This document
is the master record; the actionable items are grouped into stories
[[BRDG-375-close-xss-and-injection-vectors]] through [[BRDG-380-robustness-and-dead-code-cleanup]].

## Headline

The codebase is in good shape: auth is enforced globally via Clerk middleware, SQL is
parameterized through Drizzle everywhere, most async effects are cancellation-guarded, timers and
listeners are generally cleaned up, and `any` / unsafe casts are effectively absent. The findings
below are the genuine exceptions, ordered by impact (security > stability > performance > best
practice > structure). Two agents independently corroborated several findings (Jira-key encoding;
per-key sync loops), which raises confidence.

Bounding context: this is a single-user app behind Clerk auth where the only operator is the
trusted PO. Injection sinks are therefore reachable by the authenticated operator or by a
malformed value the UI itself sends — bounded blast radius, but still genuine defects (a search
term with a quote, a malformed key, or any future multi-user scenario trips them).

## Findings by theme → story

### Security → BRDG-375

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| XSS | Critical | `src/components/ticket-detail/renderMarkdown.tsx:202-212,242-249` + `src/lib/markdown-to-adf.ts:573-582` | Markdown link `href` rendered with no scheme check; a `javascript:` link in Jira-synced content executes in the PO session. No `safeHref` helper exists anywhere. |
| JQL-1 | High | `src/app/api/search/jira/route.ts:22-52` | Raw `jql` override passed verbatim; `issuetype` interpolated with quote-wrap only. |
| KEY | Medium | `src/lib/jira-client.ts:735,749,770,809,830,971,995,1013,1025,1342,1378,1400,1623,1671` + `src/app/api/jira/check-updated/route.ts:37` | Ticket `key` interpolated into ~13 Jira URLs without `encodeURIComponent`; `check-updated` does no key-format validation. (Flagged by 2 agents.) |
| JQL-2 | Medium | `src/lib/jira-client.ts:889` (`getEpicIssueTimestamps`) ← `resolveGroupTarget` | Epic key interpolated into JQL `parent = ${epicKey}` with no escape/validation. |
| CQL | Medium | `src/lib/confluence-client.ts:138-152` ← `src/app/api/confluence/search/route.ts:54-56` | `query`/`space` interpolated into CQL string literals without escaping `"`/`\`. |
| JQL-3 | Medium | `src/app/api/search/jira/route.ts:50`, `src/app/api/tickets/search/route.ts:142` | `text ~ "..."` escapes `"` but not `\`; a trailing backslash breaks out of the literal. |
| SANITIZE | High | `src/lib/sanitize-html-config.ts:5-20` | Allows `target` without forcing `rel="noopener noreferrer"` (reverse tabnabbing); permits `data:` image URIs. |
| LIKE | Low | `src/app/api/tickets/search/route.ts:76` | `%${q}%` does not escape `%`/`_`; `escapeLikePattern` helper exists and is unused. |

### Stability — sync engine → BRDG-376

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| TXN | High | `src/lib/upsert-issue.ts:123-203` vs `:284-534` | ~7 "current state" reads happen before the write transaction; concurrent upserts diff against a stale snapshot. |
| WATERMARK | Medium | `src/app/api/jira/sync-incremental/route.ts:144-167` | Watermark advances to last *processed* item on a >50 batch, silently dropping unprocessed stale edits. |
| IDS | Medium | `src/lib/upsert-issue.ts:356,378` | `sc-/sv-${key}-${Date.now()}` ids collide on same-ms double-upsert; PK insert throws and aborts the whole ticket sync. |
| CLAIM | High | `src/lib/deprecation-scan-queue.ts` (`claimPendingBatch`) | Non-atomic SELECT-then-UPDATE lets overlapping ticks double-claim/double-scan; doc claims it is atomic. |
| REQUEUE | Medium | `src/lib/deprecation-scan-queue.ts` (`requeueStuckRunning`) | Resets ALL running rows to pending, clobbering rows a live tick is processing. |
| REORDER | Medium | `src/services/placeholder-service.ts:248-259`; `src/app/api/jira/rank/route.ts:75-79`; `src/app/api/jira/move-sprint/route.ts:154-160` | Per-row UPDATE loops with no transaction → partial ordering on mid-loop failure. |

### Stability — frontend → BRDG-377

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| WSTASK | Critical (dev) | `src/hooks/useWorkspaceTask.ts:54,57-64` | `unmountedRef` never reset; after StrictMode remount every `safeSetState` is a permanent no-op → chat task UI stops updating in dev. |
| MSGRACE | High | `src/hooks/useMessages.ts:29-49` | Initial fetch has no ignore flag; fast conversation switching renders the wrong conversation's messages. |
| CMTRACE | High | `src/components/ticket-detail/CommentsSection.tsx:33-45` | Comments fetch has no cancellation guard (siblings all do); fast ticket switching shows another ticket's comments. |
| SETSTATE | High | `src/contexts/RefinementSessionContext.tsx:172-200` | `saveSession`/`finishSession` fire API calls inside `setState` updaters → duplicate PATCH under StrictMode/concurrent. |
| THEME | Medium | `src/contexts/ThemeContext.tsx:78-82` | `getThemeSnapshot` mutates the DOM (`applyTheme`) inside `useSyncExternalStore` getSnapshot (must be pure). |
| CTXVAL | Medium | `src/contexts/RefinementSessionContext.tsx:202-219` | Provider value is a fresh `{...state, ...12 callbacks}` literal each render; re-renders the whole refinement subtree. |
| SEED | Medium | `src/components/sprint-board/BurnupChart.tsx:72,81-85` | `seedAttempted` ref never resets across sprints; only the first sprint viewed auto-seeds. |
| KEYS | Medium | `src/components/stakeholder/TicketGroup.tsx:104` | Reorderable list keyed by array index; stable `jiraKey` available. |

### Performance — sync efficiency → BRDG-378

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| NPLUS1-A | High | `src/lib/sync-tickets-service.ts:253-271,386-402,528-553` | Departed tickets re-fetched one-by-one with `getIssue` in a loop; `getIssuesByKeys` bulk exists. (Flagged by 2 agents.) |
| NPLUS1-B | Medium | `src/app/api/jira/sync-comments/route.ts:50-80` | Per-comment `findFirst` + update/insert; `upsertIssue` already solved this with a preloaded Map. |
| IDX | Medium | `src/db/schema.ts:485-499` | `jira_comment.jiraCommentId` is upserted/filtered but only indexed on `ticketKey`; no uniqueness guarantee. |
| ENRICH | Low | `src/lib/jira-client.ts:639-651` | `getSprints` fires one Agile call per sprint just for `goal`, uncached. |

### Structure — HTTP infrastructure → BRDG-379

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| TIMEOUT | High | `src/lib/bitbucket-client.ts:159-175`; `src/lib/pipeline-sync.ts:133-171`; `src/lib/confluence-client.ts:66-81` | No request timeout on Bitbucket/Confluence fetches; a hung upstream can wedge a sync tick. |
| BBDUP | Medium | `src/lib/bitbucket-client.ts:159` + `src/lib/pipeline-sync.ts:133` | Two divergent `bbFetch`/config/deploy-heuristic implementations. |
| HTTPDUP | Medium | `agent-fetch.ts`, `jira-client.ts:264-476`, bitbucket/confluence | Four different retry/timeout/error-mapping policies; no shared HTTP helper. |

### Robustness & dead code → BRDG-380

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| RUN | High | `src/lib/draft-sync.ts:139-143` | `db.update(...)` in the catch is never `.run()` → failed draft finalize is silently not marked `DRAFT_FAILED`. |
| JSON-1 | Medium | `src/lib/scheduler.ts:245` | Unguarded `JSON.parse` of `*_last_result`; one bad row breaks the whole Scheduled Jobs status list. `safeJsonParse` exists. |
| JSON-2 | Low | `src/lib/task-registry.ts:79` | Unguarded `JSON.parse` of persisted `lastResult` in the hot System Tasks status path. |
| FMT | Medium | `src/lib/format-timestamp.ts:1-16` | Renders literal "Invalid Date" on bad input instead of empty (try/catch never fires). |
| TABLE | Medium | `src/lib/adf-to-markdown.ts:309-319` | `convertTable` `hasHeader` branches are byte-identical; flag is dead, headerless tables mis-rendered. |
| TEAM | Medium | `src/lib/sprint-utils.ts:4-7` vs `src/lib/epic-children-grouping.ts:216-219` | `extractTeamPrefix` and `sprintTeamToken` extract the same concept with different rules. |
| GUARD | Medium | `src/components/ticket-detail/EpicChildrenSection.tsx:83`, `EpicChildrenBySprint.tsx:102`, `EpicProgressToolbar.tsx:29` | `isEpicChild` type guard triplicated. |
| DEAD-1 | Medium | `src/hooks/useSprintBoard.ts:173-179` | Unused `useActivityStatus` export collides by name with the real `ActivityContext` one. |
| STATE-NAN | Low | `src/lib/epic-children-grouping.ts:64` | `STATE_ORDER[...] - STATE_ORDER[...]` can be `NaN` on dirty `state`; non-deterministic sort. |
| FETCHER | Low | `src/components/SWRProvider.tsx:6` | Default fetcher returns `null` on non-ok instead of throwing; failures look like "loaded null". |
| SCORES | Low | `src/lib/cleanup-types.ts:163` + 3 runners | `scanScores` parse pattern reimplemented inline x3 alongside the canonical `parseScanScores`. |
| TIMERS | Low | `src/hooks/useBulkSuggest.ts:47`; `src/lib/event-bus.ts:56-65` | Toast `setTimeout` with no cleanup; SSE reconnect with fixed delay, no backoff/cap. |
| BACKLOG-KEY | Low | `src/lib/sprint-utils.ts:135` | `slugToSprintId` order record has a dead `backlog` state key. |

## Larger structure (no story; tracked for future decomposition)

- Oversized components mixing concerns: `TicketStatusPill.tsx` (1191; pill + dropdown + portal
  hover-card + review logic), the `EpicChildrenSection`/`EpicChildrenBySprint` pair (1374 + 925;
  divergent copies of group-by-sprint DnD). Candidate decomposition stories, not part of this
  audit's remediation scope.

## Verified clean (notable non-findings)

- Attachment proxy: protocol + hostname allow-list, sanitized filename, no traversal.
- Agent proxy / SSE: fixed base URL, validated path params, timeouts/abort handling.
- Dev bypass: `development`-only, `httpOnly` cookie, 404 in prod.
- `cron.ts` regex is not ReDoS-prone; `deprecated-area-matcher.ts` escapes user terms.
- Read paths `/api/tickets` and `ticket-detail-builder.ts` are already batched (no N+1 on reads).
- DOMPurify defaults already block the core `javascript:` href in sanitized HTML (the XSS finding
  is on the React markdown renderer path, which does not go through DOMPurify).
