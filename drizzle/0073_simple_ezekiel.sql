CREATE TABLE `sprint_pencil_capacity` (
	`sprint_id` text PRIMARY KEY NOT NULL,
	`capacity` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `guestimation` integer;