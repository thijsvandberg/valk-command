CREATE TABLE `followed_sprint` (
	`sprint_name` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
