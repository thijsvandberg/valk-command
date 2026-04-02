CREATE TABLE `story_writer_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`draft_index` integer NOT NULL,
	`content` text NOT NULL,
	`message_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `story_writer_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `story_writer_draft_session_id_idx` ON `story_writer_draft` (`session_id`);--> statement-breakpoint
-- SQLite-safe column removal: recreate table without dropped columns
CREATE TABLE `story_writer_session_new` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`local_draft` text,
	`base_version_hash` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `story_writer_session_new` (`id`, `ticket_key`, `conversation_id`, `status`, `local_draft`, `base_version_hash`, `created_at`, `updated_at`)
  SELECT `id`, `ticket_key`, `conversation_id`, `status`, `local_draft`, `base_version_hash`, `created_at`, `updated_at`
  FROM `story_writer_session`;
--> statement-breakpoint
DROP TABLE `story_writer_session`;
--> statement-breakpoint
ALTER TABLE `story_writer_session_new` RENAME TO `story_writer_session`;
--> statement-breakpoint
CREATE INDEX `story_writer_session_ticket_key_idx` ON `story_writer_session` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `story_writer_session_status_idx` ON `story_writer_session` (`status`);
