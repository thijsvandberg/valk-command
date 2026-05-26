CREATE TABLE `subtask_suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtask_suggestion_ticket_key_idx` ON `subtask_suggestion` (`ticket_key`);