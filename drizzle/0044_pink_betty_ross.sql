CREATE TABLE `ticket_status_change` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_at` text NOT NULL,
	`sprint_name` text,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_status_change_ticket_key_idx` ON `ticket_status_change` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `ticket_status_change_sprint_changed_idx` ON `ticket_status_change` (`sprint_name`,`changed_at`);