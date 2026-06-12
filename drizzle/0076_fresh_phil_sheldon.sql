PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_refinement_session` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`ticket_keys` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`general_comment` text,
	`scheduled_for` text,
	`current_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_refinement_session`("id", "name", "ticket_keys", "status", "general_comment", "scheduled_for", "current_index", "created_at", "updated_at") SELECT "id", "name", "ticket_keys", "status", "general_comment", NULL, "current_index", "created_at", "updated_at" FROM `refinement_session`;--> statement-breakpoint
DROP TABLE `refinement_session`;--> statement-breakpoint
ALTER TABLE `__new_refinement_session` RENAME TO `refinement_session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `refinement_session_status_idx` ON `refinement_session` (`status`);--> statement-breakpoint
CREATE INDEX `refinement_session_created_at_idx` ON `refinement_session` (`created_at`);