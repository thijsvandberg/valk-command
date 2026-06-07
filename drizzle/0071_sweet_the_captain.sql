CREATE TABLE `epic_child_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`card_index` integer NOT NULL,
	`title` text NOT NULL,
	`bullets` text DEFAULT '[]' NOT NULL,
	`body` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`jira_key` text,
	`suggested_sprint_id` text,
	`suggested_links` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `story_writer_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `epic_child_draft_session_id_idx` ON `epic_child_draft` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `epic_child_draft_session_card_idx` ON `epic_child_draft` (`session_id`,`card_index`);