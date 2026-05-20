CREATE TABLE `related_suggestion_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`suggested_key` text NOT NULL,
	`score` real NOT NULL,
	`title` text NOT NULL,
	`issue_type` text,
	`status` text NOT NULL,
	`jira_url` text,
	`reason` text,
	`suggested_relation` text DEFAULT 'relates to' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `related_suggestion_cache_ticket_key_idx` ON `related_suggestion_cache` (`ticket_key`);