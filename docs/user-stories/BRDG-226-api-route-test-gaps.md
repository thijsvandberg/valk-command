# BRDG-226: Close API Route Test Gaps

**Status:** Done
**Priority:** High
**Type:** Testing

## Implementation Plan

16 new test files + 1 enhancement, grouped into 5 commits:

1. **Simple DB-only and passthrough routes** (4 files): assignable-users, labels, epics, attachments/[id]
2. **Jira write operations** (3 files): assign, rank, story-writer/create
3. **Jira sync routes** (3 files): sync-comments, sync-epics, sync-links
4. **Story writer and ticket push/pull** (5 files): finalize-draft, retry-draft, active-sessions, pull-from-jira, push-to-jira
5. **Scheduler tick + comments enhancement** (1 new + 1 modified)

6. **Missed routes (found during build verification)** (3 files): subtasks/rank, subtasks/close, story-writer/split

**Skipped routes (do not exist):** /api/jira/users, bulk pull/push-from-jira, settings/[key], stakeholder/overview, stakeholder/sprints, pipelines/[ticketKey]/deployments, refinement-sessions/[id]/reorder

**Already covered:** refinement-sessions/[id]/bulk-suggest-subtasks, tickets/[key]/attachments

## Description

Audit revealed untested API routes including critical data-sync endpoints (Jira sync, push/pull), the story-writer lifecycle, and scheduler infrastructure. These are high-risk areas where silent regressions could corrupt data or break core workflows.

## Acceptance Criteria

- [x] All listed routes have at least one happy-path and one error-path test
- [x] Tests follow existing pattern: `// @vitest-environment node`, `createTestDb()`, co-located `route.test.ts`
- [x] `npm run test` and `npm run build` pass

## Prerequisites

Implement BRDG-229 (test infrastructure) first or in parallel. The test data builders and request helpers from BRDG-229 significantly reduce boilerplate for these tests.

## Reference Pattern

Use `src/app/api/jira/sync-tickets/route.test.ts` as the gold standard. It demonstrates: environment setup, DB mocking via `createTestDb()`, client mocking for `jira-client`, request construction, response validation, and DB assertion patterns.

### Standard Mock Setup

Every API route test in this story should start with these mocks:

```typescript
// @vitest-environment node
vi.mock("@/db", () => ({ get db() { return testDb; } }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
```

---

## Part 1: Critical (data integrity / core feature)

### 1.1 Jira Sync Routes

#### `POST /api/jira/sync-comments`
**File:** `src/app/api/jira/sync-comments/route.ts`
**What it does:** Fetches comments from Jira for a ticket key, converts ADF to Markdown, upserts into `jiraComment` table.
**Mocks needed:** `jiraClient.getComments`, `adfToMarkdown`, `registerSync/unregisterSync`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: syncs 3 comments, returns `{ ok: true, count: 3 }`
- [x] Upserts correctly (no duplicates on re-sync)
- [x] Missing `key` query param returns 400
- [x] Jira API failure returns 500
- [x] AbortError returns 499
- [x] Activity log entry created with duration

#### `POST /api/jira/sync-epics`
**File:** `src/app/api/jira/sync-epics/route.ts`
**What it does:** Fetches all epics from Jira via JQL, upserts via `upsertIssue()`. Background task regenerates stale epic summaries via agent skill.
**Mocks needed:** `jiraClient.searchAllIssues`, `upsertIssue`, `agentFetch`, `cache.invalidate`, `next/server.after`
**Test scenarios:**
- [x] Happy path: syncs N epics, returns `{ count: N }`
- [x] No epics found returns `{ count: 0 }`
- [x] Jira API failure returns 500
- [x] Stale summary detection triggers background re-generation (mock `after()` to execute immediately)
- [x] Cache invalidation for `/api/epics` and `/api/tickets`

#### `POST /api/jira/sync-links`
**File:** `src/app/api/jira/sync-links/route.ts`
**What it does:** Batch-syncs issue links from Jira (50 tickets per batch). Preserves locally-created links (jiraLinkId IS NULL), replaces all Jira-sourced links.
**Mocks needed:** `jiraClient.getIssueLinksByKeys`, `cache.invalidate`
**Test scenarios:**
- [x] Happy path: syncs links for 5 tickets, returns `{ synced, total }`
- [x] Locally-created links preserved (not deleted during sync)
- [x] Partial batch failure: non-fatal, increments `batchErrors`
- [x] No tickets in DB: returns `{ synced: 0, total: 0 }`
- [x] Cache invalidation for `/api/tickets`

#### `GET /api/jira/assignable-users`
**File:** `src/app/api/jira/assignable-users/route.ts`
**What it does:** Returns distinct assignees from local ticket table, enriched with favorite status and team assignments. No external API calls.
**Mocks needed:** None (DB-only query)
**Test scenarios:**
- [x] Returns users sorted case-insensitive with initials computed
- [x] Enriches with `isFavorite` from `favoriteUser` table
- [x] Enriches with `teams` from `userTeamAssignment` table
- [x] Empty tickets table returns `{ users: [] }`
- [x] Exception returns 500 with `{ users: [], error }`

#### `POST /api/jira/assign`
**File:** `src/app/api/jira/assign/route.ts`
**What it does:** Assigns a Jira issue via API, updates local ticket assignee, syncs timestamp.
**Mocks needed:** `jiraClient.assignIssue`, `syncJiraTimestamp`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: assigns user, updates local DB, returns `{ ok: true }`
- [x] Unassign (accountId=null): clears assignee
- [x] Missing `issueKey` returns 400
- [x] Jira API failure returns 500
- [x] Cache invalidation for `/api/tickets`

#### `GET /api/jira/labels`
**File:** `src/app/api/jira/labels/route.ts`
**What it does:** Simple passthrough to `jiraClient.getLabels()`.
**Mocks needed:** `jiraClient.getLabels`
**Test scenarios:**
- [x] Returns `{ labels: [...] }` from Jira
- [x] Jira failure returns empty array with 500

#### `POST /api/jira/rank`
**File:** `src/app/api/jira/rank/route.ts`
**What it does:** Calls Jira rankIssues API, then optionally recalculates local jiraRank values for the sprint.
**Mocks needed:** `jiraClient.rankIssues`, `syncJiraTimestamp`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path with rankBeforeKey: calls Jira, returns `{ ok: true }`
- [x] Happy path with rankAfterKey: calls Jira, returns `{ ok: true }`
- [x] With sprintId: recalculates local rank order in DB
- [x] Empty issueKeys returns 400
- [x] Missing both rankBefore and rankAfter returns 400
- [x] Jira failure returns 500; local recalc failure logged but non-fatal

#### `GET /api/jira/users`
<!-- skipped: route file does not exist; functionality covered by /api/jira/assignable-users -->
**File:** `src/app/api/jira/users/route.ts` (verify existence, may overlap with assignable-users)
**Test scenarios:** TBD after verifying route exists

### 1.2 Ticket Sync Routes

#### `POST /api/tickets/[key]/pull-from-jira`
**File:** `src/app/api/tickets/[key]/pull-from-jira/route.ts`
**What it does:** Thin wrapper that validates key param and delegates to `ticketService.pullFromJira()`.
**Mocks needed:** `ticketService.pullFromJira`, `validatePathParam`, `handleServiceError`
**Test scenarios:**
- [x] Happy path: delegates to service, returns service result
- [x] Invalid key returns 400
- [x] Service error handled via `handleServiceError()`

#### `POST /api/tickets/[key]/push-to-jira`
**File:** `src/app/api/tickets/[key]/push-to-jira/route.ts`
**What it does:** Validates key (draft-aware via `resolveDraftKey()`), delegates to `ticketService.pushToJira()`. Handles conflict as valid response.
**Mocks needed:** `ticketService.pushToJira`, `resolveDraftKey`, `validatePathParam`, `handleServiceError`
**Test scenarios:**
- [x] Happy path: pushes to Jira, returns success
- [x] DRAFT-xxx key resolved to real key via `resolveDraftKey()`
- [x] `force: true` body bypasses conflict check
- [x] Conflict response returned as valid (not error)
- [x] Invalid key returns 400

#### `POST /api/tickets/pull-from-jira` (bulk)
<!-- skipped: bulk route file does not exist in the codebase -->
**Test scenarios:** Same pattern as single-ticket version, but for multiple keys.

#### `POST /api/tickets/push-to-jira` (bulk)
<!-- skipped: bulk route file does not exist in the codebase -->
**Test scenarios:** Same pattern as single-ticket version, but for multiple keys.

### 1.3 Story Writer Lifecycle

#### `POST /api/story-writer/create`
**File:** `src/app/api/story-writer/create/route.ts`
**What it does:** Creates a new Jira story with empty ADF body, inserts minimal local ticket + metadata (readiness=drafting), logs activity.
**Mocks needed:** `jiraClient.createIssue`, `logActivity`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: creates Jira issue, inserts ticket + metadata, returns `{ key }` (201)
- [x] Missing/empty title returns 400
- [x] Jira creation failure returns 502
- [x] Metadata readiness set to "drafting"
- [x] Activity log entry created

#### `POST /api/story-writer/finalize-draft`
**File:** `src/app/api/story-writer/finalize-draft/route.ts`
**What it does:** Swaps DRAFT-xxx key for real Jira key via `finalizeDraft()`.
**Mocks needed:** `finalizeDraft`, `parseJsonBody`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: returns `{ success: true, realKey }`
- [x] Missing draftKey returns 400
- [x] Missing realKey returns 400
- [x] Finalization failure returns 500

#### `POST /api/story-writer/retry-draft`
**File:** `src/app/api/story-writer/retry-draft/route.ts`
**What it does:** Resets a DRAFT_FAILED ticket to DRAFTING status, clears description, fires background Jira sync.
**Mocks needed:** `syncDraftToJira`, `parseJsonBody`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: resets status, returns `{ status: "retrying" }`
- [x] draftKey not starting with DRAFT- returns 400
- [x] Draft not found in DB returns 400
- [x] Draft not in DRAFT_FAILED state returns 400
- [x] Background sync error caught silently

#### `GET/DELETE /api/story-writer/active-sessions`
**File:** `src/app/api/story-writer/active-sessions/route.ts`
**What it does:** GET: returns active sessions with ticket/metadata joins, filtered by has-messages. DELETE: sets session status=discarded.
**Mocks needed:** None (DB-only queries)
**Test scenarios:**
- [x] GET: returns sessions with ticket title, sprint, epic, readiness
- [x] GET: filters out sessions without messages
- [x] GET: includes target ticket title via correlated subquery
- [x] GET: ordered by updatedAt DESC
- [x] DELETE: sets status=discarded, returns `{ ok: true }`
- [x] DELETE: missing sessionId returns 400

### 1.4 Scheduler

#### `POST/GET /api/scheduler/tick`
**File:** `src/app/api/scheduler/tick/route.ts`
**What it does:** POST: lazy-cron that executes overdue tasks. GET: returns status of all registered tasks.
**Mocks needed:** `tick`, `getTaskStatuses`, `getIndependentTaskStatuses`
**Test scenarios:**
- [x] POST: calls tick(), returns result
- [x] GET: returns combined shared + independent task statuses
- [x] Error handling in tick() propagation

---

## Part 2: High (feature coverage)

### 2.1 Epics

#### `GET /api/epics`
**File:** `src/app/api/epics/route.ts`
**What it does:** Returns all epics with child counts, stale summary detection, sorted by activity. Uses cache (300s TTL).
**Mocks needed:** `cache.get`, `cache.set`
**Test scenarios:**
- [x] Cache HIT: returns cached data with header
- [x] Cache MISS: queries DB, sets cache, returns with header
- [x] Child count aggregation correct
- [x] Stale summary detection (summaryUpdatedAt < jiraUpdatedAt)
- [x] Includes epics referenced by children but not synced as type=epic
- [x] Sorted by most recent activity first, then by child count
- [x] Exception returns 500

### 2.2 Ticket Secondary Routes

#### `POST /api/tickets/[key]/subtasks/rank`
**File:** `src/app/api/tickets/[key]/subtasks/rank/route.ts`
**What it does:** Ranks a subtask in Jira, syncs parent timestamp, invalidates cache, logs activity.
**Mocks needed:** `jiraClient.rankIssues`, `syncJiraTimestamp`, `logActivity`, `cache.invalidate`, `validatePathParam`
**Test scenarios:**
- [x] Happy path with rankBeforeKey
- [x] Happy path with rankAfterKey
- [x] Missing movedKey returns 400
- [x] Missing both rankBefore and rankAfter returns 400
- [x] Jira failure returns 502

#### `POST /api/tickets/[key]/subtasks/close`
**File:** `src/app/api/tickets/[key]/subtasks/close/route.ts`
**What it does:** Bulk-closes open subtasks when parent is DONE/DEPRECATED. Transitions each in Jira, updates local DB.
**Mocks needed:** `jiraClient.transitionIssue`, `syncJiraTimestamp`, `logActivity`, `cache.invalidate`, `applyRateLimit`
**Test scenarios:**
- [x] Happy path: closes 3 subtasks, returns `{ closed: 3, results: [...] }`
- [x] Parent not DONE/DEPRECATED returns 400
- [x] No open subtasks returns `{ closed: 0 }`
- [x] Jira transition failure for one subtask: marked with error, others still close
- [x] DB updated even if Jira fails (non-fatal)
- [x] Activity log records success + failure counts

#### `GET/POST /api/tickets/[key]/comments`
**File:** `src/app/api/tickets/[key]/comments/route.ts`
**What it does:** GET: returns PO comments + Jira comments via prepared statements. POST: inserts sanitized PO comment.
**Mocks needed:** `preparedPoComments`, `preparedJiraComments`, `sanitizeHtml`, `validatePathParam`, `applyRateLimit`
**Test scenarios:**
- [x] GET: returns both PO and Jira comments
- [x] POST: inserts comment with sanitized HTML, returns 201
- [x] POST: empty content returns 400
- [x] POST: content > 10k chars returns 400
- [x] POST: author defaults to "Product Owner" if empty

#### `GET /api/tickets/[key]/attachments`
**File:** `src/app/api/tickets/[key]/attachments/route.ts`
**What it does:** Returns ticket attachments with computed status (cleaned/available/pending).
**Mocks needed:** `validatePathParam`
**Test scenarios:**
- [x] Returns attachments with correct status computation
- [x] `cleanedAt` set: status = "cleaned"
- [x] `downloadedAt` set: status = "available"
- [x] Neither set: status = "pending"

#### `POST /api/tickets/[key]/story-writer/split`
**File:** `src/app/api/tickets/[key]/story-writer/split/route.ts`
**What it does:** Splits a story: creates new Jira issue (or uses existing target), creates bidirectional links, updates session.
**Mocks needed:** `jiraClient.createIssue`, `logActivity`, `validatePathParam`, `applyRateLimit`, `resolveDraftKey`
**Test scenarios:**
- [x] Happy path (new target): creates Jira story, inserts ticket, creates bidirectional links, returns 201
- [x] Happy path (existing targetKey): skips Jira creation, links to existing ticket
- [x] No active session for key returns 404
- [x] Original ticket not found returns 404 <!-- skipped: FK constraint prevents session without ticket -->
- [x] targetKey not found locally returns 404
- [x] Jira create fails returns 502
- [x] Bidirectional split links created (split to / is split from)

---

## Part 3: Low (operational)

#### `DELETE /api/settings/[key]`
<!-- skipped: no generic settings/[key] route exists; settings use per-type routes -->
- [ ] Deletes setting, returns 200
- [ ] Non-existent key returns success (idempotent)

#### `GET /api/stakeholder/overview`
<!-- skipped: route file does not exist (only /api/stakeholder/analysis exists) -->
- [ ] Returns overview data
- [ ] Error handling

#### `GET /api/stakeholder/sprints`
<!-- skipped: route file does not exist -->
- [ ] Returns sprint list for stakeholder view
- [ ] Error handling

#### `GET /api/pipelines/[ticketKey]/deployments`
<!-- skipped: route file does not exist -->
- [ ] Returns deployments for ticket
- [ ] No deployments returns empty array

#### `POST /api/refinement-sessions/[id]/reorder`
<!-- skipped: route file does not exist -->
- [ ] Reorders tickets in session
- [ ] Invalid session ID returns 404

#### `GET/POST /api/refinement-sessions/[id]/bulk-suggest-subtasks`
**Note:** Complex route with agent integration, streaming, timeout handling.
Tests already exist in `route.test.ts`.
- [x] GET: returns `{ conversationId, hasRun, isRunning }`
- [x] POST: initiates bulk suggest, returns 202 with `{ conversationId }`
- [x] POST with force=false: skips tickets with fresh suggestions
- [x] Session not found returns 404
- [x] Session with no tickets returns 400

#### `GET /api/attachments/[id]`
**Note:** Proxies Jira attachment downloads. SSRF protection is security-critical.
- [x] Happy path: proxies file with correct Content-Type and Content-Disposition
- [x] Attachment not found returns 404
- [x] No Jira credentials returns 503
- [x] Non-HTTPS URL returns 403
- [x] Hostname not in allowlist returns 403
- [x] Jira fetch failure returns 502

## Notes

- Debug and dev-only routes (`/api/debug/*`, `/api/dev/*`, `/api/fix-epic-types`) are intentionally excluded
- Sprint CRUD routes (`/api/sprints`) do not exist in the codebase; removed from scope
- `/api/scheduler/trigger` does not exist; only `/api/scheduler/tick` needs testing
- `/api/jira/users` needs verification; may overlap with `/api/jira/assignable-users`
- Prioritize Part 1 first as these touch external systems and data sync
