-- Add 'incremental-sync' to activity_log type CHECK constraint (SQLite requires table rebuild)
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `activity_log_new` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(type IN ('sprint-sync', 'ticket-sync', 'single-ticket', 'comment-sync', 'webhook', 'review', 'metadata-update', 'local-edit', 'push-to-jira', 'bulk-action', 'story-writer', 'incremental-sync')),
	`scope` text,
	`status` text NOT NULL CHECK(status IN ('running', 'success', 'failed', 'cancelled')),
	`summary` text,
	`error_detail` text,
	`duration_ms` integer,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`acknowledged` integer DEFAULT false NOT NULL
);--> statement-breakpoint
INSERT INTO `activity_log_new` SELECT * FROM `activity_log`;--> statement-breakpoint
DROP TABLE `activity_log`;--> statement-breakpoint
ALTER TABLE `activity_log_new` RENAME TO `activity_log`;--> statement-breakpoint
CREATE INDEX `activity_log_started_at_idx` ON `activity_log` (`started_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
