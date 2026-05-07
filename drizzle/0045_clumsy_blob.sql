CREATE TABLE `ticket_scope_change` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`sprint_name` text NOT NULL,
	`action` text NOT NULL,
	`story_points` real,
	`business_value` integer,
	`changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ticket_scope_change_sprint_idx` ON `ticket_scope_change` (`sprint_name`,`changed_at`);