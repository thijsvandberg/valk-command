# API Routes Reference

## Authentication

All routes (API and page) are protected by Clerk middleware (`@clerk/nextjs`). The middleware is configured in `src/middleware.ts`.

| Detail | Value |
|--------|-------|
| Public routes | `/login`, `/sign-in`, `/sign-up` |
| Unauthenticated API requests | Returns `401 { "error": "Authentication required" }` |
| Unauthenticated page requests | Redirects to `/login` |
| Org restriction | `CLERK_ORG_ID` env var restricts access to one Clerk org |
| Dev bypass | `BYPASS_AUTH=true` disables auth in `NODE_ENV=development` |

The `CLERK_ORG_ID` check requires the signed-in user to have the Bridge Clerk organization set as their active organization. The login UI is the embedded Clerk `<SignIn />` component rendered at `/login`.

All routes live under `src/app/api/`. Next.js App Router conventions: each `route.ts` exports HTTP method handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).

## Jira Sync

Sync engine for pulling Jira data into the local SQLite database. See [jira-sync.md](jira-sync.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jira/sync-incremental` | POST | Watermark-based incremental sync (background, every 150s) |
| `/api/jira/sync-tickets` | POST | Full sprint sync. `?strategy=bulk\|timestamp-first`. Body `{ ticketKeys }` syncs specific keys (max 100). `?mode=plan&sprintId=X\|&epicKey=Y` returns `{ keys }` (current Jira membership, rank-ordered). `?mode=reconcile&sprintId=X\|&epicKey=Y` + body `{ keys }` restores rank order and reconciles tickets that left the sprint/epic. Used by the tranched per-group sync (BRDG-282) |
| `/api/jira/sync-sprints` | POST | Fetch and cache sprint list from Jira |
| `/api/jira/sync-comments` | POST | Sync comments for a specific ticket |
| `/api/jira/check-updated` | GET | Lightweight freshness check for a single ticket |
| `/api/jira/health` | GET | Verify Jira connectivity |
| `/api/jira/watchers` | GET | List the current watchers of an issue (`?issueKey=X`). Fetched on demand; not persisted locally |
| `/api/jira/watchers` | POST | Add a watcher. Body: `{ issueKey, accountId }` |
| `/api/jira/watchers` | DELETE | Remove a watcher (`?issueKey=X&accountId=Y`) |
| `/api/jira/watcher-candidates` | GET | Assignable users from Jira (real accountIds) for the watcher picker, enriched with favorites/teams |
| `/api/jira/sprints` | POST | Create a new sprint in Jira and add to local cache |
| `/api/jira/sprints/[id]` | PUT | Update sprint metadata (goal, dates) via Jira Agile API |
| `/api/jira/sprints/[id]/close` | POST | Close (finish) an active sprint via Jira Agile API; flips cached state to `closed` |
| `/api/jira/sprints/[id]/start` | POST | Start (activate) a future sprint via Jira Agile API; flips cached state to `active`. Body: `{ startDate?, endDate }` (endDate required). Prefers the given start date, falls back to "now" if Jira rejects it |
| `/api/jira/move-sprint` | POST | Move issues to a sprint (or `__backlog__`). Body: `{ issueKeys, targetSprintId }`. Used by the sprint board and the epic Child Issues by-sprint view (drag/menu). |
| `/api/jira/rank` | POST | Re-rank issues relative to another via Jira Agile rank, then refresh local `jiraRank`. Body: `{ issueKeys, rankBeforeKey? \| rankAfterKey?, sprintId? }`. Used by the sprint board and by drag-to-reorder of epic children within a sprint. A cross-sprint drag onto a row calls `move-sprint` then `rank` to land the child at that position. |

## Epics

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/epics` | GET | List all epics with summary, child count, staleness |
| `/api/epics/[key]/summary` | PATCH | Update epic summary manually. Body: `{ summary }` |
| `/api/epics/generate-summaries` | POST | Invoke workspace `summarize-epics` skill to generate summaries for all epics |

### Epic Writer

Epic mode of the Story Writer. The epic is the subject ticket; sessions reuse `story_writer_session` (`mode: "epic"`). See [story-writer.md](story-writer.md).

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/epics/[key]/writer/session` | GET | Get active epic session (phase + messages + drafts + breakdown cards); resumable. Created cards are enriched with their live sprint (`liveSprintId` from `ticket.sprintName`, `liveSprintName` via `sprintNameCache`; both null for DRAFT cards and backlog) |
| `/api/epics/[key]/writer/session` | POST | Create epic session (`mode: "epic"`, snapshots epic description; near-empty epic is valid) |
| `/api/epics/[key]/writer/phase` | PATCH | Set the session phase. Body: `{ phase }`. Free movement, no transition guard |
| `/api/epics/[key]/writer/messages` | POST | Send a chat turn. Phase-aware: `feed` invokes `write-story-draft` (epic body enrichment); `discovery`/`breakdown`/`refine`/`detail`/`sprints` invoke the `break-down-epic` skill with the current phase + existing breakdown. The `detail` phase additionally carries the `<story-detail index="N">` tag contract so deepened cards land back on the board. No direct LLM in Bridge |
| `/api/epics/[key]/writer/apply-output` | POST | Parse `break-down-epic` output. Persists `<epic-breakdown>` cards into `epic_child_draft` (full-set replace, preserving created cards' Jira keys by index); merges `<story-detail index="N">` bodies onto cards by index (depth -> "full"), applying even when no breakdown is present; pre-fills `suggestedSprintId` from a `<sprint-plan>` block (per-card `{ index, sprintId }`; sprint id or `__backlog__`; a same-turn plan wins over a breakdown card's own suggestion); reports whether `<epic-questions>` is present. Body: `{ output, taskId? }` -> `{ hasQuestions, cardCount, detailedCount, plannedCount, applied }` |
| `/api/epics/[key]/writer/cards/[index]` | PATCH | Edit a child card's worked-out body in place (PO hand-edit of detailed content). Body: `{ body: string \| null }`; an empty/whitespace body clears the detail (depth -> bullets) |
| `/api/epics/[key]/writer/create-in-jira` | POST | Promote one DRAFT card to a real Jira issue under the epic (created with `parentKey = epic`, so the epic-child link is set at creation). The card's worked-out body (or its bullets) becomes the description; a local `ticket` + `ticketMetadata` row is inserted (`epicKey` set) and the card flips to `status: created` with `jiraKey`. Idempotent: a created card returns its key without re-creating. After creation the chosen placement is applied via the existing `moveToSprint` plumbing (`__backlog__` = no move; `__default__` resolves to `default_sprint_id`, empty = backlog); a failed sprint move keeps the created issue (`sprintMoveFailed: true`). Reassignment afterwards reuses `POST /api/jira/move-sprint`. Body: `{ cardIndex, placement? }` (placement: sprint id \| `__backlog__` \| `__default__`) -> `{ ok, cardIndex, jiraKey, sprintId, sprintMoveFailed, alreadyCreated? }` |
| `/api/epics/[key]/writer/link-children` | POST | Create one PO-confirmed inter-story link between two child cards. Both ends must already be `created` in Jira; creates the Jira link + bidirectional local `ticketLink` rows (idempotent) and marks the matching `suggestedLink.confirmed` on the source card. Nothing reaches Jira until confirmed. Body: `{ sourceIndex, targetIndex, relation }` -> `{ ok, sourceKey, destKey, relation }` |

## Sprints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sprints/[id]/suggest-goal` | POST | Invoke workspace skill to generate a sprint goal suggestion |
| `/api/sprints/pencil-capacity` | GET | Get all sprints' forward-planning pencil capacities (BRDG-303) |
| `/api/sprints/pencil-capacity` | PUT | Upsert one sprint's pencil capacity (`{ sprintId, capacity }`; `capacity: null` clears it). Bridge-local, never synced to Jira. |
| `/api/sprints/used-points` | GET | Total effective points (real SP, else guestimation) per sprint across all tickets AND active placeholders (BRDG-303/304). Drives the fullness meter so it reflects the whole sprint, not just the open epic's children. |

## Placeholder Tickets (BRDG-304)

Bridge-local forward-planning stand-ins. Never touch Jira until promoted.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/placeholders` | GET | List active placeholders; optional `?sprintId=` / `?epicKey=` filters |
| `/api/placeholders` | POST | Create a placeholder (`{ title, description?, type?, sprintId?, epicKey?, businessValue?, guestimation? }`); returns 201 with a `PLH-<uuid>` id |
| `/api/placeholders/[id]` | PATCH | Update title/description/type/sprint/epic/BV/guestimation (validated) |
| `/api/placeholders/[id]` | DELETE | Delete the placeholder row (it never reached Jira) |
| `/api/placeholders/[id]/promote` | POST | Promote into a real Jira ticket via the shared `createTicketWithJira` helper: carries the description (as a local edit), BV + guestimation (to `ticket_metadata`), and marks the placeholder `promoted` with `promoted_to_key`. Returns `{ key }`. |
| `/api/placeholders/reorder` | POST | Rewrite a sprint group's placeholder order (`{ orderedIds }`, top-to-bottom) by setting `order_index` (BRDG-328). Cross-sprint moves use `PATCH /:id` with `sprintId`. |

## Tickets

CRUD operations on locally stored tickets and their metadata.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tickets` | GET | List tickets. `?sprintId=X` filters by sprint |
| `/api/tickets` | POST | Create a story/task/bug in Jira and mirror it locally. Body: `{ title, issueType?, sprintId?, epicKey? }`. `issueType` defaults to `Story`; `sprintId` lands it in a sprint (via the same field-edit path as drag-to-sprint, applied after create); `epicKey` links it under an epic. New tickets start at readiness `drafting`. Used by the Sprint Board inline "Add story" composer (single sprint and per-sprint group in the All view). |
| `/api/tickets/[key]` | GET | Get single ticket with metadata, subtasks, links, local edits |
| `/api/tickets/[key]` | PUT | Update ticket fields |
| `/api/tickets/[key]` | PATCH | Partial update: `flagged` (+ optional `flagReason`, synced to Jira as a comment), `labels`, `epicKey`, `type`, `storyPoints`. Setting `storyPoints` to any value (including `0`/"-") auto-advances a ticket at readiness `ready_to_refine` to Ready for Development (`readiness = null`); other readiness states are left untouched. Bulk flag from the Sprint Board fans out one PATCH per ticket. |
| `/api/tickets/[key]/metadata` | GET | Get PO metadata |
| `/api/tickets/[key]/metadata` | PUT | Update PO metadata (readiness, scores, notes, business value, guestimation) |
| `/api/tickets/[key]/comments` | GET | List Jira + PO comments |
| `/api/tickets/[key]/comments` | POST | Create PO comment |
| `/api/tickets/[key]/comments/[id]` | DELETE | Delete PO comment |
| `/api/tickets/[key]/attachments` | GET | List attachments |
| `/api/tickets/[key]/attachments` | POST | Upload attachment metadata |
| `/api/tickets/[key]/local-edits` | GET | Get local edits for a ticket |
| `/api/tickets/[key]/local-edits` | POST | Save a local edit (title or description) |
| `/api/tickets/[key]/versions` | GET | List story version history |
| `/api/tickets/[key]/versions` | POST | Create manual version snapshot |
| `/api/tickets/[key]/versions/[id]` | DELETE | Delete a version |
| `/api/tickets/[key]/reviews` | GET | List stored reviews |
| `/api/tickets/[key]/reviews` | POST | Store a review result |
| `/api/tickets/[key]/pull-from-jira` | POST | Force refresh single ticket from Jira |
| `/api/tickets/[key]/push-to-jira` | POST | Push local edits to Jira |
| `/api/tickets/[key]/dev-info` | GET | Bitbucket development info (branches, PRs, pipelines) |
| `/api/tickets/[key]/related-suggestions` | GET | Return cached AI-suggested related issues |
| `/api/tickets/[key]/related-suggestions` | POST | Discover related issues via workspace `find-related` skill (cached 30 min) |
| `/api/tickets/[key]/related-suggestions` | DELETE | Clear cached suggestions for this ticket |
| `/api/tickets/[key]/suggest-epic` | POST | Invoke workspace `suggest-epic` skill. Returns `{ taskId, streamUrl }` |
| `/api/tickets/[key]/subtask-suggestions` | GET | Return persisted pending AI subtask suggestions |
| `/api/tickets/[key]/subtask-suggestions` | PUT | Parse and persist suggestions (replaces existing). Body: `{ suggestions: string[] }` or `{ output: string }` |
| `/api/tickets/[key]/subtask-suggestions` | DELETE | Remove single suggestion (`{ id }`) or all for ticket |
| `/api/tickets/[key]/subtasks/close` | POST | Bulk-close all open subtasks (requires parent DONE/DEPRECATED) |
| `/api/tickets/[key]/subtasks/[subtaskKey]/close` | POST | Close a single subtask (transition to DONE; no parent guard) |

## Story Writer

AI-assisted story editing sessions. See [story-writer.md](story-writer.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tickets/[key]/story-writer` | GET | Get active session with messages, drafts, candidates |
| `/api/tickets/[key]/story-writer` | POST | Create new session |
| `/api/tickets/[key]/story-writer` | PATCH | Update session (drafts, titles, status) |
| `/api/tickets/[key]/story-writer` | DELETE | Close/discard session |
| `/api/tickets/[key]/story-writer/messages` | POST | Send message (invokes workspace skill) |
| `/api/tickets/[key]/story-writer/apply-draft` | POST | Extract and persist AI drafts from task output |
| `/api/tickets/[key]/story-writer/apply-draft` | DELETE | Dismiss a specific AI draft |
| `/api/tickets/[key]/story-writer/apply-related` | GET | List related story candidates |
| `/api/tickets/[key]/story-writer/apply-related` | POST | Parse and store AI-found related stories |
| `/api/tickets/[key]/story-writer/apply-related` | PATCH | Toggle link state for a related candidate |
| `/api/tickets/[key]/story-writer/split` | POST | Activate split mode (link or create target ticket) |
| `/api/tickets/[key]/story-writer/logs/[taskId]` | GET | Fetch execution logs for a task |

## Conversations & Chat

General-purpose chat conversations with the workspace.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List all conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations/[id]` | GET | Get conversation details |
| `/api/conversations/[id]` | PUT | Update conversation (title, related ticket) |
| `/api/conversations/[id]` | DELETE | Delete conversation and messages |
| `/api/conversations/bulk` | PATCH | Bulk operations: delete, markRead, markUnread. Body: `{ ids: string[], action }` |
| `/api/conversations/[id]/messages` | GET | List messages in conversation |
| `/api/conversations/[id]/messages` | POST | Add message to conversation |

## Workspace Tasks

Proxy layer to the valk-agent backend. See [workspace-integration.md](workspace-integration.md) for architecture details.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workspace-tasks` | GET | List all tasks from agent |
| `/api/workspace-tasks` | POST | Submit new task (skill invocation) |
| `/api/workspace-tasks/[id]` | GET | Get task status |
| `/api/workspace-tasks/[id]` | DELETE | Delete/cancel task |
| `/api/workspace-tasks/[id]/stream` | GET | SSE stream of task progress |
| `/api/workspace-tasks/health` | GET | Agent health check |

## Search

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/search/local` | GET | Fuzzy search local DB via Fuse.js. `?q=text`. Wrapping the query in double quotes (`?q="exact phrase"`) switches to a literal, case-insensitive phrase match (no fuzzy). |
| `/api/search/jira` | GET | Live Jira search. `?q=text` or `?jql=...` |

## Activity Log

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/activity-log` | GET | Query activity log. `?limit=N` |
| `/api/activity-log` | POST | Create activity log entry |
| `/api/activity-log/[id]/acknowledge` | POST | Mark entry as read |
| `/api/activity-log/[id]/cancel` | POST | Cancel a running operation |
| `/api/activity-log/acknowledge-all` | POST | Mark all entries as read |
| `/api/activity-log/cancel-all` | POST | Cancel all running operations |

## Jobs & Scheduler

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jobs` | GET | List scheduled jobs |
| `/api/jobs` | POST | Create scheduled job |
| `/api/jobs/[id]` | GET | Get job details |
| `/api/jobs/[id]` | PUT | Update job |
| `/api/jobs/[id]` | DELETE | Delete job |
| `/api/scheduler/tick` | POST | Trigger lazy-cron tick (runs overdue, enabled tasks) |
| `/api/scheduler/tick` | GET | Get status of all scheduled tasks (`enabled` is the effective persisted-or-default value) |
| `/api/scheduler/tasks` | POST | Toggle a task on/off `{ name, enabled }`; persists to `app_setting`. 404 unknown task, 400 invalid body (Backlog Deprecation Review epic). |
| `/api/scheduler/tasks` | GET | Convenience read of all task statuses `{ tasks }`. |
| `/api/scheduler/run/[name]` | POST | Run a task immediately, bypassing interval AND enabled checks (manual override). Returns `{ ran, result }` or 404. |

## Refinement Sessions

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/refinement-sessions` | GET | List all saved sessions (newest first, limit 50) |
| `/api/refinement-sessions` | POST | Create session (optional: `name`, `ticketKeys`) |
| `/api/refinement-sessions/[id]` | GET | Get session detail |
| `/api/refinement-sessions/[id]` | PATCH | Update name, ticketKeys, status, generalComment, currentIndex |
| `/api/refinement-sessions/[id]` | DELETE | Delete session |
| `/api/refinement-sessions/[id]/ticket-notes` | GET | List per-ticket PO notes for a session |
| `/api/refinement-sessions/[id]/ticket-notes` | PUT | Upsert a ticket note (`ticketKey`, `content`); empty content deletes |

## Live Events (SSE)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/events` | GET | Unified SSE stream of ticket and refinement events (BRDG-342). Each message is a `BridgeEventEnvelope` (`{ channel: "ticket" \| "refinement", event }`); 15s heartbeat. Clients never connect directly: the shared event bus (`src/lib/event-bus.ts`) holds at most one connection per browser via Web Locks leader election + BroadcastChannel fan-out, and hooks (`useTicketEvents`, `useTicketEventsStream`, `useRefinementStream`) filter by channel/key client-side. Replaced `/api/tickets/[key]/events`, `/api/tickets/events`, and `/api/refinement-sessions/stream`. |

## Settings & Config

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/config` | GET | App configuration (next sprint ID) |
| `/api/settings/column-widths` | GET | Get saved column widths |
| `/api/settings/column-widths` | POST | Save column widths |
| `/api/settings/quick-prompts` | GET | Get quick prompt templates |
| `/api/settings/quick-prompts` | POST | Save quick prompt templates |
| `/api/settings/section-visibility` | GET | Get field visibility for a section (`?section=epic-children\|subtasks`) |
| `/api/settings/section-visibility` | PUT | Save field visibility for a section |
| `/api/sprint-slots` | GET | Get sprint slot assignments |
| `/api/sprint-slots` | POST | Save sprint slot assignments |

## Pipelines (BRDG-078)

CI/CD pipeline feed with Bitbucket integration, notifications, and deploy tracking.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/pipelines` | GET | List pipeline runs. `?repo=X&ticketKey=X&sprintTickets=X,Y&limit=N` |
| `/api/pipelines` | POST | Force refresh from Bitbucket |
| `/api/pipelines/tick` | POST | Independent lazy-cron tick (5 min interval) |
| `/api/pipelines/last-deployed` | GET | Last deployment per ticket key |
| `/api/pipelines/deploy-settings` | GET | Get deploy notification settings |
| `/api/pipelines/deploy-settings` | PUT | Update deploy notification settings |
| `/api/followed-tickets` | GET | List followed ticket keys |
| `/api/followed-tickets` | POST | Follow a ticket. Body: `{ ticketKey }` |
| `/api/followed-tickets` | DELETE | Unfollow. `?ticketKey=X` |
| `/api/followed-sprints` | GET | List followed sprint names |
| `/api/followed-sprints` | POST | Follow a sprint. Body: `{ sprintName }` |
| `/api/followed-sprints` | DELETE | Unfollow. `?sprintName=X` |
| `/api/notifications` | GET | List notifications. `?unread=true&limit=N` |
| `/api/notifications` | PATCH | Mark read. Body: `{ id }` or `{ markAll: true }` |

## Cleanup / Backlog Deprecation Review (BRDG-283)

Read surface for the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md).
Lists scan-eligible backlog tickets joined with their local-only `ticketMetadata` scan
fields (BRDG-297). Scan-eligible = `sprintName === "" AND removedFromJiraAt IS NULL` (the
same definition the Tier-1 staleness scanner uses). Never writes; never touches Jira.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cleanup` | GET | List scan-eligible backlog tickets with scan state. Query params below. |
| `/api/cleanup/deep-scan` | GET | Tier-2 deep-dive queue: status counts `{ pending, running, done, error }` plus `items[]` (the queue list with joined ticket title/status). |
| `/api/cleanup/deep-scan` | POST | Enqueue tickets for Tier-2 deep scan (BRDG-284). Idempotent. |
| `/api/cleanup/deep-scan` | DELETE | Manage the queue: `{ key }` removes one pending item (404 if no active item, 409 if running); `{ all: true }` or `?all=1` clears all pending items (running items finish on their own). Returns updated `{ queue }` counts. |
| `/api/cleanup/quick-scan` | POST | Run the Tier-1 staleness pass **synchronously** for `{ keys: string[] }` (max 200). Cheap/local/no-AI; no Jira reads or writes. Scores only eligible keys (backlog, not removed, not finished, not subtask) and skips the rest. Returns `{ scored, skipped }`. Unlike `deep-scan` POST, this runs immediately rather than enqueuing. |
| `/api/cleanup/auto-scan-settings` | GET | Read auto background scan settings `{ enabled, dailyCount }` (BRDG-290). |
| `/api/cleanup/auto-scan-settings` | POST | Update settings `{ enabled?, dailyCount? }`. Returns merged settings. |
| `/api/cleanup/deprecated-areas` | GET | List the editable deprecated-area keyword list (BRDG-285). |
| `/api/cleanup/deprecated-areas` | POST | Add an area `{ term, aliases?, note? }`. Returns the created row (201). |
| `/api/cleanup/deprecated-areas` | PUT | Edit an area `{ id, term, aliases?, note? }`. 404 if unknown id. |
| `/api/cleanup/deprecated-areas` | DELETE | Remove an area `{ id }` (204). Managed at `/settings/deprecated-areas`; feeds the "replaced area" scan topic. |
| `/api/cleanup/[key]/disposition` | GET | Full per-ticket score breakdown (BRDG-289): every topic's score + evidence + rationale, the assembled `scanRationale`, overall, current disposition/cooldown/note, and the revival signal `revivalScore` + `revivalRationale` (BRDG-298). |
| `/api/cleanup/[key]/disposition` | POST | Apply a disposition `{ action: "confirm" \| "dismiss" \| "reset", note? }`. Local-only, never writes Jira. |
| `/api/cleanup/disposition` | POST | Bulk disposition `{ action, keys: string[], note? }` (max 200). De-dupes keys; returns `{ action, requested, applied, appliedKeys, skipped }`. |

Query params: `sort` (`overall` \| `revival` \| `staleness` \| `lastScanned-oldest` \| `lastScanned-newest` \| `deepScanned-newest` \| `key`),
`scanned` (`all` \| `scanned` \| `deep` \| `never`), `disposition` (`all` \| `candidate` \| `confirmed` \| `dismissed` \| `none`),
`minOverall` (0..1 threshold on the overall score). `scanned=deep` narrows to rows that have actually had a
Tier-2 **deep scan** (`lastDeepScannedAt` set) — the requested deep-scanned overview — and `deepScanned-newest`
sorts by deep-scan recency. The `/cleanup` view additionally applies a client-side
**revival candidates** filter (`revivalScore >= REVIVAL_CANDIDATE_THRESHOLD`, 0.6) and the `revival` sort.

Response shape (`CleanupResponse` in `src/lib/cleanup-types.ts`):
```
{
  rows: Array<{
    key, title, status,
    type: IssueType,                  // story|task|bug|spike|subtask|epic (normalised from Jira; default "story")
    epic: string | null,              // epic display name
    epicKey: string | null,
    storyPoints: number | null,
    sprintName: string | null,        // sprint placement; null = backlog (scan eligibility is backlog-only today, so null) (BRDG-298)
    openSubtaskCount: number,         // open (non-finished) / total subtask counts
    totalSubtaskCount: number,
    epicChildCount: number,           // for epics: count of live tickets parented by epicKey; 0 for non-epics (BRDG-298)
    assignee: { name, initials, color } | null,  // person with precomputed initials + colour for the client
    reporter: { name, initials, color } | null,
    jiraUpdatedAt: string | null,     // last Jira activity; drives the last-activity filter buckets
    lastScannedAt: string | null,
    lastDeepScannedAt: string | null, // last Tier-2 deep scan; drives the "Deep-scanned" filter + recency sort (BRDG-298)
    scanRationale: string | null,     // deep-scan reasoning (why flagged); shown inline under the title + in the drawer (BRDG-298)
    topicScores: { staleness?: number | null, ... }, // 0..1 per topic, parsed from scanScores
    scanOverall: number | null,
    disposition: "candidate" | "dismissed" | "confirmed" | null,
    revivalScore: number | null,      // 0..1 "worth pulling up" signal (BRDG-298), opposite of deprecation
    revivalRationale: string | null
  }>,
  total: number,
  topics: Array<{ key, label, live }>, // dormant topics (live:false) render "—" until their scorer ships
  facets: {                            // distinct option lists for the view's filter dropdowns, computed
    types: IssueType[],                // server-side over the WHOLE eligible backlog (not the page window)
    epics: Array<{ key, name }>,       // sorted by name; only parented rows
    assignees: string[],               // distinct names, sorted
    reporters: string[],
    sprints: string[]                  // distinct sprint placements; backlog folds into the "__backlog__" sentinel
                                       // (BACKLOG_FACET_VALUE), sorted backlog-first then numeric (BRDG-298)
  }
}
```

The `type`/`epic`/`storyPoints`/subtask-count/person fields enrich the row so the shared `ChildIssueRow`
renders the standard issue-type icon plus the epic / subtask-count / story-point badges. The `facets`
object feeds the view's issue-type / epic / assignee / reporter / **sprint** filter dropdowns; the **last-activity**
time-period filter (`< 1mo` / `1-3mo` / `3-6mo` / `6-12mo` / `> 1yr` / unknown) is derived client-side
from `jiraUpdatedAt` (`lastActivityBucket` in `cleanup-utils.ts`). The **sprint** filter maps the backlog
(null `sprintName`) onto the `__backlog__` sentinel so it reads as a real "Backlog" option (consistent with
`SprintOrBacklogBadge`); backlog-only eligibility means it usually holds just that one option today. All facet
filters apply client-side over the loaded list, so they never enter the SWR key.

**`/cleanup` view (BRDG-283 → BRDG-298 UI refresh).** Each ticket renders via the app-standard
`ChildIssueRow` + `TicketStatusPill` (the same row/pill used by the refinement select list and epic
children), so the surface matches the rest of the app and fits the viewport — the former per-topic
score columns are gone, eliminating the horizontal scroll. Per row, trailing metadata badges show: a
compact **deprecation-score badge** (the overall score on the existing heat ramp), a **revival badge**
(upward arrow + positive/green treatment) when `revivalScore >= 0.6`, the disposition badge, and the
last-scanned relative time. Each row also shows the standard **issue-type icon** (via `showTypeIcon`) and
the shared **epic / subtask-count / story-point badges** (`IssueMetaBadges`) plus the assignee avatar. When a
row has a `scanRationale`, a compact muted **inline rationale line** renders under the title (truncated, full
text on hover via `Tooltip`, click opens the drawer) so the PO can read why a ticket was flagged without
opening each drawer; rows without a rationale keep their tight height. The full per-topic breakdown plus the
revival rationale live in the `DispositionPanel` drawer.

The controls bar uses standard Bridge components with a tooltip on every control: single-choice selects
(sort, scanned, disposition, min-score) styled with the shared control tokens, the app-standard
`FilterDropdown` for the multi-select facet filters (type / epic / assignee / reporter / last-activity / sprint),
the `Button` quick-actions, and the auto-scan toggle. The multi-select bulk bar reuses the sprint board's
`BarContainer` footer styling (brand select-all checkbox, `N/total selected` counter, standard `Button`s,
`BarDivider`s) so it matches `BulkActionBar`; its actions are Quick-scan selected / Deep-scan selected / Confirm / Dismiss / Clear.

**Quick-scan vs Deep-scan (PO clarity).** "Quick-scan selected" POSTs `{ keys }` to `/api/cleanup/quick-scan`, which runs the cheap Tier-1 staleness pass **immediately** (no AI, no Jira) and refreshes the list, surfacing an inline "Scored N" result. "Deep-scan selected" POSTs `{ method: "keys", keys }` to `/api/cleanup/deep-scan`, which only **enqueues** the tickets; processing starts from the Scans popover (enable or "Run now" Backlog Deep Scan). Tooltips on both buttons spell out the immediate-vs-queued difference. The quick-scan endpoint and the rolling `deprecation-staleness` scheduled task share one implementation — `scoreStalenessForKeys` / `scoreRows` in `src/lib/deprecation-staleness-runner.ts` — so on-demand and background staleness scores are identical.

`POST /api/cleanup/deep-scan` body is a discriminated union on `method`:
- `{ method: "keys", keys: string[] }` — hand-picked tickets (filtered to the eligible backlog).
- `{ method: "worst-staleness", topX: number }` — top-X by combined Tier-1 score.
- `{ method: "oldest", topX: number }` — top-X by oldest `lastScannedAt`.

Ranked methods exclude dismissed tickets still inside their cooldown. Returns `{ method, requested, enqueued, enqueuedKeys, queue }`. The background `deprecation-deep-scan` task drains the queue; see [scheduler.md](scheduler.md#backlog-deep-scan-every-2m).

**Queue management (Backlog Deprecation Review epic).** `GET /api/cleanup/deep-scan` returns the status counts plus an `items[]` list of queue rows for the management UI. Each item is `{ id, jiraKey, status, source, enqueuedAt, startedAt, finishedAt, error, title, ticketStatus }` — the `title`/`ticketStatus` are joined from the `ticket` table (null when the ticket no longer exists locally) so a row is self-describing without a second fetch. `items[]` includes all pending+running rows (oldest-first) plus the most recent done/error rows (capped, newest-first). Helpers live in `src/lib/deprecation-scan-queue.ts`: `listQueue(opts?)`, `removeQueueItem(idOrKey)`, `clearPendingQueue()`. **Subtask guard (going-forward):** both `listQueue` and `claimPendingBatch` left-join the ticket and exclude subtask-typed rows (`EXCLUDED_SCAN_TYPES` / `isScannableType` from `src/lib/ticket-status.ts`), so even a stale queue row never surfaces in the panel or gets processed — subtasks are cleaned up together with their parent. Enqueue eligibility already blocks new subtask enqueues; this guards rows that predate the eligibility check or whose ticket type changed after enqueue. A null/unknown ticket type stays claimable so a locally-deleted ticket's row is never silently dropped.

`DELETE /api/cleanup/deep-scan` manages the queue:
- `{ key }` removes a single **pending** item (by row id or jiraKey). A **running** item is refused with 409 — the current scan finishes on its own; deleting it mid-flight could orphan the active-key invariant. Unknown/non-active keys return 404.
- `{ all: true }` or `?all=1` clears all pending items (the "stop / clear" action). Running items are left to finish; only new work is stopped. Note the auto-enqueue task can refill the queue, so disable the deprecation tasks via the toggle API to keep it empty.

### Review & disposition (BRDG-289)

The human-in-the-loop close of the epic. A disposition is a LOCAL marker on `ticketMetadata`
(`disposition`, `dispositionUntil`, `dispositionNote`); **nothing is ever written to Jira** —
the disposition service (`src/lib/cleanup-disposition-service.ts`) imports no Jira client, and
its tests assert no Jira write path is reachable. Transition maths live in
`src/lib/cleanup-disposition.ts`:

- **Confirm** → `disposition="confirmed"`, cooldown cleared. "This can probably go" (the PO's
  later action in Jira is manual).
- **Dismiss (snooze)** → `disposition="dismissed"` + `dispositionUntil = now + DISMISS_COOLDOWN_DAYS`
  (default **90 days**). The `deprecation-deep-scan` runner already skips a dismissed ticket while
  its cooldown is in the future, so this directly controls re-surfacing.
- **Reset** → clears disposition, cooldown, and note.

An optional free-text note is stored in the new `ticket_metadata.disposition_note` column
(migration `drizzle/0067_mean_mother_askani.sql`), clamped to 500 chars. Each apply writes one
`deprecation-scan` activity-log entry. When the background deep scan promotes a ticket to
`candidate`, the runner fires a `deprecation-candidate` notification (`scheduler` category,
`skipFollowCheck`, links to `/cleanup`).

In the `/cleanup` view, a **row click opens a score-breakdown / disposition drawer**
(`src/app/(app)/cleanup/DispositionPanel.tsx`) showing each topic's score + evidence + rationale.
The `duplicate.supersededBy` renders as a clickable link that re-targets the drawer to that
ticket; `alreadyBuilt.implementedIn` renders as evidence text. The drawer can escalate to the full
ticket `SidePanel` ("Open full ticket"). Confirm/Dismiss live in the drawer; **bulk Confirm/Dismiss**
act on the existing multi-select selection bar.

### Scan topics (as of BRDG-288)

All five scoring topics from the epic are now live (`live: true` in `SCAN_TOPICS`):

| Key | Story | Tier | Method | Weight | maxContribution |
|-----|-------|------|--------|--------|----------------|
| `staleness` | BRDG-297 | 1 | Local heuristics (age, sprint, PO metadata) | 1 | 1 |
| `replaced` | BRDG-285 | 2 | Keyword list + AI confirmation (`ask` skill) | 1 | 1 |
| `duplicate` | BRDG-286 | 2 | `find-related` skill + verdict rule | 1 | 1 |
| `alreadyBuilt` | BRDG-287 | 2 | `codebase-research` skill (gated + throttled) | 1 | 0.8 |
| `relevance` | BRDG-288 | 2 | `investigate` skill vs product docs (capped) | 1 | 0.3 |

The `relevance` topic is capped at 0.3 so it can NEVER alone push a ticket past the candidate
threshold (0.6). The `/cleanup` table renders it with a muted `~` marker and a tooltip to
communicate its lower-trust, AI-subjective nature. See `src/lib/topics/relevance-decay-topic.ts`
for the cap proof in the file header.

The view lives at `/cleanup` (`src/app/(app)/cleanup/page.tsx`, nav entry "Cleanup" in
`src/components/Sidebar.tsx`). It renders the table (key+title, status, relative last-scanned
with absolute on hover, a heat bar per topic, overall, disposition badge), with client-side
sort/filter mirrored from the API (`cleanup-utils.ts`). Row click opens the score-breakdown /
disposition drawer (BRDG-289), which can escalate to the shared `SidePanel` overlay (the same
component the sprint board uses, per BRDG-281/275) for full ticket management.

## Confluence

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/confluence/health` | GET | Verify Confluence connectivity and credentials |
| `/api/confluence/search` | GET | CQL title search. `?q=searchTerm` |
| `/api/confluence/pages/[pageId]` | GET | Fetch page content (sanitized HTML, truncated to ~500 words) |
| `/api/tickets/[key]/confluence-links` | GET | List pages linked to a ticket |
| `/api/tickets/[key]/confluence-links` | POST | Link a page. Body: `{ pageId, pageTitle, pageUrl, ... }` |
| `/api/tickets/[key]/confluence-links` | DELETE | Unlink a page. Body: `{ linkId }` |
| `/api/tickets/[key]/confluence-mentions` | GET | Auto-detected Confluence URLs in ticket description/comments |

## Attachments

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/attachments/[id]` | GET | Proxy attachment download from Jira |

## Common Patterns

### Error Responses

All routes return JSON error responses with consistent shape:

```json
{ "error": "Human-readable error message" }
```

Status codes: `400` (bad request), `404` (not found), `409` (conflict), `500` (server error), `502` (agent unreachable).

### Agent Proxy

Workspace task routes proxy to the valk-agent backend using `agentUrl()` and `agentHeaders()` from `src/lib/agent-proxy.ts`. The agent URL and API key are server-side only.

### Activity Logging

Write operations that affect ticket data log to the `activity_log` table for audit and UI feedback.
