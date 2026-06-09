CREATE TABLE `placeholder_ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'story' NOT NULL,
	`sprint_id` text,
	`sprint_name` text,
	`epic_key` text,
	`epic` text,
	`business_value` integer,
	`guestimation` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`promoted_to_key` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `placeholder_ticket_sprint_id_idx` ON `placeholder_ticket` (`sprint_id`);--> statement-breakpoint
CREATE INDEX `placeholder_ticket_epic_key_idx` ON `placeholder_ticket` (`epic_key`);--> statement-breakpoint
CREATE INDEX `placeholder_ticket_status_idx` ON `placeholder_ticket` (`status`);