import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const conversation = sqliteTable("conversation", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type", { enum: ["chat", "investigation"] }).notNull().default("chat"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  relatedTicket: text("related_ticket"),
  metadata: text("metadata"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  readAt: text("read_at"),
}, (table) => [
  index("conversation_created_at_idx").on(table.createdAt),
  index("conversation_related_ticket_idx").on(table.relatedTicket),
]);

export const message = sqliteTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(datetime('now'))`),
  workspaceTaskId: text("workspace_task_id"),
  status: text("status", { enum: ["pending", "sent", "failed"] })
    .notNull()
    .default("sent"),
  contentHash: text("content_hash"),
  sequence: integer("sequence"),
  cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("message_conversation_id_idx").on(table.conversationId),
  index("message_conversation_sequence_idx").on(table.conversationId, table.sequence),
]);

export const ticket = sqliteTable("ticket", {
  jiraKey: text("jira_key").primaryKey(),
  jiraId: text("jira_id"),
  title: text("title").notNull(),
  type: text("type"),
  status: text("status").notNull(),
  assignee: text("assignee"),
  assigneeAvatar: text("assignee_avatar"),
  // Real Jira accountId for the assignee, harvested from issue data during sync.
  // The user-search API is outside the token's scope, so this captured id is the
  // only way to assign people by their real id (the picker keys people by name).
  assigneeAccountId: text("assignee_account_id"),
  // Secondary human-readable key for the assignee, harvested from issue data.
  // accountId is the stable key; email is a label (can change / be hidden).
  assigneeEmail: text("assignee_email"),
  epic: text("epic"),
  epicKey: text("epic_key"),
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  reporter: text("reporter"),
  // Stable reporter identity, mirroring the assignee trio (BRDG-360). accountId
  // is the only globally stable Jira key; reporter avatar/email are labels.
  reporterAccountId: text("reporter_account_id"),
  reporterAvatar: text("reporter_avatar"),
  reporterEmail: text("reporter_email"),
  description: text("description"),
  acceptanceCriteria: text("acceptance_criteria"),
  storyPoints: real("story_points"),
  sprintName: text("sprint_name"),
  // JSON array of every sprint id the ticket belongs to. sprintName above is the
  // single primary sprint (active > future > most recently closed) used for the
  // card label; sprintIds drives which sprint columns the ticket appears in.
  sprintIds: text("sprint_ids"),
  labels: text("labels"),
  priority: text("priority"),
  components: text("components"),
  jiraCreatedAt: text("jira_created_at"),
  jiraRank: integer("jira_rank"),
  jiraUpdatedAt: text("jira_updated_at"),
  lastSyncedAt: text("last_synced_at"),
  removedFromJiraAt: text("removed_from_jira_at"),
  summary: text("summary"),
  summaryUpdatedAt: text("summary_updated_at"),
}, (table) => [
  index("ticket_sprint_name_idx").on(table.sprintName),
  index("ticket_status_idx").on(table.status),
  index("ticket_assignee_idx").on(table.assignee),
  index("ticket_type_idx").on(table.type),
  index("ticket_epic_key_idx").on(table.epicKey),
  index("ticket_sprint_status_idx").on(table.sprintName, table.status),
  // Speeds up the epic-progress aggregation (filter by sprint window, GROUP BY epic_key).
  index("ticket_sprint_epic_key_idx").on(table.sprintName, table.epicKey),
]);

// Canonical Jira person directory (BRDG-363), keyed on the stable accountId.
// Single source of truth for a person's label: a rename in Jira updates one row
// here instead of every denormalized copy. Populated during sync from every
// person seen on an issue (reporter, assignee, comment author, subtask/link
// assignee). The denormalized name on the ticket row is kept as a fallback for
// people without an accountId (privacy-hidden, external, or legacy rows), so a
// missing id never blanks out a name.
export const jiraUser = sqliteTable("jira_user", {
  accountId: text("account_id").primaryKey(),
  displayName: text("display_name"),
  email: text("email"),
  avatar: text("avatar"),
  updatedAt: text("updated_at"),
});

// Indexed projection of ticket.sprintIds: one row per (ticket, sprint) membership.
// sprintIds stays the source of truth on the ticket row (drives card labels and the
// API response); this bridge exists purely so "which tickets are in sprint X" is an
// indexed lookup instead of an un-indexable json_each scan over every ticket. Kept in
// sync via syncTicketSprints on every sprint_ids write (see src/lib/sprint-membership.ts).
export const ticketSprint = sqliteTable("ticket_sprint", {
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey, { onDelete: "cascade" }),
  sprintId: text("sprint_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ticketKey, table.sprintId] }),
  index("ticket_sprint_sprint_id_idx").on(table.sprintId),
]);

export const ticketMetadata = sqliteTable("ticket_metadata", {
  jiraKey: text("jira_key")
    .primaryKey()
    .references(() => ticket.jiraKey),
  // readiness replaces poStatus — tracks PO preparation lifecycle.
  // null = ready for development (no indicator shown).
  readiness: text("readiness"),
  poStatus: text("po_status"),
  refinementReadiness: text("refinement_readiness", {
    enum: ["not_ready", "in_progress", "ready"],
  }).notNull().default("not_ready"),
  qualityScore: real("quality_score"),
  // qualityStale removed in BRDG-017: staleness is now computed from local edits vs Jira mirror
  effortScores: text("effort_scores"),
  poNotes: text("po_notes"),
  // BRDG-355: manual, persistent PO bookmark. ISO timestamp so the bookmark list
  // gets free most-recently-bookmarked-first ordering; null = not bookmarked.
  // Bridge-local, never synced to Jira. The bookmark's optional note reuses poNotes.
  bookmarkedAt: text("bookmarked_at"),
  poPriority: integer("po_priority"),
  testStatus: text("test_status", {
    enum: ["untested", "pass", "fail"],
  }).notNull().default("untested"),
  lastTestRunAt: text("last_test_run_at"),
  lastTestReportUrl: text("last_test_report_url"),
  businessValue: integer("business_value"),
  // Forward-planning guestimation (BRDG-303): a PO placeholder estimate on the
  // Fibonacci scale for tickets that have no real story points yet. Bridge-local,
  // never synced to Jira (like businessValue). SP supersedes it for display (a
  // guess only ever shows while SP is empty), but the value is KEPT once SP lands
  // (BRDG-323) as the guesstimate of record, so committing a guess to SP can be
  // reverted to it.
  guestimation: integer("guestimation"),
  // Backlog Deprecation Review (BRDG-297 epic): local-only scan state. These
  // fields never sync to Jira; they live here precisely because ticketMetadata
  // is the Bridge-private metadata layer with no write-back path.
  // JSON map of per-topic scores + evidence. Tier-1 fills only `staleness`.
  scanScores: text("scan_scores"),
  // Combined deprecation-likelihood score (Tier-1: equals staleness).
  scanOverall: real("scan_overall"),
  // Assembled human-readable reason string.
  scanRationale: text("scan_rationale"),
  // ISO timestamp; drives rolling re-scan and oldest-first ordering.
  lastScannedAt: text("last_scanned_at"),
  // Reserved for Tier-2 deep dive (null in BRDG-297).
  lastDeepScannedAt: text("last_deep_scanned_at"),
  // null | "candidate" | "dismissed" | "confirmed".
  disposition: text("disposition"),
  // Dismiss cooldown; set when a candidate is dismissed (BRDG-289).
  dispositionUntil: text("disposition_until"),
  // Optional free-text note the PO leaves when confirming/dismissing a scan
  // candidate (BRDG-289). Local-only, like the rest of the scan state.
  dispositionNote: text("disposition_note"),
  // Revival signal (BRDG-298): the OPPOSITE of deprecation. A low-backlog ticket
  // that is still high value and fits recent/planned sprint work is "worth
  // pulling up". The consolidated analyzer (analyze-deprecation skill) sets these.
  // Local-only, never synced to Jira. Related ticket keys live in
  // scanScores.revival.evidence.relatedKeys (no separate column needed).
  // 0..1 likelihood the ticket should be pulled up; null when no analyzer ran.
  revivalScore: real("revival_score"),
  // Human-readable reason naming the recent/planned work it complements.
  revivalRationale: text("revival_rationale"),
  // New stories inbox (BRDG-356): ISO timestamp the PO marked this ticket as
  // "read" in the newly-created-stories review list; null = still unread/unseen.
  // DEPRECATED (BRDG-359): read state is now per-user in the `new_story_read`
  // table. This column is no longer written; it is only read once by the lazy
  // legacy backfill (backfillLegacyNewStoryReads) and otherwise left in place.
  newStoryReadAt: text("new_story_read_at"),
  // Stakeholder test documentation (BRDG-426): the validated markdown block that
  // is also written to the Jira description as an ":::expand Test documentation"
  // panel. The Bridge copy is the source of truth for sprint-level bundling and
  // the missing-doc overview (BRDG-461).
  testDoc: text("test_doc"),
  testDocUpdatedAt: text("test_doc_updated_at"),
  // "ok" | "needs_input" | "not_stakeholder_relevant" — lets BRDG-461 tell
  // "missing" apart from "deliberately not documented".
  testDocClassification: text("test_doc_classification"),
  // Draft cache: the raw generated doc, stored the moment generation completes
  // so an unreviewed result is never lost (closing the modal, a crash, a later
  // revisit). Consumed (cleared) when the PO accepts via the test-doc save;
  // NEVER read by the BRDG-461 bundle — only accepted docs are deliverable.
  testDocDraft: text("test_doc_draft"),
  testDocDraftClassification: text("test_doc_draft_classification"),
  testDocDraftGeneratedAt: text("test_doc_draft_generated_at"),
});

// Backlog Deprecation Review (BRDG-284): persisted Tier-2 deep-dive queue.
// Survives restarts so the background runner can resume mid-batch. WHY a real
// table (not the in-memory revalidation queue): the deep dive is expensive and
// selective, so its backlog must be durable and observable across process
// restarts and deploys. Status lifecycle: pending -> running -> done | error.
export const deprecationScanQueue = sqliteTable("deprecation_scan_queue", {
  id: text("id").primaryKey(),
  jiraKey: text("jira_key").notNull(),
  // pending | running | done | error.
  status: text("status", {
    enum: ["pending", "running", "done", "error"],
  }).notNull().default("pending"),
  // How the row was enqueued: a selection method or "manual" hand-pick. Purely
  // informational for the activity log / future auto-mode (BRDG-290).
  source: text("source").notNull().default("manual"),
  enqueuedAt: text("enqueued_at").notNull().default(sql`(datetime('now'))`),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  error: text("error"),
  // Mirrors jiraKey while the row is active (pending/running) and is NULL once
  // the row reaches done/error. A unique index over this nullable column is how
  // SQLite gives us "at most one active row per ticket" while still allowing
  // historical completed rows to accumulate (NULLs are not deduplicated).
  activeKey: text("active_key"),
}, (table) => [
  index("deprecation_scan_queue_status_idx").on(table.status),
  // Enforces idempotent enqueue: at most one ACTIVE (pending/running) row per
  // ticket. Completed rows (done/error) get NULL here so re-queuing later is
  // allowed once a deep scan has finished. The active flag is set to the
  // jiraKey while active and cleared to NULL on completion.
  uniqueIndex("deprecation_scan_queue_active_idx").on(table.activeKey),
]);

export type DeprecationScanQueueRow = typeof deprecationScanQueue.$inferSelect;
export type NewDeprecationScanQueueRow = typeof deprecationScanQueue.$inferInsert;

// Editable list of deprecated/retired product or tech areas (BRDG-285). The
// "replaced area" deep-scan topic matches ticket text against these terms, so
// the PO must be able to grow the list over time without a deploy. Local-only,
// never synced to Jira. `aliases` is a comma-separated list of alternate
// spellings/acronyms; `note` is an optional reminder of why the area is retired.
export const deprecatedAreaKeyword = sqliteTable("deprecated_area_keyword", {
  id: text("id").primaryKey(),
  term: text("term").notNull(),
  aliases: text("aliases").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("deprecated_area_keyword_term_idx").on(table.term),
]);

export type DeprecatedAreaKeyword = typeof deprecatedAreaKeyword.$inferSelect;
export type NewDeprecatedAreaKeyword = typeof deprecatedAreaKeyword.$inferInsert;

// Bridge-owned per-epic metadata, keyed by epicKey. Shared store for PO
// metadata that Jira does not hold (team assignment now; epic color later).
// No FK to ticket.jiraKey: an epic may not have a synced epic row yet, and the
// PO can assign teams before the epic syncs.
export const epicMetadata = sqliteTable("epic_metadata", {
  epicKey: text("epic_key").primaryKey(),
  // JSON array of team codes (BT/BM/BO/GXP/HT).
  teams: text("teams").notNull().default("[]"),
  // PO-assigned base color (hex from the curated palette). null = use the
  // deterministic default derived from the epic name/key.
  color: text("color"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type EpicMetadataRow = typeof epicMetadata.$inferSelect;
export type NewEpicMetadataRow = typeof epicMetadata.$inferInsert;

export const workspaceTask = sqliteTable("workspace_task", {
  id: text("id").primaryKey(),
  skillName: text("skill_name").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "cancelled"],
  }).notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  relatedTicket: text("related_ticket"),
  conversationId: text("conversation_id"),
  output: text("output"),
  error: text("error"),
}, (table) => [
  index("workspace_task_status_idx").on(table.status),
  index("workspace_task_conversation_id_idx").on(table.conversationId),
]);

export const scheduledJob = sqliteTable("scheduled_job", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cronExpression: text("cron_expression").notNull(),
  skillName: text("skill_name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastResultSummary: text("last_result_summary"),
});

export const sprintSlot = sqliteTable("sprint_slot", {
  slotIndex: integer("slot_index").primaryKey(),
  sprintId: text("sprint_id").notNull(),
  sprintName: text("sprint_name").notNull(),
});

export const sprintNameCache = sqliteTable("sprint_name_cache", {
  sprintId: text("sprint_id").primaryKey(),
  displayName: text("display_name").notNull(),
});

// Negative cache of sprint ids Jira reported as 404 ("deleted", BRDG-351). Without
// this, a sprint id still carried on an (orphaned, closed) ticket is re-fetched on
// every read-path backfill pass, 404ing forever and burning Jira API budget. A row
// here suppresses re-fetch for MISSING_SPRINT_TTL_MS; the timestamp gives a path back
// (expiry re-probes), so it is a suppression window, not a permanent blacklist.
// String-keyed to match sprintNameCache/ticketSprint and the ids flowing through
// ensureSprintsCached. Strictly local; never reflects a Jira write.
export const missingSprint = sqliteTable("missing_sprint", {
  sprintId: text("sprint_id").primaryKey(),
  missingAt: text("missing_at").notNull().default(sql`(datetime('now'))`),
});

export type MissingSprintRow = typeof missingSprint.$inferSelect;
export type NewMissingSprintRow = typeof missingSprint.$inferInsert;

// Forward-planning pencil capacity (BRDG-303): a PO's rough story-point capacity
// guess per sprint, the denominator for the fullness meter. Bridge-local, never
// synced to Jira. Keyed by Jira sprint id (string), matching the sprintSlot
// convention; a missing row means "no capacity set" (meter shows used-only).
export const sprintPencilCapacity = sqliteTable("sprint_pencil_capacity", {
  sprintId: text("sprint_id").primaryKey(),
  capacity: real("capacity").notNull(),
});

export type SprintPencilCapacityRow = typeof sprintPencilCapacity.$inferSelect;
export type NewSprintPencilCapacityRow = typeof sprintPencilCapacity.$inferInsert;

// Forward-planning placeholder tickets (BRDG-304): a lightweight, Bridge-local
// stand-in the PO drops into a future sprint/epic to mark "more work is coming"
// before any real Jira issue exists. Never synced to Jira; it has no real story
// points by definition, so its estimate is the BRDG-303 guestimation. Promotion
// (status -> "promoted", promotedToKey set) creates the real Jira issue and the
// row thereafter renders as that ticket. No FK to ticket.jiraKey: the target
// sprint/epic may not be synced, and the promoted ticket is referenced by its
// key only (same rationale as epicMetadata).
export const placeholderTicket = sqliteTable("placeholder_ticket", {
  // "PLH-<uuid>" generated in the create route so the id never collides with a Jira key.
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Lower-case issue type, matching the ticket.type convention.
  type: text("type").notNull().default("story"),
  // Sprint placement mirrors ticket.sprintName: stores the Jira sprint id (string),
  // so the grouped views reuse the same membership/grouping logic. Null = unscheduled.
  sprintId: text("sprint_id"),
  // Snapshot of the sprint's display name at create/edit time (optional, for labels).
  sprintName: text("sprint_name"),
  epicKey: text("epic_key"),
  // Snapshot of the epic title so the row can chip it without a join.
  epic: text("epic"),
  // 0-7, same scale as ticketMetadata.businessValue.
  businessValue: integer("business_value"),
  // 0,1,2,3,5,8 - the BRDG-303 Fibonacci guestimation.
  guestimation: integer("guestimation"),
  status: text("status", { enum: ["active", "promoted"] }).notNull().default("active"),
  // The Jira key created on promotion; null while active.
  promotedToKey: text("promoted_to_key"),
  // Manual ordering within a sprint group (BRDG-328). Placeholders have no Jira
  // rank, so they render as their own ordered block (below the real, rank-ordered
  // rows) and are reordered/moved by drag in the epic view.
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("placeholder_ticket_sprint_id_idx").on(table.sprintId),
  index("placeholder_ticket_epic_key_idx").on(table.epicKey),
  index("placeholder_ticket_status_idx").on(table.status),
]);

export type PlaceholderTicketRow = typeof placeholderTicket.$inferSelect;
export type NewPlaceholderTicketRow = typeof placeholderTicket.$inferInsert;

export const appSetting = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Per-account settings/preferences (BRDG-343). Same key-value shape as appSetting
// but scoped to the authenticated Clerk user so saved views, filters, and other
// per-account state follow the person across browsers/ports/devices instead of
// living in browser localStorage. The reserved userId "global" holds settings
// written without a resolvable session (dev bypass, unit tests), mirroring the
// rate-limiter's fallback segment.
export const userSetting = sqliteTable("user_setting", {
  userId: text("user_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
]);

// Per-user read state for the New story inbox (BRDG-359). Re-scopes the read
// flag that BRDG-356 stored globally on ticketMetadata.newStoryReadAt: marking a
// story read now records a row keyed on the acting Clerk user, so a different
// user still sees it as unread. A dedicated table (not a JSON blob in
// userSetting) because a user may accumulate thousands of read entries and the
// inbox list/count filters against them on every load. No FK on ticketKey: the
// mark-read path validates keys against `ticket` before writing, and the lazy
// legacy backfill copies in rows without ordering against ticket lifecycle.
export const newStoryRead = sqliteTable("new_story_read", {
  userId: text("user_id").notNull(),
  ticketKey: text("ticket_key").notNull(),
  readAt: text("read_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.userId, table.ticketKey] }),
]);

export const storyVersion = sqliteTable("story_version", {
  id: text("id").primaryKey(),
  jiraKey: text("jira_key")
    .notNull()
    .references(() => ticket.jiraKey),
  description: text("description").notNull(),
  acceptanceCriteria: text("acceptance_criteria"),
  contentHash: text("content_hash").notNull(),
  tag: text("tag"),
  updatedBy: text("updated_by"),
  updatedByAvatar: text("updated_by_avatar"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("story_version_jira_key_created_at_idx").on(table.jiraKey, table.createdAt),
]);

export const alert = sqliteTable("alert", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  jiraKey: text("jira_key"),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  // When the underlying event actually occurred (e.g. PR merge time from Bitbucket).
  // May differ from createdAt when Bridge syncs an event that happened earlier.
  eventAt: text("event_at"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  category: text("category", {
    enum: ["general", "pipeline", "deployment", "pr", "sync", "story-writer", "system", "agent", "scheduler"],
  }),
  linkUrl: text("link_url"),
}, (table) => [
  index("alert_read_idx").on(table.read),
  index("alert_created_at_idx").on(table.createdAt),
  index("alert_jira_key_idx").on(table.jiraKey),
]);

export const stakeholderAnalysis = sqliteTable("stakeholder_analysis", {
  id: text("id").primaryKey(),
  sprintId: integer("sprint_id").notNull(),
  sprintName: text("sprint_name").notNull(),
  type: text("type", { enum: ["brief", "deep-dive"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  content: text("content"),
  narrative: text("narrative"),
  risks: text("risks"),
  workspaceTaskId: text("workspace_task_id"),
  conversationId: text("conversation_id"),
  snapshotDonePoints: integer("snapshot_done_points").notNull().default(0),
  snapshotTodoCount: integer("snapshot_todo_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
}, (table) => [
  index("stakeholder_analysis_sprint_id_idx").on(table.sprintId),
  index("stakeholder_analysis_sprint_type_idx").on(table.sprintId, table.type),
]);

export type StakeholderAnalysisRow = typeof stakeholderAnalysis.$inferSelect;
export type NewStakeholderAnalysisRow = typeof stakeholderAnalysis.$inferInsert;

// Phase 3: Comments
export const poComment = sqliteTable("po_comment", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  author: text("author").notNull().default("Product Owner"),
  content: text("content").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("po_comment_ticket_key_idx").on(table.ticketKey),
]);

export const jiraComment = sqliteTable("jira_comment", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  jiraCommentId: text("jira_comment_id"),
  authorName: text("author_name").notNull(),
  authorAvatar: text("author_avatar"),
  content: text("content").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("jira_comment_ticket_key_idx").on(table.ticketKey),
  // jiraCommentId is upserted/filtered on; unique guards against a race
  // double-inserting a comment. Nullable, so local-flag comments (null id)
  // are unaffected (SQLite allows multiple NULLs under a unique index).
  uniqueIndex("jira_comment_jira_comment_id_idx").on(table.jiraCommentId),
]);

// Phase 4: Local edits
export const ticketLocalEdit = sqliteTable("ticket_local_edit", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  field: text("field", { enum: ["title", "description"] }).notNull(),
  localValue: text("local_value").notNull(),
  baseJiraVersion: text("base_jira_version"),
  isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
  modifiedAt: text("modified_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("ticket_local_edit_ticket_key_idx").on(table.ticketKey),
]);

// Subtasks: child issues of a ticket (synced inline during ticket sync)
export const ticketSubtask = sqliteTable("ticket_subtask", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  subtaskKey: text("subtask_key").notNull(),
  title: text("title").notNull(),
  type: text("type"),
  status: text("status").notNull(),
  assignee: text("assignee"),
  assigneeAvatar: text("assignee_avatar"),
}, (table) => [
  index("ticket_subtask_ticket_key_idx").on(table.ticketKey),
]);

// Issue links: blocks / is blocked by / relates to, etc.
export const ticketLink = sqliteTable("ticket_link", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  jiraLinkId: text("jira_link_id"),
  relation: text("relation").notNull(),
  linkedKey: text("linked_key").notNull(),
  title: text("title").notNull(),
  type: text("type"),
  status: text("status").notNull(),
  assignee: text("assignee"),
  assigneeAvatar: text("assignee_avatar"),
}, (table) => [
  index("ticket_link_ticket_key_idx").on(table.ticketKey),
]);

// Phase 5: Attachment management
export const ticketAttachment = sqliteTable("ticket_attachment", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  jiraAttachmentId: text("jira_attachment_id"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  jiraUrl: text("jira_url"),
  downloadedAt: text("downloaded_at"),
  localPath: text("local_path"),
  cleanedAt: text("cleaned_at"),
}, (table) => [
  index("ticket_attachment_ticket_key_idx").on(table.ticketKey),
]);

export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: [
      "sprint-sync", "ticket-sync", "single-ticket", "comment-sync",
      "review", "metadata-update", "local-edit", "push-to-jira", "bulk-action",
      "story-writer", "incremental-sync", "epic-sync", "deprecation-scan",
    ],
  }).notNull(),
  scope: text("scope"),
  status: text("status", {
    enum: ["running", "success", "failed", "cancelled"],
  }).notNull(),
  summary: text("summary"),
  errorDetail: text("error_detail"),
  durationMs: integer("duration_ms"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("activity_log_started_at_idx").on(table.startedAt),
  index("activity_log_type_idx").on(table.type),
]);

// Review persistence: stores full review results linked to story versions
export const storedReview = sqliteTable("stored_review", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  source: text("source", {
    enum: ["ticket-detail", "chat", "bulk-action"],
  }).notNull(),
  storyVersionHash: text("story_version_hash").notNull(),
  storyVersionNumber: integer("story_version_number").notNull(),
  overallScore: real("overall_score").notNull(),
  dimensions: text("dimensions").notNull(),
  summary: text("summary").notNull(),
  suggestions: text("suggestions").notNull(),
}, (table) => [
  index("stored_review_ticket_key_created_at_idx").on(table.ticketKey, table.createdAt),
]);

// Pipeline runs: persisted Bitbucket pipeline data for historical tracking and notifications
export const pipelineRun = sqliteTable("pipeline_run", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  buildNumber: integer("build_number").notNull(),
  branchName: text("branch_name").notNull(),
  ticketKey: text("ticket_key"),
  state: text("state", {
    enum: ["SUCCESSFUL", "FAILED", "IN_PROGRESS", "STOPPED", "PAUSED"],
  }).notNull(),
  creator: text("creator"),
  durationSeconds: integer("duration_seconds"),
  pipelineUrl: text("pipeline_url").notNull(),
  // Deployment-specific fields
  isDeployment: integer("is_deployment", { mode: "boolean" }).notNull().default(false),
  environment: text("environment"),
  environmentType: text("environment_type", {
    enum: ["Production", "Staging", "Test"],
  }),
  // Timestamp the deploy-detection backfill last scanned this run's steps. A completed
  // pipeline's steps are immutable, so a non-deployment run is stamped once and excluded
  // from future scans; left null on transient fetch errors so it is retried (BRDG-255).
  deployCheckedAt: text("deploy_checked_at"),
  // How the deployment was detected: "step" (a deploy step in the pipeline) or "branch"
  // (inferred from a staging/uat-N branch with no deploy step). Null for legacy/non-deploys.
  // Used to audit branch-inferred deployments during validation (BRDG-257).
  deploymentSource: text("deployment_source", { enum: ["step", "branch"] }),
  // Target commit of the pipeline build. Anchors the commit-range walk used to attribute a
  // staging/uat-N deploy to every ticket merged in since the previous deploy (BRDG-269).
  commitHash: text("commit_hash"),
  // Timestamp the range-attribution pass last walked this deploy's commit range. Mirrors the
  // deploy_checked_at marker: set once for forward progress, left null so it can be retried.
  rangeAttributedAt: text("range_attributed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  // Used for state change detection (notification triggers)
  previousState: text("previous_state"),
  // Enrichment: commit & PR context (Phase 1+2, BRDG-080)
  commitMessage: text("commit_message"),
  ticketKeys: text("ticket_keys"), // JSON array when multiple tickets
  sourceBranch: text("source_branch"), // original branch for merge-triggered pipelines
  prUrl: text("pr_url"),
  prTitle: text("pr_title"),
  prAuthor: text("pr_author"),
}, (table) => [
  index("pipeline_run_repo_idx").on(table.repo),
  index("pipeline_run_ticket_key_idx").on(table.ticketKey),
  index("pipeline_run_state_idx").on(table.state),
  index("pipeline_run_created_at_idx").on(table.createdAt),
  index("pipeline_run_deployment_idx").on(table.isDeployment, table.environment),
]);

// Followed tickets: user preference for which tickets to receive notifications about
export const followedTicket = sqliteTable("followed_ticket", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("followed_ticket_key_unique_idx").on(table.ticketKey),
]);

// Followed sprints: user preference for which sprints to receive UAT deploy notifications about
export const followedSprint = sqliteTable("followed_sprint", {
  sprintName: text("sprint_name").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type PipelineRunRow = typeof pipelineRun.$inferSelect;
export type NewPipelineRunRow = typeof pipelineRun.$inferInsert;
export type FollowedTicketRow = typeof followedTicket.$inferSelect;
export type FollowedSprintRow = typeof followedSprint.$inferSelect;
export type Alert = typeof alert.$inferSelect;

export type Conversation = typeof conversation.$inferSelect;
export type NewConversation = typeof conversation.$inferInsert;
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type ScheduledJob = typeof scheduledJob.$inferSelect;
export type NewScheduledJob = typeof scheduledJob.$inferInsert;
export type SprintSlot = typeof sprintSlot.$inferSelect;
export type NewSprintSlot = typeof sprintSlot.$inferInsert;
export type AppSetting = typeof appSetting.$inferSelect;
export type StoryVersion = typeof storyVersion.$inferSelect;
export type TicketMetadata = typeof ticketMetadata.$inferSelect;
export type PoComment = typeof poComment.$inferSelect;
export type JiraComment = typeof jiraComment.$inferSelect;
export type TicketLocalEdit = typeof ticketLocalEdit.$inferSelect;
export type TicketSubtask = typeof ticketSubtask.$inferSelect;
export type TicketLink = typeof ticketLink.$inferSelect;
export type TicketAttachment = typeof ticketAttachment.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type Ticket = typeof ticket.$inferSelect;
export type NewTicket = typeof ticket.$inferInsert;
export type TicketSprintRow = typeof ticketSprint.$inferSelect;
export type NewTicketSprintRow = typeof ticketSprint.$inferInsert;
export type StoredReviewRow = typeof storedReview.$inferSelect;
export type NewStoredReviewRow = typeof storedReview.$inferInsert;

// Story Writer sessions: links a ticket to a conversation for AI-assisted story editing
export const storyWriterSession = sqliteTable("story_writer_session", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id),
  status: text("status", {
    enum: ["active", "completed", "discarded"],
  }).notNull().default("active"),
  // Distinguishes the single-story flow ("story") from the Epic Writer flow ("epic").
  // NOT NULL + default keeps every existing row and the story-path INSERT valid.
  mode: text("mode", {
    enum: ["story", "epic"],
  }).notNull().default("story"),
  // Epic Writer phase bookmark. Free movement in 292; does not gate behavior.
  // Irrelevant for story-mode sessions, which stay on the default.
  phase: text("phase", {
    enum: ["feed", "discovery", "breakdown", "refine", "sprints"],
  }).notNull().default("feed"),
  localDraft: text("local_draft"),
  localTitle: text("local_title"),
  baseVersionHash: text("base_version_hash"),
  targetTicketKey: text("target_ticket_key"),
  targetLocalDraft: text("target_local_draft"),
  targetLocalTitle: text("target_local_title"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("story_writer_session_ticket_key_idx").on(table.ticketKey),
  index("story_writer_session_status_idx").on(table.status),
]);

// AI draft suggestions from the workspace, linked to a session and optionally to a chat message
export const storyWriterDraft = sqliteTable("story_writer_draft", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => storyWriterSession.id, { onDelete: "cascade" }),
  draftIndex: integer("draft_index").notNull(),
  content: text("content").notNull(),
  messageId: text("message_id")
    .references(() => message.id, { onDelete: "set null" }),
  storySlot: text("story_slot", { enum: ["original", "target"] })
    .notNull()
    .default("original"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("story_writer_draft_session_id_idx").on(table.sessionId),
]);

// Epic Writer child-story cards produced during breakdown/refine. These live as
// local DRAFTs in Bridge until the PO presses "Create in Jira" (a later story);
// nothing lands in Jira until then. The full set is re-parsed from the latest
// <epic-breakdown> block, so the card index is the AI's 0-based ordering.
export const epicChildDraft = sqliteTable("epic_child_draft", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => storyWriterSession.id, { onDelete: "cascade" }),
  cardIndex: integer("card_index").notNull(),
  title: text("title").notNull(),
  // JSON array of strings: the default detail level (title + bullets).
  bullets: text("bullets", { mode: "json" }).$type<string[]>().notNull().default([]),
  // Filled only in the detail phase (full description + AC); null at default depth.
  body: text("body"),
  status: text("status", { enum: ["draft", "created"] }).notNull().default("draft"),
  // Set once the card is promoted to a real Jira issue (a later story).
  jiraKey: text("jira_key"),
  // AI suggestion only; the live sprint lives on ticket.sprintName after creation.
  suggestedSprintId: text("suggested_sprint_id"),
  // JSON array of { targetIndex, relation, confirmed }: proposed inter-story links.
  suggestedLinks: text("suggested_links", { mode: "json" })
    .$type<{ targetIndex: number; relation: string; confirmed: boolean }[]>()
    .notNull()
    .default([]),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("epic_child_draft_session_id_idx").on(table.sessionId),
  uniqueIndex("epic_child_draft_session_card_idx").on(table.sessionId, table.cardIndex),
]);

// Full execution log for a story writer task: prompt, tool calls, responses
export const storyWriterExecutionLog = sqliteTable("story_writer_execution_log", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => storyWriterSession.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  ticketKey: text("ticket_key").notNull(),
  // JSON array of RawLogEntry from valk-remote-workspace
  log: text("log").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("story_writer_execution_log_session_id_idx").on(table.sessionId),
  index("story_writer_execution_log_task_id_idx").on(table.taskId),
]);

// Related story candidates found by the find-related skill for a story writer session
export const relatedStoryCandidate = sqliteTable("related_story_candidate", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => storyWriterSession.id, { onDelete: "cascade" }),
  ticketKey: text("ticket_key").notNull(),
  jiraKey: text("jira_key").notNull(),
  score: integer("score").notNull(),
  title: text("title").notNull(),
  issueType: text("issue_type"),
  status: text("status").notNull(),
  jiraUrl: text("jira_url"),
  updatedDate: text("updated_date"),
  matchReason: text("match_reason"),
  isLinked: integer("is_linked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("related_story_candidate_session_id_idx").on(table.sessionId),
  index("related_story_candidate_ticket_key_idx").on(table.ticketKey),
]);

// Confluence pages manually linked (or auto-detected) to a ticket
export const ticketConfluenceLink = sqliteTable("ticket_confluence_link", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey, { onDelete: "cascade" }),
  pageId: text("page_id").notNull(),
  pageTitle: text("page_title").notNull(),
  pageUrl: text("page_url").notNull(),
  source: text("source", { enum: ["manual", "auto-detected"] })
    .notNull()
    .default("manual"),
  lastModifiedAt: text("last_modified_at"),
  lastModifiedBy: text("last_modified_by"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("ticket_confluence_link_ticket_key_idx").on(table.ticketKey),
  index("ticket_confluence_link_page_id_idx").on(table.pageId),
]);

// Status transitions recorded during sync or backfilled from Jira changelog
export const ticketStatusChange = sqliteTable("ticket_status_change", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedAt: text("changed_at").notNull(),
  sprintName: text("sprint_name"),
  // BRDG-414: who made the change, from the Jira changelog author. accountId is
  // usually null (the changelog author shape carries only displayName + avatar).
  changedBy: text("changed_by"),
  changedByAccountId: text("changed_by_account_id"),
  changedByAvatar: text("changed_by_avatar"),
}, (table) => [
  index("ticket_status_change_ticket_key_idx").on(table.ticketKey),
  index("ticket_status_change_sprint_changed_idx").on(table.sprintName, table.changedAt),
]);

export type TicketStatusChange = typeof ticketStatusChange.$inferSelect;

// BRDG-414: per-user "seen" state for the status-change review queue, mirroring
// `newStoryRead`. Keyed on the individual status-change id (not ticketKey) so every
// transition is its own item: marking one seen never suppresses a LATER transition
// of the same ticket (Test -> In Progress -> Test re-surfaces each time). No FK on
// statusChangeId (consistent with newStoryRead): the queue only lists ids that exist.
export const statusChangeSeen = sqliteTable("status_change_seen", {
  userId: text("user_id").notNull(),
  statusChangeId: text("status_change_id").notNull(),
  seenAt: text("seen_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.userId, table.statusChangeId] }),
]);

export type StatusChangeSeen = typeof statusChangeSeen.$inferSelect;

// Scope changes: when tickets join or leave a sprint (for burnup scope line)
export const ticketScopeChange = sqliteTable("ticket_scope_change", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key").notNull(),
  sprintName: text("sprint_name").notNull(),
  action: text("action", { enum: ["added", "removed"] }).notNull(),
  storyPoints: real("story_points"),
  businessValue: integer("business_value"),
  changedAt: text("changed_at").notNull(),
  // BRDG-439: who moved the ticket into the sprint, from the Jira "Sprint" changelog
  // author (or the reporter for a ticket created straight into a sprint). The burnup
  // backfill leaves these null, so the board's "Added to sprint" line reads only rows
  // with a known actor and never surfaces synthetic/historical backfill events.
  changedBy: text("changed_by"),
  changedByAccountId: text("changed_by_account_id"),
  changedByAvatar: text("changed_by_avatar"),
}, (table) => [
  index("ticket_scope_change_sprint_idx").on(table.sprintName, table.changedAt),
  index("ticket_scope_change_ticket_action_idx").on(table.ticketKey, table.action),
]);

// Cached AI-suggested related issues for the ticket detail view (independent of story writer sessions)
export const relatedSuggestionCache = sqliteTable("related_suggestion_cache", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey, { onDelete: "cascade" }),
  suggestedKey: text("suggested_key").notNull(),
  score: real("score").notNull(),
  title: text("title").notNull(),
  issueType: text("issue_type"),
  status: text("status").notNull(),
  jiraUrl: text("jira_url"),
  reason: text("reason"),
  suggestedRelation: text("suggested_relation").notNull().default("relates to"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("related_suggestion_cache_ticket_key_idx").on(table.ticketKey),
]);

export type RelatedSuggestionCacheRow = typeof relatedSuggestionCache.$inferSelect;

export type TicketConfluenceLink = typeof ticketConfluenceLink.$inferSelect;
export type NewTicketConfluenceLink = typeof ticketConfluenceLink.$inferInsert;

export type WorkspaceTask = typeof workspaceTask.$inferSelect;
export type NewWorkspaceTask = typeof workspaceTask.$inferInsert;

export type StoryWriterSessionRow = typeof storyWriterSession.$inferSelect;
export type NewStoryWriterSessionRow = typeof storyWriterSession.$inferInsert;
export type StoryWriterDraftRow = typeof storyWriterDraft.$inferSelect;
export type EpicChildDraftRow = typeof epicChildDraft.$inferSelect;
export type NewEpicChildDraftRow = typeof epicChildDraft.$inferInsert;
export type StoryWriterExecutionLogRow = typeof storyWriterExecutionLog.$inferSelect;
export type RelatedStoryCandidateRow = typeof relatedStoryCandidate.$inferSelect;

// Saved refinement sessions: persisted ticket queues for refinement ceremonies
export const refinementSession = sqliteTable("refinement_session", {
  id: text("id").primaryKey(),
  name: text("name"),
  ticketKeys: text("ticket_keys").notNull().default("[]"),
  status: text("status", { enum: ["draft", "in_progress", "completed"] }).notNull().default("draft"),
  generalComment: text("general_comment"),
  // Date-only (YYYY-MM-DD); nullable so unscheduled sessions keep working
  scheduledFor: text("scheduled_for"),
  currentIndex: integer("current_index").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("refinement_session_status_idx").on(table.status),
  index("refinement_session_created_at_idx").on(table.createdAt),
]);

export type RefinementSessionRow = typeof refinementSession.$inferSelect;
export type NewRefinementSessionRow = typeof refinementSession.$inferInsert;

// Per-ticket PO messages within a refinement session
export const refinementSessionTicketNote = sqliteTable("refinement_session_ticket_note", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => refinementSession.id, { onDelete: "cascade" }),
  ticketKey: text("ticket_key").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("rstn_session_id_idx").on(table.sessionId),
  uniqueIndex("rstn_session_ticket_unique").on(table.sessionId, table.ticketKey),
]);

export type RefinementSessionTicketNoteRow = typeof refinementSessionTicketNote.$inferSelect;
export type NewRefinementSessionTicketNoteRow = typeof refinementSessionTicketNote.$inferInsert;

// AI-suggested subtasks: persisted so they survive navigation/refresh
export const subtaskSuggestion = sqliteTable("subtask_suggestion", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => ticket.jiraKey, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("subtask_suggestion_ticket_key_idx").on(table.ticketKey),
]);

export type SubtaskSuggestionRow = typeof subtaskSuggestion.$inferSelect;
export type NewSubtaskSuggestionRow = typeof subtaskSuggestion.$inferInsert;

// Favorite users: pinned users that appear at the top of assignee pickers
export const favoriteUser = sqliteTable("favorite_user", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Stable Jira accountId (BRDG-364): the match key, so a favourite survives a
  // Jira rename. Nullable — display name stays the fallback for people without
  // a captured accountId.
  accountId: text("account_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("favorite_user_display_name_idx").on(table.displayName),
]);

// PO users (BRDG-372): people flagged as Product Owners. Used by the inbox's
// "Relevance" grouping to sink stories created by another PO to the bottom.
// Independent of favoriteUser; mirrors its accountId-first match (BRDG-364).
export const poUser = sqliteTable("po_user", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Stable Jira accountId (BRDG-364): the match key, so the flag survives a
  // Jira rename. Nullable — display name stays the fallback.
  accountId: text("account_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("po_user_display_name_idx").on(table.displayName),
]);

// User-team assignments: maps users to fixed teams (BT, BM, BO, GXP, HT)
export const userTeamAssignment = sqliteTable("user_team_assignment", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Stable Jira accountId (BRDG-364): the match key, so a team mapping survives a
  // Jira rename. Nullable — display name stays the fallback.
  accountId: text("account_id"),
  team: text("team").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("user_team_assignment_unique_idx").on(table.displayName, table.team),
  index("user_team_assignment_team_idx").on(table.team),
]);

export type FavoriteUserRow = typeof favoriteUser.$inferSelect;
export type PoUserRow = typeof poUser.$inferSelect;
export type UserTeamAssignmentRow = typeof userTeamAssignment.$inferSelect;
export type NewStoryReadRow = typeof newStoryRead.$inferSelect;
