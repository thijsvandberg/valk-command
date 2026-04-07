CREATE TABLE `related_story_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_key` text NOT NULL,
	`score` integer NOT NULL,
	`title` text NOT NULL,
	`issue_type` text,
	`status` text NOT NULL,
	`jira_url` text,
	`updated_date` text,
	`match_reason` text,
	`is_linked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `story_writer_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `related_story_candidate_session_id_idx` ON `related_story_candidate` (`session_id`);
--> statement-breakpoint
CREATE INDEX `related_story_candidate_ticket_key_idx` ON `related_story_candidate` (`ticket_key`);
