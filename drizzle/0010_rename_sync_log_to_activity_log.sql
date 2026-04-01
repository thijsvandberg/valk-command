-- Rename sync_log to activity_log and expand the type CHECK constraint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(type IN ('sprint-sync', 'ticket-sync', 'single-ticket', 'comment-sync', 'webhook', 'review', 'metadata-update', 'local-edit', 'push-to-jira', 'bulk-action')),
	`scope` text,
	`status` text NOT NULL CHECK(status IN ('running', 'success', 'failed', 'cancelled')),
	`summary` text,
	`error_detail` text,
	`duration_ms` integer,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`acknowledged` integer DEFAULT false NOT NULL
);--> statement-breakpoint
INSERT INTO `activity_log`("id", "type", "scope", "status", "summary", "error_detail", "duration_ms", "started_at", "completed_at", "acknowledged") SELECT "id", "type", "scope", "status", "summary", "error_detail", "duration_ms", "started_at", "completed_at", "acknowledged" FROM `sync_log`;--> statement-breakpoint
DROP TABLE `sync_log`;--> statement-breakpoint
CREATE INDEX `activity_log_started_at_idx` ON `activity_log` (`started_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
