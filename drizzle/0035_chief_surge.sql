CREATE TABLE `sprint_name_cache` (
	`sprint_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `sprint_name_cache` (`sprint_id`, `display_name`)
SELECT `sprint_id`, `sprint_name` FROM `sprint_slot`;
