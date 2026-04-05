CREATE TABLE `story_writer_execution_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL REFERENCES `story_writer_session`(`id`) ON DELETE CASCADE,
	`task_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`ticket_key` text NOT NULL,
	`log` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `story_writer_execution_log_session_id_idx` ON `story_writer_execution_log`(`session_id`);
--> statement-breakpoint
CREATE INDEX `story_writer_execution_log_task_id_idx` ON `story_writer_execution_log`(`task_id`);
