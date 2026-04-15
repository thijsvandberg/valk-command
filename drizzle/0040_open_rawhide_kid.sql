CREATE TABLE `ticket_confluence_link` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`page_id` text NOT NULL,
	`page_title` text NOT NULL,
	`page_url` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`last_modified_at` text,
	`last_modified_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_confluence_link_ticket_key_idx` ON `ticket_confluence_link` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `ticket_confluence_link_page_id_idx` ON `ticket_confluence_link` (`page_id`);
