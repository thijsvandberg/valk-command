CREATE TABLE `favorite_user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_user_display_name_idx` ON `favorite_user` (`display_name`);--> statement-breakpoint
CREATE TABLE `user_team_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`team` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_team_assignment_unique_idx` ON `user_team_assignment` (`display_name`,`team`);--> statement-breakpoint
CREATE INDEX `user_team_assignment_team_idx` ON `user_team_assignment` (`team`);