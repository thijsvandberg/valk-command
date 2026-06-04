ALTER TABLE `ticket_metadata` ADD `scan_scores` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `scan_overall` real;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `scan_rationale` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `last_scanned_at` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `last_deep_scanned_at` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `disposition` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `disposition_until` text;