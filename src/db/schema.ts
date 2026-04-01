import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const conversation = sqliteTable("conversation", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  relatedTicket: text("related_ticket"),
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
}, (table) => [
  index("message_conversation_id_idx").on(table.conversationId),
]);

export const ticket = sqliteTable("ticket", {
  jiraKey: text("jira_key").primaryKey(),
  title: text("title").notNull(),
  type: text("type"),
  status: text("status").notNull(),
  assignee: text("assignee"),
  assigneeAvatar: text("assignee_avatar"),
  epic: text("epic"),
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
  jiraUpdatedAt: text("jira_updated_at"),
  lastSyncedAt: text("last_synced_at"),
});

export const ticketMetadata = sqliteTable("ticket_metadata", {
  jiraKey: text("jira_key")
    .primaryKey()
    .references(() => ticket.jiraKey),
  poStatus: text("po_status"),
  refinementReadiness: text("refinement_readiness", {
    enum: ["not_ready", "in_progress", "ready"],
  }).notNull().default("not_ready"),
  qualityScore: real("quality_score"),
  // qualityStale removed in VC-017: staleness is now computed from local edits vs Jira mirror
  effortScores: text("effort_scores"),
  poNotes: text("po_notes"),
  poPriority: integer("po_priority"),
  testStatus: text("test_status", {
    enum: ["untested", "pass", "fail"],
  }).notNull().default("untested"),
  lastTestRunAt: text("last_test_run_at"),
  lastTestReportUrl: text("last_test_report_url"),
});

export const workspaceTask = sqliteTable("workspace_task", {
  id: text("id").primaryKey(),
  skillName: text("skill_name").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  }).notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  relatedTicket: text("related_ticket"),
  conversationId: text("conversation_id"),
});

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
  read: integer("read", { mode: "boolean" }).notNull().default(false),
});

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
  modifiedAt: text("modified_at")
    .notNull()
    .default(sql`(datetime('now'))`),
}, (table) => [
  index("ticket_local_edit_ticket_key_idx").on(table.ticketKey),
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
  downloadedAt: text("downloaded_at"),
  localPath: text("local_path"),
  cleanedAt: text("cleaned_at"),
}, (table) => [
  index("ticket_attachment_ticket_key_idx").on(table.ticketKey),
]);

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: ["sprint-sync", "ticket-sync", "single-ticket", "comment-sync", "webhook"],
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
  index("sync_log_started_at_idx").on(table.startedAt),
]);

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
export type TicketAttachment = typeof ticketAttachment.$inferSelect;
export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;
export type Ticket = typeof ticket.$inferSelect;
export type NewTicket = typeof ticket.$inferInsert;
