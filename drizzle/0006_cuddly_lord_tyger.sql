CREATE INDEX `conversation_created_at_idx` ON `conversation` (`created_at`);--> statement-breakpoint
CREATE INDEX `jira_comment_ticket_key_idx` ON `jira_comment` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `message_conversation_id_idx` ON `message` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `po_comment_ticket_key_idx` ON `po_comment` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `story_version_jira_key_idx` ON `story_version` (`jira_key`);--> statement-breakpoint
CREATE INDEX `sync_log_started_at_idx` ON `sync_log` (`started_at`);--> statement-breakpoint
CREATE INDEX `ticket_attachment_ticket_key_idx` ON `ticket_attachment` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `ticket_local_edit_ticket_key_idx` ON `ticket_local_edit` (`ticket_key`);