CREATE TABLE `epic_metadata` (
	`epic_key` text PRIMARY KEY NOT NULL,
	`teams` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
