CREATE TABLE `refinement_session` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticket_keys` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refinement_session_status_idx` ON `refinement_session` (`status`);--> statement-breakpoint
CREATE INDEX `refinement_session_created_at_idx` ON `refinement_session` (`created_at`);