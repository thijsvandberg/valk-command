CREATE TABLE `deprecation_scan_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`jira_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`enqueued_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`finished_at` text,
	`error` text,
	`active_key` text
);
--> statement-breakpoint
CREATE INDEX `deprecation_scan_queue_status_idx` ON `deprecation_scan_queue` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `deprecation_scan_queue_active_idx` ON `deprecation_scan_queue` (`active_key`);