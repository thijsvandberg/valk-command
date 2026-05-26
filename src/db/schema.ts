import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  epic: text("epic"),
  epicKey: text("epic_key"),
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  reporter: text("reporter"),
  description: text("description"),
  acceptanceCriteria: text("acceptance_criteria"),
  storyPoints: real("story_points"),
  sprintName: text("sprint_name"),
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
  poPriority: integer("po_priority"),
  testStatus: text("test_status", {
    enum: ["untested", "pass", "fail"],
  }).notNull().default("untested"),
  lastTestRunAt: text("last_test_run_at"),
  lastTestReportUrl: text("last_test_report_url"),
  businessValue: integer("business_value"),
});

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

export const appSetting = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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
  index("story_version_jira_key_idx").on(table.jiraKey),
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
      "story-writer", "incremental-sync", "epic-sync",
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
  index("stored_review_ticket_key_idx").on(table.ticketKey),
  index("stored_review_created_at_idx").on(table.createdAt),
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
}, (table) => [
  index("ticket_status_change_ticket_key_idx").on(table.ticketKey),
  index("ticket_status_change_sprint_changed_idx").on(table.sprintName, table.changedAt),
]);

export type TicketStatusChange = typeof ticketStatusChange.$inferSelect;

// Scope changes: when tickets join or leave a sprint (for burnup scope line)
export const ticketScopeChange = sqliteTable("ticket_scope_change", {
  id: text("id").primaryKey(),
  ticketKey: text("ticket_key").notNull(),
  sprintName: text("sprint_name").notNull(),
  action: text("action", { enum: ["added", "removed"] }).notNull(),
  storyPoints: real("story_points"),
  businessValue: integer("business_value"),
  changedAt: text("changed_at").notNull(),
}, (table) => [
  index("ticket_scope_change_sprint_idx").on(table.sprintName, table.changedAt),
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
export type StoryWriterExecutionLogRow = typeof storyWriterExecutionLog.$inferSelect;
export type RelatedStoryCandidateRow = typeof relatedStoryCandidate.$inferSelect;

// Saved refinement sessions: persisted ticket queues for refinement ceremonies
export const refinementSession = sqliteTable("refinement_session", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ticketKeys: text("ticket_keys").notNull().default("[]"),
  status: text("status", { enum: ["draft", "in_progress", "completed"] }).notNull().default("draft"),
  generalComment: text("general_comment"),
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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("favorite_user_display_name_idx").on(table.displayName),
]);

// User-team assignments: maps users to fixed teams (BT, BM, BO, GXP, HT)
export const userTeamAssignment = sqliteTable("user_team_assignment", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  team: text("team").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("user_team_assignment_unique_idx").on(table.displayName, table.team),
  index("user_team_assignment_team_idx").on(table.team),
]);

export type FavoriteUserRow = typeof favoriteUser.$inferSelect;
export type UserTeamAssignmentRow = typeof userTeamAssignment.$inferSelect;
