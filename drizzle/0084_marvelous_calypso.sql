CREATE TABLE `new_story_read` (
	`user_id` text NOT NULL,
	`ticket_key` text NOT NULL,
	`read_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `ticket_key`)
);
