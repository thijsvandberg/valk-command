CREATE TABLE `po_user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`account_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_user_display_name_idx` ON `po_user` (`display_name`);