CREATE TABLE `missing_sprint` (
	`sprint_id` text PRIMARY KEY NOT NULL,
	`missing_at` text DEFAULT (datetime('now')) NOT NULL
);
