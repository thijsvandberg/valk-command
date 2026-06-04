# Database Schema

SQLite database managed through Drizzle ORM. Schema defined in `src/db/schema.ts`, migrations in `drizzle/`.

## Tables

### Core Data

#### `ticket`

Primary table for Jira tickets synced into the local database.

| Column | Type | Notes |
|--------|------|-------|
| `jira_key` | text PK | e.g. VPL-123 |
| `jira_id` | text | Jira internal ID |
| `title` | text | Summary / title |
| `type` | text | Story, Bug, Task, etc. |
| `status` | text | Current Jira status |
| `assignee` | text | Display name |
| `assignee_avatar` | text | Avatar URL |
| `epic` | text | Epic name |
| `epic_key` | text | Epic Jira key |
| `flagged` | boolean | Jira flagged state |
| `reporter` | text | Reporter display name |
| `description` | text | ADF JSON |
| `acceptance_criteria` | text | ADF JSON (custom field) |
| `story_points` | real | Estimated points |
| `sprint_name` | text | Sprint ID (used as foreign key to sprint slots) |
| `labels` | text | Comma-separated labels |
| `priority` | text | Jira priority name |
| `components` | text | Comma-separated components |
| `jira_created_at` | text | ISO timestamp from Jira |
| `jira_updated_at` | text | ISO timestamp from Jira (used for sync watermark comparison) |
| `last_synced_at` | text | When this ticket was last synced |
| `removed_from_jira_at` | text | Set when ticket disappears from Jira; cleaned up after 7 days |

**Indexes:** `sprint_name`

#### `ticket_metadata`

PO-owned annotations per ticket. Never synced back to Jira.

| Column | Type | Notes |
|--------|------|-------|
| `jira_key` | text PK, FK -> ticket | 1:1 with ticket |
| `po_status` | text | PO-specific status |
| `refinement_readiness` | enum | `not_ready`, `in_progress`, `ready` |
| `quality_score` | real | Latest review score (0-100) |
| `effort_scores` | text | JSON: effort estimates per role |
| `po_notes` | text | Free-form PO notes |
| `po_priority` | integer | PO priority override |
| `test_status` | enum | `untested`, `pass`, `fail` |
| `last_test_run_at` | text | ISO timestamp |
| `last_test_report_url` | text | Link to test report |
| `business_value` | integer | Business Value score (1-7, nullable) |
| `scan_scores` | text | Backlog Deprecation Review (BRDG-282 epic): JSON map of per-topic scores + evidence. Local-only. |
| `scan_overall` | real | Combined deprecation-likelihood score (0..1). |
| `scan_rationale` | text | Assembled human-readable "why this can probably go". |
| `last_scanned_at` | text | ISO; Tier-1 scan time, drives rolling re-scan / oldest-first ordering. |
| `last_deep_scanned_at` | text | ISO; Tier-2 deep-dive scan time. |
| `disposition` | text | `null` \| `candidate` \| `dismissed` \| `confirmed` (BRDG-289). PO's local judgement; never synced to Jira. |
| `disposition_until` | text | ISO dismiss cooldown (BRDG-289); the deep-scan runner skips dismissed tickets until this passes. Default 90 days. |
| `disposition_note` | text | Optional free-text note left on confirm/dismiss (BRDG-289), max 500 chars. |

#### `ticket_subtask`

Child issues synced inline during ticket sync. Replaced on each sync.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | Parent ticket |
| `subtask_key` | text | Subtask Jira key |
| `title` | text | |
| `type` | text | |
| `status` | text | |
| `assignee` | text | |
| `assignee_avatar` | text | |

#### `subtask_suggestion`

AI-generated subtask suggestions, persisted so they survive navigation/refresh. Rows are deleted when dismissed or accepted (only pending suggestions remain).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `ticket_key` | text FK -> ticket | Cascade delete |
| `title` | text | Suggested subtask title |
| `created_at` | text | ISO timestamp |

#### `ticket_link`

Issue links: blocks, is blocked by, relates to, split to/from, etc.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | Source ticket |
| `jira_link_id` | text | Jira link ID (null for local-only links) |
| `relation` | text | e.g. "blocks", "relates to", "split to" |
| `linked_key` | text | Target Jira key |
| `title` | text | Linked ticket title |
| `type` | text | Issue type |
| `status` | text | |
| `assignee` | text | |
| `assignee_avatar` | text | |

#### `ticket_attachment`

Attachment metadata synced from Jira.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `jira_attachment_id` | text | |
| `filename` | text | |
| `mime_type` | text | |
| `size` | integer | Bytes |
| `jira_url` | text | Download URL on Jira |
| `downloaded_at` | text | When locally cached |
| `local_path` | text | Local file path |
| `cleaned_at` | text | When local cache was purged |

### Comments

#### `jira_comment`

Comments synced from Jira.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `jira_comment_id` | text | Jira's comment ID |
| `author_name` | text | |
| `author_avatar` | text | |
| `content` | text | ADF JSON |
| `created_at` | text | |

#### `po_comment`

Local PO comments (not synced to Jira).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `author` | text | Default: "Product Owner" |
| `content` | text | |
| `created_at` | text | |

### Local Edits & Versioning

#### `ticket_local_edit`

Tracks local modifications to ticket content before pushing to Jira.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `field` | enum | `title` or `description` |
| `local_value` | text | Edited content |
| `base_jira_version` | text | `jira_updated_at` at time of edit; used for conflict detection |
| `is_draft` | boolean | True while still editing |
| `modified_at` | text | |

#### `story_version`

Snapshot history of ticket descriptions. Created on each Jira sync when content hash changes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `jira_key` | text FK -> ticket | |
| `description` | text | ADF JSON |
| `acceptance_criteria` | text | ADF JSON |
| `content_hash` | text | SHA hash for dedup |
| `tag` | text | Optional label |
| `updated_by` | text | Author from Jira changelog |
| `updated_by_avatar` | text | |
| `created_at` | text | |

#### `stored_review`

Persisted review results linked to story versions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `created_at` | text | |
| `source` | enum | `ticket-detail`, `chat`, `bulk-action` |
| `story_version_hash` | text | Links to a `story_version.content_hash` |
| `story_version_number` | integer | Version index |
| `overall_score` | real | 0-100 |
| `dimensions` | text | JSON array of dimension scores |
| `summary` | text | |
| `suggestions` | text | JSON array of suggestions |

### Chat & Conversations

#### `conversation`

Chat conversations (both regular chat and story writer sessions).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `title` | text | |
| `created_at` | text | |
| `related_ticket` | text | Optional linked ticket key |
| `read_at` | text | NULL = unread, ISO timestamp = read |

#### `message`

Messages within conversations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `conversation_id` | text FK -> conversation | Cascade delete |
| `role` | enum | `user` or `assistant` |
| `content` | text | Markdown / structured content |
| `timestamp` | text | |
| `workspace_task_id` | text | Links to workspace task that produced this message |
| `status` | enum | `pending`, `sent`, `failed` (default: `sent`) |
| `content_hash` | text | SHA-256 hash for dedup (conversationId + normalized content) |

### Story Writer

#### `story_writer_session`

AI-assisted story editing sessions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | |
| `conversation_id` | text FK -> conversation | Chat for this session |
| `status` | enum | `active`, `completed`, `discarded` |
| `local_draft` | text | Current working draft |
| `local_title` | text | Current working title |
| `base_version_hash` | text | Content hash at session start |
| `target_ticket_key` | text | Target ticket in split mode |
| `target_local_draft` | text | Draft for target ticket (split mode) |
| `target_local_title` | text | Title for target ticket (split mode) |
| `created_at` | text | |
| `updated_at` | text | |

#### `story_writer_draft`

AI-generated draft suggestions waiting for user acceptance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `session_id` | text FK -> story_writer_session | Cascade delete |
| `draft_index` | integer | Ordering within session |
| `content` | text | Draft markdown |
| `message_id` | text FK -> message | Which message produced this draft |
| `story_slot` | enum | `original` or `target` (split mode) |
| `created_at` | text | |

#### `story_writer_execution_log`

Full execution logs for story writer AI tasks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `session_id` | text FK -> story_writer_session | Cascade delete |
| `task_id` | text | Workspace task ID |
| `conversation_id` | text | |
| `ticket_key` | text | |
| `log` | text | JSON array of log entries |
| `created_at` | text | |

#### `related_story_candidate`

Tickets identified by the AI as related to the current story.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `session_id` | text FK -> story_writer_session | Cascade delete |
| `ticket_key` | text | Source ticket |
| `jira_key` | text | Related ticket key |
| `score` | integer | Relevance score |
| `title` | text | |
| `issue_type` | text | |
| `status` | text | |
| `jira_url` | text | |
| `updated_date` | text | |
| `match_reason` | text | Why the AI considers it related |
| `is_linked` | boolean | Whether a Jira link was created |
| `created_at` | text | |

### Workspace Tasks

#### `workspace_task`

Tracks tasks submitted to the valk-agent backend. Created when a skill is invoked, updated as the agent reports progress.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `skill_name` | text | Workspace skill that was invoked |
| `status` | enum | `queued`, `running`, `completed`, `failed` |
| `started_at` | text | ISO timestamp |
| `completed_at` | text | ISO timestamp |
| `related_ticket` | text | Optional linked ticket key |
| `conversation_id` | text | Optional linked conversation |
| `output` | text | Final output from agent |
| `error` | text | Error message on failure |

**Indexes:** `status`, `conversation_id`

### Scheduling & Jobs

#### `scheduled_job`

User-defined recurring jobs (managed via settings UI).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `name` | text | Job name |
| `cron_expression` | text | Cron schedule |
| `skill_name` | text | Workspace skill to invoke |
| `enabled` | boolean | |
| `last_run_at` | text | |
| `last_result_summary` | text | |

#### `sprint_slot`

Maps slot positions to sprints for the multi-sprint board view.

| Column | Type | Notes |
|--------|------|-------|
| `slot_index` | integer PK | Display position |
| `sprint_id` | text | Jira sprint ID |
| `sprint_name` | text | Sprint name |

#### `sprint_name_cache`

Simple lookup cache mapping Jira sprint IDs to display names.

| Column | Type | Notes |
|--------|------|-------|
| `sprint_id` | text PK | Jira sprint ID |
| `display_name` | text | Human-readable sprint name |

#### `app_setting`

Key-value store for application configuration.

| Column | Type | Notes |
|--------|------|-------|
| `key` | text PK | e.g. `jira_sync_watermark`, `scheduler:*:last_run`, `already-built-scan:<YYYY-MM-DD>` |
| `value` | text | Serialized value |

The "already built" deep-scan topic (BRDG-287, `src/lib/topics/already-built-topic.ts`) uses the key pattern `already-built-scan:<YYYY-MM-DD>` (UTC date) to track the daily count of codebase-research agent calls. The value is the integer count as a string. A new key is created each day automatically; the prior day's key is left in place (no cleanup needed — it simply stops being incremented). Skipped tickets (cap hit) are logged via `logger.warn` and left with no `alreadyBuilt` entry in `scanScores`, making them eligible for retry on a future deep-scan batch.

#### `deprecation_scan_queue`

Persisted Tier-2 deep-dive queue for the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md) (BRDG-284). Durable so the background runner resumes across restarts. See [scheduler.md](scheduler.md#backlog-deep-scan-every-2m).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Generated row id |
| `jira_key` | text | Ticket to deep-scan |
| `status` | enum | `pending`, `running`, `done`, `error` |
| `source` | text | `manual`, `worst-staleness`, `oldest` (selection method) |
| `enqueued_at` | text | ISO timestamp |
| `started_at` | text | When the runner claimed the row |
| `finished_at` | text | When it completed |
| `error` | text | Failure message when `status = error` |
| `active_key` | text | Mirrors `jira_key` while pending/running, `NULL` once done/error. Unique index over this gives idempotent enqueue: at most one active row per ticket. |

#### `deprecated_area_keyword`

Editable list of retired/replaced product or tech areas for the "replaced area" deep-scan topic (BRDG-285, see the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md)). Local-only, never synced to Jira. Seeded on migration with CWI, RezExchange, IDPMS, hybrid cloud; the PO manages it at `/settings/deprecated-areas` (CRUD via `/api/cleanup/deprecated-areas`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Generated row id |
| `term` | text | Canonical area/keyword, e.g. `RezExchange` |
| `aliases` | text | Comma-separated alternate spellings/acronyms (default `''`) |
| `note` | text | Optional reminder of why the area is retired (default `''`) |
| `created_at` | text | ISO timestamp |

### Refinement

#### `refinement_session`

Saved refinement sessions with persisted ticket queues. Created in advance and started when the ceremony begins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `name` | text | Display name (default: "Refinement YYYY-MM-DD") |
| `ticket_keys` | text | JSON array of ticket keys |
| `status` | text | `draft`, `in_progress`, or `completed` |
| `general_comment` | text | Session-level PO comment (nullable) |
| `current_index` | integer | Last viewed ticket index for resume (default 0) |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp, updated on every change |

**Indexes:** `status`, `created_at`

#### `refinement_session_ticket_note`

Per-ticket PO messages within a refinement session. One note per ticket per session.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `session_id` | text FK | -> refinement_session.id (cascade delete) |
| `ticket_key` | text | Jira ticket key |
| `content` | text | PO message content |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

**Indexes:** `session_id`, unique(`session_id`, `ticket_key`)

### System

#### `activity_log`

Audit trail for all sync and system operations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `type` | enum | `sprint-sync`, `ticket-sync`, `single-ticket`, `comment-sync`, `webhook`, `review`, `metadata-update`, `local-edit`, `push-to-jira`, `bulk-action`, `story-writer`, `incremental-sync` |
| `scope` | text | What was affected |
| `status` | enum | `running`, `success`, `failed`, `cancelled` |
| `summary` | text | Human-readable result |
| `error_detail` | text | Error message on failure |
| `duration_ms` | integer | |
| `started_at` | text | |
| `completed_at` | text | |
| `acknowledged` | integer (boolean) | Whether user dismissed a failure |

#### `ticket_confluence_link`

Confluence pages linked to a ticket (manually or auto-detected from URLs in description/comments).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `ticket_key` | text FK -> ticket | Cascade delete |
| `page_id` | text | Confluence page ID |
| `page_title` | text | Page title at time of linking |
| `page_url` | text | Full URL to page |
| `source` | enum | `manual` or `auto-detected` |
| `last_modified_at` | text | ISO timestamp from Confluence |
| `last_modified_by` | text | Author display name |
| `created_at` | text | ISO timestamp |

**Indexes:** `ticket_key`, `page_id`

#### `stakeholder_analysis`

Cached AI-generated stakeholder reports (brief and deep-dive) per sprint.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `sprint_id` | integer | Jira sprint ID |
| `sprint_name` | text | |
| `type` | enum | `brief`, `deep-dive` |
| `status` | enum | `running`, `completed`, `failed` |
| `content` | text | Full analysis content |
| `narrative` | text | Narrative section |
| `risks` | text | Risks section |
| `workspace_task_id` | text | Agent task that generated this |
| `conversation_id` | text | Linked conversation |
| `snapshot_done_points` | integer | Story points done at generation time |
| `snapshot_todo_count` | integer | Open ticket count at generation time |
| `created_at` | text | |
| `completed_at` | text | |

**Indexes:** `sprint_id`, `(sprint_id, type)`

#### `alert`

Notification records surfaced in the notifications panel. Used for pipeline events, deployments, PR merges, sync events, etc.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `type` | text | Event type (e.g. `pipeline:completed`) |
| `jira_key` | text | Optional linked ticket |
| `message` | text | Human-readable notification text |
| `created_at` | text | |
| `event_at` | text | When the underlying event occurred (may differ from `created_at` on late sync) |
| `read` | boolean | Whether dismissed by user |
| `category` | enum | `general`, `pipeline`, `deployment`, `pr`, `sync`, `story-writer`, `system`, `agent`, `scheduler` |
| `link_url` | text | Optional deep-link URL |

**Indexes:** `read`, `created_at`, `jira_key`

### Pipelines & Notifications

#### `pipeline_run`

CI/CD pipeline runs synced from Bitbucket. Includes deployment-specific enrichment for UAT/prod deploy tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `repo` | text | Bitbucket repo slug |
| `build_number` | integer | Bitbucket build number |
| `branch_name` | text | Branch that triggered the pipeline |
| `ticket_key` | text | Primary linked ticket key |
| `state` | enum | `SUCCESSFUL`, `FAILED`, `IN_PROGRESS`, `STOPPED`, `PAUSED` |
| `creator` | text | Who triggered the pipeline |
| `duration_seconds` | integer | |
| `pipeline_url` | text | Link to Bitbucket pipeline page |
| `is_deployment` | boolean | Whether this is a deploy pipeline |
| `environment` | text | Deploy target environment name |
| `environment_type` | enum | `Production`, `Staging`, `Test` |
| `created_at` | text | |
| `completed_at` | text | |
| `previous_state` | text | Used to detect state changes for notification triggers |
| `commit_message` | text | Enriched commit message |
| `ticket_keys` | text | JSON array when pipeline touches multiple tickets |
| `source_branch` | text | Original branch for merge-triggered pipelines |
| `pr_url` | text | Linked PR URL |
| `pr_title` | text | |
| `pr_author` | text | |

**Indexes:** `repo`, `ticket_key`, `state`, `created_at`, `(is_deployment, environment)`

#### `followed_ticket`

User preference for which Jira tickets to receive pipeline/deploy notifications about.

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text | Jira key (e.g. VPL-123) |
| `created_at` | text | |

**Indexes:** `ticket_key`

#### `followed_sprint`

User preference for which sprints to receive UAT deploy notifications about.

| Column | Type | Notes |
|--------|------|-------|
| `sprint_name` | text PK | Sprint name (used as identifier, not Jira sprint ID) |
| `created_at` | text | |

## Relationships

```
ticket (1) --- (1) ticket_metadata
ticket (1) --- (*) ticket_subtask
ticket (1) --- (*) ticket_link
ticket (1) --- (*) ticket_attachment
ticket (1) --- (*) jira_comment
ticket (1) --- (*) po_comment
ticket (1) --- (*) ticket_local_edit
ticket (1) --- (*) story_version
ticket (1) --- (*) stored_review
ticket (1) --- (*) story_writer_session
ticket (1) --- (*) ticket_confluence_link
ticket (1) --- (*) subtask_suggestion

conversation (1) --- (*) message
conversation (1) --- (*) story_writer_session

story_writer_session (1) --- (*) story_writer_draft
story_writer_session (1) --- (*) story_writer_execution_log
story_writer_session (1) --- (*) related_story_candidate
ticket (1) --- (*) related_suggestion_cache
```

#### `related_suggestion_cache`

Cached AI-suggested related issues for the ticket detail view. Independent of story writer sessions. Reuses the workspace `find-related` skill. Cache is TTL-based (30 min) and invalidated when links are created/deleted.

The "duplication / superseded" deep-scan topic (BRDG-286, `src/lib/topics/superseded-topic.ts`) reuses this same cache and skill: it reads a fresh entry when present (same 30-min TTL) and otherwise runs `find-related`, then writes the result back here (clear-then-insert, like the route's PUT). The scorer flags a ticket as superseded only when a high-overlap (>= 70/100) match is a **survivor** — newer (by the match's local `ticket.jira_updated_at`) or active (in-flight status). Evidence written to `scanScores.duplicate` carries `supersededBy` (the survivor key, for the review screen to link), `overlapScore`, `matchReason`, `matchStatus`, and `survivorBasis`. See the [Backlog Deprecation Review epic](../plans/2026-06-04-backlog-deprecation-review-epic.md).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `ticket_key` | text FK -> ticket | Cascade delete |
| `suggested_key` | text | Related ticket key |
| `score` | real | Relevance score (0-1) |
| `title` | text | |
| `issue_type` | text | |
| `status` | text | |
| `jira_url` | text | |
| `reason` | text | One-sentence rationale |
| `suggested_relation` | text | Default "relates to" |
| `created_at` | text | Used for TTL check |

Indexed on `ticket_key`.

## Conventions

- All primary keys are text (UUIDs or Jira keys)
- All timestamps are stored as ISO 8601 text
- Booleans are stored as SQLite integers (0/1) with `mode: "boolean"`
- ADF content (Atlassian Document Format) is stored as JSON text
- JSON arrays/objects are stored as serialized text
- Cascade deletes are used for conversation -> messages and session -> drafts/logs
- Indexes on foreign keys and frequently queried columns (timestamps, ticket keys)

## Migrations

44 migration files in `drizzle/` (0000–0043). Managed via:

- `npm run db:generate` - Generate new migration from schema changes
- `npm run db:push` - Push schema directly to DB (development)
- `npm run db:migrate` - Run pending migrations
