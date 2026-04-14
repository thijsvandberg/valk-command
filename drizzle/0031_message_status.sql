ALTER TABLE `message` ADD `status` text DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `message` ADD `content_hash` text;