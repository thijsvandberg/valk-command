-- Add 'epic-sync' and 'deprecation-scan' to the activity_log type CHECK constraint.
-- 'epic-sync' was added to the Drizzle schema enum without a matching CHECK rebuild;
-- this migration brings the DB constraint back in line and adds the BRDG-282
-- 'deprecation-scan' type. SQLite cannot alter a CHECK in place, so the table is rebuilt.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `activity_log_new` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(type IN ('sprint-sync', 'ticket-sync', 'single-ticket', 'comment-sync', 'review', 'metadata-update', 'local-edit', 'push-to-jira', 'bulk-action', 'story-writer', 'incremental-sync', 'epic-sync', 'deprecation-scan')),
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
CREATE INDEX `activity_log_type_idx` ON `activity_log` (`type`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
