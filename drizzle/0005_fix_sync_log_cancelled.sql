-- Rebuild sync_log with CHECK constraint that includes "cancelled" status
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(type IN ('sprint-sync', 'ticket-sync', 'single-ticket', 'comment-sync', 'webhook')),
	`scope` text,
	`status` text NOT NULL CHECK(status IN ('running', 'success', 'failed', 'cancelled')),
	`summary` text,
	`error_detail` text,
	`duration_ms` integer,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`acknowledged` integer DEFAULT false NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_sync_log`("id", "type", "scope", "status", "summary", "error_detail", "duration_ms", "started_at", "completed_at", "acknowledged") SELECT "id", "type", "scope", "status", "summary", "error_detail", "duration_ms", "started_at", "completed_at", "acknowledged" FROM `sync_log`;--> statement-breakpoint
DROP TABLE `sync_log`;--> statement-breakpoint
ALTER TABLE `__new_sync_log` RENAME TO `sync_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
