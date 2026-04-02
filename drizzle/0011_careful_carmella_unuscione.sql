CREATE TABLE `story_writer_session` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`remote_draft` text,
	`local_draft` text,
	`local_draft_dirty` integer DEFAULT false NOT NULL,
	`base_version_hash` text,
	`last_remote_draft_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `story_writer_session_ticket_key_idx` ON `story_writer_session` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `story_writer_session_status_idx` ON `story_writer_session` (`status`);