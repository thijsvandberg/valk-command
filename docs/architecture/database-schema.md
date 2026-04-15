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

#### `app_setting`

Key-value store for application configuration.

| Column | Type | Notes |
|--------|------|-------|
| `key` | text PK | e.g. `jira_sync_watermark`, `scheduler:*:last_run` |
| `value` | text | Serialized value |

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

#### `alert`

System alerts (currently unused in active features).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `type` | text | |
| `jira_key` | text | |
| `message` | text | |
| `created_at` | text | |
| `read` | boolean | |

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

conversation (1) --- (*) message
conversation (1) --- (*) story_writer_session

story_writer_session (1) --- (*) story_writer_draft
story_writer_session (1) --- (*) story_writer_execution_log
story_writer_session (1) --- (*) related_story_candidate
```

## Conventions

- All primary keys are text (UUIDs or Jira keys)
- All timestamps are stored as ISO 8601 text
- Booleans are stored as SQLite integers (0/1) with `mode: "boolean"`
- ADF content (Atlassian Document Format) is stored as JSON text
- JSON arrays/objects are stored as serialized text
- Cascade deletes are used for conversation -> messages and session -> drafts/logs
- Indexes on foreign keys and frequently queried columns (timestamps, ticket keys)

## Migrations

29 migration directories in `drizzle/`. Managed via:

- `npm run db:generate` - Generate new migration from schema changes
- `npm run db:push` - Push schema directly to DB (development)
- `npm run db:migrate` - Run pending migrations
