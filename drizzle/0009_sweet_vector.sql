CREATE TABLE `stored_review` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`source` text NOT NULL,
	`story_version_hash` text NOT NULL,
	`story_version_number` integer NOT NULL,
	`overall_score` real NOT NULL,
	`dimensions` text NOT NULL,
	`summary` text NOT NULL,
	`suggestions` text NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stored_review_ticket_key_idx` ON `stored_review` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `stored_review_created_at_idx` ON `stored_review` (`created_at`);