CREATE TABLE `status_change_seen` (
	`user_id` text NOT NULL,
	`status_change_id` text NOT NULL,
	`seen_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `status_change_id`)
);
--> statement-breakpoint
ALTER TABLE `ticket_status_change` ADD `changed_by` text;--> statement-breakpoint
ALTER TABLE `ticket_status_change` ADD `changed_by_account_id` text;--> statement-breakpoint
ALTER TABLE `ticket_status_change` ADD `changed_by_avatar` text;